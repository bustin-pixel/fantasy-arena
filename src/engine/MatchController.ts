// ============================================================================
// MatchController
// A thin, framework-free controller that owns one SimState and exposes the
// operations a UI (or future server) needs: deploy a unit, run the AI, advance
// a tick. It also accumulates the ReplayData (seed + deployments) — enough to
// reproduce the whole match without recording per-frame state.
// ============================================================================

import type {
  DeploymentRecord,
  FormationMark,
  ItemLoadouts,
  MatchPhase,
  ReplayData,
  Team,
  Unit,
  Vec2,
  WaveBanner,
} from "@/types";
import {
  DEPLOY_TIME_SEC,
  DEPTHS_ENEMY_ACTIVE,
  DEPTHS_MATCH_TIME_SEC,
  DEPTHS_PLAYER_ACTIVE,
  ENEMY_ZONE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MATCH_TIME_SEC,
  OPENING_CAST_GRACE_SEC,
  PLAYER_ZONE,
  REINFORCE_GRACE_SEC,
  TICK_RATE,
  UNIT_RADIUS,
  secToTicks,
} from "@/utils/constants";
import {
  BOSS_BRACE_FAILSAFE_SEC,
  BOSS_BRACE_ROW_Y_FRAC,
} from "@/data/depths";
import { createUnit, resetUidCounter, type ItemCarry } from "@/entities/createUnit";
import {
  createSimState,
  snapshot,
  stepSimulation,
  type SimState,
} from "./CombatSystem";
import { getKit } from "./kits/UnitKit";
import { WaveController } from "./WaveController";
import { EndlessController, type EndlessStatus } from "./EndlessController";
import { isMelee, getUnitDef } from "@/data/units";
import { planEnemyDeploy } from "./EnemyAI";
import { getDungeon } from "@/data/dungeons";
import {
  arenaMirrorMultipliers,
  identityItemMods,
  resolveLoadoutMods,
} from "@/data/items";
import { averageDeckLevel } from "@/meta/leveling";
import {
  ENDLESS_ENEMY_ACTIVE,
  ENDLESS_PLAYER_ACTIVE,
  ENDLESS_WAVE_TIME_SEC,
} from "@/data/endless";
import type { EncounterKind } from "@/data/encounters";
import type { TierId } from "@/data/tiers";

/** Match ruleset. Arena is the symmetric 2-concurrent card battle; Depths is the
 *  PvE descent (WaveController trickles a floor's horde in). Endless is the
 *  survival mode — an unbounded escalating wave loop with between-wave boon picks,
 *  driven by an EndlessController. Depths + Endless both field the whole warband. */
export type MatchMode = "arena" | "depths" | "endless";

export interface MatchOptions {
  mode?: MatchMode;
  /** Depths floor number (drives wave budget/tier). Ignored in arena. */
  floor?: number;
  /** Which dungeon to descend (defaults to "depths"). Ignored in arena. */
  dungeonId?: string;
  /** Player unit levels by defId (missing = 1). A deterministic match input,
   *  like the seed: baked into stats at createUnit, recorded in the replay. */
  unitLevels?: Record<string, number>;
  /** Player equipped item keys by defId (missing = bare). A deterministic
   *  match input, like unitLevels: resolved once at construction, baked/read
   *  via Unit.itemMods, recorded in the replay. */
  itemLoadouts?: ItemLoadouts;
  /** Depths floor flavor (cursed/rare_spawn/treasure_*). Defaults to "normal";
   *  reshapes the wave (WaveController) and, for treasure_room, skips combat. */
  encounter?: EncounterKind;
  /** Whether this floor is the boss lair. In the RNG "hunt for the boss"
   *  descent the boss sits at a run-seeded random depth, so the caller passes it
   *  explicitly; omitted, the WaveController falls back to the every-Nth-floor
   *  rule (isBossFloorIn). */
  isBoss?: boolean;
  /** On the boss floor, skip the fusion-quest rare roll (the run already met its
   *  rare on a rare-quarry encounter floor). */
  suppressQuestRare?: boolean;
  /** Difficulty tier (Normal/Hard/Elite) — shifts monster LEVELS only, via the
   *  band map in data/tiers.ts. A deterministic match input like unitLevels
   *  (never draws RNG). Ignored outside depths. */
  tier?: TierId;
  /** The previous floor's deploy-time marks (depths descent only). When present,
   *  the warband is fielded on these spots at construction behind an intro hold —
   *  the hook plays a walk-in, then releases the hold to start the countdown.
   *  Absent = today's manual placement, byte-for-byte (zero drift). A match input
   *  like the deployments themselves; the resulting deploys are recorded, so the
   *  replay log fully captures its effect. */
  formation?: FormationMark[];
  /** Player slayer bonuses: defId → outgoing damage multiplier (e.g. 1.04),
   *  meta-precomputed from lifetime monsterKills (meta/slayer). A deterministic
   *  match input like unitLevels: FROZEN for the whole match — kills made this
   *  match land in the save and pay out from the NEXT one — and recorded in the
   *  replay. Missing/empty = identity. */
  slayerBonuses?: Record<string, number>;
}

