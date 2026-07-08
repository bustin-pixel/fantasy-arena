// Save migration specs — migrateSave is pure, so no localStorage/DOM needed.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAVE,
  MAX_USERNAME_LENGTH,
  migrateSave,
  sanitizeAvatarId,
  sanitizeDeck,
  sanitizeUsername,
  type PlayerSave,
} from "@/state/persistence";
import { DECKABLE_UNIT_IDS } from "@/data/units";
import { QUEST_LOCKED_UNITS } from "@/data/dungeons";
import { DEFAULT_AVATAR_ID } from "@/meta/avatars";
import { STARTER_UNIT_IDS } from "@/meta/economy";
import { TOTAL_XP_CAP } from "@/meta/leveling";

/** Legacy (pre-v6) shape: carried a single `depths` high-water mark before the
 *  per-dungeon `dungeons` map replaced it. */
type LegacySave = Partial<PlayerSave> & {
  depths?: { highestClearedFloor?: number };
};

/** Deckables minus quest-locked units — the grandfather grant withholds those. */
const GRANDFATHERED_UNITS = DECKABLE_UNIT_IDS.filter(
  (id) => !QUEST_LOCKED_UNITS.has(id)
);

/** A realistic pre-economy (v2) save, as written by the Compendium slice. */
function v2Save(): Partial<PlayerSave> {
  return {
    version: 2,
    username: "Veteran",
    deck: ["warrior", "healer", "ranger", "berserker"],
    wins: 12,
    losses: 3,
    bestiary: { bloater: { encountered: true, defeated: true } },
  };
}

describe("migrateSave", () => {
  it("null (new player) → defaults: starter units, 0 gold, floor 0", () => {
    const save = migrateSave(null);
    expect(save.version).toBe(8);
    expect(save.username).toBe("Champion");
    expect(save.avatarId).toBe(DEFAULT_AVATAR_ID);
    expect(save.gold).toBe(0);
    expect(save.dungeons.depths.highestClearedFloor).toBe(0);
    expect(save.dungeons.bonefields.highestClearedFloor).toBe(0);
    expect(save.questUnlocks).toEqual([]);
    expect(save.endless.bestWave).toBe(0);
    expect(save.unitXp).toEqual({});
    expect([...save.unlockedUnits].sort()).toEqual(
      [...STARTER_UNIT_IDS].sort()
    );
    expect(save.deck).toEqual(DEFAULT_SAVE.deck);
  });

  it("grandfathers a v2 save: all deckable units EXCEPT quest-locked ones", () => {
    const save = migrateSave(v2Save());
    expect([...save.unlockedUnits].sort()).toEqual([...GRANDFATHERED_UNITS].sort());
    // Quest-locked units must still be earned via their quest, even here.
    for (const id of QUEST_LOCKED_UNITS) {
      expect(save.unlockedUnits).not.toContain(id);
    }
    expect(save.questUnlocks).toEqual([]);
    expect(save.gold).toBe(0);
    expect(save.dungeons.depths.highestClearedFloor).toBe(0);
  });

  it("keeps valid questUnlocks and drops junk / non-quest ids", () => {
    const questUnit = [...QUEST_LOCKED_UNITS][0];
    const save = migrateSave({
      version: 5,
      questUnlocks: [questUnit, "ogre", "not_a_unit"],
    });
    expect(save.questUnlocks).toEqual([questUnit]);
  });

  it("keeps a grandfathered deck untouched (sanitize is a no-op)", () => {
    const save = migrateSave(v2Save());
    expect(save.deck).toEqual(["warrior", "healer", "ranger", "berserker"]);
    expect(save.wins).toBe(12);
    expect(save.losses).toBe(3);
    expect(save.bestiary.bloater?.defeated).toBe(true);
  });

  it("passes a v3 save through, preserving economy fields", () => {
    const v3: LegacySave = {
      version: 3,
      username: "Delver",
      deck: ["ogre", "warrior"],
      gold: 275,
      unlockedUnits: ["ogre", "archer", "knight", "fire_mage", "warrior"],
      depths: { highestClearedFloor: 4 },
    };
    const save = migrateSave(v3);
    expect(save.gold).toBe(275);
    expect(save.dungeons.depths.highestClearedFloor).toBe(4);
    expect(save.deck).toEqual(["ogre", "warrior"]);
    expect(save.unlockedUnits).toContain("warrior");
  });

  it("defaults endless.bestWave to 0 for a pre-v7 save", () => {
    const save = migrateSave({ version: 6, gold: 100 });
    expect(save.endless.bestWave).toBe(0);
  });

  it("preserves a v7 endless.bestWave and clamps a negative one", () => {
    expect(migrateSave({ version: 7, endless: { bestWave: 13 } }).endless.bestWave).toBe(13);
    expect(
      migrateSave({ version: 7, endless: { bestWave: -4 } }).endless.bestWave
    ).toBe(0);
  });

  it("defaults unitXp to {} for a pre-v8 save", () => {
    expect(migrateSave({ version: 7, gold: 100 }).unitXp).toEqual({});
  });

  it("keeps valid unitXp and drops/clamps junk (v8)", () => {
    const save = migrateSave({
      version: 8,
      unitXp: {
        ogre: 137,
        archer: 812.9, // floats floor
        knight: TOTAL_XP_CAP + 999, // over-cap clamps
        warrior: -50, // negatives clamp to 0
        bloater: 100, // non-deckable → dropped
        not_a_unit: 100, // unknown → dropped
        fire_mage: Number.NaN, // non-finite → dropped
      },
    });
    expect(save.unitXp).toEqual({
      ogre: 137,
      archer: 812,
      knight: TOTAL_XP_CAP,
      warrior: 0,
    });
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
    } as LegacySave);
    expect(save.gold).toBe(0);
    expect(save.dungeons.depths.highestClearedFloor).toBe(0);
    expect(save.unlockedUnits).not.toContain("not_a_unit");
    expect(save.unlockedUnits).not.toContain("bloater");
  });

  it("never boots into an empty warband (load-time fallback only)", () => {
    // A save whose deck sanitizes to nothing gets the owned default deck…
    const save = migrateSave({ version: 3, deck: [], unlockedUnits: ["ogre"] });
    expect(save.deck).toEqual(
      DEFAULT_SAVE.deck.filter((id) => save.unlockedUnits.includes(id))
    );
    expect(save.deck.length).toBeGreaterThan(0);
  });

  it("fills avatarId for a pre-v4 save and keeps a valid owned one", () => {
    // v3 save predates avatars → default face.
    const migrated = migrateSave({ version: 3, unlockedUnits: ["ogre"] });
    expect(migrated.avatarId).toBe(DEFAULT_AVATAR_ID);
    // v4 save wearing an owned unit keeps it.
    const kept = migrateSave({
      version: 4,
      avatarId: "ogre",
      unlockedUnits: ["ogre"],
    });
    expect(kept.avatarId).toBe("ogre");
  });

  it("resets an unknown or locked avatarId to the default (avatar ⊆ unlocked)", () => {
    const unknown = migrateSave({ version: 4, avatarId: "not_a_unit" });
    expect(unknown.avatarId).toBe(DEFAULT_AVATAR_ID);
    // summoner exists but isn't in unlockedUnits → not wearable.
    const locked = migrateSave({
      version: 4,
      avatarId: "summoner",
      unlockedUnits: ["ogre"],
    });
    expect(locked.avatarId).toBe(DEFAULT_AVATAR_ID);
  });

  it("sanitizes a corrupt username back to the default", () => {
    const save = migrateSave({ version: 4, username: "   \n\t  " });
    expect(save.username).toBe(DEFAULT_SAVE.username);
  });

  it("does not leak DEFAULT_SAVE references (mutation-safe)", () => {
    const a = migrateSave(null);
    a.unlockedUnits.push("summoner");
    a.deck.push("summoner");
    a.unitXp.ogre = 9999;
    const b = migrateSave(null);
    expect(b.unlockedUnits).not.toContain("summoner");
    expect(DEFAULT_SAVE.unlockedUnits).not.toContain("summoner");
    expect(b.unitXp).toEqual({});
    expect(DEFAULT_SAVE.unitXp).toEqual({});
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

  it("returns [] for an empty deck — Clear must actually clear", () => {
    expect(sanitizeDeck([], ["ogre", "archer"])).toEqual([]);
    expect(sanitizeDeck(["summoner"], ["ogre"])).toEqual([]);
  });
});

