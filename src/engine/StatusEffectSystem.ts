// ============================================================================
// StatusEffectSystem
// A reusable framework for timed effects. The four spec'd effects (burn, slow,
// stun, shield) are implemented; haste, poison and silence are wired into the
// type system and apply/query helpers so future expansion needs no refactor.
//
// All durations are in TICKS. This system only mutates ActiveStatusEffect
// timers and applies DoT damage; movement/attack systems QUERY it for modifiers.
// ============================================================================

import type { ActiveStatusEffect, StatusEffectType, Unit } from "@/types";
import { secToTicks } from "@/utils/constants";

export interface StatusFactoryArgs {
  source: string;
  durationSec: number;
  magnitude?: number;
  damagePerTick?: number;
  tickIntervalSec?: number;
  charges?: number;
}

/** Build (but do not yet attach) a status effect. */
export function makeEffect(
  type: StatusEffectType,
  args: StatusFactoryArgs
): ActiveStatusEffect {
  const ticks = secToTicks(args.durationSec);
  const tickInterval =
    args.tickIntervalSec != null ? secToTicks(args.tickIntervalSec) : undefined;
  return {
    type,
    ticksLeft: ticks,
    magnitude: args.magnitude,
    damagePerTick: args.damagePerTick,
    tickInterval,
    tickCountdown: tickInterval,
    charges: args.charges,
    source: args.source,
  };
}

/** Attach an effect, merging with an existing one of the same type (refresh). */
export function applyEffect(unit: Unit, effect: ActiveStatusEffect): void {
  if (unit.state === "dead") return;
  // Aegis Knight is warded against magical afflictions.
  if (
    unit.defId === "aegis_knight" &&
    (effect.type === "burn" || effect.type === "slow" || effect.type === "poison")
  ) {
    return;
  }
  const existing = unit.effects.find((e) => e.type === effect.type);
  if (existing) {
    // Refresh duration to the longer of the two; keep stronger magnitude.
    existing.ticksLeft = Math.max(existing.ticksLeft, effect.ticksLeft);
    if (effect.magnitude != null) {
      existing.magnitude = Math.max(existing.magnitude ?? 0, effect.magnitude);
    }
    if (effect.charges != null) {
      existing.charges = (existing.charges ?? 0) + effect.charges;
    }
    if (effect.damagePerTick != null) {
      existing.damagePerTick = effect.damagePerTick;
      existing.tickInterval = effect.tickInterval;
      existing.tickCountdown = effect.tickInterval;
    }
  } else {
    unit.effects.push(effect);
  }
}

export function hasEffect(unit: Unit, type: StatusEffectType): boolean {
  return unit.effects.some((e) => e.type === type);
}

export function getEffect(
  unit: Unit,
  type: StatusEffectType
): ActiveStatusEffect | undefined {
  return unit.effects.find((e) => e.type === type);
}

export function isStunned(unit: Unit): boolean {
  return hasEffect(unit, "stun");
}

export function isFeared(unit: Unit): boolean {
  return hasEffect(unit, "fear");
}

export function isSilenced(unit: Unit): boolean {
  return hasEffect(unit, "silence");
}

/** Stealthed = invisible to enemies: untargetable AND ignored by reactive AI
 *  (kiting, Blink, taunt, fear). The canonical "you can't react to what you
 *  can't see" check. */
export function isStealthed(unit: Unit): boolean {
  return hasEffect(unit, "stealth");
}

/** Movement multiplier from slow (and future haste). */
export function moveSpeedMultiplier(unit: Unit): number {
  let mult = 1;
  const slow = getEffect(unit, "slow");
  if (slow?.magnitude) mult *= 1 - slow.magnitude;
  const haste = getEffect(unit, "haste");
  if (haste?.magnitude) mult *= 1 + haste.magnitude;
  return mult;
}

/** Attack-speed multiplier (slow lengthens cooldowns -> returns >1 delay). */
export function attackDelayMultiplier(unit: Unit): number {
  const slow = getEffect(unit, "slow");
  if (slow?.magnitude) return 1 / (1 - slow.magnitude);
  return 1;
}

/**
 * Consume a shield charge if present. Returns true if the incoming hit was
 * fully blocked.
 */
export function tryConsumeShield(unit: Unit): boolean {
  const shield = getEffect(unit, "shield");
  if (shield && (shield.charges ?? 0) > 0) {
    shield.charges! -= 1;
    if (shield.charges! <= 0) {
      unit.effects = unit.effects.filter((e) => e !== shield);
    }
    return true;
  }
  return false;
}

export interface DotResult {
  unit: Unit;
  damage: number;
}

/**
 * Advance all effect timers by one tick. Returns DoT damage to be applied by
 * the CombatSystem (kept separate so all HP changes funnel through one place).
 */
export function tickEffects(units: Unit[]): DotResult[] {
  const dots: DotResult[] = [];
  for (const unit of units) {
    if (unit.state === "dead") continue;
    for (const effect of unit.effects) {
      effect.ticksLeft -= 1;
      if (
        effect.damagePerTick != null &&
        effect.tickInterval != null &&
        effect.tickCountdown != null
      ) {
        effect.tickCountdown -= 1;
        if (effect.tickCountdown <= 0) {
          dots.push({ unit, damage: effect.damagePerTick });
          effect.tickCountdown = effect.tickInterval;
        }
      }
    }
    unit.effects = unit.effects.filter((e) => e.ticksLeft > 0);
  }
  return dots;
}
