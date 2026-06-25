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
  ENEMY_ZONE,
  FIELD_WIDTH,
  MATCH_TIME_SEC,
  MAX_ACTIVE_UNITS_PER_SIDE,
  PLAYER_ZONE,
  TICK_RATE,
  secToTicks,
} from "@/utils/constants";
import { createUnit, resetUidCounter } from "@/entities/createUnit";
import {
  createSimState,
  snapshot,
  stepSimulation,
  type SimState,
} from "./CombatSystem";
import { applyEffect, makeEffect } from "./StatusEffectSystem";
import { isMelee, getUnitDef } from "@/data/units";

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
  /** Ticks of player inactivity in deployment before we auto-place their opener. */
  private deployAutoFillCountdown = 0;
  /** Ticks an empty player slot waits before the engine auto-deploys a reserve. */
  private autoDeployCountdown = 0;
  readonly seed: number;

  constructor(seed: number, playerDeck: string[], enemyDeck: string[]) {
    this.seed = seed;
    this.playerDeck = playerDeck;
    this.enemyDeck = enemyDeck;
    resetUidCounter();
    this.state = createSimState(seed, MATCH_TIME_SEC);
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
      this.countActive(team) < MAX_ACTIVE_UNITS_PER_SIDE &&
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

    // Assassin Ambush: enters the field stealthed (untargetable) until its first
    // strike. Deploy is the only path onto the field, so apply opening stealth here.
    if (unit.ability === "ambush") {
      applyEffect(
        unit,
        makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
      );
    }

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
    if (team === "player") this.deployAutoFillCountdown = 0;

    this.deployments.push({
      tick: this.state.tick,
      team,
      defId,
      pos: { x: unit.pos.x, y: unit.pos.y },
    });

    return unit;
  }

  /** True once both sides have their full opening of 2 units down. */
  private bothSidesReady(): boolean {
    return (
      this.countActive("player") >= MAX_ACTIVE_UNITS_PER_SIDE &&
      this.countActive("enemy") >= MAX_ACTIVE_UNITS_PER_SIDE
    );
  }

  /** Seconds left on the pre-battle countdown, or null if it hasn't armed yet. */
  startCountdownSec(): number | null {
    if (this.startCountdown < 0) return null;
    return Math.ceil(this.startCountdown / TICK_RATE);
  }

  // -- Deployment auto-fill ---------------------------------------------------
  // Safety net so the 2v2 start condition is always reachable: if the player
  // dawdles during deployment, place their remaining opening unit(s) for them
  // after a short grace window. Positions come from the sim RNG (deterministic).
  private autoFillPlayerDeployment(): void {
    if (this.state.phase !== "deployment") return;
    if (this.countActive("player") >= MAX_ACTIVE_UNITS_PER_SIDE) return;
    if (this.deckRemaining("player") <= 0) return;

    this.deployAutoFillCountdown++;
    if (this.deployAutoFillCountdown < secToTicks(5)) return;
    this.deployAutoFillCountdown = 0;

    // Fill up to the 2-unit opening in one go.
    while (
      this.countActive("player") < MAX_ACTIVE_UNITS_PER_SIDE &&
      this.deckRemaining("player") > 0
    ) {
      const card = this.nextCard("player");
      if (!card) break;
      const def = getUnitDef(card);
      const rng = this.state.rng;
      const yLo = PLAYER_ZONE.top;
      const yHi = PLAYER_ZONE.bottom;
      const y = isMelee(def)
        ? rng.float(yLo, yLo + (yHi - yLo) * 0.6)
        : rng.float(yLo + (yHi - yLo) * 0.5, yHi);
      const x = rng.float(60, FIELD_WIDTH - 60);
      this.deploy("player", card, { x, y });
    }
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
    // Only the LAST slot triggers urgency: if the player has units on the field
    // they can choose freely. If the board is empty, deploy promptly.
    const active = this.countActive("player");
    const grace = active === 0 ? secToTicks(0.4) : secToTicks(2.5);

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
    this.aiCooldown = 14;
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
    if (def.ability === "mend") return "support";
    if (def.ability === "backstab") return "assassin";
    if (isMelee(def)) return "melee";
    return "ranged";
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
      this.runAI();
      this.autoFillPlayerDeployment();
      // Start only when both sides have their full 2-unit opening down. Once
      // they do, run a 3-second countdown, then begin the battle.
      if (this.bothSidesReady()) {
        if (this.startCountdown < 0) {
          this.startCountdown = secToTicks(3);
        } else if (this.startCountdown === 0) {
          this.state.phase = "battle";
        } else {
          this.startCountdown--;
        }
      }
      return;
    }
    if (this.state.phase === "battle") {
      // Keep refilling slots mid-battle as units die.
      this.runAI();
      this.autoDeployPlayer();
      // Tell the simulation how many reserves each side still has so it doesn't
      // declare a loss while cards remain to deploy.
      this.state.playerReserves = this.deckRemaining("player");
      this.state.enemyReserves = this.deckRemaining("enemy");
      stepSimulation(this.state);
    }
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
    };
  }
}