/** The match clock for a mode. Endless resets its clock per wave (a stalemate
 *  backstop), so it starts on the per-wave budget rather than a total-match one. */
function matchClockSec(mode: MatchMode): number {
  if (mode === "depths") return DEPTHS_MATCH_TIME_SEC;
  if (mode === "endless") return ENDLESS_WAVE_TIME_SEC;
  return MATCH_TIME_SEC;
}

/** Post-battle enemy ledger from a final unit list. `seen` = the DISTINCT enemy
 *  defIds encountered (for the compendium). `slain` = a MULTISET, one entry per
 *  dead enemy — slay bounties count individual kills, so this must NOT dedupe
 *  (a "slay 18× Spore Pod" quest folds `slain.filter(id => id===target).length`).
 *  Arena/Depths/dungeon corpses persist in the unit list, so this final scan sees
 *  every kill; Endless prunes corpses mid-run and keeps its own running kill log
 *  (see EndlessController.ledger), which the hook prefers over this scan. */
export function battleEnemyLedger(
  units: readonly Unit[]
): { seen: string[]; slain: string[] } {
  const seen = new Set<string>();
  const slain: string[] = [];
  for (const u of units) {
    if (u.team !== "enemy") continue;
    seen.add(u.defId);
    if (u.state === "dead") slain.push(u.defId);
  }
  return { seen: [...seen], slain };
}

export class MatchController {
  state: SimState;
  playerDeck: string[];
  enemyDeck: string[];
  /** Deck indices already deployed, per side. Lets cards deploy in any order. */
  private playerUsed = new Set<number>();
  private enemyUsed = new Set<number>();
  /** Which deck index the player has selected to deploy next (null = first available). */
  private selectedIndex: number | null = null;
  private deployments: DeploymentRecord[] = [];
  private aiCooldown = 0;
  /** Pre-battle countdown once both sides have 2 down (-1 = not armed yet). */
  private startCountdown = -1;
  /** Placement timer for the deployment phase; when it hits 0 we auto-place any
   *  units the player hasn't set down (spread out, never stacked). */
  private deployTimer = secToTicks(DEPLOY_TIME_SEC);
  /** Ticks an empty player slot waits before the engine auto-deploys a reserve. */
  private autoDeployCountdown = 0;
  /** Descent march-in: when a formation is applied at construction, the warband
   *  is already fielded but the deployment tick is held (a no-op) until the hook's
   *  walk-in cinematic lands them on their marks and calls releaseIntroHold().
   *  Nothing in the deployment tick touches the clock/RNG, so an arbitrary-length
   *  hold is provably sim-invisible. False (and unreachable) without a formation. */
  private introHold = false;
  /** True once a formation was fielded — gates the Regroup affordance (the player
   *  can scrap the auto-line-up and place manually while still in deployment). */
  private formationApplied = false;
  /** Boss "brace up" beat: when a boss/rare telegraph fires on a cleared field
   *  the sim FREEZES here (tick early-returns) while survivors pull back into a
   *  centered row; on release combat resumes from that row. Like the march-in
   *  hold, the frozen ticks touch no sim state, so the wall-clock length of the
   *  cinematic can't affect the outcome. */
  private braceHold = false;
  /** Failsafe countdown for the frozen window (auto-releases headlessly / if a
   *  cinematic stalls). The client normally releases earlier via releaseBrace(). */
  private braceTicks = 0;
  /** The deterministic row slots (uid → spot) computed when a brace fires; the
   *  snap-to on release and the client cinematic both read these. */
  private braceTargets: Map<string, Vec2> | null = null;
  /** The banner a brace already fired for — dedupes re-triggering across the ticks
   *  one telegraph spans (a fresh banner object = a fresh brace, e.g. rare → boss). */
  private lastBracedBanner: WaveBanner | null = null;
  readonly seed: number;
  readonly mode: MatchMode;
  /** This match's encounter flavor (depths only; "normal" elsewhere). */
  readonly encounter: EncounterKind;
  /** Peaceful treasure-room floor: warband fielded, sim frozen, no resolution. */
  private isTreasureRoom = false;
  /** Player unit levels by defId (missing = 1). */
  private unitLevels: Record<string, number>;
  /** Arena mirror: AI units fight at the player's average deck level, so the
   *  fair-fight mode stays fair as the player levels. 1 in PvE modes (their
   *  enemies scale by floor/wave instead). */
  private enemyLevel: number;
  /** The raw loadouts input, kept only for the replay record. */
  private itemLoadouts: ItemLoadouts;
  /** Slayer bonus table (defId → mult), installed on teamMods.player. */
  private slayerBonuses: Record<string, number>;
  /** Player gear resolved once per defId (missing = bare unit). */
  private playerItems = new Map<string, ItemCarry>();
  /** Arena item mirror: the flat hp/dmg mods every AI unit fights with,
   *  approximating the player's average equipped power (the item twin of
   *  enemyLevel). Null in PvE modes and when the player wears nothing. */
  private enemyItemMods: ItemCarry["mods"] | null = null;
  /** The Depths' horde director (null outside depths). */
  private wave: WaveController | null = null;
  /** The survival-mode director (null outside endless). */
  private endless: EndlessController | null = null;
  /** Ordered boon-pick offer indices — an input log, like `deployments`. */
  private pickIndices: number[] = [];

