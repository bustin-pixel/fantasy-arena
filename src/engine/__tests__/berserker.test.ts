// Berserker Bloodrage additions: Last Stand (once per life, a killing blow leaves
// it at 1 HP and unkillable for 5s) and Bloodthirst (each kill restores 5% max HP).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Berserker — Last Stand", () => {
  it("survives a killing blow at 1 HP, unkillable, once per life", () => {
    const s = battleState(1);
    const zerk = place(s, "berserker", "player", 240, 600);
    place(s, "knight", "enemy", 240, 560); // a real attacker (18 dmg)
    zerk.hp = 5; // the knight's next hit would kill it

    for (let i = 0; i < 6; i++) stepSimulation(s);

    expect(zerk.lastStandUsed).toBe(true);
    expect(zerk.state).not.toBe("dead");
    expect(zerk.hp).toBe(1);
    expect(zerk.effects.some((e) => e.type === "death_immune")).toBe(true);
  });
});

describe("Berserker — Bloodthirst", () => {
  it("restores 5% of max HP when it lands a killing blow", () => {
    const s = battleState(2);
    const zerk = place(s, "berserker", "player", 240, 600);
    const prey = makeDummy(place(s, "skeleton", "enemy", 240, 575));
    prey.hp = 10; // killable in one hit
    prey.maxHp = 10;
    zerk.hp = 100; // headroom below maxHp 160 so the heal isn't capped

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(prey.state).toBe("dead");
    expect(zerk.hp).toBe(108); // 100 + 5% of 160
  });
});
