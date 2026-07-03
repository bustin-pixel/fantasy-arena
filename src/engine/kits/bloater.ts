// Bloater (defId "bloater") — a Depths melee bruiser. One mechanic:
//   Putrid Burst — on death it ruptures, dealing AoE damage to every enemy in a
//                  radius and leaving a lingering poison cloud on each (onDeath).
//                  A unit only dies once, so the burst is one-shot and chain kills
//                  are safe. Its `lifesteal` ability slot is passive filler — the
//                  Bloater never casts.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const CLOUD_RADIUS = 110;
const CLOUD_DMG = 30;

export const bloaterKit: UnitKit = {
  roleClass: "melee",

  // Rupture on death. Iterating ctx.enemies (the death-moment live snapshot in
  // unit order) with the dead-skip matches the old state.units scan exactly, and
  // the skip also guards the poison from landing on a foe killed mid-burst.
  onDeath(unit, ctx) {
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(unit.pos, e.pos) <= CLOUD_RADIUS) {
        ctx.dealDamage(e, CLOUD_DMG, unit);
        applyEffect(
          e,
          makeEffect("poison", {
            source: unit.uid,
            durationSec: 4,
            damagePerTick: 4,
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
  },
};