  constructor(
    seed: number,
    playerDeck: string[],
    enemyDeck: string[],
    opts: MatchOptions = {}
  ) {
    this.seed = seed;
    this.mode = opts.mode ?? "arena";
    this.encounter = opts.encounter ?? "normal";
    this.playerDeck = playerDeck;
    this.enemyDeck = enemyDeck;
    this.unitLevels = opts.unitLevels ?? {};
    this.enemyLevel =
      this.mode === "arena"
        ? averageDeckLevel(playerDeck, this.unitLevels)
        : 1;
    this.itemLoadouts = opts.itemLoadouts ?? {};
    // Resolve each deck unit's gear once (pure, memoized for every deploy).
    for (const defId of playerDeck) {
      const mods = resolveLoadoutMods(this.itemLoadouts[defId]);
      if (mods) this.playerItems.set(defId, { mods, owner: defId });
    }
    // Arena item mirror: like enemyLevel, the AI deck fights with a flat
    // hp/dmg bump derived from the player's equipped power. Identity (null)
    // when nothing is equipped, so bare arenas stay byte-identical.
    if (this.mode === "arena" && this.playerItems.size > 0) {
      const m = arenaMirrorMultipliers(playerDeck, this.itemLoadouts);
      if (m.hp !== 1 || m.dmg !== 1) {
        this.enemyItemMods = {
          ...identityItemMods(),
          hpMult: m.hp,
          dmgMult: m.dmg,
        };
      }
    }
    resetUidCounter();
    this.state = createSimState(seed, matchClockSec(this.mode));
    // Compendium slayer bonuses: player-side only, read at the damage funnel.
    // Identity {} leaves teamMods untouched-in-effect, so slayer-less matches
    // stay byte-identical to pre-feature sims.
    this.slayerBonuses = opts.slayerBonuses ?? {};
    this.state.teamMods.player.slayerVs = this.slayerBonuses;
    if (this.mode === "depths") {
      this.state.activeCaps = {
        player: DEPTHS_PLAYER_ACTIVE,
        enemy: DEPTHS_ENEMY_ACTIVE,
      };
      if (this.encounter === "treasure_room") {
        // A peaceful loot floor: no horde. Field the whole warband now and
        // freeze the sim — BattleScreen drives the chest cinematic, and tick()
        // is a no-op, so nothing ever resolves this to a "victory". If a
        // formation carried in, field on the marks (visual continuity, and it
        // re-records them into `deployments` so the NEXT floor carries them too).
        this.isTreasureRoom = true;
        if (opts.formation?.length) this.applyFormation(opts.formation);
        else this.autoFillPlayerDeployment();
        this.state.phase = "battle";
      } else {
        this.wave = new WaveController(
          seed,
          getDungeon(opts.dungeonId ?? "depths"),
          opts.floor ?? 1,
          this.encounter,
          opts.isBoss,
          opts.suppressQuestRare,
          opts.tier
        );
        // Descent march-in: field the warband on the previous floor's marks and
        // hold the deployment tick until the hook's walk-in cinematic releases it.
        if (opts.formation?.length) {
          this.applyFormation(opts.formation);
          this.introHold = true;
          this.formationApplied = true;
        }
      }
    } else if (this.mode === "endless") {
      // Whole warband down, but a SMALLER horde cap than Depths — no reserves
      // means the swarm has to stay a fair fight.
      this.state.activeCaps = {
        player: ENDLESS_PLAYER_ACTIVE,
        enemy: ENDLESS_ENEMY_ACTIVE,
      };
      this.endless = new EndlessController(seed);
    }
  }

  get phase(): MatchPhase {
    return this.state.phase;
  }

  countActive(team: Team): number {
    return this.state.units.filter(
      (u) => u.team === team && u.state !== "dead"
    ).length;
  }

