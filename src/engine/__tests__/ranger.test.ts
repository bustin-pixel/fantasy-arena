// Ranger — Multishot: every second basic attack looses three arrows at once,
// each striking a different enemy in range (up to three). Against a lone foe the
// volley finds only one mark, so it spreads damage rather than focusing it.
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

// Drive the sim and record, for each of the Ranger's attacks, how many arrows it
// spawned that tick (its attack and the projectile spawns happen in one tick).
function collectVolleys(s: SimState, ranger: Unit, ticks: number): number[] {
  const volleys: number[] = [];
  let prevAttackCount = ranger.attackCount;
  for (let i = 0; i < ticks; i++) {
    const before = new Set(s.projectiles.map((p) => p.id));
    stepSimulation(s);
    if (ranger.attackCount > prevAttackCount) {
      prevAttackCount = ranger.attackCount;
      volleys.push(
        s.projectiles.filter(
          (p) => !before.has(p.id) && p.sourceUid === ranger.uid
        ).length
      );
    }
  }
  return volleys;
}

describe("Ranger — Multishot", () => {
  it("alternates single shot / triple shot against a crowd", () => {
    const s = battleState(1);
    const ranger = place(s, "ranger", "player", 240, 500);
    ranger.moveSpeed = 0; // stand and shoot so the foes stay in range
    // Three foes clustered within the Ranger's range (160), at distinct spots.
    makeDummy(place(s, "skeleton", "enemy", 240, 380)); // ~120px
    makeDummy(place(s, "skeleton", "enemy", 200, 380)); // ~127px
    makeDummy(place(s, "skeleton", "enemy", 280, 380)); // ~127px

    const volleys = collectVolleys(s, ranger, 120);
    expect(volleys.length).toBeGreaterThanOrEqual(4);
    // 1st → 1 arrow, 2nd → 3 arrows, 3rd → 1, 4th → 3.
    expect(volleys.slice(0, 4)).toEqual([1, 3, 1, 3]);
  });

  it("wastes no arrows on a lone foe — the volley fires a single shot", () => {
    const s = battleState(2);
    const ranger = place(s, "ranger", "player", 240, 500);
    ranger.moveSpeed = 0;
    makeDummy(place(s, "skeleton", "enemy", 240, 380)); // the only enemy

    const volleys = collectVolleys(s, ranger, 120);
    expect(volleys.length).toBeGreaterThanOrEqual(4);
    // Every attack (including the multishot ones) fires just one arrow — no
    // second/third distinct target exists.
    expect(volleys.slice(0, 4)).toEqual([1, 1, 1, 1]);
  });
});
