// ============================================================================
// Endless sweep — the headless survival-curve harness (SKIPPED by default).
//
// The sibling of winrateSweep.test.ts, for Endless instead of the Depths. A TOOL,
// not an assertion suite: it prints tables you read while tuning the wave curve
// and the boon economy. Enable with the SWEEP env flag:
//
//   SWEEP=1 SWEEP_ONLY=shape npm test -- endlessSweep     # curve table, instant
//   SWEEP=1 npm test -- endlessSweep                      # everything
//   SWEEP=1 SWEEP_SEEDS=16 npm test -- endlessSweep       # tighter confidence
//   SWEEP=1 SWEEP_ONLY=ceiling npm test -- endlessSweep   # the god-run probe
//   SWEEP=1 SWEEP_MAXWAVE=200 npm test -- endlessSweep    # raise the safety cap
//
// WHY THIS FILE EXISTS: the 2026-07-11 endless retune was validated by a 320-run
// sweep that lived in a scratchpad and was never committed. The curve it produced
// walls hard at wave ~40 and nothing caught it. A balance harness that isn't in
// the repo may as well not have been run.
//
// What to read:
//   * "cause" is as important as "wave" — a run that ends in `timeout` died to the
//     clock while WINNING the fight, which is a different bug from dying to damage.
//   * the ceiling probe is the variance check: if max ≈ median, the curve is a
//     wall (no amount of player power buys waves) no matter where the median sits.
// ============================================================================
import { describe, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import { BOONS, type BoonEffect } from "@/data/boons";
import {
  ENDLESS_WAVE_TIME_SEC,
  endlessWaveStatMultipliers,
} from "@/data/endless";
import { TICK_RATE, secToTicks } from "@/utils/constants";
import {
  POWER_TIERS,
  gearFor,
  mean,
  median,
  percentile,
  slayerFor,
  type PowerTier,
} from "./sweepKit";

declare const process: { env: Record<string, string | undefined> };

const RUN = process.env.SWEEP ? describe : describe.skip;
const SEEDS = Number(process.env.SWEEP_SEEDS ?? 8);
const CEIL_SEEDS = Number(process.env.SWEEP_SEEDS ?? 40);
const ONLY = process.env.SWEEP_ONLY; // shape | matrix | ceiling
/** Hard safety cap. Without it a mis-tuned constant hangs the harness forever —
 *  exactly the runaway the accelerating backstop exists to prevent, so the tool
 *  that measures it must be immune to it. */
const MAX_WAVE = Number(process.env.SWEEP_MAXWAVE ?? 120);

const runBlock = (name: string): boolean => !ONLY || ONLY === name;

// -- Decks --------------------------------------------------------------------
// Held fixed while power/policy vary, so the numbers measure the CURVE rather
// than deck-building skill.

const DECKS: { id: string; deck: string[] }[] = [
  // The winrateSweep reference: tank / AoE nuke / bruiser / healer.
  { id: "balanced", deck: ["knight", "fire_mage", "berserker", "healer"] },
  // endless.test.ts's deck — no healer, so attrition bites harder.
  { id: "bruiser", deck: ["ogre", "knight", "berserker", "archer"] },
  // Ranged-heavy: tests whether kiting outperforms when enemies are HP sponges.
  { id: "ranged", deck: ["knight", "archer", "mystic_archer", "healer"] },
  // Legendary-grade: what a maxed player actually fields.
  { id: "elite", deck: ["aegis_knight", "seraph", "berserker", "arcane_mage"] },
];

// -- Pick policies ------------------------------------------------------------
// Pure functions of the offer list — no RNG, so a policy never perturbs the run's
// determinism. Classified by INSPECTING each boon's effects rather than by a
// hardcoded id list, so boons added later are covered automatically.

type PickPolicy = (offers: string[], owned: string[], wave: number) => number;

const RARITY_RANK: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  mythic: 3,
};

/** Does this boon carry any effect matching `pred`? */
const has = (id: string, pred: (e: BoonEffect) => boolean): boolean =>
  (BOONS[id]?.effects ?? []).some(pred);

