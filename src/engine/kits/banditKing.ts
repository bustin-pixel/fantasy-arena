// The Bandit King — the Rogue's Den boss. A crowned cutthroat who fights dirty,
// no longer a reskinned Berserker:
//   Fan of Knives — flings five poisoned knives, split round-robin across the
//     nearest enemies (a lone target eats all five). Damage + a bleeding poison
//     per knife (fireAbility, ~9s).
//   Smoke Bomb — at 60% and 30% HP he throws down smoke: cloaks for 1.2s (breaking
//     the players' target lock) and buries a parting knife in the nearest foe
//     (onDamaged, bossPhase-gated).
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const KNIVES = 5;
const KNIFE_DMG_FRAC = 0.6;
const SMOKE_STEALTH_SEC = 1.2;
const SMOKE_BURST = 40;

function distSq(u: Unit, e: Unit): number {
  const dx = u.pos.x - e.pos.x;
  const dy = u.pos.y - e.pos.y;
  return dx * dx + dy * dy;
}

// Nearest living enemies, uid tiebreak — deterministic ordering for the fan.
function nearestEnemies(unit: Unit, ctx: KitCtx): Unit[] {
  return ctx.enemies
    .filter((e) => e.state !== "dead")
    .sort(
      (a, b) => distSq(unit, a) - distSq(unit, b) || (a.uid < b.uid ? -1 : 1)
    );
}

function smokeBomb(unit: Unit, ctx: KitCtx): void {
  applyEffect(
    unit,
    makeEffect("stealth", { source: unit.uid, durationSec: SMOKE_STEALTH_SEC })
  );
  const foes = nearestEnemies(unit, ctx);
  if (foes.length > 0) ctx.dealDamage(foes[0], SMOKE_BURST, unit);
  ctx.spawnFloatingText(unit, "Smoke Bomb!", "heal");
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(unit.defId).accent,
  });
}

export const banditKingKit: UnitKit = {
  roleClass: "melee",

  // Fan of Knives: five poisoned knives round-robin across the nearest enemies.
  fireAbility(ctx) {
    const { unit } = ctx;
    const foes = nearestEnemies(unit, ctx);
    if (foes.length === 0) return false;
    const knifeDmg = Math.max(1, Math.round(unit.damage * KNIFE_DMG_FRAC));
    for (let i = 0; i < KNIVES; i++) {
      const foe = foes[i % foes.length];
      if (foe.state === "dead") continue;
      ctx.dealDamage(foe, knifeDmg, unit);
      if (foe.hp <= 0) continue; // a knife may have just felled it
      applyEffect(
        foe,
        makeEffect("poison", {
          source: unit.uid,
          durationSec: 3,
          damagePerTick: 3,
          tickIntervalSec: 0.5,
        })
      );
      ctx.spawnVfx({
        kind: "slam",
        pos: { x: foe.pos.x, y: foe.pos.y - 4 },
        life: secToTicks(0.25),
        maxLife: secToTicks(0.25),
        color: getUnitDef(unit.defId).accent,
      });
    }
    return true;
  },

  // Smoke Bomb: cloak + a parting knife each time HP crosses 60% / 30%.
  onDamaged(unit, _amount, _source, ctx) {
    const missing = 1 - unit.hp / unit.maxHp;
    const want = (missing >= 0.4 ? 1 : 0) + (missing >= 0.7 ? 1 : 0);
    while (unit.bossPhase < want) {
      unit.bossPhase++;
      smokeBomb(unit, ctx);
    }
  },
};