  private usedSet(team: Team): Set<number> {
    return team === "player" ? this.playerUsed : this.enemyUsed;
  }

  private deckRemaining(team: Team): number {
    const deck = team === "player" ? this.playerDeck : this.enemyDeck;
    return deck.length - this.usedSet(team).size;
  }

  /** Can `team` deploy right now (active cap + cards left in hand)? */
  canDeploy(team: Team): boolean {
    if (this.state.phase !== "deployment" && this.state.phase !== "battle")
      return false;
    return (
      this.countActive(team) < this.state.activeCaps[team] &&
      this.deckRemaining(team) > 0
    );
  }

  /**
   * The player's remaining hand: each undeployed card with its deck index and
   * whether it's the current selection. Drives the bottom card tray in the UI.
   */
  playerHand(): { index: number; defId: string; selected: boolean }[] {
    const sel = this.resolvedSelection();
    const hand: { index: number; defId: string; selected: boolean }[] = [];
    this.playerDeck.forEach((defId, index) => {
      if (!this.playerUsed.has(index)) {
        hand.push({ index, defId, selected: index === sel });
      }
    });
    return hand;
  }

  /** Player selects which card to deploy next. Ignored if already deployed. */
  selectCard(index: number): void {
    if (index >= 0 && index < this.playerDeck.length && !this.playerUsed.has(index)) {
      this.selectedIndex = index;
    }
  }

  /** The effective selection: explicit choice if still valid, else first in hand. */
  private resolvedSelection(): number | null {
    if (this.selectedIndex != null && !this.playerUsed.has(this.selectedIndex)) {
      return this.selectedIndex;
    }
    for (let i = 0; i < this.playerDeck.length; i++) {
      if (!this.playerUsed.has(i)) return i;
    }
    return null;
  }

  /** Next card the team would deploy. For the player this honors the selection. */
  nextCard(team: Team): string | null {
    if (team === "player") {
      const sel = this.resolvedSelection();
      return sel != null ? this.playerDeck[sel] : null;
    }
    for (let i = 0; i < this.enemyDeck.length; i++) {
      if (!this.enemyUsed.has(i)) return this.enemyDeck[i];
    }
    return null;
  }

  deploy(team: Team, defId: string, pos: Vec2): Unit | null {
    if (!this.canDeploy(team)) return null;
    const zone = team === "player" ? PLAYER_ZONE : ENEMY_ZONE;
    const clampedY = Math.max(zone.top, Math.min(zone.bottom, pos.y));
    const level =
      team === "player" ? (this.unitLevels[defId] ?? 1) : this.enemyLevel;
    // Player units carry their own resolved gear; arena AI units carry the
    // mirror mods (owner = their defId, so the bake activates like real gear).
    const items =
      team === "player"
        ? this.playerItems.get(defId)
        : this.enemyItemMods
          ? { mods: this.enemyItemMods, owner: defId }
          : undefined;
    const unit = createUnit(
      defId,
      team,
      {
        x: Math.max(40, Math.min(FIELD_WIDTH - 40, pos.x)),
        y: clampedY,
      },
      level,
      items
    );
    this.state.units.push(unit);

    // [seam] kit spawn hook (opening stealth for the Assassin/Rogue/Trickster rides
    // their kits here).
    getKit(defId)?.onSpawn?.(unit);

    // Mark the consumed deck index. For the player, deploy the selected card;
    // otherwise the first undeployed copy matching defId.
    const used = this.usedSet(team);
    const deck = team === "player" ? this.playerDeck : this.enemyDeck;
    let consumed = -1;
    if (team === "player" && this.resolvedSelection() != null) {
      const sel = this.resolvedSelection()!;
      if (deck[sel] === defId) consumed = sel;
    }
    if (consumed === -1) {
      consumed = deck.findIndex((d, i) => d === defId && !used.has(i));
    }
    if (consumed !== -1) used.add(consumed);
    if (team === "player") this.selectedIndex = null;

    this.autoDeployCountdown = 0;

    this.deployments.push({
      tick: this.state.tick,
      team,
      defId,
      pos: { x: unit.pos.x, y: unit.pos.y },
    });

    return unit;
  }

  /** True once each side has its full opening down. Arena: both sides at the
   *  shared cap. Depths: the player's whole warband (the horde only starts
   *  creeping in once the battle begins, so enemy readiness never gates). */
  private bothSidesReady(): boolean {
    const playerReady =
      this.countActive("player") >=
      Math.min(this.playerDeck.length, this.state.activeCaps.player);
    // Depths + Endless: only the player has an opening hand (the horde arrives
    // once the battle starts), so enemy readiness never gates the countdown.
    if (this.mode !== "arena") return playerReady;
    return (
      playerReady && this.countActive("enemy") >= this.state.activeCaps.enemy
    );
  }

