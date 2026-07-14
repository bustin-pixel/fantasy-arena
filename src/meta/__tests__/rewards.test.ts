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
  freshMilestonesCrossed,
  GOLD_REWARDS,
  MILESTONE_UNLOCKS,
  replayGoldFor,
  SHARD_CHEST_DRIP,
  SHARD_REWARDS,
  STARTER_UNIT_IDS,
  UNLOCK_PRICES,
  type ChestTier,
} from "@/meta/economy";
import { ITEM_LINES, signatureLineFor } from "@/data/items";
import { XP_REWARDS } from "@/meta/leveling";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { RARITY_ORDER } from "@/data/rarities";
import {
  questRequiredUnits,
  questUnlockIds,
  rareSpawnQuestForFloor,
} from "@/data/depths";
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
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
    });
    expect(r.questUnlocks).toEqual(questUnlockIds(quest));
  });

  it("counts even on a loss — clear it during the floor", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "defeat",
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
    });
    expect(r.questUnlocks).toEqual(questUnlockIds(quest));
  });

  it("no unlock without the required unit, without the kill, or on the wrong floor", () => {
    const noKnight = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: NO_UNITS, slain: [quest.spawnId],
    });
    const noKill = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: questRequiredUnits(quest), slain: NO_UNITS,
    });
    const wrongFloor = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor + 1, outcome: "victory",
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
    });
    expect(noKnight.questUnlocks).toBeUndefined();
    expect(noKill.questUnlocks).toBeUndefined();
    expect(wrongFloor.questUnlocks).toBeUndefined();
  });

  it("doesn't re-announce once already unlocked or owned", () => {
    const already = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
      questUnlocks: questUnlockIds(quest),
    });
    const owned = computeBattleRewards({
      ...base, mode: "depths", floor: quest.floor, outcome: "victory",
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
      unlockedUnits: questUnlockIds(quest),
    });
    expect(already.questUnlocks).toBeUndefined();
    expect(owned.questUnlocks).toBeUndefined();
  });

  it("arena never triggers a quest unlock (Depths only)", () => {
    const r = computeBattleRewards({
      ...base, mode: "solo", floor: quest.floor, outcome: "victory",
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
    });
    expect(r.questUnlocks).toBeUndefined();
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
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
    });
    expect(r.questUnlocks).toEqual(["necromancer"]);
  });

  it("a different dungeon's catalyst does NOT fire here (dungeon-scoped quests)", () => {
    // The Slime is the Depths catalyst; slaying it inside The Bonefields is inert.
    const r = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: quest.floor,
      outcome: "victory", highestClearedFloor: quest.floor,
      deck: ["knight"], slain: ["slime"],
    });
    expect(r.questUnlocks).toBeUndefined();
  });

  it("its boss floor drops a gold chest (a deep boss), not silver", () => {
    const r = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: dungeon.floors,
      outcome: "victory", highestClearedFloor: 0, // first clear → chest
    });
    expect(r.chest?.tier).toBe("gold");
  });
});

describe("computeBattleRewards — any-of quest anchors (The Rogue's Den)", () => {
  // The Silencer quest accepts ANY stealth unit: Assassin, Rogue, or Trickster.
  const quest = getDungeon("rogues_den").quest!;
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 7 };
  const run = (deck: string[]) =>
    computeBattleRewards({
      ...base, mode: "depths", dungeonId: "rogues_den", floor: quest.floor,
      outcome: "victory", highestClearedFloor: quest.floor,
      deck, slain: [quest.spawnId],
    });

  it("each stealth unit alone satisfies the quest", () => {
    for (const id of questRequiredUnits(quest)) {
      expect(run([id]).questUnlocks).toEqual(["outlaw"]);
    }
    expect(questRequiredUnits(quest)).toEqual(["assassin", "rogue", "trickster"]);
  });

  it("a deck with no stealth unit earns nothing", () => {
    expect(run(["knight", "mage"]).questUnlocks).toBeUndefined();
  });
});

