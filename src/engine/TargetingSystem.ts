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
//
// Tendencies (data/tendencies.ts): a unit's fixed targeting personality
// reorders the CANDIDATE preference inside steps 2 and 4 only — taunt (0) and
// the retaliation rules (1, 3) are never overridden, so a taunt stays reliable
// protection. Absent tendency = "brawler" = the exact loops below.
// ============================================================================

import type { Unit } from "@/types";
import { distSq } from "@/utils/math";
import { getKit } from "./kits/UnitKit";
import { getUnitDef } from "@/data/units";

function alive(u: Unit | undefined): u is Unit {
  return !!u && u.state !== "dead";
}

/** A unit can be targeted if it's alive and not stealthed (untargetable). */
function targetable(u: Unit | undefined): u is Unit {
  return alive(u) && !u.effects.some((e) => e.type === "stealth");
}

/** uid ordering as the FINAL tie-break of every preference chain. */
function byUid(a: Unit, b: Unit): number {
  return a.uid < b.uid ? -1 : 1;
}

/** The preference comparator for `unit`'s tendency: negative ⇒ `a` is the
 *  better catch. Null for Brawler/absent, in which case the caller keeps
 *  today's exact selection (lowest HP in range / nearest). Candidate lookups
 *  (roleClass on the kit, school on the def) are plain map indexes; the
 *  chain always bottoms out in the uid tie-break, so ordering stays
 *  deterministic. */
function tendencyComparator(
  unit: Unit,
  unitsByUid: Map<string, Unit>
): ((a: Unit, b: Unit) => number) | null {
  switch (unit.tendency) {
    case "backline_stalker": {
      // Prefer ranged/support kits, then the longest reach, then most wounded.
      const backline = (u: Unit) => {
        const rc = getKit(u.defId)?.roleClass;
        return rc === "ranged" || rc === "support" ? 1 : 0;
      };
      return (a, b) =>
        backline(b) - backline(a) ||
        b.range - a.range ||
        a.hp - b.hp ||
        byUid(a, b);
    }
    case "executioner":
      // The most wounded enemy anywhere — step 4 ignores distance entirely.
      return (a, b) => a.hp - b.hp || byUid(a, b);
    case "bodyguard": {
      // Prefer enemies whose own target is one of MY allies, then most wounded.
      const menacing = (u: Unit) => {
        const victim = u.targetUid ? unitsByUid.get(u.targetUid) : undefined;
        return alive(victim) && victim.team === unit.team ? 1 : 0;
      };
      return (a, b) =>
        menacing(b) - menacing(a) || a.hp - b.hp || byUid(a, b);
    }
    case "spellwrath": {
      // Prefer magic-school enemies, then most wounded.
      const caster = (u: Unit) =>
        getUnitDef(u.defId).school === "magic" ? 1 : 0;
      return (a, b) => caster(b) - caster(a) || a.hp - b.hp || byUid(a, b);
    }
    case "big_game":
      // The biggest beast on the field.
      return (a, b) => b.maxHp - a.maxHp || byUid(a, b);
    case "faithbane": {
      // Healers die first. Always. (Sharper than the Backline Stalker, which
      // rates ranged and support equally — this one walks past the archer.)
      const healer = (u: Unit) =>
        getKit(u.defId)?.roleClass === "support" ? 1 : 0;
      return (a, b) => healer(b) - healer(a) || a.hp - b.hp || byUid(a, b);
    }
    case "focus_fire": {
      // Pile onto whatever the most of my living allies already fight.
      const mobbed = allyTargetCounts(unit, unitsByUid);
      const count = (u: Unit) => mobbed.get(u.uid) ?? 0;
      return (a, b) => count(b) - count(a) || a.hp - b.hp || byUid(a, b);
    }
    case "lone_wolf": {
      // Seek the foe nobody else is fighting (0 allies on it beats any mob).
      const mobbed = allyTargetCounts(unit, unitsByUid);
      const unclaimed = (u: Unit) => ((mobbed.get(u.uid) ?? 0) === 0 ? 1 : 0);
      return (a, b) =>
        unclaimed(b) - unclaimed(a) || a.hp - b.hp || byUid(a, b);
    }
    default:
      return null; // Brawler — today's exact behavior.
  }
}

/** How many of `unit`'s living allies (itself excluded) currently target each
 *  enemy, keyed by enemy uid. Built once per acquire for the pack tendencies
 *  (Focus Fire / Lone Wolf) so the comparator stays O(1) per comparison. */
function allyTargetCounts(
  unit: Unit,
  unitsByUid: Map<string, Unit>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ally of unitsByUid.values()) {
    if (ally.uid === unit.uid || ally.team !== unit.team) continue;
    if (!alive(ally) || !ally.targetUid) continue;
    counts.set(ally.targetUid, (counts.get(ally.targetUid) ?? 0) + 1);
  }
  return counts;
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

  const prefer = tendencyComparator(unit, unitsByUid);

  // (2) Lowest-HP enemy within range — or the tendency's preferred catch among
  // what's in reach (a Backline Stalker standing next to a frontliner must not
  // settle for the frontliner when the archer is also in range).
  let bestInRange: Unit | null = null;
  for (const e of living) {
    if (inRange(e)) {
      if (
        !bestInRange ||
        (prefer
          ? prefer(e, bestInRange) < 0
          : e.hp < bestInRange.hp ||
            (e.hp === bestInRange.hp && e.uid < bestInRange.uid))
      ) {
        bestInRange = e;
      }
    }
  }
  if (bestInRange) return bestInRange.uid;

  // (3) Nothing in range: move to retaliate against my attacker if I have one.
  if (aggressorValid) return aggressor.uid;

  // (4) Otherwise close on the nearest enemy — or, with a tendency, seek the
  // preferred catch anywhere on the field regardless of distance.
  if (prefer) {
    let sought: Unit | null = null;
    for (const e of living) {
      if (!sought || prefer(e, sought) < 0) sought = e;
    }
    return sought ? sought.uid : null;
  }
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
