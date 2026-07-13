// ============================================================================
// Quest board specs — pure meta logic, headless (no DOM/React).
// The contract: offers derive deterministically from (day, refreshes, ctx),
// folds are pure + idempotent-per-state (StrictMode-safe), and every quest
// kind ticks correctly from battle facts.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  applyAbandonQuest,
  applyAcceptQuest,
  applyBoardRefresh,
  applyClaimQuest,
  boardCtx,
  normalizeQuestBoard,
  rollDailyBoard,
  sanitizeQuests,
  tickQuestProgress,
  SLAY_CANDIDATES,
  SLAY_FALLBACK,
  type ActiveQuest,
  type QuestBoardCtx,
} from "@/meta/quests";
import {
  QUEST_ACTIVE_MAX,
  QUEST_BOARD_SIZE,
  QUEST_REFRESH_COST,
} from "@/meta/economy";
import { DUNGEONS } from "@/data/dungeons";
import { getUnitDef } from "@/data/units";

/** Every enemy defId that a dungeon/Depths tier actually spawns as fodder — the
 *  pool a slay bounty must draw from (killing one has to land its defId in the
 *  battle `slain` multiset for the quest to tick). */
const SPAWNED_FODDER = new Set<string>(
  Object.values(DUNGEONS).flatMap((d) =>
    d.tiers.flatMap((t) => Object.keys(t.monsters))
  )
);

const DAY = 12345;

const ctx: QuestBoardCtx = {
  unlockedUnits: ["ogre", "archer", "knight", "fire_mage"],
  seenEnemies: [],
  endlessUnlocked: false,
};

/** A save slice satisfying every quest fold (accept/refresh/claim). */
function makeSave() {
  return {
    gold: 1000,
    soulShards: 0,
    items: {} as Record<string, number>,
    unlockedUnits: ["ogre", "archer", "knight", "fire_mage"],
    bestiary: {} as Record<string, { encountered: boolean }>,
    dungeons: { depths: { highestClearedFloor: 0 } },
    quests: { day: -1, refreshes: 0, taken: [], active: [] as ActiveQuest[] },
    itemPity: 0,
  };
}

function makeActive(over: Partial<ActiveQuest> = {}): ActiveQuest {
  return {
    id: "q:1:0:0",
    kind: "arena_wins",
    goal: 2,
    difficulty: "easy",
    gold: 80,
    chestTier: "wooden",
    progress: 0,
    ...over,
  };
}

