// Mystic Archer: the Momentum passive (each Light/Dark form shift permanently
// ramps attack speed +15%, capped at +75%) and confirmation that the underlying
// Light/Dark mechanic still functions after moving the headline ability slot to
// `momentum`.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { getUnitDef } from "@/data/units";
import { battleState, place, makeDummy } from "./helpers";

const BASE = getUnitDef("mystic_archer").attackSpeed; // 1.0s between attacks

describe("Mystic Archer — Momentum (attack-speed ramp)", () => {
  it("recomputes attack speed as +15% per stack", () => {
    const s = battleState(1);
    const archer = place(s, "mystic_archer", "player", 240, 650);
    makeDummy(place(s, "ogre", "enemy", 240, 40)); // far out of range → no shifts

    archer.momentumStacks = 2;
    stepSimulation(s);
    expect(archer.attackSpeed).toBeCloseTo(BASE / 1.3, 4); // +30%
  });

  it("caps the ramp at +75%", () => {
    const s = battleState(2);
    const archer = place(s, "mystic_archer", "player", 240, 650);
    makeDummy(place(s, "ogre", "enemy", 240, 40));

    archer.momentumStacks = 7; // beyond the cap
    stepSimulation(s);
    expect(archer.attackSpeed).toBeCloseTo(BASE / 1.75, 4); // +75%, not more
  });

  it("gains stacks from real form shifts and never exceeds the cap", () => {
    const s = battleState(3);
    const archer = place(s, "mystic_archer", "player", 240, 650);
    // In-range, shieldless dummy: the archer marks it, detonates, and flips forms.
    const dummy = makeDummy(place(s, "ogre", "enemy", 240, 500));

    let minAtk = BASE;
    let sawDark = false;
    for (let i = 0; i < 320; i++) {
      stepSimulation(s);
      if (archer.mysticForm === "dark") sawDark = true;
      minAtk = Math.min(minAtk, archer.attackSpeed);
    }

    expect(archer.momentumStacks).toBeGreaterThanOrEqual(1); // shifts happened
    expect(archer.momentumStacks).toBeLessThanOrEqual(5); // capped
    expect(sawDark).toBe(true); // Light→Dark flip still occurs (mechanic intact)
    expect(dummy.hp).toBeLessThan(dummy.maxHp); // Light/Dark still deals damage
    expect(archer.attackSpeed).toBeLessThan(BASE); // ramped up
    expect(minAtk).toBeGreaterThanOrEqual(BASE / 1.75 - 1e-9); // never past the cap
  });
});

describe("Mystic Archer — Dark form chain (on-hit)", () => {
  it("chains its shot to a second nearby enemy, not just the primary", () => {
    const s = battleState(5);
    const archer = place(s, "mystic_archer", "player", 240, 500);
    archer.mysticForm = "dark"; // force the AoE-chain form
    const primary = makeDummy(place(s, "skeleton", "enemy", 240, 460));
    const bystander = makeDummy(place(s, "skeleton", "enemy", 250, 465)); // within chain radius

    let chained = false;
    for (let i = 0; i < 30 && !chained; i++) {
      stepSimulation(s);
      if (bystander.hp < bystander.maxHp) chained = true;
    }

    expect(primary.hp).toBeLessThan(primary.maxHp); // primary took its hit
    expect(bystander.hp).toBeLessThan(bystander.maxHp); // the chain reached the bystander
  });
});
