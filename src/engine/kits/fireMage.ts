// Fire Mage (defId "fire_mage") — a ranged DoT caster. Two mechanics:
//   Fireball — a 0.8s cast (fireAbility) that lobs a pure-burst fire projectile at
//              its current target; the impact resolves in the shared projectile
//              resolver (AbilitySystem.onProjectileHit, keyed on the "fireball"
//              tag, like the Arcane Barrage missiles).
//   Kindling — every 3rd basic attack ignites the target (Burn). That rider is
//              pure DATA on the UnitDef (`basicShotRider`), not code — see
//              performBasicAttack / stepProjectiles.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";

export const fireMageKit: UnitKit = {
  roleClass: "ranged",

  // Fired on cast completion: lob a fireball at the current target.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;

    ctx.spawnProjectile({
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 300,
      damage: 25,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "fireball",
      color: getUnitDef(unit.defId).accent,
      angle: 0,
    });
    return true;
  },
};
