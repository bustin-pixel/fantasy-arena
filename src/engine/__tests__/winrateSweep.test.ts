// ============================================================================
// Winrate sweep — the headless balance harness (SKIPPED by default).
//
// The engine is pure + deterministic, so we can auto-play thousands of matches
// under Vitest to measure the progression curve. This is a TOOL, not an assertion
// suite: it prints winrate tables you read while tuning dungeon dials + boss kits.
// It never runs in the normal `npm test` pass (it would add minutes); enable it
// with the SWEEP env flag:
//
//   SWEEP=1 npm test -- winrateSweep                 # the whole curve (Normal)
//   SWEEP=1 SWEEP_SEEDS=40 npm test -- winrateSweep  # tighter confidence
//   SWEEP=1 SWEEP_DUNGEON=sealed_vault npm test -- winrateSweep   # one dungeon
//   SWEEP=1 SWEEP_TIER=hard npm test -- winrateSweep # a difficulty tier
//
// Pacing targets (at the EXPECTED arrival level/gear for a dungeon):
//   floors 1–4 win 70–90% · floor-5 boss first-attempt 40–60% · fork floor-5
//   at the band top + expected gear ~50%. Walls (Sealed Vault, Eclipse Spire)
//   sit a notch lower on the boss floor; that's intended — the player
//   replays/levels/gears up. ELITE is over the player cap by design: the model
//   clamps the warband at Lv 30 against Lv 30–41 monsters, so late-Elite reads
//   well under 50% — an aspirational wall, not a tuning failure.
// ============================================================================
import { describe, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import { DUNGEON_IDS, getDungeon } from "@/data/dungeons";
import { tierMonsterLevel, type TierId } from "@/data/tiers";
import { LEVEL_CAP } from "@/meta/leveling";
import { makeItemKey } from "@/data/items";
import type { ItemLoadouts } from "@/types";

// This project's tsconfig has no @types/node, so `process` is untyped. Vitest
// provides it at runtime — declare a minimal shape just for the SWEEP flag.
declare const process: { env: Record<string, string | undefined> };

const RUN = process.env.SWEEP ? describe : describe.skip;
const SEEDS = Number(process.env.SWEEP_SEEDS ?? 24);
const ONLY = process.env.SWEEP_DUNGEON; // optional single-dungeon filter
const TIER = (process.env.SWEEP_TIER ?? "normal") as TierId; // difficulty tier
// Optional calibration override: force ONE gear rung everywhere (e.g.
// SWEEP_GEAR=leg2) instead of the per-dungeon expectation curve.
const GEAR_OVERRIDE = process.env.SWEEP_GEAR as GearTier | undefined;

// A representative mid-roster warband — a tank, an AoE nuke (swarm answer), a
// bruiser, and a healer (attrition sustain). This is the sort of balanced deck a
// player actually walks the chain with; the sweep holds it fixed while level/gear
// vary, so the numbers measure the CONTENT's difficulty, not deck-building skill.
const REFERENCE_DECK = ["knight", "fire_mage", "berserker", "healer"];

/** The power level a player realistically fights floor `floor` at: they arrive a
 *  notch above the tier-banded fodder level (having grinded the earlier ones)
 *  and gain roughly a level per floor as they descend, all clamped at the Lv-30
 *  cap. Modeling the descent-leveling matters — a fixed level makes deep floors
 *  look far harder than they play. At Elite the clamp bites hard (monsters run
 *  past the cap on purpose). Tune target: ~65-75% F1-4, ~50% boss. */
function intendedLevel(monsterLevel: number, floor: number): number {
  return Math.min(LEVEL_CAP, tierMonsterLevel(monsterLevel, TIER) + 1 + floor);
}

/** Gear tiers, coarse rungs of the item ladder mapped to a whole-deck loadout.
 *  Weapon = raw damage%, armor = raw HP% — the two that bake into stats, so they
 *  move the winrate the most. "none" is the byte-identical bare build. */
type GearTier = "none" | "rare2" | "epic1" | "leg1" | "leg2" | "leg3";

const GEAR_LADDER: GearTier[] = ["none", "rare2", "epic1", "leg1", "leg2", "leg3"];

function gearFor(deck: string[], tier: GearTier): ItemLoadouts {
  if (tier === "none") return {};
  const [q, s] =
    tier === "rare2"
      ? (["rare", 2] as const)
      : tier === "epic1"
        ? (["epic", 1] as const)
        : tier === "leg1"
          ? (["legendary", 1] as const)
          : tier === "leg2"
            ? (["legendary", 2] as const)
            : (["legendary", 3] as const);
  const loadout = {
    weapon: makeItemKey("soldiers_blade", q, s),
    armor: makeItemKey("squires_plate", q, s),
    ...(q === "legendary" ? { trinket: makeItemKey("ember_charm", q, s) } : {}),
  };
  return Object.fromEntries(deck.map((id) => [id, loadout]));
}

/** Auto-play one dungeon floor to a terminal phase. Mirrors depths.test's runner:
 *  deploy the whole warband on the player's back line, tick past the full PvE
 *  clock (300s = 6000 ticks) with headroom. Returns win + surviving-HP fraction. */
function playFloor(
  seed: number,
  dungeonId: string,
  floor: number,
  deck: string[],
  level: number,
  gear: GearTier
): { win: boolean; hpFrac: number } {
  const unitLevels = Object.fromEntries(deck.map((id) => [id, level]));
  const mc = new MatchController(seed, deck, [], {
    mode: "depths",
    dungeonId,
    floor,
    unitLevels,
    itemLoadouts: gearFor(deck, gear),
    tier: TIER,
  });
  deck.forEach((id, i) => mc.deploy("player", id, { x: 90 + i * 100, y: 620 }));
  let guard = 0;
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < 8000
  ) {
    mc.tick();
    guard++;
  }
  const players = mc.state.units.filter((u) => u.team === "player");
  const hp = players.reduce((a, u) => a + Math.max(0, u.hp), 0);
  const maxHp = players.reduce((a, u) => a + u.maxHp, 0);
  return { win: mc.phase === "victory", hpFrac: maxHp > 0 ? hp / maxHp : 0 };
}

