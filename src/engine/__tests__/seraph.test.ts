// Seraph — the legendary raid healer with three layered supports: Divine Light
// (a 1.5s cast that pours 100 HP into the most-wounded ally in range), Sanctuary
// (an instant team-wide +55 absorb bubble, capped 150/ally) and Renewal (an
// instant team-wide heal-over-time). Each test isolates the mechanic under test
// by parking the other two on a long cooldown.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Seraph — Divine Light (big cast heal)", () => {
  it("pours 100 HP into a wounded ally in range on cast completion", () => {
    const s = battleState(1);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999; // isolate the cast heal from the two instants
    seraph.renewalCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560)); // wounded, in range
    ally.maxHp = 200;
    ally.hp = 50;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // gives the Seraph a target

    // 1.5s cast (30 ticks) + a begin tick; 6s cooldown ⇒ fires exactly once.
    for (let i = 0; i < 34; i++) stepSimulation(s);

    expect(ally.hp).toBe(150); // 50 + 100, exactly (no other healing)
  });

  it("never over-heals past maxHp", () => {
    const s = battleState(2);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    seraph.renewalCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560));
    ally.maxHp = 100;
    ally.hp = 80; // only 20 missing
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 34; i++) stepSimulation(s);

    expect(ally.hp).toBe(100); // clamped, not 180
  });
});

describe("Seraph — Sanctuary (team-wide bubble)", () => {
  it("bubbles the whole team with a +55 absorb, self included", () => {
    const s = battleState(3);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.abilityCooldown = 9999; // block Divine Light
    seraph.renewalCooldown = 9999; // block Renewal
    // Full-HP ally so nobody is "wounded" — only Sanctuary should fire.
    const ally = makeDummy(place(s, "skeleton", "player", 340, 560));
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // target

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(ally.shieldHp).toBe(55);
    expect(seraph.shieldHp).toBe(55); // it shields itself too
  });

  it("stacks on an existing shield but caps at 150 per ally", () => {
    const s = battleState(4);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.abilityCooldown = 9999;
    seraph.renewalCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 340, 560));
    ally.shieldHp = 120; // pretend a Knight's Taunt already bubbled it
    ally.shieldHpMax = 120;
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(ally.shieldHp).toBe(150); // 120 + 55 clamped to the cap, not 175
  });
});

describe("Seraph — Renewal (team-wide HoT)", () => {
  it("lays a regen on the team when someone is hurt, and it heals over time", () => {
    const s = battleState(5);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.abilityCooldown = 9999; // isolate the HoT from Divine Light
    seraph.sanctuaryCooldown = 9999; // and from Sanctuary
    const ally = makeDummy(place(s, "skeleton", "player", 340, 560)); // wounded
    ally.maxHp = 100;
    ally.hp = 40;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // target

    for (let i = 0; i < 5; i++) stepSimulation(s);
    expect(ally.effects.some((e) => e.type === "regen")).toBe(true);

    const hp = ally.hp;
    for (let i = 0; i < 25; i++) stepSimulation(s); // past one 1s HoT tick
    expect(ally.hp).toBeGreaterThan(hp);
  });
});
