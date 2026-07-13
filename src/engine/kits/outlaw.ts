// Outlaw (defId "outlaw") — a legendary evasive duelist. Three mechanics:
//   Slippery — a 50% chance to fully dodge any incoming hit (onWouldTakeDamage,
//     the HP-funnel's full-negate veto). Rolls the seeded sim RNG so replays stay
//     byte-identical.
//   Ghost — deploys hidden in stealth (onSpawn), revealed by its first strike
//     (onBeforeAttack), Assassin-style.
//   Killing Spree — its ultimate charges over the first 10s alive (onTick ticks
//     the meter; the Renderer draws it under the HP bar). At full it arms a 5s
//     spree (unit.spreeTicks) that the engine driver stepKillingSpree runs —
//     blinking between enemies, immune to all damage (the same veto returns true)
//     and to crowd control (the driver owns the turn ahead of the stun gate). A
//     60s cooldown follows, shown as the bar refilling.
import type { UnitKit } from "./UnitKit";
import type { StatusEffectType } from "@/types";
import { MATCH_TIME_SEC, secToTicks } from "@/utils/constants";
import { applyEffect, isStealthed, makeEffect } from "../StatusEffectSystem";

const DODGE_CHANCE = 0.5;
const ULT_CHARGE_SEC = 10; // the first spree charges after 10s alive
const ULT_COOLDOWN_SEC = 60; // and every 60s thereafter
const SPREE_DURATION_SEC = 5;

// Debuffs shed when the spree begins — it's immune for the duration, so any
// lingering crowd control / DoT is cleansed rather than left to bite on exit.
const HARMFUL: ReadonlySet<StatusEffectType> = new Set([
  "stun",
  "slow",
  "fear",
  "poison",
  "burn",
  "curse",
  "silence",
  "polymorph",
]);

export const outlawKit: UnitKit = {
  roleClass: "assassin",

  onSpawn(unit) {
    // Ghost: open the match hidden (match-length stealth like the Assassin /
    // Trickster; the first strike strips it, below).
    applyEffect(
      unit,
      makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
    );
    // Killing Spree begins charging toward its first cast after 10s alive; the
    // Renderer draws ultChargeMax > 0 as a gold meter under the HP bar.
    unit.ultCharge = 0;
    unit.ultChargeMax = secToTicks(ULT_CHARGE_SEC);
  },

  // Reveal on the first strike (a no-op once already visible).
  onBeforeAttack(unit) {
    if (isStealthed(unit)) {
      unit.effects = unit.effects.filter((e) => e.type !== "stealth");
    }
  },

  // Pre-gate maintenance: advance the ultimate charge and unleash the spree when
  // it fills. Paused while a spree is already running (the driver owns those ticks).
  onTick(unit, ctx) {
    if (unit.spreeTicks > 0) return; // spree in progress — driver owns the turn
    if (unit.ultChargeMax <= 0) return; // safety (non-armed unit)
    unit.ultCharge++;
    if (unit.ultCharge < unit.ultChargeMax) return;

    // Charge full — erupt into the spree.
    unit.ultCharge = 0;
    unit.ultChargeMax = secToTicks(ULT_COOLDOWN_SEC); // next one is on the 60s cooldown
    unit.spreeTicks = secToTicks(SPREE_DURATION_SEC);
    unit.spreeJumpTimer = 0; // first blink lands immediately
    unit.spreeIndex = 0;
    // Immune for the duration — shed any crowd control / DoT, and drop stealth so
    // the rampage is plainly visible.
    unit.effects = unit.effects.filter(
      (e) => !HARMFUL.has(e.type) && e.type !== "stealth"
    );
    ctx.spawnFloatingText(unit, "KILLING SPREE!", "heal");
  },

  // Slippery + Killing Spree immunity: the HP-funnel full-negate veto. During a
  // spree every hit whiffs; otherwise it's a coin-flip dodge. Draws the seeded
  // sim RNG so two runs of the same seed stay byte-identical.
  onWouldTakeDamage(unit, _amount, _source, ctx) {
    if (unit.spreeTicks > 0) {
      ctx.spawnFloatingText(unit, "Immune", "heal");
      return true;
    }
    if (ctx.rng.next() < DODGE_CHANCE) {
      ctx.spawnFloatingText(unit, "Dodge!", "heal");
      return true;
    }
    return false;
  },
};