const isOffense = (id: string): boolean =>
  has(
    id,
    (e) =>
      (e.type === "teamMod" && (e.field === "dmgMult" || e.field === "atkDelayMult")) ||
      e.type === "execute" ||
      e.type === "crit" ||
      e.type === "momentum" ||
      e.type === "rhythm" ||
      e.type === "onHitRider"
  );

const isDefense = (id: string): boolean =>
  has(
    id,
    (e) =>
      (e.type === "teamMod" &&
        (e.field === "damageTakenMult" || e.field === "lifestealBonus")) ||
      e.type === "maxHp" ||
      e.type === "waveShield" ||
      e.type === "regen" ||
      e.type === "intermissionHeal" ||
      e.type === "killHeal" ||
      e.type === "lastBreath" ||
      e.type === "overheal" ||
      e.type === "revive" ||
      e.type === "rangedLifesteal"
  );

/** Rank by rarity, breaking ties on a stable id sort (never RNG). */
function bestBy(offers: string[], score: (id: string) => number): number {
  let bestIdx = 0;
  let bestScore = -Infinity;
  offers.forEach((id, i) => {
    const s = score(id);
    if (s > bestScore || (s === bestScore && offers[bestIdx] > id)) {
      bestScore = s;
      bestIdx = i;
    }
  });
  return bestIdx;
}

const rarityScore = (id: string): number => RARITY_RANK[BOONS[id]?.rarity] ?? 0;

/** The hand-ordered "a good player who knows the pool" ranking — the ceiling
 *  probe's policy. Anything not listed falls back to rarity. Compounding and
 *  multiplicative picks first; flat/situational last. */
const ORACLE_ORDER = [
  "ascendant",
  "phoenix_pact",
  "siege_train",
  "warlords_horn",
  "overwhelm",
  "aegis",
  "titans_blood",
  "bloodlust",
  "momentum",
  "berserkers_rhythm",
  "war_banner",
  "juggernaut",
  "reckless",
  "executioner",
  "soul_harvest",
  "overkill",
  "last_breath",
  "thunderclap",
  "vampirism",
  "war_machine",
  "kennel_master",
  "sharpened",
  "quickened",
  "hardy",
  "stoneskin",
];

const POLICIES: { id: string; pick: PickPolicy }[] = [
  // The floor, and the control that catches "the sweep measures policy, not curve".
  { id: "first", pick: () => 0 },
  { id: "greedy", pick: (offers) => bestBy(offers, rarityScore) },
  {
    id: "bruiser",
    pick: (offers) =>
      bestBy(offers, (id) => rarityScore(id) + (isOffense(id) ? 10 : 0)),
  },
  {
    id: "turtle",
    pick: (offers) =>
      bestBy(offers, (id) => rarityScore(id) + (isDefense(id) ? 10 : 0)),
  },
  {
    id: "oracle",
    pick: (offers) =>
      bestBy(offers, (id) => {
        const i = ORACLE_ORDER.indexOf(id);
        return i >= 0 ? 100 - i : rarityScore(id);
      }),
  },
];

// -- Run kernel ---------------------------------------------------------------

/** Every monster defId a slayer bonus could apply to (the pools endless draws
 *  from). Slayer is a per-defId map, so an empty one is identity. */
const ALL_MONSTER_IDS: string[] = [
  "giant_rat",
  "skeleton",
  "zombie_shambler",
  "bloater",
  "wolf",
  "spore_pod",
  "clockwork_spider",
  "sentry",
  "animated_armor",
  "forge_golem",
  "lich",
  "apex_beast",
  "archmage",
  "wildheart",
  "eclipse_herald",
  "ancient_automaton",
];

/** Why a run ended. The single most important column in the matrix: `timeout`
 *  means the wave CLOCK killed a warband that was still winning the fight, which
 *  is an entirely different failure from being overrun. `maxwave` and `tickcap`
 *  are the harness's own limits, reported separately so a truncated run is never
 *  mistaken for a real outcome. */
type EndCause = "wipe" | "timeout" | "tickcap" | "maxwave";

interface EndlessRunResult {
  wavesCleared: number;
  cause: EndCause;
  /** Seconds each wave took — the timeout diagnostic. */
  waveSecs: number[];
  firstDeathWave: number | null;
  deadAtEnd: number;
  ticks: number;
}