describe("computeBattleRewards — dual-payout quest (The Sealed Vault)", () => {
  // Felling the Archmage with a Knight fielded unlocks BOTH the Aegis Knight
  // and the Archmage himself; each drops out of the announcement independently
  // once unlocked/owned.
  const quest = getDungeon("sealed_vault").quest!;
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 7 };
  const run = (over: Partial<Parameters<typeof computeBattleRewards>[0]> = {}) =>
    computeBattleRewards({
      ...base, mode: "depths", dungeonId: "sealed_vault", floor: quest.floor,
      outcome: "victory", highestClearedFloor: quest.floor,
      deck: questRequiredUnits(quest), slain: [quest.spawnId],
      ...over,
    });

  it("one kill pays out both unlocks", () => {
    expect(questUnlockIds(quest)).toEqual(["aegis_knight", "archmage"]);
    expect(run().questUnlocks).toEqual(["aegis_knight", "archmage"]);
  });

  it("an already-earned half drops out; a fully-earned quest announces nothing", () => {
    expect(run({ questUnlocks: ["aegis_knight"] }).questUnlocks).toEqual([
      "archmage",
    ]);
    expect(run({ unlockedUnits: ["archmage"] }).questUnlocks).toEqual([
      "aegis_knight",
    ]);
    expect(
      run({ questUnlocks: ["aegis_knight", "archmage"] }).questUnlocks
    ).toBeUndefined();
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
      gold: replayGoldFor(getDungeon("depths").monsterLevel), // scales by depth
      xp: XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * 2,
      chest: null, // floor 2 isn't a boss floor → no replay chest
      shards: 0,
      firstClear: false,
    });
  });

  it("boss-floor replays can drop a farm chest, one tier below the first-clear tier", () => {
    // Scan seeds for a replay roll that drops a chest (~40% each). Deep Forge's
    // boss first-clear is arcane → its replay chest is gold (one tier below).
    let chest: ReturnType<typeof computeBattleRewards>["chest"] = null;
    for (let seed = 1; seed <= 200 && !chest; seed++) {
      chest = computeBattleRewards({
        ...base, mode: "depths", dungeonId: "deep_forge", floor: 5,
        outcome: "victory", highestClearedFloor: 5, chestSeed: seed,
      }).chest;
    }
    expect(chest).not.toBeNull();
    expect(chest!.tier).toBe("gold");
  });

  it("non-boss replays never drop a chest", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = computeBattleRewards({
        ...base, mode: "depths", dungeonId: "deep_forge", floor: 3,
        outcome: "victory", highestClearedFloor: 5, chestSeed: seed,
      });
      expect(r.chest).toBeNull();
    }
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
        shards: 0,
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
      ).toEqual({ gold: 0, xp: 0, chest: null, shards: 0, firstClear: false });
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
  it("every dungeon gift grants a non-starter, non-quest-locked deckable unit on a real floor", () => {
    for (const [dungeonId, byFloor] of Object.entries(MILESTONE_UNLOCKS)) {
      const dungeon = getDungeon(dungeonId); // throws on an unknown dungeon id
      for (const [floorStr, unitId] of Object.entries(byFloor)) {
        const floor = Number(floorStr);
        expect(floor).toBeGreaterThanOrEqual(1);
        expect(floor).toBeLessThanOrEqual(dungeon.floors);
        expect(DECKABLE_UNIT_IDS).toContain(unitId);
        expect(STARTER_UNIT_IDS).not.toContain(unitId); // gifts aren't already-owned
        expect(QUEST_LOCKED_UNITS.has(unitId)).toBe(false); // legendaries stay quest-locked
      }
    }
  });

  it("every quest's required unit is a starter or gifted before that dungeon's quest", () => {
    // Units the player is guaranteed to own by the time they can attempt a
    // dungeon's fusion quest: the starters, this dungeon's gifts BELOW the quest
    // floor, and every gift from the gate-ancestors (fully cleared to progress
    // — you can't reach a gate floor without clearing the earlier floors).
    const ownableBefore = (
      dungeon: ReturnType<typeof getDungeon>
    ): Set<string> => {
      const owned = new Set<string>(STARTER_UNIT_IDS);
      const qFloor = dungeon.quest?.floor ?? dungeon.floors;
      for (const [fStr, u] of Object.entries(MILESTONE_UNLOCKS[dungeon.id] ?? {})) {
        if (Number(fStr) < qFloor) owned.add(u);
      }
      let cur = dungeon;
      const seen = new Set<string>();
      while (cur.gate && !seen.has(cur.gate.dungeonId)) {
        seen.add(cur.gate.dungeonId);
        const anc = getDungeon(cur.gate.dungeonId);
        for (const u of Object.values(MILESTONE_UNLOCKS[anc.id] ?? {})) owned.add(u);
        cur = anc;
      }
      return owned;
    };
    for (const dungeon of Object.values(DUNGEONS)) {
      if (!dungeon.quest) continue;
      const ownable = ownableBefore(dungeon);
      const reqs = questRequiredUnits(dungeon.quest); // any-of
      expect(reqs.some((id) => ownable.has(id))).toBe(true);
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
      // Every unit that can satisfy the quest must be a real deckable unit.
      expect(questRequiredUnits(quest).length).toBeGreaterThan(0);
      for (const id of questRequiredUnits(quest)) {
        expect(DECKABLE_UNIT_IDS).toContain(id);
      }
      // Every reward must be a deckable non-starter (earned, not started with)
      // and quest-locked (excluded from chests / grandfathering).
      expect(questUnlockIds(quest).length).toBeGreaterThan(0);
      for (const id of questUnlockIds(quest)) {
        expect(DECKABLE_UNIT_IDS).toContain(id);
        expect(STARTER_UNIT_IDS).not.toContain(id);
        expect(QUEST_LOCKED_UNITS.has(id)).toBe(true);
      }
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

// ---------------------------------------------------------------------------
// Items & Soul Shards
// ---------------------------------------------------------------------------

describe("rollChest — item drops", () => {
  const itemEntries = (contents: ChestContent[]) =>
    contents.filter(
      (c): c is Extract<ChestContent, { kind: "item" }> => c.kind === "item"
    );

  it("is deterministic with opts, and no-signature opts change nothing", () => {
    expect(rollChest(777, "gold", NO_UNITS, { dungeonId: "wilds" })).toEqual(
      rollChest(777, "gold", NO_UNITS, { dungeonId: "wilds" })
    );
    // "depths" has no signature line → identical to the no-opts roll.
    expect(rollChest(777, "gold", NO_UNITS, { dungeonId: "depths" })).toEqual(
      rollChest(777, "gold", NO_UNITS)
    );
  });

  it("keeps the legacy gold/unit prefix: gold first, item-era entries appended", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const contents = rollChest(seed, "arcane", NO_UNITS);
      expect(contents[0].kind).toBe("gold");
      const firstExtra = contents.findIndex(
        (c) => c.kind === "item" || c.kind === "shards"
      );
      if (firstExtra !== -1) {
        for (const later of contents.slice(firstExtra)) {
          expect(["item", "shards"]).toContain(later.kind);
        }
      }
    }
  });

  it("respects tier quality gates: wooden/silver never drop above rare", () => {
    for (const tier of ["wooden", "silver"] as ChestTier[]) {
      for (let seed = 1; seed <= 400; seed++) {
        for (const item of itemEntries(rollChest(seed, tier, NO_UNITS))) {
          expect(item.quality).toBe("rare");
        }
      }
    }
    // Gold can reach epic but never legendary.
    for (let seed = 1; seed <= 400; seed++) {
      for (const item of itemEntries(rollChest(seed, "gold", NO_UNITS))) {
        expect(item.quality).not.toBe("legendary");
      }
    }
  });

  it("dragon chests always contain an item; direct legendaries are reachable", () => {
    let sawLegendary = false;
    for (let seed = 1; seed <= 200; seed++) {
      const items = itemEntries(rollChest(seed, "dragon", NO_UNITS));
      expect(items.length).toBeGreaterThanOrEqual(1);
      if (items.some((i) => i.quality === "legendary")) sawLegendary = true;
    }
    expect(sawLegendary).toBe(true);
  });

  it("base rolls never drop dungeon-signature lines", () => {
    for (const tier of Object.keys(CHEST_GOLD_RANGE) as ChestTier[]) {
      for (let seed = 1; seed <= 300; seed++) {
        for (const item of itemEntries(rollChest(seed, tier, NO_UNITS))) {
          expect(ITEM_LINES[item.lineId].dungeonId).toBeUndefined();
        }
      }
    }
  });

  it("a themed dungeonId adds (only) that dungeon's signature line, reachably", () => {
    const sig = signatureLineFor("wilds")!;
    let sawSignature = false;
    for (let seed = 1; seed <= 300; seed++) {
      const items = itemEntries(
        rollChest(seed, "gold", NO_UNITS, { dungeonId: "wilds" })
      );
      for (const item of items) {
        const line = ITEM_LINES[item.lineId];
        if (line.dungeonId) {
          expect(line.id).toBe(sig.id);
          sawSignature = true;
        }
      }
    }
    expect(sawSignature).toBe(true);
  });

  it("shard drips appear only in arcane/dragon chests, within their range", () => {
    for (const tier of Object.keys(CHEST_GOLD_RANGE) as ChestTier[]) {
      const drip = SHARD_CHEST_DRIP[tier];
      let saw = false;
      for (let seed = 1; seed <= 300; seed++) {
        for (const c of rollChest(seed, tier, NO_UNITS)) {
          if (c.kind !== "shards") continue;
          expect(drip).toBeDefined();
          expect(c.amount).toBeGreaterThanOrEqual(drip!.range[0]);
          expect(c.amount).toBeLessThanOrEqual(drip!.range[1]);
          saw = true;
        }
      }
      if (drip) expect(saw).toBe(true);
    }
  });
});

describe("computeBattleRewards — Soul Shards", () => {
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 42 };

  it("depths first clears pay the shard ladder: floor / boss / capstone", () => {
    const floorClear = computeBattleRewards({
      ...base, mode: "depths", floor: 2, outcome: "victory",
      highestClearedFloor: 1,
    });
    expect(floorClear.shards).toBe(SHARD_REWARDS.floorFirstClear);
    const bossClear = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "bonefields", floor: 5,
      outcome: "victory", highestClearedFloor: 4,
    });
    expect(bossClear.shards).toBe(SHARD_REWARDS.bossFirstClear);
    const capstone = computeBattleRewards({
      ...base, mode: "depths", dungeonId: "eclipse_spire", floor: 5,
      outcome: "victory", highestClearedFloor: 4,
    });
    expect(capstone.shards).toBe(SHARD_REWARDS.bossFirstClearCapstone);
  });

  it("replays and losses pay zero shards (first-time signals only)", () => {
    const replay = computeBattleRewards({
      ...base, mode: "depths", floor: 2, outcome: "victory",
      highestClearedFloor: 4,
    });
    const loss = computeBattleRewards({
      ...base, mode: "depths", floor: 2, outcome: "defeat",
    });
    expect(replay.shards).toBe(0);
    expect(loss.shards).toBe(0);
    expect(
      computeBattleRewards({ ...base, mode: "solo", floor: 1, outcome: "victory" })
        .shards
    ).toBe(0);
  });

  it("endless pays per FRESH milestone crossed in the run", () => {
    const endlessBase = {
      ...base, mode: "endless" as const, floor: 1, outcome: "defeat" as const,
    };
    // 3 → 12 crosses the 5 and 10 marks.
    expect(
      computeBattleRewards({ ...endlessBase, wavesSurvived: 12, bestWave: 3 }).shards
    ).toBe(SHARD_REWARDS.endlessPerMilestone * 2);
    // Already banked 10; reaching 12 crosses nothing new.
    expect(
      computeBattleRewards({ ...endlessBase, wavesSurvived: 12, bestWave: 10 }).shards
    ).toBe(0);
    expect(
      computeBattleRewards({ ...endlessBase, wavesSurvived: 4, bestWave: 0 }).shards
    ).toBe(0);
  });

  it("freshMilestonesCrossed counts multiples of 5 in (prevBest, survived]", () => {
    expect(freshMilestonesCrossed(0, 4)).toBe(0);
    expect(freshMilestonesCrossed(0, 5)).toBe(1);
    expect(freshMilestonesCrossed(3, 12)).toBe(2);
    expect(freshMilestonesCrossed(10, 12)).toBe(0);
    expect(freshMilestonesCrossed(15, 30)).toBe(3);
  });
});

