// Slime behavior (its whole kit, kits/slime.ts):
//   1. Split — the original spawns a weaker clone each time its HP crosses a 25%
//      threshold (up to 3). Clones (Slimelings) are terminal and never split.
//   2. Burst — every slime (original or clone) deals AoE damage on death.
// Exercises the seam's onDamaged (clone spawns via the damageSpawns queue) and
// onDeath (burst re-enters dealDamage).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Slime — Split (clone on HP threshold)", () => {
  it("spawns clones as it's chipped down past 25% thresholds", () => {
    const s = battleState(5);
    const slime = place(s, "slime", "enemy", 240, 300);
    slime.moveSpeed = 0; // stationary so it just soaks damage in place
    const atk = place(s, "archer", "player", 240, 460); // ranged chipper
    atk.hp = atk.maxHp = 100000; // survives the clones it spawns

    for (let i = 0; i < 240; i++) stepSimulation(s);

    expect(slime.splitsSpawned).toBeGreaterThanOrEqual(1);
    expect(slime.splitsSpawned).toBeLessThanOrEqual(3);
    // Clones were created (they persist in state.units even once dead).
    expect(s.units.some((u) => u.defId === "slime_clone")).toBe(true);
  });
});

describe("Slime — Burst (AoE on death)", () => {
  it("a dying Slimeling bursts nearby enemies for 20", () => {
    const s = battleState(6);
    const clone = place(s, "slime_clone", "enemy", 240, 300);
    clone.moveSpeed = 0;
    clone.hp = 10; // low → dies quickly (clones never split, so no extra bursts)
    // 85px away: outside the clone's melee reach (so it never bites the victim)
    // but inside the 90px burst radius (so only the burst touches it).
    const victim = makeDummy(place(s, "skeleton", "player", 240, 385));
    place(s, "archer", "player", 240, 680); // kills the clone from range

    for (let i = 0; i < 160; i++) stepSimulation(s);

    expect(clone.state).toBe("dead");
    expect(victim.hp).toBe(victim.maxHp - 20); // burst damage only (dummy deals none)
  });
});
