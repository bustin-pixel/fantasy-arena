// Rewards module specs — everything here is pure and seeded, so the assertions
// are exact. Seeds that need a particular roll shape are FOUND deterministically
// (fixed scan range) rather than hardcoded, so number tuning doesn't break them.
import { describe, expect, it } from "vitest";
import {
  computeBattleRewards,
  rollChest,
  type ChestContent,
} from "@/meta/rewards";
import {
  CHEST_GOLD_RANGE,
  CHEST_UNIT_CHANCE,
  DUPLICATE_GOLD,
  GOLD_REWARDS,
  MILESTONE_UNLOCKS,
  STARTER_UNIT_IDS,
  UNLOCK_PRICES,
  type ChestTier,
} from "@/meta/economy";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { RARITY_ORDER } from "@/data/rarities";
import { DEPTHS_TIERS } from "@/data/depths";

const NO_UNITS: string[] = [];
const ALL_UNITS = [...DECKABLE_UNIT_IDS];

/** First seed in a fixed range whose chest contents satisfy the predicate.
 *  Deterministic: the scan order never changes. */
function findSeed(
  tier: ChestTier,
  unlocked: readonly string[],
  pred: (contents: ChestContent[]) => boolean
): number {
  for (let seed = 1; seed <= 5000; seed++) {
    if (pred(rollChest(seed, tier, unlocked))) return seed;
  }
  throw new Error("no seed in scan range satisfied the predicate");
}

describe("rollChest", () => {
  it("is deterministic: same seed + inputs → identical contents", () => {
    expect(rollChest(1234, "gold", NO_UNITS)).toEqual(
      rollChest(1234, "gold", NO_UNITS)
    );
    expect(rollChest(987654, "wooden", ALL_UNITS)).toEqual(
      rollChest(987654, "wooden", ALL_UNITS)
    );
  });

  it("always contains one gold entry within the tier's range", () => {
    for (const tier of Object.keys(CHEST_GOLD_RANGE) as ChestTier[]) {
      const [min, max] = CHEST_GOLD_RANGE[tier];
      for (let seed = 1; seed <= 200; seed++) {
        const gold = rollChest(seed, tier, NO_UNITS).filter(
          (c) => c.kind === "gold"
        );
        expect(gold).toHaveLength(1);
        const amount = (gold[0] as { amount: number }).amount;
        expect(amount).toBeGreaterThanOrEqual(min);
        expect(amount).toBeLessThanOrEqual(max);
      }
    }
  });

  it("can roll a unit, and can roll no unit (both outcomes reachable)", () => {
    const withUnit = findSeed("gold", NO_UNITS, (c) =>
      c.some((e) => e.kind === "unit")
    );
    const withoutUnit = findSeed("gold", NO_UNITS, (c) =>
      c.every((e) => e.kind === "gold")
    );
    // Re-assert on the found seeds so the test reads as exact expectations.
    expect(rollChest(withUnit, "gold", NO_UNITS).some((e) => e.kind === "unit")).toBe(true);
    expect(rollChest(withoutUnit, "gold", NO_UNITS)).toHaveLength(1);
  });

  it("converts already-owned unit drops to the rarity's duplicate gold", () => {
    const seed = findSeed("gold", NO_UNITS, (c) =>
      c.some((e) => e.kind === "unit")
    );
    const asNew = rollChest(seed, "gold", NO_UNITS);
    const asOwned = rollChest(seed, "gold", ALL_UNITS);
    const unit = asNew.find(
      (e): e is Extract<ChestContent, { kind: "unit" }> => e.kind === "unit"
    )!;
    const dup = asOwned.find(
      (e): e is Extract<ChestContent, { kind: "duplicate" }> =>
        e.kind === "duplicate"
    )!;
    expect(dup.unitId).toBe(unit.unitId);
    expect(dup.gold).toBe(DUPLICATE_GOLD[getUnitDef(unit.unitId).rarity]);
  });

  it("unit drops only reference deckable units", () => {
    for (let seed = 1; seed <= 500; seed++) {
      for (const entry of rollChest(seed, "gold", NO_UNITS)) {
        if (entry.kind === "unit") {
          expect(DECKABLE_UNIT_IDS).toContain(entry.unitId);
        }
      }
    }
  });
});

