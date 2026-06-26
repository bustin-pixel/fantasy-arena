// Arcane Mage behavior: the ramping Arcane Barrage (fire-rate ramp, volatile
// splash, self-damage) and the defensive Blink. Each mechanic is exercised in
// isolation with a controlled, stationary, harmless dummy so the assertion
// targets exactly one thing.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { getUnitDef } from "@/data/units";
import { battleState, place, makeDummy } from "./helpers";

describe("Arcane Mage — Arcane Barrage (Instability ramp)", () => {
  it("builds Instability and shortens the attack interval below base", () => {
    const s = battleState(1);
    const mage = place(s, "arcane_mage", "player", 240, 600);
    // Stationary dummy ~150px away: in firing range, but far enough not to trigger
    // kiting (comfort = range*0.7 ≈ 110px) or Blink — so the mage parks and ramps.
    makeDummy(place(s, "ogre", "enemy", 240, 450));
    const baseAtk = getUnitDef("arcane_mage").attackSpeed;

    for (let i = 0; i < 160; i++) stepSimulation(s);

    expect(mage.instability).toBeGreaterThanOrEqual(5); // near max (6)
    expect(mage.attackSpeed).toBeLessThan(baseAtk);
  });

  it("self-damages once Instability is volatile, but only mildly", () => {
    const s = battleState(2);
    const mage = place(s, "arcane_mage", "player", 240, 600);
    // Harmless dummy: any HP the mage loses is its own Instability backlash.
    makeDummy(place(s, "ogre", "enemy", 240, 450));

    for (let i = 0; i < 160; i++) stepSimulation(s);

    expect(mage.instability).toBeGreaterThanOrEqual(3); // past the volatile threshold
    expect(mage.hp).toBeLessThan(mage.maxHp); // took self-damage
    expect(mage.state).not.toBe("dead"); // self-damage is minor
  });

  it("volatile missiles splash to a clustered foe that is never targeted", () => {
    const s = battleState(3);
    const mage = place(s, "arcane_mage", "player", 240, 600);
    mage.instability = 6; // pre-charge so every missile is volatile from shot one
    // Two stationary ogres (no shield ability) clustered within splash radius. The
    // mage locks the lower-uid one; the other can only be hurt by splash.
    const a = makeDummy(place(s, "ogre", "enemy", 235, 450));
    const b = makeDummy(place(s, "ogre", "enemy", 285, 450));

    let bEverTargeted = false;
    let bHurtWhileUntargeted = false;
    for (let i = 0; i < 40; i++) {
      stepSimulation(s);
      if (mage.targetUid === b.uid) bEverTargeted = true;
      if (!bEverTargeted && b.hp < b.maxHp) bHurtWhileUntargeted = true;
    }

    expect(bHurtWhileUntargeted).toBe(true); // damage reached b purely via splash
    expect(a.hp).toBeLessThan(a.maxHp); // primary foe took direct hits too
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
