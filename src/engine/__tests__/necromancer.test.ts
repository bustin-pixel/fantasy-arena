// The reworked Necromancer: Raise Dead is now a passive that summons a skeleton
// every 3s; Terrify and Curse are two active casts (Curse, a heavy DoT, fires on
// its long cooldown, otherwise Terrify). Each is exercised in isolation.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { applyEffect, makeEffect } from "@/engine/StatusEffectSystem";
import { battleState, place, makeDummy } from "./helpers";

const playerSkeletons = (s: ReturnType<typeof battleState>) =>
  s.units.filter((u) => u.defId === "skeleton" && u.team === "player").length;

describe("Necromancer — Raise Dead (passive summon)", () => {
  it("continuously raises skeletons over time", () => {
    const s = battleState(1);
    place(s, "necromancer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 80)); // far, unkillable target
    expect(playerSkeletons(s)).toBe(0);

    for (let i = 0; i < 230; i++) stepSimulation(s); // ~11.5s → two 5s ticks
    expect(playerSkeletons(s)).toBeGreaterThanOrEqual(2);
  });

  it("raises nothing while stunned (stun now answers the summon pressure)", () => {
    const s = battleState(5);
    const necro = place(s, "necromancer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 80)); // far, unkillable target
    // Hold it stunned across the raise-ticks it would otherwise hit.
    applyEffect(necro, makeEffect("stun", { source: "x", durationSec: 20 }));

    for (let i = 0; i < 230; i++) stepSimulation(s); // ~11.5s — two 5s raise-ticks
    expect(playerSkeletons(s)).toBe(0); // every raise suppressed by the stun
  });
});

describe("Necromancer — Curse (DoT cast)", () => {
  it("afflicts its target with a curse that deals damage over time", () => {
    const s = battleState(2);
    place(s, "necromancer", "player", 240, 600);
    const victim = makeDummy(place(s, "skeleton", "enemy", 240, 480)); // in range

    for (let i = 0; i < 40; i++) stepSimulation(s); // past the 1.5s curse cast
    expect(victim.effects.some((e) => e.type === "curse")).toBe(true);

    const hp = victim.hp;
    for (let i = 0; i < 25; i++) stepSimulation(s); // > one curse tick
    expect(victim.hp).toBeLessThan(hp); // the curse keeps ticking
  });
});

describe("Necromancer — Terrify (fear cast)", () => {
  it("terrifies nearby enemies when Curse is on cooldown", () => {
    const s = battleState(3);
    const necro = place(s, "necromancer", "player", 240, 600);
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 480)); // within fear reach
    necro.curseCooldown = 9999; // force it to choose Terrify, not Curse

    for (let i = 0; i < 30; i++) stepSimulation(s); // past the 1.2s terrify cast
    expect(foe.effects.some((e) => e.type === "fear")).toBe(true);
  });
});