describe("rollDailyBoard", () => {
  it("is deterministic: same (day, refreshes, ctx) → identical notices", () => {
    const a = rollDailyBoard(DAY, 0, ctx);
    const b = rollDailyBoard(DAY, 0, ctx);
    expect(a).toEqual(b);
    expect(a).toHaveLength(QUEST_BOARD_SIZE);
  });

  it("re-derives a different board per refresh generation", () => {
    const a = rollDailyBoard(DAY, 0, ctx);
    const b = rollDailyBoard(DAY, 1, ctx);
    expect(a.map((n) => n.id)).not.toEqual(b.map((n) => n.id));
  });

  it("never pins two notices of the same kind", () => {
    for (let day = DAY; day < DAY + 20; day++) {
      const kinds = rollDailyBoard(day, 0, ctx).map((n) => n.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it("gates endless quests behind the mode unlock", () => {
    for (let day = DAY; day < DAY + 20; day++) {
      const kinds = rollDailyBoard(day, 0, ctx).map((n) => n.kind);
      expect(kinds).not.toContain("endless_wave");
    }
    const unlocked = { ...ctx, endlessUnlocked: true };
    const seen = new Set(
      Array.from({ length: 20 }, (_, i) =>
        rollDailyBoard(DAY + i, 0, unlocked).map((n) => n.kind)
      ).flat()
    );
    expect(seen).toContain("endless_wave");
  });

  it("slay bounties fall back to floor-1 fodder on a fresh bestiary, and use seen enemies otherwise", () => {
    for (let day = DAY; day < DAY + 30; day++) {
      for (const n of rollDailyBoard(day, 0, ctx)) {
        if (n.kind === "slay")
          expect(["giant_rat", "zombie_shambler"]).toContain(n.targetId);
        if (n.kind === "unit_wins")
          expect(ctx.unlockedUnits).toContain(n.targetId);
      }
    }
    const seenCtx = { ...ctx, seenEnemies: ["ghoul"] };
    for (let day = DAY; day < DAY + 30; day++) {
      for (const n of rollDailyBoard(day, 0, seenCtx)) {
        if (n.kind === "slay") expect(n.targetId).toBe("ghoul");
      }
    }
  });
});

describe("normalizeQuestBoard", () => {
  it("same day → the same object (identity signal)", () => {
    const q = { day: DAY, refreshes: 1, taken: ["x"], active: [] };
    expect(normalizeQuestBoard(q, DAY)).toBe(q);
  });

  it("rollover resets the board but carries accepted quests", () => {
    const active = [makeActive({ progress: 1 })];
    const next = normalizeQuestBoard(
      { day: DAY, refreshes: 2, taken: ["x"], active },
      DAY + 1
    );
    expect(next).toEqual({ day: DAY + 1, refreshes: 0, taken: [], active });
  });
});

describe("slay bounty targets are real, spawnable enemies", () => {
  // The multiset kill-count fix only helps if the target's defId actually shows
  // up in `slain`. Guard against a typo (e.g. "vault_cultist" vs "cultist") or a
  // fodder rename silently making a whole class of bounty unreachable.
  it.each([...SLAY_CANDIDATES, ...SLAY_FALLBACK])(
    "%s is a real unit def and spawns as dungeon fodder",
    (id) => {
      expect(getUnitDef(id).id).toBe(id); // real def (getUnitDef throws on unknown)
      expect(SPAWNED_FODDER.has(id)).toBe(true); // actually spawned, so it can be slain
    }
  );
});

describe("tickQuestProgress", () => {
  const baseFacts = {
    mode: "solo" as const,
    outcome: "victory" as const,
    deck: ["knight", "archer"],
    slain: [] as string[],
    wavesSurvived: 0,
  };

  it("arena_wins ticks on arena victories only", () => {
    const active = [makeActive()];
    expect(tickQuestProgress(active, baseFacts)[0].progress).toBe(1);
    expect(
      tickQuestProgress(active, { ...baseFacts, outcome: "defeat" })
    ).toBe(active); // identity when nothing moved
    expect(
      tickQuestProgress(active, { ...baseFacts, mode: "depths" })
    ).toBe(active);
  });

  it("unit_wins requires the target fielded, any mode", () => {
    const active = [makeActive({ kind: "unit_wins", targetId: "knight" })];
    expect(
      tickQuestProgress(active, { ...baseFacts, mode: "depths" })[0].progress
    ).toBe(1);
    expect(
      tickQuestProgress(active, { ...baseFacts, deck: ["ogre"] })
    ).toBe(active);
  });

  it("slay counts matching kills, win or lose", () => {
    const active = [makeActive({ kind: "slay", targetId: "ghoul", goal: 8 })];
    const facts = {
      ...baseFacts,
      mode: "depths" as const,
      outcome: "defeat" as const,
      slain: ["ghoul", "skeleton_archer", "ghoul"],
    };
    expect(tickQuestProgress(active, facts)[0].progress).toBe(2);
  });

  it("depths_clears counts replay victories too", () => {
    const active = [makeActive({ kind: "depths_clears" })];
    expect(
      tickQuestProgress(active, { ...baseFacts, mode: "depths" })[0].progress
    ).toBe(1);
  });

  it("endless_wave is a single-run high-water mark", () => {
    const active = [makeActive({ kind: "endless_wave", goal: 8, progress: 5 })];
    const at7 = tickQuestProgress(active, {
      ...baseFacts,
      mode: "endless",
      outcome: "defeat",
      wavesSurvived: 7,
    });
    expect(at7[0].progress).toBe(7);
    // A shallower later run never regresses it.
    expect(
      tickQuestProgress(at7, {
        ...baseFacts,
        mode: "endless",
        outcome: "defeat",
        wavesSurvived: 3,
      })
    ).toBe(at7);
  });
});

describe("accept / refresh / abandon folds", () => {
  it("accept snapshots the notice and is idempotent per state", () => {
    const save = makeSave();
    const offers = rollDailyBoard(DAY, 0, boardCtx(save));
    const once = applyAcceptQuest(save, DAY, offers[0].id);
    expect(once.quests.active).toEqual([{ ...offers[0], progress: 0 }]);
    expect(once.quests.taken).toContain(offers[0].id);
    // StrictMode re-run: already taken → no-op.
    expect(applyAcceptQuest(once, DAY, offers[0].id)).toBe(once);
    // Unknown notice → no-op.
    expect(applyAcceptQuest(save, DAY, "q:0:0:99")).toBe(save);
  });

  it("caps active slots at QUEST_ACTIVE_MAX", () => {
    const save = makeSave();
    save.quests = {
      day: DAY,
      refreshes: 0,
      taken: [],
      active: Array.from({ length: QUEST_ACTIVE_MAX }, (_, i) =>
        makeActive({ id: `held:${i}` })
      ),
    };
    const offers = rollDailyBoard(DAY, 0, boardCtx(save));
    expect(applyAcceptQuest(save, DAY, offers[0].id)).toBe(save);
  });

  it("refresh: first free, then QUEST_REFRESH_COST gold, blocked when broke", () => {
    const save = makeSave();
    const free = applyBoardRefresh(save, DAY);
    expect(free.gold).toBe(save.gold);
    expect(free.quests.refreshes).toBe(1);
    const paid = applyBoardRefresh(free, DAY);
    expect(paid.gold).toBe(save.gold - QUEST_REFRESH_COST);
    expect(paid.quests.refreshes).toBe(2);
    const broke = { ...paid, gold: QUEST_REFRESH_COST - 1 };
    expect(applyBoardRefresh(broke, DAY)).toBe(broke);
  });

  it("abandon removes only the named quest, no refund", () => {
    const save = makeSave();
    save.quests.active = [makeActive({ id: "a" }), makeActive({ id: "b" })];
    const next = applyAbandonQuest(save, "a");
    expect(next.quests.active.map((q) => q.id)).toEqual(["b"]);
    expect(next.gold).toBe(save.gold);
    expect(applyAbandonQuest(save, "zzz")).toBe(save);
  });
});

describe("applyClaimQuest", () => {
  it("pays gold + folds chest contents, steps pity, retires the quest", () => {
    const save = makeSave();
    save.itemPity = 2;
    save.quests.active = [makeActive({ id: "done", progress: 2, gold: 80 })];
    const next = applyClaimQuest(save, "done", [
      { kind: "gold", amount: 30 },
      { kind: "item", lineId: "soldiers_blade", quality: "rare" },
    ]);
    expect(next.gold).toBe(save.gold + 80 + 30);
    expect(Object.values(next.items).reduce((n, c) => n + c, 0)).toBe(1);
    expect(next.itemPity).toBe(0); // item inside → pity resets
    expect(next.quests.active).toEqual([]);
  });

  it("itemless chest bumps pity; incomplete/unknown quests no-op", () => {
    const save = makeSave();
    save.itemPity = 1;
    save.quests.active = [
      makeActive({ id: "done", progress: 2 }),
      makeActive({ id: "wip", progress: 1 }),
    ];
    const next = applyClaimQuest(save, "done", [{ kind: "gold", amount: 25 }]);
    expect(next.itemPity).toBe(2);
    expect(applyClaimQuest(save, "wip", [])).toBe(save);
    expect(applyClaimQuest(save, "nope", [])).toBe(save);
  });
});

describe("sanitizeQuests", () => {
  it("rebuilds junk into a valid fresh state", () => {
    expect(sanitizeQuests(undefined)).toEqual({
      day: -1,
      refreshes: 0,
      taken: [],
      active: [],
    });
    expect(sanitizeQuests({ day: "x", refreshes: -3, taken: [1, "a"] })).toEqual(
      { day: -1, refreshes: 0, taken: ["a"], active: [] }
    );
  });

  it("keeps valid active quests, drops broken ones, caps the list", () => {
    const good = makeActive({ id: "g", progress: 1 });
    const out = sanitizeQuests({
      day: DAY,
      refreshes: 1,
      taken: [],
      active: [
        good,
        { ...makeActive(), kind: "bogus" }, // unknown kind
        { ...makeActive(), kind: "slay", targetId: "not_a_unit" }, // dead target
        makeActive({ id: "a" }),
        makeActive({ id: "b" }),
        makeActive({ id: "c" }), // over the cap
      ],
    });
    expect(out.active.map((q) => q.id)).toEqual(["g", "a", "b"]);
    expect(out.active[0]).toEqual(good);
  });
});
