// Dungeon-run specs — the RNG "hunt for the boss" boss-depth roll. Pure and
// seeded, so the bounds + determinism assertions are exact.
import { describe, expect, it } from "vitest";
import {
  bossDepthConfig,
  isBossDepth,
  makeRun,
  rollBossDepth,
  DEFAULT_BOSS_DEPTH,
} from "@/data/dungeonRun";
import { getDungeon } from "@/data/dungeons";

const depths = getDungeon("depths");

describe("rollBossDepth", () => {
  it("never places the boss before minFloor, and always by maxFloor", () => {
    const cfg = bossDepthConfig(depths);
    for (let seed = 1; seed <= 3000; seed++) {
      const d = rollBossDepth(seed, depths);
      expect(d).toBeGreaterThanOrEqual(cfg.minFloor);
      expect(d).toBeLessThanOrEqual(cfg.maxFloor);
    }
  });

  it("is deterministic in the run seed (reproducible boss depth)", () => {
    for (const seed of [1, 42, 1234, 99999]) {
      expect(rollBossDepth(seed, depths)).toBe(rollBossDepth(seed, depths));
    }
  });

  it("varies the boss depth across seeds (not a constant)", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 500; seed++) seen.add(rollBossDepth(seed, depths));
    expect(seen.size).toBeGreaterThan(1);
    // Every value it produces stays inside the configured band.
    const cfg = bossDepthConfig(depths);
    for (const d of seen) {
      expect(d).toBeGreaterThanOrEqual(cfg.minFloor);
      expect(d).toBeLessThanOrEqual(cfg.maxFloor);
    }
  });

  it("honors per-dungeon overrides (a forced-immediate boss)", () => {
    // A dungeon that guarantees the boss on floor 2: min = max = 2.
    const forced = { ...depths, bossMinFloor: 2, bossMaxFloor: 2 };
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollBossDepth(seed, forced)).toBe(2);
    }
  });

  it("falls back to the global defaults when a dungeon sets no overrides", () => {
    expect(bossDepthConfig(depths)).toEqual(DEFAULT_BOSS_DEPTH);
  });

  it("always leaves at least 4 safe floors before the lair, and caps it at 10", () => {
    // The contract, pinned: the lair can never appear before floor 5, so every
    // run is a real descent, and floor 10 forces it so no run drags on.
    expect(DEFAULT_BOSS_DEPTH.minFloor).toBe(5);
    expect(DEFAULT_BOSS_DEPTH.maxFloor).toBe(10);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 3000; seed++) seen.add(rollBossDepth(seed, depths));
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...seen)).toBeLessThanOrEqual(10);
    // The band is genuinely used, not collapsed onto one or two depths.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("makeRun / isBossDepth", () => {
  it("starts a fresh run at floor 1 with a boss depth in the band", () => {
    const run = makeRun("depths", depths, 4242);
    const cfg = bossDepthConfig(depths);
    expect(run.dungeonId).toBe("depths");
    expect(run.depth).toBe(1);
    expect(run.encounter).toBe("normal");
    expect(run.bossDepth).toBeGreaterThanOrEqual(cfg.minFloor);
    expect(run.bossDepth).toBeLessThanOrEqual(cfg.maxFloor);
  });

  it("flags exactly the boss floor", () => {
    const run = makeRun("depths", depths, 7);
    expect(isBossDepth(run, run.bossDepth)).toBe(true);
    expect(isBossDepth(run, run.bossDepth - 1)).toBe(false);
    expect(isBossDepth(run, run.bossDepth + 1)).toBe(false);
    // Defaults to the run's current depth.
    expect(isBossDepth(run)).toBe(run.depth === run.bossDepth);
  });
});