  /** Seconds left on the pre-battle countdown, or null if it hasn't armed yet. */
  startCountdownSec(): number | null {
    if (this.startCountdown < 0) return null;
    return Math.ceil(this.startCountdown / TICK_RATE);
  }

  /** Seconds left on the deployment placement timer, or null once it no longer
   *  applies (battle started, or the pre-battle countdown has taken over). */
  deploySecLeft(): number | null {
    if (this.state.phase !== "deployment") return null;
    // The placement timer doesn't run under the march-in hold (nor is it shown).
    if (this.introHold) return null;
    if (this.startCountdown >= 0) return null;
    return Math.max(0, Math.ceil(this.deployTimer / TICK_RATE));
  }

  // -- Deployment auto-fill ---------------------------------------------------
  // When the placement timer expires, fill any opening slots the player left
  // empty. Positions are spread out — each pick keeps clear of already-placed
  // player units, so an auto-placed unit is never stacked on or directly under
  // one the player set down. Positions come from the sim RNG (deterministic).
  private autoFillPlayerDeployment(): void {
    if (this.state.phase !== "deployment") return;
    while (
      this.countActive("player") < this.state.activeCaps.player &&
      this.deckRemaining("player") > 0
    ) {
      const card = this.nextCard("player");
      if (!card) break;
      this.deploy("player", card, this.pickSpreadPlayerPos(getUnitDef(card)));
    }
  }

  // -- Descent march-in / Regroup ---------------------------------------------

  /** Field the warband on the previous floor's marks (the descent march-in).
   *  Marks apply in order (fixing uid assignment); a mark whose defId has no
   *  undeployed deck card is skipped — deploy() would otherwise field a free
   *  unit, since it pushes the unit before resolving the consumed index. Any
   *  card a mark didn't cover (a missing mark) is topped up spread-out, so the
   *  warband is always whole. RNG is drawn only on that fallback (seeded). */
  private applyFormation(marks: FormationMark[]): void {
    for (const mark of marks) {
      const hasCard = this.playerDeck.some(
        (d, i) => d === mark.defId && !this.playerUsed.has(i)
      );
      if (!hasCard) continue; // stray defId — ignore (ghost-unit guard)
      this.deploy("player", mark.defId, mark.pos);
    }
    // Cover any card a mark didn't place (deck-size oddity), never stranded.
    this.autoFillPlayerDeployment();
  }

  /** Release the march-in hold: the walk-in cinematic has landed the band on
   *  their marks. The next tick sees bothSidesReady() and arms the normal 3s
   *  countdown. Idempotent (a no-op if no hold is active). */
  releaseIntroHold(): void {
    this.introHold = false;
  }

  /** Whether the floor is frozen under the march-in hold (the walk-in is playing). */
  isIntroHeld(): boolean {
    return this.introHold;
  }

  /** Whether the player may scrap the auto-line-up and place manually — only
   *  while a fielded formation is still in the deployment phase (never in arena/
   *  endless/treasure rooms, which don't set formationApplied). */
  canRegroup(): boolean {
    return this.formationApplied && this.state.phase === "deployment";
  }

  /** Scrap the march-in line-up: clear the fielded warband, return every card to
   *  hand, and re-arm the manual placement timer. The player then deploys from
   *  scratch. One-shot — clears formationApplied, so the floor falls back to the
   *  ordinary manual flow. No RNG is consumed (a deployment tick is stateless),
   *  so regrouping at any moment yields identical state. Returns false if there's
   *  nothing to regroup. */
  regroup(): boolean {
    if (!this.canRegroup()) return false;
    this.state.units = this.state.units.filter((u) => u.team !== "player");
    this.playerUsed.clear();
    this.selectedIndex = null;
    // Scrub the formation's records so the log stays "the deploys that produced
    // this battle" — replay-honest, and the next capture reads only real marks.
    this.deployments = this.deployments.filter((d) => d.team !== "player");
    this.deployTimer = secToTicks(DEPLOY_TIME_SEC);
    this.startCountdown = -1;
    this.autoDeployCountdown = 0;
    this.introHold = false;
    this.formationApplied = false;
    return true;
  }

  /** The player's deploy-time marks this floor, for carrying to the next floor.
   *  Reads the deployments log (the marks as the player set them — NOT live unit
   *  positions, which a post-victory cinematic has since scattered). */
  getPlayerFormation(): FormationMark[] {
    return this.deployments
      .filter((d) => d.team === "player")
      .map((d) => ({ defId: d.defId, pos: { x: d.pos.x, y: d.pos.y } }));
  }

