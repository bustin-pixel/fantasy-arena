// Core engine invariants — the contract the deterministic simulation must always
// uphold. Re-run after ANY combat change.
import { describe, it, expect } from "vitest";
import { DECKABLE_UNIT_IDS } from "@/data/units";
import { runMatch, digest, battleState, place } from "./helpers";
import { stepSimulation } from "@/engine/CombatSystem";

describe("determinism", () => {
  it("same seed + decks => byte-identical end state across two runs", () => {
    const player = ["arcane_mage", "knight", "archer", "ogre"];
    const enemy = ["orc", "ice_mage", "arcane_mage", "berserker"];
    const a = digest(runMatch(20260626, player, enemy).state);
    const b = digest(runMatch(20260626, player, enemy).state);
    expect(b).toBe(a);
  });

  it("a seeded match actually resolves to a terminal phase", () => {
    const d = digest(runMatch(20260626, ["arcane_mage", "ogre"], ["orc", "archer"]).state);
    expect(d).toMatch(/p(victory|defeat|draw)/);
  });
});

describe("no-crash: every deckable unit completes a match", () => {
  it.each(DECKABLE_UNIT_IDS)("%s resolves without throwing", (id) => {
    const mc = runMatch(0xc0ffee ^ id.length, [id, "archer"], ["knight", "orc"]);
    expect(["victory", "defeat", "draw"]).toContain(mc.phase);
  });
});

describe("no-crash: damage reflect chains terminate", () => {
  // A reflect is itself a hit, so it can fire the other side's reflect. The
  // fractional reflects (Thornmail, Squire's Plate, Runeward feedback) shrink
  // geometrically and converge, which the funnel used to assume of ALL of them —
  // but the Wildheart's Thorned Hide reflects a FLAT 6, which never shrinks.
  // Traded against any thornsFrac it ping-ponged until the call stack blew,
  // hard-crashing the run. Reachable in Endless via the Thornmail boon and in
  // the Overgrowth via a legendary Squire's Plate. MAX_DAMAGE_CHAIN caps it.
  it("a flat kit reflect traded against fractional thorns does not blow the stack", () => {
    const s = battleState(1);
    s.teamMods.player.thornsFrac = 0.2; // Thornmail / Squire's Plate
    const hero = place(s, "knight", "player", 200, 340);
    hero.maxHp = hero.hp = 100_000; // survive long enough to trade many hits
    const wild = place(s, "wildheart", "enemy", 200, 300);
    wild.maxHp = wild.hp = 100_000;
    expect(() => {
      for (let i = 0; i < 400; i++) stepSimulation(s);
    }).not.toThrow();
    // Both sides really did trade damage — the guard bounds the chain, it does
    // not disable reflects.
    expect(hero.hp).toBeLessThan(100_000);
    expect(wild.hp).toBeLessThan(100_000);
  });
});
