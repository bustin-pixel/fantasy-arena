// Assassin — a fragile backline burst diver with two mechanics:
//   Ambush — enters stealthed (opening stealth via onSpawn); its first strike out
//     of stealth stuns the victim 3s and reveals it (onBeforeAttack). One-time,
//     gated by ambushReady (set in createUnit for ability "ambush").
//   Vanish — the first lethal blow doesn't kill: survive at 1 HP, untargetable
//     (stealth) + death-immune 2.5s to slip away (onWouldDie). Once per match.
import type { UnitKit } from "./UnitKit";
import { MATCH_TIME_SEC, secToTicks } from "@/utils/constants";
import { applyEffect, makeEffect } from "../StatusEffectSystem";
import { getUnitDef } from "@/data/units";

export const assassinKit: UnitKit = {
  roleClass: "assassin",

  onSpawn(unit) {
    applyEffect(
      unit,
      makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
    );
  },

  onBeforeAttack(unit, target, ctx) {
    if (!unit.ambushReady) return;
    unit.ambushReady = false;
    unit.effects = unit.effects.filter((e) => e.type !== "stealth");
    applyEffect(target, makeEffect("stun", { source: unit.uid, durationSec: 3 }));
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
  },

  onWouldDie(unit, _source, ctx) {
    if (unit.vanishUsed) return false;
    unit.vanishUsed = true;
    unit.hp = 1;
    applyEffect(
      unit,
      makeEffect("death_immune", { source: unit.uid, durationSec: 2.5 })
    );
    applyEffect(
      unit,
      makeEffect("stealth", { source: unit.uid, durationSec: 2.5 })
    );
    unit.attackedByUid = null;
    ctx.spawnFloatingText(unit, "Vanish!", "heal");
    ctx.spawnVfx({
      kind: "death",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
