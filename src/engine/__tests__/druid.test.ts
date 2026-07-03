// Druid additions: Rejuvenation (instant HoT on the most-wounded nearby ally),
// faster wolf summons, and a reworked Bear Form (80% damage reduction for only
// 5s, still summons/rejuvenates, and +50% healing received).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Druid — Rejuvenation (HoT)", () => {
  it("lays a regen on a wounded ally that heals over time", () => {
    const s = battleState(1);
    place(s, "summoner", "player", 240, 600);
    const ally = makeDummy(place(s, "skeleton", "player", 240, 500)); // wounded, in range
    ally.maxHp = 45;
    ally.hp = 20;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // gives the Druid a target

    for (let i = 0; i < 5; i++) stepSimulation(s);
    expect(ally.effects.some((e) => e.type === "regen")).toBe(true);

    const hp = ally.hp;
    for (let i = 0; i < 45; i++) stepSimulation(s); // past one 2s HoT tick
    expect(ally.hp).toBeGreaterThan(hp);
  });
});

describe("Druid — Bear Form", () => {
  it("takes 80% reduced damage for 5s, then reverts, and still summons", () => {
    const s = battleState(2);
    const druid = place(s, "summoner", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 560)); // a harmless target
    druid.hp = 39; // 30% of 130 → transforms to bear

    stepSimulation(s);
    expect(druid.transformed).toBe(true);
    expect(druid.damageTakenMult).toBeCloseTo(0.2);

    for (let i = 0; i < 105; i++) stepSimulation(s); // past the 5s guard
    expect(druid.damageTakenMult).toBe(1); // reverted to normal toughness
    expect(
      s.units.some((u) => u.defId === "wolf" && u.team === "player")
    ).toBe(true); // it kept summoning as a bear
  });

  it("receives 50% more healing while a bear", () => {
    const s = battleState(3);
    const druid = place(s, "summoner", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 560));
    druid.transformed = true; // already a bear
    druid.hp = 50; // wounded, with headroom
    druid.rejuvCooldown = 9999; // suppress auto-Rejuvenation for a clean read
    druid.effects.push({
      type: "regen",
      ticksLeft: 200,
      healPerTick: 6,
      tickInterval: 40,
      tickCountdown: 40,
      source: druid.uid,
    });

    for (let i = 0; i < 45; i++) stepSimulation(s); // one 2s HoT tick
    expect(druid.hp).toBe(59); // 50 + 6 × 1.5 (bear bonus)
  });

  it("attacks in melee, not with a projectile", () => {
    const s = battleState(4);
    const druid = place(s, "summoner", "player", 240, 600);
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 575)); // adjacent
    druid.transformed = true;
    druid.range = 48; // bear range (as transformDruid sets)
    druid.rejuvCooldown = 9999; // isolate the basic attack
    druid.abilityCooldown = 9999;
    const before = foe.hp;

    let firedProjectile = false;
    for (let i = 0; i < 10; i++) {
      stepSimulation(s);
      if (s.projectiles.some((p) => p.sourceUid === druid.uid)) firedProjectile = true;
    }

    expect(foe.hp).toBeLessThan(before); // it hit something
    expect(firedProjectile).toBe(false); // …in melee, no projectile
  });
});

describe("Druid — Summon Wolves", () => {
  it("summons a spirit wolf on its own team from caster form", () => {
    const s = battleState(5);
    place(s, "summoner", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 300)); // a target to commit to

    // abilityCooldown starts at 0, so the 0.5s summon cast begins at once and
    // fires well within 30 ticks; the Druid is at full HP (caster, not bear).
    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(
      s.units.some((u) => u.defId === "wolf" && u.team === "player")
    ).toBe(true);
  });
});
