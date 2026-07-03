// Holy Knight (defId "holy_knight") — a frontline melee support. One mechanic:
//   Blessing — an instant pulse (8s cooldown) that grants an absorb shield + small
//              heal to itself and every ally within radius. The shield STACKS on
//              top of any existing absorb (the Knight's Taunt bubble, the Aegis
//              Knight's banked magic), capped per unit so a stack of shielders is
//              strong, not unkillable.
// Blessing has no cast time, so it fires through the instant-cast seam (fireAbility,
// gated on stun/silence exactly like the old tryCastAbility path). No defId gating.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const BLESSING_RADIUS = 180;
const SHIELD_GRANT = 40;
const SHIELD_CAP = 150; // per-unit absorb ceiling
const HEAL = 15;

export const holyKnightKit: UnitKit = {
  roleClass: "melee",

  fireAbility(ctx) {
    const { unit, allies } = ctx;
    const blessed = [unit, ...allies].filter(
      (u) => u.state !== "dead" && dist(unit.pos, u.pos) <= BLESSING_RADIUS
    );

    for (const ally of blessed) {
      ally.shieldHp = Math.min(SHIELD_CAP, ally.shieldHp + SHIELD_GRANT);
      ally.shieldHpMax = Math.max(ally.shieldHpMax, ally.shieldHp);
      ctx.heal(ally, HEAL);
      ctx.spawnVfx({
        kind: "shield_pop",
        pos: { x: ally.pos.x, y: ally.pos.y - 4 },
        life: secToTicks(0.5),
        maxLife: secToTicks(0.5),
        color: getUnitDef(unit.defId).accent,
      });
    }
    return true;
  },
};
