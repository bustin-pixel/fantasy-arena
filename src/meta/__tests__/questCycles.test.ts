// ============================================================================
// Weekly contracts + monthly saga spec. Covers the three things most likely to
// break silently: period rollover (including a claim raced against it), the
// tick semantics that differ from the daily board, and the claim gates that
// keep a StrictMode double-invoke — or a double-tap — from double-granting.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  applyClaimDaily,
  applyClaimSagaStage,
  applyClaimWeekly,
  applyClaimWeeklySweep,
  currentStage,
  describeWeekly,
  normalizeSaga,
  normalizeWeekly,
  rollWeeklyBoard,
  sagaStageClaimable,
  sanitizeMonthlySaga,
  sanitizePendingPicks,
  sanitizeWeeklyQuests,
  SAGA_THEMES,
  sweepEarned,
  themeForMonth,
  tickSagaProgress,
  tickWeeklyProgress,
  weeklyClaimable,
  weeklyCtx,
  type CycleFacts,
  type CycleSlice,
  type WeeklyBoardCtx,
  type WeeklyQuest,
} from "@/meta/questCycles";
import { WEEKLY_QUEST_COUNT } from "@/meta/economy";
import { resolvePendingPick } from "@/meta/rewards";
import type { ActiveQuest } from "@/meta/quests";
import { ITEM_LINES } from "@/data/items";

const WEEK = 2900;
const MONTH = 24318;
const CYCLES = { week: WEEK, month: MONTH };

const ctx = (over: Partial<WeeklyBoardCtx> = {}): WeeklyBoardCtx => ({
  unlockedUnits: ["knight", "archer"],
  seenEnemies: ["giant_rat", "ghoul"],
  endlessUnlocked: true,
  tiersUnlocked: true,
  ...over,
});

const facts = (over: Partial<CycleFacts> = {}): CycleFacts => ({
  mode: "solo",
  outcome: "victory",
  deck: ["knight"],
  slain: [],
  wavesSurvived: 0,
  tier: "normal",
  goldEarned: 0,
  ...over,
});

const weekly = (quests: WeeklyQuest[], over = {}) => ({
  week: WEEK,
  quests,
  claimed: [] as string[],
  sweepClaimed: false,
  ...over,
});

const quest = (over: Partial<WeeklyQuest> = {}): WeeklyQuest => ({
  id: "w:2900:0",
  kind: "arena_wins",
  goal: 2,
  gold: 400,
  chestTier: "gold",
  progress: 0,
  ...over,
});

const makeSave = (over: Partial<CycleSlice> = {}): CycleSlice => ({
  gold: 1000,
  soulShards: 0,
  items: {},
  unlockedUnits: ["knight", "archer"],
  pendingPicks: [],
  bestiary: { giant_rat: { encountered: true } },
  dungeons: { depths: { highestClearedFloor: 6 } },
  quests: { day: -1, refreshes: 0, taken: [], active: [] as ActiveQuest[] },
  itemPity: 0,
  weeklyQuests: weekly([]),
  monthlySaga: { month: MONTH, stage: 0, progress: 0 },
  ...over,
});

// ---------------------------------------------------------------------------

describe("rollWeeklyBoard", () => {
  it("is deterministic and deals distinct kinds", () => {
    const a = rollWeeklyBoard(WEEK, ctx());
    const b = rollWeeklyBoard(WEEK, ctx());
    expect(a).toEqual(b);
    expect(a).toHaveLength(WEEKLY_QUEST_COUNT);
    expect(new Set(a.map((q) => q.kind)).size).toBe(a.length);
    expect(new Set(a.map((q) => q.id)).size).toBe(a.length);
  });

  it("ids live in their own namespace so they can't collide with dailies", () => {
    for (const q of rollWeeklyBoard(WEEK, ctx())) {
      expect(q.id.startsWith("w:")).toBe(true);
    }
  });

  it("different weeks roll different boards", () => {
    const a = rollWeeklyBoard(WEEK, ctx());
    const b = rollWeeklyBoard(WEEK + 1, ctx());
    expect(a).not.toEqual(b);
  });

  it("gates endless_waves and tier_wins behind their unlocks", () => {
    const locked = rollWeeklyBoard(
      WEEK,
      ctx({ endlessUnlocked: false, tiersUnlocked: false })
    );
    for (const q of locked) {
      expect(q.kind).not.toBe("endless_waves");
      expect(q.kind).not.toBe("tier_wins");
    }
  });

  it("names a quarry the player has actually met, else the fallback", () => {
    // Sweep weeks so we're sure to hit a slay_any roll.
    for (let w = WEEK; w < WEEK + 40; w++) {
      for (const q of rollWeeklyBoard(w, ctx({ seenEnemies: [] }))) {
        if (q.kind === "slay_any" && q.targetId) {
          expect(["giant_rat", "zombie_shambler"]).toContain(q.targetId);
        }
      }
    }
  });

  it("weeklyCtx reuses the daily board's endless gate rather than re-deriving it", () => {
    expect(weeklyCtx(makeSave()).endlessUnlocked).toBe(true);
    const shallow = makeSave({ dungeons: { depths: { highestClearedFloor: 1 } } });
    expect(weeklyCtx(shallow).endlessUnlocked).toBe(false);
    // Any cleared dungeon at all is what opens the Hard/Elite ladder.
    expect(weeklyCtx(shallow).tiersUnlocked).toBe(true);
    expect(
      weeklyCtx(makeSave({ dungeons: {} })).tiersUnlocked
    ).toBe(false);
  });
});

