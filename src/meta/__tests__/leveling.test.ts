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
    expect(totalXpForLevel(10)).toBe(2250); // the old cap — now a waypoint
    expect(totalXpForLevel(20)).toBe(9500); // the Normal band's top
    expect(totalXpForLevel(30)).toBe(21750);
    expect(LEVEL_CAP).toBe(30);
    expect(TOTAL_XP_CAP).toBe(totalXpForLevel(LEVEL_CAP));
  });

  it("levelFromXp lands exactly on thresholds and clamps at both ends", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(totalXpForLevel(9) - 1)).toBe(8);
    expect(levelFromXp(totalXpForLevel(9))).toBe(9);
    expect(levelFromXp(TOTAL_XP_CAP - 1)).toBe(LEVEL_CAP - 1);
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

  it("grows +5% HP / +3% dmg per level up to +145%/+87% at the cap", () => {
    const max = levelStatMultipliers(LEVEL_CAP);
    expect(max.hp).toBeCloseTo(2.45, 10);
    expect(max.dmg).toBeCloseTo(1.87, 10);
    // Lv 10 — the old cap — is unchanged by the cap raise, so pre-v14 maxed
    // units keep their exact baked stats.
    const lv10 = levelStatMultipliers(10);
    expect(lv10.hp).toBeCloseTo(1.45, 10);
    expect(lv10.dmg).toBeCloseTo(1.27, 10);
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
  // The RNG descent: a clearing run fights floors 1..B, with the boss lair at
  // a run-seeded B ∈ 5–10 (E[B] ≈ 6.5). The spec models a typical run at B=6.
  // Tier XP multipliers (TIER_REWARDS: Hard ×2, Elite ×3) are inlined here as
  // literals so a reward retune has to consciously revisit these targets.
  const MODELED_BOSS_DEPTH = 6;
  const runXp = (tierMult = 1) => {
    let total = 0;
    for (let f = 1; f <= MODELED_BOSS_DEPTH; f++) {
      total += Math.round(winXp(f) * tierMult);
    }
    return total;
  };

  it("one Normal Depths clearing run lands a fresh unit at level 3–5", () => {
    const level = levelFromXp(runXp());
    expect(level).toBeGreaterThanOrEqual(3);
    expect(level).toBeLessThanOrEqual(5);
  });

  it("a flat Normal-chain lap (9 dungeons) lands at level 11–13 — the 1–20 Normal band's on-ramp; replays/quests/endless carry the rest", () => {
    const level = levelFromXp(runXp() * 9);
    expect(level).toBeGreaterThanOrEqual(11);
    expect(level).toBeLessThanOrEqual(13);
  });

  it("clearing all 27 dungeon-tier combos flat lands short of 30 — the cap is NOT free with content alone", () => {
    const total = (runXp(1) + runXp(2) + runXp(3)) * 9;
    const level = levelFromXp(total);
    expect(level).toBeGreaterThanOrEqual(26);
    expect(level).toBeLessThanOrEqual(28);
    expect(total).toBeLessThan(TOTAL_XP_CAP);
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
    expect(averageDeckLevel(["a", "b", "c", "d"], { a: 30, b: 30, c: 30, d: 30 })).toBe(30);
    expect(averageDeckLevel(["a", "b", "c"], { a: 4 })).toBe(2);
  });
});
