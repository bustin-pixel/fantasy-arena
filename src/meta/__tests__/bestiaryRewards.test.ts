// ============================================================================
// Bestiary-reward specs — the one-time Compendium payouts.
// The guarantees that matter (all of them are "this can't be farmed"):
//   1. every stream pays on a false→true crossing and NEVER again,
//   2. bosses pay their premium band + a shard; heroes/summon-defs pay nothing,
//   3. slayer milestones ride the PvE kill gate and pay every level crossed,
//   4. a book pays exactly on its last defeat,
//   5. the retro-grant is the same math with an empty prior — so migration and
//      the per-battle fold can never disagree.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  computeBattleBestiaryRewards,
  computeBestiaryRewards,
  computeRetroBestiaryRewards,
  earnedTitleIds,
  foldBestiarySeen,
  foldMonsterKills,
  titleLabel,
  LOREMASTER_TITLE_ID,
  type BestiaryMap,
} from "@/meta/bestiaryRewards";
import {
  BESTIARY_REWARDS,
  SLAYER_MASTERY_SHARDS,
  SLAYER_MILESTONE_GOLD,
} from "@/meta/economy";
import { SLAYER_KILL_THRESHOLDS } from "@/meta/slayer";
import { DUNGEONS, dungeonBestiaryIds } from "@/data/dungeons";

/** A monster that is NOT a boss (ordinary discovery band). */
const RAT = "giant_rat";
/** The Depths boss (premium discovery band + a shard). */
const BOSS = "bloater";

const defeated = (...ids: string[]): BestiaryMap =>
  Object.fromEntries(ids.map((id) => [id, { encountered: true, defeated: true }]));

describe("discovery rewards", () => {
  it("pays encounter then defeat when both flip in one battle", () => {
    const r = computeBattleBestiaryRewards({
      priorBestiary: {},
      priorKills: {},
      seen: [RAT],
      slain: [RAT],
      countKills: true,
    });
    expect(r.discoveries.map((d) => d.kind)).toEqual(["encounter", "defeat"]);
    expect(r.gold).toBe(
      BESTIARY_REWARDS.encounterGold + BESTIARY_REWARDS.defeatGold
    );
    expect(r.shards).toBe(0);
  });

  it("pays a sighting alone, then only the defeat on a later kill", () => {
    const seenOnly = computeBattleBestiaryRewards({
      priorBestiary: {},
      priorKills: {},
      seen: [RAT],
      slain: [],
      countKills: true,
    });
    expect(seenOnly.gold).toBe(BESTIARY_REWARDS.encounterGold);

    // Second battle: already encountered, now slain — only the defeat pays.
    const prior = foldBestiarySeen({}, [RAT], []);
    const killed = computeBattleBestiaryRewards({
      priorBestiary: prior,
      priorKills: {},
      seen: [RAT],
      slain: [RAT],
      countKills: true,
    });
    expect(killed.discoveries.map((d) => d.kind)).toEqual(["defeat"]);
    expect(killed.gold).toBe(BESTIARY_REWARDS.defeatGold);
  });

  it("never re-pays a monster already fully discovered", () => {
    const prior = defeated(RAT);
    const r = computeBattleBestiaryRewards({
      priorBestiary: prior,
      priorKills: {},
      seen: [RAT, RAT],
      slain: [RAT, RAT, RAT],
      countKills: true,
    });
    expect(r.discoveries).toEqual([]);
    expect(r.gold).toBe(0);
  });

  it("bosses pay the premium band plus a Soul Shard", () => {
    const r = computeBattleBestiaryRewards({
      priorBestiary: {},
      priorKills: {},
      seen: [BOSS],
      slain: [BOSS],
      countKills: true,
    });
    expect(r.discoveries.every((d) => d.boss)).toBe(true);
    expect(r.gold).toBe(
      BESTIARY_REWARDS.bossEncounterGold + BESTIARY_REWARDS.bossDefeatGold
    );
    expect(r.shards).toBe(BESTIARY_REWARDS.bossDefeatShards);
  });

  it("pays nothing for heroes or summon-only defs (monsters only)", () => {
    const r = computeBattleBestiaryRewards({
      priorBestiary: {},
      priorKills: {},
      seen: ["knight", "wolf"], // a hero + a summon-only def
      slain: ["knight", "wolf"],
      countKills: true,
    });
    expect(r.discoveries).toEqual([]);
    expect(r.gold).toBe(0);
  });
});

