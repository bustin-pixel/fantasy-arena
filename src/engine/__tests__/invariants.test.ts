// Core engine invariants — the contract the deterministic simulation must always
// uphold. Re-run after ANY combat change.
import { describe, it, expect } from "vitest";
import { DECKABLE_UNIT_IDS } from "@/data/units";
import { runMatch, digest } from "./helpers";

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