  /** Distance from (x,y) to the nearest living player unit (Infinity if none). */
  private nearestPlayerDist(x: number, y: number): number {
    let min = Infinity;
    for (const u of this.state.units) {
      if (u.team !== "player" || u.state === "dead") continue;
      const d = Math.hypot(u.pos.x - x, u.pos.y - y);
      if (d < min) min = d;
    }
    return min;
  }

  /** A deployment spot in the player zone kept well clear of existing player
   *  units (so auto-placed reinforcements never stack). Falls back to the most
   *  spread-out candidate if the zone is crowded. */
  private pickSpreadPlayerPos(def: ReturnType<typeof getUnitDef>): Vec2 {
    const rng = this.state.rng;
    const yLo = PLAYER_ZONE.top;
    const yHi = PLAYER_ZONE.bottom;
    const minSep = UNIT_RADIUS * 3;
    let best: Vec2 = { x: FIELD_WIDTH / 2, y: (yLo + yHi) / 2 };
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      const y = isMelee(def)
        ? rng.float(yLo, yLo + (yHi - yLo) * 0.6)
        : rng.float(yLo + (yHi - yLo) * 0.5, yHi);
      const x = rng.float(60, FIELD_WIDTH - 60);
      const d = this.nearestPlayerDist(x, y);
      if (d >= minSep) return { x, y };
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }

  // -- Player reserve auto-deploy --------------------------------------------
  // Safety net: if a player slot is open and there are cards in hand, give the
  // player a short grace window to place a unit manually. If they don't, the
  // engine deploys the selected (or first) reserve automatically so a death
  // never causes an instant loss or a stalled battle. Position is drawn from
  // the sim RNG to stay deterministic.
  private autoDeployPlayer(): void {
    if (this.state.phase !== "battle") return;
    if (!this.canDeploy("player")) {
      this.autoDeployCountdown = 0;
      return;
    }
    // If the board is empty, deploy promptly; otherwise wait the same shared
    // reinforcement grace the AI uses, so neither side gets a pacing edge.
    const active = this.countActive("player");
    const grace =
      active === 0 ? secToTicks(0.4) : secToTicks(REINFORCE_GRACE_SEC);

    this.autoDeployCountdown++;
    if (this.autoDeployCountdown < grace) return;

    const card = this.nextCard("player");
    if (!card) return;
    const def = getUnitDef(card);
    const rng = this.state.rng;
    const yLo = PLAYER_ZONE.top;
    const yHi = PLAYER_ZONE.bottom;
    // Melee step forward, ranged hang back near the player edge.
    const y = isMelee(def)
      ? rng.float(yLo, yLo + (yHi - yLo) * 0.6)
      : rng.float(yLo + (yHi - yLo) * 0.5, yHi);
    const x = rng.float(60, FIELD_WIDTH - 60);
    this.deploy("player", card, { x, y });
  }

  // -- AI ---------------------------------------------------------------------
  // The lifecycle half: when the AI gets a deploy window, and the pacing after
  // it takes one. HOW it thinks — matchup opinions + threat positioning — lives
  // in EnemyAI, and every random decision draws from the sim RNG there.
  runAI(): void {
    if (this.aiCooldown > 0) {
      this.aiCooldown--;
      return;
    }
    if (!this.canDeploy("enemy")) return;

    const hand: string[] = [];
    this.enemyDeck.forEach((id, i) => {
      if (!this.enemyUsed.has(i)) hand.push(id);
    });
    const playerUnits = this.state.units.filter(
      (u) => u.team === "player" && u.state !== "dead"
    );

    const plan = planEnemyDeploy(hand, playerUnits, this.state.rng);
    if (!plan) return;

    this.deploy("enemy", plan.card, plan.pos);
    // Same shared reinforcement pacing as the player's auto-deploy grace.
    this.aiCooldown = secToTicks(REINFORCE_GRACE_SEC);
  }

  // -- Boss brace -------------------------------------------------------------
  // When a boss (or the rare quest catalyst) telegraphs onto a cleared field, the
  // sim freezes and the survivors pull back into a centered row to face the
  // entrance; the fight then resumes FROM that row. The freeze is the in-battle
  // twin of the descent march-in hold: frozen ticks touch no sim state, and the
  // engine snaps everyone to a deterministic row on release, so the outcome is
  // independent of the cinematic's wall-clock length (identical headless).

  /** If a brace freeze is active, advance its failsafe and return true so the
   *  caller freezes this tick. When the failsafe elapses (headless, or a stalled
   *  cinematic) it snaps the row and returns false so combat resumes. */
  private tickBraceHold(): boolean {
    if (!this.braceHold) return false;
    if (this.braceTicks > 0) {
      this.braceTicks--;
      return true;
    }
    this.releaseBrace();
    return false;
  }