describe("slayer milestones", () => {
  it("pays each level the moment its threshold is crossed", () => {
    const justUnder = SLAYER_KILL_THRESHOLDS[0] - 1;
    const r = computeBestiaryRewards({
      priorBestiary: {},
      nextBestiary: {},
      priorKills: { [RAT]: justUnder },
      nextKills: { [RAT]: justUnder + 1 },
    });
    expect(r.milestones).toEqual([
      { id: RAT, level: 1, gold: SLAYER_MILESTONE_GOLD[0], shards: 0 },
    ]);
  });

  it("pays every level when a jump crosses several at once", () => {
    const r = computeBestiaryRewards({
      priorBestiary: {},
      nextBestiary: {},
      priorKills: {},
      nextKills: { [RAT]: SLAYER_KILL_THRESHOLDS[4] }, // 0 → cap in one go
    });
    expect(r.milestones.map((m) => m.level)).toEqual([1, 2, 3, 4, 5]);
    expect(r.gold).toBe(SLAYER_MILESTONE_GOLD.reduce((a, b) => a + b, 0));
    // Only the cap pays mastery shards.
    expect(r.shards).toBe(SLAYER_MASTERY_SHARDS);
  });

  it("pays nothing when kills rise without crossing a threshold", () => {
    const r = computeBestiaryRewards({
      priorBestiary: {},
      nextBestiary: {},
      priorKills: { [RAT]: 1 },
      nextKills: { [RAT]: 2 },
    });
    expect(r.milestones).toEqual([]);
  });

  it("arena (countKills false) earns discovery but never a milestone", () => {
    const nearLevelUp = SLAYER_KILL_THRESHOLDS[0] - 1;
    const r = computeBattleBestiaryRewards({
      priorBestiary: {},
      priorKills: { [RAT]: nearLevelUp },
      seen: [RAT],
      slain: [RAT],
      countKills: false, // the arena gate
    });
    expect(r.milestones).toEqual([]);
    expect(r.discoveries.length).toBe(2); // discovery still pays
  });
});

describe("book completion", () => {
  it("pays exactly on the last defeat in a dungeon's book, once", () => {
    const ids = dungeonBestiaryIds(DUNGEONS.depths);
    const allButLast = ids.slice(0, -1);
    const last = ids[ids.length - 1];

    const prior = defeated(...allButLast);
    const completing = computeBattleBestiaryRewards({
      priorBestiary: prior,
      priorKills: {},
      seen: [last],
      slain: [last],
      countKills: true,
    });
    expect(completing.completedBooks.map((b) => b.dungeonId)).toEqual(["depths"]);
    expect(completing.completedBooks[0].gold).toBe(
      BESTIARY_REWARDS.bookCompletionGold
    );

    // Fighting there again pays no second completion.
    const after = computeBattleBestiaryRewards({
      priorBestiary: defeated(...ids),
      priorKills: {},
      seen: ids,
      slain: ids,
      countKills: true,
    });
    expect(after.completedBooks).toEqual([]);
  });

  it("does not pay while any page is still missing", () => {
    const ids = dungeonBestiaryIds(DUNGEONS.depths);
    const r = computeBestiaryRewards({
      priorBestiary: {},
      nextBestiary: defeated(...ids.slice(0, -1)),
      priorKills: {},
      nextKills: {},
    });
    expect(r.completedBooks).toEqual([]);
  });
});

