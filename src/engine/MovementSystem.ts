// ============================================================================
// MovementSystem
// Moves units toward their target until in attack range, resolves collisions
// (no overlap), and enforces the melee surround cap (max 3 attackers around a
// target) by parking overflow attackers at a queue distance.
//
// Deterministic: processes units in a fixed order, no randomness.
// ============================================================================

import type { Team, Unit } from "@/types";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_MELEE_SURROUND,
  SEC_PER_TICK,
} from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { isStealthed, moveSpeedMultiplier } from "./StatusEffectSystem";
import type { TeamMods } from "./CombatSystem";

// Overlap (px) left uncorrected by collision resolution, so units at rest in a
// crowd don't get shoved a sub-pixel amount every tick (which looked like jitter).
const COLLISION_SLOP = 1.5;

/** Count how many enemies are already in melee contact with `target`. */
function meleeAttackerCount(
  target: Unit,
  units: Unit[],
  excludeUid: string
): number {
  let count = 0;
  const contact = target.radius * 2 + 6;
  for (const u of units) {
    if (u.uid === excludeUid) continue;
    if (u.state === "dead" || u.team === target.team) continue;
    if (dist(u.pos, target.pos) <= contact) count++;
  }
  return count;
}

/** Resolve overlap between all living units by pushing them apart. */
function resolveCollisions(units: Unit[]): void {
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.state === "dead") continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.state === "dead") continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const minDist = a.radius + b.radius;
      let d = Math.hypot(dx, dy);
      if (d === 0) {
        // Deterministic nudge based on uid ordering.
        b.pos.x += 0.5;
        d = 0.5;
      }
      // Ignore tiny overlaps (slop) so units settled in a crowd aren't shoved a
      // fraction of a pixel every tick — that micro-correction read as jitter.
      const penetration = minDist - d;
      if (penetration > COLLISION_SLOP) {
        const overlap = penetration / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.pos.x -= nx * overlap;
        a.pos.y -= ny * overlap;
        b.pos.x += nx * overlap;
        b.pos.y += ny * overlap;
      }
    }
  }
  // Keep everyone inside the field.
  for (const u of units) {
    u.pos.x = clamp(u.pos.x, u.radius, FIELD_WIDTH - u.radius);
    u.pos.y = clamp(u.pos.y, u.radius, FIELD_HEIGHT - u.radius);
  }
}

export interface MovementContext {
  units: Unit[];
  unitsByUid: Map<string, Unit>;
  /** Per-team move-speed mods (Endless boons). Identity/undefined = no change. */
  teamMods?: { player: TeamMods; enemy: TeamMods };
}

/** Team move-speed multiplier for a unit (1 when no mods are supplied). */
function teamMoveMult(
  team: Team,
  teamMods: MovementContext["teamMods"]
): number {
  return teamMods ? teamMods[team].moveSpeedMult : 1;
}

/** Equipment move-speed multiplier (Wanderer's Cloak) — 1 for unequipped
 *  units, so itemless sims stay byte-identical. */
function itemMoveMult(unit: Unit): number {
  return unit.itemMods?.moveSpeedMult ?? 1;
}

/**
 * Advance movement for one tick. A unit moves only if it is in the `moving`
 * state (the CombatSystem decides state each tick before this runs).
 */
