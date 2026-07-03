// Boar — Guard-charge: when its Hunter is attacked, the Boar rushes that attacker
// (the same dash as the Orc's Charge) and TAUNTS it onto itself on contact,
// pulling it off the Hunter even from across the field. The kit arms the rush
// (onTick) and defines the contact effect (onChargeContact); stepCharge drives it.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Boar — Guard-charge", () => {
  it("charges the Hunter's attacker and taunts it off the Hunter", () => {
    const s = battleState(1);
    const hunter = place(s, "hunter", "player", 240, 620);
    hunter.moveSpeed = 0;
    // Place the guard boar ourselves — its presence also stops the Hunter from
    // auto-summoning a second one, so there's exactly one boar in the test.
    const boar = place(s, "boar", "player", 240, 560);
    const attacker = makeDummy(place(s, "skeleton", "enemy", 240, 300)); // far off
    // Pretend the Hunter was just struck by that attacker.
    hunter.attackedByUid = attacker.uid;

    let guard = 0;
    while (attacker.tauntedByUid !== boar.uid && guard++ < 150) stepSimulation(s);

    expect(attacker.tauntedByUid).toBe(boar.uid); // the boar reached + taunted it
    expect(attacker.effects.some((e) => e.type === "taunt")).toBe(true);
    expect(attacker.targetUid).toBe(boar.uid); // pulled onto the boar, off the Hunter
  });
});