interface RunCfg {
  seed: number;
  deck: string[];
  tier: PowerTier;
  policy: PickPolicy;
}

function playEndless({ seed, deck, tier, policy }: RunCfg): EndlessRunResult {
  const mc = new MatchController(seed, deck, [], {
    mode: "endless",
    unitLevels: Object.fromEntries(deck.map((id) => [id, tier.level])),
    itemLoadouts: gearFor(deck, tier.gear),
    slayerBonuses: slayerFor(tier, ALL_MONSTER_IDS),
    commanderMods: tier.commander,
  });
  // Deploy explicitly (like winrateSweep's playFloor) rather than leaning on the
  // deploy-timer auto-fill, so placement is identical across the whole matrix and
  // the numbers measure the curve, not positioning luck.
  deck.forEach((id, i) => mc.deploy("player", id, { x: 90 + i * 100, y: 620 }));

  const tickCap = Math.ceil(MAX_WAVE * secToTicks(ENDLESS_WAVE_TIME_SEC) * 1.2);
  const picks: string[] = [];
  const waveSecs: number[] = [];
  let lastWaveStartTick = 0;
  let lastWave = 1;
  let firstDeathWave: number | null = null;
  let hitMaxWave = false;
  let guard = 0;

  while (
    mc.phase !== "defeat" &&
    mc.phase !== "victory" &&
    mc.phase !== "draw" &&
    guard < tickCap
  ) {
    mc.tick();
    guard++;
    const st = mc.endlessStatus();
    if (!st) break;

    if (st.wave !== lastWave) {
      waveSecs.push((guard - lastWaveStartTick) / TICK_RATE);
      lastWaveStartTick = guard;
      lastWave = st.wave;
    }
    if (firstDeathWave === null) {
      // Short-circuit rather than .filter().length — this runs on every tick of
      // every run in the matrix, and the allocation dominates the sweep runtime.
      for (const u of mc.state.units) {
        if (u.team === "player" && u.state === "dead") {
          firstDeathWave = st.wave;
          break;
        }
      }
    }
    if (st.intermission) {
      const offers = st.intermission.offers.map((o) => o.id);
      const idx = policy(offers, picks, st.wave);
      picks.push(offers[idx] ?? offers[0]);
      mc.pickBoon(idx);
    }
    if (mc.wavesSurvived() >= MAX_WAVE) {
      hitMaxWave = true;
      break;
    }
  }

  // Cause detection, in order. The harness's OWN limits are reported first so a
  // truncated run is never silently counted as a real outcome.
  const cause: EndCause = hitMaxWave
    ? "maxwave"
    : guard >= tickCap
      ? "tickcap"
      : mc.state.clockTicks <= 1 && mc.phase === "defeat"
        ? "timeout"
        : "wipe";

  return {
    wavesCleared: mc.wavesSurvived(),
    cause,
    waveSecs,
    firstDeathWave,
    deadAtEnd: mc.state.units.filter(
      (u) => u.team === "player" && u.state === "dead"
    ).length,
    ticks: guard,
  };
}

// -- Aggregation --------------------------------------------------------------

interface CellStats {
  n: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  wipePct: number;
  timeoutPct: number;
  /** tickcap + maxwave — the harness's own limits, i.e. truncated runs. */
  capPct: number;
}

function aggregate(runs: EndlessRunResult[]): CellStats {
  const waves = runs.map((r) => r.wavesCleared);
  const pct = (c: EndCause) =>
    Math.round((runs.filter((r) => r.cause === c).length / runs.length) * 100);
  return {
    n: runs.length,
    median: median(waves),
    p75: percentile(waves, 0.75),
    p90: percentile(waves, 0.9),
    max: Math.max(...waves),
    wipePct: pct("wipe"),
    timeoutPct: pct("timeout"),
    capPct: pct("tickcap") + pct("maxwave"),
  };
}

const fmtCell = (s: CellStats): string =>
  `med ${s.median} p90 ${s.p90} max ${s.max} | ${s.wipePct}w/${s.timeoutPct}t/${s.capPct}c`;

// -- The blocks ---------------------------------------------------------------

