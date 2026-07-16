// ============================================================================
// Dungeon runs — the RNG "hunt for the boss" descent model.
//
// A run is a single dive into one dungeon: you descend randomized floors,
// deeper = harder, until the boss LAIR appears — at a run-seeded random depth —
// and you defeat it, which clears the dungeon. Leaving or losing ends the run;
// the next attempt re-rolls a fresh seed (a fresh-run roguelike loop). The floor
// NUMBER is an internal difficulty/scaling counter (fed to the existing pure
// (dungeon, floor) wave/scaling helpers), hidden from the player.
//
// Determinism: the boss-depth roll draws its OWN seeded meta stream off the run
// seed (never the sim RNG), exactly like encounters.assignOmens — so it can
// never perturb combat, and a run's boss depth is fixed the moment it starts
// (and reproducible for tests).
// ============================================================================

import { RNG } from "@/utils/rng";
import type { Dungeon } from "@/data/dungeons";
import type { EncounterKind } from "@/data/encounters";

/** XOR salt so the boss-depth roll is its own stream, distinct from OMEN_SALT
 *  and every wave/reward stream. */
const BOSS_DEPTH_SALT = 0x5b0_5de6;

export interface BossDepthConfig {
  /** Earliest floor the boss can appear (floors below are always safe). */
  minFloor: number;
  /** Floor the boss is GUARANTEED by (caps a run's length). */
  maxFloor: number;
  /** Boss chance at minFloor. */
  baseChance: number;
  /** Added boss chance per floor past minFloor (ramps toward the guarantee). */
  chanceStep: number;
}

/** Global defaults: floors 1–4 are always safe (the lair can never appear before
 *  floor 5), then a ramping boss chance (25% at floor 5, +15%/floor), forced by
 *  floor 10. Expected boss depth ≈ floor 6–7, so a run is a real descent with
 *  room to vary. A dungeon overrides any field via its bossMinFloor/
 *  bossMaxFloor/bossBaseChance/bossChanceStep. */
export const DEFAULT_BOSS_DEPTH: BossDepthConfig = {
  minFloor: 5,
  maxFloor: 10,
  baseChance: 0.25,
  chanceStep: 0.15,
};

export function bossDepthConfig(dungeon: Dungeon): BossDepthConfig {
  return {
    minFloor: dungeon.bossMinFloor ?? DEFAULT_BOSS_DEPTH.minFloor,
    maxFloor: dungeon.bossMaxFloor ?? DEFAULT_BOSS_DEPTH.maxFloor,
    baseChance: dungeon.bossBaseChance ?? DEFAULT_BOSS_DEPTH.baseChance,
    chanceStep: dungeon.bossChanceStep ?? DEFAULT_BOSS_DEPTH.chanceStep,
  };
}

/** The floor this run's boss lair sits on — a run-seeded escalating roll. Below
 *  minFloor is always safe; from minFloor the chance ramps each floor; maxFloor
 *  is a hard guarantee. Deterministic in runSeed (reproducible for tests). */
export function rollBossDepth(runSeed: number, dungeon: Dungeon): number {
  const cfg = bossDepthConfig(dungeon);
  const rng = new RNG((runSeed ^ BOSS_DEPTH_SALT) >>> 0);
  for (let f = cfg.minFloor; f < cfg.maxFloor; f++) {
    const chance = Math.min(
      1,
      cfg.baseChance + cfg.chanceStep * (f - cfg.minFloor)
    );
    if (rng.next() < chance) return f;
  }
  return cfg.maxFloor;
}

/** A single dive into one dungeon, carried across floors by the app shell. The
 *  floor NUMBER (`depth`) drives scaling but is hidden from the player; the boss
 *  sits at `bossDepth`. `encounter` is the CURRENT floor's flavor (from the omen
 *  chosen leaving the previous floor; "normal" on entry). */
export interface DungeonRun {
  dungeonId: string;
  depth: number;
  runSeed: number;
  bossDepth: number;
  encounter: EncounterKind;
  /** Whether this run has already met its fusion-quest rare on a rare-quarry
   *  encounter floor. Once true, the boss floor skips its rare roll (mutual
   *  exclusivity) and no further rare quarry is offered — one rare per run. */
  rareSpawned: boolean;
}

/** Whether `depth` is this run's boss floor (the lair). */
export function isBossDepth(run: DungeonRun, depth: number = run.depth): boolean {
  return depth === run.bossDepth;
}

/** Start a fresh run at floor 1. `runSeed` is generated OUTSIDE (App) so this
 *  module stays free of Math.random, like the other leaf data modules. */
export function makeRun(
  dungeonId: string,
  dungeon: Dungeon,
  runSeed: number
): DungeonRun {
  return {
    dungeonId,
    depth: 1,
    runSeed,
    bossDepth: rollBossDepth(runSeed, dungeon),
    encounter: "normal",
    rareSpawned: false,
  };
}
