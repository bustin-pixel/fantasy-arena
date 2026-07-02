// Ogre — a tank that refuses to fall the first time. Second Wind: the first hit
// that drops it to/below 25% HP (a lethal blow included) surges it back to full
// instead, once per match. Because that trigger spans both a non-lethal crossing
// and a killing blow, it's split across two seam hooks: onDamaged catches the
// survivor case (hp > 0), onWouldDie catches the lethal one (hp <= 0). Active:
// Crushing Slam (instant) — a melee nuke + stun.
import type { UnitKit, KitCtx } from "./UnitKit";
import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

function secondWind(unit: Unit, ctx: KitCtx): void {
  unit.secondWindUsed = true;
  unit.hp = unit.maxHp;
  ctx.spawnFloatingText(unit, "Second Wind!", "heal");
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: unit.pos.x, y: unit.pos.y - 4 },
    life: secToTicks(0.7),
    maxLife: secToTicks(0.7),
    color: "#fbbf24",
  });
}

export const ogreKit: UnitKit = {
  roleClass: "melee",

  onDamaged(unit, _amount, _source, ctx) {
    if (!unit.secondWindUsed && unit.hp <= unit.maxHp * 0.25) secondWind(unit, ctx);
  },

  onWouldDie(unit, _source, ctx) {
    if (unit.secondWindUsed) return false;
    secondWind(unit, ctx);
    return true; // survived this blow at full HP
  },

  // Crushing Slam: heavy hit + 1.5s stun on the current melee target. Returns
  // false (so the cooldown isn't spent) if there's no target in reach.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;
    if (dist(unit.pos, target.pos) > unit.range + unit.radius) return false;

    ctx.dealDamage(target, 25, unit);
    applyEffect(
      target,
      makeEffect("stun", { source: unit.uid, durationSec: 1.5 })
    );
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
