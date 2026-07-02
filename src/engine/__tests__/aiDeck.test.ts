// AIDeck — budgeted enemy generation: every deck lands in the 5–7 power band
// (rare 1 / epic 2 / legendary 4), obeys the deck rules, and never fields the
// Druid (priced out as the intentional balance outlier).
import { describe, it, expect } from "vitest";
import { generateEnemyDeck, unitCost } from "@/engine/AIDeck";
import { getUnitDef } from "@/data/units";

describe("AIDeck — budgeted enemy decks", () => {
  it("stays in the 5–7 budget band with valid composition (500 seeds)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const deck = generateEnemyDeck(seed);
      expect(deck).toHaveLength(4);
      expect(new Set(deck).size).toBe(4); // no duplicates
      const legendaries = deck.filter(
        (id) => getUnitDef(id).rarity === "legendary"
      );
      expect(legendaries.length).toBeLessThanOrEqual(1);
      const total = deck.reduce((s, id) => s + unitCost(id), 0);
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(7);
      expect(deck).not.toContain("summoner"); // Druid priced out
    }
  });

  it("a legendary only ever arrives escorted by three rares", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const deck = generateEnemyDeck(seed);
      if (!deck.some((id) => getUnitDef(id).rarity === "legendary")) continue;
      const rares = deck.filter((id) => getUnitDef(id).rarity === "rare");
      expect(rares).toHaveLength(3); // 4 + 1 + 1 + 1 = budget 7
    }
  });

  it("is deterministic in the seed, and varies across seeds", () => {
    expect(generateEnemyDeck(42)).toEqual(generateEnemyDeck(42));
    const distinct = new Set(
      Array.from({ length: 50 }, (_, i) => generateEnemyDeck(i + 1).join(","))
    );
    expect(distinct.size).toBeGreaterThan(10);
  });

  it("honors an explicit budget (progression hook)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const deck = generateEnemyDeck(seed, 4, 8);
      const total = deck.reduce((s, id) => s + unitCost(id), 0);
      expect(total).toBe(8);
    }
  });
});
