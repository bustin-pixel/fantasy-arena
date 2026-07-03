// Trickster behavior: an epic anti-caster disruptor with two mechanics —
//   1. Cloak: deploys stealthed and re-cloaks a beat after it stops acting.
//   2. Shadow Step: when an enemy begins a cast, it blinks to them and kicks,
//      interrupting the cast (a short stun that the cast-fizzle rule cancels).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { MatchController } from "@/engine/MatchController";
import { isStealthed } from "@/engine/StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { battleState, place, makeDummy } from "./helpers";

describe("Trickster — Cloak (stealth)", () => {
  it("deploys stealthed", () => {
    const mc = new MatchController(11, ["trickster"], ["knight"]);
    const t = mc.deploy("player", "trickster", { x: 240, y: 600 });
    expect(t).not.toBeNull();
    expect(isStealthed(t!)).toBe(true);
  });

  it("re-cloaks a beat after it stops acting", () => {
    const s = battleState(1);
    const t = place(s, "trickster", "player", 240, 700);
    makeDummy(place(s, "skeleton", "enemy", 240, 60)); // far away — never reached/struck
    t.recloakTimer = secToTicks(1.5); // as if it just acted
    expect(isStealthed(t)).toBe(false);

    for (let i = 0; i < 35; i++) stepSimulation(s); // > 1.5s and it never strikes
    expect(isStealthed(t)).toBe(true); // melted back into stealth
  });
});

describe("Trickster — Shadow Step (cast interrupt)", () => {
  it("blinks to a casting enemy and interrupts the cast", () => {
    const s = battleState(2);
    const trick = place(s, "trickster", "player", 100, 600);
    const mage = place(s, "fire_mage", "enemy", 300, 300); // ~360px away, within reach
    makeDummy(place(s, "skeleton", "player", 300, 380)); // gives the mage a target in range

    let sawCast = false;
    let teleported = false;
    let interrupted = false;
    let prev = { x: trick.pos.x, y: trick.pos.y };

    for (let i = 0; i < 20; i++) {
      stepSimulation(s);
      if (mage.castTicks > 0) sawCast = true;
      const jump = Math.hypot(trick.pos.x - prev.x, trick.pos.y - prev.y);
      if (jump > 100) teleported = true; // a blink, not a walk
      if (sawCast && mage.effects.some((e) => e.type === "stun")) interrupted = true;
      prev = { x: trick.pos.x, y: trick.pos.y };
    }

    expect(sawCast).toBe(true); // the mage did begin a cast
    expect(teleported).toBe(true); // the Trickster shadow-stepped to it
    expect(interrupted).toBe(true); // and the kick's stun interrupted the cast
  });
});

describe("Trickster — reveal on strike (onBeforeAttack)", () => {
  it("starts the re-cloak timer when it swings at a foe", () => {
    const s = battleState(3);
    const trick = place(s, "trickster", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 585)); // adjacent → it swings
    expect(trick.recloakTimer).toBe(0);

    for (let i = 0; i < 20 && trick.recloakTimer === 0; i++) stepSimulation(s);

    expect(trick.recloakTimer).toBeGreaterThan(0); // onBeforeAttack fired on its strike
  });
});
