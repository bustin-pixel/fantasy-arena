// ============================================================================
// ENDLESS MODE — survival config
// Declarative tuning for the endless survival mode: how waves escalate, when the
// milestone bosses arrive, and which dungeon each 5-wave cycle themes itself on.
// Pure data + pure curve helpers (no engine / React / DOM). The EndlessController
// reads these to build each wave; nothing here runs inside the tick loop.
//
// A run is an unbounded sequence of waves grouped into 5-wave CYCLES:
//   slot 1,2 — fodder    slot 3 — rare miniboss    slot 4 — fodder    slot 5 — boss
// Each cycle borrows one dungeon's fodder pool + boss (rotation shuffled per run
// seed), so the horde's flavor rotates as you descend. Between waves the run
// pauses for a warband boon pick (see data/boons.ts).
// ============================================================================

import { DUNGEON_IDS, getDungeon, type Dungeon } from "./dungeons";

export const ENDLESS_CYCLE_LEN = 5;

/** The whole warband is fielded at once (like Depths). */
export const ENDLESS_PLAYER_ACTIVE = 4;

/** Concurrent enemy cap — deliberately BELOW the Depths' 12. Endless gives the
 *  player no reserves (dead is dead), so the swarm must stay a fair 4-vs-N fight
 *  rather than a 4-vs-12 grind. The wave budget below is the length dial; this is
 *  the pressure dial. */
export const ENDLESS_ENEMY_ACTIVE = 8;

/** Per-wave stalemate backstop (seconds). The clock resets to this at each wave
 *  start; running it out ends the run (you couldn't clear the wave in time). */
export const ENDLESS_WAVE_TIME_SEC = 120;

/** Baseline fraction of MISSING hp healed at each intermission (before the
 *  Field Medicine boon raises it). */
export const ENDLESS_INTERMISSION_HEAL = 0.3;

/** The approved themed-dungeon rare minibosses (wave 3 of each cycle). */
export const ENDLESS_RARE_POOL: readonly string[] = [
  "lich",
  "apex_beast",
  "archmage",
  "wildheart",
  "eclipse_herald",
  "ancient_automaton",
];

export type EndlessWaveKind = "fodder" | "rare" | "boss";

/** 1-based cycle number for a wave (waves 1–5 = cycle 1, 6–10 = cycle 2, …). */
export function endlessCycle(wave: number): number {
  return Math.floor((wave - 1) / ENDLESS_CYCLE_LEN) + 1;
}

/** Position within the current 5-wave cycle (1..5). */
export function endlessWaveInCycle(wave: number): number {
  return ((wave - 1) % ENDLESS_CYCLE_LEN) + 1;
}

/** Rare miniboss at cycle-slot 3, dungeon boss at slot 5, else fodder. */
export function endlessWaveKind(wave: number): EndlessWaveKind {
  const w = endlessWaveInCycle(wave);
  if (w === 5) return "boss";
  if (w === 3) return "rare";
  return "fodder";
}

/** Per-wave stat multipliers for spawned enemies. Linear growth WITHIN a cycle
 *  plus a compounding step each COMPLETED cycle. Kept gentle on purpose: the
 *  player has no reserves and only a 30% between-wave heal, so if the horde scaled
 *  as fast as stacked boons the attrition would always win and the boons wouldn't
 *  matter. This lets a well-played, boon-stacked run pull ahead. Wave 5 ≈ 1.28 hp
 *  / 1.16 dmg, wave 10 ≈ 1.7 / 1.4, wave 20 ≈ 2.6 / 1.9. Applied at spawn exactly
 *  like the Depths per-floor multipliers. */
export function endlessWaveStatMultipliers(wave: number): { hp: number; dmg: number } {
  const cyclesDone = Math.floor((wave - 1) / ENDLESS_CYCLE_LEN);
  const step = Math.pow(1.05, cyclesDone);
  return {
    hp: (1 + 0.07 * (wave - 1)) * step,
    dmg: (1 + 0.04 * (wave - 1)) * step,
  };
}

/** Fodder budget for a wave (the length dial; the concurrent cap paces it). Much
 *  smaller than a Depths FLOOR budget — a wave is a bite-sized skirmish the 4
 *  reserve-less units clear, heal from, then face a slightly bigger one. Rare and
 *  boss waves ignore this; their single unit spawns alone. */
export function endlessWaveBudget(wave: number): number {
  return Math.min(40, 8 + 3 * wave);
}

/** The dungeon a cycle draws its fodder pool + boss from. `rotation` is the
 *  per-run-shuffled DUNGEON_IDS; cycle c uses rotation[(c-1) % len]. */
export function dungeonForCycle(rotation: readonly string[], cycle: number): Dungeon {
  return getDungeon(rotation[(cycle - 1) % rotation.length]);
}

/** A dungeon's themed rare, if its quest rare is a valid miniboss; null means
 *  "draw from ENDLESS_RARE_POOL instead" (e.g. the Depths, whose quest rare is the
 *  too-weak Slime). */
export function themedRareFor(dungeon: Dungeon): string | null {
  const spawn = dungeon.quest?.spawnId;
  return spawn && ENDLESS_RARE_POOL.includes(spawn) ? spawn : null;
}

/** The full rotation is just every dungeon; the controller shuffles it per run. */
export const ENDLESS_ROTATION_BASE: readonly string[] = DUNGEON_IDS;
