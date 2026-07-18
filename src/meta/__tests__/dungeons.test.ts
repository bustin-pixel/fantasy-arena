// Dungeon registry sanity — the gate chain and the monster-level ladder.
// These are DATA specs (guards designer typos): every gate walk must be an
// acyclic path rooted at The Depths (the chain FORKS after the Eclipse Spire
// into the Fallen Cathedral and the Rogue's Den), and the ladder must track
// the player's expected arrival level (see data/dungeons.ts registry comment).
import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  DUNGEON_IDS,
  ELITE_LEVEL_BONUS,
  getDungeon,
  isDungeonUnlocked,
  MONSTER_LEVEL_CAP,
  monsterLevelFor,
} from "@/data/dungeons";
import {
  isTierUnlocked,
  NORMAL_BAND_TOP,
  TIER_IDS,
  tierMonsterLevel,
  type TierId,
} from "@/data/tiers";
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

  it("the chain runs Depths → … → Spire, then forks into Cathedral and Den", () => {
    const prereqOf = (id: string) => getDungeon(id).gate?.dungeonId;
    expect(prereqOf("bonefields")).toBe("depths");
    expect(prereqOf("wilds")).toBe("bonefields");
    expect(prereqOf("overgrowth")).toBe("wilds");
    expect(prereqOf("sealed_vault")).toBe("overgrowth");
    expect(prereqOf("deep_forge")).toBe("sealed_vault");
    expect(prereqOf("eclipse_spire")).toBe("deep_forge");
    // The fork: both endgame dungeons open off the Spire's last floor.
    expect(prereqOf("fallen_cathedral")).toBe("eclipse_spire");
    expect(prereqOf("rogues_den")).toBe("eclipse_spire");
    // The registry lists them in chain order (the dungeon map reads this).
    expect(DUNGEON_IDS).toEqual([
      "depths",
      "bonefields",
      "wilds",
      "overgrowth",
      "sealed_vault",
      "deep_forge",
      "eclipse_spire",
      "fallen_cathedral",
      "rogues_den",
    ]);
  });

  it("clearing the Spire opens BOTH forks at once", () => {
    const cleared = clearedFrom({
      depths: 5, bonefields: 5, wilds: 5, overgrowth: 5,
      sealed_vault: 5, deep_forge: 5, eclipse_spire: 5,
    });
    expect(isDungeonUnlocked(getDungeon("fallen_cathedral"), cleared)).toBe(true);
    expect(isDungeonUnlocked(getDungeon("rogues_den"), cleared)).toBe(true);
    // One floor short of the Spire's last, both stay shut.
    const nearly = clearedFrom({ eclipse_spire: 4 });
    expect(isDungeonUnlocked(getDungeon("fallen_cathedral"), nearly)).toBe(false);
    expect(isDungeonUnlocked(getDungeon("rogues_den"), nearly)).toBe(false);
  });
});

describe("monster-level ladder", () => {
  it("holds the Normal band's ladder 1/4/7/9/11/14/17, then 20/20 past the fork", () => {
    expect(DUNGEON_IDS.map((id) => getDungeon(id).monsterLevel)).toEqual([
      1, 4, 7, 9, 11, 14, 17, 20, 20,
    ]);
  });

  it("every dungeon outlevels its own prerequisite; elites never exceed MONSTER_LEVEL_CAP", () => {
    // Post-fork the registry ORDER isn't strictly increasing (the two forks tie
    // at 10) — the real invariant is per-gate: harder than what unlocked you.
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      if (d.gate) {
        expect(d.monsterLevel).toBeGreaterThan(getDungeon(d.gate.dungeonId).monsterLevel);
      }
      expect(monsterLevelFor(d, "boss")).toBeLessThanOrEqual(MONSTER_LEVEL_CAP);
    }
  });

  it("fodder spawns at the dungeon level; rares and bosses run +1", () => {
    const d = getDungeon("bonefields");
    expect(monsterLevelFor(d, "fodder")).toBe(d.monsterLevel);
    expect(monsterLevelFor(d, "rare")).toBe(d.monsterLevel + ELITE_LEVEL_BONUS);
    expect(monsterLevelFor(d, "boss")).toBe(d.monsterLevel + ELITE_LEVEL_BONUS);
  });

  it("the endgame fork caps the Normal band at 20; its elites ride +1 to 21", () => {
    for (const id of ["fallen_cathedral", "rogues_den"]) {
      const d = getDungeon(id);
      expect(d.monsterLevel).toBe(NORMAL_BAND_TOP); // 20 — the Normal band's top
      expect(monsterLevelFor(d, "boss")).toBe(NORMAL_BAND_TOP + ELITE_LEVEL_BONUS); // 21
      expect(monsterLevelFor(d, "rare")).toBe(NORMAL_BAND_TOP + ELITE_LEVEL_BONUS);
      expect(monsterLevelFor(d, "boss")).toBeLessThanOrEqual(MONSTER_LEVEL_CAP);
    }
  });
});

