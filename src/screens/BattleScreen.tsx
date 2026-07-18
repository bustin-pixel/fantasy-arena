import { useEffect, useRef, useState } from "react";
import type { FormationMark, ItemLoadouts } from "@/types";
import { useBattleEngine, type BattleMode } from "@/hooks/useBattleEngine";
import { CHEST_POINT, type OutroDir } from "@/hooks/OutroCinematic";
import { BattleHud, BattleTopBar } from "@/components/BattleHud";
import { BattleUnitTip } from "@/components/BattleUnitTip";
import { BoonPickOverlay, rarityColor } from "@/components/BoonPickOverlay";
import { CardTray } from "@/components/CardTray";
import { ExitChoiceOverlay } from "@/components/ExitChoiceOverlay";
import { FloorLootReveal } from "@/components/FloorLootReveal";
import { prefersReducedMotion } from "@/utils/motion";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PLAYER_ZONE,
  fieldTransform,
} from "@/utils/constants";
import { clamp } from "@/utils/math";
import { useGameState } from "@/state/GameStateContext";
import {
  endlessBestWave,
  highestClearedFloorOf,
  isTierCleared,
} from "@/state/persistence";
import type { TierId } from "@/data/tiers";
import {
  computeBattleRewards,
  computeTreasureRewards,
  type BattleRewards,
  type ChestResult,
} from "@/meta/rewards";
import { assignOmens, type EncounterKind } from "@/data/encounters";
import {
  ceremonyStep,
  type CeremonyCtx,
  type CeremonyEffect,
  type CeremonyEvent,
  type CeremonyStage,
} from "@/hooks/ceremony";
import { getDungeon } from "@/data/dungeons";
import { addXp, levelFromXp } from "@/meta/leveling";
import { buildSlayerBonusTable } from "@/meta/slayer";
import { RewardPanel } from "@/components/RewardPanel";
import { generateSeed } from "@/utils/rng";
import { playStinger, setMusicTrack } from "@/audio/music";
import { playSfx } from "@/audio/sfx";

interface Props {
  deck: string[];
  onExit: () => void;
  /** Solo allows fast-forward; PVP hides it and locks the sim to 1×. */
  mode?: BattleMode;
  /** Depths floor being descended (ignored outside "depths"). */
  floor?: number;
  /** Which dungeon is being descended (ignored outside "depths"). */
  dungeonId?: string;
  /** This floor's encounter flavor, from the omen the player picked leaving the
   *  previous floor ("normal" for a plain launch). Ignored outside "depths". */
  encounter?: EncounterKind;
  /** Whether THIS floor is the boss lair (the RNG "hunt for the boss" descent).
   *  Drives the boss wave, the boss reward, and the Dungeon-Cleared beat. */
  isBoss?: boolean;
  /** Whether the NEXT floor is the boss lair — the exit choice collapses to a
   *  single "Enter the Lair" telegraph instead of the three omen paths. */
  nextIsBoss?: boolean;
  /** The run already met its fusion-quest rare on a rare-quarry encounter: the
   *  boss floor skips its rare roll, and no further rare quarry is offered. */
  suppressQuestRare?: boolean;
  /** Difficulty tier this dungeon run is fought at (Normal/Hard/Elite) — a
   *  match input frozen for the whole run, like the level map. Shifts monster
   *  levels + grades the rewards. Ignored outside "depths". */
  tier?: TierId;
  /** This floor's march-in marks — the previous floor's deploy positions, so
   *  the warband auto-fields on entry (depths floors 2+). Absent = floor 1 /
   *  manual placement. Frozen at mount, a match input like unitLevels. */
  formation?: FormationMark[];
  /** Post-victory "continue deeper" (depths, non-boss floor): the warband
   *  gathers, the player picks an exit archway (its OMEN sets the next floor's
   *  encounter) or enters the lair, the band walks out, and App advances the
   *  run to the next floor IN PLACE (no atlas). Absent = plain Return to Hub.
   *  `formation` is this floor's deploy marks, carried forward for the march-in. */
  onContinueDeeper?: (
    dungeonId: string,
    encounter: EncounterKind,
    formation: FormationMark[] | null
  ) => void;
  /** The boss on THIS floor was defeated — the dungeon is cleared. Shown after
   *  the Dungeon-Cleared beat; App ends the run and returns to the atlas. */
  onDungeonCleared?: (dungeonId: string) => void;
}

