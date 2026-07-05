// ============================================================================
// TargetingSystem
// Target priority — always favour something we can actually hit right now, so a
// unit never gets stuck chasing an unreachable target while ignoring closer ones:
//   0. Taunt (forced)
//   1. Enemy attacking me, IF it's in range
//   2. Lowest-HP enemy within range
//   3. Enemy attacking me, out of range (move to retaliate)
//   4. Nearest enemy (move to engage)
// Units re-acquire when their target dies or vanishes; if it merely drifts out
// of range they only switch when another enemy is in range, else they commit to
// chasing it (so they don't flip-flop between two equally-far targets).
// Pure & deterministic: ties broken by uid ordering, never by Math.random.
// ============================================================================

import type { Unit } from "@/types";
import { distSq } from "@/utils/math";

function alive(u: Unit | undefined): u is Unit {
  return !!u && u.state !== "dead";
}

/** A unit can be targeted if it's alive and not stealthed (untargetable). */
function targetable(u: Unit | undefined): u is Unit {
  return alive(u) && !u.effects.some((e) => e.type === "stealth");
}

export function acquireTarget(
  unit: Unit,
  unitsByUid: Map<string, Unit>,
  enemies: Unit[]
): string | null {
  const living = enemies.filter(targetable);
  if (living.length === 0) return null;

  const rangeSq = (unit.range + unit.radius) * (unit.range + unit.radius);
  const inRange = (e: Unit) => distSq(unit.pos, e.pos) <= rangeSq;

  // (0) Taunt overrides everything: if taunted by a living, visible enemy, the
  // unit is forced to attack the taunter until the taunt expires.
  if (unit.tauntedByUid && unit.effects.some((e) => e.type === "taunt")) {
    const taunter = unitsByUid.get(unit.tauntedByUid);
    if (targetable(taunter) && taunter.team !== unit.team) {
      return taunter.uid;
    }
  }

  const aggressor = unit.attackedByUid
    ? unitsByUid.get(unit.attackedByUid)
    : undefined;
  const aggressorValid =
    targetable(aggressor) && aggressor.team !== unit.team;

  // (1) Whoever is attacking me — but only if I can actually hit them now, so an
  // out-of-range attacker can't pull me off an enemy I could be shooting.
  if (aggressorValid && inRange(aggressor)) return aggressor.uid;

  // (2) Lowest-HP enemy within range.
  let bestInRange: Unit | null = null;
  for (const e of living) {
    if (inRange(e)) {
      if (
        !bestInRange ||
        e.hp < bestInRange.hp ||
        (e.hp === bestInRange.hp && e.uid < bestInRange.uid)
      ) {
        bestInRange = e;
      }
    }
  }
  if (bestInRange) return bestInRange.uid;

  // (3) Nothing in range: move to retaliate against my attacker if I have one.
  if (aggressorValid) return aggressor.uid;

  // (4) Otherwise close on the nearest enemy.
  let nearest: Unit | null = null;
  let nearestD = Infinity;
  for (const e of living) {
    const d = distSq(unit.pos, e.pos);
    if (d < nearestD || (d === nearestD && nearest && e.uid < nearest.uid)) {
      nearestD = d;
      nearest = e;
    }
  }
  return nearest ? nearest.uid : null;
}

/** Validate or refresh a unit's current target. */
export function updateTarget(
  unit: Unit,
  unitsByUid: Map<string, Unit>,
  enemies: Unit[]
): void {
  // A homing unit (a Slime Knight split blob oozing back to the corpse) ignores
  // combat entirely — it never picks a fight, it just races home. Clearing the
  // target here means it also never enters attack range logic downstream.
  if (unit.homeAnchor) {
    unit.targetUid = null;
    return;
  }

  const current = unit.targetUid ? unitsByUid.get(unit.targetUid) : undefined;
  const rangeSq = (unit.range + unit.radius) * (unit.range + unit.radius);

  // Taunt forces the target regardless of current lock (highest priority).
  if (unit.tauntedByUid && unit.effects.some((e) => e.type === "taunt")) {
    const taunter = unitsByUid.get(unit.tauntedByUid);
    if (targetable(taunter) && taunter.team !== unit.team) {
      unit.targetUid = taunter.uid;
      return;
    }
  }

  // Re-acquire if the current target is dead OR has gone stealthed (invisible).
  if (!targetable(current)) {
    unit.targetUid = acquireTarget(unit, unitsByUid, enemies);
    return;
  }

  // If the current target has drifted out of attack range, only switch off it
  // when another enemy is actually in range to switch to. With nothing in range
  // we commit to closing on the current target — re-acquiring every tick made a
  // unit flip between two equally-far targets each time one of them landed a hit
  // (e.g. a slow Ogre stuck shuffling between two kiting ranged units) instead
  // of picking one and chasing it down.
  if (distSq(unit.pos, current.pos) > rangeSq) {
    const someoneInRange = enemies.some(
      (e) => targetable(e) && distSq(unit.pos, e.pos) <= rangeSq
    );
    if (someoneInRange) {
      unit.targetUid = acquireTarget(unit, unitsByUid, enemies);
    }
    return;
  }

  // Current target is in range. Only switch to a fresh attacker if it's also in
  // range — never abandon an enemy we're hitting to chase an out-of-range one.
  if (unit.attackedByUid && unit.attackedByUid !== unit.targetUid) {
    const aggressor = unitsByUid.get(unit.attackedByUid);
    if (
      targetable(aggressor) &&
      aggressor.team !== unit.team &&
      distSq(unit.pos, aggressor.pos) <= rangeSq
    ) {
      unit.targetUid = aggressor.uid;
    }
  }
}
