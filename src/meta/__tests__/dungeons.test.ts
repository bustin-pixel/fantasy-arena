// Dungeon registry sanity — the gate chain and the monster-level ladder.
// These are DATA specs (guards designer typos): the chain must stay a single
// acyclic walk rooted at The Depths, and the ladder must track the player's
// expected arrival level (see data/dungeons.ts registry comment).
import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  DUNGEON_IDS,
  ELITE_LEVEL_BONUS,
  getDungeon,
  isDungeonUnlocked,
  monsterLevelFor,
} from "@/data/dungeons";
import { LEVEL_CAP } from "@/meta/leveling";

/** clearedFloorOf backed by a plain record (missing id = nothing cleared). */
const clearedFrom =
  (progress: Record<string, number>) =>
  (id: string): number =>
    progress[id] ?? 0;

describe("dungeon registry — gate chain sanity", () => {
  it("every gate points at a real dungeon and a reachable floor", () => {
    for (const d of Object.values(DUNGEONS)) {
      if (!d.gate) continue;
      const prereq = getDungeon(d.gate.dungeonId); // throws on a bad id
      expect(d.gate.floor).toBeGreaterThanOrEqual(1);
      expect(d.gate.floor).toBeLessThanOrEqual(prereq.floors);
    }
  });

  it("the Depths is the gateless root; every chain walk terminates there", () => {
    expect(DUNGEONS.depths.gate).toBeUndefined();
    for (const d of Object.values(DUNGEONS)) {
      let cur = d;
      const seen = new Set<string>([cur.id]);
      while (cur.gate) {
        cur = getDungeon(cur.gate.dungeonId);
        expect(seen.has(cur.id)).toBe(false); // no cycles
        seen.add(cur.id);
      }
      expect(cur.id).toBe("depths");
    }
  });

  it("the chain runs Depths → Bonefields → Wilds → Overgrowth → Vault → Forge → Spire", () => {
    const prereqOf = (id: string) => getDungeon(id).gate?.dungeonId;
    expect(prereqOf("bonefields")).toBe("depths");
    expect(prereqOf("wilds")).toBe("bonefields");
    expect(prereqOf("overgrowth")).toBe("wilds");
    expect(prereqOf("sealed_vault")).toBe("overgrowth");
    expect(prereqOf("deep_forge")).toBe("sealed_vault");
    expect(prereqOf("eclipse_spire")).toBe("deep_forge");
    // The registry lists them in chain order (the dungeon map reads this).
    expect(DUNGEON_IDS).toEqual([
      "depths",
      "bonefields",
      "wilds",
      "overgrowth",
      "sealed_vault",
      "deep_forge",
      "eclipse_spire",
    ]);
  });
});

describe("monster-level ladder", () => {
  it("holds the tuned ladder 1/3/5/6/7/8/9 along the chain", () => {
    expect(DUNGEON_IDS.map((id) => getDungeon(id).monsterLevel)).toEqual([
      1, 3, 5, 6, 7, 8, 9,
    ]);
  });

  it("levels climb the chain and elites never exceed the player level cap", () => {
    let prev = 0;
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      expect(d.monsterLevel).toBeGreaterThan(prev);
      expect(monsterLevelFor(d, "boss")).toBeLessThanOrEqual(LEVEL_CAP);
      prev = d.monsterLevel;
    }
  });

  it("fodder spawns at the dungeon level; rares and bosses run +1", () => {
    const d = getDungeon("bonefields");
    expect(monsterLevelFor(d, "fodder")).toBe(d.monsterLevel);
    expect(monsterLevelFor(d, "rare")).toBe(d.monsterLevel + ELITE_LEVEL_BONUS);
    expect(monsterLevelFor(d, "boss")).toBe(d.monsterLevel + ELITE_LEVEL_BONUS);
  });
});

describe("isDungeonUnlocked", () => {
  it("gateless dungeons are always unlocked", () => {
    expect(isDungeonUnlocked(getDungeon("depths"), clearedFrom({}))).toBe(true);
  });

  it("unlocks when the prerequisite floor is cleared, not before", () => {
    const bonefields = getDungeon("bonefields");
    expect(isDungeonUnlocked(bonefields, clearedFrom({ depths: 4 }))).toBe(false);
    expect(isDungeonUnlocked(bonefields, clearedFrom({ depths: 5 }))).toBe(true);
  });

  it("NEVER re-locks: a dungeon with its own progress stays open (legacy saves)", () => {
    // Pre-chain saves could clear dungeons out of order — e.g. the Spire before
    // the Forge. Own progress must satisfy the gate even with the prereq at 0.
    const spire = getDungeon("eclipse_spire");
    expect(isDungeonUnlocked(spire, clearedFrom({ eclipse_spire: 2 }))).toBe(true);
    expect(isDungeonUnlocked(spire, clearedFrom({}))).toBe(false);
  });

  it("walking the chain: only Depths cleared → Bonefields open, the rest locked", () => {
    const cleared = clearedFrom({ depths: 5 });
    const unlocked = DUNGEON_IDS.filter((id) =>
      isDungeonUnlocked(getDungeon(id), cleared)
    );
    expect(unlocked).toEqual(["depths", "bonefields"]);
  });
});
