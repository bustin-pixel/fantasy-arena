// Assassin behavior (kits/assassin.ts): opening stealth (onSpawn), Ambush first-
// strike stun+reveal (onBeforeAttack), and Vanish death-cheat (onWouldDie). Also
// proves the onSpawn seam wired into MatchController.deploy.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { MatchController } from "@/engine/MatchController";
import { isStealthed } from "@/engine/StatusEffectSystem";
import { battleState, place, makeDummy } from "./helpers";

describe("Assassin — Ambush (opening stealth + first strike)", () => {
  it("deploys stealthed (onSpawn)", () => {
    const mc = new MatchController(9, ["assassin"], ["knight"]);
    const a = mc.deploy("player", "assassin", { x: 240, y: 600 });
    expect(a).not.toBeNull();
    expect(isStealthed(a!)).toBe(true);
  });

  it("first strike stuns the victim (3s) and reveals the assassin", () => {
    const s = battleState(10);
    const assassin = place(s, "assassin", "player", 240, 560);
    assassin.effects.push({ type: "stealth", ticksLeft: 100000, source: assassin.uid });
    const dummy = makeDummy(place(s, "skeleton", "enemy", 240, 520)); // in melee reach

    expect(assassin.ambushReady).toBe(true);
    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(assassin.ambushReady).toBe(false); // struck once
    expect(isStealthed(assassin)).toBe(false); // revealed by the strike
    expect(dummy.effects.some((e) => e.type === "stun")).toBe(true);
  });
});

describe("Assassin — Vanish (death-cheat)", () => {
  it("survives the first lethal blow at 1 HP, untargetable + death-immune", () => {
    const s = battleState(11);
    const assassin = place(s, "assassin", "player", 240, 560);
    assassin.hp = 10; // one arrow kills it → Vanish fires
    const atk = place(s, "archer", "enemy", 240, 460);
    atk.hp = atk.maxHp = 100000;

    let vanished = false;
    for (let i = 0; i < 80 && !vanished; i++) {
      stepSimulation(s);
      vanished = assassin.vanishUsed;
    }

    expect(assassin.vanishUsed).toBe(true);
    expect(assassin.hp).toBe(1);
    expect(assassin.effects.some((e) => e.type === "death_immune")).toBe(true);
    expect(assassin.effects.some((e) => e.type === "stealth")).toBe(true);
  });
});