describe("retro grant", () => {
  it("pays a fully-recorded save the same total the battles would have", () => {
    const bestiary = defeated(RAT, BOSS);
    const kills = { [RAT]: SLAYER_KILL_THRESHOLDS[1] }; // slayer II
    const retro = computeRetroBestiaryRewards(bestiary, kills);

    // Same thing, expressed as the equivalent prior→next step.
    const equivalent = computeBestiaryRewards({
      priorBestiary: {},
      nextBestiary: bestiary,
      priorKills: {},
      nextKills: kills,
    });
    expect(retro).toEqual(equivalent);
    expect(retro.milestones.map((m) => m.level)).toEqual([1, 2]);
    expect(retro.gold).toBeGreaterThan(0);
  });

  it("pays nothing for an empty (brand-new) save", () => {
    const retro = computeRetroBestiaryRewards({}, {});
    expect(retro.gold).toBe(0);
    expect(retro.shards).toBe(0);
    expect(retro.discoveries).toEqual([]);
  });
});

describe("purity + idempotence", () => {
  it("never mutates its inputs and re-runs identically (StrictMode)", () => {
    const priorBestiary = defeated(RAT);
    const priorKills = { [RAT]: 5 };
    const frozenBestiary = structuredClone(priorBestiary);
    const frozenKills = { ...priorKills };

    const args = {
      priorBestiary,
      priorKills,
      seen: [BOSS],
      slain: [BOSS, RAT],
      countKills: true,
    };
    const a = computeBattleBestiaryRewards(args);
    const b = computeBattleBestiaryRewards(args);

    expect(a).toEqual(b);
    expect(priorBestiary).toEqual(frozenBestiary);
    expect(priorKills).toEqual(frozenKills);
  });

  it("fold helpers return fresh maps and leave the originals alone", () => {
    const bestiary: BestiaryMap = {};
    const kills = { [RAT]: 1 };
    const nextB = foldBestiarySeen(bestiary, [RAT], []);
    const nextK = foldMonsterKills(kills, [RAT], true);

    expect(bestiary).toEqual({});
    expect(kills).toEqual({ [RAT]: 1 });
    expect(nextB[RAT]).toEqual({ encountered: true, defeated: false });
    expect(nextK[RAT]).toBe(2);
  });

  it("foldMonsterKills is identity when the PvE gate is closed", () => {
    const kills = { [RAT]: 1 };
    expect(foldMonsterKills(kills, [RAT], false)).toBe(kills);
  });
});

describe("titles", () => {
  it("earns a boss epithet on that boss's defeat, and not before", () => {
    expect(earnedTitleIds({}, {})).toEqual([]);
    const earned = earnedTitleIds(defeated(BOSS), {});
    expect(earned).toContain(`slayer:${BOSS}`);
    expect(titleLabel(`slayer:${BOSS}`)).toBe("Bloaterbane");
  });

  it("earns Loremaster only once every dungeon book is complete", () => {
    const everyMonster = Object.keys(DUNGEONS).flatMap((id) =>
      dungeonBestiaryIds(DUNGEONS[id])
    );
    expect(earnedTitleIds(defeated(...everyMonster), {})).toContain(
      LOREMASTER_TITLE_ID
    );
    // Drop a single page and the title is gone.
    expect(earnedTitleIds(defeated(...everyMonster.slice(1)), {})).not.toContain(
      LOREMASTER_TITLE_ID
    );
  });

  it("every dungeon boss has a title, and unknown ids have no label", () => {
    const allBosses = Object.values(DUNGEONS).flatMap((d) =>
      d.tiers.map((t) => t.boss)
    );
    const earned = earnedTitleIds(defeated(...allBosses), {});
    for (const boss of allBosses) expect(earned).toContain(`slayer:${boss}`);
    expect(titleLabel("not_a_title")).toBeNull();
    expect(titleLabel(null)).toBeNull();
  });
});
