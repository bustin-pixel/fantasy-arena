// Rogue behavior: an epic stealth-opener skirmisher with two mechanics —
//   1. Ambusher: deploys stealthed (untargetable) and reveals on its first strike.
//   2. Venom: every melee strike afflicts the target with a refreshing Poison DoT.
// Each is exercised in isolation with controlled, harmless dummies.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { MatchController } from "@/engine/MatchController";
import { isStealthed } from "@/engine/StatusEffectSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Rogue — Ambusher (opening stealth)", () => {
  it("deploys stealthed", () => {
    const mc = new MatchController(7, ["rogue"], ["knight"]);
    const rogue = mc.deploy("player", "rogue", { x: 240, y: 600 });
    expect(rogue).not.toBeNull();
    expect(isStealthed(rogue!)).toBe(true);
  });

  it("reveals (drops stealth) on its first strike", () => {
    const s = battleState(1);
    const rogue = place(s, "rogue", "player", 240, 560);
    rogue.effects.push({ type: "stealth", ticksLeft: 1000, source: rogue.uid });
    makeDummy(place(s, "skeleton", "enemy", 240, 520)); // in melee reach

    expect(isStealthed(rogue)).toBe(true);
    for (let i = 0; i < 30; i++) stepSimulation(s);
    expect(isStealthed(rogue)).toBe(false); // its first strike revealed it
  });
});

describe("Rogue — Venom (poison on hit)", () => {
  it("poisons its target and the poison keeps dealing damage", () => {
    const s = battleState(2);
    const rogue = place(s, "rogue", "player", 240, 560);
    const dummy = makeDummy(place(s, "skeleton", "enemy", 240, 520));

    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(dummy.effects.some((e) => e.type === "poison")).toBe(true);
    expect(dummy.hp).toBeLessThan(dummy.maxHp); // took basic + poison damage

    // Zero the Rogue's basic damage so any further HP loss is poison DoT alone.
    rogue.damage = 0;
    const hpAfterEngage = dummy.hp;
    for (let i = 0; i < 20; i++) stepSimulation(s);
    expect(dummy.hp).toBeLessThan(hpAfterEngage); // poison ticked on its own
  });
});
