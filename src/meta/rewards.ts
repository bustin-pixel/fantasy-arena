// ============================================================================
// Battle rewards — pure, seeded, meta-layer only.
// The sim never learns about rewards: the React layer calls these AFTER a
// match resolves, with a chest seed generated at drop time (generateSeed()
// in the caller, never here). Same seed + same inputs → identical contents,
// so a future server can re-roll and verify any claimed drop.
// ============================================================================

import type { BattleMode } from "@/hooks/useBattleEngine"; // type-only: erased at runtime
import type { ItemLoadouts } from "@/types";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { questRequiredUnits, questUnlockIds } from "@/data/depths";
import { RARITIES } from "@/data/rarities";
import {
  getDungeon,
  isBossFloorIn,
  QUEST_LOCKED_UNITS,
  questForFloorIn,
} from "@/data/dungeons";
import {
  BASE_LINES_BY_SLOT,
  ITEM_SLOTS,
  luckyCoinBonus,
  makeItemKey,
  signatureLineFor,
  type ItemQuality,
} from "@/data/items";
import { RNG } from "@/utils/rng";
import {
  BOSS_REPLAY_CHEST_CHANCE,
  CAPSTONE_DUNGEON_IDS,
  CHEST_GOLD_RANGE,
  CHEST_UNIT_CHANCE,
  DUPLICATE_GOLD,
  ENDLESS_GOLD,
  endlessMilestoneChestTier,
  freshMilestonesCrossed,
  GOLD_REWARDS,
  ITEM_DROP_CHANCE,
  ITEM_PITY_THRESHOLD,
  ITEM_QUALITY_WEIGHTS,
  replayGoldFor,
  SHARD_CHEST_DRIP,
  SHARD_REWARDS,
  SIGNATURE_DROP_CHANCE,
  type ChestTier,
} from "./economy";
import { XP_REWARDS } from "./leveling";

/** One thing inside a chest. A discriminated union so later slices can add
 *  entries without touching existing code — contents are granted instantly
 *  and never persisted, so there's no migration. Items drop at 1★ (stars come
 *  from merging, never from drops). */
export type ChestContent =
  | { kind: "gold"; amount: number }
  | { kind: "unit"; unitId: string }
  | { kind: "duplicate"; unitId: string; gold: number }
  | { kind: "item"; lineId: string; quality: ItemQuality }
  | { kind: "shards"; amount: number };

export interface ChestResult {
  tier: ChestTier;
  /** The drop-time seed the contents were rolled from — kept for audit. */
  seed: number;
  contents: ChestContent[];
}

export interface BattleRewards {
  /** Flat battle gold (chest gold lives inside the chest contents). */
  gold: number;
  /** Battle XP, granted in full to EVERY unit in the fielded deck (the grant
   *  fold in GameStateContext caps each unit at TOTAL_XP_CAP). Dungeon wins
   *  scale by floor; losses pay a fraction; replays pay full — XP is the
   *  grind currency, unlike first-clear gold. */
  xp: number;
  chest: ChestResult | null;
  /** Soul Shards earned this battle. Every source is a one-time monotonic
   *  signal (first clears, fresh endless milestones) so re-running the fold
   *  can't double-pay; the repeatable drip lives INSIDE chest contents. */
  shards: number;
  /** Depths only: this victory beat the player's high-water floor. Drives
   *  the progress bump and the milestone unlock. */
  firstClear: boolean;
  /** A rare-spawn quest was completed this battle: the unit id(s) whose
   *  PURCHASE is now unlocked (discounted) — the Sealed Vault pays out two.
   *  Present (non-empty) only the first time each is earned — left undefined
   *  otherwise so exact reward comparisons stay stable. */
  questUnlocks?: string[];
}

/** Roll a chest's contents. Pure: same (seed, tier, unlockedUnits, opts) →
 *  same contents. Unit drops roll from the FULL deckable pool weighted by
 *  rarity deckWeight — already-owned units convert to gold.
 *
 *  The item-era rolls (shard drip → item → dungeon signature) are APPENDED
 *  after the legacy gold/unit rolls, so any pre-items seed keeps its old
 *  gold/unit contents byte-identical. `opts.dungeonId` enables the extra
 *  signature-line roll (themed BOSS chests only — callers gate it).
 *
 *  `opts.forceItem` is the pity valve: the item roll still CONSUMES its
 *  rng.next() (so a non-forced roll from the same seed stays byte-identical)
 *  but the outcome is treated as a hit regardless. */
