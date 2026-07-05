// Bloater & Bloatling — the floor-5 Depths boss, now a Slime-style splitter.
//   Putrid Burst — on death it ruptures, dealing AoE damage to every enemy in a
//                  radius and leaving a lingering poison cloud on each (onDeath).
//                  A unit only dies once, so the burst is one-shot and chain kills
//                  are safe. Its `lifesteal` ability slot is passive filler — the
//                  Bloater never casts.
//   Sloughing Mass — the boss spawns a Bloatling each time its HP crosses a 25%
//                  threshold (up to 3), exactly the Slime's split mechanic.
//                  Bloatlings are terminal (never split) but rupture weaker.
import type { UnitKit, KitCtx } from "./UnitKit";
import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const CLOUD_RADIUS = 110;

// Rupture shared by the boss and its spawn: AoE damage + poison cloud.
// Iterating ctx.enemies (the death-moment live snapshot in unit order) with the
// dead-skip matches the old state.units scan exactly, and the skip also guards
// the poison from landing on a foe killed mid-burst.
function putridBurst(
  unit: Unit,
  ctx: KitCtx,
  damage: number,
  poisonSec: number,
  poisonTick: number
): void {
  for (const e of ctx.enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= CLOUD_RADIUS) {
      ctx.dealDamage(e, damage, unit);
      applyEffect(
        e,
        makeEffect("poison", {
          source: unit.uid,
          durationSec: poisonSec,
          damagePerTick: poisonTick,
          tickIntervalSec: 0.5,
        })
      );
    }
  }
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.6),
    maxLife: secToTicks(0.6),
    color: getUnitDef(unit.defId).accent,
  });
}

export const bloaterKit: UnitKit = {
  roleClass: "melee",

  // Sloughing Mass: spawn a Bloatling each time HP crosses a 25% threshold (at
  // 75/50/25% remaining → up to 3). Same shape as the Slime's split: fires
  // post-hit on a surviving boss (the onDamaged seam already gates hp > 0), and
  // the spawn routes through the same-tick damageSpawns queue.
  onDamaged(unit, _amount, _source, ctx) {
    const thresholdsCrossed = Math.floor((1 - unit.hp / unit.maxHp) / 0.25);
    const wantSplits = Math.min(3, thresholdsCrossed);
    while (unit.splitsSpawned < wantSplits) {
      unit.splitsSpawned++;
      const side = unit.splitsSpawned % 2 === 0 ? 1 : -1;
      ctx.spawnUnit("bloatling", unit.team, {
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
    putridBurst(unit, ctx, 30, 4, 4);
  },
};

// Bloatling: terminal — never splits, but still ruptures (weaker) on death.
export const bloatlingKit: UnitKit = {
  roleClass: "melee",

  onDeath(unit, ctx) {
    putridBurst(unit, ctx, 15, 2, 3);
  },
};
