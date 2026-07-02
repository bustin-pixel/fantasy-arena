// Knight — the protector tank. Taunting Roar (an instant active cast): forces
// nearby enemies to attack the Knight for a few seconds (overriding their normal
// target priority) and grants the Knight an absorb shield to soak the incoming
// fire, scaling a little with how many it pulled. It pulls aggro off your
// backline. The engine still owns the cast pipeline (cooldown from ABILITIES,
// the stun/silence gate); the kit just supplies the effect.
import type { UnitKit } from "./UnitKit";
import { applyEffect, isStealthed, makeEffect } from "../StatusEffectSystem";
import { dist } from "@/utils/math";
import { secToTicks } from "@/utils/constants";

const TAUNT_RADIUS = 200;
const TAUNT_SEC = 2.5;

export const knightKit: UnitKit = {
  roleClass: "melee",

  fireAbility(ctx) {
    const { unit, enemies } = ctx;
    let taunted = 0;
    for (const e of enemies) {
      if (e.state === "dead") continue;
      if (isStealthed(e)) continue; // can't taunt an enemy it can't see
      if (dist(unit.pos, e.pos) <= TAUNT_RADIUS) {
        applyEffect(
          e,
          makeEffect("taunt", { source: unit.uid, durationSec: TAUNT_SEC })
        );
        e.tauntedByUid = unit.uid;
        e.targetUid = unit.uid; // immediately yank their target
        taunted++;
      }
    }

    // Grant the Knight an absorb shield (overhealth) — scales a bit with how many
    // it pulled, so a big group taunt is rewarded with more protection. (Kept in
    // sync with the absorb numbers in the taunt_roar description in abilities.ts.)
    const bubble = 45 + taunted * 10;
    unit.shieldHp = Math.max(unit.shieldHp, bubble);
    unit.shieldHpMax = Math.max(unit.shieldHpMax, unit.shieldHp);

    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: unit.pos.x, y: unit.pos.y - 4 },
      life: secToTicks(0.6),
      maxLife: secToTicks(0.6),
      color: "#cbd5e1",
    });
    return true;
  },
};
