// Arcane Mage behavior: the active Arcane Barrage (a 3-missile volley on a 6s
// cooldown) and the defensive Blink. Each mechanic is exercised in isolation with
// a controlled, stationary, harmless dummy so the assertion targets one thing.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

/** Count the arcane-missile projectiles currently in flight. */
function arcaneInFlight(s: ReturnType<typeof battleState>): number {
  return s.projectiles.filter((p) => p.ability === "arcane_barrage").length;
}

describe("Arcane Mage — Arcane Barrage (active)", () => {
  it("fires a volley of 3 arcane missiles when it casts", () => {
    const s = battleState(1);
    const mage = place(s, "arcane_mage", "player", 240, 600);
    // One stationary dummy ~150px away: in range, doesn't trigger kiting/Blink.
    // (Ogre = no shield ability, so the volley's damage shows cleanly.)
    const dummy = makeDummy(place(s, "ogre", "enemy", 240, 450));

    let maxInFlight = 0;
    for (let i = 0; i < 14; i++) {
      stepSimulation(s);
      maxInFlight = Math.max(maxInFlight, arcaneInFlight(s));
    }

    expect(maxInFlight).toBe(3); // exactly three missiles per volley
    expect(dummy.hp).toBeLessThan(dummy.maxHp); // they connect
    expect(mage.abilityCooldown).toBeGreaterThan(0); // went on cooldown after casting
  });

  it("respects the 6s cooldown (≈ one volley per 6s, not faster)", () => {
    const s = battleState(2);
    place(s, "arcane_mage", "player", 240, 600);
    makeDummy(place(s, "ogre", "enemy", 240, 450));

    const seen = new Set<string>();
    const collect = () => {
      for (const p of s.projectiles)
        if (p.ability === "arcane_barrage") seen.add(p.id);
    };

    // First volley fires ~immediately (cooldown starts at 0).
    for (let i = 0; i < 110; i++) {
      stepSimulation(s); // 110 ticks ≈ 5.5s — still inside the first 6s window
      collect();
    }
    expect(seen.size).toBe(3); // only one volley so far

    for (let i = 0; i < 30; i++) {
      stepSimulation(s); // out to ~7s — the cooldown has elapsed once
      collect();
    }
    expect(seen.size).toBe(6); // a second volley, i.e. 3 missiles every 6s
  });

  it("spreads missiles across multiple foes (up to 3 distinct targets)", () => {
    const s = battleState(3);
    place(s, "arcane_mage", "player", 240, 600);
    // Three spread-out dummies, all in range. The first volley should tag all three.
    const a = makeDummy(place(s, "ogre", "enemy", 120, 440));
    const b = makeDummy(place(s, "ogre", "enemy", 240, 440));
    const c = makeDummy(place(s, "ogre", "enemy", 360, 440));

    for (let i = 0; i < 30; i++) stepSimulation(s);

    // Each foe took damage from a missile aimed at it (the volley spread out).
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(c.hp).toBeLessThan(c.maxHp);
  });
});

describe("Arcane Mage — Blink", () => {
  it("teleports away from an adjacent melee attacker and goes on cooldown", () => {
    const s = battleState(4);
    const mage = place(s, "arcane_mage", "player", 240, 400);
    place(s, "knight", "enemy", 240, 455); // 55px below — inside Blink threat range
    const before = { x: mage.pos.x, y: mage.pos.y };

    stepSimulation(s);

    const moved = Math.hypot(mage.pos.x - before.x, mage.pos.y - before.y);
    expect(moved).toBeGreaterThan(150);
    expect(mage.blinkCooldown).toBeGreaterThan(0);
  });
});
