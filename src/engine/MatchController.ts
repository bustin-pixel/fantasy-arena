// ============================================================================
// MatchController
// A thin, framework-free controller that owns one SimState and exposes the
// operations a UI (or future server) needs: deploy a unit, run the AI, advance
// a tick. It also accumulates the ReplayData (seed + deployments) — enough to
// reproduce the whole match without recording per-frame state.
// ============================================================================

import type {
  DeploymentRecord,
  MatchPhase,
  ReplayData,
  Team,
  Unit,
  Vec2,
} from "@/types";
import {
  DEPLOY_TIME_SEC,
  DEPTHS_ENEMY_ACTIVE,
  DEPTHS_MATCH_TIME_SEC,
  DEPTHS_PLAYER_ACTIVE,
  ENEMY_ZONE,
  FIELD_WIDTH,
  MATCH_TIME_SEC,
  OPENING_CAST_GRACE_SEC,
  PLAYER_ZONE,
  REINFORCE_GRACE_SEC,
  TICK_RATE,
  UNIT_RADIUS,
  secToTicks,
} from "@/utils/constants";
import { createUnit, resetUidCounter } from "@/entities/createUnit";
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
import { getDungeon } from "@/data/dungeons";
import {
  ENDLESS_ENEMY_ACTIVE,
  ENDLESS_PLAYER_ACTIVE,
  ENDLESS_WAVE_TIME_SEC,
} from "@/data/endless";

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
}

/** The match clock for a mode. Endless resets its clock per wave (a stalemate
 *  backstop), so it starts on the per-wave budget rather than a total-match one. */
