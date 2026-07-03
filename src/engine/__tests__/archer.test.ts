// Archer — Kiting Leap: an instant ability (6s cooldown) that hops the Archer
// ~130px directly away from a melee enemy that has closed into threat range
// (radius * 2.4 = 76.8px), buying space to keep firing. It only fires when such a
// threat exists — otherwise it returns false so the cooldown isn't wasted.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

const gap = (a: Unit, b: Unit) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);

describe("Archer — Kiting Leap", () => {
  it("hops clear when a melee enemy closes into threat range", () => {
    const s = battleState(1);
    const archer = place(s, "archer", "player", 240, 400);
    archer.moveSpeed = 0; // isolate the leap from ordinary kiting movement
    // A melee foe ~70px below — inside threat range (76.8), outside collision (64).
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 470));
    const before = gap(archer, foe);

    let guard = 0;
    while (archer.abilityCooldown === 0 && guard++ < 10) stepSimulation(s);

    expect(archer.abilityCooldown).toBeGreaterThan(0); // the leap fired (cooldown spent)
    expect(gap(archer, foe)).toBeGreaterThan(before + 80); // it hopped well clear
  });

  it("keeps its cooldown when there's no melee threat near", () => {
    const s = battleState(2);
    const archer = place(s, "archer", "player", 240, 400);
    archer.moveSpeed = 0;
    // A target to engage, but far outside threat range — nothing to kite from.
    makeDummy(place(s, "skeleton", "enemy", 240, 150));

    for (let i = 0; i < 20; i++) {
      stepSimulation(s);
      expect(archer.abilityCooldown).toBe(0); // never wasted on an absent threat
    }
  });
});
