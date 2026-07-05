// ============================================================================
// Battle rewards — pure, seeded, meta-layer only.
// The sim never learns about rewards: the React layer calls these AFTER a
// match resolves, with a chest seed generated at drop time (generateSeed()
// in the caller, never here). Same seed + same inputs → identical contents,
// so a future server can re-roll and verify any claimed drop.
// ============================================================================

import type { BattleMode } from "@/hooks/useBattleEngine"; // type-only: erased at runtime
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import {
  isBossFloor,
  QUEST_LOCKED_UNITS,
  rareSpawnQuestForFloor,
} from "@/data/depths";
import { RNG } from "@/utils/rng";
import {
  CHEST_GOLD_RANGE,
  CHEST_UNIT_CHANCE,
  DUPLICATE_GOLD,
  GOLD_REWARDS,
  type ChestTier,
} from "./economy";

/** One thing inside a chest. A discriminated union so later slices can add
 *  entries (e.g. { kind: "item" }) without touching existing code — contents
 *  are granted instantly and never persisted, so there's no migration. */
export type ChestContent =
  | { kind: "gold"; amount: number }
  | { kind: "unit"; unitId: string }
  | { kind: "duplicate"; unitId: string; gold: number };

export interface ChestResult {
  tier: ChestTier;
  /** The drop-time seed the contents were rolled from — kept for audit. */
  seed: number;
  contents: ChestContent[];
}

export interface BattleRewards {
  /** Flat battle gold (chest gold lives inside the chest contents). */
  gold: number;
  chest: ChestResult | null;
  /** Depths only: this victory beat the player's high-water floor. Drives
   *  the progress bump and the milestone unlock. */
  firstClear: boolean;
  /** A rare-spawn quest was completed this battle: the id of the unit whose
   *  PURCHASE is now unlocked (discounted). Present only the first time it's
   *  earned — left undefined otherwise so exact reward comparisons stay stable. */
  questUnlock?: string;
}

/** Roll a chest's contents. Pure: same (seed, tier, unlockedUnits) → same
 *  contents. Unit drops roll from the FULL deckable pool weighted by rarity
 *  deckWeight — already-owned units convert to gold. */
export function rollChest(
  seed: number,
  tier: ChestTier,
  unlockedUnits: readonly string[]
): ChestContent[] {
  const rng = new RNG(seed);
  const [min, max] = CHEST_GOLD_RANGE[tier];
  const contents: ChestContent[] = [{ kind: "gold", amount: rng.int(min, max) }];

  if (rng.next() < CHEST_UNIT_CHANCE[tier]) {
    const unitId = pickWeightedUnit(rng);
    if (unlockedUnits.includes(unitId)) {
      const rarity = getUnitDef(unitId).rarity;
      contents.push({ kind: "duplicate", unitId, gold: DUPLICATE_GOLD[rarity] });
    } else {
      contents.push({ kind: "unit", unitId });
    }
  }
  return contents;
}

/** Chest-droppable pool: deckables minus quest-locked units (those are earned
 *  by their rare-spawn quest and bought — they never drop). Stable order. */
const CHEST_POOL = DECKABLE_UNIT_IDS.filter((id) => !QUEST_LOCKED_UNITS.has(id));

/** Weighted pick over the chest pool (rare-heavy, like AI-deck rolls).
 *  Iterates CHEST_POOL in its stable declaration order. */
function pickWeightedUnit(rng: RNG): string {
  let total = 0;
  for (const id of CHEST_POOL) {
    total += RARITIES[getUnitDef(id).rarity].deckWeight;
  }
  let roll = rng.next() * total;
  for (const id of CHEST_POOL) {
    roll -= RARITIES[getUnitDef(id).rarity].deckWeight;
    if (roll < 0) return id;
  }
  return CHEST_POOL[CHEST_POOL.length - 1];
}

/** The full post-battle reward matrix. Callers pass chestSeed from
 *  generateSeed() at drop time so this stays pure. */
export function computeBattleRewards(input: {
  mode: BattleMode;
  floor: number;
  outcome: "victory" | "defeat" | "draw";
  unlockedUnits: readonly string[];
  highestClearedFloor: number;
  chestSeed: number;
  /** The warband fielded this battle — for rare-spawn quest `requires` checks. */
  deck?: readonly string[];
  /** Enemy defIds that died this battle (the battle ledger's `slain`). */
  slain?: readonly string[];
  /** Rare-spawn quests already completed, so a repeat kill doesn't re-announce. */
  questUnlocks?: readonly string[];
}): BattleRewards {
  const {
    mode,
    floor,
    outcome,
    unlockedUnits,
    highestClearedFloor,
    chestSeed,
    deck = [],
    slain = [],
    questUnlocks = [],
  } = input;
  const none: BattleRewards = { gold: 0, chest: null, firstClear: false };

  // PvP is scaffolding only; server-authoritative rewards replace this later.
  if (mode === "pvp") return none;

  if (mode === "depths") {
    // Rare-spawn "fusion" quest: clearing the rare enemy while fielding the
    // required unit unlocks the reward's PURCHASE. Counts on a loss too — "clear
    // it during the floor". Announced once: skip if already unlocked or owned.
    const quest = rareSpawnQuestForFloor(floor);
    const questUnlock =
      quest &&
      slain.includes(quest.spawnId) &&
      deck.includes(quest.requires) &&
      !questUnlocks.includes(quest.unlocks) &&
      !unlockedUnits.includes(quest.unlocks)
        ? quest.unlocks
        : undefined;

    if (outcome !== "victory") {
      return { ...none, gold: GOLD_REWARDS.depthsLoss, questUnlock };
    }
    const firstClear = floor > highestClearedFloor;
    if (!firstClear) {
      return { ...none, gold: GOLD_REWARDS.depthsReplay, questUnlock };
    }
    const tier: ChestTier = isBossFloor(floor) ? "silver" : "wooden";
    return {
      gold:
        GOLD_REWARDS.depthsFirstClearBase +
        GOLD_REWARDS.depthsFirstClearPerFloor * floor,
      chest: { tier, seed: chestSeed, contents: rollChest(chestSeed, tier, unlockedUnits) },
      firstClear: true,
      questUnlock,
    };
  }

  // Arena ("solo").
  if (outcome !== "victory") {
    return { ...none, gold: GOLD_REWARDS.arenaLoss };
  }
  return {
    gold: GOLD_REWARDS.arenaWin,
    chest: {
      tier: "wooden",
      seed: chestSeed,
      contents: rollChest(chestSeed, "wooden", unlockedUnits),
    },
    firstClear: false,
  };
}