describe("period rollover", () => {
  it("same week returns the SAME object (identity is the no-op signal)", () => {
    const w = weekly([quest()]);
    expect(normalizeWeekly(w, WEEK, ctx())).toBe(w);
    const s = { month: MONTH, stage: 1, progress: 3 };
    expect(normalizeSaga(s, MONTH)).toBe(s);
  });

  it("a new week discards progress, the claim ledger AND the sweep flag", () => {
    const w = weekly([quest({ progress: 99 })], {
      claimed: ["w:2900:0"],
      sweepClaimed: true,
    });
    const next = normalizeWeekly(w, WEEK + 1, ctx());
    expect(next.week).toBe(WEEK + 1);
    expect(next.claimed).toEqual([]);
    expect(next.sweepClaimed).toBe(false);
    expect(next.quests.every((q) => q.progress === 0)).toBe(true);
  });

  it("a new month restarts the saga chain", () => {
    const next = normalizeSaga({ month: MONTH, stage: 2, progress: 40 }, MONTH + 1);
    expect(next).toEqual({ month: MONTH + 1, stage: 0, progress: 0 });
  });

  it("themes rotate and survive a negative month index", () => {
    expect(themeForMonth(0).id).toBe(SAGA_THEMES[0].id);
    expect(themeForMonth(SAGA_THEMES.length).id).toBe(SAGA_THEMES[0].id);
    expect(themeForMonth(-1).id).toBe(SAGA_THEMES[SAGA_THEMES.length - 1].id);
  });

  it("every theme's weekly stage stays finishable inside one month", () => {
    for (const theme of SAGA_THEMES) {
      const stage = theme.stages.find((s) => s.kind === "weekly_clears");
      expect(stage).toBeDefined();
      // More than 6 would strand anyone starting the saga mid-month.
      expect(stage!.goal).toBeLessThanOrEqual(6);
    }
  });
});

describe("progress ticks", () => {
  it("counts endless waves CUMULATIVELY, unlike the daily high-water kind", () => {
    let w = weekly([quest({ kind: "endless_waves", goal: 40 })]);
    w = tickWeeklyProgress(w, facts({ mode: "endless", wavesSurvived: 7 }));
    w = tickWeeklyProgress(w, facts({ mode: "endless", wavesSurvived: 3 }));
    expect(w.quests[0].progress).toBe(10);
  });

  it("tier_wins ignores Normal and non-depths wins", () => {
    const w0 = weekly([quest({ kind: "tier_wins", goal: 8 })]);
    expect(
      tickWeeklyProgress(w0, facts({ mode: "depths", tier: "normal" }))
    ).toBe(w0);
    expect(tickWeeklyProgress(w0, facts({ mode: "solo", tier: "elite" }))).toBe(
      w0
    );
    const hit = tickWeeklyProgress(
      w0,
      facts({ mode: "depths", tier: "hard" })
    );
    expect(hit.quests[0].progress).toBe(1);
  });

  it("slay_any counts every kill untargeted, or just the quarry when named", () => {
    const any = tickWeeklyProgress(
      weekly([quest({ kind: "slay_any", goal: 60 })]),
      facts({ slain: ["giant_rat", "ghoul", "ghoul"] })
    );
    expect(any.quests[0].progress).toBe(3);
    const named = tickWeeklyProgress(
      weekly([quest({ kind: "slay_any", goal: 60, targetId: "ghoul" })]),
      facts({ slain: ["giant_rat", "ghoul", "ghoul"] })
    );
    expect(named.quests[0].progress).toBe(2);
  });

  it("gold_earned takes the grant's delta and never goes backwards", () => {
    const w = tickWeeklyProgress(
      weekly([quest({ kind: "gold_earned", goal: 2500 })]),
      facts({ goldEarned: 320 })
    );
    expect(w.quests[0].progress).toBe(320);
    expect(
      tickWeeklyProgress(w, facts({ goldEarned: -50 })).quests[0].progress
    ).toBe(320);
  });

  it("returns the SAME object when nothing moved, and skips claimed contracts", () => {
    const w = weekly([quest({ kind: "arena_wins" })]);
    expect(tickWeeklyProgress(w, facts({ outcome: "defeat" }))).toBe(w);
    const done = weekly([quest({ progress: 2 })], { claimed: ["w:2900:0"] });
    expect(tickWeeklyProgress(done, facts())).toBe(done);
  });

  it("the saga stops ticking once its chain is complete", () => {
    const finished = {
      month: MONTH,
      stage: themeForMonth(MONTH).stages.length,
      progress: 0,
    };
    expect(currentStage(finished)).toBeNull();
    expect(tickSagaProgress(finished, facts())).toBe(finished);
  });
});

