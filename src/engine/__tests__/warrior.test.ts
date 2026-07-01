// Warrior — Whirlwind: its melee swing is a full claymore spin that strikes every
// enemy in reach (not just the target) and leaves each bleeding (a refreshing
// poison-type DoT). It never touches allies, and the bleed keeps damaging between
// swings.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Warrior — Whirlwind", () => {
  it("spins to strike every enemy in melee reach and leaves them bleeding", () => {
    const s = battleState(1);
    const warrior = place(s, "warrior", "player", 240, 600);
    warrior.moveSpeed = 0; // stand and spin so the foes stay in reach
    // Three foes clustered within the whirlwind's reach (range 48 + radius 32 = 80).
    const foes = [
      makeDummy(place(s, "skeleton", "enemy", 240, 540)),
      makeDummy(place(s, "skeleton", "enemy", 185, 575)),
      makeDummy(place(s, "skeleton", "enemy", 295, 575)),
    ];

    for (let i = 0; i < 40; i++) stepSimulation(s);

    for (const f of foes) {
      expect(f.hp).toBeLessThan(f.maxHp); // struck by the spin, not just the target
      expect(f.effects.some((e) => e.type === "poison")).toBe(true); // bleeding
    }
  });

  it("cleaves only enemies, never allies in reach", () => {
    const s = battleState(2);
    const warrior = place(s, "warrior", "player", 240, 600);
    warrior.moveSpeed = 0;
    const ally = makeDummy(place(s, "skeleton", "player", 210, 575)); // friendly, in reach
    makeDummy(place(s, "skeleton", "enemy", 240, 545)); // gives it a target to swing at

    for (let i = 0; i < 40; i++) stepSimulation(s);

    expect(ally.hp).toBe(ally.maxHp); // untouched by the spin
    expect(ally.effects.some((e) => e.type === "poison")).toBe(false);
  });

  it("leaves a bleed that keeps ticking between swings (a true DoT)", () => {
    const s = battleState(3);
    const warrior = place(s, "warrior", "player", 240, 600);
    warrior.moveSpeed = 0;
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 545));

    // Advance to the first whirlwind swing.
    let guard = 0;
    while (warrior.attackCount === 0 && guard++ < 200) stepSimulation(s);
    expect(warrior.attackCount).toBe(1);
    const hpAfterSwing = foe.hp;

    // Step a short window too small to land a second swing (atk speed 1.4s = 28
    // ticks). HP should still drop — from the bleed alone.
    for (let i = 0; i < 15; i++) stepSimulation(s);
    expect(warrior.attackCount).toBe(1); // no new swing yet
    expect(foe.hp).toBeLessThan(hpAfterSwing); // the DoT kept damaging
  });
});
