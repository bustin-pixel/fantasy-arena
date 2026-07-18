// ============================================================================
// useBattleEngine
// Bridges the framework-free engine to React WITHOUT putting the simulation in
// React state. The MatchController and the render loop live in refs; the only
// React state we expose is a lightweight "uiState" (phase + clock + counts)
// that updates a few times per second so HUD text stays current. The canvas is
// painted every animation frame directly from the snapshot — zero re-renders
// in the hot path.
//
// Two independent loops:
//   • Simulation: a fixed-timestep accumulator advancing at TICK_RATE (20/s).
//   • Render: requestAnimationFrame, painting the latest snapshot.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FormationMark,
  ItemLoadouts,
  MatchPhase,
  Rarity,
  StatusEffectType,
  Team,
  Vec2,
  WaveBanner,
} from "@/types";
import { MatchController, battleEnemyLedger } from "@/engine/MatchController";
import type { BoonOffer, BoonTally } from "@/engine/EndlessController";
import { OutroCinematic, type OutroDir } from "@/hooks/OutroCinematic";
import { renderBattle } from "@/engine/Renderer";
import type { ChestTier } from "@/meta/economy";
import { TREASURE_ROOM_TIERS, type EncounterKind } from "@/data/encounters";
import { SfxObserver } from "@/audio/sfx";
import { pickArenaTheme, type ArenaThemeId } from "@/assets/arenaThemes";
import { getDungeon } from "@/data/dungeons";
import type { TierId } from "@/data/tiers";
import { generateEnemyDeck } from "@/engine/AIDeck";
import { getUnitDef } from "@/data/units";
import { ABILITIES } from "@/data/abilities";
import { DEPLOY_TIME_SEC, TICK_MS, TICK_RATE, UNIT_RADIUS } from "@/utils/constants";
import { generateSeed } from "@/utils/rng";
import { getSettings } from "@/state/settings";
import { prefersReducedMotion } from "@/utils/motion";

/** Battle mode. Solo allows client-side fast-forward; PVP is server-paced at 1×
 *  (a real-time match can't let one client run the sim faster than the other).
 *  Depths is the PvE descent; Endless is the survival wave loop with between-wave
 *  boon picks — both field the whole warband and run a wave director. */
export type BattleMode = "solo" | "pvp" | "depths" | "endless";

export interface HandCard {
  index: number;
  defId: string;
  selected: boolean;
}

export interface BattleUiState {
  phase: MatchPhase;
  tick: number;
  clockSec: number;
  playerActive: number;
  enemyActive: number;
  playerNext: string | null;
  canDeploy: boolean;
  /** Remaining undeployed player cards, for the bottom tray. */
  hand: HandCard[];
  /** Seconds left on the pre-battle countdown, or null when not counting. */
  startCountdownSec: number | null;
  /** Seconds left to place units in deployment, or null when not applicable. */
  deploySecLeft: number | null;
  /** Descent march-in: whether the auto-line-up can be scrapped for manual
   *  placement (the "Regroup" affordance). False outside the depths march-in. */
  canRegroup: boolean;
  /** Boss-floor telegraph banner (rare catalyst / boss incoming), or null. */
  banner: WaveBanner | null;
  /** Endless: the current wave number, or null outside endless. */
  waveNumber: number | null;
  /** Endless: the live between-wave boon pick, or null when a wave is running. */
  intermission: { wave: number; offers: BoonOffer[] } | null;
  /** Endless: the boons picked so far this run (for the "your boons" strip). */
  boonsPicked: BoonTally[];
  /** Endless: Momentum stacks banked, or null when the boon isn't owned. */
  momentumStacks: number | null;
  /** Endless: Berserker's Rhythm's live attack-speed bonus, or null if unowned. */
  rhythmBonus: number | null;
}

