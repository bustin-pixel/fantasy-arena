// Zombie Shambler behavior (its whole kit): Numbing Bite — every melee bite
// applies a refreshing 30% move+attack slow for 2s. First UnitKit migration, so
// this doubles as the seam's onAfterAttack proof. Depths monster, never deckable.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Zombie Shambler — Numbing Bite (slow on hit)", () => {
  it("slows its target on a melee bite", () => {
    const s = battleState(3);
    place(s, "zombie_shambler", "enemy", 240, 520);
    const dummy = makeDummy(place(s, "skeleton", "player", 240, 560)); // in reach

    // No slow before contact.
    expect(dummy.effects.some((e) => e.type === "slow")).toBe(false);

    // Step until the shambler lands a bite (attackSpeed 1.9s → give it room).
    for (let i = 0; i < 60; i++) stepSimulation(s);

    const slow = dummy.effects.find((e) => e.type === "slow");
    expect(slow).toBeDefined();
    expect(slow!.magnitude).toBe(0.3);
    expect(dummy.hp).toBeLessThan(dummy.maxHp); // and the bite itself landed
  });

  it("refreshes the slow (never stacks) on repeated bites", () => {
    const s = battleState(4);
    place(s, "zombie_shambler", "enemy", 240, 520);
    const dummy = makeDummy(place(s, "skeleton", "player", 240, 560));

    for (let i = 0; i < 120; i++) stepSimulation(s);

    // Exactly one slow effect at a time, no matter how many bites landed.
    expect(dummy.effects.filter((e) => e.type === "slow").length).toBe(1);
  });
});