RUN("endless sweep", () => {
  it("prints the curve shape (no simulation — this is the approval table)", () => {
    const rows: Record<string, Record<string, string>> = {};
    let prev = endlessWaveStatMultipliers(1);
    for (let w = 1; w <= 80; w++) {
      const m = endlessWaveStatMultipliers(w);
      const gHp = w === 1 ? 1 : m.hp / prev.hp;
      const gDmg = w === 1 ? 1 : m.dmg / prev.dmg;
      // Combined power growth — the quantity a boon pick has to beat each wave.
      const lPrime = Math.log(gHp * gDmg);
      if (w <= 12 || w % 5 === 0) {
        rows[`w${w}`] = {
          hp: m.hp < 1000 ? m.hp.toFixed(2) : m.hp.toExponential(2),
          dmg: m.dmg < 1000 ? m.dmg.toFixed(2) : m.dmg.toExponential(2),
          "hp growth": `${((gHp - 1) * 100).toFixed(1)}%`,
          "L'": lPrime.toFixed(3),
          "waves per 2x": lPrime > 0.001 ? (Math.LN2 / lPrime).toFixed(1) : "inf",
        };
      }
      prev = m;
    }
    // eslint-disable-next-line no-console
    console.table(rows);
  });

  it.runIf(runBlock("matrix"))(
    "prints the run matrix (deck x power x policy)",
    () => {
      const rows: Record<string, Record<string, string>> = {};
      const durations: Record<string, number[]> = {};
      for (const { id: deckId, deck } of DECKS) {
        for (const tier of POWER_TIERS) {
          for (const { id: polId, pick } of POLICIES) {
            const runs: EndlessRunResult[] = [];
            for (let seed = 1; seed <= SEEDS; seed++) {
              const r = playEndless({ seed, deck, tier, policy: pick });
              runs.push(r);
              r.waveSecs.forEach((secs, i) => {
                const band = `${Math.floor(i / 10) * 10 + 1}-${Math.floor(i / 10) * 10 + 10}`;
                (durations[band] ??= []).push(secs);
              });
            }
            (rows[`${deckId}/${tier.id}`] ??= {})[polId] = fmtCell(aggregate(runs));
          }
        }
      }
      // eslint-disable-next-line no-console
      console.table(rows);

      const durRows: Record<string, Record<string, string>> = {};
      for (const [band, xs] of Object.entries(durations)) {
        durRows[`waves ${band}`] = {
          "mean sec": mean(xs).toFixed(1),
          "p90 sec": percentile(xs, 0.9).toFixed(1),
          n: String(xs.length),
        };
      }
      // eslint-disable-next-line no-console
      console.log("\nWave duration by band (vs the 120s clock):");
      // eslint-disable-next-line no-console
      console.table(durRows);
    },
    900_000
  );

  it.runIf(runBlock("ceiling"))(
    "prints the ceiling probe (elite x maxed x oracle — the god-run tail)",
    () => {
      const deck = DECKS.find((d) => d.id === "elite")!.deck;
      const tier = POWER_TIERS.find((t) => t.id === "maxed")!;
      const policy = POLICIES.find((p) => p.id === "oracle")!.pick;
      const runs: EndlessRunResult[] = [];
      for (let seed = 1; seed <= CEIL_SEEDS; seed++) {
        runs.push(playEndless({ seed, deck, tier, policy }));
      }
      const s = aggregate(runs);
      // eslint-disable-next-line no-console
      console.log(
        `\nCeiling probe (${CEIL_SEEDS} seeds): median ${s.median}, p75 ${s.p75}, ` +
          `p90 ${s.p90}, max ${s.max} | ${s.wipePct}% wipe / ${s.timeoutPct}% timeout / ${s.capPct}% tickcap`
      );
      // The distribution itself, not just summary stats — a wall shows up as a
      // tight cluster even when the median looks reasonable.
      // eslint-disable-next-line no-console
      console.log(
        "waves reached:",
        runs
          .map((r) => r.wavesCleared)
          .sort((a, b) => a - b)
          .join(", ")
      );
      if (s.capPct > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `!! ${s.capPct}% of runs hit SWEEP_MAXWAVE=${MAX_WAVE} — the tail is ` +
            `truncated, re-run with a higher cap before trusting the max.`
        );
      }
    },
    900_000
  );
});
