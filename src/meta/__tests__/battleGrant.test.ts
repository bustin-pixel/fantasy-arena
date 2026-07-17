// ============================================================================
// Battle-grant specs — the fold that turns a resolved match into save deltas.
// This is the highest-stakes save write in the game (gold + unlocks + XP +
// quest progress + dungeon clears, all atomic), and it was untestable while it
// lived inside a React closure. The guarantees that matter:
//   1. purity — the input save is never mutated, and a re-run (StrictMode
//      double-invoke) from the SAME input yields the same output,
//   2. the grant matrix — XP cap, chest fold, first-clear gifts, endless
//      best-wave, quest unlocks each land exactly once.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  applyBattleGrant,
  type BattleGrantCtx,
  type BattleGrantSlice,
} from "@/meta/battleGrant";
import type { BattleRewards, ChestContent } from "@/meta/rewards";
import { MILESTONE_UNLOCKS } from "@/meta/economy";
import { TOTAL_XP_CAP } from "@/meta/leveling";
import { getDungeon } from "@/data/dungeons";

const baseSave = (over: Partial<BattleGrantSlice> = {}): BattleGrantSlice => ({
  gold: 100,
  soulShards: 5,
  items: {},
  unlockedUnits: ["knight"],
  unitXp: {},
  dungeons: {},
  questUnlocks: [],
  endless: { bestWave: 0 },
  quests: { day: -1, refreshes: 0, taken: [], active: [] },
  itemPity: 0,
  ...over,
});

const noRewards = (over: Partial<BattleRewards> = {}): BattleRewards => ({
  gold: 0,
  xp: 0,
  chest: null,
  shards: 0,
  firstClear: false,
  ...over,
});

/** A chest whose contents are hand-written rather than rolled — the seed is
 *  audit-only bookkeeping the fold never reads. */
const chest = (contents: ChestContent[]): BattleRewards["chest"] => ({
  tier: "wooden",
  seed: 1,
  contents,
});

const ctx = (over: Partial<BattleGrantCtx> = {}): BattleGrantCtx => ({
  mode: "depths",
  floor: 1,
  dungeonId: "depths",
  ...over,
});

describe("applyBattleGrant purity", () => {
  it("never mutates the input save", () => {
    const save = baseSave({ unitXp: { knight: 10 } });
    const snapshot = structuredClone(save);
    applyBattleGrant(
      save,
      noRewards({ gold: 50, xp: 30, shards: 2 }),
      ctx({ deck: ["knight"] })
    );
    expect(save).toEqual(snapshot);
  });

  it("is deterministic — the same input folds to the same output twice", () => {
    const save = baseSave();
    const rewards = noRewards({ gold: 50, xp: 30, shards: 2 });
    const c = ctx({ deck: ["knight", "rogue"] });
    expect(applyBattleGrant(save, rewards, c)).toEqual(
      applyBattleGrant(save, rewards, c)
    );
  });
});

describe("applyBattleGrant currency + XP", () => {
  it("adds flat battle gold and shards", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ gold: 50, shards: 3 }),
      ctx()
    );
    expect(out.gold).toBe(150);
    expect(out.soulShards).toBe(8);
  });

  it("pays the full XP to EVERY unit in the fielded deck", () => {
    const out = applyBattleGrant(
      baseSave({ unitXp: { knight: 10 } }),
      noRewards({ xp: 40 }),
      ctx({ deck: ["knight", "rogue"] })
    );
    expect(out.unitXp).toEqual({ knight: 50, rogue: 40 });
  });

  it("pays a duplicated deck entry once (the deck is a set here)", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ xp: 40 }),
      ctx({ deck: ["knight", "knight"] })
    );
    expect(out.unitXp).toEqual({ knight: 40 });
  });

  it("clamps XP at the level cap", () => {
    const out = applyBattleGrant(
      baseSave({ unitXp: { knight: TOTAL_XP_CAP - 5 } }),
      noRewards({ xp: 999 }),
      ctx({ deck: ["knight"] })
    );
    expect(out.unitXp.knight).toBe(TOTAL_XP_CAP);
  });

  it("zero XP touches no unit's ledger", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ xp: 0 }),
      ctx({ deck: ["knight"] })
    );
    expect(out.unitXp).toEqual({});
  });
});

