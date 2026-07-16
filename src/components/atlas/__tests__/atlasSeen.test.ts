// ============================================================================
// atlasSeen spec — the Dungeon Atlas's celebrated-progress diff.
// Guards the ceremony triggers: floor progress, world-gate flips (incl. the
// fork double-unlock), the fresh-install/first-meeting seeding contract, and
// storage robustness (node env has no localStorage → stubbed).
// ============================================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateSave, type PlayerSave } from "@/state/persistence";
import { getDungeon } from "@/data/dungeons";
import {
  markAllSeen,
  pendingUnlocks,
  readAtlasSeen,
  writeAtlasSeen,
  type AtlasSeen,
} from "@/components/atlas/atlasSeen";

/** A save with the given cleared-floor marks (missing dungeons = 0). */
function saveWith(progress: Record<string, number>): PlayerSave {
  const save = migrateSave(null);
  for (const [id, floor] of Object.entries(progress)) {
    save.dungeons[id] = { highestClearedFloor: floor };
  }
  return save;
}

/** Minimal in-memory localStorage for the node test env. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(stubStorage);
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("read/write round-trip", () => {
  it("never-written store reads as null (the seed-me signal)", () => {
    expect(readAtlasSeen()).toBeNull();
  });

  it("round-trips a seen map and drops junk entries", () => {
    writeAtlasSeen({ depths: 3, bonefields: 0 });
    expect(readAtlasSeen()).toEqual({ depths: 3, bonefields: 0 });
    localStorage.setItem(
      "fantasy-arena:atlas-seen:v1",
      JSON.stringify({ depths: 2, junk: "nope" })
    );
    expect(readAtlasSeen()).toEqual({ depths: 2 });
  });

  it("corrupt payload reads as null rather than throwing", () => {
    localStorage.setItem("fantasy-arena:atlas-seen:v1", "{not json");
    expect(readAtlasSeen()).toBeNull();
  });

  it("markAllSeen snapshots the save's whole progress", () => {
    markAllSeen(saveWith({ depths: 5, bonefields: 2 }));
    const seen = readAtlasSeen()!;
    expect(seen.depths).toBe(5);
    expect(seen.bonefields).toBe(2);
    expect(seen.wilds).toBe(0);
  });
});

describe("pendingUnlocks", () => {
  it("fresh install (no progress, empty seen) owes nothing", () => {
    expect(pendingUnlocks(saveWith({}), {})).toEqual([]);
  });

  it("seen caught up with the save owes nothing", () => {
    const save = saveWith({ depths: 3 });
    expect(pendingUnlocks(save, { depths: 3 })).toEqual([]);
    // Seen ahead (save reset/import) must not celebrate either.
    expect(pendingUnlocks(save, { depths: 5 })).toEqual([]);
  });

  it("a new floor clear owes one floor ceremony", () => {
    const owed = pendingUnlocks(saveWith({ depths: 3 }), { depths: 2 });
    expect(owed).toEqual([
      {
        dungeonId: "depths",
        toFloor: 4,
        clearedFloor: 3,
        unlockedDungeonIds: [],
      },
    ]);
  });

  it("toFloor caps at the dungeon's deepest floor", () => {
    const floors = getDungeon("depths").floors;
    const owed = pendingUnlocks(saveWith({ depths: floors }), {
      depths: floors - 1,
    });
    expect(owed[0].toFloor).toBe(floors);
  });

  it("clearing a gate floor also reports the world-gate flip", () => {
    const floors = getDungeon("depths").floors;
    const owed = pendingUnlocks(saveWith({ depths: floors }), {
      depths: floors - 1,
    });
    expect(owed[0].unlockedDungeonIds).toEqual(["bonefields"]);
  });

  it("fork: clearing the spire unlocks BOTH endgame dungeons at once", () => {
    const spireFloors = getDungeon("eclipse_spire").floors;
    const owed = pendingUnlocks(saveWith({ eclipse_spire: spireFloors }), {
      eclipse_spire: spireFloors - 1,
    });
    expect(owed.length).toBe(1);
    expect(owed[0].unlockedDungeonIds.sort()).toEqual([
      "fallen_cathedral",
      "rogues_den",
    ]);
  });

  it("a child already unlocked under the seen map doesn't re-flip", () => {
    // Bonefields has its own progress (never re-locks), so clearing the
    // depths gate again celebrates the floor but flips no world gate.
    const floors = getDungeon("depths").floors;
    const save = saveWith({ depths: floors, bonefields: 1 });
    const seen: AtlasSeen = { depths: floors - 1, bonefields: 1 };
    const owed = pendingUnlocks(save, seen);
    expect(owed.length).toBe(1);
    expect(owed[0].unlockedDungeonIds).toEqual([]);
  });

  it("multiple dungeons ahead each owe their own ceremony", () => {
    const save = saveWith({ depths: 3, bonefields: 2 });
    const owed = pendingUnlocks(save, { depths: 2, bonefields: 1 });
    expect(owed.map((o) => o.dungeonId)).toEqual(["depths", "bonefields"]);
  });
});
