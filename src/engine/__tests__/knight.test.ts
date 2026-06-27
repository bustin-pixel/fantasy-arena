// Knight: Taunting Roar grants an absorb shield that scales with how many foes
// it pulls. Pins the tuned numbers (45 + 10/foe) so the engine stays in sync
// with the amount shown in the ability description.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Knight — Taunting Roar shield", () => {
  it("absorbs 45 + 10 per foe taunted", () => {
    const s = battleState(1);
    const knight = place(s, "knight", "player", 240, 600);
    // Two harmless foes inside the 200px taunt radius. Skeletons (passive filler
    // ability) so nothing damages the knight — an Ogre would Crushing-Slam it for
    // a hardcoded 25 and eat the shield we're trying to read.
    makeDummy(place(s, "skeleton", "enemy", 240, 500)); // ~100px
    makeDummy(place(s, "skeleton", "enemy", 300, 560)); // ~72px

    for (let i = 0; i < 4; i++) stepSimulation(s); // Roar fires ~tick 1

    expect(knight.shieldHp).toBe(65); // 45 + 2 × 10
  });
});
