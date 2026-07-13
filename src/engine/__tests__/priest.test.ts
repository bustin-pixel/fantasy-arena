// Priest — an epic backline healer with two layering heals: Flash Heal (a 1s
// cast that restores 22 HP to the most-wounded ally in range) and Renew (an
// instant heal-over-time, 5 HP/s for 6s). Each test suppresses the OTHER heal
// (via its cooldown field) so the measured heal is clean.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Priest — Flash Heal (burst)", () => {
  it("restores 22 HP to a wounded ally in range on cast completion", () => {
    const s = battleState(1);
    const priest = place(s, "priest", "player", 240, 600);
    priest.renewCooldown = 9999; // isolate Flash Heal from the HoT
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560)); // wounded, in range
    ally.maxHp = 100;
    ally.hp = 50;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // gives the Priest a target

    // 1s cast (20 ticks) + a tick or two of begin-cast; 3s cooldown ⇒ fires once.
    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(ally.hp).toBe(72); // 50 + 22, exactly (no other healing)
  });

  it("never over-heals past maxHp", () => {
    const s = battleState(2);
    const priest = place(s, "priest", "player", 240, 600);
    priest.renewCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560));
    ally.maxHp = 100;
    ally.hp = 90; // only 10 missing
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(ally.hp).toBe(100); // clamped, not 112
  });
});

describe("Priest — Renew (HoT)", () => {
  it("lays a regen on a wounded ally that heals over time", () => {
    const s = battleState(3);
    const priest = place(s, "priest", "player", 240, 600);
    priest.abilityCooldown = 9999; // isolate Renew from Flash Heal
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560)); // wounded, in range
    ally.maxHp = 100;
    ally.hp = 40;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // gives the Priest a target

    for (let i = 0; i < 5; i++) stepSimulation(s);
    expect(ally.effects.some((e) => e.type === "regen")).toBe(true);

    const hp = ally.hp;
    for (let i = 0; i < 25; i++) stepSimulation(s); // past one 1s HoT tick
    expect(ally.hp).toBeGreaterThan(hp);
  });
});