describe("claim folds", () => {
  const done = () => quest({ progress: 2 });

  it("pays gold + chest, marks claimed, and steps pity", () => {
    const save = makeSave({
      weeklyQuests: weekly([done()]),
      itemPity: 2,
    });
    const next = applyClaimWeekly(save, "w:2900:0", [
      { kind: "gold", amount: 30 },
      { kind: "item", lineId: "soldiers_blade", quality: "rare" },
    ], CYCLES);
    expect(next.gold).toBe(save.gold + 400 + 30);
    expect(next.weeklyQuests.claimed).toEqual(["w:2900:0"]);
    expect(next.itemPity).toBe(0);
  });

  it("blocks an unfinished contract, a double claim, and an unknown id", () => {
    const save = makeSave({ weeklyQuests: weekly([quest({ progress: 1 })]) });
    expect(applyClaimWeekly(save, "w:2900:0", [], CYCLES)).toBe(save);
    expect(applyClaimWeekly(save, "nope", [], CYCLES)).toBe(save);

    const claimed = makeSave({
      weeklyQuests: weekly([done()], { claimed: ["w:2900:0"] }),
    });
    expect(applyClaimWeekly(claimed, "w:2900:0", [], CYCLES)).toBe(claimed);
  });

  it("a claim raced against Monday rollover is a no-op, not a payout", () => {
    // The board was rendered last week; the click lands after the rollover.
    const stale = makeSave({
      weeklyQuests: { ...weekly([done()]), week: WEEK - 1 },
    });
    const next = applyClaimWeekly(stale, "w:2900:0", [
      { kind: "gold", amount: 9999 },
    ], CYCLES);
    expect(next.gold).toBe(stale.gold);
  });

  it("claiming a daily credits daily_clears exactly once, and nothing when it no-ops", () => {
    const save = makeSave({
      quests: {
        day: -1,
        refreshes: 0,
        taken: [],
        active: [
          {
            id: "q:1:0:0",
            kind: "arena_wins",
            goal: 1,
            difficulty: "easy",
            gold: 50,
            chestTier: "wooden",
            progress: 1,
          },
        ],
      },
      weeklyQuests: weekly([quest({ kind: "daily_clears", goal: 10 })]),
    });
    const next = applyClaimDaily(save, "q:1:0:0", [], CYCLES);
    expect(next.weeklyQuests.quests[0].progress).toBe(1);
    // Re-running (StrictMode) finds the quest already retired → whole fold no-ops.
    expect(applyClaimDaily(next, "q:1:0:0", [], CYCLES)).toBe(next);
  });
});

