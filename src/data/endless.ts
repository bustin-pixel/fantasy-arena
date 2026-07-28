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
 *  start; running it out ends the run. NOTE this is a STALL timer, not a DPS
 *  check — the EndlessController refreshes it whenever the warband makes progress
 *  (see ENDLESS_STALL_TIME_SEC), so a slow-but-winning wave is never punished. */
export const ENDLESS_WAVE_TIME_SEC = 120;

/** How long the warband may make NO progress at all before the run is called.
 *  "Progress" is defined in EndlessController.trackProgress: an enemy died, the
 *  spawn queue drained, or the live enemy HP pool hit a new low for this wave.
 *
 *  WHY A STALL TIMER: the flat 120s clock was killing runs that were still
 *  winning. In the 2026-07-28 baseline 13-25% of all runs — and after the curve
 *  retune 63-100% of STRONG runs — ended in `timeout` rather than a wipe, while
 *  mean wave duration was only 13-21s. Deep waves aren't slow; a defensive build
 *  simply can't burst a lone boss inside a fixed two minutes, and dying to a
 *  hidden timer while visibly winning reads as an arbitrary wall.
 *
 *  Deliberately NOT "scale the time limit with the wave": that re-creates the
 *  problem in a second currency, and any mismatch between the two curves silently
 *  re-caps the tail. A stall timer is curve-independent — it never punishes a
 *  wave that is progressing, at any wave number, forever. */
export const ENDLESS_STALL_TIME_SEC = 45;

/** Absolute per-wave ceiling. The stall timer alone would let an unkillable-but-
 *  chippable stalemate (a boss regenerating exactly as fast as you damage it,
 *  making a "new low" every few seconds) run forever. Nothing legitimate takes
 *  eight minutes on one wave. */
export const ENDLESS_WAVE_HARD_CAP_SEC = 480;

/** Baseline fraction of MISSING hp healed at each intermission (before the
 *  Field Medicine boon raises it). */
export const ENDLESS_INTERMISSION_HEAL = 0.3;

/** Berserker's Rhythm: attack-speed bonus gained per second in a wave, and the
 *  cap. Resets to 0 at each wave start. */
export const ENDLESS_RHYTHM_PER_SEC = 0.04;
export const ENDLESS_RHYTHM_MAX = 0.6;

/** Momentum: damage multiplier gained per wave cleared without a warband death. */
export const ENDLESS_MOMENTUM_PER_WAVE = 0.05;

/** Boon rerolls a run starts with, and how often it earns another. Per-run, no
 *  regeneration — a resource to spend, not a slot machine. */
export const ENDLESS_REROLLS_START = 2;
export const ENDLESS_REROLL_EVERY_WAVES = 10;

/** Skipping a boon heals this extra fraction of missing HP instead. Makes "none
 *  of these help me" a real choice — survival now, power later — and gives the
 *  permanent-attrition problem a second answer besides Second Chance. Shares the
 *  0.9 clamp with the intermission heal. */
export const ENDLESS_SKIP_HEAL_PCT = 0.25;

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

// -- The wave curve -----------------------------------------------------------
// READ THIS BEFORE RETUNING. What decides how endless FEELS is not the SIZE of
// the multiplier at wave N, it is its local SLOPE there. Writing
//     L(w) = ln(enemyPower(w)) − ln(playerPower(w))
// a run ends when L crosses the warband's standing advantage, so the extra waves
// a 2× stronger warband buys is
//     Δwaves ≈ ln2 / L′(w_end)
// — governed entirely by the growth RATE at the death point. Get that wrong and
// no amount of levelling, gear or good boon picks moves the ending wave, which
// is exactly the "I hit a wall at 40 and nothing helps" report that prompted the
// 2026-07-28 retune: the old curve's L′ at wave 40 bought ONE wave per doubling.
//
// Hence the shape below — a shallow, genuinely exponential stretch (where the
// variance lives, so a strong run pulls meaningfully ahead) followed by a late,
// slowly accelerating closer that guarantees every run still ends.

/** Base per-wave compounding. Deliberately reproduces the OLD linear×step curve
 *  to within a few percent through wave 25, so the early/mid game is untouched by
 *  the retune — only the deep end moves. */
