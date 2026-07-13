// Seraph (defId "seraph") — the legendary capstone healer: a squishy backline
// raid-medic with three layered supports.
//   Divine Light — a 1.5s cast (6s cooldown) that pours 100 HP into the
//                  most-wounded ally in range (itself included). Lands on cast
//                  COMPLETION; the Seraph only BEGINS the wind-up when someone
//                  actually needs it, so it never freezes channelling a 100-heal
//                  onto a full-HP team. (The engine owns the cast bar; the kit
//                  supplies wantsToCast — the begin gate — and fireAbility.)
//   Sanctuary    — instant (11s cooldown): a +55 absorb bubble on EVERY living
//                  ally (self included), stacking on any existing shield and
//                  capped at 150/ally (the Holy Knight's Blessing rule). Reuses
//                  the shieldHp pool.
//   Renewal      — instant (9s cooldown): a team-wide heal-over-time on every
//                  living ally (self included) — 6 HP/s for 6s (36 total each).
//                  Reuses the shared `regen` status effect (as Renew does). Only
//                  fires when someone on the team is actually hurt.
// Both instants run in the post-idle act slot (onActTick): instant, never touch
// the cast bar, won't fire mid-Divine-Light, and a silence/stun blocks them.
// Its niche vs the Priest/Cleric: those heal ONE ally; the Seraph blankets the
// WHOLE deployed side. Squishy with a token attack, so "kill the healer" is the
// counterplay.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { abilityCooldownTicks } from "../AbilitySystem";
import { applyEffect, isSilenced, isStunned, makeEffect } from "../StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const DIVINE_LIGHT_AMOUNT = 100;

const SANCTUARY_SHIELD = 55;
const SANCTUARY_CAP = 150; // per-ally absorb ceiling (matches the Holy Knight)

// Renewal: 6 HP every 1s for 6s (36 total) on the whole team.
const RENEWAL_HEAL_PER_TICK = 6;
const RENEWAL_TICK_SEC = 1;
const RENEWAL_DURATION_SEC = 6;

// The most-wounded ally within heal range (including self), or null if no one
// needs healing. Drives Divine Light's begin-cast gate and its completion pick
// (re-evaluated, since the pick may shift mid-cast). Most-wounded by missing HP,
// uid tiebreak for determinism.
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

// Every living ally on the Seraph's side, self included — the "whole team" the
// two instant supports blanket. No range gate: only 1–2 allies are ever on the
// field, so "entire team" is the intended reach.
function team(ctx: KitCtx): Unit[] {
  return [ctx.unit, ...ctx.allies].filter((u) => u.state !== "dead");
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

export const seraphKit: UnitKit = {
  roleClass: "support",

  // Divine Light — only commit the 1.5s wind-up when there's a wounded ally.
  wantsToCast(ctx) {
    return woundedTarget(ctx) != null;
  },

  // Fired on cast completion: pour 100 HP into the (re-evaluated) most-wounded ally.
  fireAbility(ctx) {
    const best = woundedTarget(ctx);
    if (!best) return false;
    ctx.heal(best, DIVINE_LIGHT_AMOUNT);
    healVfx(ctx, best);
    return true;
  },

  // Sanctuary + Renewal — instants on their own cooldowns. Neither fires mid-
  // Divine-Light (castTicks), and a silence/stun blocks both. Returns void so the
  // standard cast/attack chain (Divine Light, the basic swing) still runs.
  onActTick(unit, ctx) {
    if (unit.castTicks > 0 || isStunned(unit) || isSilenced(unit)) return;

    // Sanctuary — proactive team-wide bubble; top up whenever it's ready.
    if (unit.sanctuaryCooldown <= 0) {
      for (const ally of team(ctx)) {
        ally.shieldHp = Math.min(SANCTUARY_CAP, ally.shieldHp + SANCTUARY_SHIELD);
        ally.shieldHpMax = Math.max(ally.shieldHpMax, ally.shieldHp);
        healVfx(ctx, ally);
      }
      unit.sanctuaryCooldown = abilityCooldownTicks("sanctuary");
    }

    // Renewal — team-wide HoT, but only when someone on the team is hurt (the
    // reach is rangeless, so the gate looks at the whole team, not heal range).
    const teammates = team(ctx);
    if (unit.renewalCooldown <= 0 && teammates.some((u) => u.hp < u.maxHp)) {
      for (const ally of teammates) {
        applyEffect(
          ally,
          makeEffect("regen", {
            source: unit.uid,
            healPerTick: RENEWAL_HEAL_PER_TICK,
            tickIntervalSec: RENEWAL_TICK_SEC,
            durationSec: RENEWAL_DURATION_SEC,
          })
        );
        healVfx(ctx, ally);
      }
      unit.renewalCooldown = abilityCooldownTicks("renewal");
    }
  },
};
