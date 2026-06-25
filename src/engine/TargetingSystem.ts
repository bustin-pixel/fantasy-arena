// ============================================================================
// TargetingSystem
// Target priority (per spec):
//   1. Enemy currently attacking me
//   2. Lowest-HP enemy within range
//   3. Nearest enemy (anywhere)
// Units re-acquire automatically when their target dies or goes invalid.
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

  // (0) Taunt overrides everything: if taunted by a living, visible enemy, the
  // unit is forced to attack the taunter until the taunt expires.
  if (unit.tauntedByUid && unit.effects.some((e) => e.type === "taunt")) {
    const taunter = unitsByUid.get(unit.tauntedByUid);
    if (targetable(taunter) && taunter.team !== unit.team) {
      return taunter.uid;
    }
  }

  // (1) Whoever is attacking me, if still alive and visible.
  if (unit.attackedByUid) {
    const aggressor = unitsByUid.get(unit.attackedByUid);
    if (targetable(aggressor) && aggressor.team !== unit.team) {
      return aggressor.uid;
    }
  }

  const rangeSq = (unit.range + unit.radius) * (unit.range + unit.radius);

  // (2) Lowest-HP enemy within range.
  let bestInRange: Unit | null = null;
  for (const e of living) {
    if (distSq(unit.pos, e.pos) <= rangeSq) {
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

  // (3) Nearest enemy overall.
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
  const current = unit.targetUid ? unitsByUid.get(unit.targetUid) : undefined;

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
  // Always allow priority (1) to override: if someone started hitting me,
  // and I'm not already locked onto them, re-evaluate.
  if (unit.attackedByUid && unit.attackedByUid !== unit.targetUid) {
    const aggressor = unitsByUid.get(unit.attackedByUid);
    if (targetable(aggressor) && aggressor.team !== unit.team) {
      unit.targetUid = aggressor.uid;
    }
  }
}
