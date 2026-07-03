// Ice Mage (defId "ice_mage") — a ranged control caster. Two mechanics:
//   Frost Blast — a 0.8s cast (fireAbility) that hurls a frost projectile at its
//                 current target; on impact (resolved in the shared projectile
//                 resolver, keyed on the "frost_blast" tag) it deals damage and
//                 SLOWS the target.
//   Frostbite   — every 2nd basic attack freezes the target (a 2s stun). That
//                 rider is pure DATA on the UnitDef (`basicShotRider`), not code —
//                 see performBasicAttack / stepProjectiles.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";

export const iceMageKit: UnitKit = {
  roleClass: "ranged",

  // Fired on cast completion: hurl a frost blast at the current target.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;

    ctx.spawnProjectile({
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 320,
      damage: 20,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "frost_blast",
      color: getUnitDef(unit.defId).accent,
      angle: 0,
    });
    return true;
  },
};