  /** Fire a brace when a boss/rare telegraph raises its banner on a cleared field
   *  with at least one living defender. Deduped per banner object (a fresh banner
   *  = a fresh brace, so a boss floor braces for the rare AND the boss). Returns
   *  true when it just froze the sim. */
  private maybeBrace(): boolean {
    const banner = this.state.waveBanner;
    if (!banner || (banner.kind !== "boss" && banner.kind !== "rare")) return false;
    if (banner === this.lastBracedBanner) return false;
    // Only when the field is clear (the telegraph window) and someone's alive to
    // hold the line — never mid-swarm.
    if (this.countActive("enemy") > 0 || this.countActive("player") === 0) return false;
    this.lastBracedBanner = banner;
    this.braceHold = true;
    this.braceTicks = secToTicks(BOSS_BRACE_FAILSAFE_SEC);
    this.computeBraceRow();
    return true;
  }

  /** Compute the deterministic row: living defenders, ordered left-to-right by
   *  their current x (uid tie-break, so it never depends on iteration order),
   *  evenly spaced and centered, at the arena's mid-line. Pure — no RNG, no clock. */
  private computeBraceRow(): void {
    const living = this.state.units
      .filter((u) => u.team === "player" && u.state !== "dead")
      .sort((a, b) =>
        a.pos.x !== b.pos.x ? a.pos.x - b.pos.x : a.uid < b.uid ? -1 : 1
      );
    const targets = new Map<string, Vec2>();
    const n = living.length;
    if (n > 0) {
      const spacing = Math.min(UNIT_RADIUS * 2.4, (FIELD_WIDTH - 80) / Math.max(1, n - 1));
      const y = FIELD_HEIGHT * BOSS_BRACE_ROW_Y_FRAC;
      const startX = FIELD_WIDTH / 2 - ((n - 1) * spacing) / 2;
      living.forEach((u, i) => {
        const x = Math.max(40, Math.min(FIELD_WIDTH - 40, startX + i * spacing));
        targets.set(u.uid, { x, y });
      });
    }
    this.braceTargets = targets;
  }

  /** Snap the survivors onto their row slots (deterministic endpoint — overrides
   *  wherever a client cinematic's lerp left them), face them toward the entrance
   *  lane, and idle their pose so combat resumes cleanly. */
  private applyBraceRow(): void {
    if (this.braceTargets) {
      for (const u of this.state.units) {
        if (u.team !== "player" || u.state === "dead") continue;
        const t = this.braceTargets.get(u.uid);
        if (!t) continue;
        u.pos.x = t.x;
        u.pos.y = t.y;
        u.facing = u.pos.x < FIELD_WIDTH / 2 ? 1 : -1;
        u.state = "idle";
        u.animState = "idle";
        u.animTime = 0;
      }
    }
    this.braceTargets = null;
  }

  /** Is the sim frozen for the brace right now (drives the client cinematic)? */
  isBraceHeld(): boolean {
    return this.braceHold;
  }

  /** The row slots to lerp toward (uid → spot), for the client brace cinematic. */
  braceRowTargets(): { uid: string; pos: Vec2 }[] {
    if (!this.braceTargets) return [];
    return [...this.braceTargets.entries()].map(([uid, pos]) => ({
      uid,
      pos: { x: pos.x, y: pos.y },
    }));
  }

  /** End the brace freeze: snap the survivors to their exact row and resume combat.
   *  Called by the client when the cinematic lands; idempotent. */
  releaseBrace(): void {
    if (!this.braceHold) return;
    this.applyBraceRow();
    this.braceHold = false;
    this.braceTicks = 0;
  }

