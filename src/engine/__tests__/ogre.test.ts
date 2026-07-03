// Ogre behavior (kits/ogre.ts): Second Wind — the first blow that brings it to
// or below 25% HP (a lethal one included) surges it back to full, once per match.
// The trigger spans a non-lethal crossing (onDamaged) and a killing blow
// (onWouldDie); this exercises the whole thing end-to-end.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place } from "./helpers";

describe("Ogre — Second Wind", () => {
  it("surges back to full on the blow that would break it, then only once", () => {
    const s = battleState(7);
    const ogre = place(s, "ogre", "player", 240, 560);
    ogre.hp = 30; // already under 25% of 200 — the next hit triggers Second Wind
    const atk = place(s, "archer", "enemy", 240, 460); // ranged; chips then kills
    atk.hp = atk.maxHp = 100000; // survives the ogre so it keeps firing

    let surged = false;
    for (let i = 0; i < 400 && ogre.state !== "dead"; i++) {
      stepSimulation(s);
      if (ogre.secondWindUsed && ogre.hp >= ogre.maxHp * 0.9) surged = true;
    }

    expect(ogre.secondWindUsed).toBe(true); // it triggered
    expect(surged).toBe(true); // and brought the ogre back to (near) full
    // Second Wind is once-per-match: with it spent, sustained fire eventually fells it.
    expect(ogre.state).toBe("dead");
  });
});
