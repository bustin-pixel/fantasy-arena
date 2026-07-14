// Archmage behavior: the Grand Grimoire (one random USABLE spell per cast,
// drawn deterministically from the seeded sim RNG), the Twincast jackpot
// (two distinct other spells back to back), the Mirror Image illusion (max one
// alive, timed dissolve), the Polymorph legality filter, and the shared Blink.
// Every cast announces itself with a floating label ("Fireball!" …), which the
// specs use as the spell trace — popups are deduped by id and stamped with the
// tick they FIRST appeared on.
import { describe, it, expect } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { isPolymorphed } from "@/engine/StatusEffectSystem";
import { battleState, digest, place, makeDummy } from "./helpers";

const SPELL_LABELS = [
  "Fireball!",
  "Frost Blast!",
  "Chain Lightning!",
  "Arcane Barrage!",
  "Polymorph!",
  "Mirror Image!",
  "TWINCAST!",
];

/** Step `ticks` and return every spell label the Archmage floated, in firing
 *  order, stamped with the tick each FIRST appeared on (popups linger). */
function traceSpells(
  s: SimState,
  ticks: number
): { tick: number; label: string }[] {
  const seen = new Set<string>();
  const out: { tick: number; label: string }[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSimulation(s);
    for (const f of s.floatingTexts) {
      if (!seen.has(f.id) && SPELL_LABELS.includes(f.value)) {
        seen.add(f.id);
        out.push({ tick: s.tick, label: f.value });
      }
    }
  }
  return out;
}

/** Archmage vs three sheep-able, harmless ogre dummies parked in range. */
function grimoireArena(seed: number): SimState {
  const s = battleState(seed);
  place(s, "archmage", "player", 240, 620);
  makeDummy(place(s, "ogre", "enemy", 160, 500));
  makeDummy(place(s, "ogre", "enemy", 240, 500));
  makeDummy(place(s, "ogre", "enemy", 320, 500));
  return s;
}

describe("Archmage — Grand Grimoire (random spell per cast)", () => {
  it("rolls a varied set of real spells over a long fight", () => {
    const trace = traceSpells(grimoireArena(11), 3000); // ~150s ≈ 24 casts
    expect(trace.length).toBeGreaterThan(10); // it kept casting all fight
    const distinct = new Set(trace.map((t) => t.label));
    expect(distinct.size).toBeGreaterThanOrEqual(4); // genuinely varied
    for (const t of trace) expect(SPELL_LABELS).toContain(t.label); // only known pages
  });

  it("same seed → identical spell sequence and end state (determinism)", () => {
    const runA = grimoireArena(23);
    const traceA = traceSpells(runA, 1200);
    const runB = grimoireArena(23);
    const traceB = traceSpells(runB, 1200);
    expect(traceB).toEqual(traceA);
    expect(digest(runB)).toBe(digest(runA));
  });

  it("Twincast resolves exactly two distinct OTHER spells on the same tick", () => {
    // Deterministic seed scan (the rewards-spec convention): find a run whose
    // trace contains a Twincast, then inspect the labels fired alongside it.
    for (let seed = 1; seed <= 40; seed++) {
      const trace = traceSpells(grimoireArena(seed), 3000);
      const twin = trace.find((t) => t.label === "TWINCAST!");
      if (!twin) continue;
      const subs = trace.filter(
        (t) => t.tick === twin.tick && t.label !== "TWINCAST!"
      );
      expect(subs.length).toBe(2); // two pages ripped at once
      expect(subs[0].label).not.toBe(subs[1].label); // distinct spells
      return;
    }
    throw new Error("no Twincast rolled in the seed scan — pool weighting broke?");
  });
});

describe("Archmage — Mirror Image (illusion double)", () => {
  it("keeps at most one illusion alive and dissolves it after its lifespan", () => {
    const s = grimoireArena(11);
    let spawnTick: number | null = null;
    let deathTick: number | null = null;
    for (let i = 0; i < 3000; i++) {
      stepSimulation(s);
      const living = s.units.filter(
        (u) => u.defId === "mirror_image" && u.state !== "dead"
      );
      expect(living.length).toBeLessThanOrEqual(1); // never a hall of mirrors
      if (living.length === 1 && spawnTick == null) spawnTick = s.tick;
      if (living.length === 0 && spawnTick != null && deathTick == null) {
        deathTick = s.tick;
        break;
      }
    }
    expect(spawnTick).not.toBeNull(); // the grimoire rolled an image
    expect(deathTick).not.toBeNull(); // and it dissolved…
    // …after roughly its 8s lifespan (nothing in this arena deals damage).
    expect(deathTick! - spawnTick!).toBeGreaterThan(150);
    expect(deathTick! - spawnTick!).toBeLessThanOrEqual(165);
  });
});

describe("Archmage — Polymorph legality filter", () => {
  it("never sheeps summons (an all-skeleton enemy line is never polymorphed)", () => {
    const s = battleState(5);
    place(s, "archmage", "player", 240, 620);
    // Skeletons are SUMMONED_UNIT_IDS — illegal sheep targets.
    const skels = [
      makeDummy(place(s, "skeleton", "enemy", 200, 500)),
      makeDummy(place(s, "skeleton", "enemy", 280, 500)),
    ];
    const trace = traceSpells(s, 2000);
    expect(trace.length).toBeGreaterThan(5); // the other pages still fire
    expect(trace.some((t) => t.label === "Polymorph!")).toBe(false);
    for (const sk of skels) expect(isPolymorphed(sk)).toBe(false);
  });
});

describe("Archmage — Blink (shared escape)", () => {
  it("teleports away from an adjacent melee attacker and goes on cooldown", () => {
    const s = battleState(4);
    const mage = place(s, "archmage", "player", 240, 400);
    place(s, "knight", "enemy", 240, 455); // 55px below — inside threat range
    const before = { x: mage.pos.x, y: mage.pos.y };

    stepSimulation(s);

    const moved = Math.hypot(mage.pos.x - before.x, mage.pos.y - before.y);
    expect(moved).toBeGreaterThan(150);
    expect(mage.blinkCooldown).toBe(100); // 5s × 20 ticks/s
  });
});
