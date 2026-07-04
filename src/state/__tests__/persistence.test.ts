// Save migration specs — migrateSave is pure, so no localStorage/DOM needed.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAVE,
  migrateSave,
  sanitizeDeck,
  type PlayerSave,
} from "@/state/persistence";
import { DECKABLE_UNIT_IDS } from "@/data/units";
import { STARTER_UNIT_IDS } from "@/meta/economy";

/** A realistic pre-economy (v2) save, as written by the Compendium slice. */
function v2Save(): Partial<PlayerSave> {
  return {
    version: 2,
    username: "Veteran",
    deck: ["summoner", "warrior", "healer", "ranger"],
    wins: 12,
    losses: 3,
    bestiary: { bloater: { encountered: true, defeated: true } },
  };
}

describe("migrateSave", () => {
  it("null (new player) → defaults: starter units, 0 gold, floor 0", () => {
    const save = migrateSave(null);
    expect(save.version).toBe(3);
    expect(save.gold).toBe(0);
    expect(save.depths.highestClearedFloor).toBe(0);
    expect([...save.unlockedUnits].sort()).toEqual(
      [...STARTER_UNIT_IDS].sort()
    );
    expect(save.deck).toEqual(DEFAULT_SAVE.deck);
  });

  it("grandfathers a v2 save: ALL current deckable units unlocked", () => {
    const save = migrateSave(v2Save());
    expect([...save.unlockedUnits].sort()).toEqual(
      [...DECKABLE_UNIT_IDS].sort()
    );
    expect(save.gold).toBe(0);
    expect(save.depths.highestClearedFloor).toBe(0);
  });

  it("keeps a grandfathered deck untouched (sanitize is a no-op)", () => {
    const save = migrateSave(v2Save());
    expect(save.deck).toEqual(["summoner", "warrior", "healer", "ranger"]);
    expect(save.wins).toBe(12);
    expect(save.losses).toBe(3);
    expect(save.bestiary.bloater?.defeated).toBe(true);
  });

  it("passes a v3 save through, preserving economy fields", () => {
    const v3: Partial<PlayerSave> = {
      version: 3,
      username: "Delver",
      deck: ["ogre", "warrior"],
      gold: 275,
      unlockedUnits: ["ogre", "archer", "knight", "fire_mage", "warrior"],
      depths: { highestClearedFloor: 4 },
    };
    const save = migrateSave(v3);
    expect(save.gold).toBe(275);
    expect(save.depths.highestClearedFloor).toBe(4);
    expect(save.deck).toEqual(["ogre", "warrior"]);
    expect(save.unlockedUnits).toContain("warrior");
  });

  it("strips locked units from a v3 deck and always owns the starters", () => {
    const v3: Partial<PlayerSave> = {
      version: 3,
      deck: ["ogre", "summoner"], // summoner not in unlockedUnits
      unlockedUnits: ["ogre"],
    };
    const save = migrateSave(v3);
    expect(save.deck).toEqual(["ogre"]);
    for (const id of STARTER_UNIT_IDS) {
      expect(save.unlockedUnits).toContain(id);
    }
  });

  it("drops unknown/non-deckable ids and clamps negative gold", () => {
    const save = migrateSave({
      version: 3,
      gold: -50,
      unlockedUnits: ["ogre", "not_a_unit", "bloater"], // bloater is non-deckable
      depths: { highestClearedFloor: -2 },
    });
    expect(save.gold).toBe(0);
    expect(save.depths.highestClearedFloor).toBe(0);
    expect(save.unlockedUnits).not.toContain("not_a_unit");
    expect(save.unlockedUnits).not.toContain("bloater");
  });

  it("does not leak DEFAULT_SAVE references (mutation-safe)", () => {
    const a = migrateSave(null);
    a.unlockedUnits.push("summoner");
    a.deck.push("summoner");
    const b = migrateSave(null);
    expect(b.unlockedUnits).not.toContain("summoner");
    expect(DEFAULT_SAVE.unlockedUnits).not.toContain("summoner");
  });
});

describe("sanitizeDeck", () => {
  const allUnlocked = [...DECKABLE_UNIT_IDS];

  it("drops locked units", () => {
    expect(sanitizeDeck(["ogre", "summoner"], ["ogre"])).toEqual(["ogre"]);
  });

  it("still enforces dupes + the one-legendary rule", () => {
    const deck = sanitizeDeck(
      ["summoner", "summoner", "aegis_knight", "ogre", "archer"],
      allUnlocked
    );
    // summoner + aegis_knight are both legendary → only the first survives.
    expect(deck).toEqual(["summoner", "ogre", "archer"]);
  });

  it("falls back to the owned part of the default deck when empty", () => {
    expect(sanitizeDeck([], ["ogre", "archer"])).toEqual(["ogre", "archer"]);
  });
});
