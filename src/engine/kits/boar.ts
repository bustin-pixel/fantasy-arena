// Boar (defId "boar") — the Hunter's guard companion (a summon; its `lifesteal`
// ability slot is passive filler). One mechanic:
//   Guard-charge — when its Hunter is attacked, the Boar rushes that attacker
//                  (the same dash as the Orc's Charge) and, on contact, TAUNTS it
//                  onto itself — pulling it off the Hunter even from across the
//                  field. Re-arms each time the 2.5s taunt lapses.
// It shares the engine's charge plumbing: onTick ARMS the guard-charge (locking
// chargeTicks), stepCharge drives the dash, and onChargeContact applies the taunt.
import type { UnitKit } from "./UnitKit";
import { secToTicks } from "@/utils/constants";
import {
  applyEffect,
  isFeared,
  isPolymorphed,
  isStunned,
  makeEffect,
} from "../StatusEffectSystem";

export const boarKit: UnitKit = {
  roleClass: "melee",

  // Guard-arm: rush the Hunter's current attacker. This lived post-gate in the old
  // loop (after the stun/fear/poly checks and before the charge-step), so replicate
  // that guard here — a stunned/feared/sheeped boar doesn't arm — and skip while a
  // rush is already in flight so it kicks off before the same-tick charge-step.
  onTick(unit, ctx) {
    if (isStunned(unit) || isFeared(unit) || isPolymorphed(unit)) return;
    if (unit.chargeTicks > 0) return;

    const hunter = ctx.allies.find((a) => a.defId === "hunter");
    const attacker = hunter?.attackedByUid
      ? ctx.unitsByUid.get(hunter.attackedByUid)
      : null;
    if (
      attacker &&
      attacker.state !== "dead" &&
      attacker.team !== unit.team &&
      attacker.tauntedByUid !== unit.uid // don't re-charge one it's already holding
    ) {
      unit.chargeTargetUid = attacker.uid;
      unit.chargeTicks = secToTicks(1.5);
      unit.facing = attacker.pos.x >= unit.pos.x ? 1 : -1;
    }
  },

  // On contact: taunt the target onto the Boar (charge, then taunt), pulling it off
  // the Hunter. A pure status write — no ctx needed.
  onChargeContact(unit, target, _ctx) {
    applyEffect(
      target,
      makeEffect("taunt", { source: unit.uid, durationSec: 2.5 })
    );
    target.tauntedByUid = unit.uid;
    target.targetUid = unit.uid;
  },
};
