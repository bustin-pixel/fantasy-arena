// Electric Mage: Chain Lightning — a ~2s cast that arcs a bolt through a cluster
// of enemies (heavy decaying damage + a brief paralyze on each), interruptible
// by a stun/fear mid-cast, on an 8s cooldown.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { isStunned } from "@/engine/StatusEffectSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

function stun(u: Unit): void {
  u.effects.push({ type: "stun", ticksLeft: 30, source: u.uid });
}

describe("Electric Mage — Chain Lightning", () => {
  it("after the cast, the bolt chains through a cluster, damaging + stunning each", () => {
    const s = battleState(1);
    place(s, "electric_mage", "player", 240, 600);
    // A tight cluster of harmless foes within chain range of each other.
    const a = makeDummy(place(s, "skeleton", "enemy", 240, 450)); // the cast target
    const b = makeDummy(place(s, "skeleton", "enemy", 300, 470)); // ~63px from a
    const c = makeDummy(place(s, "skeleton", "enemy", 180, 470)); // ~63px from a

    for (let i = 0; i < 45; i++) stepSimulation(s); // ~2s cast, then release (~tick 42)

    for (const e of [a, b, c]) {
      expect(e.hp).toBeLessThan(e.maxHp); // every clustered foe got arced
      expect(isStunned(e)).toBe(true); // ...and paralyzed
    }
  });

  it("a stun mid-cast interrupts the blast (fizzle)", () => {
    const s = battleState(2);
    const mage = place(s, "electric_mage", "player", 240, 600);
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 450));

    for (let i = 0; i < 10; i++) stepSimulation(s); // mage is mid-cast
    expect(mage.castTicks).toBeGreaterThan(0);

    stun(mage);
    stepSimulation(s);

    expect(mage.castTicks).toBe(0); // cast cancelled
    expect(foe.hp).toBe(foe.maxHp); // the blast never landed
  });

  it("respects the 8s cooldown (one blast per cycle)", () => {
    const s = battleState(3);
    place(s, "electric_mage", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 450));

    const seen = new Set<string>();
    const collect = () => {
      for (const v of s.vfx) if (v.kind === "lightning") seen.add(v.id);
    };

    for (let i = 0; i < 150; i++) (stepSimulation(s), collect()); // ~7.5s
    expect(seen.size).toBe(1); // one blast so far
    for (let i = 0; i < 100; i++) (stepSimulation(s), collect()); // out past the next cast
    expect(seen.size).toBe(2); // a second blast — ~8s cadence
  });
});
