// Mage — Polymorph: a 1s cast (20s cooldown) that turns the nearest NON-summoned
// enemy into a harmless sheep for 7s. Summons (wolves/skeletons/etc.) are immune.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { secToTicks } from "@/utils/constants";
import { battleState, place, makeDummy } from "./helpers";

describe("Mage — Polymorph", () => {
  it("turns a non-summoned enemy into a sheep", () => {
    const s = battleState(1);
    place(s, "mage", "player", 240, 600);
    const foe = makeDummy(place(s, "knight", "enemy", 240, 480)); // real unit, in range

    for (let i = 0; i < 30; i++) stepSimulation(s); // past the 1s cast
    expect(foe.effects.some((e) => e.type === "polymorph")).toBe(true);
  });

  it("won't target a summoned unit (and doesn't waste the cast)", () => {
    const s = battleState(2);
    const mage = place(s, "mage", "player", 240, 600);
    const summon = makeDummy(place(s, "skeleton", "enemy", 240, 480)); // a summon-type

    let everCast = false;
    for (let i = 0; i < 30; i++) {
      stepSimulation(s);
      if (mage.castTicks > 0) everCast = true;
    }
    expect(summon.effects.some((e) => e.type === "polymorph")).toBe(false);
    expect(everCast).toBe(false); // never began a cast — no legal target
  });

  it("incapacitates the sheep, then it reverts after 7s", () => {
    const s = battleState(3);
    const sheep = place(s, "knight", "enemy", 240, 560);
    const victim = makeDummy(place(s, "skeleton", "player", 240, 600)); // would be attacked
    sheep.effects.push({ type: "polymorph", ticksLeft: secToTicks(7), source: "x" });
    const hp = victim.hp;

    for (let i = 0; i < 30; i++) stepSimulation(s); // still a sheep
    expect(victim.hp).toBe(hp); // it couldn't attack
    expect(sheep.effects.some((e) => e.type === "polymorph")).toBe(true);

    for (let i = 0; i < 130; i++) stepSimulation(s); // past 7s
    expect(sheep.effects.some((e) => e.type === "polymorph")).toBe(false);
  });
});