describe("applyBattleGrant chest contents", () => {
  it("folds chest gold/shards/units/items on top of the flat battle pay", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({
        gold: 10,
        chest: chest([
          { kind: "gold", amount: 25 },
          { kind: "shards", amount: 4 },
          { kind: "unit", unitId: "rogue" },
        ]),
      }),
      ctx()
    );
    expect(out.gold).toBe(135); // 100 + 10 flat + 25 chest
    expect(out.soulShards).toBe(9);
    expect(out.unlockedUnits).toContain("rogue");
  });

  it("steps item pity on an itemless chest and resets it on an item", () => {
    const itemless = applyBattleGrant(
      baseSave({ itemPity: 3 }),
      noRewards({ chest: chest([{ kind: "gold", amount: 5 }]) }),
      ctx()
    );
    expect(itemless.itemPity).toBe(4);

    const withItem = applyBattleGrant(
      baseSave({ itemPity: 3 }),
      noRewards({
        chest: chest([
          { kind: "item", lineId: "iron_sword", quality: "rare" },
        ]),
      }),
      ctx()
    );
    expect(withItem.itemPity).toBe(0);
  });

  it("leaves pity untouched when no chest dropped", () => {
    const out = applyBattleGrant(baseSave({ itemPity: 3 }), noRewards(), ctx());
    expect(out.itemPity).toBe(3);
  });
});

describe("applyBattleGrant dungeon clears", () => {
  it("a first clear writes the dungeon's floor count and hands over ALL its gifts", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ firstClear: true }),
      ctx({ mode: "depths", dungeonId: "depths" })
    );
    expect(out.dungeons.depths.highestClearedFloor).toBe(
      getDungeon("depths").floors
    );
    for (const unitId of Object.values(MILESTONE_UNLOCKS.depths)) {
      expect(out.unlockedUnits).toContain(unitId);
    }
  });

  it("never walks the clear mark backwards", () => {
    const out = applyBattleGrant(
      baseSave({ dungeons: { depths: { highestClearedFloor: 99 } } }),
      noRewards({ firstClear: true }),
      ctx({ mode: "depths", dungeonId: "depths" })
    );
    expect(out.dungeons.depths.highestClearedFloor).toBe(99);
  });

  it("no firstClear → no gift, no clear mark", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ firstClear: false }),
      ctx({ mode: "depths", dungeonId: "depths" })
    );
    expect(out.dungeons).toEqual({});
    expect(out.unlockedUnits).toEqual(["knight"]);
  });

  it("a firstClear outside depths mode grants nothing", () => {
    const out = applyBattleGrant(
      baseSave(),
      noRewards({ firstClear: true }),
      ctx({ mode: "solo", dungeonId: "depths" })
    );
    expect(out.dungeons).toEqual({});
  });
});

describe("applyBattleGrant endless + quest unlocks", () => {
  it("folds the run's depth into the best-wave high-water mark", () => {
    const out = applyBattleGrant(
      baseSave({ endless: { bestWave: 4 } }),
      noRewards(),
      ctx({ mode: "endless", wavesSurvived: 9 })
    );
    expect(out.endless.bestWave).toBe(9);
  });

  it("a worse endless run never lowers the record", () => {
    const out = applyBattleGrant(
      baseSave({ endless: { bestWave: 12 } }),
      noRewards(),
      ctx({ mode: "endless", wavesSurvived: 3 })
    );
    expect(out.endless.bestWave).toBe(12);
  });

  it("leaves the record alone outside endless mode", () => {
    const out = applyBattleGrant(
      baseSave({ endless: { bestWave: 4 } }),
      noRewards(),
      ctx({ mode: "depths", wavesSurvived: 9 })
    );
    expect(out.endless.bestWave).toBe(4);
  });

  it("adds quest unlocks without duplicating an existing one", () => {
    const out = applyBattleGrant(
      baseSave({ questUnlocks: ["slime_knight"] }),
      noRewards({ questUnlocks: ["slime_knight", "aegis_knight"] }),
      ctx()
    );
    expect([...out.questUnlocks].sort()).toEqual([
      "aegis_knight",
      "slime_knight",
    ]);
  });
});
