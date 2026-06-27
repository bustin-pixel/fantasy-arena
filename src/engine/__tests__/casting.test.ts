// Generalized spell casts: the mages' active abilities now wind up a cast (a
// cast bar) before the effect fires, and a stun/fear mid-cast interrupts it.
// Fire Mage stands in for the lot (Fireball / Frost Blast / Arcane Barrage all
// share the mechanism; the Electric Mage has its own dedicated spec).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

function stun(u: Unit): void {
  u.effects.push({ type: "stun", ticksLeft: 200, source: u.uid });
}
const fireballIds = (s: ReturnType<typeof battleState>) =>
  s.projectiles.filter((p) => p.ability === "fireball").map((p) => p.id);

describe("Spell casts (cast bar)", () => {
  it("winds up a cast before the spell fires — not instant", () => {
    const s = battleState(1);
    const mage = place(s, "fire_mage", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 460)); // in range

    stepSimulation(s);
    stepSimulation(s);
    expect(mage.castTicks).toBeGreaterThan(0); // casting…
    expect(mage.castTicksMax).toBeGreaterThan(0); // …with a bar to show
    expect(fireballIds(s).length).toBe(0); // …and nothing fired yet

    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      stepSimulation(s);
      for (const id of fireballIds(s)) seen.add(id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1); // the fireball flew once the cast finished
  });

  it("a stun mid-cast interrupts the spell (fizzle)", () => {
    const s = battleState(2);
    const mage = place(s, "fire_mage", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 460));

    for (let i = 0; i < 6; i++) stepSimulation(s); // mid-cast
    expect(mage.castTicks).toBeGreaterThan(0);

    stun(mage);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      stepSimulation(s);
      for (const id of fireballIds(s)) seen.add(id);
    }

    expect(mage.castTicks).toBe(0); // cancelled
    expect(seen.size).toBe(0); // no fireball ever fired (interrupted, then stunned)
  });
});