/** Winrate + mean surviving-HP fraction over SEEDS runs. */
function sweep(
  dungeonId: string,
  floor: number,
  level: number,
  gear: GearTier
): { winPct: number; hpPct: number } {
  let wins = 0;
  let hpSum = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = playFloor(seed, dungeonId, floor, REFERENCE_DECK, level, gear);
    if (r.win) wins++;
    hpSum += r.hpFrac;
  }
  return {
    winPct: Math.round((wins / SEEDS) * 100),
    hpPct: Math.round((hpSum / SEEDS) * 100),
  };
}

/** Expected gear tier a player brings when they arrive at each dungeon on
 *  NORMAL (the plan's gear-expectation curve). Level expectation = the
 *  dungeon's monsterLevel. Hard rides one rung up the ladder; Elite two
 *  (leg2/leg3 by the back half — see gearAt). */
const GEAR_BY_DUNGEON: Record<string, GearTier> = {
  depths: "none",
  bonefields: "none",
  wilds: "none",
  overgrowth: "rare2",
  sealed_vault: "rare2",
  deep_forge: "epic1",
  eclipse_spire: "epic1",
  fallen_cathedral: "leg1",
  rogues_den: "leg1",
};

/** The dungeons whose Hard/Elite model wears one rung above the tier's floor
 *  (the back half of the chain — a fork-ready warband). */
const LATE_CHAIN = new Set([
  "deep_forge",
  "eclipse_spire",
  "fallen_cathedral",
  "rogues_den",
]);

/** The gear model for the ACTIVE sweep tier. Normal = the arrival curve.
 *  Hard/Elite model an ENDGAME warband — the per-dungeon ladder gates them
 *  behind full Normal clears, and their Lv-26+ intended levels already imply
 *  a farmed roster — so they wear a legendary floor (Hard leg1, Elite leg2),
 *  one rung higher in the late chain. Calibrated 2026-07-17: below this the
 *  winrate cliff is the GEAR rung, not the monster levels (flat kit numbers
 *  wash out at Lv 25+ absolute stats, so rungs dominate). */
function gearAt(dungeonId: string): GearTier {
  if (GEAR_OVERRIDE) return GEAR_OVERRIDE;
  if (TIER === "normal") return GEAR_BY_DUNGEON[dungeonId] ?? "none";
  const floor: GearTier = TIER === "hard" ? "leg1" : "leg2";
  if (!LATE_CHAIN.has(dungeonId)) return floor;
  return GEAR_LADDER[GEAR_LADDER.indexOf(floor) + 1];
}

RUN(`winrate sweep — progression curve (${TIER})`, () => {
  const dungeons = ONLY ? [ONLY] : DUNGEON_IDS;

  it("prints the expected-arrival curve (descent-leveled per floor, gear per tier)", () => {
    const rows: Record<string, Record<string, string>> = {};
    for (const id of dungeons) {
      const d = getDungeon(id);
      const gear = gearAt(id);
      for (let floor = 1; floor <= d.floors; floor++) {
        const level = intendedLevel(d.monsterLevel, floor);
        const { winPct, hpPct } = sweep(id, floor, level, gear);
        (rows[`${id} (${gear})`] ??= {})[`F${floor}`] =
          `${winPct}% L${level}/${hpPct}hp`;
      }
    }
    // eslint-disable-next-line no-console
    console.table(rows);
  });

  it("prints a level-sensitivity grid for the walls (Vault F5, Spire F5, forks F5)", () => {
    const probes: [string, number][] = [
      ["sealed_vault", 5],
      ["deep_forge", 5],
      ["eclipse_spire", 5],
      ["fallen_cathedral", 5],
      ["rogues_den", 5],
    ].filter(([id]) => !ONLY || id === ONLY) as [string, number][];
    const rows: Record<string, Record<string, string>> = {};
    for (const [id, floor] of probes) {
      const gear = gearAt(id);
      // Probe around the tier's banded fodder level, clamped to the player cap
      // (at Elite the top probes collapse onto Lv 30 — the capped warband).
      const m = tierMonsterLevel(getDungeon(id).monsterLevel, TIER);
      const levels = [
        ...new Set(
          [m - 2, m, m + 2, m + 4, m + 6].map((l) =>
            Math.max(1, Math.min(LEVEL_CAP, l))
          )
        ),
      ];
      for (const level of levels) {
        const { winPct } = sweep(id, floor, level, gear);
        (rows[`${id} F${floor} (${gear})`] ??= {})[`Lv${level}`] = `${winPct}%`;
      }
    }
    // eslint-disable-next-line no-console
    console.table(rows);
  });
});