export function rollChest(
  seed: number,
  tier: ChestTier,
  unlockedUnits: readonly string[],
  opts?: { dungeonId?: string; forceItem?: boolean }
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

  // Repeatable Soul Shard drip (top tiers only — see SHARD_CHEST_DRIP).
  const drip = SHARD_CHEST_DRIP[tier];
  if (drip && rng.next() < drip.chance) {
    contents.push({ kind: "shards", amount: rng.int(drip.range[0], drip.range[1]) });
  }

  // Item drop: slot first (so 6 weapons aren't drowned by 8 trinkets), then a
  // uniform line within the slot; quality weighted by tier. The chance roll
  // happens unconditionally so forceItem never desyncs the stream.
  const itemHit = rng.next() < ITEM_DROP_CHANCE[tier];
  if (itemHit || opts?.forceItem) {
    const quality = pickWeightedQuality(rng, tier);
    const slot = ITEM_SLOTS[rng.int(0, ITEM_SLOTS.length - 1)];
    const pool = BASE_LINES_BY_SLOT[slot];
    contents.push({ kind: "item", lineId: pool[rng.int(0, pool.length - 1)], quality });
  }

  // Themed-dungeon signature line: one extra roll on that dungeon's boss chest.
  const signature = opts?.dungeonId ? signatureLineFor(opts.dungeonId) : undefined;
  if (signature && rng.next() < SIGNATURE_DROP_CHANCE) {
    contents.push({
      kind: "item",
      lineId: signature.id,
      quality: pickWeightedQuality(rng, tier),
    });
  }
  return contents;
}

/** Weighted quality pick for `tier` (normalized ITEM_QUALITY_WEIGHTS walk,
 *  stable rare→epic→legendary order). */
