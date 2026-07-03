// Orc — Charge: when its target is out of melee reach, the Orc commits to a fast
// dash (not a teleport) and SLAMS on contact for bonus damage + a brief stun. The
// kit arms the rush (fireAbility); the engine's stepCharge drives it; the kit's
// onChargeContact resolves the slam.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Orc — Charge", () => {
  it("rushes a distant target and slams it (damage + stun) on contact", () => {
    const s = battleState(1);
    const orc = place(s, "orc", "player", 240, 600);
    const foe = makeDummy(place(s, "skeleton", "enemy", 240, 300)); // ~300px away
    const startY = orc.pos.y;
    const startHp = foe.hp;

    // Run until the rush connects (the foe first takes damage).
    let guard = 0;
    while (foe.hp === startHp && guard++ < 120) stepSimulation(s);

    expect(orc.pos.y).toBeLessThan(startY - 100); // it dashed a long way in
    expect(foe.hp).toBeLessThan(startHp); // slammed for bonus damage
    expect(foe.effects.some((e) => e.type === "stun")).toBe(true); // + a stagger
  });
});