describe("the weekly sweep", () => {
  const all = () => [
    quest({ id: "w:2900:0", progress: 2 }),
    quest({ id: "w:2900:1", progress: 2 }),
    quest({ id: "w:2900:2", progress: 2 }),
  ];
  const ids = ["w:2900:0", "w:2900:1", "w:2900:2"];

  it("unlocks only once every contract is claimed", () => {
    expect(sweepEarned(weekly(all()))).toBe(false);
    expect(sweepEarned(weekly(all(), { claimed: ids.slice(0, 2) }))).toBe(false);
    expect(sweepEarned(weekly(all(), { claimed: ids }))).toBe(true);
  });

  it("an empty board never counts as a sweep", () => {
    expect(sweepEarned(weekly([]))).toBe(false);
  });

  it("duplicate or stale ids in the ledger can't fake it", () => {
    // Length-equality would pass here; membership must be tested per contract.
    const faked = weekly(all(), {
      claimed: ["w:2900:0", "w:2900:0", "ghost"],
    });
    expect(sweepEarned(faked)).toBe(false);
  });

  it("pays once, then blocks — and does NOT credit weekly_clears", () => {
    const save = makeSave({
      weeklyQuests: weekly(all(), { claimed: ids }),
      monthlySaga: { month: MONTH, stage: 0, progress: 0 },
    });
    // Put the saga on its weekly_clears stage so a stray tick would show.
    const themeIdx = themeForMonth(MONTH).stages.findIndex(
      (s) => s.kind === "weekly_clears"
    );
    const onWeeklyStage = makeSave({
      ...save,
      monthlySaga: { month: MONTH, stage: themeIdx, progress: 0 },
    });
    const next = applyClaimWeeklySweep(onWeeklyStage, [
      { kind: "gold", amount: 900 },
    ], CYCLES);
    expect(next.gold).toBe(onWeeklyStage.gold + 900);
    expect(next.weeklyQuests.sweepClaimed).toBe(true);
    expect(next.monthlySaga.progress).toBe(0); // the sweep is a bonus, not a contract
    expect(applyClaimWeeklySweep(next, [{ kind: "gold", amount: 900 }], CYCLES)).toBe(
      next
    );
  });

  it("claiming the last contract is what arms the sweep", () => {
    const save = makeSave({
      weeklyQuests: weekly(all(), { claimed: ids.slice(0, 2) }),
    });
    const next = applyClaimWeekly(save, "w:2900:2", [], CYCLES);
    expect(sweepEarned(next.weeklyQuests)).toBe(true);
  });
});

describe("the monthly saga", () => {
  const theme = themeForMonth(MONTH);
  const lastIdx = theme.stages.length - 1;

  it("a non-final stage pays fixed gold/shards and advances", () => {
    const stage = theme.stages[0];
    const save = makeSave({
      monthlySaga: { month: MONTH, stage: 0, progress: stage.goal },
    });
    const next = applyClaimSagaStage(save, CYCLES, []);
    expect(next.gold).toBe(save.gold + stage.gold);
    expect(next.soulShards).toBe(save.soulShards + stage.shards);
    expect(next.monthlySaga).toEqual({ month: MONTH, stage: 1, progress: 0 });
  });

  it("blocks an unfinished stage and a completed chain", () => {
    const short = makeSave({
      monthlySaga: { month: MONTH, stage: 0, progress: 0 },
    });
    expect(applyClaimSagaStage(short, CYCLES, [])).toBe(short);
    const finished = makeSave({
      monthlySaga: { month: MONTH, stage: theme.stages.length, progress: 999 },
    });
    expect(applyClaimSagaStage(finished, CYCLES, [])).toBe(finished);
  });

  it("the finale folds the Reliquary and banks the relic CHOICE, not an item", () => {
    const save = makeSave({
      monthlySaga: {
        month: MONTH,
        stage: lastIdx,
        progress: theme.stages[lastIdx].goal,
      },
      itemPity: 2,
    });
    const next = applyClaimSagaStage(save, CYCLES, [
      { kind: "gold", amount: 2500 },
      { kind: "shards", amount: 250 },
      {
        kind: "item_choice",
        options: ["soldiers_blade", "iron_mail", "luck_coin"],
        quality: "legendary",
      },
    ]);
    expect(next.gold).toBe(save.gold + 2500);
    expect(next.soulShards).toBe(250);
    expect(next.items).toEqual({}); // nothing granted until the player picks
    expect(next.pendingPicks).toHaveLength(1);
    // The choice IS the chest's item — it must not bump the dry-streak counter.
    expect(next.itemPity).toBe(0);
    expect(next.monthlySaga.stage).toBe(theme.stages.length);
    expect(sagaStageClaimable(next.monthlySaga)).toBe(false);
  });

  it("a second Reliquary queues behind an unresolved pick instead of erasing it", () => {
    const save = makeSave({
      pendingPicks: [{ options: ["soldiers_blade"], quality: "legendary" }],
      monthlySaga: {
        month: MONTH,
        stage: lastIdx,
        progress: theme.stages[lastIdx].goal,
      },
    });
    const next = applyClaimSagaStage(save, CYCLES, [
      { kind: "item_choice", options: ["iron_mail"], quality: "legendary" },
    ]);
    expect(next.pendingPicks).toHaveLength(2);
    expect(next.pendingPicks[0].options).toEqual(["soldiers_blade"]);
  });
});