/** Live snapshot of one combatant, for the in-battle stat tooltip. */
export interface InspectedUnit {
  uid: string;
  name: string;
  rarity: Rarity;
  role: string;
  team: Team;
  hp: number;
  maxHp: number;
  /** Unit level (stats below already include the level bake). */
  level: number;
  damage: number;
  attackSpeed: number;
  range: number;
  abilityName: string;
  /** Passive trait names (the unit's "second" mechanics). */
  traits: string[];
  effects: StatusEffectType[];
  /** Live field position (so the tooltip can sit by the unit). */
  pos: Vec2;
}

export interface UseBattleEngine {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ui: BattleUiState;
  deployAt: (pos: Vec2) => void;
  selectCard: (index: number) => void;
  speed: number;
  setSpeed: (s: number) => void;
  /** uid of the living unit nearest a field point (within tap radius), or null. */
  pickUnitAt: (pos: Vec2) => string | null;
  /** Live stats for a unit by uid, or null if it's gone/dead. */
  inspectUnit: (uid: string) => InspectedUnit | null;
  /** The enemy roster this match actually fielded, for the Compendium: every
   *  enemy defId that appeared (`seen`) and the subset that died (`slain`). */
  enemyLedger: () => { seen: string[]; slain: string[] };
  /** Endless: apply the boon at `offerIndex` from the current intermission. */
  pickBoon: (offerIndex: number) => void;
  /** Endless: retire at an intermission, banking the cleared waves' rewards. */
  retireEndless: () => void;
  /** Endless: waves fully cleared this run (0 outside endless). */
  wavesSurvived: () => number;
  /** Post-victory outro: materialize the reward chest up-field and gather the
   *  band in front of it (`onSettled` when they arrive). Precedes the campfire.
   *  `reviveFallen` (default true) picks the fallen back up to join the gather;
   *  the boss's Dungeon-Cleared chest passes false so they stay down (no fire). */
  startOutroChest: (
    tier: ChestTier,
    onSettled: () => void,
    reviveFallen?: boolean
  ) => void;
  /** Open chest `index` (0 = the single reward chest); `onReveal` fires at its
   *  reveal beat (lid fully open). A treasure room's hoard is stood up by the
   *  init effect above, not from the screen — see the StrictMode note there. */
  openOutroChestAt: (index: number, onReveal: () => void) => void;
  /** Current chest world points + open state, for tap hit-testing. */
  outroChestPoints: () => {
    index: number;
    point: { x: number; y: number };
    opened: boolean;
  }[];
  /** Post-victory outro: pick up the fallen and gather the whole warband
   *  around the campfire to heal (presentational only — match is resolved). */
  startOutroCamp: (onDone: () => void) => void;
  /** Post-victory outro: file the band off-screen in the chosen direction. */
  outroWalkOff: (dir: OutroDir, onDone: () => void) => void;
  /** Descent march-in: scrap the auto-line-up and drop back to manual placement
   *  (clears the fielded warband, returns the hand, re-arms the placement timer). */
  regroup: () => void;
  /** The player's deploy-time marks this floor, to carry to the next floor — or
   *  null if nothing's been fielded. Read at the continue-deeper hand-off. */
  playerFormation: () => FormationMark[] | null;
}