describe("computeBattleRewards — Lucky Coin", () => {
  const base = { unlockedUnits: NO_UNITS, highestClearedFloor: 0, chestSeed: 42 };
  const coined = (key: string) => ({
    deck: ["knight"],
    itemLoadouts: { knight: { trinket: key } },
  });

  it("boosts flat battle gold by the coin's percentage", () => {
    const plain = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "victory",
    });
    const boosted = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "victory",
      ...coined("lucky_coin:rare:1"),
    });
    expect(boosted.gold).toBe(Math.round(plain.gold * 1.05));
  });

  it("a coin equipped on a unit NOT in the deck does nothing", () => {
    const r = computeBattleRewards({
      ...base, mode: "solo", floor: 1, outcome: "victory",
      deck: ["ogre"],
      itemLoadouts: { knight: { trinket: "lucky_coin:legendary:3" } },
    });
    expect(r.gold).toBe(GOLD_REWARDS.arenaWin);
  });

  it("legendary coin can upgrade the chest tier (seeded, both outcomes reachable)", () => {
    const roll = (chestSeed: number) =>
      computeBattleRewards({
        ...base, chestSeed, mode: "solo", floor: 1, outcome: "victory",
        ...coined("lucky_coin:legendary:3"),
      }).chest!.tier;
    let upgraded: number | null = null;
    let plain: number | null = null;
    for (let seed = 1; seed <= 5000 && (upgraded == null || plain == null); seed++) {
      const tier = roll(seed);
      if (tier === "silver" && upgraded == null) upgraded = seed;
      if (tier === "wooden" && plain == null) plain = seed;
    }
    expect(upgraded).not.toBeNull();
    expect(plain).not.toBeNull();
    // Re-assert exactly on the found seeds.
    expect(roll(upgraded!)).toBe("silver");
    expect(roll(plain!)).toBe("wooden");
    // Rare coins never upgrade.
    const rareTier = computeBattleRewards({
      ...base, chestSeed: upgraded!, mode: "solo", floor: 1, outcome: "victory",
      ...coined("lucky_coin:rare:1"),
    }).chest!.tier;
    expect(rareTier).toBe("wooden");
  });
});
