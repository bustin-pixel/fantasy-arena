// Apex Beast — the rare Wilds catalyst. A colossal predator, no longer a reskinned
// Ogre:
//   Pounce — its very first strike lands with crushing force, stunning the prey
//     for 1s (onBeforeAttack, one-shot gated on bossPhase — WaveController-spawned
//     monsters don't get onSpawn, so the arm/spend lives entirely in the swing).
//   Apex Frenzy — every kill feeds it: a PERMANENT +12% attack speed per kill
//     (capped +72%), stacking as the fight thins your ranks (onKill + onTick).
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const POUNCE_STUN_SEC = 1;
const FRENZY_PER_KILL = 0.12;
const FRENZY_CAP = 0.72; // +72% attack speed ceiling (6 kills)

export const apexBeastKit: UnitKit = {
  roleClass: "melee",

  // Apex Frenzy: recompute attack speed from base each tick off the kill total.
  onTick(unit) {
    const bonus = Math.min(FRENZY_CAP, unit.bossStacks * FRENZY_PER_KILL);
    unit.attackSpeed = getUnitDef(unit.defId).attackSpeed / (1 + bonus);
  },

  // Pounce: the first swing stuns. bossPhase 0 → 1 marks it spent (no onSpawn on
  // the WaveController spawn path, so we can't pre-arm a flag).
  onBeforeAttack(unit, target, ctx) {
    if (unit.bossPhase !== 0) return;
    unit.bossPhase = 1;
    applyEffect(
      target,
      makeEffect("stun", { source: unit.uid, durationSec: POUNCE_STUN_SEC })
    );
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
  },

  onKill(source, _victim, ctx) {
    source.bossStacks++;
    ctx.spawnFloatingText(source, "Frenzy!", "crit");
  },
};