export function useBattleEngine(
  playerDeck: string[],
  mode: BattleMode = "solo",
  seedOverride?: number,
  /** Depths floor to descend to (ignored outside "depths" mode). */
  floor: number = 1,
  /** Which dungeon to descend (ignored outside "depths" mode). */
  dungeonId: string = "depths",
  /** Player unit levels by defId (missing = 1). Callers must pass a STABLE
   *  object (frozen at mount) — it's a match input, like the seed. */
  unitLevels?: Record<string, number>,
  /** Player equipped item keys by defId (missing = bare). Same contract as
   *  unitLevels: a STABLE object frozen at mount — a match input. */
  itemLoadouts?: ItemLoadouts,
  /** Depths encounter flavor for this floor (default "normal"). A match input
   *  like floor/dungeonId — changing it re-inits the match. */
  encounter: EncounterKind = "normal",
  /** Whether this floor is the boss lair (RNG "hunt for the boss" descent). A
   *  match input; omitted, the WaveController falls back to isBossFloorIn. */
  isBoss?: boolean,
  /** On the boss floor, skip the fusion-quest rare roll (the run already met its
   *  rare on a rare-quarry encounter). A match input. */
  suppressQuestRare?: boolean,
  /** Difficulty tier (Normal/Hard/Elite — shifts monster levels only). A match
   *  input, frozen like the seed. Ignored outside "depths" mode. */
  tier: TierId = "normal",
  /** The previous floor's deploy-time marks (depths descent, floors 2+). When
   *  present, the warband is fielded on these spots and a walk-in cinematic plays
   *  before the countdown. A STABLE object frozen at mount, like unitLevels.
   *  Null/absent = manual placement (floor 1, or non-descent modes). */
  formation: FormationMark[] | null = null,
  /** Compendium slayer bonuses: enemy defId → damage multiplier, precomputed
   *  from lifetime monsterKills (meta/slayer.buildSlayerBonusTable). A STABLE
   *  object frozen at mount, like unitLevels — kills made this match pay out
   *  from the next one. PvE only: applied in depths/endless, ignored in
   *  arena (slayer never touches the fair-fight mode). Missing/empty =
   *  identity. */
  slayerBonuses?: Record<string, number>
): UseBattleEngine {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<MatchController | null>(null);
  const rafRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  // Matches start at the player's preferred speed (PVP is server-paced, 1×).
  const initialSpeed = mode === "pvp" ? 1 : getSettings().defaultSpeed;
  const speedRef = useRef<number>(initialSpeed);
  // Backdrop for this match. Arena rotates through the fantasy themes (picked
  // from the seed, so replays match); Depths is always the torchlit dungeon;
  // PVP keeps the classic field.
  const themeRef = useRef<ArenaThemeId>("grassField");
  // Turns snapshot diffs into unit sound effects (presentation-only).
  const sfxRef = useRef<SfxObserver>(new SfxObserver());
  // Post-victory walk cinematic. Steps in the rAF loop; the sim tick is a
  // no-op once the match resolves, so the two never fight.
  const outroRef = useRef<OutroCinematic | null>(null);
  // Floor-ENTRY march-in cinematic (the descent auto-line-up). Kept separate
  // from outroRef so the victory outro and a next-floor walk-in never collide.
  const introRef = useRef<OutroCinematic | null>(null);
  // Boss-BRACE cinematic (survivors pull into a row when a boss telegraphs). Its
  // own ref — it fires mid-battle, unrelated to the deployment/victory beats.
  const braceRef = useRef<OutroCinematic | null>(null);

  const [ui, setUi] = useState<BattleUiState>(() => {
    // A march-in floor fields the warband at construction, so the reserve tray
    // must start EMPTY — otherwise the default (all 4 cards) flashes for one
    // throttle cycle before the first sync empties it. Regroup returns the cards.
    const marchIn = !!formation && formation.length > 0;
    return {
      phase: "deployment",
      tick: 0,
      clockSec: 120,
      playerActive: marchIn ? Math.min(playerDeck.length, 4) : 0,
      enemyActive: 0,
      playerNext: marchIn ? null : playerDeck[0] ?? null,
      canDeploy: !marchIn,
      hand: marchIn
        ? []
        : playerDeck.slice(0, 4).map((defId, index) => ({
            index,
            defId,
            selected: index === 0,
          })),
      startCountdownSec: null,
      deploySecLeft: marchIn ? null : DEPLOY_TIME_SEC,
      canRegroup: marchIn,
      banner: null,
      waveNumber: mode === "endless" ? 1 : null,
      intermission: null,
      boonsPicked: [],
      momentumStacks: null,
      rhythmBonus: null,
    };
  });
  const [speed, setSpeedState] = useState<number>(initialSpeed);

  const setSpeed = useCallback(
    (s: number) => {
      // In PVP the sim is server-paced; ignore client speed changes and stay 1×.
      if (mode === "pvp") return;
      speedRef.current = s;
      setSpeedState(s);
    },
    [mode]
  );

  // (Re)initialize a match whenever the deck, seed or mode changes.
  useEffect(() => {
    const seed = seedOverride ?? generateSeed();
    if (mode === "depths" || mode === "endless") {
      // No enemy deck — the wave director inside the controller builds the horde
      // from the seed (a floor for Depths, an unbounded loop for Endless).
      controllerRef.current = new MatchController(seed, playerDeck.slice(0, 4), [], {
        mode,
        floor,
        dungeonId,
        unitLevels,
        itemLoadouts,
        encounter,
        isBoss,
        suppressQuestRare,
        tier,
        // Depths floors 2+: field on the previous floor's marks (the march-in).
        formation: formation ?? undefined,
        slayerBonuses,
      });
    } else {
      const enemyDeck = generateEnemyDeck(seed);
      controllerRef.current = new MatchController(
        seed,
        playerDeck.slice(0, 4),
        enemyDeck,
        // No slayerBonuses: slayer is a PvE-only system — arena neither earns
        // kills (battleGrant gates on mode) nor applies the bonus (a tabled
        // skeleton would otherwise boost hits on Necromancer summons here).
        { unitLevels, itemLoadouts }
      );
    }
    themeRef.current =
      mode === "solo" ? pickArenaTheme(seed)
      : mode === "depths" ? getDungeon(dungeonId).theme
      : mode === "endless" ? "dungeon"
      : "grassField";
    sfxRef.current = new SfxObserver();
    outroRef.current = null;
    introRef.current = null;
    braceRef.current = null;
    // Treasure room: no fight — stand the hoard up RIGHT HERE, in lockstep with
    // the controller. Doing this in a separate BattleScreen effect raced the
    // init: StrictMode's double-mount re-ran this effect and nulled outroRef
    // AFTER the one-shot setup, orphaning the chests. Tiers are static, so the
    // reward roll (computeTreasureRewards) lines up chest-for-chest.
    if (mode === "depths" && encounter === "treasure_room" && controllerRef.current) {
      const outro = new OutroCinematic(controllerRef.current.state);
      outro.gatherAtChests([...TREASURE_ROOM_TIERS], () => {});
      outroRef.current = outro;
    }
    // Descent march-in: the controller fielded the warband on the previous
    // floor's marks behind a hold (see MatchController.introHold). Play the
    // walk-in, then release the hold so the normal 3s countdown begins. Set up
    // here in lockstep with the controller (same StrictMode reasoning as the
    // treasure-room block above). Reduced motion: skip the stroll, release now.
    const mc = controllerRef.current;
    if (mc?.isIntroHeld()) {
      if (prefersReducedMotion()) {
        mc.releaseIntroHold();
      } else {
        const intro = new OutroCinematic(mc.state);
        intro.walkIn(() => {
          mc.releaseIntroHold();
          introRef.current = null;
        });
        introRef.current = intro;
      }
    }
    accRef.current = 0;
    lastRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerDeck.join(","), seedOverride, mode, floor, dungeonId, encounter, isBoss, suppressQuestRare, tier]);

  // The combined loop.
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    let uiThrottle = 0;

    const loop = (now: number) => {
      const c = controllerRef.current;
      if (!c) return;
      const dt = Math.min(250, now - lastRef.current);
      lastRef.current = now;
      accRef.current += dt * speedRef.current;

      // Fixed-timestep simulation.
      let steps = 0;
      while (accRef.current >= TICK_MS && steps < 8) {
        c.tick();
        accRef.current -= TICK_MS;
        steps++;
      }

      // Presentational walk cinematics (real dt — not sim-paced): the post-
      // victory outro, and the floor-entry march-in. At most one is ever active.
      outroRef.current?.step(dt);
      introRef.current?.step(dt);

      // Boss brace: when the engine freezes for a boss/rare entrance, stand up the
      // retreat cinematic. Reduced motion releases at once; if the engine's
      // failsafe released before the lerp finished, drop the stale cinematic.
      if (c.isBraceHeld()) {
        if (!braceRef.current) {
          const cine = new OutroCinematic(c.state);
          if (prefersReducedMotion()) {
            c.releaseBrace();
          } else {
            cine.braceToRow(c.braceRowTargets(), () => {
              c.releaseBrace();
              braceRef.current = null;
            });
            braceRef.current = cine;
          }
        }
      } else if (braceRef.current) {
        braceRef.current = null;
      }
      braceRef.current?.step(dt);

      // Render + sound. The SfxObserver diffs consecutive snapshots to voice
      // deaths/attacks/casts/deploys — render-side, never touching the sim.
      const canvas = canvasRef.current;
      const frameSnap = c.snapshot();
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx)
          renderBattle(ctx, frameSnap, themeRef.current, {
            campfire: outroRef.current?.campfire() ?? null,
            chests: outroRef.current?.chests() ?? null,
          });
      }
      sfxRef.current.observe(frameSnap);

      // Throttled UI sync (~6/s).
      uiThrottle += dt;
      if (uiThrottle >= 160) {
        uiThrottle = 0;
        const snap = c.snapshot();
        const est = c.endlessStatus();
        setUi({
          phase: snap.phase,
          tick: snap.tick,
          clockSec: Math.ceil(snap.clockTicks / TICK_RATE),
          playerActive: c.countActive("player"),
          enemyActive: c.countActive("enemy"),
          playerNext: c.nextCard("player"),
          canDeploy: c.canDeploy("player"),
          hand: c.playerHand(),
          startCountdownSec: c.startCountdownSec(),
          deploySecLeft: c.deploySecLeft(),
          canRegroup: c.canRegroup(),
          banner: snap.waveBanner,
          waveNumber: est ? est.wave : null,
          intermission: est?.intermission ?? null,
          boonsPicked: est?.boonsPicked ?? [],
          momentumStacks: est?.momentumStacks ?? null,
          rhythmBonus: est?.rhythmBonus ?? null,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerDeck.join(","), seedOverride, mode, floor, dungeonId]);

  const deployAt = useCallback((pos: Vec2) => {
    const c = controllerRef.current;
    if (!c) return;
    const card = c.nextCard("player");
    if (!card) return;
    c.deploy("player", card, pos);
  }, []);

  const selectCard = useCallback((index: number) => {
    const c = controllerRef.current;
    if (!c) return;
    c.selectCard(index);
    // Reflect the new selection immediately rather than waiting for the throttle.
    setUi((prev) => ({
      ...prev,
      playerNext: c.nextCard("player"),
      hand: c.playerHand(),
    }));
  }, []);

  const pickUnitAt = useCallback((pos: Vec2): string | null => {
    const c = controllerRef.current;
    if (!c) return null;
    const hitR = UNIT_RADIUS + 10; // a little forgiving for touch
    let best: string | null = null;
    let bestD = hitR * hitR;
    for (const u of c.state.units) {
      if (u.state === "dead") continue;
      const dx = u.pos.x - pos.x;
      const dy = u.pos.y - pos.y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = u.uid;
      }
    }
    return best;
  }, []);

  const inspectUnit = useCallback((uid: string): InspectedUnit | null => {
    const c = controllerRef.current;
    if (!c) return null;
    const u = c.state.units.find((x) => x.uid === uid);
    if (!u || u.state === "dead") return null;
    const def = getUnitDef(u.defId);
    return {
      uid: u.uid,
      name: def.name,
      rarity: def.rarity,
      role: def.role,
      team: u.team,
      hp: Math.ceil(u.hp),
      maxHp: u.maxHp,
      level: u.level,
      damage: u.damage,
      attackSpeed: u.attackSpeed,
      range: u.range,
      abilityName: ABILITIES[u.ability]?.name ?? "",
      traits: def.traits?.map((t) => t.name) ?? [],
      effects: u.effects.map((e) => e.type),
      pos: { x: u.pos.x, y: u.pos.y },
    };
  }, []);

  const enemyLedger = useCallback((): { seen: string[]; slain: string[] } => {
    const c = controllerRef.current;
    // Endless prunes dead-enemy corpses between waves, so scanning the live unit
    // list would miss most of the roster — the controller keeps the run ledger.
    const endless = c?.endlessLedger();
    if (endless) return endless;
    // `slain` is a MULTISET (one entry per kill) so slay bounties count each
    // Spore Pod, not one per run — see battleEnemyLedger.
    return c ? battleEnemyLedger(c.state.units) : { seen: [], slain: [] };
  }, []);

  const pickBoon = useCallback((offerIndex: number) => {
    const c = controllerRef.current;
    if (!c) return;
    c.pickBoon(offerIndex);
    // Reflect the pick immediately (close the overlay, start the next wave)
    // rather than waiting for the throttled sync.
    const est = c.endlessStatus();
    setUi((prev) => ({
      ...prev,
      waveNumber: est ? est.wave : prev.waveNumber,
      intermission: est?.intermission ?? null,
      boonsPicked: est?.boonsPicked ?? prev.boonsPicked,
    }));
  }, []);

  const retireEndless = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    if (c.retireEndless()) {
      // Close the intermission overlay and surface the end-of-run immediately
      // rather than waiting for the throttled sync.
      setUi((prev) => ({ ...prev, phase: "defeat", intermission: null }));
    }
  }, []);

  const wavesSurvived = useCallback((): number => {
    return controllerRef.current?.wavesSurvived() ?? 0;
  }, []);

  const startOutroChest = useCallback(
    (tier: ChestTier, onSettled: () => void, reviveFallen = true) => {
      const c = controllerRef.current;
      if (!c) {
        onSettled();
        return;
      }
      outroRef.current = new OutroCinematic(c.state);
      outroRef.current.gatherAtChest(tier, onSettled, reviveFallen);
    },
    []
  );

  const openOutroChestAt = useCallback((index: number, onReveal: () => void) => {
    outroRef.current?.openChestAt(index, onReveal);
  }, []);

  const outroChestPoints = useCallback(() => {
    return outroRef.current?.chestPoints() ?? [];
  }, []);

  const startOutroCamp = useCallback((onDone: () => void) => {
    const c = controllerRef.current;
    if (!c) {
      onDone();
      return;
    }
    // Reuse the cinematic from the chest beat if one is already running, so the
    // opened chest lingers up-field as the band strolls down to the fire.
    if (!outroRef.current) outroRef.current = new OutroCinematic(c.state);
    outroRef.current.gatherAtCamp(onDone);
  }, []);

  const outroWalkOff = useCallback((dir: OutroDir, onDone: () => void) => {
    const o = outroRef.current;
    if (!o) {
      onDone();
      return;
    }
    o.walkOff(dir, onDone);
  }, []);

  const regroup = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    // Cancel a walk-in mid-stroll: dropping the ref abandons its pending
    // releaseIntroHold (regroup() clears the hold itself below).
    introRef.current = null;
    if (c.regroup()) {
      // Surface manual placement at once (don't wait for the ~6/s sync): the
      // tray returns, the timer re-arms, the countdown + Regroup button clear.
      setUi((prev) => ({
        ...prev,
        playerNext: c.nextCard("player"),
        canDeploy: c.canDeploy("player"),
        hand: c.playerHand(),
        deploySecLeft: c.deploySecLeft(),
        startCountdownSec: null,
        canRegroup: false,
      }));
    }
  }, []);

  const playerFormation = useCallback((): FormationMark[] | null => {
    const marks = controllerRef.current?.getPlayerFormation() ?? [];
    return marks.length ? marks : null;
  }, []);

  return {
    canvasRef,
    ui,
    deployAt,
    selectCard,
    speed,
    setSpeed,
    pickUnitAt,
    inspectUnit,
    enemyLedger,
    pickBoon,
    retireEndless,
    wavesSurvived,
    startOutroChest,
    openOutroChestAt,
    outroChestPoints,
    startOutroCamp,
    outroWalkOff,
    regroup,
    playerFormation,
  };
}

export { type Team };
