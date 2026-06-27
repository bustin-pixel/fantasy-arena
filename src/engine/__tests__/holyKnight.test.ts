// Holy Knight: the Blessing active — a frontline support pulse that grants an
// absorb shield + small heal to itself and nearby allies, stacking on top of any
// existing shield up to a per-unit cap, on an 8s cooldown.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Holy Knight — Blessing", () => {
  it("shields and heals nearby allies (and itself)", () => {
    const s = battleState(1);
    const holy = place(s, "holy_knight", "player", 240, 600);
    const ally = place(s, "archer", "player", 290, 600); // within Blessing radius
    ally.hp = ally.maxHp - 30; // wounded, so the heal is visible
    makeDummy(place(s, "ogre", "enemy", 240, 480)); // a target so it engages (deals 0)

    for (let i = 0; i < 6; i++) stepSimulation(s); // first Blessing fires ~tick 1

    expect(ally.shieldHp).toBe(40); // ally shielded
    expect(ally.hp).toBe(ally.maxHp - 15); // ally healed +15
    expect(holy.shieldHp).toBe(40); // self also shielded
  });

  it("stacks onto an existing shield, capped at 150 per unit", () => {
    const s = battleState(2);
    place(s, "holy_knight", "player", 240, 600);
    const ally = makeDummy(place(s, "archer", "player", 260, 605));
    ally.shieldHp = 60; // pretend a Knight's Taunt already bubbled it
    ally.shieldHpMax = 60;
    makeDummy(place(s, "ogre", "enemy", 240, 520)); // harmless target

    let peak = 0;
    for (let i = 0; i < 360; i++) {
      stepSimulation(s); // ~3 Blessings over 8s cadence: 60 -> 100 -> 140 -> 150
      peak = Math.max(peak, ally.shieldHp);
    }

    expect(ally.shieldHp).toBe(150); // stacked up to the cap
    expect(peak).toBeLessThanOrEqual(150); // never overshoots it
  });

  it("respects the 8s cooldown", () => {
    const s = battleState(3);
    place(s, "holy_knight", "player", 240, 600);
    const ally = makeDummy(place(s, "archer", "player", 260, 605)); // shieldHp starts 0
    makeDummy(place(s, "ogre", "enemy", 240, 520));

    for (let i = 0; i < 150; i++) stepSimulation(s); // ~7.5s — one Blessing only
    expect(ally.shieldHp).toBe(40);

    for (let i = 0; i < 30; i++) stepSimulation(s); // past 8s — a second Blessing
    expect(ally.shieldHp).toBe(80);
  });
});
