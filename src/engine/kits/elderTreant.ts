// Elder Treant — the Overgrowth boss. An ancient walking tree, no longer a
// reskinned Ogre:
//   Grasping Roots — roots erupt around its target, damaging the cluster and
//     pinning it in place (85% slow) for 2.5s (fireAbility, ~11s).
//   Regrowth — below 60% HP it knits itself back together (~2.5%/s), UNLESS it is
//     burning: flames sear the wound shut and stop the regrowth cold (onTick).
//     Fire is the hard counter — and by the Overgrowth the player has a Fire Mage.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, hasEffect, makeEffect } from "../StatusEffectSystem";

const ROOT_RADIUS = 120;
const REGROW_BELOW = 0.6; // only knits when hurt past this
// 1.5%/s (was 2.5%): high enough to demand focus/burst, low enough that a deck
// without the fire counter can still out-damage it. Burning stops it entirely.
const REGROW_PCT = 0.015; // of max HP, per second

export const elderTreantKit: UnitKit = {
  roleClass: "melee",

  // Regrowth: 1s-cadence self-heal while wounded — shut off entirely while burning.
  onTick(unit, ctx) {
    if (ctx.tick % secToTicks(1) !== 0) return;
    if (unit.hp >= unit.maxHp * REGROW_BELOW) return;
    if (hasEffect(unit, "burn")) return; // fire is the counter — no regrowth
    ctx.heal(unit, Math.round(unit.maxHp * REGROW_PCT));
  },

  // Grasping Roots: an AoE snare + damage around the target. Returns false with
  // nothing in reach so the cooldown isn't wasted.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;
    let hit = 0;
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(target.pos, e.pos) <= ROOT_RADIUS) {
        ctx.dealDamage(e, 14, unit);
        applyEffect(
          e,
          makeEffect("slow", {
            source: unit.uid,
            durationSec: 2.5,
            magnitude: 0.85,
          })
        );
        hit++;
      }
    }
    if (hit === 0) return false;
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
