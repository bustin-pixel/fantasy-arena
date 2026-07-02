// TEMPORARY balance-audit harness (not a spec — delete after the audit).
// Runs batches of full auto-played matches to quantify Arena balance:
//  1. baseline: the default starter deck vs seeded AI decks
//  2. mirror:   identical decks both sides (isolates engine-side asymmetry)
//  3. random:   random deck vs random deck (meta-wide fairness)
import { describe, it } from "vitest";
import { runMatch } from "./helpers";
import { generateEnemyDeck } from "@/engine/AIDeck";
import { getUnitDef } from "@/data/units";
import { MATCH_TIME_SEC, TICK_RATE } from "@/utils/constants";

const N = 300;
const DEFAULT_DECK = ["ogre", "archer", "knight", "fire_mage"];

interface Row {
  result: "victory" | "defeat" | "draw" | "unresolved";
  battleSec: number; // battle time elapsed at resolution
  enemyDeck: string[];
}

function battle(seed: number, player: string[], enemy: string[]): Row {
  const mc = runMatch(seed, player, enemy);
  const battleSec = MATCH_TIME_SEC - mc.state.clockTicks / TICK_RATE;
  const phase = mc.phase;
  const result =
    phase === "victory" || phase === "defeat" || phase === "draw"
      ? phase
      : "unresolved";
  return { result, battleSec, enemyDeck: enemy };
}

function summarize(name: string, rows: Row[]): void {
  const wins = rows.filter((r) => r.result === "victory").length;
  const losses = rows.filter((r) => r.result === "defeat").length;
  const draws = rows.filter((r) => r.result === "draw").length;
  const unresolved = rows.filter((r) => r.result === "unresolved").length;
  const lossRows = rows.filter((r) => r.result === "defeat");
  const fastWipes = lossRows.filter((r) => r.battleSec <= 45).length;
  const avgDur = rows.reduce((s, r) => s + r.battleSec, 0) / rows.length;
  const avgLossDur = lossRows.length
    ? lossRows.reduce((s, r) => s + r.battleSec, 0) / lossRows.length
    : 0;
  console.log(
    `\n=== ${name} (n=${rows.length}) ===\n` +
      `player W/L/D: ${wins}/${losses}/${draws}` +
      (unresolved ? ` (+${unresolved} unresolved)` : "") +
      `  -> win rate ${((wins / rows.length) * 100).toFixed(1)}%\n` +
      `avg battle duration ${avgDur.toFixed(1)}s | avg loss duration ${avgLossDur.toFixed(1)}s | ` +
      `losses wiped by 0:45: ${fastWipes}/${lossRows.length}`
  );
}

/** Win rate of `rows` restricted to a predicate on the enemy deck. */
function bucket(name: string, rows: Row[], pred: (deck: string[]) => boolean): void {
  const sub = rows.filter((r) => pred(r.enemyDeck));
  if (!sub.length) return;
  const wins = sub.filter((r) => r.result === "victory").length;
  console.log(
    `  vs ${name}: n=${sub.length}, player win rate ${((wins / sub.length) * 100).toFixed(1)}%`
  );
}

// Skipped by default — run explicitly with:
//   npx vitest run src/engine/__tests__/balanceAudit.test.ts
// after removing .skip, whenever balance numbers change.
describe.skip("balance audit (temporary harness)", () => {
  it("runs the three experiments", () => {
    // 1. Baseline: default starter deck vs the AI deck each seed would generate.
    const baseline: Row[] = [];
    for (let seed = 1; seed <= N; seed++) {
      baseline.push(battle(seed, DEFAULT_DECK, generateEnemyDeck(seed)));
    }
    summarize("BASELINE: default deck vs AI deck", baseline);
    bucket("decks with a legendary", baseline, (d) =>
      d.some((id) => getUnitDef(id).rarity === "legendary")
    );
    bucket("decks with the Druid", baseline, (d) => d.includes("summoner"));
    bucket("decks with 3+ epics", baseline, (d) =>
      d.filter((id) => getUnitDef(id).rarity === "epic").length >= 3
    );
    bucket("all-rare decks", baseline, (d) =>
      d.every((id) => getUnitDef(id).rarity === "rare")
    );

    // 2. Mirror: both sides play the IDENTICAL deck. Any deviation from ~50%
    //    is pure engine-side asymmetry (deploy pacing, AI counter-picking,
    //    positioning) — deck quality is equal by construction.
    const mirror: Row[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const deck = generateEnemyDeck(seed);
      mirror.push(battle(seed * 7919 + 17, deck, deck));
    }
    summarize("MIRROR: identical decks both sides", mirror);

    // 2b. The new-units deck (what the browser verification played).
    const newUnits: Row[] = [];
    for (let seed = 1; seed <= N; seed++) {
      newUnits.push(
        battle(seed, ["ranger", "warrior", "archer", "fire_mage"], generateEnemyDeck(seed))
      );
    }
    summarize("NEW-UNITS deck (ranger/warrior/archer/fire_mage) vs AI deck", newUnits);
    bucket("decks with a legendary", newUnits, (d) =>
      d.some((id) => getUnitDef(id).rarity === "legendary")
    );

    // 3. Random vs random: independent decks for each side.
    const random: Row[] = [];
    for (let seed = 1; seed <= N; seed++) {
      random.push(
        battle(seed * 31 + 5, generateEnemyDeck(seed + 100000), generateEnemyDeck(seed))
      );
    }
    summarize("RANDOM vs RANDOM decks", random);
  }, 120000);
});
