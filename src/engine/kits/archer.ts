// Archer (defId "archer") — a ranged kiter. One mechanic:
//   Kiting Leap — an instant ability (6s cooldown) that hops ~130px directly away
//                 from a melee enemy closing into threat range, buying space to keep
//                 firing. Only fires when such a threat exists (returns false
//                 otherwise so the cooldown isn't wasted); can't leap from an unseen
//                 (stealthed) attacker.
// No cast time, so it fires through the instant-cast seam (fireAbility, gated on
// stun/silence exactly like the old tryCastAbility path). No defId gating.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { isStealthed } from "../StatusEffectSystem";

export const archerKit: UnitKit = {
  roleClass: "ranged",

  fireAbility(ctx) {
    const { unit, enemies } = ctx;
    // Only leap if a melee enemy is closing in.
    const threatRange = unit.radius * 2.4;
    const threat = enemies.find(
      (e) =>
        e.state !== "dead" &&
        !isStealthed(e) && // can't leap away from an unseen attacker
        getUnitDef(e.defId).range <= 80 &&
        dist(unit.pos, e.pos) <= threatRange
    );
    if (!threat) return false;

    // Leap away from the threat (~2 tiles ≈ 130px), clamped to field.
    const away = dir(threat.pos, unit.pos);
    const leap = 130;
    unit.pos.x = clamp(unit.pos.x + away.x * leap, unit.radius, FIELD_WIDTH - unit.radius);
    unit.pos.y = clamp(unit.pos.y + away.y * leap, unit.radius, FIELD_HEIGHT - unit.radius);
    ctx.spawnVfx({
      kind: "frost",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.25),
      maxLife: secToTicks(0.25),
      color: "#fde68a",
    });
    return true;
  },
};
