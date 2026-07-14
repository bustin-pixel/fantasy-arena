// Wildheart — the rare Overgrowth catalyst. The grove's beating heart, no longer
// a reskinned Berserker:
//   Verdant Pulse — every 6s it pulses green life, healing itself and every ally
//     on the field (onTick, global-clock synced).
//   Thorned Hide — anything that strikes it from melee reach is torn by thorns in
//     return (onDamaged reflect).
//   Final Bloom — when it finally falls, two dryads bud from the corpse and keep
//     the grove's fight going (onDeath).
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const PULSE_INTERVAL_SEC = 6;
const PULSE_HEAL = 20;
const THORN_REACH = 64; // melee-ish
const THORN_DAMAGE = 6;

export const wildheartKit: UnitKit = {
  roleClass: "melee",

  // Verdant Pulse: heal the whole grove on the 6s cadence.
  onTick(unit, ctx) {
    if (ctx.tick % secToTicks(PULSE_INTERVAL_SEC) !== 0) return;
    for (const ally of ctx.allies) {
      if (ally.state === "dead") continue;
      ctx.heal(ally, PULSE_HEAL);
    }
    ctx.heal(unit, PULSE_HEAL);
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
  },

  // Thorned Hide: reflect a bite back at a melee attacker.
  onDamaged(unit, _amount, source, ctx) {
    if (source.state === "dead" || source.uid === unit.uid) return;
    if (dist(unit.pos, source.pos) <= THORN_REACH) {
      ctx.dealDamage(source, THORN_DAMAGE, unit);
    }
  },

  // Final Bloom: two dryads bud from the corpse.
  onDeath(unit, ctx) {
    for (const side of [-1, 1]) {
      ctx.spawnUnit("dryad", unit.team, {
        x: unit.pos.x + side * 26,
        y: unit.pos.y + 14,
      });
    }
  },
};
