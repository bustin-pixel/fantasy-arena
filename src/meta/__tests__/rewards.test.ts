// Rewards module specs — everything here is pure and seeded, so the assertions
// are exact. Seeds that need a particular roll shape are FOUND deterministically
// (fixed scan range) rather than hardcoded, so number tuning doesn't break them.
import { describe, expect, it } from "vitest";
import {
  bossChestTierFor,
  computeBattleRewards,
  rollChest,
  type ChestContent,
} from "@/meta/rewards";
import {
  CHEST_GOLD_RANGE,
  CHEST_UNIT_CHANCE,
  DUPLICATE_GOLD,
  ENDLESS_GOLD,
  endlessMilestoneChestTier,
  GOLD_REWARDS,
  MILESTONE_UNLOCKS,
  STARTER_UNIT_IDS,
  UNLOCK_PRICES,
  type ChestTier,
} from "@/meta/economy";
import { XP_REWARDS } from "@/meta/leveling";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { RARITY_ORDER } from "@/data/rarities";
import { DEPTHS_TIERS, rareSpawnQuestForFloor } from "@/data/depths";
import { DUNGEONS, QUEST_LOCKED_UNITS, getDungeon } from "@/data/dungeons";

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

  it("never drops quest-locked units (they're earned by their quest, not chests)", () => {
    for (const tier of Object.keys(CHEST_UNIT_CHANCE) as ChestTier[]) {
      for (let seed = 1; seed <= 500; seed++) {
        for (const entry of rollChest(seed, tier, NO_UNITS)) {
          if (entry.kind === "unit" || entry.kind === "duplicate") {
            expect(QUEST_LOCKED_UNITS.has(entry.unitId)).toBe(false);
          }
        }
      }
    }
  });
});

describe("computeBattleRewards — rare-spawn quest unlock", () => {
  const quest = rareSpawnQuestForFloor(5)!; // slime → slime_knight, requires knight
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 42 };

  it("slaying the rare spawn while fielding the required unit unlocks its purchase", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      highestClearedFloor: quest.floor, // replay branch — isolates the field
      deck: [quest.requires], slain: [quest.spawnId],
    });
    expect(r.questUnlock).toBe(quest.unlocks);
  });

  it("counts even on a loss — clear it during the floor", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "defeat",
      deck: [quest.requires], slain: [quest.spawnId],
    });
    expect(r.questUnlock).toBe(quest.unlocks);
  });

  it("no unlock without the required unit, without the kill, or on the wrong floor", () => {
    const noKnight = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: NO_UNITS, slain: [quest.spawnId],
    });
    const noKill = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: [quest.requires], slain: NO_UNITS,
    });
    const wrongFloor = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor + 1, outcome: "victory",
      deck: [quest.requires], slain: [quest.spawnId],
    });
    expect(noKnight.questUnlock).toBeUndefined();
    expect(noKill.questUnlock).toBeUndefined();
    expect(wrongFloor.questUnlock).toBeUndefined();
  });

  it("doesn't re-announce once already unlocked or owned", () => {
    const already = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: [quest.requires], slain: [quest.spawnId],
      questUnlocks: [quest.unlocks],
    });
    const owned = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: [quest.requires], slain: [quest.spawnId],
      unlockedUnits: [quest.unlocks],
    });
    expect(already.questUnlock).toBeUndefined();
    expect(owned.questUnlock).toBeUndefined();
  });

  it("arena never triggers a quest unlock (Depths only)", () => {
    const r = computeBattleRewards({
      ...base, mode: "solo", floor: quest.floor, outcome: "victory",
      deck: [quest.requires], slain: [quest.spawnId],
    });
    expect(r.questUnlock).toBeUndefined();
  });
});

describe("computeBattleRewards — themed dungeon quest (The Bonefields)", () => {
  const dungeon = getDungeon("bonefields");
  const quest = dungeon.quest!; // lich → necromancer, requires fire_mage, floor 3
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 7 };

  it("slaying the rare Lich with a Fire Mage fielded unlocks the Necromancer", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: quest.floor,
      outcome: "victory", highestClearedFloor: quest.floor, // replay isolates the field
      deck: [quest.requires], slain: [quest.spawnId],
    });
    expect(r.questUnlock).toBe("necromancer");
  });

  it("a different dungeon's catalyst does NOT fire here (dungeon-scoped quests)", () => {
    // The Slime is the Depths catalyst; slaying it inside The Bonefields is inert.
    const r = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: quest.floor,
      outcome: "victory", highestClearedFloor: quest.floor,
      deck: ["knight"], slain: ["slime"],
    });
    expect(r.questUnlock).toBeUndefined();
  });

  it("its boss floor drops a gold chest (a deep boss), not silver", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: dungeon.floors,
      outcome: "victory", highestClearedFloor: 0, // first clear → chest
    });
    expect(r.chest?.tier).toBe("gold");
  });
});

