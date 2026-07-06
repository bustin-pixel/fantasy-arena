// ============================================================================
// THE DEPTHS — floor / wave data
// Declarative tuning for the PvE descent. The WaveController reads these to
// build a floor's monster queue; nothing here runs inside the tick loop.
//
// Floors roll out the bestiary in themed tiers; every BOSS_FLOOR_INTERVAL-th
// floor appends the tier's boss to the end of the wave (it emerges once the
// fodder has thinned). Wave sizes are budget-driven, mirroring the AIDeck
// cost model: deeper floor → bigger budget → more / meatier monsters.
// ============================================================================

export interface DepthsTier {
  /** Inclusive floor range this tier covers. */
  floors: [number, number];
  /** Monster id → wave-budget cost. Cheap fodder fills a wave; costly
   *  monsters make it meaner. */
  monsters: Record<string, number>;
  /** Boss appended on boss floors (every 5th). */
  boss: string;
}

/** Every 5th floor is a boss floor. */
export const BOSS_FLOOR_INTERVAL = 5;

/** Fraction of a boss floor's budget spent on fodder (the rest is the boss).
 *  Kept high — the winrate sweep showed halving the horde made boss floors
 *  EASIER than the floor before them. */
export const BOSS_FLOOR_FODDER_SHARE = 0.7;

/** Seconds between trickle-spawns while the field has room. */
export const WAVE_SPAWN_INTERVAL_SEC = 0.5;

// ---------------------------------------------------------------------------
// Per-floor stat scaling — the depth pressure dial. Monsters spawn with these
// linear multipliers so floor 1 matches the bestiary exactly and every floor
// deeper is meaner. HP climbs faster than damage on purpose: tankier monsters
// saturate the field and create pressure, while damage growth is what makes
// player deaths feel cheap. When unit levels/items land, they become the
// player-side counter-curve to this.
// ---------------------------------------------------------------------------

/** Extra monster HP per floor past 1 (linear, +8%/floor). */
export const DEPTHS_HP_PER_FLOOR = 0.08;
/** Extra monster damage per floor past 1 (linear, +5%/floor). */
export const DEPTHS_DMG_PER_FLOOR = 0.05;

/** Stat multipliers for monsters spawned on `floor` (bosses included). */
export function floorStatMultipliers(floor: number): { hp: number; dmg: number } {
  const depth = Math.max(0, floor - 1);
  return {
    hp: 1 + DEPTHS_HP_PER_FLOOR * depth,
    dmg: 1 + DEPTHS_DMG_PER_FLOOR * depth,
  };
}

/**
 * The tier rollout. Only the fodder tier exists so far (Depths slice 1);
 * later tiers (undead / deep crypt / the throne) slot in as their monsters
 * are built. Floors past the last tier reuse it.
 */
export const DEPTHS_TIERS: DepthsTier[] = [
  {
    floors: [1, 5],
    // Cheap costs keep early waves swarmy — floor 1 (budget 13) rolls a dozen
    // or so bodies rather than a handful of expensive ones.
    monsters: { giant_rat: 1, skeleton: 1, zombie_shambler: 2 },
    boss: "bloater",
  },
];

export function tierForFloor(floor: number): DepthsTier {
  for (const tier of DEPTHS_TIERS) {
    if (floor >= tier.floors[0] && floor <= tier.floors[1]) return tier;
  }
  return DEPTHS_TIERS[DEPTHS_TIERS.length - 1];
}

/** Total wave budget for a floor — the length dial (stat scaling above is the
 *  difficulty dial). High baseline + gentle growth: every floor is a real
 *  horde (~28 bodies on floor 1), while attrition ramps via stat scaling. */
export function waveBudget(floor: number): number {
  return 25 + floor * 3;
}

export function isBossFloor(floor: number): boolean {
  return floor % BOSS_FLOOR_INTERVAL === 0;
}

// ---------------------------------------------------------------------------
// Rare-spawn "fusion" quests — a rare legendary enemy appears on a specific
// floor; defeating it while fielding the `requires` unit unlocks the PURCHASE
// of the reward unit (at the discounted `price`). This is the ONLY way to make
// the reward buyable — it never drops from chests and can't be bought before
// the quest is done (enforced in meta/rewards + state). The spawn is pure
// (seed, floor): the WaveController rolls `chance` per run, so a fresh match
// seed each attempt makes it a genuine rare appearance regardless of deck.
// ---------------------------------------------------------------------------

export interface RareSpawnQuest {
  /** Depths floor the rare enemy appears on. */
  floor: number;
  /** Enemy id appended to that floor's wave (rarely). */
  spawnId: string;
  /** Spawn probability, rolled once per run of `floor`. */
  chance: number;
  /** Player unit that must be in the fielded warband to earn the unlock. */
  requires: string;
  /** Unit id whose PURCHASE this quest unlocks. */
  unlocks: string;
  /** Discounted gold price once unlocked (overrides UNLOCK_PRICES). */
  price: number;
  /** Deliberately-vague rumor shown on the locked Collection card — a thread to
   *  pull, NOT a checklist. Never spell out the exact floor / kill / requirement;
   *  discovery is the point. (The 🔒 is added by the UI.) */
  hint: string;
}

/** Knight + Slime = Slime Knight: beat the rare Slime on Floor 5 with a Knight
 *  fielded to unlock buying the Slime Knight at a discount. */
export const RARE_SPAWN_QUESTS: RareSpawnQuest[] = [
  {
    floor: 5,
    spawnId: "slime",
    chance: 0.15,
    requires: "knight",
    unlocks: "slime_knight",
    price: 2500,
    hint: "They say a knight who fells a rare ooze in The Depths may take on its unliving form.",
  },
];

/** The rare-spawn quest that appears on `floor`, if any. */
export function rareSpawnQuestForFloor(floor: number): RareSpawnQuest | undefined {
  return RARE_SPAWN_QUESTS.find((q) => q.floor === floor);
}

// QUEST_LOCKED_UNITS and questForUnlock moved to data/dungeons.ts — they must
// span EVERY dungeon's quest, not just The Depths'. This module stays the home
// of the shared shapes (DepthsTier, RareSpawnQuest) + the Depths' own tuning.
