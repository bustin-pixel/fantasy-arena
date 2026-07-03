// Ice Mage — Frostbite: every 2nd basic shot carries a Freeze (2s stun) rider
// (pure UnitDef data via basicShotRider → proj.rider, not code). Plus Frost Blast:
// a 0.8s cast that hurls a damaging + slowing projectile.
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

// The on-hit effectType of each basic shot the mage fires, in order (null = plain).
function riderTypes(s: SimState, mage: Unit, want: number): (string | null)[] {
  const out: (string | null)[] = [];
  let prev = mage.attackCount;
  for (let i = 0; i < 400 && out.length < want; i++) {
    const before = new Set(s.projectiles.map((p) => p.id));
    stepSimulation(s);
    if (mage.attackCount > prev) {
      prev = mage.attackCount;
      const shot = s.projectiles.find(
        (p) =>
          !before.has(p.id) &&
          p.sourceUid === mage.uid &&
          p.ability === "lifesteal" // sentinel for a basic shot (not a cast)
      );
      out.push(shot?.rider?.effectType ?? null);
    }
  }
  return out;
}

describe("Ice Mage — Frostbite rider + Frost Blast", () => {
  it("carries a Freeze (stun) rider on every second basic shot", () => {
    const s = battleState(1);
    const mage = place(s, "ice_mage", "player", 240, 400);
    mage.moveSpeed = 0;
    mage.attackSpeed = 0.2; // rapid basics
    mage.abilityCooldown = 99999; // suppress Frost Blast to isolate the basic shots
    makeDummy(place(s, "skeleton", "enemy", 240, 280)); // in range, stationary

    expect(riderTypes(s, mage, 4)).toEqual([null, "stun", null, "stun"]);
  });

  it("casts Frost Blast — a projectile — on cooldown", () => {
    const s = battleState(2);
    const mage = place(s, "ice_mage", "player", 240, 400);
    mage.moveSpeed = 0;
    makeDummy(place(s, "skeleton", "enemy", 240, 280));

    let saw = false;
    for (let i = 0; i < 60 && !saw; i++) {
      stepSimulation(s);
      saw = s.projectiles.some(
        (p) => p.ability === "frost_blast" && p.sourceUid === mage.uid
      );
    }
    expect(saw).toBe(true);
  });
});
