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

/** The capstone wave. Clearing it COMPLETES the run — the only victory endless
 *  can produce — and pays the Legendary Reliquary. The player may then bank it
 *  or press on: nothing stops the waves continuing past here and the curve keeps
 *  climbing, so "endless" stays honest for anyone who wants it.
 *
 *  Meant to be rare — measured at ~3.5% of runs even at max power with ideal
 *  drafting (NOTES 4h). A trophy, not a checkpoint. */
export const ENDLESS_FINAL_WAVE = 100;

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
// first retune.
//
// WHY THIS IS NOW A RATE CURVE, NOT A CLOSER. Every previous version of this file
// ended with an accelerating "closer" whose growth rate climbed without limit,
// and the justification was always the same: a boon arrives every wave, so
// against any FIXED rate a stacked build eventually wins outright and the run
// never ends. That was TRUE — of an unbounded boon economy. It is no longer the
// economy we have. Every boon completes at a hard rank cap, the two rate boons
// have `capPct`, Bounty Hunter has BOUNTY_TOTAL_CAP_FRAC, and one legendary plus
// one mythic is the entire deep allowance (see boons.ts). Total player power is
// therefore BOUNDED: a finished warband stops growing, and any positive enemy
// rate then ends the run on its own.
//
// That is what buys the readable numbers. The old accelerating closer reached
// ×7.8e13 by wave 88 — past the point where enemy HP is even an exact integer —
// purely to out-run a player who could grow forever. Against a bounded player a
// gentle rate suffices, and wave 100 lands around ×30 instead: a boss with tens
// of thousands of HP, a number you can read off the bar.
//
// THE INVARIANT THAT REPLACES IT: player power must stay bounded. Any new boon
// (or item, or kit) that grants SUSTAINED per-wave growth with no ceiling breaks
// the termination argument outright and the immortal-run hole re-opens — this
// mode has fallen into it twice. Cap it at the source; do not answer it here by
// steepening the curve. See NOTES 4l.

/** Per-wave growth rate of the warm-up, waves 1..ENDLESS_RAMP_START. Waves this
 *  early are a warm-up on purpose: endless unlocks mid-progression and a fresh,
 *  ungeared warband has to be able to find its feet. Deliberately left at the
 *  previous curve's opening rate so the first ten waves are unchanged. */
export const ENDLESS_RATE_EARLY = 0.035;

/** The hardest the curve ever climbs, reached at ENDLESS_PEAK_WAVE — THE KNOB
 *  THAT SETS THE MEDIAN. This is the mid-game squeeze that the last curve did not
 *  have: it cruised flat to wave 22 and then fell off a cliff, so a strong run
 *  felt like nothing was happening right up until everything did. */
export const ENDLESS_RATE_PEAK = 0.055;

/** The rate the curve settles to past ENDLESS_TAPER_END and keeps forever — THE
 *  KNOB THAT SETS THE TAIL, and with it the odds of reaching the capstone. It is
 *  also what guarantees termination, so it must stay strictly positive and
 *  comfortably above zero: a bounded warband loses to any constant drain, but the
 *  smaller this is the longer that takes. At 0.026 per axis a completed build
 *  buys roughly 13 waves per doubling of banked surplus. */
export const ENDLESS_RATE_SUSTAIN = 0.026;

/** Where the ramp out of the warm-up begins, where it peaks, and where it has
 *  finished tapering to the sustain rate. Moving these shifts WHEN the mid-game
 *  squeeze is felt without changing how hard it squeezes. */
export const ENDLESS_RAMP_START = 10;
export const ENDLESS_PEAK_WAVE = 32;
export const ENDLESS_TAPER_END = 55;

/** Per-axis log growth rate for the step INTO `wave` — a warm-up plateau, a
 *  linear ramp to the peak, a linear taper, then flat forever. Piecewise-linear
 *  on purpose: the rate itself is what the player feels, so it is the thing that
 *  should be smooth and legible, not the multiplier it integrates to. */
export function endlessWaveGrowthRate(wave: number): number {
  if (wave <= ENDLESS_RAMP_START) return ENDLESS_RATE_EARLY;
  if (wave <= ENDLESS_PEAK_WAVE) {
    const t = (wave - ENDLESS_RAMP_START) / (ENDLESS_PEAK_WAVE - ENDLESS_RAMP_START);
    return ENDLESS_RATE_EARLY + (ENDLESS_RATE_PEAK - ENDLESS_RATE_EARLY) * t;
  }
  if (wave <= ENDLESS_TAPER_END) {
    const t = (wave - ENDLESS_PEAK_WAVE) / (ENDLESS_TAPER_END - ENDLESS_PEAK_WAVE);
    return ENDLESS_RATE_PEAK + (ENDLESS_RATE_SUSTAIN - ENDLESS_RATE_PEAK) * t;
  }
  return ENDLESS_RATE_SUSTAIN;
}

/** Per-wave stat multipliers for spawned enemies, applied at spawn exactly like
 *  the Depths per-floor multipliers.
 *
 *  HP and damage move together, deliberately. The SPLIT between them sets how
 *  runs end (they were 1.045/1.031, which left the horde four times harder to
 *  kill than to survive, so deep runs died on the stall clock rather than being
 *  overrun); the PRODUCT sets how deep runs go. Keep them equal and move the
 *  rates above if you want to move the depth.
 *
 *  There is also deliberately no per-cycle `step` term: a constant exponential
 *  already makes each cycle harder, and the old step put a visible sawtooth into
 *  the difficulty. A cycle boundary is marked by its boss wave, not a stat jump. */
export function endlessWaveStatMultipliers(wave: number): { hp: number; dmg: number } {
  // Summed rather than closed-form: the rate is piecewise-linear over INTEGER
  // waves, so this is the exact integral, and 100 additions per spawn is free.
  let exponent = 0;
  for (let w = 2; w <= wave; w++) exponent += endlessWaveGrowthRate(w);
  const mult = Math.exp(exponent);
  return { hp: mult, dmg: mult };
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

/** Bounty Hunter's RUN-TOTAL ceiling: the most max HP a single unit may ever gain
 *  from bounties, as a fraction of its max HP at the run's first wave.
 *
 *  The per-wave cap (BOUNTY_WAVE_CAP_FRAC) alone bounds nothing — +25% a wave IS
 *  exponential growth, just a politer exponential, and unbounded player growth is
 *  exactly what forces a curve steep enough to make deep-wave numbers unreadable.
 *  This is the second half of that cap and the reason the boon can stay generous
 *  early. See the curve preamble above. */
export const BOUNTY_TOTAL_CAP_FRAC = 1.0;

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
