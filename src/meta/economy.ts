// ============================================================================
// Economy data — every tunable number in the meta-layer economy lives here.
// Pure data: imports only from data/ and types (never state/ or engine/), so
// the persistence layer and the rewards module can both read it without
// cycles. All numbers are first-pass straw-men; tune here, nowhere else.
// ============================================================================

import type { Rarity } from "@/types";

/** Units a brand-new save starts with. Grandfathered saves (version < 3)
 *  instead unlock everything that existed at migration time. */
export const STARTER_UNIT_IDS = [
  "ogre",
  "archer",
  "knight",
  "fire_mage",
] as const;

/** Gold price to unlock a locked unit from the Collection. */
export const UNLOCK_PRICES: Record<Rarity, number> = {
  rare: 400,
  epic: 1200,
  legendary: 4000,
};

/** Gold refunded when a chest rolls a unit the player already owns (20% of
 *  the unlock price). */
export const DUPLICATE_GOLD: Record<Rarity, number> = {
  rare: 80,
  epic: 240,
  legendary: 800,
};

/** Flat battle gold. First clears pay base + perFloor×floor; replays pay a
 *  trickle so farming is possible but descending is always optimal. Losses
 *  and draws pay a consolation — never zero. */
export const GOLD_REWARDS = {
  depthsFirstClearBase: 50,
  depthsFirstClearPerFloor: 10,
  depthsReplay: 15,
  depthsLoss: 10,
  arenaWin: 40,
  arenaLoss: 10,
} as const;

/** Ascending order. Wooden/silver drop today; gold is reserved for deep
 *  bosses (Depths slice 2); arcane and dragon are the far-future top of the
 *  ladder (deepest bosses / premium — see progress.md slices 2 & 5). */
export type ChestTier = "wooden" | "silver" | "gold" | "arcane" | "dragon";

/** Chance a chest contains a unit unlock (rolled from the FULL deckable pool,
 *  so duplicates are possible by design — they convert to gold). */
export const CHEST_UNIT_CHANCE: Record<ChestTier, number> = {
  wooden: 0.1,
  silver: 0.25,
  gold: 0.5,
  arcane: 0.75,
  dragon: 1,
};

/** Bonus gold inside a chest, on top of the flat battle gold. */
export const CHEST_GOLD_RANGE: Record<ChestTier, [number, number]> = {
  wooden: [20, 40],
  silver: [60, 100],
  gold: [150, 250],
  arcane: [350, 550],
  dragon: [700, 1100],
};

/** Designer-controlled free unlocks: floor → unit id, granted on that floor's
 *  FIRST clear. Ids, not display names ("healer" shows as Cleric). Keep every
 *  value deckable and outside STARTER_UNIT_IDS (spec-enforced). */
export const MILESTONE_UNLOCKS: Record<number, string> = {
  2: "warrior", // rare bruiser — first taste of progression
  3: "mage", // rare crowd control
  4: "healer", // rare support — teaches sustain before the boss
  5: "berserker", // epic — reward for downing the Bloater
};
