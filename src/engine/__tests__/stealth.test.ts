// Stealth: a stealthed unit is invisible to enemies — untargetable (already via
// TargetingSystem) AND ignored by every reactive behavior (ranged kiting, the
// Archer's Kiting Leap, the Arcane Mage's Blink, Taunt, Fear). Enemies must not
// react to a unit they can't see.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

function stealth(u: Unit): Unit {
  u.effects.push({ type: "stealth", ticksLeft: 1000, source: u.uid });
  return u;
}

describe("Stealth — enemies don't react to what they can't see", () => {
  it("a ranged unit doesn't flee from a stealthed enemy on top of it", () => {
    const s = battleState(1);
    const archer = place(s, "archer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 420)); // visible target, beyond kite range
    stealth(makeDummy(place(s, "skeleton", "enemy", 240, 665))); // invisible, right on top
    const startY = archer.pos.y;

    for (let i = 0; i < 12; i++) stepSimulation(s);

    // Without the fix it would kite / Kiting-Leap upward away from the unseen foe.
    expect(Math.abs(archer.pos.y - startY)).toBeLessThan(15);
  });

  it("the Arcane Mage doesn't Blink from a stealthed melee enemy", () => {
    const s = battleState(2);
    const mage = place(s, "arcane_mage", "player", 240, 400);
    stealth(place(s, "knight", "enemy", 240, 455)); // 55px, inside Blink threat range
    const before = { x: mage.pos.x, y: mage.pos.y };

    stepSimulation(s);

    const moved = Math.hypot(mage.pos.x - before.x, mage.pos.y - before.y);
    expect(moved).toBeLessThan(20); // did not teleport away
    expect(mage.blinkCooldown).toBe(0); // Blink never triggered
  });

  it("Taunting Roar taunts only visible foes, not stealthed ones", () => {
    const s = battleState(3);
    const knight = place(s, "knight", "player", 240, 600);
    const visible = makeDummy(place(s, "skeleton", "enemy", 280, 580));
    const sneak = stealth(makeDummy(place(s, "skeleton", "enemy", 240, 560)));

    for (let i = 0; i < 4; i++) stepSimulation(s); // Roar fires ~tick 1

    expect(knight.shieldHp).toBe(55); // 45 + 1 taunted × 10 (the stealthed one didn't count)
    expect(visible.effects.some((e) => e.type === "taunt")).toBe(true);
    expect(sneak.effects.some((e) => e.type === "taunt")).toBe(false);
  });
});
