// Hunter — a legendary ranged carry: deploys with a pet boar that guards it
// (taunts attackers off the Hunter), Mend Beast heals the boar over time, and
// every 3rd shot is an Arrow Volley that hits every enemy on the field.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { applyEffect, makeEffect } from "@/engine/StatusEffectSystem";
import { battleState, place, makeDummy } from "./helpers";

const playerBoar = (s: ReturnType<typeof battleState>) =>
  s.units.find((u) => u.defId === "boar" && u.team === "player");

describe("Hunter — Boar Companion", () => {
  it("summons a boar beside it", () => {
    const s = battleState(1);
    place(s, "hunter", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 3; i++) stepSimulation(s);
    expect(playerBoar(s)).toBeTruthy();
  });

  it("guards: the boar charges then taunts whoever attacks the Hunter", () => {
    const s = battleState(2);
    place(s, "hunter", "player", 240, 600);
    const attacker = place(s, "knight", "enemy", 240, 560); // melee, hits the Hunter

    for (let i = 0; i < 25; i++) stepSimulation(s); // boar spawns, charges, taunts
    expect(playerBoar(s)).toBeTruthy();
    expect(attacker.effects.some((e) => e.type === "taunt")).toBe(true);
    expect(attacker.tauntedByUid).toBe(playerBoar(s)!.uid);
  });
});

describe("Hunter — Mend Beast", () => {
  it("lays a heal-over-time on a wounded boar", () => {
    const s = battleState(3);
    place(s, "hunter", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // far, harmless target
    for (let i = 0; i < 3; i++) stepSimulation(s);

    const boar = playerBoar(s)!;
    boar.hp = boar.maxHp - 50; // wound it
    for (let i = 0; i < 5; i++) stepSimulation(s);
    expect(boar.effects.some((e) => e.type === "regen")).toBe(true);
  });
});

describe("Hunter — Scatter Trap", () => {
  it("stuns the first enemy that steps onto a laid trap", () => {
    const s = battleState(4);
    place(s, "hunter", "player", 240, 600);
    // A trap lands ~120px ahead of the Hunter (at y ~480); park a foe on it.
    const prey = makeDummy(place(s, "skeleton", "enemy", 240, 480));

    for (let i = 0; i < 4; i++) stepSimulation(s);
    expect(prey.effects.some((e) => e.type === "stun")).toBe(true);
  });
});

describe("Hunter — stun suppresses upkeep", () => {
  it("re-summons no boar and lays no traps while stunned", () => {
    const s = battleState(5);
    const hunter = place(s, "hunter", "player", 240, 600);
    // A foe parked where a trap would land (~120px ahead) — it should stay unstunned.
    const prey = makeDummy(place(s, "skeleton", "enemy", 240, 480));
    applyEffect(hunter, makeEffect("stun", { source: "x", durationSec: 20 }));

    for (let i = 0; i < 20; i++) stepSimulation(s);
    expect(playerBoar(s)).toBeFalsy(); // no boar re-summon while stunned
    expect(prey.effects.some((e) => e.type === "stun")).toBe(false); // no trap laid
  });
});
