// ============================================================================
// Slayer data — every tunable number for compendium slayer XP lives here.
// Pure data + pure math: imports nothing (like leveling.ts), so persistence,
// the engine wiring, and the UI can all read it without cycles. Lifetime
// kills per monster defId (PlayerSave.monsterKills) derive a slayer level;
// each level adds team-wide bonus damage against exactly that monster.
// Levels are ALWAYS derived from kills — never stored (the unitXp rule).
// ============================================================================

export const SLAYER_LEVEL_CAP = 5;

/** Cumulative kills to REACH slayer level i+1. Level 1 lands within a run or
 *  two of farming a dungeon's commons; 200 is the completionist long tail
 *  (and, for bosses at ~1 kill/clear, deliberate prestige). */
export const SLAYER_KILL_THRESHOLDS = [10, 25, 50, 100, 200] as const;

/** Bonus outgoing damage per slayer level: +2%/level, +10% at the cap. */
export const SLAYER_DMG_PER_LEVEL = 0.02;

/** Slayer level for a lifetime kill count, clamped to [0, SLAYER_LEVEL_CAP]. */
export function slayerLevelFromKills(kills: number): number {
  let level = 0;
  while (level < SLAYER_LEVEL_CAP && kills >= SLAYER_KILL_THRESHOLDS[level]) {
    level++;
  }
  return level;
}

/** Cumulative kills needed to reach a level (0 for level 0). */
export function killsForSlayerLevel(level: number): number {
  if (level <= 0) return 0;
  return SLAYER_KILL_THRESHOLDS[Math.min(level, SLAYER_LEVEL_CAP) - 1];
}

/** Damage multiplier vs the monster: exactly 1 below the first threshold, so
 *  slayer-less play is byte-identical to pre-feature sims. */
export function slayerDmgMult(kills: number): number {
  return 1 + SLAYER_DMG_PER_LEVEL * slayerLevelFromKills(kills);
}

/** Progress-bar helper: current level, kills past its threshold, and kills
 *  still needed for the next level (null at the cap). */
export function slayerProgress(kills: number): {
  level: number;
  into: number;
  needed: number | null;
} {
  const level = slayerLevelFromKills(kills);
  const into = Math.max(0, kills - killsForSlayerLevel(level));
  if (level >= SLAYER_LEVEL_CAP) return { level, into, needed: null };
  return { level, into, needed: SLAYER_KILL_THRESHOLDS[level] - kills };
}

/** Resolve a lifetime-kill record into the defId → damage-multiplier table
 *  the match takes as input (MatchOptions.slayerBonuses). Only monsters at
 *  level ≥ 1 get an entry — a missing id means identity, so an empty table
 *  is the pre-feature sim. Input is assumed pre-filtered to trackable ids
 *  (SLAYER_MONSTER_IDS — persistence sanitizes on load, battleGrant on fold),
 *  keeping this module import-free. */
export function buildSlayerBonusTable(
  kills: Record<string, number>
): Record<string, number> {
  const table: Record<string, number> = {};
  for (const [id, n] of Object.entries(kills)) {
    if (slayerLevelFromKills(n) >= 1) table[id] = slayerDmgMult(n);
  }
  return table;
}
