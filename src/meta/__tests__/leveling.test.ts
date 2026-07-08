// Leveling module specs — pure math, so every assertion is exact. The pacing
// block encodes the design targets as an executable spec: if XP numbers get
// retuned, these tests say what the retune must still deliver.
import { describe, expect, it } from "vitest";
import {
  addXp,
  averageDeckLevel,
  LEVEL_CAP,
  levelFromXp,
  levelStatMultipliers,
  TOTAL_XP_CAP,
  totalXpForLevel,
  XP_REWARDS,
  xpForNext,
  xpIntoLevel,
} from "@/meta/leveling";

/** XP for winning a floor once, per the reward formula. */
function winXp(floor: number): number {
  return XP_REWARDS.dungeonWinBase + XP_REWARDS.dungeonWinPerFloor * floor;
}

describe("level thresholds", () => {
  it("cumulative thresholds are exact and the cap is their top", () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(50);
    expect(totalXpForLevel(5)).toBe(500);
    expect(totalXpForLevel(10)).toBe(2250);
    expect(TOTAL_XP_CAP).toBe(totalXpForLevel(LEVEL_CAP));
  });

  it("levelFromXp lands exactly on thresholds and clamps at both ends", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(totalXpForLevel(9) - 1)).toBe(8);
    expect(levelFromXp(totalXpForLevel(9))).toBe(9);
    expect(levelFromXp(TOTAL_XP_CAP - 1)).toBe(9);
    expect(levelFromXp(TOTAL_XP_CAP)).toBe(LEVEL_CAP);
    expect(levelFromXp(TOTAL_XP_CAP * 10)).toBe(LEVEL_CAP); // never exceeds cap
  });

  it("xpIntoLevel/xpForNext round-trip against the thresholds", () => {
    for (const total of [0, 49, 50, 137, 500, 1799, 1800, 2249]) {
      const level = levelFromXp(total);
      expect(xpIntoLevel(total)).toBe(total - totalXpForLevel(level));
      expect(xpForNext(total)).toBe(
        totalXpForLevel(level + 1) - totalXpForLevel(level)
      );
    }
    expect(xpForNext(TOTAL_XP_CAP)).toBeNull();
    expect(xpIntoLevel(TOTAL_XP_CAP)).toBe(0);
  });

  it("addXp clamps to the cap and never goes negative", () => {
    expect(addXp(0, 70)).toBe(70);
    expect(addXp(TOTAL_XP_CAP - 10, 70)).toBe(TOTAL_XP_CAP);
    expect(addXp(TOTAL_XP_CAP, 70)).toBe(TOTAL_XP_CAP);
    expect(addXp(-5, 0)).toBe(0);
    expect(addXp(10, -5)).toBe(10); // gains can't drain XP
  });
});

describe("level stat multipliers", () => {
  it("level 1 is the exact identity (unleveled play stays byte-identical)", () => {
    expect(levelStatMultipliers(1)).toEqual({ hp: 1, dmg: 1 });
  });

  it("grows +5% HP / +3% dmg per level up to +45%/+27% at the cap", () => {
    const max = levelStatMultipliers(LEVEL_CAP);
    expect(max.hp).toBeCloseTo(1.45, 10);
    expect(max.dmg).toBeCloseTo(1.27, 10);
    // A maxed unit slightly out-scales floor-5 enemies (+32% HP / +20% dmg).
    expect(max.hp).toBeGreaterThan(1.32);
    expect(max.dmg).toBeGreaterThan(1.2);
  });

  it("is strictly increasing (a level is never a no-op)", () => {
    for (let level = 2; level <= LEVEL_CAP; level++) {
      expect(levelStatMultipliers(level).hp).toBeGreaterThan(
        levelStatMultipliers(level - 1).hp
      );
      expect(levelStatMultipliers(level).dmg).toBeGreaterThan(
        levelStatMultipliers(level - 1).dmg
      );
    }
  });
});

describe("pacing targets (executable design spec)", () => {
  it("a flawless Depths clear (floors 1–5) lands at level 3–4", () => {
    const total = [1, 2, 3, 4, 5].reduce((acc, f) => acc + winXp(f), 0);
    expect(total).toBe(250);
    expect(levelFromXp(total)).toBeGreaterThanOrEqual(3);
    expect(levelFromXp(total)).toBeLessThanOrEqual(4);
  });

  it("clearing all 7 dungeons flat lands at level 8–9 (cap needs endless/replays)", () => {
    const perDungeon = [1, 2, 3, 4, 5].reduce((acc, f) => acc + winXp(f), 0);
    const total = perDungeon * 7;
    const level = levelFromXp(total);
    expect(level).toBeGreaterThanOrEqual(8);
    expect(level).toBeLessThanOrEqual(9);
    expect(total).toBeLessThan(TOTAL_XP_CAP); // the cap is NOT free with content alone
  });

  it("losses pay a meaningful fraction so wall-bumping still progresses", () => {
    expect(XP_REWARDS.lossFrac).toBeGreaterThan(0);
    expect(XP_REWARDS.lossFrac).toBeLessThan(1);
  });
});

describe("averageDeckLevel (arena AI mirror)", () => {
  it("averages the deck's levels, rounding, with missing ids at level 1", () => {
    expect(averageDeckLevel([], {})).toBe(1);
    expect(averageDeckLevel(["a", "b"], {})).toBe(1);
    expect(averageDeckLevel(["a", "b"], { a: 5, b: 2 })).toBe(4); // 3.5 rounds up
    expect(averageDeckLevel(["a", "b", "c", "d"], { a: 10, b: 10, c: 10, d: 10 })).toBe(10);
    expect(averageDeckLevel(["a", "b", "c"], { a: 4 })).toBe(2);
  });
});
