// Berserker — a comeback bruiser that gets scarier as it's hurt. Four mechanics:
//   Bloodrage  — damage + attack speed scale with missing HP (onTick, recomputed
//                from base each tick so it applies even while stunned).
//   Last Stand — once per life, a killing blow leaves it at 1 HP + death-immune 5s
//                (onWouldDie; no stealth — it stays in the fight).
//   Bloodthirst— a killing blow heals it 5% of max HP, per kill (onKill).
//   Cleave     — its melee swing also hits every other enemy in reach (onAfterAttack).
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

export const berserkerKit: UnitKit = {
  roleClass: "melee",

  onTick(unit) {
    const def = getUnitDef(unit.defId);
    const missing = 1 - unit.hp / unit.maxHp; // 0 at full, ~1 near death
    unit.damage = Math.round(def.damage * (1 + missing * 0.9)); // up to +90% damage
    unit.attackSpeed = def.attackSpeed * (1 - missing * 0.4); // up to 40% faster
  },

  onWouldDie(unit, _source, ctx) {
    if (unit.lastStandUsed) return false;
    unit.lastStandUsed = true;
    unit.hp = 1;
    applyEffect(
      unit,
      makeEffect("death_immune", { source: unit.uid, durationSec: 5 })
    );
    ctx.spawnFloatingText(unit, "Last Stand!", "heal");
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },

  onKill(source, _victim, ctx) {
    // Same round+clamp as the old direct write; runs through the HP funnel.
    ctx.heal(source, source.maxHp * 0.05);
  },

  onAfterAttack(unit, target, ctx) {
    const reach = unit.range + unit.radius;
    for (const e of ctx.enemies) {
      if (e === target) continue; // primary already took the hit
      if (dist(unit.pos, e.pos) <= reach) ctx.dealDamage(e, unit.damage, unit);
    }
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.3),
      maxLife: secToTicks(0.3),
      color: getUnitDef(unit.defId).accent,
    });
  },
};
