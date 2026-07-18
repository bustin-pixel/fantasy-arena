// ============================================================================
// Difficulty tiers — Normal / Hard / Elite, picked per dungeon RUN on the
// atlas sheet (FloorInfoPanel) and frozen for the whole descent, exactly like
// unitLevels: a deterministic match input that never draws RNG.
//
// A tier changes ONE thing about the fight: the monster-level band. Each
// dungeon's Normal monsterLevel (1..NORMAL_BAND_TOP across the gate chain) is
// mapped proportionally into the tier's band by tierMonsterLevel — wave
// composition, budgets, and floor scaling are untouched, so the same seed at
// a different tier is the identical battle with different stats. Elite's band
// deliberately climbs PAST the player's LEVEL_CAP (30): late Elite is the
// gear-checked forever-challenge, not a parity fight.
//
// The unlock ladder is per dungeon: clear its Normal → Hard opens; clear its
// Hard → Elite opens (isTierUnlocked; the cleared flags live in the save as
// DungeonProgress.clearedTiers). Reward numbers live in meta/economy.ts
// (TIER_REWARDS) — this module is band data only.
// ============================================================================

export type TierId = "normal" | "hard" | "elite";

/** Ladder order (unlock + UI pill order). */
export const TIER_IDS: readonly TierId[] = ["normal", "hard", "elite"];

export const TIER_LABEL: Record<TierId, string> = {
  normal: "Normal",
  hard: "Hard",
  elite: "Elite",
};

/** Top of the Normal band: the chain's monsterLevel values span 1..20. */
export const NORMAL_BAND_TOP = 20;

/** Monster-level band per tier; null = use the dungeon's own monsterLevel. */
export const TIER_BANDS = {
  normal: null,
  hard: [25, 30],
  elite: [30, 40],
} as const satisfies Record<TierId, readonly [number, number] | null>;

/** A dungeon's fodder level at `tier`: its Normal chain position (monsterLevel
 *  1..NORMAL_BAND_TOP) mapped proportionally into the tier's band. The Depths
 *  (m=1) opens each band; the fork dungeons (m=20) cap it. */
export function tierMonsterLevel(monsterLevel: number, tier: TierId): number {
  const band = TIER_BANDS[tier];
  if (!band) return monsterLevel;
  const t = Math.min(1, Math.max(0, (monsterLevel - 1) / (NORMAL_BAND_TOP - 1)));
  return Math.round(band[0] + (band[1] - band[0]) * t);
}

/** The tier below on the ladder (null for Normal). */
export function prevTier(tier: TierId): TierId | null {
  const i = TIER_IDS.indexOf(tier);
  return i > 0 ? TIER_IDS[i - 1] : null;
}

/** The tier above on the ladder (null for Elite). */
export function nextTier(tier: TierId): TierId | null {
  const i = TIER_IDS.indexOf(tier);
  return i >= 0 && i < TIER_IDS.length - 1 ? TIER_IDS[i + 1] : null;
}

/** Per-dungeon ladder gate: Normal is always open; Hard/Elite need the tier
 *  below cleared IN THIS DUNGEON. `isCleared` abstracts the save (this module
 *  stays persistence-free, like isDungeonUnlocked). */
export function isTierUnlocked(
  tier: TierId,
  isCleared: (tier: TierId) => boolean
): boolean {
  const prev = prevTier(tier);
  return prev == null || isCleared(prev);
}
