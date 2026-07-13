// Priest (defId "priest") — an epic backline healer with two heals that layer:
//   Flash Heal — a 1s cast (3s cooldown) that restores 22 HP to the most-wounded
//                ally in range (including itself). Lands on cast COMPLETION; the
//                Priest only BEGINS the wind-up when someone actually needs it, so
//                it never freezes channelling a heal that would land on nobody.
//                (The engine owns the cast bar; the kit supplies wantsToCast — the
//                begin gate — and fireAbility — the effect on completion.)
//   Renew      — an instant heal-over-time on the most-wounded ally in range
//                (5 HP/s for 6s, 30 total), on its own cooldown. Runs in the
//                post-idle act slot (onActTick): instant, never uses the cast bar,
//                won't fire mid-Flash-Heal, and a silence/stun blocks it. Reuses
//                the shared `regen` status effect (as the Druid's Rejuvenation and
//                the Hunter's Mend Beast do).
// Its niche vs the Cleric (one slow 32 heal): faster, layered sustain — a quick
// burst plus a background HoT out-throughputs the Cleric across a fight, but the
// Priest is squishier, so "kill the healer" is the counterplay.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { abilityCooldownTicks } from "../AbilitySystem";
import { applyEffect, isSilenced, isStunned, makeEffect } from "../StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

// Renew: 5 HP every 1s for 6s (30 total) on the most-wounded ally in range.
const RENEW_HEAL_PER_TICK = 5;
const RENEW_TICK_SEC = 1;
const RENEW_DURATION_SEC = 6;

const FLASH_HEAL_AMOUNT = 22;

// The most-wounded ally within heal range (including self), or null if no one
// needs healing. Shared by both heals — Flash Heal's begin-cast gate and
// completion, and Renew's target pick. Most-wounded by missing HP, uid tiebreak
// for determinism.
function woundedTarget(ctx: KitCtx): Unit | null {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) => u.state !== "dead" && u.hp < u.maxHp
  );
  if (candidates.length === 0) return null;

  const healRange = unit.range + unit.radius;
  const inRange = candidates.filter((u) => dist(unit.pos, u.pos) <= healRange);
  const pool = inRange.length > 0 ? inRange : [unit];

  let best = pool[0];
  let bestMissing = best.maxHp - best.hp;
  for (const u of pool) {
    const missing = u.maxHp - u.hp;
    if (missing > bestMissing || (missing === bestMissing && u.uid < best.uid)) {
      best = u;
      bestMissing = missing;
    }
  }
  return bestMissing > 0 ? best : null;
}

function healVfx(ctx: KitCtx, target: Unit): void {
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: target.pos.x, y: target.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(ctx.unit.defId).accent,
  });
}

export const priestKit: UnitKit = {
  roleClass: "support",

  // Flash Heal — only commit the wind-up when there's a wounded ally to land it on.
  wantsToCast(ctx) {
    return woundedTarget(ctx) != null;
  },

  // Fired on cast completion: heal the (re-evaluated) most-wounded ally for 22.
  fireAbility(ctx) {
    const best = woundedTarget(ctx);
    if (!best) return false;
    ctx.heal(best, FLASH_HEAL_AMOUNT);
    healVfx(ctx, best);
    return true;
  },

  // Renew — instant HoT on its own cooldown. Won't fire mid-Flash-Heal (castTicks),
  // and a silence/stun blocks it (the stun guard mirrors the Druid's; a stunned
  // unit already `continue`d in the tick skeleton, but it's kept for a clean gate).
  onActTick(unit, ctx) {
    if (
      unit.castTicks <= 0 &&
      unit.renewCooldown <= 0 &&
      !isStunned(unit) &&
      !isSilenced(unit)
    ) {
      const best = woundedTarget(ctx);
      if (best) {
        applyEffect(
          best,
          makeEffect("regen", {
            source: unit.uid,
            healPerTick: RENEW_HEAL_PER_TICK,
            tickIntervalSec: RENEW_TICK_SEC,
            durationSec: RENEW_DURATION_SEC,
          })
        );
        healVfx(ctx, best);
        unit.renewCooldown = abilityCooldownTicks("renew");
      }
    }
  },
};
