// Compendium book contents — the reference the player actually reads.
//
// Exists because of a real miss: the Book of Boons built its chapters from a
// hardcoded ["common", "rare", "epic"] list, so adding the legendary and mythic
// tiers left SEVEN boons with chapter headings written but no chapter ever
// built. They were simply invisible in the book, and nothing failed to compile.
// A data-derived assertion is the only thing that catches that class of bug.
import { describe, it, expect } from "vitest";
import { buildBooks } from "../books";
import { ALL_BOON_IDS, BOONS, type BoonRarity } from "@/data/boons";
import { DEFAULT_SAVE } from "@/state/persistence";

/** Every boonId rendered anywhere in the Book of Boons. */
function boonIdsInBook(): string[] {
  const book = buildBooks(DEFAULT_SAVE).find((b) => b.id === "boons");
  expect(book, "the Book of Boons should exist").toBeTruthy();
  const ids: string[] = [];
  for (const spread of book!.spreads) {
    for (const page of [spread.left, spread.right]) {
      for (const entry of page?.entries ?? []) {
        if (entry.kind === "boon") ids.push(entry.boonId);
      }
    }
  }
  return ids;
}

describe("The Book of Boons", () => {
  it("lists EVERY boon in the game, exactly once", () => {
    const listed = boonIdsInBook();
    expect(new Set(listed).size).toBe(listed.length); // no duplicates
    for (const id of ALL_BOON_IDS) {
      expect(listed, `${id} (${BOONS[id].rarity}) is missing from the book`)
        .toContain(id);
    }
    expect(listed.length).toBe(ALL_BOON_IDS.length);
  });

  it("covers every rarity that has boons — including the deep tiers", () => {
    const listed = new Set(boonIdsInBook());
    const rarities = new Set<BoonRarity>(
      ALL_BOON_IDS.map((id) => BOONS[id].rarity)
    );
    // Guard the specific regression: the deep tiers must be represented.
    expect(rarities).toContain("legendary");
    expect(rarities).toContain("mythic");
    for (const rarity of rarities) {
      const ofRarity = ALL_BOON_IDS.filter((id) => BOONS[id].rarity === rarity);
      const shown = ofRarity.filter((id) => listed.has(id));
      expect(shown.length, `no ${rarity} boons reached the book`).toBe(
        ofRarity.length
      );
    }
  });
});
