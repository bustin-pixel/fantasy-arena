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
 *  and draws pay a consolation — never zero. Depths payouts were bumped ~1.5–2×
 *  with the floor rebalance (floors got 2–3× longer; keeps gold/min ≈ flat). */
export const GOLD_REWARDS = {
  depthsFirstClearBase: 50,
  depthsFirstClearPerFloor: 15,
  depthsReplay: 30,
  depthsLoss: 15,
  arenaWin: 40,
  arenaLoss: 10,
} as const;

/** Endless survival payout: a flat base plus per-wave-survived gold, granted
 *  regardless of the (always-eventual) wipe. Comparable gold/min to Depths. */
export const ENDLESS_GOLD = {
  base: 20,
  perWave: 8,
} as const;

/** The chest tier for crossing a NEW best-wave milestone (every 5 waves), or null
 *  if this run didn't push past a milestone the player had already banked. One
 *  chest per run at most: the highest fresh multiple of 5 in (prevBest, survived].
 *  Deeper milestones give fatter chests. */
export function endlessMilestoneChestTier(
  prevBest: number,
  wavesSurvived: number
): ChestTier | null {
  const milestone = Math.floor(wavesSurvived / 5) * 5; // 0, 5, 10, 15, …
  if (milestone <= 0) return null;
  if (milestone <= Math.floor(prevBest / 5) * 5) return null; // already banked
  if (milestone >= 20) return "arcane";
  if (milestone >= 10) return "gold";
  return "silver"; // milestone === 5
}

/** Ascending order. Wooden/silver drop from ordinary floors and Depths bosses;
 *  gold from themed-dungeon deep bosses; arcane/dragon cap the dungeon chain
 *  (Deep Forge / Eclipse Spire boss first-clears — bossChestTierFor in
 *  meta/rewards.ts) plus arcane from deep endless milestones. */
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

// ---------------------------------------------------------------------------
// Items — ACQUISITION numbers (drop odds, merge costs, shard economy). Item
// POWER numbers live in data/items.ts; keep the split.
// ---------------------------------------------------------------------------

/** Chance a chest contains an item drop (rolled after gold/unit, so legacy
 *  chest seeds keep their old contents byte-identical). Buffed 2026-07-12 —
 *  the repeatable grind (arena woodens) was starving the merge ladder. */
export const ITEM_DROP_CHANCE: Record<ChestTier, number> = {
  wooden: 0.5,
  silver: 0.65,
  gold: 0.8,
  arcane: 1,
  dragon: 1,
};

/** Item pity: after this many consecutive itemless chests, the next chest is
 *  FORCED to contain an item (rollChest opts.forceItem). The counter lives in
 *  the save (itemPity) and resets whenever any chest drops an item. */
export const ITEM_PITY_THRESHOLD = 3;

/** Item QUALITY odds by chest tier (normalized weights). Low chests feed the
 *  rare merge ladder; arcane/dragon can shortcut straight to epic/legendary —
 *  without direct high drops, a legendary 3★ would take 256 rare copies. */
export const ITEM_QUALITY_WEIGHTS: Record<ChestTier, Record<Rarity, number>> = {
  wooden: { rare: 1, epic: 0, legendary: 0 },
  silver: { rare: 1, epic: 0, legendary: 0 },
  gold: { rare: 0.7, epic: 0.3, legendary: 0 },
  arcane: { rare: 0.35, epic: 0.55, legendary: 0.1 },
  dragon: { rare: 0.15, epic: 0.55, legendary: 0.3 },
};

/** Extra roll on a themed-dungeon BOSS chest for that dungeon's signature
 *  line (quality from the same tier weights). */
export const SIGNATURE_DROP_CHANCE = 0.35;

/** Merge fee, keyed by the FUEL pair's quality and star (index star−1). Two
 *  3★ pay the quality-up fee. Gold funds the rare/epic climb; everything that
 *  produces or improves a LEGENDARY costs Soul Shards. Legendary 3★ is the
 *  cap (its slot is unreachable — mergeCost returns null there). */
export const MERGE_COSTS: Record<
  Rarity,
  { gold: [number, number, number]; shards: [number, number, number] }
> = {
  rare: { gold: [100, 200, 400], shards: [0, 0, 0] },
  epic: { gold: [600, 900, 0], shards: [0, 0, 20] },
  legendary: { gold: [0, 0, 0], shards: [30, 50, 0] },
};

/** Soul Shard grants — every source is a ONE-TIME monotonic signal (first
 *  clears, fresh endless milestones), so the reward fold stays idempotent
 *  without a claims ledger. The repeatable drip lives in SHARD_CHEST_DRIP. */
