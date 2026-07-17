// Warlock behavior: its one mechanic — Summon Imps, a 0.5s cast on a 10s cooldown
// that calls void imps in PAIRS — and the summon cap that bounds it. Dummies are
// stationary/harmless skeletons (per helpers.ts: the Knight's shield and the Ogre's
// slam would both distort the board), so nothing kills the imps mid-count.
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

const CAST_TICKS = 10; // 0.5s wind-up @ 20 ticks/s
const COOLDOWN_TICKS = 200; // 10s, armed when the cast BEGINS

/** Living void imps on the board. */
function imps(s: SimState): number {
  return s.units.filter((u) => u.defId === "void_imp" && u.state !== "dead")
    .length;
}

function step(s: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepSimulation(s);
}

describe("Warlock — Summon Imps", () => {
  it("summons exactly TWO imps on one cast, both on its own team", () => {
    const s = battleState(1);
    const wl = place(s, "warlock", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 450)); // in range, harmless

    step(s, CAST_TICKS + 2); // just past the wind-up

    expect(imps(s)).toBe(2);
    const summoned = s.units.filter((u) => u.defId === "void_imp");
    expect(summoned.every((u) => u.team === wl.team)).toBe(true);
    // The pair flanks the Warlock — one high, one low, never stacked.
    expect(new Set(summoned.map((u) => u.pos.y)).size).toBe(2);
  });

  it("respects the 10s cooldown — one pair per 10s, not faster", () => {
    const s = battleState(2);
    place(s, "warlock", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 450));

    step(s, CAST_TICKS + 2);
    expect(imps(s)).toBe(2); // first pair

    step(s, COOLDOWN_TICKS - CAST_TICKS - 4); // out to just under 10s
    expect(imps(s)).toBe(2); // still only the first pair

    step(s, CAST_TICKS + 6); // past the cooldown + the next wind-up
    expect(imps(s)).toBe(4); // a second pair — two at a time
  });

  it("is bounded by the summon cap, and refills losses once capped", () => {
    const s = battleState(3);
    place(s, "warlock", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 450));

    // Arena cap: activeCaps.player (2) + 3 = 5 living units per side. The Warlock
    // itself takes one slot, so the pact tops out at 4 imps however long it casts.
    step(s, 900); // ~45s — four-plus casts' worth
    const living = s.units.filter(
      (u) => u.team === "player" && u.state !== "dead"
    ).length;
    expect(living).toBe(5);
    expect(imps(s)).toBe(4);

    // Kill an imp: the next cast refills the freed slot rather than overflowing.
    const victim = s.units.find(
      (u) => u.defId === "void_imp" && u.state !== "dead"
    )!;
    victim.hp = 0;
    victim.state = "dead";
    step(s, COOLDOWN_TICKS + CAST_TICKS + 6);
    expect(imps(s)).toBe(4); // back to full, never past it
  });
});