function matchClockSec(mode: MatchMode): number {
  if (mode === "depths") return DEPTHS_MATCH_TIME_SEC;
  if (mode === "endless") return ENDLESS_WAVE_TIME_SEC;
  return MATCH_TIME_SEC;
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
  readonly seed: number;
  readonly mode: MatchMode;
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
    this.playerDeck = playerDeck;
    this.enemyDeck = enemyDeck;
    resetUidCounter();
    this.state = createSimState(seed, matchClockSec(this.mode));
    if (this.mode === "depths") {
      this.state.activeCaps = {
        player: DEPTHS_PLAYER_ACTIVE,
        enemy: DEPTHS_ENEMY_ACTIVE,
      };
      this.wave = new WaveController(
        seed,
        getDungeon(opts.dungeonId ?? "depths"),
        opts.floor ?? 1
      );
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
    const unit = createUnit(defId, team, {
      x: Math.max(40, Math.min(FIELD_WIDTH - 40, pos.x)),
      y: clampedY,
    });
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
  // Smarter, still fully deterministic (all randomness from the sim RNG).
  // The AI (1) picks the card from its remaining hand that best answers what the
  // player currently has on the field, and (2) positions it tactically: ranged
  // and support units hang back, melee/assassins push toward player threats.
  runAI(): void {
    if (this.aiCooldown > 0) {
      this.aiCooldown--;
      return;
    }
    if (!this.canDeploy("enemy")) return;

    const card = this.chooseEnemyCard();
    if (!card) return;
    const def = getUnitDef(card);
    const rng = this.state.rng;

    const playerUnits = this.state.units.filter(
      (u) => u.team === "player" && u.state !== "dead"
    );

    const yLo = ENEMY_ZONE.top;
    const yHi = ENEMY_ZONE.bottom;

    let x: number;
    let y: number;
    const role = this.unitRoleClass(def);

    if (role === "ranged" || role === "support") {
      // Stay at the back edge.
      y = rng.float(yLo, yLo + (yHi - yLo) * 0.35);
      // Line up roughly with the player's strongest cluster, else center.
      x = playerUnits.length
        ? this.clampX(this.avgX(playerUnits) + rng.float(-50, 50))
        : rng.float(80, FIELD_WIDTH - 80);
    } else if (role === "assassin") {
      // Flank toward the player's backline-most (highest-y) unit.
      const prey = this.lowestThreat(playerUnits);
      y = rng.float(yLo + (yHi - yLo) * 0.5, yHi);
      x = prey ? this.clampX(prey.pos.x + rng.float(-30, 30)) : rng.float(60, FIELD_WIDTH - 60);
    } else {
      // Melee/tank: push forward toward the nearest player threat.
      const threat = this.nearestTo(playerUnits, FIELD_WIDTH / 2, yHi);
      y = rng.float(yLo + (yHi - yLo) * 0.45, yHi);
      x = threat ? this.clampX(threat.pos.x + rng.float(-40, 40)) : rng.float(60, FIELD_WIDTH - 60);
    }

    this.deploy("enemy", card, { x, y });
    // Same shared reinforcement pacing as the player's auto-deploy grace.
    this.aiCooldown = secToTicks(REINFORCE_GRACE_SEC);
  }

  private clampX(x: number): number {
    return Math.max(60, Math.min(FIELD_WIDTH - 60, x));
  }
  private avgX(units: { pos: { x: number } }[]): number {
    if (!units.length) return FIELD_WIDTH / 2;
    return units.reduce((s, u) => s + u.pos.x, 0) / units.length;
  }
  private nearestTo(
    units: { pos: { x: number; y: number } }[],
    x: number,
    y: number
  ) {
    let best: (typeof units)[number] | null = null;
    let bd = Infinity;
    for (const u of units) {
      const d = (u.pos.x - x) ** 2 + (u.pos.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }
  /** The player unit furthest back (highest y) — the assassin's preferred prey. */
  private lowestThreat(units: { pos: { y: number; x: number } }[]) {
    let best: (typeof units)[number] | null = null;
    for (const u of units) {
      if (!best || u.pos.y > best.pos.y) best = u;
    }
    return best;
  }

  private unitRoleClass(def: ReturnType<typeof getUnitDef>):
    | "melee"
    | "ranged"
    | "support"
    | "assassin" {
    // Every unit declares its tactical class on its kit now (support / assassin /
    // melee / ranged). The geometric default is just a safety net for any kit-less
    // unit that ever reaches here; the AI's matchup *opinions* stay in chooseEnemyCard.
    return getKit(def.id)?.roleClass ?? (isMelee(def) ? "melee" : "ranged");
  }

  /**
   * Choose the enemy card that best answers the player's board. Heuristic:
   * - if the player fields ranged/casters, prefer an assassin or fast melee to
   *   dive them;
   * - if the player fields heavy tanks, prefer casters/ranged DPS;
   * - otherwise fall back to the first card in hand.
   * Deterministic tie-breaks via RNG drawn from sim state.
   */
  private chooseEnemyCard(): string | null {
    const hand: string[] = [];
    this.enemyDeck.forEach((id, i) => {
      if (!this.enemyUsed.has(i)) hand.push(id);
    });
    if (hand.length === 0) return null;
    if (hand.length === 1) return hand[0];

    const players = this.state.units.filter(
      (u) => u.team === "player" && u.state !== "dead"
    );
    if (players.length === 0) return hand[0];

    const playerDefs = players.map((u) => getUnitDef(u.defId));
    const playerHasRanged = playerDefs.some(
      (d) => !isMelee(d) && d.ability !== "mend"
    );
    const playerHasTank = playerDefs.some((d) => d.hp >= 200);

    const score = (id: string): number => {
      const def = getUnitDef(id);
      const role = this.unitRoleClass(def);
      let s = 0;
      if (playerHasRanged && (role === "assassin" || role === "melee")) s += 3;
      if (playerHasTank && role === "ranged") s += 2;
      if (playerHasTank && def.ability === "fireball") s += 1; // DoT vs big HP
      if (role === "support") s -= 1; // don't lead with the healer
      return s;
    };

    let best = hand[0];
    let bestScore = -Infinity;
    for (const id of hand) {
      const s = score(id);
      if (s > bestScore || (s === bestScore && this.state.rng.next() < 0.5)) {
        best = id;
        bestScore = s;
      }
    }
    return best;
  }

  /** Advance one simulation tick (after deployment phase begins). */
  tick(): void {
    if (this.state.phase === "deployment") {
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
        this.endless!.step(this.state);
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
        // The horde: the WaveController trickles the floor's queue in from the
        // top edge whenever the enemy side has room. Its queue doubles as the
        // enemy reserve count, so clearing the board only wins once the whole
        // wave is spent.
        this.wave!.step(this.state);
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

  /** Endless read-model for the UI (wave number, live intermission offers, boon
   *  tally), or null outside endless. */
  endlessStatus(): EndlessStatus | null {
    return this.endless ? this.endless.status() : null;
  }

  /** Waves fully cleared this run (the endless score), 0 outside endless. */
  wavesSurvived(): number {
    return this.endless ? this.endless.wavesSurvived : 0;
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
    };
  }
}
