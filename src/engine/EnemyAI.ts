// ============================================================================
// Enemy tactical AI — how the enemy THINKS, separated from what phase the match
// is in. MatchController owns the lifecycle (timers, phases, deploy) and calls
// planEnemyDeploy once per AI window; everything about matchup opinions and
// threat positioning lives here.
//
// AIDeck.ts already owns deck GENERATION (which cards the enemy brings). This
// owns in-match tactics (which card to play now, and where to put it).
//
// DETERMINISM: every random decision draws from the seeded sim RNG passed in —
// never Math.random(). The DRAW ORDER is part of the simulation and feeds
// replays: choose-the-card draws first (tie-breaks), then positioning draws.
// Changing the number or order of draws here re-rolls every existing seed.
// ============================================================================

import type { Unit, Vec2 } from "@/types";
import type { RNG } from "@/utils/rng";
import { isMelee, getUnitDef } from "@/data/units";
import { getKit } from "./kits/UnitKit";
import { ENEMY_ZONE, FIELD_WIDTH } from "@/utils/constants";

type RoleClass = "melee" | "ranged" | "support" | "assassin";

/** A unit's tactical class — a FACT about the unit, which is why it lives on
 *  the kit (ADR-0001 Q6). The AI's matchup *opinions* stay in this module. The
 *  geometric fallback is a safety net for any kit-less unit. */
function unitRoleClass(def: ReturnType<typeof getUnitDef>): RoleClass {
  return getKit(def.id)?.roleClass ?? (isMelee(def) ? "melee" : "ranged");
}

function clampX(x: number): number {
  return Math.max(60, Math.min(FIELD_WIDTH - 60, x));
}

function avgX(units: { pos: { x: number } }[]): number {
  if (!units.length) return FIELD_WIDTH / 2;
  return units.reduce((s, u) => s + u.pos.x, 0) / units.length;
}

function nearestTo(
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
function lowestThreat(units: { pos: { y: number; x: number } }[]) {
  let best: (typeof units)[number] | null = null;
  for (const u of units) {
    if (!best || u.pos.y > best.pos.y) best = u;
  }
  return best;
}

/**
 * Choose the enemy card that best answers the player's board. Heuristic:
 * - if the player fields ranged/casters, prefer an assassin or fast melee to
 *   dive them;
 * - if the player fields heavy tanks, prefer casters/ranged DPS;
 * - otherwise fall back to the first card in hand.
 * Deterministic tie-breaks via the sim RNG.
 */
export function chooseEnemyCard(
  hand: readonly string[],
  playerUnits: readonly Unit[],
  rng: RNG
): string | null {
  if (hand.length === 0) return null;
  if (hand.length === 1) return hand[0];
  if (playerUnits.length === 0) return hand[0];

  const playerDefs = playerUnits.map((u) => getUnitDef(u.defId));
  const playerHasRanged = playerDefs.some(
    (d) => !isMelee(d) && d.ability !== "mend"
  );
  const playerHasTank = playerDefs.some((d) => d.hp >= 200);

  const score = (id: string): number => {
    const def = getUnitDef(id);
    const role = unitRoleClass(def);
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
    if (s > bestScore || (s === bestScore && rng.next() < 0.5)) {
      best = id;
      bestScore = s;
    }
  }
  return best;
}

/** Where to put `def`: ranged/support hang back and line up with the player's
 *  cluster, assassins flank the backline-most unit, melee/tanks push toward the
 *  nearest threat. */
export function pickEnemyPos(
  def: ReturnType<typeof getUnitDef>,
  playerUnits: readonly Unit[],
  rng: RNG
): Vec2 {
  const yLo = ENEMY_ZONE.top;
  const yHi = ENEMY_ZONE.bottom;
  const role = unitRoleClass(def);

  if (role === "ranged" || role === "support") {
    // Stay at the back edge.
    const y = rng.float(yLo, yLo + (yHi - yLo) * 0.35);
    // Line up roughly with the player's strongest cluster, else center.
    const x = playerUnits.length
      ? clampX(avgX(playerUnits as Unit[]) + rng.float(-50, 50))
      : rng.float(80, FIELD_WIDTH - 80);
    return { x, y };
  }
  if (role === "assassin") {
    // Flank toward the player's backline-most (highest-y) unit.
    const prey = lowestThreat(playerUnits as Unit[]);
    const y = rng.float(yLo + (yHi - yLo) * 0.5, yHi);
    const x = prey
      ? clampX(prey.pos.x + rng.float(-30, 30))
      : rng.float(60, FIELD_WIDTH - 60);
    return { x, y };
  }
  // Melee/tank: push forward toward the nearest player threat.
  const threat = nearestTo(playerUnits as Unit[], FIELD_WIDTH / 2, yHi);
  const y = rng.float(yLo + (yHi - yLo) * 0.45, yHi);
  const x = threat
    ? clampX(threat.pos.x + rng.float(-40, 40))
    : rng.float(60, FIELD_WIDTH - 60);
  return { x, y };
}

export interface EnemyDeployPlan {
  card: string;
  pos: Vec2;
}

/** The AI's whole decision for one deploy window: board + hand + rng in, a
 *  deploy decision out (or null when the hand is spent). RNG draw order —
 *  card choice, then positioning — matches the pre-extraction code exactly. */
export function planEnemyDeploy(
  hand: readonly string[],
  playerUnits: readonly Unit[],
  rng: RNG
): EnemyDeployPlan | null {
  const card = chooseEnemyCard(hand, playerUnits, rng);
  if (!card) return null;
  return { card, pos: pickEnemyPos(getUnitDef(card), playerUnits, rng) };
}