describe("difficulty tiers — the band map", () => {
  it("re-bands each dungeon's chain position: Hard 25–30, Elite 30–40", () => {
    const table = DUNGEON_IDS.map((id) => {
      const d = getDungeon(id);
      return [
        d.monsterLevel,
        tierMonsterLevel(d.monsterLevel, "hard"),
        tierMonsterLevel(d.monsterLevel, "elite"),
      ];
    });
    expect(table).toEqual([
      [1, 25, 30], // depths opens each band
      [4, 26, 32],
      [7, 27, 33],
      [9, 27, 34],
      [11, 28, 35],
      [14, 28, 37],
      [17, 29, 38],
      [20, 30, 40], // the forks cap each band
      [20, 30, 40],
    ]);
  });

  it("normal is the identity band (tier-unaware callers keep exact old levels)", () => {
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      expect(tierMonsterLevel(d.monsterLevel, "normal")).toBe(d.monsterLevel);
      expect(monsterLevelFor(d, "fodder", "normal")).toBe(
        monsterLevelFor(d, "fodder")
      );
    }
  });

  it("bands stay monotonic non-decreasing along the gate chain at every tier", () => {
    for (const tier of TIER_IDS) {
      for (const id of DUNGEON_IDS) {
        const d = getDungeon(id);
        if (!d.gate) continue;
        expect(tierMonsterLevel(d.monsterLevel, tier)).toBeGreaterThanOrEqual(
          tierMonsterLevel(getDungeon(d.gate.dungeonId).monsterLevel, tier)
        );
      }
    }
  });

  it("every dungeon × tier × kind stays within MONSTER_LEVEL_CAP (41)", () => {
    expect(MONSTER_LEVEL_CAP).toBe(41);
    for (const tier of TIER_IDS) {
      for (const id of DUNGEON_IDS) {
        const d = getDungeon(id);
        for (const kind of ["fodder", "rare", "boss"] as const) {
          expect(monsterLevelFor(d, kind, tier)).toBeLessThanOrEqual(
            MONSTER_LEVEL_CAP
          );
        }
      }
    }
  });

  it("the fork bosses land one notch over each band's top — Elite at 41, past a maxed warband", () => {
    for (const id of ["fallen_cathedral", "rogues_den"]) {
      const d = getDungeon(id);
      expect(monsterLevelFor(d, "boss", "hard")).toBe(31);
      expect(monsterLevelFor(d, "boss", "elite")).toBe(41);
      expect(monsterLevelFor(d, "boss", "elite")).toBeGreaterThan(LEVEL_CAP);
    }
  });

  it("isTierUnlocked walks the per-dungeon ladder (truth table)", () => {
    const cleared = (done: TierId[]) => (t: TierId) => done.includes(t);
    // Nothing cleared: only Normal.
    expect(isTierUnlocked("normal", cleared([]))).toBe(true);
    expect(isTierUnlocked("hard", cleared([]))).toBe(false);
    expect(isTierUnlocked("elite", cleared([]))).toBe(false);
    // Normal cleared: Hard opens, Elite stays shut.
    expect(isTierUnlocked("hard", cleared(["normal"]))).toBe(true);
    expect(isTierUnlocked("elite", cleared(["normal"]))).toBe(false);
    // Hard cleared too: the whole ladder is open.
    expect(isTierUnlocked("elite", cleared(["normal", "hard"]))).toBe(true);
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