export const ENDLESS_HP_GROWTH = 1.045;
export const ENDLESS_DMG_GROWTH = 1.031;

/** Where the closer starts to bite — the knob that sets roughly WHERE THE MEDIAN
 *  RUN ENDS. Earlier lowers the median, later raises it. */
export const ENDLESS_SURGE_START = 24;

/** How fast the closer's growth rate itself accelerates — the knob that sets THE
 *  SPREAD. Small K = a long tail where a great boon stack goes deep; large K =
 *  everyone dies on the same wave no matter how strong they are. The old curve's
 *  effective K was ~4× this, which is what collapsed the distribution into a wall
 *  (37 of 40 sweep seeds inside waves 38–45). Calibration targets, read off
 *  `endlessSweep`'s curve table: L′ ≈ 0.06–0.09 at the median (8–11 waves per
 *  doubling), L′ ≈ 0.25–0.35 at the p95 (2–3 waves per doubling). */
export const ENDLESS_SURGE_K = 0.005;

/** Per-wave stat multipliers for spawned enemies, applied at spawn exactly like
 *  the Depths per-floor multipliers.
 *
 *  A true exponential × a super-exponential closer past ENDLESS_SURGE_START.
 *  There is deliberately no per-cycle `step` term any more: a constant exponential
 *  already makes each cycle harder, and the old step put a visible sawtooth into
 *  the difficulty (wave 6 jumped 9.4% while wave 7 rose 4.0%). A cycle boundary is
 *  marked by its boss wave now, not by a stat jump.
 *
 *  WHY THE CLOSER MUST BE SUPER-EXPONENTIAL: a boon arrives every single wave, so
 *  against any FIXED growth rate a stacked multiplicative build eventually wins
 *  outright — an earlier curve produced literally immortal 500+-wave runs. A rate
 *  that itself keeps climbing always wins in the end. An endless run must always
 *  end; it just shouldn't end on the same wave for everyone. */
export function endlessWaveStatMultipliers(wave: number): { hp: number; dmg: number } {
  const over = Math.max(0, wave - ENDLESS_SURGE_START);
  // Triangular exponent: surge(w)/surge(w−1) === exp(K·over) exactly, so the
  // per-wave growth rate is a clean linear ramp with no discretization artifact.
  const surge = Math.exp((ENDLESS_SURGE_K * over * (over + 1)) / 2);
  return {
    hp: Math.pow(ENDLESS_HP_GROWTH, wave - 1) * surge,
    dmg: Math.pow(ENDLESS_DMG_GROWTH, wave - 1) * surge,
  };
}

// -- Boon value scaling -------------------------------------------------------
// Some boons are denominated in ABSOLUTE hp/damage (Bulwark's 60 HP shield,
// Mending Aura's 3 HP/sec, Bloodfeast's 12 HP/kill, Venom Coating's 6 dmg/sec).
// Left flat they are four skeleton-hits at wave 1 and a rounding error at wave
// 50 — dead cards clogging roughly a third of every deep offer. Scaling them by
// the horde's own curve keeps their value CONSTANT in the currency that actually
// matters: hits absorbed, or fraction of an enemy killed.
//
// Two anchors because the two kinds of flat value keep pace with different
// things. The absolute numbers look absurd deep (Bulwark 60 → ~246 at wave 40)
// but that is exactly right: it absorbs the same number of hits from enemies who
// hit 3.7× harder.

/** For values that SOAK incoming damage — shields, regen, heal-per-kill. */
export function endlessBoonDefenseScale(wave: number): number {
  return endlessWaveStatMultipliers(wave).dmg;
}

/** For values that must CHEW THROUGH enemy HP — poison and other flat damage. */
export function endlessBoonOffenseScale(wave: number): number {
  return endlessWaveStatMultipliers(wave).hp;
}

/** Fodder budget for a wave (the length dial; the concurrent cap paces it). Much
 *  smaller than a Depths FLOOR budget — a wave is a bite-sized skirmish the 4
 *  reserve-less units clear, heal from, then face a slightly bigger one. Rare and
 *  boss waves ignore this; their single unit spawns alone. */
export function endlessWaveBudget(wave: number): number {
  return Math.min(40, 5 + 2 * wave);
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