describe("sanitizeUsername", () => {
  it("trims and collapses internal whitespace runs", () => {
    expect(sanitizeUsername("  Sky   Setter  ", "x")).toBe("Sky Setter");
  });

  it("turns newlines into word breaks and strips other control chars", () => {
    expect(sanitizeUsername("Cham\npion", "x")).toBe("Cham pion");
    // Bell (Cc) + zero-width space (Cf) strip outright.
    expect(sanitizeUsername("Bad\u0007Name\u200B", "x")).toBe("BadName");
  });

  it("caps at MAX_USERNAME_LENGTH by code point (no split surrogates)", () => {
    const long = "a".repeat(MAX_USERNAME_LENGTH + 5);
    expect(sanitizeUsername(long, "x")).toHaveLength(MAX_USERNAME_LENGTH);
    // 10 one-unit swords + 10 two-unit dragons: the cap lands among the
    // dragons — the 16th code point must be a whole dragon, not half of one.
    const capped = sanitizeUsername("⚔".repeat(10) + "🐉".repeat(10), "x");
    expect([...capped]).toHaveLength(MAX_USERNAME_LENGTH);
    expect(capped.slice(-2)).toBe("🐉");
  });

  it("empty (or whitespace-only) input reverts to the fallback", () => {
    expect(sanitizeUsername("", "Previous")).toBe("Previous");
    expect(sanitizeUsername("   ", "Previous")).toBe("Previous");
  });

  it("allows unicode names", () => {
    expect(sanitizeUsername("爆発の騎士", "x")).toBe("爆発の騎士");
  });
});

describe("sanitizeAvatarId", () => {
  it("keeps an owned unit avatar", () => {
    expect(sanitizeAvatarId("ogre", ["ogre"])).toBe("ogre");
  });

  it("falls back for unknown ids, locked units, and non-strings", () => {
    expect(sanitizeAvatarId("not_a_unit", DECKABLE_UNIT_IDS)).toBe(
      DEFAULT_AVATAR_ID
    );
    expect(sanitizeAvatarId("summoner", ["ogre"])).toBe(DEFAULT_AVATAR_ID);
    expect(sanitizeAvatarId(42, DECKABLE_UNIT_IDS)).toBe(DEFAULT_AVATAR_ID);
    expect(sanitizeAvatarId(undefined, DECKABLE_UNIT_IDS)).toBe(
      DEFAULT_AVATAR_ID
    );
  });
});
