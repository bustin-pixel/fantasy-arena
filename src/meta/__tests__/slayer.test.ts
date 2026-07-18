// ============================================================================
// Slayer math specs — the kill-count → level → damage-bonus curve. The engine
// and the compendium UI both trust these exact numbers, and the level-0
// identity (mult exactly 1) is what keeps slayer-less sims byte-identical.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  buildSlayerBonusTable,
  killsForSlayerLevel,
  SLAYER_KILL_THRESHOLDS,
  SLAYER_LEVEL_CAP,
  slayerDmgMult,
  slayerLevelFromKills,
  slayerProgress,
} from "@/meta/slayer";

describe("slayerLevelFromKills", () => {
  it("walks the threshold boundaries exactly", () => {
    expect(slayerLevelFromKills(0)).toBe(0);
    expect(slayerLevelFromKills(9)).toBe(0);
    expect(slayerLevelFromKills(10)).toBe(1);
    expect(slayerLevelFromKills(24)).toBe(1);
    expect(slayerLevelFromKills(25)).toBe(2);
    expect(slayerLevelFromKills(50)).toBe(3);
    expect(slayerLevelFromKills(100)).toBe(4);
    expect(slayerLevelFromKills(199)).toBe(4);
    expect(slayerLevelFromKills(200)).toBe(5);
  });

  it("clamps at the cap for absurd counts", () => {
    expect(slayerLevelFromKills(1_000_000)).toBe(SLAYER_LEVEL_CAP);
  });

  it("round-trips with killsForSlayerLevel at every level", () => {
    for (let level = 0; level <= SLAYER_LEVEL_CAP; level++) {
      expect(slayerLevelFromKills(killsForSlayerLevel(level))).toBe(level);
    }
  });
});

describe("slayerDmgMult", () => {
  it("is EXACTLY 1 below the first threshold (the identity invariant)", () => {
    expect(slayerDmgMult(0)).toBe(1);
    expect(slayerDmgMult(9)).toBe(1);
  });

  it("adds +2% per level up to +10% at the cap", () => {
    expect(slayerDmgMult(10)).toBeCloseTo(1.02, 10);
    expect(slayerDmgMult(50)).toBeCloseTo(1.06, 10);
    expect(slayerDmgMult(200)).toBeCloseTo(1.1, 10);
    expect(slayerDmgMult(99999)).toBeCloseTo(1.1, 10);
  });
});

describe("slayerProgress", () => {
  it("reports the fresh track (0 kills, 10 to the first level)", () => {
    expect(slayerProgress(0)).toEqual({ level: 0, into: 0, needed: 10 });
  });

  it("reports mid-level progress against the NEXT threshold", () => {
    // 37 kills: level 2 (at 25), 12 past it, 13 short of the 50 for level 3.
    expect(slayerProgress(37)).toEqual({ level: 2, into: 12, needed: 13 });
  });

  it("reports the cap with needed = null", () => {
    expect(slayerProgress(200)).toEqual({ level: 5, into: 0, needed: null });
    expect(slayerProgress(999).needed).toBeNull();
  });
});

describe("buildSlayerBonusTable", () => {
  it("emits only entries at level >= 1, with their exact multipliers", () => {
    const table = buildSlayerBonusTable({
      giant_rat: 60, // level 3
      ghoul: 10, // level 1
      lich: 9, // level 0 — must be absent (missing id = identity)
      dire_wolf: 0,
    });
    expect(table).toEqual({
      giant_rat: slayerDmgMult(60),
      ghoul: slayerDmgMult(10),
    });
  });

  it("an empty record builds the identity table", () => {
    expect(buildSlayerBonusTable({})).toEqual({});
  });

  it("threshold list and cap agree", () => {
    expect(SLAYER_KILL_THRESHOLDS.length).toBe(SLAYER_LEVEL_CAP);
  });
});
