// Slime & Slimeling — a splitting swarm legendary. The original Slime spawns a
// weaker clone each time its HP crosses a 25% threshold, and every slime (original
// or clone) bursts for AoE damage on death. Chain reactions are intentional and
// safe: a unit only dies (and thus bursts) once, and split clones route through
// the same-tick damageSpawns queue (ctx.spawnUnit under the damage-funnel ctx).
import type { UnitKit, KitCtx } from "./UnitKit";
import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const BURST_RADIUS = 90;

// Death burst shared by the original and its clones: AoE damage to nearby enemies.
function slimeBurst(unit: Unit, ctx: KitCtx, damage: number): void {
  for (const e of ctx.enemies) {
    if (dist(unit.pos, e.pos) <= BURST_RADIUS) ctx.dealDamage(e, damage, unit);
  }
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.45),
    maxLife: secToTicks(0.45),
    color: getUnitDef(unit.defId).accent,
  });
}

export const slimeKit: UnitKit = {
  roleClass: "melee",

  // Slime Split: spawn a weaker clone each time HP crosses a 25% threshold (at
  // 75/50/25% remaining → up to 3 clones). Fires post-hit on a surviving slime
  // (the onDamaged seam already gates target.hp > 0).
  onDamaged(unit, _amount, _source, ctx) {
    const thresholdsCrossed = Math.floor((1 - unit.hp / unit.maxHp) / 0.25);
    const wantSplits = Math.min(3, thresholdsCrossed);
    while (unit.splitsSpawned < wantSplits) {
      unit.splitsSpawned++;
      const side = unit.splitsSpawned % 2 === 0 ? 1 : -1;
      ctx.spawnUnit("slime_clone", unit.team, {
        x: unit.pos.x + side * 30,
        y: unit.pos.y + 20,
      });
      ctx.spawnVfx({
        kind: "frost",
        pos: { x: unit.pos.x, y: unit.pos.y },
        life: secToTicks(0.3),
        maxLife: secToTicks(0.3),
        color: getUnitDef(unit.defId).accent,
      });
    }
  },

  onDeath(unit, ctx) {
    slimeBurst(unit, ctx, 40);
  },
};

// Slimeling (clone): terminal — never splits, but still bursts (weaker) on death.
export const slimeCloneKit: UnitKit = {
  onDeath(unit, ctx) {
    slimeBurst(unit, ctx, 20);
  },
};
