// Warrior (defId "warrior") — a melee anti-swarm bruiser. One mechanic:
//   Whirlwind — its melee swing is a full claymore spin instead of a single hit,
//               striking EVERY enemy within reach for its damage and leaving a
//               refreshing bleed (poison-type DoT) on each. No lifesteal.
// The `whirlwind` ability slot is a passive (no active cast), so the cast pipeline
// leaves it alone; the spin fully REPLACES the default swing (onBasicAttack → true).
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

export const warriorKit: UnitKit = {
  roleClass: "melee",

  // Spin instead of a single swing: hit every live enemy in melee reach and leave
  // a bleed on each. Iterating ctx.enemies with the dead-skip matches the old
  // state.units scan exactly (enemies is the tick's alive snapshot in unit order,
  // and any foe alive at swing time was alive at tick start), so it's digest-safe.
  onBasicAttack(unit, _target, ctx) {
    const reach = unit.range + unit.radius;
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(unit.pos, e.pos) <= reach) {
        ctx.dealDamage(e, unit.damage, unit);
        applyEffect(
          e,
          makeEffect("poison", {
            source: unit.uid,
            durationSec: 2,
            damagePerTick: 3,
            tickIntervalSec: 0.5,
          })
        );
      }
    }
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