export function BattleScreen({
  deck,
  onExit,
  mode = "solo",
  floor = 1,
  dungeonId = "depths",
  encounter = "normal",
  isBoss = false,
  nextIsBoss = false,
  suppressQuestRare = false,
  tier = "normal",
  formation,
  onContinueDeeper,
  onDungeonCleared,
}: Props) {
  const { save, recordResult, recordBestiary, grantBattleRewards } =
    useGameState();
  // Frozen at mount (useState initializers): the pre-battle XP snapshot and
  // the level map the match runs at. MUST NOT re-derive from live `save` —
  // the post-battle XP grant would change them and re-create the match under
  // the results screen. xpAtStart also feeds the RewardPanel's bar animation.
  const [xpAtStart] = useState<Record<string, number>>(() =>
    Object.fromEntries(deck.map((id) => [id, save.unitXp[id] ?? 0]))
  );
  const [unitLevels] = useState<Record<string, number>>(() =>
    Object.fromEntries(deck.map((id) => [id, levelFromXp(save.unitXp[id] ?? 0)]))
  );
  // Equipped items, frozen at mount like unitLevels — a match input. Only the
  // fielded deck's entries matter; the sim resolves + bakes them at deploy.
  const [itemLoadouts] = useState<ItemLoadouts>(() =>
    Object.fromEntries(
      deck.filter((id) => save.loadouts[id]).map((id) => [id, save.loadouts[id]])
    )
  );
  // The march-in marks for this floor, frozen at mount (a match input like the
  // levels/items above): null on floor 1, else the previous floor's deploy spots.
  const [formationAtMount] = useState<FormationMark[] | null>(
    () => formation ?? null
  );
  // Compendium slayer table, frozen at mount like unitLevels: this match's
  // kills land in the save at resolution and pay out from the NEXT match.
  const [slayerBonuses] = useState<Record<string, number>>(() =>
    buildSlayerBonusTable(save.monsterKills)
  );
  // Omens for the three exit arrows — what each path leads to on the NEXT floor.
  // Frozen once (seeded meta stream), so re-renders can't reshuffle them; only
  // meaningful in the depths continue-deeper flow, harmless elsewhere.
  const [omens] = useState(() =>
    assignOmens(
      generateSeed(),
      getDungeon(dungeonId),
      floor + 1,
      nextIsBoss,
      // No further rare quarry once this run has already met its rare.
      !suppressQuestRare
    )
  );
  const {
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
  } = useBattleEngine(
    deck,
    mode,
    undefined,
    floor,
    dungeonId,
    unitLevels,
    itemLoadouts,
    encounter,
    isBoss,
    suppressQuestRare,
    tier,
    formationAtMount,
    slayerBonuses
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  // Timestamp of the last touch, to suppress the synthetic click a touchscreen
  // fires right after a tap (which would otherwise deploy a second unit).
  const lastTouchRef = useRef(0);
  const [showResult, setShowResult] = useState(false);
  // The reward bundle for the overlay. Set once, alongside the grant.
  const [rewards, setRewards] = useState<BattleRewards | null>(null);
  // Endless: waves cleared this run, captured for the results screen.
  const [endlessWaves, setEndlessWaves] = useState(0);
  // Endless: the pre-run best, frozen at mount — the post-battle grant updates
  // the save, so reading it live would always show this run as the best.
  const [bestAtStart] = useState(() => endlessBestWave(save));
  // Endless: the player chose to retire (bank + end) rather than fight on.
  // Ref for the record-once effect (stinger choice), state for the result copy.
  const retiredRef = useRef(false);
  const [retired, setRetired] = useState(false);
  // uid of the unit whose stat tooltip is open (tap a combatant to inspect).
  const [inspectedUid, setInspectedUid] = useState<string | null>(null);
  // Post-victory ceremony: open the reward chest on the floor → gather at the
  // campfire → pick an exit → walk out → App opens the Dungeon Atlas. The GRAPH
  // (which stage follows which, on every branch) lives in hooks/ceremony as a
  // pure machine with specs; this screen renders the stage it reports and
  // performs the effects it returns. "idle" = not playing.
  const [outroStage, setOutroStage] = useState<CeremonyStage>("idle");
  // The machine is driven from timers and cinematic callbacks, which close over
  // stale renders — so the dispatcher reads the live stage/ctx from refs.
  const stageRef = useRef<CeremonyStage>("idle");
  const ceremonyCtxRef = useRef<CeremonyCtx>({
    isBoss,
    isTreasureRoom: false,
    hasChest: false,
    reducedMotion: false,
  });
  // The single reward chest's lid has landed and its loot is floating up.
  const [chestRevealed, setChestRevealed] = useState(false);
  // Treasure room (no-combat 3-chest floor): the hoard's data, which chests have
  // popped their loot (each floats its own reveal), and the entry banner.
  const isTreasureRoom = mode === "depths" && encounter === "treasure_room";
  const [treasureChests, setTreasureChests] = useState<ChestResult[] | null>(
    null
  );
  const [treasureRevealed, setTreasureRevealed] = useState<Set<number>>(
    () => new Set()
  );
  const [treasureBanner, setTreasureBanner] = useState(false);
  const treasureOpenedRef = useRef<Set<number>>(new Set());
  const treasureStartedRef = useRef(false);
  // Guards the continue-deeper handoff if the player exits mid-outro (the
  // top-bar Leave stays live as an escape hatch and unmounts this screen).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // The reward bundle + treasure hoard, mirrored into refs so the effect
  // performer (driven from timers/callbacks) reads the landed values.
  const rewardsRef = useRef<BattleRewards | null>(null);

  /** Perform ONE effect the machine asked for. Every side effect the ceremony
   *  has — timers, SFX, OutroCinematic, the handoff — is performed here and
   *  nowhere else, so the graph itself stays pure. */
  const performCeremony = (fx: CeremonyEffect) => {
    switch (fx.kind) {
      case "startChest": {
        const tier = rewardsRef.current?.chest?.tier;
        if (!tier) return;
        const start = () => {
          if (!aliveRef.current) return;
          startOutroChest(
            tier,
            () => {
              /* band gathered at the chest; the tap opens it (handleTap). */
            },
            fx.reviveFallen
          );
        };
        if (fx.delayMs > 0) window.setTimeout(start, fx.delayMs);
        else start();
        break;
      }
      case "startCamp":
        startOutroCamp(() => {
          if (!aliveRef.current) return;
          playSfx("heal"); // the fire closes their wounds
          dispatchCeremony({ kind: "campSettled" });
        });
        break;
      case "walkOff":
        outroWalkOff(fx.dir, () => {
          if (!aliveRef.current) return;
          dispatchCeremony({ kind: "walkedOff", encounter: fx.encounter });
        });
        break;
      case "showResult":
        if (fx.delayMs > 0) {
          window.setTimeout(() => {
            if (aliveRef.current) setShowResult(true);
          }, fx.delayMs);
        } else setShowResult(true);
        break;
      case "handOff":
        // Carry this floor's deploy marks forward so the next floor's warband
        // marches in on the same spots. Single advance point → uniform capture
        // across every path (normal/cursed/vault/rare/treasure/lair).
        onContinueDeeper?.(dungeonId, fx.encounter, playerFormation());
        break;
    }
  };

  const dispatchCeremony = (event: CeremonyEvent) => {
    const step = ceremonyStep(stageRef.current, event, ceremonyCtxRef.current);
    stageRef.current = step.stage;
    setOutroStage(step.stage);
    for (const fx of step.effects) performCeremony(fx);
  };

  const continueDeeper = () => {
    if (!onContinueDeeper) return;
    playSfx("uiConfirm");
    setShowResult(false);
    dispatchCeremony({ kind: "continueDeeper" });
  };

  // Player tapped chest `index`: play the open, float its loot at the reveal
  // beat. The single reward chest is index 0; a treasure room fields three.
  const openFloorChestAt = (index: number) => {
    playSfx("chestCreak");
    openOutroChestAt(index, () => {
      if (!aliveRef.current) return;
      playSfx("chestOpen");
      playSfx("coinShower");
      const contents = isTreasureRoom
        ? treasureChests?.[index]?.contents
        : rewards?.chest?.contents;
      if (contents?.some((e) => e.kind === "item" || e.kind === "unit")) {
        playSfx("itemReveal");
      }
      if (isTreasureRoom) {
        setTreasureRevealed((prev) => new Set(prev).add(index));
      } else {
        setChestRevealed(true);
      }
    });
    if (isTreasureRoom) {
      treasureOpenedRef.current.add(index);
      if (treasureOpenedRef.current.size === (treasureChests?.length ?? 3)) {
        // Last chest opened — let the reveals settle, then to the campfire.
        window.setTimeout(() => {
          if (aliveRef.current) dispatchCeremony({ kind: "treasureSettled" });
        }, 3400);
      }
    }
  };

  const chooseExit = (dir: OutroDir) => {
    // The arrow's KIND decides what the next floor holds — which is not always
    // what its omen showed (a rare quarry hides behind another arrow's omen).
    dispatchCeremony({ kind: "exitChosen", dir, encounter: omens[dir].kind });
  };

  // The campfire crackles while the band rests at it.
  useEffect(() => {
    if (outroStage !== "camp" && outroStage !== "choice") return;
    let timer = 0;
    const crackle = () => {
      playSfx("torchCrackle", 0.7 + Math.random() * 0.3);
      timer = window.setTimeout(crackle, 1400 + Math.random() * 1400);
    };
    timer = window.setTimeout(crackle, 500);
    return () => clearTimeout(timer);
  }, [outroStage]);

  // Re-read live every render (~6/s on the throttled ui sync) so HP/effects and
  // the unit's position stay current; clears itself when the unit dies.
  const inspected = inspectedUid ? inspectUnit(inspectedUid) : null;

  // Whether the reward chest opens ON the arena floor rather than as the result
  // card's pop-up — true for both the non-boss "continue deeper" chest and the
  // boss's Dungeon-Cleared chest (full motion, chest present). When true, the
  // result card hides its own chest so the reward isn't shown twice. Reduced
  // motion keeps the pop-up (its only reveal).
  const chestOpenedOnFloor =
    mode === "depths" &&
    ui.phase === "victory" &&
    !prefersReducedMotion() &&
    !!rewards?.chest &&
    (isBoss || !!onContinueDeeper);

  // Size the render buffer to the field box's ASPECT (not a fixed 480×720), so
  // the arena fills it edge-to-edge instead of leaving black letterbox bars.
  // Height stays FIELD_HEIGHT (constant vertical resolution); width tracks the
  // box. The renderer re-centers the 480×720 world inside this wider buffer,
  // and handleTap/BattleUnitTip invert the same transform. See fieldTransform.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const w = Math.max(1, Math.round(FIELD_HEIGHT * (r.width / r.height)));
      // Assigning canvas.width clears the canvas, so only touch it on a real
      // change (the rAF loop repaints every frame regardless).
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== FIELD_HEIGHT) canvas.height = FIELD_HEIGHT;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [canvasRef]);

  // Record win/loss + Compendium reveals + rewards once when the match
  // resolves. The bestiary and rewards read the final field from the meta
  // layer — the sim never knows. recordedRef makes this exactly-once (the
  // grant re-renders via save, and StrictMode re-runs effects in dev).
  useEffect(() => {
    const outcome =
      ui.phase === "victory" || ui.phase === "defeat" || ui.phase === "draw"
        ? ui.phase
        : null;
    if (outcome && !recordedRef.current) {
      recordedRef.current = true;
      const isEndless = mode === "endless";
      const survived = isEndless ? wavesSurvived() : 0;
      if (isEndless) setEndlessWaves(survived);
      // The battle track ends with the battle: victory/defeat play a one-shot
      // stinger over its fade-out; a draw just falls silent. The hub theme
      // returns via App's view effect when the player exits.
      // A retirement resolves as "defeat" in the sim but is a banked win to the
      // player — give it the victory fanfare.
      if (outcome === "victory" || (isEndless && retiredRef.current)) {
        playStinger("victory");
      } else if (outcome === "defeat") playStinger("defeat");
      else setMusicTrack(null);
      // Endless runs are a survival score, not a win/loss — don't touch the W/L
      // tally (every run "ends" in a wipe).
      if (!isEndless) {
        if (outcome === "victory") recordResult(true);
        else if (outcome === "defeat") recordResult(false);
      }
      const { seen, slain } = enemyLedger();
      recordBestiary(seen, slain);
      // Grant-then-reveal: rewards are rolled (drop-time seed) and committed
      // to the save NOW; the overlay's chest ceremony is pure presentation,
      // so leaving early can't lose anything.
      const bundle = computeBattleRewards({
        mode,
        floor,
        dungeonId,
        outcome,
        unlockedUnits: save.unlockedUnits,
        chestSeed: generateSeed(),
        // Rare-spawn quest check: the fielded warband + which enemies died.
        deck,
        slain,
        questUnlocks: save.questUnlocks,
        wavesSurvived: survived,
        bestWave: endlessBestWave(save),
        itemLoadouts, // Lucky Coin: gold boost + seeded chest-tier upgrade
        itemPity: save.itemPity, // dry-streak insurance — forces the item roll at the threshold
        encounter, // rich encounters bump the end-chest tier
        // RNG "hunt for the boss" model: rewards key off the boss-lair flag +
        // whether the dungeon is already cleared AT THIS TIER, not a per-floor
        // high-water mark (read pre-grant, so the first boss kill at each tier
        // reads as uncleared).
        isBoss,
        bossCleared: isTierCleared(save, dungeonId, tier),
        tier,
      });
      grantBattleRewards(bundle, {
        mode,
        floor,
        dungeonId,
        wavesSurvived: survived,
        deck,
        // Quest-board progress facts (accepted quests tick in the grant fold).
        outcome,
        slain,
        tier,
      });
      setRewards(bundle);
      rewardsRef.current = bundle;
      // Freeze the facts the ceremony branches on, THEN hand the resolution to
      // the machine: a won lair with a chest opens it ON the arena floor (the
      // band gathers, the player taps, the loot reveals, and only then does the
      // "Dungeon Cleared!" card appear). Everything else — a loss, a chestless
      // replay, reduced motion, an ordinary floor — routes to the result card.
      // The grant already happened, so leaving mid-cinematic is safe.
      ceremonyCtxRef.current = {
        isBoss: mode === "depths" && outcome === "victory" && isBoss,
        isTreasureRoom,
        hasChest: !!bundle.chest,
        reducedMotion: prefersReducedMotion(),
      };
      dispatchCeremony({ kind: "resolved" });
    }
  }, [
    ui.phase,
    recordResult,
    recordBestiary,
    enemyLedger,
    grantBattleRewards,
    wavesSurvived,
    mode,
    floor,
    dungeonId,
    tier,
    save,
  ]);

  // Treasure room: no fight. On mount, grant the 3-chest hoard + record the
  // clear (grant-then-reveal), then run the on-floor chest cinematic → campfire.
  useEffect(() => {
    if (!isTreasureRoom || treasureStartedRef.current) return;
    treasureStartedRef.current = true;
    const bundle = computeTreasureRewards({
      floor,
      highestClearedFloor: highestClearedFloorOf(save, dungeonId),
      chestSeed: generateSeed(),
      unlockedUnits: save.unlockedUnits,
      itemPity: save.itemPity,
      tier,
    });
    setTreasureChests(bundle.chests);
    // Fold all three chests' contents into ONE grant (+ the floor clear + XP);
    // the per-chest reveals below are pure theater over the already-granted loot.
    grantBattleRewards(
      {
        gold: 0,
        xp: bundle.xp,
        chest: {
          tier: bundle.chests[0].tier,
          seed: bundle.chests[0].seed,
          contents: bundle.chests.flatMap((c) => c.contents),
        },
        shards: 0,
        // A treasure room is mid-run loot, never the boss — it must not mark the
        // dungeon cleared (completion is the first boss kill only).
        firstClear: false,
      },
      { mode, floor, dungeonId, deck, outcome: "victory", tier }
    );
    playSfx("questSting");
    setTreasureBanner(true);
    window.setTimeout(() => {
      if (aliveRef.current) setTreasureBanner(false);
    }, 2400);
    // A treasure room has no fight to win, so the hoard's grant IS its
    // resolution — hand it to the ceremony machine to open the chest stage.
    ceremonyCtxRef.current = {
      isBoss: false,
      isTreasureRoom: true,
      hasChest: true,
      reducedMotion: prefersReducedMotion(),
    };
    dispatchCeremony({ kind: "treasureGranted" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap inspects a tapped unit (either team); on empty space it dismisses any
  // tooltip and deploys a reinforcement if a slot is open in the player zone.
  const handleTap = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Screen → buffer → world: the buffer is wider than the 480×720 world (the
    // arena fills the margins), so undo the renderer's centering transform.
    // Taps in the side margins clamp onto the field edge.
    const { scale, offsetX, offsetY } = fieldTransform(canvas.width, canvas.height);
    const bx = ((clientX - rect.left) / rect.width) * canvas.width;
    const by = ((clientY - rect.top) / rect.height) * canvas.height;
    const fx = clamp((bx - offsetX) / scale, 0, FIELD_WIDTH);
    const fy = clamp((by - offsetY) / scale, 0, FIELD_HEIGHT);

    // During the chest beat, a tap on a chest opens it (single reward chest, or
    // a treasure room's three). Takes priority over inspecting a gathered unit.
    if (outroStage === "chest") {
      for (const { index, point, opened } of outroChestPoints()) {
        if (opened) continue;
        const dx = Math.abs(fx - point.x);
        const dy = fy - point.y;
        if (dx <= 40 && dy >= -64 && dy <= 14) {
          openFloorChestAt(index);
          return;
        }
      }
    }

    const hitUid = pickUnitAt({ x: fx, y: fy });
    if (hitUid) {
      // Tapping the same unit again closes its tooltip; a different unit switches.
      setInspectedUid((prev) => (prev === hitUid ? null : hitUid));
      return;
    }
    setInspectedUid(null);
    if (ui.canDeploy && fy >= PLAYER_ZONE.top) {
      // Tap ack only — the observer's deploy thud voices the actual placement.
      playSfx("uiTap");
      deployAt({ x: fx, y: fy });
    }
  };

  // Endless: chime when a new intermission (boon offer) opens.
  const prevIntermissionWave = useRef<number | null>(null);
  useEffect(() => {
    const wave = ui.intermission?.wave ?? null;
    if (wave != null && wave !== prevIntermissionWave.current) playSfx("boonChime");
    prevIntermissionWave.current = wave;
  }, [ui.intermission]);

  return (
    <div className="screen battle">
      {/* Counter/timer bar sits ABOVE the field in normal flow so units at the
          map's top edge are never hidden under it. */}
      <BattleTopBar ui={ui} mode={mode} onExit={onExit} />
      <div className="field-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          className="field-canvas"
          onClick={(e) => {
            // Skip the synthetic click a touchscreen fires ~300ms after a tap,
            // so one tap deploys one unit (not two on the same spot).
            if (Date.now() - lastTouchRef.current < 600) return;
            handleTap(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            lastTouchRef.current = Date.now();
            const t = e.touches[0];
            if (t) handleTap(t.clientX, t.clientY);
          }}
        />
        {!isTreasureRoom && (
          <BattleHud
            ui={ui}
            speed={speed}
            onSpeed={setSpeed}
            mode={mode}
            onRegroup={regroup}
          />
        )}
        {treasureBanner && (
          <div className="treasure-banner" role="status">
            ✦ Treasure Room ✦
          </div>
        )}
        {outroStage === "choice" &&
          (nextIsBoss ? (
            <div className="lair-choice" role="dialog" aria-label="The boss lair">
              <p className="lair-omen">☠ The boss's lair lies just ahead…</p>
              <button
                className="btn btn-gold lair-enter"
                onClick={() => chooseExit("up")}
              >
                Enter the Lair
              </button>
            </div>
          ) : (
            <ExitChoiceOverlay omens={omens} onChoose={chooseExit} />
          ))}
        {outroStage === "chest" && chestRevealed && rewards?.chest && (
          <FloorLootReveal
            contents={rewards.chest.contents}
            anchor={{ x: CHEST_POINT.x, y: CHEST_POINT.y - 34 }}
            bufW={canvasRef.current?.width ?? FIELD_WIDTH}
            bufH={canvasRef.current?.height ?? FIELD_HEIGHT}
            onDismiss={() => {
              setChestRevealed(false);
              // The lair ends the run ("Dungeon Cleared!"); an ordinary floor
              // walks on to the campfire. The machine owns which.
              dispatchCeremony({ kind: "revealDismissed" });
            }}
          />
        )}
        {isTreasureRoom &&
          treasureChests &&
          [...treasureRevealed].map((i) => {
            const pt = outroChestPoints().find((p) => p.index === i)?.point;
            if (!pt) return null;
            return (
              <FloorLootReveal
                key={i}
                contents={treasureChests[i].contents}
                anchor={{ x: pt.x, y: pt.y - 34 }}
                bufW={canvasRef.current?.width ?? FIELD_WIDTH}
                bufH={canvasRef.current?.height ?? FIELD_HEIGHT}
                onDismiss={() =>
                  setTreasureRevealed((prev) => {
                    const n = new Set(prev);
                    n.delete(i);
                    return n;
                  })
                }
              />
            );
          })}
        {inspected && (
          <BattleUnitTip
            unit={inspected}
            bufW={canvasRef.current?.width ?? FIELD_WIDTH}
            bufH={canvasRef.current?.height ?? FIELD_HEIGHT}
            onClose={() => setInspectedUid(null)}
          />
        )}
      </div>

      {!isTreasureRoom && (
        <CardTray hand={ui.hand} canDeploy={ui.canDeploy} onSelect={selectCard} />
      )}

      {/* Endless: the between-wave boon pick. The sim is frozen behind it.
          The phase guard matters for retirement: the controller stays in its
          intermission after a retire, but the match has resolved. */}
      {mode === "endless" && ui.phase === "battle" && ui.intermission && (
        <BoonPickOverlay
          wave={ui.intermission.wave}
          offers={ui.intermission.offers}
          boonsPicked={ui.boonsPicked}
          onPick={(i) => { playSfx("boonPick"); pickBoon(i); }}
          onRetire={() => {
            playSfx("retireBank");
            retiredRef.current = true;
            setRetired(true);
            retireEndless();
          }}
        />
      )}

      {showResult && (
        <div className="result-overlay">
          <div
            className={`result-card ${
              mode === "endless" ? (retired ? "victory" : "defeat") : ui.phase
            }`}
          >
            {mode === "endless" ? (
              <>
                <h2>{retired ? "Run Complete" : "Run Over"}</h2>
                <p>
                  {retired ? (
                    <>
                      You banked your winnings after{" "}
                      <strong>{endlessWaves}</strong>{" "}
                      {endlessWaves === 1 ? "wave" : "waves"}.
                    </>
                  ) : (
                    <>
                      Your warband cleared <strong>{endlessWaves}</strong>{" "}
                      {endlessWaves === 1 ? "wave" : "waves"} and fell on wave{" "}
                      {endlessWaves + 1}.
                    </>
                  )}{" "}
                  Best: <strong>{Math.max(bestAtStart, endlessWaves)}</strong>
                </p>
                {ui.boonsPicked.length > 0 && (
                  <div className="boon-tally-chips result-boons">
                    {ui.boonsPicked.map((b) => (
                      <span
                        key={b.id}
                        className="boon-chip"
                        style={{ borderColor: rarityColor(b.rarity) }}
                      >
                        {b.name}
                        {b.count > 1 && <strong> ×{b.count}</strong>}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2>
                  {ui.phase === "victory"
                    ? mode === "depths" && isBoss
                      ? "Dungeon Cleared!"
                      : "Victory"
                    : ui.phase === "defeat"
                    ? "Defeat"
                    : "Draw"}
                </h2>
                <p>
                  {ui.phase === "victory"
                    ? mode === "depths" && isBoss
                      ? "The boss is slain — the dungeon is yours."
                      : "Your warband stands triumphant."
                    : ui.phase === "defeat"
                    ? "Your warband has fallen."
                    : "Neither side could break the other."}
                </p>
              </>
            )}
            {rewards && (
              <RewardPanel
                rewards={rewards}
                floor={floor}
                mode={mode}
                dungeonId={dungeonId}
                tier={tier}
                // The chest opens ON the arena floor (non-boss continue-deeper
                // AND the boss's Dungeon-Cleared beat), so suppress the pop-up's
                // own chest here. Reduced motion keeps it (its only reveal).
                hideChest={chestOpenedOnFloor}
                // Grant-then-reveal: the save already holds the new XP; the
                // panel animates the frozen pre-grant snapshot forward with
                // the SAME addXp clamp, so the preview matches what persisted.
                xpGains={deck.map((id) => ({
                  defId: id,
                  before: xpAtStart[id] ?? 0,
                  after: addXp(xpAtStart[id] ?? 0, rewards.xp),
                }))}
              />
            )}
            {mode === "depths" && ui.phase === "victory" && isBoss ? (
              // The boss is down — the dungeon is cleared. One button ends the
              // run; App returns to the atlas (world map + unlock ceremony).
              <button
                className="btn btn-gold"
                onClick={() =>
                  onDungeonCleared ? onDungeonCleared(dungeonId) : onExit()
                }
              >
                Return Victorious
              </button>
            ) : mode === "depths" && ui.phase === "victory" && onContinueDeeper ? (
              <div className="result-actions">
                <button className="btn btn-gold" onClick={continueDeeper}>
                  Continue Deeper
                </button>
                <button className="btn btn-close-ghost" onClick={onExit}>
                  Return to Hub
                </button>
              </div>
            ) : (
              <button className="btn btn-gold" onClick={onExit}>
                Return to Hub
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