function pickWeightedQuality(rng: RNG, tier: ChestTier): ItemQuality {
  const weights = ITEM_QUALITY_WEIGHTS[tier];
  const order: ItemQuality[] = ["rare", "epic", "legendary"];
  const total = order.reduce((sum, q) => sum + weights[q], 0);
  let roll = rng.next() * total;
  for (const q of order) {
    roll -= weights[q];
    if (roll < 0) return q;
  }
  return "rare";
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

/** Boss-floor first-clear chest tier per dungeon. Unlisted themed dungeons are
 *  "gold" deep bosses; the chain's two capstones pay the top tiers (the only
 *  place arcane/dragon chests drop). FloorPickerSheet previews from this too. */
const BOSS_CHEST_TIERS: Record<string, ChestTier> = {
  depths: "silver",
  deep_forge: "arcane",
  eclipse_spire: "dragon",
  // The endgame fork bosses pay arcane first-clears — so their replay chests
  // (one tier below) are gold, a worthwhile late-game farm.
  fallen_cathedral: "arcane",
  rogues_den: "arcane",
};

export function bossChestTierFor(dungeonId: string): ChestTier {
  return BOSS_CHEST_TIERS[dungeonId] ?? "gold";
}

/** XOR salt for the boss-replay-chest chance roll. Derives an INDEPENDENT stream
 *  off chestSeed (distinct from the Lucky Coin's 0x5eed and rollChest's plain
 *  chestSeed), so adding the replay chest never shifts a first-clear's contents. */
const BOSS_REPLAY_CHEST_SALT = 0xb055;

/** The full post-battle reward matrix. Callers pass chestSeed from
 *  generateSeed() at drop time so this stays pure. */
export function computeBattleRewards(input: {
  mode: BattleMode;
  floor: number;
  /** Which dungeon this Depths battle ran in (defaults to "depths"). */
  dungeonId?: string;
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
  /** Endless: waves fully cleared this run (the score). */
  wavesSurvived?: number;
  /** Endless: the player's previous best wave, for the milestone-chest check. */
  bestWave?: number;
  /** Equipped items by defId — read ONLY for the Lucky Coin (gold boost +
   *  seeded chest-tier upgrade). Combat item effects never reach this layer. */
  itemLoadouts?: ItemLoadouts;
  /** Consecutive itemless chests so far (save.itemPity). At the threshold the
   *  chest's item roll is forced — see rollChest opts.forceItem. */
  itemPity?: number;
}): BattleRewards {
  const {
    mode,
    floor,
    dungeonId = "depths",
    outcome,
    unlockedUnits,
    highestClearedFloor,
    chestSeed,
    deck = [],
    slain = [],
    questUnlocks = [],
    wavesSurvived = 0,
    bestWave = 0,
    itemLoadouts,
    itemPity = 0,
  } = input;
  const none: BattleRewards = {
    gold: 0,
    xp: 0,
    chest: null,
    shards: 0,
    firstClear: false,
  };

  // Lucky Coin (the one meta-layer item): boosts flat battle gold and, at
  // legendary, may upgrade the reward chest a tier. Both deterministic — the
  // upgrade rolls a SEPARATE stream off chestSeed so the chest's own
  // contents-roll (and every legacy seed) is untouched.
  const coin = luckyCoinBonus(deck, itemLoadouts);
  const boostGold = (g: number) => Math.round(g * (1 + coin.goldPct / 100));
  const TIER_ORDER: ChestTier[] = ["wooden", "silver", "gold", "arcane", "dragon"];
  const upgradeTier = (tier: ChestTier): ChestTier => {
    if (coin.chestUpgradeChance <= 0) return tier;
    const rng = new RNG(chestSeed ^ 0x5eed);
    if (rng.next() >= coin.chestUpgradeChance) return tier;
    const i = TIER_ORDER.indexOf(tier);
    return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
  };
  const makeChest = (tier: ChestTier, sigDungeonId?: string): ChestResult => {
    const t = upgradeTier(tier);
    return {
      tier: t,
      seed: chestSeed,
      contents: rollChest(chestSeed, t, unlockedUnits, {
        ...(sigDungeonId ? { dungeonId: sigDungeonId } : {}),
        forceItem: itemPity >= ITEM_PITY_THRESHOLD,
      }),
    };
  };

  // PvP is scaffolding only; server-authoritative rewards replace this later.
  if (mode === "pvp") return none;

  // Endless: gold scales with waves survived (paid regardless of the eventual
  // wipe), plus a chest the first time a run crosses a new 5-wave milestone.
  // `firstClear` doubles as "new best wave" for the results copy. Shards pay
  // per FRESH milestone crossed (a 3→12 run banks the 5 AND 10 marks).
  if (mode === "endless") {
    const tier = endlessMilestoneChestTier(bestWave, wavesSurvived);
    return {
      gold: boostGold(ENDLESS_GOLD.base + ENDLESS_GOLD.perWave * wavesSurvived),
      xp: XP_REWARDS.endlessBase + XP_REWARDS.endlessPerWave * wavesSurvived,
      chest: tier ? makeChest(tier) : null,
      shards:
        SHARD_REWARDS.endlessPerMilestone *
        freshMilestonesCrossed(bestWave, wavesSurvived),
      firstClear: wavesSurvived > bestWave,
    };
  }

  if (mode === "depths") {
    const dungeon = getDungeon(dungeonId);
    // Rare-spawn "fusion" quest: clearing the rare enemy while fielding the
    // required unit unlocks the reward's PURCHASE. Counts on a loss too — "clear
    // it during the floor". Announced once: skip if already unlocked or owned.
    const quest = questForFloorIn(dungeon, floor);
    const questDone =
      quest != null &&
      slain.includes(quest.spawnId) &&
      questRequiredUnits(quest).some((id) => deck.includes(id));
    // One kill can pay out several unlocks (the Sealed Vault); each id is
    // announced only the first time — already-unlocked/owned ones drop out.
    const newQuestUnlocks = questDone
      ? questUnlockIds(quest).filter(
          (id) => !questUnlocks.includes(id) && !unlockedUnits.includes(id)
        )
      : [];
    const questUnlock =
      newQuestUnlocks.length > 0 ? newQuestUnlocks : undefined;

    // XP scales with the floor fought, win or lose — replays pay full (unlike
    // gold) so fighting at your edge is always the best XP.
    const winXp =
      XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * floor;
    if (outcome !== "victory") {
      return {
        ...none,
        gold: boostGold(GOLD_REWARDS.depthsLoss),
        xp: Math.round(XP_REWARDS.lossFrac * winXp),
        questUnlocks: questUnlock,
      };
    }
    const firstClear = floor > highestClearedFloor;
    if (!firstClear) {
      // Boss-floor replays can drop a farm chest, one tier below the boss's
      // first-clear tier, with its signature-line roll intact. Rolled on a
      // SEPARATE derived stream off chestSeed (never touches rollChest's stream),
      // so every first-clear seed stays byte-stable. Gold scales by dungeon depth.
      let replayChest: ChestResult | null = null;
      if (isBossFloorIn(dungeon, floor)) {
        const rng = new RNG(chestSeed ^ BOSS_REPLAY_CHEST_SALT);
        if (rng.next() < BOSS_REPLAY_CHEST_CHANCE) {
          const base = TIER_ORDER.indexOf(bossChestTierFor(dungeonId));
          replayChest = makeChest(TIER_ORDER[Math.max(0, base - 1)], dungeonId);
        }
      }
      return {
        ...none,
        gold: boostGold(replayGoldFor(dungeon.monsterLevel)),
        xp: winXp,
        chest: replayChest,
        questUnlocks: questUnlock,
      };
    }
    // Boss floors drop a chest, graded by the dungeon's place in the chain
    // (Depths silver → themed gold → Forge arcane → Spire dragon). A themed
    // boss chest also rolls its dungeon's signature item line. Shards pay on
    // first clears only: a trickle per floor, a chunk per boss, the most on
    // the two chain capstones.
    const isBoss = isBossFloorIn(dungeon, floor);
    const tier: ChestTier = isBoss ? bossChestTierFor(dungeonId) : "wooden";
    const shards = isBoss
      ? (CAPSTONE_DUNGEON_IDS as readonly string[]).includes(dungeonId)
        ? SHARD_REWARDS.bossFirstClearCapstone
        : SHARD_REWARDS.bossFirstClear
      : SHARD_REWARDS.floorFirstClear;
    return {
      gold: boostGold(
        GOLD_REWARDS.depthsFirstClearBase +
          GOLD_REWARDS.depthsFirstClearPerFloor * floor
      ),
      xp: winXp,
      chest: makeChest(tier, isBoss ? dungeonId : undefined),
      shards,
      firstClear: true,
      questUnlocks: questUnlock,
    };
  }

  // Arena ("solo").
  if (outcome !== "victory") {
    return {
      ...none,
      gold: boostGold(GOLD_REWARDS.arenaLoss),
      xp: XP_REWARDS.arenaLoss,
    };
  }
  return {
    gold: boostGold(GOLD_REWARDS.arenaWin),
    xp: XP_REWARDS.arenaWin,
    chest: makeChest("wooden"),
    shards: 0,
    firstClear: false,
  };
}

/** The save slice chest contents fold into — PlayerSave satisfies it. */
export interface ChestGrantSlice {
  gold: number;
  soulShards: number;
  items: Record<string, number>;
  unlockedUnits: string[];
}

/** Fold rolled chest contents into a save slice — the ONE place a chest's
 *  entries become currency/unlocks/stacks, shared by the battle grant and the
 *  quest-claim fold so the two can't drift. Pure (fresh objects, inputs
 *  untouched); items land at 1★ — stars only ever come from merging. */
export function foldChestContents<S extends ChestGrantSlice>(
  save: S,
  contents: readonly ChestContent[]
): S {
  let gold = save.gold;
  let soulShards = save.soulShards;
  const items = { ...save.items };
  const unlocked = new Set(save.unlockedUnits);
  for (const entry of contents) {
    if (entry.kind === "gold") gold += entry.amount;
    else if (entry.kind === "duplicate") gold += entry.gold;
    else if (entry.kind === "unit") unlocked.add(entry.unitId);
    else if (entry.kind === "shards") soulShards += entry.amount;
    else {
      const key = makeItemKey(entry.lineId, entry.quality, 1);
      items[key] = (items[key] ?? 0) + 1;
    }
  }
  return { ...save, gold, soulShards, items, unlockedUnits: [...unlocked] };
}

/** The pity counter's step: no chest → unchanged; itemless chest → +1;
 *  any item inside → reset. Battle grants and quest claims both use this. */
export function nextItemPity(
  prev: number,
  chestContents: readonly ChestContent[] | null
): number {
  if (!chestContents) return prev;
  return chestContents.some((e) => e.kind === "item") ? 0 : prev + 1;
}
