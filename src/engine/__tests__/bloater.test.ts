// Bloater — Putrid Burst: on death it ruptures, dealing AoE damage to every enemy
// within radius (110) and leaving a lingering poison cloud on each. It never
// touches its own allies. (Not covered by the temp digest guard, so this spec is
// the Bloater's behavioral safety net.)
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