describe("resolving a relic pick", () => {
  it("grants the chosen line at 1★ and clears the pick", () => {
    const save = makeSave({
      pendingPicks: [
        { options: ["soldiers_blade", "iron_mail"], quality: "legendary" },
      ],
    });
    const next = resolvePendingPick(save, "iron_mail");
    expect(next.items["iron_mail:legendary:1"]).toBe(1);
    expect(next.pendingPicks).toEqual([]);
  });

  it("blocks an option that wasn't offered, and a second resolve", () => {
    const save = makeSave({
      pendingPicks: [{ options: ["soldiers_blade"], quality: "legendary" }],
    });
    expect(resolvePendingPick(save, "iron_mail")).toBe(save);
    const once = resolvePendingPick(save, "soldiers_blade");
    expect(resolvePendingPick(once, "soldiers_blade")).toBe(once);
    const nothingPending = makeSave();
    expect(resolvePendingPick(nothingPending, "soldiers_blade")).toBe(
      nothingPending
    );
  });
});

describe("sanitizers", () => {
  it("junk becomes a valid never-seen state", () => {
    for (const junk of [null, undefined, 42, "x", {}, []]) {
      expect(sanitizeWeeklyQuests(junk)).toEqual({
        week: -1,
        quests: [],
        claimed: [],
        sweepClaimed: false,
      });
      expect(sanitizeMonthlySaga(junk)).toEqual({
        month: -1,
        stage: 0,
        progress: 0,
      });
      expect(sanitizePendingPicks(junk)).toEqual([]);
    }
  });

  it("drops contracts with an unknown kind, a dead quarry, or a bad tier", () => {
    const out = sanitizeWeeklyQuests({
      week: 5,
      quests: [
        { ...quest(), kind: "no_such_kind" },
        { ...quest({ id: "b" }), targetId: "not_a_unit" },
        { ...quest({ id: "c" }), chestTier: "cardboard" },
        quest({ id: "keep" }),
      ],
      claimed: [],
    });
    expect(out.quests.map((q) => q.id)).toEqual(["keep"]);
  });

  it("dedupes the claim ledger and drops ids no contract owns", () => {
    const out = sanitizeWeeklyQuests({
      week: 5,
      quests: [quest({ id: "real" })],
      claimed: ["real", "real", "ghost"],
      sweepClaimed: true,
    });
    expect(out.claimed).toEqual(["real"]);
    expect(out.sweepClaimed).toBe(true);
  });

  it("clamps the saga stage to its theme and floors progress", () => {
    const stages = themeForMonth(7).stages.length;
    expect(sanitizeMonthlySaga({ month: 7, stage: 99, progress: -5 })).toEqual({
      month: 7,
      stage: stages,
      progress: 0,
    });
  });

  it("keeps surviving relic options but voids a pick with none left", () => {
    const real = Object.keys(ITEM_LINES)[0];
    const out = sanitizePendingPicks([
      { options: [real, "deleted_line"], quality: "legendary" },
      { options: ["deleted_line"], quality: "legendary" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].options).toEqual([real]);
  });
});

describe("copy", () => {
  it("every weekly kind has a describable ask", () => {
    const kinds: WeeklyQuest["kind"][] = [
      "arena_wins",
      "depths_clears",
      "slay_any",
      "endless_waves",
      "tier_wins",
      "gold_earned",
      "daily_clears",
      "weekly_clears",
    ];
    for (const kind of kinds) {
      expect(describeWeekly(quest({ kind }))).toBeTruthy();
    }
  });

  it("weeklyClaimable only fires on a finished, unclaimed contract", () => {
    expect(weeklyClaimable(weekly([quest({ progress: 1 })]))).toBe(false);
    expect(weeklyClaimable(weekly([quest({ progress: 2 })]))).toBe(true);
    expect(
      weeklyClaimable(weekly([quest({ progress: 2 })], { claimed: ["w:2900:0"] }))
    ).toBe(false);
  });
});
