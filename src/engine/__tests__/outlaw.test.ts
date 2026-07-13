// Outlaw behavior: the Slippery dodge (50% full-negate veto), the Ghost opening
// stealth, and the Killing Spree ultimate (self-charged, blinks between enemies,
// immune to damage and to crowd control for its duration). The spree/stealth
// mechanics are armed by the kit's onSpawn, which the hand-built `place` helper
// doesn't call — so those tests invoke outlawKit.onSpawn directly, as the deploy
// path does.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { outlawKit } from "@/engine/kits/outlaw";
import type { KitCtx } from "@/engine/kits/UnitKit";
import { createUnit } from "@/entities/createUnit";
import { applyEffect, isStealthed, makeEffect } from "@/engine/StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { RNG } from "@/utils/rng";
import { battleState, place, makeDummy } from "./helpers";

/** A minimal KitCtx exposing only what onWouldTakeDamage reads (a seeded RNG and
 *  the floating-text spawner) — enough to exercise the dodge/immunity veto in
 *  isolation, deterministically. */
function vetoCtx(seed: number): KitCtx {
  return { rng: new RNG(seed), spawnFloatingText: () => {} } as unknown as KitCtx;
}

describe("Outlaw — Slippery (50% dodge veto)", () => {
  it("negates roughly half of incoming hits, deterministically", () => {
    const unit = createUnit("outlaw", "player", { x: 0, y: 0 });
    const ctx = vetoCtx(12345);
    let dodged = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (outlawKit.onWouldTakeDamage!(unit, 10, unit, ctx)) dodged++;
    }
    // ~50%: a wide band so the exact seed doesn't make the spec brittle, but
    // tight enough to prove it's neither ~0% nor ~100%.
    expect(dodged).toBeGreaterThan(430);
    expect(dodged).toBeLessThan(570);
  });

  it("takes some hits and dodges others in a real fight (partial evasion)", () => {
    const s = battleState(7);
    const outlaw = makeDummy(place(s, "outlaw", "player", 240, 500)); // stands, retaliates for 0
    const skel = place(s, "skeleton", "enemy", 240, 470); // adjacent attacker
    skel.moveSpeed = 0; // holds position, keeps swinging
    const hitVal = `-${skel.damage}`; // its landed-hit floating number

    // Tally by floating-text id so decaying popups aren't double-counted. Only the
    // Outlaw dodges, and only its taken hits show `hitVal` (its own retaliation is 0).
    const dodges = new Set<string>();
    const hits = new Set<string>();
    for (let i = 0; i < 200; i++) {
      stepSimulation(s);
      for (const f of s.floatingTexts) {
        if (f.value === "Dodge!") dodges.add(f.id);
        else if (f.value === hitVal) hits.add(f.id);
      }
    }

    expect(dodges.size).toBeGreaterThan(0); // dodged some swings
    expect(hits.size).toBeGreaterThan(0); // but not all — some landed
    // A dodged hit removes nothing: HP lost is exactly the hits that connected.
    expect(outlaw.maxHp - outlaw.hp).toBe(hits.size * skel.damage);
  });
});

describe("Outlaw — Ghost (opening stealth)", () => {
  it("deploys stealthed and reveals on its first strike", () => {
    const s = battleState(3);
    const outlaw = place(s, "outlaw", "player", 240, 500);
    outlawKit.onSpawn!(outlaw); // deploy path arms stealth + the ult meter
    makeDummy(place(s, "skeleton", "enemy", 240, 475)); // a target to strike

    expect(isStealthed(outlaw)).toBe(true);

    for (let i = 0; i < 40; i++) stepSimulation(s); // long enough to land a hit
    expect(isStealthed(outlaw)).toBe(false); // first strike stripped the cloak
  });
});

describe("Outlaw — Killing Spree (ultimate)", () => {
  /** Place an Outlaw with its ult meter one tick short of full, so the next tick
   *  unleashes the spree — plus three durable dummy foes to blink between. */
  function armReadyToSpree(seed: number) {
    const s = battleState(seed);
    const outlaw = place(s, "outlaw", "player", 240, 300);
    outlawKit.onSpawn!(outlaw);
    outlaw.ultCharge = outlaw.ultChargeMax - 1; // fire on the next tick
    const foes = [
      makeDummy(place(s, "skeleton", "enemy", 120, 500)),
      makeDummy(place(s, "skeleton", "enemy", 240, 520)),
      makeDummy(place(s, "skeleton", "enemy", 360, 500)),
    ];
    return { s, outlaw, foes };
  }

  it("unleashes at full charge, then blinks around striking foes and ends after 5s", () => {
    const { s, outlaw, foes } = armReadyToSpree(11);

    stepSimulation(s); // charge tops off → spree arms and lands its first blink
    expect(outlaw.spreeTicks).toBeGreaterThan(0);

    const startPos = { x: outlaw.pos.x, y: outlaw.pos.y };
    for (let i = 0; i < 40; i++) stepSimulation(s); // ~2s into the spree
    const moved = Math.hypot(outlaw.pos.x - startPos.x, outlaw.pos.y - startPos.y);
    expect(moved).toBeGreaterThan(30); // it teleported between foes
    // Every foe has taken blink damage.
    expect(foes.every((f) => f.hp < f.maxHp)).toBe(true);

    for (let i = 0; i < 70; i++) stepSimulation(s); // past the 5s duration
    expect(outlaw.spreeTicks).toBe(0); // spree ended
    expect(outlaw.ultChargeMax).toBe(secToTicks(60)); // now on the 60s cooldown
  });

  it("is immune to damage while spreeing", () => {
    const { s, outlaw } = armReadyToSpree(12);
    stepSimulation(s); // arm the spree
    expect(outlaw.spreeTicks).toBeGreaterThan(0);

    const hpBefore = outlaw.hp;
    // A burn lands through the damage funnel every 0.5s — applied AFTER the spree
    // arms (so it isn't cleansed) and un-dodgeable by teleporting, it isolates the
    // spree's blanket damage immunity. Every tick must be voided by the veto.
    applyEffect(
      outlaw,
      makeEffect("burn", {
        source: "test",
        durationSec: 3,
        damagePerTick: 25,
        tickIntervalSec: 0.5,
      })
    );
    for (let i = 0; i < 40; i++) stepSimulation(s); // still within the 5s spree
    expect(outlaw.hp).toBe(hpBefore); // took no damage during the spree
  });

  it("is immune to crowd control while spreeing (stun can't stop it)", () => {
    const { s, outlaw, foes } = armReadyToSpree(13);
    stepSimulation(s); // arm the spree
    const foeHp = foes.map((f) => f.hp);

    applyEffect(outlaw, makeEffect("stun", { source: "test", durationSec: 3 }));
    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(outlaw.state).not.toBe("stunned"); // never parked by the stun
    // Still blinking + striking despite the stun: foes kept taking damage.
    expect(foes.some((f, i) => f.hp < foeHp[i])).toBe(true);
  });
});