  /** Advance one simulation tick (after deployment phase begins). */
  tick(): void {
    // Treasure room: no combat. The warband is already fielded and the outro
    // cinematic (client-side) owns the scene — never step or resolve the sim.
    if (this.isTreasureRoom) return;
    if (this.state.phase === "deployment") {
      // Descent march-in: the warband is fielded on its marks but the floor is
      // frozen until the walk-in cinematic lands them and releases the hold.
      // Nothing below runs, so the clock/RNG/countdown are all untouched.
      if (this.introHold) return;
      // Arena's AI places its opening hand; the Depths horde only arrives once
      // the battle starts (nothing to do here in depths — its deck is empty).
      this.runAI();
      // Placement timer: while it runs the player sets units down manually; when
      // it expires, auto-place whatever's left (spread out, never stacked).
      if (this.deployTimer > 0) this.deployTimer--;
      if (this.deployTimer <= 0) this.autoFillPlayerDeployment();
      // Start only when both sides have their full 2-unit opening down. Once
      // they do, run a 3-second countdown, then begin the battle.
      if (this.bothSidesReady()) {
        if (this.startCountdown < 0) {
          this.startCountdown = secToTicks(3);
        } else if (this.startCountdown === 0) {
          this.state.phase = "battle";
          // Opening ability grace: units hold casts for the first few seconds of
          // combat (they still move + basic-attack). Lapses once, so mid-battle
          // reinforcements — which arrive later — cast immediately.
          this.state.castGraceTicks = secToTicks(OPENING_CAST_GRACE_SEC);
        } else {
          this.startCountdown--;
        }
      }
      return;
    }
    if (this.state.phase === "battle") {
      if (this.mode === "endless") {
        // Survival: between waves the run FREEZES for a boon pick — no spawns, no
        // sim step, no clock decrement (the whole run is then a pure function of
        // seed + deployments + pick indices, immune to human decision time).
        if (this.endless!.inIntermission) {
          this.state.playerReserves = 0;
          this.state.enemyReserves = this.endless!.reservesSentinel;
          return;
        }
        if (this.tickBraceHold()) return; // frozen: survivors bracing for a boss
        this.endless!.step(this.state);
        if (this.maybeBrace()) return; // boss/rare wave telegraphed → brace up
        // Whole warband is fielded once and deaths are final — no reserves.
        this.state.playerReserves = 0;
        this.state.enemyReserves = this.endless!.reservesSentinel;
        // Wave clock ran out → the run is over. Intercept BEFORE stepSimulation so
        // the timeout never reaches evaluateOutcome's survivor comparison (which
        // could otherwise call an endless run a "victory").
        if (this.state.clockTicks <= 1) {
          this.state.phase = "defeat";
          return;
        }
        stepSimulation(this.state);
        return;
      }
      if (this.mode === "depths") {
        if (this.tickBraceHold()) return; // frozen: survivors bracing for a boss
        // The horde: the WaveController trickles the floor's queue in from the
        // top edge whenever the enemy side has room. Its queue doubles as the
        // enemy reserve count, so clearing the board only wins once the whole
        // wave is spent.
        this.wave!.step(this.state);
        if (this.maybeBrace()) return; // boss/rare telegraphed on a cleared field
        this.autoDeployPlayer();
        this.state.playerReserves = this.deckRemaining("player");
        this.state.enemyReserves = this.wave!.remaining;
        stepSimulation(this.state);
        return;
      }
      // Arena: keep refilling slots mid-battle as units die.
      this.runAI();
      this.autoDeployPlayer();
      // Tell the simulation how many reserves each side still has so it doesn't
      // declare a loss while cards remain to deploy.
      this.state.playerReserves = this.deckRemaining("player");
      this.state.enemyReserves = this.deckRemaining("enemy");
      stepSimulation(this.state);
    }
  }

  /** Endless: apply the boon at `offerIndex` from the current intermission offer.
   *  Returns false (no-op) outside endless or when not in an intermission — the
   *  same idempotent-input discipline as `deploy`. Records the index for replay. */
  pickBoon(offerIndex: number): boolean {
    if (this.mode !== "endless" || !this.endless) return false;
    const ok = this.endless.pickBoon(this.state, offerIndex);
    if (ok) this.pickIndices.push(offerIndex);
    return ok;
  }

  /** Endless: retire at an intermission — end the run voluntarily, banking the
   *  reward for every wave already cleared. Only legal while the run is frozen
   *  between waves (mid-wave a wipe pays the same). Resolves as "defeat" (the
   *  endless end-of-run phase; rewards pay per wave cleared either way — the UI
   *  frames a retirement as a completed run, not a loss). */
  retireEndless(): boolean {
    if (this.mode !== "endless" || !this.endless?.inIntermission) return false;
    this.state.phase = "defeat";
    return true;
  }

  /** Endless read-model for the UI (wave number, live intermission offers, boon
   *  tally), or null outside endless. */
  endlessStatus(): EndlessStatus | null {
    return this.endless ? this.endless.status() : null;
  }

  /** Waves fully cleared this run (the endless score), 0 outside endless. */
  wavesSurvived(): number {
    return this.endless ? this.endless.wavesSurvived : 0;
  }

  /** Endless compendium ledger (seen/slain), or null outside endless — the
   *  controller keeps it because corpse pruning empties the live unit list. */
  endlessLedger(): { seen: string[]; slain: string[] } | null {
    return this.endless ? this.endless.ledger() : null;
  }

  snapshot() {
    return snapshot(this.state);
  }

  getReplay(): ReplayData {
    return {
      seed: this.seed,
      deployments: this.deployments.slice(),
      playerDeck: this.playerDeck.slice(),
      enemyDeck: this.enemyDeck.slice(),
      picks: this.pickIndices.slice(),
      unitLevels: { ...this.unitLevels },
      itemLoadouts: structuredClone(this.itemLoadouts),
      slayerBonuses: { ...this.slayerBonuses },
    };
  }
}
