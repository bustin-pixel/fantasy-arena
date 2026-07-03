// Orc (defId "orc") — a melee gap-closer. One mechanic:
//   Charge — an instant ability (7s cooldown): when its target is out of melee
//            reach it commits to a fast RUSH (not a teleport), and on contact SLAMS
//            for bonus damage + a short stagger (stun). fireAbility only ARMS the
//            rush (locks chargeTargetUid + chargeTicks); the engine's stepCharge
//            drives the dash tick by tick, and onChargeContact resolves the slam.
// The dash driver stays engine plumbing (field-gated on chargeTicks, like the
// Arcane Barrage streamer) — the kit only arms it and defines the contact effect.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const CHARGE_SLAM_DAMAGE = 22;
const CHARGE_STUN_SEC = 0.8;

export const orcKit: UnitKit = {
  roleClass: "melee",

  // Arm the rush when the target is far enough to be worth charging.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;

    const d = dist(unit.pos, target.pos);
    // Only worth charging if there's real distance to cover.
    if (d < unit.range + unit.radius + 40) return false;

    unit.chargeTargetUid = target.uid;
    unit.chargeTicks = secToTicks(1.5); // safety cap so a charge that misses ends
    unit.facing = target.pos.x >= unit.pos.x ? 1 : -1;
    ctx.spawnVfx({
      kind: "frost",
      pos: { x: unit.pos.x, y: unit.pos.y }, // dust kick-up at the orc's feet
      life: secToTicks(0.25),
      maxLife: secToTicks(0.25),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },

  // On contact: slam for bonus damage + a short stagger.
  onChargeContact(unit, target, ctx) {
    ctx.dealDamage(target, CHARGE_SLAM_DAMAGE, unit);
    applyEffect(
      target,
      makeEffect("stun", { source: unit.uid, durationSec: CHARGE_STUN_SEC })
    );
  },
};
