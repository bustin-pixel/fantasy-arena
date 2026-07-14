// Rune Golem — the Sealed Vault boss. No longer a flat "halves all damage" wall
// but a PHASE fight. Runic Plating starts at 60% damage reduction; each time its
// HP crosses 75/50/25% a plate SHATTERS — the reduction drops 20%, a Shatter
// Pulse bursts the melee ring (damage + a 0.8s stun), and the freed runes drive
// the golem 15% faster. By its last quarter the plating is gone and it swings its
// hardest: the wall becomes a threat, and the fight has a shape.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const BASE_DR = 0.6; // starting damage reduction
const DR_PER_PLATE = 0.2; // each shattered plate sheds this much DR
const SHATTER_RADIUS = 130;
const SHATTER_DAMAGE = 22;
const SHATTER_STUN_SEC = 0.8;
const HASTE_PER_PLATE = 0.15; // +15% attack speed per plate lost

function shatter(unit: Unit, ctx: KitCtx): void {
  // Faster with each broken plate — recompute from base (attackSpeed is
  // seconds-between-attacks, so faster = a smaller number).
  unit.attackSpeed =
    getUnitDef(unit.defId).attackSpeed / (1 + unit.bossPhase * HASTE_PER_PLATE);
  for (const e of ctx.enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= SHATTER_RADIUS) {
      ctx.dealDamage(e, SHATTER_DAMAGE, unit);
      applyEffect(
        e,
        makeEffect("stun", { source: unit.uid, durationSec: SHATTER_STUN_SEC })
      );
    }
  }
  ctx.spawnFloatingText(unit, "CRACK!", "crit");
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(unit.defId).accent,
  });
}

export const runeGolemKit: UnitKit = {
  roleClass: "melee",

  // Runic Plating: current damage reduction falls as plates shatter (60→40→20→0).
  modifyIncomingDamage(unit, amount) {
    const dr = Math.max(0, BASE_DR - unit.bossPhase * DR_PER_PLATE);
    return amount * (1 - dr);
  },

  // Shatter a plate each time HP crosses a 75/50/25% threshold.
  onDamaged(unit, _amount, _source, ctx) {
    const missing = 1 - unit.hp / unit.maxHp;
    const want =
      (missing >= 0.25 ? 1 : 0) +
      (missing >= 0.5 ? 1 : 0) +
      (missing >= 0.75 ? 1 : 0);
    while (unit.bossPhase < want) {
      unit.bossPhase++;
      shatter(unit, ctx);
    }
  },
};
