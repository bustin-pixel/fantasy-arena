// Ranged advance-while-firing (round-2 review, 2026-07-22).
//
// The sim has always let a ranged unit MOVE during the `attacking` state
// (kiting retreats), but forward advance was gated to `moving` only, so a
// ranged unit at the edge of its reach stood still and fired. The gate in
// MovementSystem now also lets a RANGED attacker close from reach to its
// stop distance without breaking fire. Melee stays moving-only (advancing
// mid-swing would shove through the surround ring).
import { describe, expect, it } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { dist } from "@/utils/math";
import { battleState, makeDummy, place } from "./helpers";

describe("ranged advance-while-firing", () => {
  it("a ranged attacker closes toward its stop distance while attacking", () => {
    const s = battleState(42);
    // Archer range is well over the melee threshold; park the target just
    // INSIDE reach (range + radius) but well OUTSIDE the stop distance
    // (range + radius * 0.5), i.e. in the band the new gate opens up.
    const archer = place(s, "archer", "player", 100, 200);
    const dummy = makeDummy(place(s, "skeleton", "enemy", 100 + archer.range + archer.radius - 2, 200));

    stepSimulation(s); // acquire target, enter the attacking state
    expect(archer.state).toBe("attacking");

    const before = dist(archer.pos, dummy.pos);
    for (let i = 0; i < 10; i++) stepSimulation(s);
    const after = dist(archer.pos, dummy.pos);

    // It kept firing the whole time (state never left attacking)...
    expect(archer.state).toBe("attacking");
    // ...while physically closing on the target.
    expect(after).toBeLessThan(before);
    // And it respects the stop distance rather than marching into melee.
    expect(after).toBeGreaterThanOrEqual(archer.range * 0.5);
  });

  it("a melee attacker still holds its spot mid-swing", () => {
    const s = battleState(42);
    const knight = place(s, "knight", "player", 100, 200);
    const dummy = makeDummy(place(s, "skeleton", "enemy", 130, 200));

    // Let it walk in and start swinging.
    for (let i = 0; i < 60; i++) stepSimulation(s);
    expect(knight.state).toBe("attacking");

    const x = knight.pos.x;
    const y = knight.pos.y;
    for (let i = 0; i < 10; i++) stepSimulation(s);
    // Any drift here is the collision resolver's, not an advance — the
    // attacking-state advance must not apply to melee.
    expect(Math.abs(knight.pos.x - x)).toBeLessThan(1);
    expect(Math.abs(knight.pos.y - y)).toBeLessThan(1);
  });
});
