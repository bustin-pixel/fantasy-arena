// Bloater — Putrid Burst: on death it ruptures, dealing AoE damage to every enemy
// within radius (110) and leaving a lingering poison cloud on each. It never
// touches its own allies. (Not covered by the temp digest guard, so this spec is
// the Bloater's behavioral safety net.)
// Sloughing Mass: the Slime's split grafted onto the boss — a Bloatling spawns
// each time its HP crosses a 25% threshold (up to 3); Bloatlings never split
// but rupture (weaker) on death.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Bloater — Putrid Burst", () => {
  it("ruptures on death: AoE damage + poison to nearby enemies, sparing allies", () => {
    const s = battleState(1);
    const bloater = place(s, "bloater", "enemy", 240, 400);
    bloater.hp = 1; // one blow from death, so it bursts promptly
    bloater.moveSpeed = 0;

    // A player attacker to land the killing blow (real damage), just in reach.
    const killer = place(s, "skeleton", "player", 240, 445);
    killer.damage = 50; // guarantees a one-shot kill

    // A player-team victim inside the burst radius: should take damage + poison.
    const victim = makeDummy(place(s, "wolf", "player", 300, 400)); // ~60px from the bloater
    // An ALLY of the bloater (enemy team) inside the radius: must be spared.
    const ally = makeDummy(place(s, "wolf", "enemy", 180, 400)); // ~60px, same team as bloater

    let guard = 0;
    while (bloater.state !== "dead" && guard++ < 60) stepSimulation(s);
    expect(bloater.state).toBe("dead"); // the burst fires on this same tick

    expect(victim.hp).toBeLessThan(victim.maxHp); // caught in the AoE
    expect(victim.effects.some((e) => e.type === "poison")).toBe(true); // poison cloud
    expect(ally.hp).toBe(ally.maxHp); // the bloater's own ally is untouched
    expect(ally.effects.some((e) => e.type === "poison")).toBe(false);
  });
});

describe("Bloater — Sloughing Mass (Bloatling on HP threshold)", () => {
  it("sloughs Bloatlings as it's chipped down past 25% thresholds", () => {
    const s = battleState(2);
    const bloater = place(s, "bloater", "enemy", 240, 300);
    bloater.moveSpeed = 0; // stationary so it just soaks damage in place
    const atk = place(s, "archer", "player", 240, 460); // ranged chipper
    atk.hp = atk.maxHp = 100000; // survives the bloatlings it provokes

    for (let i = 0; i < 1200; i++) stepSimulation(s); // 800hp takes a while

    expect(bloater.splitsSpawned).toBeGreaterThanOrEqual(1);
    expect(bloater.splitsSpawned).toBeLessThanOrEqual(3);
    // Bloatlings were created (they persist in state.units even once dead).
    expect(s.units.some((u) => u.defId === "bloatling")).toBe(true);
  });

  it("a dying Bloatling ruptures nearby enemies for 15 + poison, and never splits", () => {
    const s = battleState(3);
    const gobbet = place(s, "bloatling", "enemy", 240, 300);
    gobbet.moveSpeed = 0;
    gobbet.hp = 10; // low → dies quickly
    // 85px away: outside melee reach (never bitten) but inside the 110px burst.
    const victim = makeDummy(place(s, "skeleton", "player", 240, 385));
    place(s, "archer", "player", 240, 680); // kills the bloatling from range

    for (let i = 0; i < 160; i++) stepSimulation(s);

    expect(gobbet.state).toBe("dead");
    expect(gobbet.splitsSpawned).toBe(0); // terminal — no grand-bloatlings
    expect(s.units.filter((u) => u.defId === "bloatling")).toHaveLength(1);
    expect(victim.effects.some((e) => e.type === "poison")).toBe(true);
  });
});
