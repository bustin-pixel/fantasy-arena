// ============================================================================
// Sweep kit — shared scaffolding for the headless balance harnesses.
//
// NOT a spec (no `.test.ts` suffix, so Vitest never collects it) and nothing in
// the production build imports it. It holds the pieces both `winrateSweep`
// (Depths progression) and `endlessSweep` (survival curve) need: the gear ladder,
// the player-power tiers, and small stats helpers.
//
// Everything here is pure and deterministic — a sweep must be reproducible from
// a commit hash, which is the whole reason this file exists. The last endless
// retune's harness lived in a scratchpad and was never committed, so the curve
// regressed with nothing to catch it.
// ============================================================================

import { makeItemKey } from "@/data/items";
import type { CommanderMods } from "@/meta/commander";
import type { ItemLoadouts } from "@/types";

// This project's tsconfig has no @types/node, so `process` is untyped. Vitest
// provides it at runtime — declare a minimal shape just for the SWEEP flags.
export declare const process: { env: Record<string, string | undefined> };

/** Gear tiers, coarse rungs of the item ladder mapped to a whole-deck loadout.
 *  Weapon = raw damage%, armor = raw HP% — the two that bake into stats, so they
 *  move the winrate the most. "none" is the byte-identical bare build. */
export type GearTier = "none" | "rare2" | "epic1" | "leg1" | "leg2" | "leg3";

export const GEAR_LADDER: GearTier[] = [
  "none",
  "rare2",
  "epic1",
  "leg1",
  "leg2",
  "leg3",
];

export function gearFor(deck: string[], tier: GearTier): ItemLoadouts {
  if (tier === "none") return {};
  const [q, s] =
    tier === "rare2"
      ? (["rare", 2] as const)
      : tier === "epic1"
        ? (["epic", 1] as const)
        : tier === "leg1"
          ? (["legendary", 1] as const)
          : tier === "leg2"
            ? (["legendary", 2] as const)
            : (["legendary", 3] as const);
  const loadout = {
    weapon: makeItemKey("soldiers_blade", q, s),
    armor: makeItemKey("squires_plate", q, s),
    ...(q === "legendary" ? { trinket: makeItemKey("ember_charm", q, s) } : {}),
  };
  return Object.fromEntries(deck.map((id) => [id, loadout]));
}

// -- Player power tiers -------------------------------------------------------
// The axis the OLD endless sweep was missing. It tuned against a bare Lv-1-ish
// warband and landed a median of 8-12 waves; a real player arrives at endless
// with a levelled, geared, slayer-stacked roster and sees ~40. Tuning a curve
// without this axis is tuning against a player who doesn't exist.

export interface PowerTier {
  id: "fresh" | "mid" | "maxed";
  level: number;
  gear: GearTier;
  /** Per-defId outgoing damage multiplier (meta/slayer precomputes these). */
  slayer: number;
  commander: CommanderMods | null;
}

/** A partially-invested commander (roughly the mid-game War Table). */
const COMMANDER_MID: CommanderMods = {
  dmgMult: 1.06,
  atkDelayMult: 1,
  moveSpeedMult: 1,
  damageTakenMult: 0.96,
  lifestealBonus: 0,
  executeBonus: 0,
  killHeal: 0,
  deployShieldFrac: 0,
  thornsFrac: 0,
  overheal: false,
  lastBreath: false,
  abilityCooldownMult: 1,
  castTimeMult: 1,
  summonStatPct: 0,
  magicDmgMult: 1,
  rangedLifesteal: 0,
  abilitiesStartReady: false,
};

/** A fully-invested commander. Hand-built rather than resolved from a
 *  TalentAllocation on purpose — fewer coupling points to the talent tree, so a
 *  tree retune can't silently move the sweep's baseline. */
const COMMANDER_FULL: CommanderMods = {
  dmgMult: 1.12,
  atkDelayMult: 0.95,
  moveSpeedMult: 1.05,
  damageTakenMult: 0.9,
  lifestealBonus: 0.04,
  executeBonus: 0.1,
  killHeal: 0,
  deployShieldFrac: 0.1,
  thornsFrac: 0,
  overheal: false,
  lastBreath: false,
  abilityCooldownMult: 0.9,
  castTimeMult: 1,
  summonStatPct: 0.1,
  magicDmgMult: 1.05,
  rangedLifesteal: 0,
  abilitiesStartReady: true,
};

export const POWER_TIERS: PowerTier[] = [
  { id: "fresh", level: 12, gear: "none", slayer: 1, commander: null },
  { id: "mid", level: 22, gear: "epic1", slayer: 1.05, commander: COMMANDER_MID },
  { id: "maxed", level: 30, gear: "leg3", slayer: 1.1, commander: COMMANDER_FULL },
];

export function slayerFor(tier: PowerTier, defIds: string[]): Record<string, number> {
  if (tier.slayer === 1) return {};
  return Object.fromEntries(defIds.map((id) => [id, tier.slayer]));
}

// -- Stats --------------------------------------------------------------------

/** Nearest-rank percentile (p in 0..1) of an unsorted numeric sample. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

export const median = (xs: number[]): number => percentile(xs, 0.5);

export const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