describe("computeBattleRewards — the reward matrix", () => {
  const base = {
    unlockedUnits: NO_UNITS,
    highestClearedFloor: 0,
    chestSeed: 42,
  };

  it("depths first clear: 50 + 15×floor gold + wooden chest", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: 3, outcome: "victory",
      highestClearedFloor: 2,
    });
    expect(r.gold).toBe(95);
    expect(r.firstClear).toBe(true);
    expect(r.chest?.tier).toBe("wooden");
    expect(r.chest?.seed).toBe(42);
    expect(r.chest?.contents).toEqual(rollChest(42, "wooden", NO_UNITS));
  });

  it("depths boss-floor first clear drops a silver chest", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: 5, outcome: "victory",
      highestClearedFloor: 4,
    });
    expect(r.gold).toBe(125);
    expect(r.chest?.tier).toBe("silver");
  });

  it("depths replay: trickle gold, no chest, not a first clear", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: 2, outcome: "victory",
      highestClearedFloor: 4,
    });
    expect(r).toEqual({
      gold: GOLD_REWARDS.depthsReplay, chest: null, firstClear: false,
    });
  });

  it("depths defeat and draw both pay the consolation, no chest", () => {
    for (const outcome of ["defeat", "draw"] as const) {
      const r = computeBattleRewards({
        ...base, mode: "depths", floor: 3, outcome,
      });
      expect(r).toEqual({
        gold: GOLD_REWARDS.depthsLoss, chest: null, firstClear: false,
      });
    }
  });

  it("arena win: flat gold + wooden chest", () => {
    const r = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "victory",
    });
    expect(r.gold).toBe(GOLD_REWARDS.arenaWin);
    expect(r.chest?.tier).toBe("wooden");
    expect(r.firstClear).toBe(false);
  });

  it("arena loss/draw: consolation gold, never zero", () => {
    for (const outcome of ["defeat", "draw"] as const) {
      const r = computeBattleRewards({
        ...base, mode: "solo", floor: 1, outcome,
      });
      expect(r.gold).toBe(GOLD_REWARDS.arenaLoss);
      expect(r.gold).toBeGreaterThan(0);
      expect(r.chest).toBeNull();
    }
  });

  it("pvp yields nothing (scaffold only)", () => {
    for (const outcome of ["victory", "defeat", "draw"] as const) {
      expect(
        computeBattleRewards({ ...base, mode: "pvp", floor: 1, outcome })
      ).toEqual({ gold: 0, chest: null, firstClear: false });
    }
  });

  it("is deterministic end to end", () => {
    const input = {
      ...base, mode: "depths" as const, floor: 5,
      outcome: "victory" as const, highestClearedFloor: 4,
    };
    expect(computeBattleRewards(input)).toEqual(computeBattleRewards(input));
  });
});

describe("economy data sanity (guards designer typos)", () => {
  it("milestone floors have tier data and grant non-starter deckable units", () => {
    const maxFloorWithData = DEPTHS_TIERS[DEPTHS_TIERS.length - 1].floors[1];
    for (const [floorStr, unitId] of Object.entries(MILESTONE_UNLOCKS)) {
      expect(Number(floorStr)).toBeLessThanOrEqual(maxFloorWithData);
      expect(DECKABLE_UNIT_IDS).toContain(unitId);
      expect(STARTER_UNIT_IDS).not.toContain(unitId);
    }
  });

  it("prices, duplicate gold, and chest tables cover every rarity/tier", () => {
    for (const rarity of RARITY_ORDER) {
      expect(UNLOCK_PRICES[rarity]).toBeGreaterThan(0);
      expect(DUPLICATE_GOLD[rarity]).toBeGreaterThan(0);
      expect(DUPLICATE_GOLD[rarity]).toBeLessThan(UNLOCK_PRICES[rarity]);
    }
    const tiers = Object.keys(CHEST_GOLD_RANGE) as ChestTier[];
    let prevMax = 0;
    let prevChance = -1;
    for (const tier of tiers) {
      const [min, max] = CHEST_GOLD_RANGE[tier];
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(CHEST_UNIT_CHANCE[tier]).toBeGreaterThanOrEqual(0);
      expect(CHEST_UNIT_CHANCE[tier]).toBeLessThanOrEqual(1);
      // Tiers are declared in ascending order — better tier, better loot.
      expect(min).toBeGreaterThan(prevMax);
      expect(CHEST_UNIT_CHANCE[tier]).toBeGreaterThan(prevChance);
      prevMax = max;
      prevChance = CHEST_UNIT_CHANCE[tier];
    }
  });
});
