// Arcane Mage behavior: the active Arcane Barrage (3 missiles fired one after
// another at a single locked target, on a 6s cooldown) and the defensive Blink.
// Each mechanic is exercised in isolation with controlled, stationary, harmless
// dummies so the assertion targets one thing.
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

/** Record each Arcane Barrage missile the first time it appears: which tick it was
 *  fired on and who it targets. Lets us assert "3 missiles, one after another, same
 *  target" without depending on projectile travel time. */
function trackMissiles(
  s: SimState,
  ticks: number
): { tick: number; tgt: string; id: string }[] {
  const seen = new Map<string, { tick: number; tgt: string; id: string }>();
  for (let i = 0; i < ticks; i++) {
    stepSimulation(s);
    for (const p of s.projectiles) {
      if (p.ability === "arcane_barrage" && !seen.has(p.id)) {
        seen.set(p.id, { tick: s.tick, tgt: p.targetUid, id: p.id });
      }
    }
  }
  return [...seen.values()];
}

describe("Arcane Mage — Arcane Barrage (active)", () => {
  it("fires 3 missiles one after another at the same target", () => {
    const s = battleState(1);
    place(s, "arcane_mage", "player", 240, 600);
    const dummy = makeDummy(place(s, "ogre", "enemy", 240, 450)); // in range

    const volley = trackMissiles(s, 30); // < 6s, so just the first volley

    expect(volley.length).toBe(3); // three missiles
    expect(new Set(volley.map((m) => m.tgt)).size).toBe(1); // all at one target
    expect(volley.every((m) => m.tgt === dummy.uid)).toBe(true);
    expect(new Set(volley.map((m) => m.tick)).size).toBe(3); // fired on 3 distinct ticks (in succession)
  });

  it("focuses one target even when several foes are in range", () => {
    const s = battleState(2);
    place(s, "arcane_mage", "player", 240, 600);
    // Three foes, all within firing range (~120-145px).
    makeDummy(place(s, "ogre", "enemy", 160, 480));
    makeDummy(place(s, "ogre", "enemy", 240, 480));
    makeDummy(place(s, "ogre", "enemy", 320, 480));

    const volley = trackMissiles(s, 30);

    expect(volley.length).toBe(3);
    expect(new Set(volley.map((m) => m.tgt)).size).toBe(1); // all 3 hit the SAME foe
  });

  it("respects the 6s cooldown (≈ one volley per 6s, not faster)", () => {
    const s = battleState(3);
    place(s, "arcane_mage", "player", 240, 600);
    makeDummy(place(s, "ogre", "enemy", 240, 450));

    // Accumulate every distinct missile id across the whole run.
    const seen = new Set<string>();
    const collect = () => {
      for (const p of s.projectiles)
        if (p.ability === "arcane_barrage") seen.add(p.id);
    };

    for (let i = 0; i < 110; i++) (stepSimulation(s), collect()); // ~5.5s
    expect(seen.size).toBe(3); // only one volley so far
    for (let i = 0; i < 30; i++) (stepSimulation(s), collect()); // out to ~7s
    expect(seen.size).toBe(6); // a second volley fired — 3 missiles every 6s
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
    expect(mage.blinkCooldown).toBe(100); // 5s × 20 ticks/s
  });
});
