// Mystic Archer (defId "mystic_archer") — a legendary Light/Dark ranged caster.
// Its basic attack is replaced by a form-tagged shot whose impact stacks and
// detonates on the target(s), flips the Archer's form, and ramps its Momentum:
//   Momentum   — each Light↔Dark form shift permanently ramps attack speed +15%
//                (capped +75%), recomputed from base each tick (onTick, pre-gate).
//   Form shot  — fires a "mystic_shift" projectile tinted by the current form
//                (onBasicAttack replaces the default swing).
//   Light/Dark — on impact (onProjectileHit): Light marks one target and detonates
//                it at 3 stacks (→ flip to Dark); Dark chains to a radius, stacking
//                on each, and detonates any that reach 3 (→ flip to Light).
// The Light/Dark stacks are CROSS-UNIT state — written onto the victim, not the
// Archer — so they stay flat fields on Unit (the ADR's opportunistic-flat
// fallback), not a per-kit namespace.
import type { Projectile, Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const DETONATE = 28; // burst damage when a target reaches 3 stacks
const CHAIN_RADIUS = 130; // Dark form's chain reach around the primary target

export const mysticArcherKit: UnitKit = {
  roleClass: "ranged",

  // Momentum: +15% attack speed per form shift (cap +75%), recomputed from base
  // each tick so it survives stat resets and applies even while stunned.
  onTick(unit) {
    const def = getUnitDef(unit.defId);
    const bonus = Math.min(0.75, unit.momentumStacks * 0.15);
    unit.attackSpeed = def.attackSpeed / (1 + bonus);
  },

  // Replace the default swing with a form-tagged shot; stacking/detonation
  // resolves on impact (onProjectileHit). attackCount is already bumped by the
  // caller, matching the pre-refactor order.
  onBasicAttack(unit, target, ctx) {
    ctx.spawnProjectile({
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 400,
      damage: unit.damage,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "mystic_shift", // resolved specially on impact
      color: unit.mysticForm === "light" ? "#fcd34d" : "#7c3aed",
      angle: 0,
    });
    return true;
  },

  // On impact. Light form: single-target hit + a light stack; at 3 the target
  // detonates and the Archer flips to Dark. Dark form: chain to every enemy in a
  // radius around the primary, stacking darkness on each; any that reaches 3
  // detonates and the Archer flips back to Light. Each flip adds a Momentum stack.
  onProjectileHit(unit, target, proj, ctx) {
    const damage = proj.damage;

    if (unit.mysticForm === "light") {
      ctx.dealDamage(target, damage, unit);
      if (target.state === "dead") return;
      target.lightStacks += 1;
      ctx.spawnVfx({
        kind: "slam",
        pos: { x: target.pos.x, y: target.pos.y - 4 },
        life: secToTicks(0.25),
        maxLife: secToTicks(0.25),
        color: "#fcd34d",
      });
      if (target.lightStacks >= 3) {
        // Detonate this target, clear its light stacks, flip to Dark.
        ctx.dealDamage(target, DETONATE, unit);
        target.lightStacks = 0;
        unit.mysticForm = "dark";
        unit.momentumStacks = Math.min(5, unit.momentumStacks + 1); // +15% atk speed/shift
        ctx.spawnVfx({
          kind: "death",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: "#fde68a",
        });
      }
    } else {
      // Dark form: chain to all enemies in a radius around the primary target.
      ctx.dealDamage(target, damage, unit);
      let flipped = false;
      for (const e of ctx.enemies) {
        if (e.state === "dead") continue; // may have died mid-chain (burst/detonate)
        if (dist(target.pos, e.pos) > CHAIN_RADIUS) continue;
        // Chain damage to secondary targets (primary already took the full hit).
        if (e.uid !== target.uid) ctx.dealDamage(e, Math.round(damage * 0.6), unit);
        if (e.hp <= 0) continue; // may have died from the chain hit
        e.darkStacks += 1;
        ctx.spawnVfx({
          kind: "frost",
          pos: { x: e.pos.x, y: e.pos.y - 4 },
          life: secToTicks(0.25),
          maxLife: secToTicks(0.25),
          color: "#7c3aed",
        });
        if (e.darkStacks >= 3) {
          ctx.dealDamage(e, DETONATE, unit);
          e.darkStacks = 0;
          flipped = true;
          ctx.spawnVfx({
            kind: "death",
            pos: { x: e.pos.x, y: e.pos.y },
            life: secToTicks(0.5),
            maxLife: secToTicks(0.5),
            color: "#a78bfa",
          });
        }
      }
      if (flipped) {
        unit.mysticForm = "light";
        unit.momentumStacks = Math.min(5, unit.momentumStacks + 1); // +15% atk speed/shift
      }
    }
  },
};
