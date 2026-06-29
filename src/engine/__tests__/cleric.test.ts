// Cleric Mend now winds up a 2.5s cast (5s cooldown) instead of healing
// instantly. Two things matter: it heals only once the cast COMPLETES, and it
// won't begin the long cast when no ally is wounded (or it'd freeze in place
// channeling a heal that lands on nobody).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Cleric — Mend (cast-time heal)", () => {
  it("winds up a cast and heals only on completion", () => {
    const s = battleState(1);
    const cleric = place(s, "healer", "player", 240, 600);
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560)); // in heal range
    ally.maxHp = 100;
    ally.hp = 50; // wounded and stationary
    makeDummy(place(s, "skeleton", "enemy", 240, 200)); // gives the Cleric a target
    const before = ally.hp;

    stepSimulation(s);
    stepSimulation(s);
    expect(cleric.castTicks).toBeGreaterThan(0); // channeling…
    expect(ally.hp).toBe(before); // …nothing healed yet

    for (let i = 0; i < 55; i++) stepSimulation(s); // past the 2.5s cast
    expect(ally.hp).toBeGreaterThan(before); // healed once the cast finished
  });

  it("does not begin a cast when no ally needs healing", () => {
    const s = battleState(2);
    const cleric = place(s, "healer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "player", 240, 560)); // full-HP ally
    makeDummy(place(s, "skeleton", "enemy", 240, 200)); // a target

    for (let i = 0; i < 20; i++) {
      stepSimulation(s);
      expect(cleric.castTicks).toBe(0); // never freezes to heal nobody
    }
  });
});