export const SHARD_REWARDS = {
  /** Any dungeon's non-boss floor, first clear. */
  floorFirstClear: 3,
  /** A dungeon boss floor, first clear. */
  bossFirstClear: 15,
  /** The chain capstones (Deep Forge / Eclipse Spire bosses), first clear. */
  bossFirstClearCapstone: 25,
  /** Per FRESH 5-wave endless milestone crossed in one run. */
  endlessPerMilestone: 8,
} as const;

/** Dungeons whose boss first-clear pays the capstone shard grant. */
export const CAPSTONE_DUNGEON_IDS = ["deep_forge", "eclipse_spire"] as const;

/** Repeatable shard drip inside top-tier chests (seeded roll in rollChest). */
export const SHARD_CHEST_DRIP: Partial<
  Record<ChestTier, { chance: number; range: [number, number] }>
> = {
  arcane: { chance: 0.35, range: [3, 6] },
  dragon: { chance: 0.6, range: [6, 12] },
};

// ---------------------------------------------------------------------------
// Shop (Grubbins' pawn-den) — daily-stock acquisition numbers. The stock roll
// and purchase folds live in meta/shop.ts; these are the tunables.
// ---------------------------------------------------------------------------

/** Gold price per offered quality. Sits deliberately ABOVE the duplicate-gold
 *  conversion (80/240) so a shop buy never reads as cheaper than a chest dupe.
 *  Legendary quality is never sold — that stays a merge/dungeon achievement. */
export const SHOP_PRICES: Record<"rare" | "epic", number> = {
  rare: 250,
  epic: 750,
};

/** Chance an offered slot rolls epic quality (else rare). */
export const SHOP_EPIC_CHANCE = 0.25;

/** Gold price to re-roll the whole shelf (allowed only before the day's
 *  first purchase — see applyShopReroll). */
export const SHOP_REROLL_COST = 200;

/** Paid rerolls per day. */
export const SHOP_REROLLS_PER_DAY = 1;

/** Premium shelf — DISPLAY-ONLY stub ("the mint isn't open yet"): there is no
 *  payment path, no grants, no prices. Real packs arrive with accounts/backend. */
export const SHOP_PREMIUM_PACKS: readonly {
  id: string;
  kind: "shards" | "gold";
  amount: number;
  label: string;
}[] = [
  { id: "shards_s", kind: "shards", amount: 40, label: "Fistful of Shards" },
  { id: "shards_m", kind: "shards", amount: 110, label: "Pouch of Shards" },
  { id: "shards_l", kind: "shards", amount: 260, label: "Casket of Shards" },
  { id: "gold_s", kind: "gold", amount: 1200, label: "Coin Purse" },
  { id: "gold_m", kind: "gold", amount: 3200, label: "Coin Chest" },
  { id: "gold_l", kind: "gold", amount: 8000, label: "Dragon's Hoard" },
];

// ---------------------------------------------------------------------------
// Quest board (the bulletin board) — daily-notice acquisition numbers. The
// board roll and progress/claim folds live in meta/quests.ts; these are the
// tunables.
// ---------------------------------------------------------------------------

/** Notices pinned on the daily board. */
export const QUEST_BOARD_SIZE = 4;

/** Accepted quests the player can carry at once. */
export const QUEST_ACTIVE_MAX = 3;

/** Gold price per manual board refresh AFTER the daily free one. */
export const QUEST_REFRESH_COST = 100;

/** Free manual refreshes per day (further refreshes cost gold, uncapped). */
export const QUEST_FREE_REFRESHES = 1;

export type QuestDifficulty = "easy" | "medium" | "hard";

/** Board difficulty mix (normalized weights): hard quests — the gold-chest
 *  payouts — stay the rare big asks. */
export const QUEST_DIFFICULTY_WEIGHTS: Record<QuestDifficulty, number> = {
  easy: 0.45,
  medium: 0.35,
  hard: 0.2,
};

/** Flat gold paid on claim, rolled uniformly in range at board-roll time. */
export const QUEST_GOLD_RANGE: Record<QuestDifficulty, [number, number]> = {
  easy: [60, 90],
  medium: [120, 180],
  hard: [200, 300],
};

/** Chest tier paid on claim — every quest pays a chest (locked design
 *  decision: harder notices climb the tier ladder, capped at gold; arcane/
 *  dragon stay dungeon-capstone achievements). */
export const QUEST_CHEST_TIER: Record<QuestDifficulty, ChestTier> = {
  easy: "wooden",
  medium: "silver",
  hard: "gold",
};

/** How many FRESH 5-wave milestones this endless run crossed — the shard twin
 *  of endlessMilestoneChestTier (which pays one chest for the deepest); shards
 *  pay per milestone (a 3→12 run banks the 5 AND 10 marks). */
export function freshMilestonesCrossed(
  prevBest: number,
  wavesSurvived: number
): number {
  return Math.max(
    0,
    Math.floor(wavesSurvived / 5) - Math.floor(Math.max(0, prevBest) / 5)
  );
}
