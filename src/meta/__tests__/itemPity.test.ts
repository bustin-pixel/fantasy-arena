// ============================================================================
// Item-pity specs — the guarantees behind the 2026-07-12 drop-rate buff:
// 1. forceItem never desyncs the RNG stream (a non-forced roll from the same
//    seed is byte-identical to a roll with no opts at all), and
// 2. the pity plumb-through in computeBattleRewards actually forces the item
//    at ITEM_PITY_THRESHOLD.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  computeBattleRewards,
  nextItemPity,
  rollChest,
  type ChestContent,
} from "@/meta/rewards";
import { ITEM_PITY_THRESHOLD } from "@/meta/economy";

const hasItem = (contents: ChestContent[]) =>
  contents.some((e) => e.kind === "item");

/** First seed in [1, 5000) whose wooden chest naturally rolls NO item. */
function itemlessSeed(): number {
  for (let seed = 1; seed < 5000; seed++) {
    if (!hasItem(rollChest(seed, "wooden", []))) return seed;
  }
  throw new Error("no itemless wooden seed found — did drop rates hit 100%?");
}

describe("rollChest forceItem", () => {
  it("forceItem: false (and absent) match exactly — legacy seeds unchanged", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bare = rollChest(seed, "wooden", []);
      expect(rollChest(seed, "wooden", [], { forceItem: false })).toEqual(bare);
      expect(rollChest(seed, "wooden", [], {})).toEqual(bare);
    }
  });

  it("forces an item into a naturally itemless chest without touching the earlier entries", () => {
    const seed = itemlessSeed();
    const natural = rollChest(seed, "wooden", []);
    const forced = rollChest(seed, "wooden", [], { forceItem: true });
    expect(hasItem(natural)).toBe(false);
    expect(hasItem(forced)).toBe(true);
    // The legacy prefix (gold/unit/shard rolls) is identical — force only
    // flips the item gate, never the stream.
    expect(forced.slice(0, natural.length)).toEqual(natural);
    expect(forced).toHaveLength(natural.length + 1);
  });

  it("leaves a naturally successful item roll untouched", () => {
    for (let seed = 1; seed < 5000; seed++) {
      const natural = rollChest(seed, "wooden", []);
      if (!hasItem(natural)) continue;
      expect(rollChest(seed, "wooden", [], { forceItem: true })).toEqual(
        natural
      );
      return;
    }
    throw new Error("no item-bearing wooden seed found");
  });
});

describe("computeBattleRewards itemPity", () => {
  const base = {
    mode: "solo" as const,
    floor: 0,
    outcome: "victory" as const,
    unlockedUnits: [] as string[],
    highestClearedFloor: 0,
  };

  it("forces the arena chest's item at the threshold, not below it", () => {
    const chestSeed = itemlessSeed();
    const below = computeBattleRewards({
      ...base,
      chestSeed,
      itemPity: ITEM_PITY_THRESHOLD - 1,
    });
    const at = computeBattleRewards({
      ...base,
      chestSeed,
      itemPity: ITEM_PITY_THRESHOLD,
    });
    expect(hasItem(below.chest!.contents)).toBe(false);
    expect(hasItem(at.chest!.contents)).toBe(true);
  });
});

describe("nextItemPity", () => {
  it("no chest → unchanged; itemless → +1; item inside → reset", () => {
    expect(nextItemPity(2, null)).toBe(2);
    expect(nextItemPity(2, [{ kind: "gold", amount: 10 }])).toBe(3);
    expect(
      nextItemPity(2, [
        { kind: "gold", amount: 10 },
        { kind: "item", lineId: "soldiers_blade", quality: "rare" },
      ])
    ).toBe(0);
  });
});
