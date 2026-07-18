// ============================================================================
// Leveling data — every tunable number for unit XP/levels lives here.
// Pure data + pure math: imports nothing (like economy.ts), so persistence,
// rewards, the engine, and the UI can all read it without cycles. Levels are
// the player-side counter-curve to monster levels + floor scaling (+6% HP /
// +4% dmg per floor, see data/dungeons.ts). The cap spans the whole difficulty
// ladder: Normal dungeons band monsters 1–20, Hard 25–30, Elite 30–40 —
// Elite runs past the player cap on purpose (data/tiers.ts).
// ============================================================================

export const LEVEL_CAP = 30;

/** Per-level stat growth. Mirrors what enemy floor scaling bakes (HP + damage
 *  only — attack/move speed untouched on both sides). */
export const LEVEL_HP_PER_LEVEL = 0.05;
export const LEVEL_DMG_PER_LEVEL = 0.03;

/** XP to go from level L to L+1 costs 50×L, so the cumulative total to REACH
 *  level L is 25·(L−1)·L. Waypoints: Lv 10 = 2,250, Lv 20 = 9,500, Lv 30
 *  (the cap) = 21,750. Early levels come fast (the honeymoon), the cap is a
 *  commitment. */
export function totalXpForLevel(level: number): number {
  return 25 * (level - 1) * level;
}

/** Total XP at which a unit is maxed; stored XP is clamped here. */
export const TOTAL_XP_CAP = totalXpForLevel(LEVEL_CAP); // 21,750

/** Level for a total-XP amount, clamped to [1, LEVEL_CAP]. */
export function levelFromXp(totalXp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && totalXp >= totalXpForLevel(level + 1)) level++;
  return level;
}

/** XP progress within the current level (0 at a fresh level-up). */
export function xpIntoLevel(totalXp: number): number {
  return Math.max(0, totalXp - totalXpForLevel(levelFromXp(totalXp)));
}

/** XP needed to fill the current level's bar, or null at the cap. */
export function xpForNext(totalXp: number): number | null {
  const level = levelFromXp(totalXp);
  if (level >= LEVEL_CAP) return null;
  return totalXpForLevel(level + 1) - totalXpForLevel(level);
}

/** The single clamp shared by the save-side grant fold and the RewardPanel
 *  preview, so the animated "after" always equals the persisted value. */
export function addXp(total: number, gained: number): number {
  return Math.min(TOTAL_XP_CAP, Math.max(0, total) + Math.max(0, gained));
}

/** Stat multipliers baked into a unit at spawn (createUnit). Level 1 is the
 *  exact identity, so unleveled play is byte-identical to pre-leveling. */
export function levelStatMultipliers(level: number): { hp: number; dmg: number } {
  return {
    hp: 1 + LEVEL_HP_PER_LEVEL * (level - 1),
    dmg: 1 + LEVEL_DMG_PER_LEVEL * (level - 1),
  };
}

/** Battle XP, granted to EVERY unit in the deck at match end (full amount, no
 *  participation tracking). Dungeon wins scale by floor — fighting at your
 *  edge is always the best XP; replays pay full (XP is the grind currency,
 *  unlike first-clear gold). Losses/draws pay lossFrac so a failed attempt
 *  still inches the deck toward the level that beats it. */
export const XP_REWARDS = {
  dungeonWinBase: 20,
  dungeonWinPerFloor: 10,
  lossFrac: 0.4, // dungeon loss/draw = round(lossFrac × the floor's win XP)
  arenaWin: 25,
  arenaLoss: 10,
  endlessBase: 10,
  endlessPerWave: 8, // granted at the (always-eventual) wipe, like ENDLESS_GOLD
} as const;

/** Arena AI mirror: the enemy deck fights at the player's average deck level
 *  (rounded), so arena stays a fair fight at any progression point. Takes a
 *  per-defId LEVEL map (missing ids count as level 1), not raw XP. */
export function averageDeckLevel(
  deck: readonly string[],
  unitLevels: Record<string, number>
): number {
  if (deck.length === 0) return 1;
  const sum = deck.reduce((acc, id) => acc + (unitLevels[id] ?? 1), 0);
  return Math.round(sum / deck.length);
}