describe("computeBattleRewards — boss chest ladder (chain capstones)", () => {
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 7 };
  const bossTier = (dungeonId: string) =>
    computeBattleRewards({
      ...base,
      mode: "depths",
      dungeonId,
      floor: getDungeon(dungeonId).floors,
      outcome: "victory",
    }).chest?.tier;

  it("mid-chain dungeons pay gold; the two capstones pay arcane and dragon", () => {
    expect(bossTier("wilds")).toBe("gold");
    expect(bossTier("overgrowth")).toBe("gold");
    expect(bossTier("sealed_vault")).toBe("gold");
    expect(bossTier("deep_forge")).toBe("arcane");
    expect(bossTier("eclipse_spire")).toBe("dragon");
  });

  it("bossChestTierFor grades the whole ladder and defaults to gold", () => {
    expect(bossChestTierFor("depths")).toBe("silver");
    expect(bossChestTierFor("bonefields")).toBe("gold");
    expect(bossChestTierFor("deep_forge")).toBe("arcane");
    expect(bossChestTierFor("eclipse_spire")).toBe("dragon");
    expect(bossChestTierFor("some_future_dungeon")).toBe("gold");
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

  it("depths replay: trickle gold but FULL floor XP, no chest, not a first clear", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: 2, outcome: "victory",
      highestClearedFloor: 4,
    });
    expect(r).toEqual({
      gold: GOLD_REWARDS.depthsReplay,
      xp: XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * 2,
      chest: null,
      firstClear: false,
    });
  });

  it("depths defeat and draw both pay the consolation + fractional XP, no chest", () => {
    const winXp = XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * 3;
    for (const outcome of ["defeat", "draw"] as const) {
      const r = computeBattleRewards({
        ...base, mode: "depths", floor: 3, outcome,
      });
      expect(r).toEqual({
        gold: GOLD_REWARDS.depthsLoss,
        xp: Math.round(XP_REWARDS.lossFrac * winXp),
        chest: null,
        firstClear: false,
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
      ).toEqual({ gold: 0, xp: 0, chest: null, firstClear: false });
    }
  });

  it("XP scales with the floor fought (win) and arena pays its flat rates", () => {
    const floor5 = computeBattleRewards({
      ...base, mode: "depths", floor: 5, outcome: "victory",
      highestClearedFloor: 4,
    });
    expect(floor5.xp).toBe(
      XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * 5
    );
    const win = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "victory",
    });
    const loss = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "defeat",
    });
    expect(win.xp).toBe(XP_REWARDS.arenaWin);
    expect(loss.xp).toBe(XP_REWARDS.arenaLoss);
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

  it("every dungeon's rare-spawn quest is valid (real catalyst on a real floor; deckable, non-starter, quest-locked reward)", () => {
    for (const dungeon of Object.values(DUNGEONS)) {
      const quest = dungeon.quest;
      if (!quest) continue;
      expect(quest.floor).toBeGreaterThanOrEqual(1);
      // The catalyst must appear on a real floor of ITS OWN dungeon.
      expect(quest.floor).toBeLessThanOrEqual(dungeon.floors);
      expect(quest.chance).toBeGreaterThan(0);
      expect(quest.chance).toBeLessThanOrEqual(1);
      expect(quest.price).toBeGreaterThan(0);
      expect(quest.hint.trim().length).toBeGreaterThan(0);
      // The rare enemy and the required unit must be real unit defs.
      expect(getUnitDef(quest.spawnId).id).toBe(quest.spawnId);
      expect(DECKABLE_UNIT_IDS).toContain(quest.requires);
      // The reward must be a deckable non-starter (you earn it, not start with it).
      expect(DECKABLE_UNIT_IDS).toContain(quest.unlocks);
      expect(STARTER_UNIT_IDS).not.toContain(quest.unlocks);
      // And it must be quest-locked (excluded from chests / grandfathering).
      expect(QUEST_LOCKED_UNITS.has(quest.unlocks)).toBe(true);
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

describe("endless rewards", () => {
  const base = {
    mode: "endless" as const,
    floor: 1,
    outcome: "defeat" as const,
    unlockedUnits: NO_UNITS,
    highestClearedFloor: 0,
    chestSeed: 42,
  };

  it("pays base + perWave gold regardless of the (always) defeat outcome", () => {
    const r = computeBattleRewards({ ...base, wavesSurvived: 7, bestWave: 0 });
    expect(r.gold).toBe(ENDLESS_GOLD.base + ENDLESS_GOLD.perWave * 7);
    expect(r.xp).toBe(XP_REWARDS.endlessBase + XP_REWARDS.endlessPerWave * 7);
  });

  it("flags a new best wave via firstClear", () => {
    expect(computeBattleRewards({ ...base, wavesSurvived: 9, bestWave: 6 }).firstClear).toBe(true);
    expect(computeBattleRewards({ ...base, wavesSurvived: 4, bestWave: 6 }).firstClear).toBe(false);
  });

  it("drops a milestone chest only when a NEW 5-wave milestone is crossed", () => {
    // First run to wave 5 → a silver chest.
    expect(computeBattleRewards({ ...base, wavesSurvived: 5, bestWave: 0 }).chest?.tier).toBe("silver");
    // Wave 4 has crossed no milestone → no chest.
    expect(computeBattleRewards({ ...base, wavesSurvived: 4, bestWave: 0 }).chest).toBeNull();
    // Already banked wave 5 before; reaching 7 stays in the same milestone → none.
    expect(computeBattleRewards({ ...base, wavesSurvived: 7, bestWave: 5 }).chest).toBeNull();
    // Pushing from best 7 to 12 crosses the 10 milestone → gold.
    expect(computeBattleRewards({ ...base, wavesSurvived: 12, bestWave: 7 }).chest?.tier).toBe("gold");
  });
});

describe("endlessMilestoneChestTier", () => {
  it("returns the fresh milestone tier, or null when none is newly crossed", () => {
    expect(endlessMilestoneChestTier(0, 4)).toBeNull();
    expect(endlessMilestoneChestTier(0, 5)).toBe("silver");
    expect(endlessMilestoneChestTier(5, 9)).toBeNull(); // still in the 5-milestone
    expect(endlessMilestoneChestTier(7, 10)).toBe("gold");
    expect(endlessMilestoneChestTier(14, 15)).toBe("gold");
    expect(endlessMilestoneChestTier(15, 22)).toBe("arcane");
  });
});
