// Aegis Knight behavior (kits/aegisKnight.ts + data-driven Warded): immunity to
// burn/slow/poison, and the magic soak that banks overhealth shield.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { applyEffect, makeEffect } from "@/engine/StatusEffectSystem";
import { battleState, place } from "./helpers";

describe("Aegis Knight — Warded (data-driven immunity)", () => {
  it("drops burn / slow / poison but not stun", () => {
    const s = battleState(12);
    const aegis = place(s, "aegis_knight", "player", 240, 560);

    applyEffect(aegis, makeEffect("burn", { source: "x", durationSec: 3, damagePerTick: 5, tickIntervalSec: 1 }));
    applyEffect(aegis, makeEffect("slow", { source: "x", durationSec: 3, magnitude: 0.5 }));
    applyEffect(aegis, makeEffect("poison", { source: "x", durationSec: 3, damagePerTick: 3, tickIntervalSec: 0.5 }));
    expect(aegis.effects.some((e) => ["burn", "slow", "poison"].includes(e.type))).toBe(false);

    applyEffect(aegis, makeEffect("stun", { source: "x", durationSec: 1 }));
    expect(aegis.effects.some((e) => e.type === "stun")).toBe(true); // not warded vs stun
  });
});

describe("Aegis Knight — magic soak", () => {
  it("soaks a magic hit into shield instead of taking full HP damage", () => {
    const s = battleState(13);
    const aegis = place(s, "aegis_knight", "player", 240, 560);
    aegis.moveSpeed = 0; // stay put so it soaks rather than closing for a Backlash
    place(s, "fire_mage", "enemy", 240, 400); // magic-school caster in range

    for (let i = 0; i < 80; i++) stepSimulation(s);

    expect(aegis.shieldHp).toBeGreaterThan(0); // banked absorbed magic
    expect(aegis.hp).toBeGreaterThan(aegis.maxHp * 0.7); // most of it was soaked
  });
});