export function stepMovement(ctx: MovementContext): void {
  const { units, unitsByUid, teamMods } = ctx;

  for (const unit of units) {
    // An Orc mid-charge has its movement driven by CombatSystem (stepCharge);
    // skip it here so the dash isn't applied twice in one tick.
    if (unit.chargeTicks > 0) continue;

    // --- Homing blob: ooze toward a fixed anchor, ignoring combat ----------
    // A Slime Knight split blob (homeAnchor set, no target) races back to the
    // corpse to reincarnate the knight; its arrival is resolved in the kit's
    // onTick. It idles out of the combat loop each tick (no target), so this runs
    // ahead of the normal moving-state gate below. Stunned/dead blobs hold — the
    // combat loop parks them in those states, which this branch declines to move.
    if (
      unit.homeAnchor &&
      (unit.state === "idle" || unit.state === "moving")
    ) {
      const home = unit.homeAnchor;
      const homeSpeed =
        unit.moveSpeed *
        moveSpeedMultiplier(unit) *
        teamMoveMult(unit.team, teamMods) *
        itemMoveMult(unit) *
        SEC_PER_TICK;
      if (dist(unit.pos, home) > 4) {
        const v = dir(unit.pos, home);
        unit.pos.x += v.x * homeSpeed;
        unit.pos.y += v.y * homeSpeed;
        unit.facing = v.x >= 0 ? 1 : -1;
      }
      continue;
    }

    // Movement runs in the moving state. Ranged units are also allowed to
    // reposition while attacking, so they can kite-and-shoot rather than stand
    // and trade. Stunned / casting / dead never move.
    const ranged = unit.range > 80;
    const canMove =
      unit.state === "moving" || (ranged && unit.state === "attacking");
    if (!canMove) continue;

    const speed =
      unit.moveSpeed *
      moveSpeedMultiplier(unit) *
      teamMoveMult(unit.team, teamMods) *
      itemMoveMult(unit) *
      SEC_PER_TICK;

    // --- Fear: flee from the source of terror -----------------------------
    const fearEffect = unit.effects.find((e) => e.type === "fear");
    if (fearEffect) {
      const fearSource = unitsByUid.get(fearEffect.source);
      if (fearSource) {
        const away = dir(fearSource.pos, unit.pos);
        unit.pos.x += away.x * speed;
        unit.pos.y += away.y * speed;
        unit.facing = away.x >= 0 ? 1 : -1;
      }
      continue; // feared units do nothing but run
    }

    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") continue;

    const d = dist(unit.pos, target.pos);
    const stopDist = unit.range + unit.radius * 0.5;

    const isMeleeRange = unit.range <= 80;

    // --- Ranged kiting ----------------------------------------------------
    // A ranged unit wants to keep its distance. If any enemy gets closer than
    // its comfort band, it steps directly away (while still in firing range),
    // instead of standing still and trading blows. This is what makes archers
    // and casters behave like skirmishers rather than melee.
    if (!isMeleeRange) {
      const comfort = unit.range * 0.7;
      // Find the nearest enemy (the immediate threat), not just the target.
      let nearest: Unit | null = null;
      let nd = Infinity;
      for (const e of units) {
        if (e.state === "dead" || e.team === unit.team) continue;
        if (isStealthed(e)) continue; // can't kite away from what you can't see
        const ed = dist(unit.pos, e.pos);
        if (ed < nd) {
          nd = ed;
          nearest = e;
        }
      }
      if (nearest && nd < comfort) {
        // Base retreat: directly away from the threat.
        const away = dir(nearest.pos, unit.pos);
        let mx = away.x;
        let my = away.y;

        // Corner/wall escape: if backing away would press us into an edge, add
        // a sideways (tangential) component toward whichever direction has more
        // open room, so the unit slides along the wall instead of wedging in.
        const margin = unit.radius + 36; // how close to an edge counts as "near"
        const nearLeft = unit.pos.x < margin;
        const nearRight = unit.pos.x > FIELD_WIDTH - margin;
        const nearTop = unit.pos.y < margin;
        const nearBottom = unit.pos.y > FIELD_HEIGHT - margin;

        // Perpendicular to the threat direction (two candidate slide axes).
        const perpX = -away.y;
        const perpY = away.x;

        if (nearLeft || nearRight || nearTop || nearBottom) {
          // Pick the perpendicular sign that points toward open space (field center).
          const toCenterX = FIELD_WIDTH / 2 - unit.pos.x;
          const toCenterY = FIELD_HEIGHT / 2 - unit.pos.y;
          const sign =
            perpX * toCenterX + perpY * toCenterY >= 0 ? 1 : -1;
          // Blend: mostly slide along the wall, a little still away from threat.
          mx = away.x * 0.35 + perpX * sign * 1.0;
          my = away.y * 0.35 + perpY * sign * 1.0;

          // If jammed hard into a horizontal edge, force vertical escape, and
          // vice-versa, so we never keep pushing straight into the wall.
          if (nearLeft || nearRight) {
            mx = (nearLeft ? 1 : -1) * 0.3 + mx * 0.2;
            my = Math.sign(my || (toCenterY >= 0 ? 1 : -1)) * 1.0;
          }
          if (nearTop || nearBottom) {
            my = (nearTop ? 1 : -1) * 0.3 + my * 0.2;
            mx = Math.sign(mx || (toCenterX >= 0 ? 1 : -1)) * 1.0;
          }
        }

        // Normalize the move vector and step.
        const len = Math.hypot(mx, my) || 1;
        unit.pos.x += (mx / len) * speed;
        unit.pos.y += (my / len) * speed;
        unit.facing = target.pos.x >= unit.pos.x ? 1 : -1;
        continue; // handled this unit's movement
      }
    }

    // Melee: stop just outside body contact (both radii) rather than exactly on
    // the collision boundary, where the per-tick push-apart would jitter the
    // unit. Still well within attack reach (range + radius). Overflow attackers
    // hold farther back at a queue ring.
    let desiredStop = stopDist;
    if (isMeleeRange) {
      desiredStop = target.radius + unit.radius + 8;
      const attackers = meleeAttackerCount(target, units, unit.uid);
      if (attackers >= MAX_MELEE_SURROUND) {
        desiredStop = target.radius + unit.radius + 28; // wait in line
      }
    }

    // Advance toward target only when actively in the moving state. (A ranged
    // unit in the attacking state reaches here only when not threatened, and
    // should hold position rather than walk into melee.)
    if (unit.state === "moving" && d > desiredStop) {
      const v = dir(unit.pos, target.pos);
      unit.pos.x += v.x * speed;
      unit.pos.y += v.y * speed;
      unit.facing = v.x >= 0 ? 1 : -1;
    }
  }

  resolveCollisions(units);
}
