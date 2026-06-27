// Engineer: the Deploy Turret active (builds a stationary ranged construct on a
// 9s cooldown) and the Field Repairs passive (every 2s it heals itself and
// nearby turrets).
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";

const turretCount = (s: SimState) =>
  s.units.filter((u) => u.defId === "turret" && u.state !== "dead").length;

describe("Engineer", () => {
  it("Deploy Turret builds a stationary turret beside it", () => {
    const s = battleState(1);
    const eng = place(s, "engineer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 420)); // a target so it engages

    for (let i = 0; i < 4; i++) stepSimulation(s); // Deploy fires ~tick 1

    const turret = s.units.find((u) => u.defId === "turret" && u.team === "player");
    expect(turret).toBeTruthy();
    expect(turret!.moveSpeed).toBe(0); // stationary emplacement
    expect(
      Math.hypot(turret!.pos.x - eng.pos.x, turret!.pos.y - eng.pos.y)
    ).toBeLessThan(70); // built right beside the engineer
  });

  it("Field Repairs heals itself and nearby turrets over time", () => {
    const s = battleState(2);
    const eng = place(s, "engineer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 420));

    for (let i = 0; i < 4; i++) stepSimulation(s);
    const turret = s.units.find((u) => u.defId === "turret" && u.team === "player")!;
    eng.hp = eng.maxHp - 40;
    turret.hp = turret.maxHp - 30;

    for (let i = 0; i < 60; i++) stepSimulation(s); // ~3s — at least one repair tick

    expect(eng.hp).toBeGreaterThan(eng.maxHp - 40); // self-repaired
    expect(turret.hp).toBeGreaterThan(turret.maxHp - 30); // turret repaired
  });

  it("respects the 9s Deploy cooldown (one turret per cooldown)", () => {
    const s = battleState(3);
    place(s, "engineer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 420));

    for (let i = 0; i < 150; i++) stepSimulation(s); // ~7.5s < 9s
    expect(turretCount(s)).toBe(1);
    for (let i = 0; i < 60; i++) stepSimulation(s); // past 9s
    expect(turretCount(s)).toBe(2);
  });
});
