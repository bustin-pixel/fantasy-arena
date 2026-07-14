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
    expect(save.version).toBe(12);
    expect(save.shop).toEqual({ day: -1, rerolls: 0, bought: [] });
    expect(save.quests).toEqual({
      day: -1,
      refreshes: 0,
      taken: [],
      active: [],
    });
    expect(save.itemPity).toBe(0);
    expect(save.soulShards).toBe(0);
    expect(save.items).toEqual({});
    expect(save.loadouts).toEqual({});
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

  it("v12: retro-grants per-dungeon gifts for floors already cleared", () => {
    const save = migrateSave({
      version: 11,
      dungeons: {
        depths: { highestClearedFloor: 3 }, // gifts at F2 (healer) + F3 (fire_mage)
        bonefields: { highestClearedFloor: 5 }, // gift at F5 (holy_knight)
      },
    });
    expect(save.unlockedUnits).toContain("healer"); // depths F2 — cleared
    expect(save.unlockedUnits).toContain("fire_mage"); // depths F3 — cleared
    expect(save.unlockedUnits).not.toContain("berserker"); // depths F5 — not yet
    expect(save.unlockedUnits).toContain("holy_knight"); // bonefields F5 — cleared
    expect(save.unlockedUnits).not.toContain("ogre"); // wilds — never played
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
    a.items["soldiers_blade:rare:1"] = 5;
    a.loadouts.ogre = { weapon: "soldiers_blade:rare:1" };
    a.shop.bought.push(2);
    const b = migrateSave(null);
    expect(b.shop.bought).toEqual([]);
    expect(DEFAULT_SAVE.shop.bought).toEqual([]);
    expect(b.unlockedUnits).not.toContain("summoner");
    expect(DEFAULT_SAVE.unlockedUnits).not.toContain("summoner");
    expect(b.unitXp).toEqual({});
    expect(DEFAULT_SAVE.unitXp).toEqual({});
    expect(b.items).toEqual({});
    expect(b.loadouts).toEqual({});
    expect(DEFAULT_SAVE.items).toEqual({});
    expect(DEFAULT_SAVE.loadouts).toEqual({});
  });

  // ---- v9: soulShards + items + loadouts ----------------------------------

  it("defaults the v9 fields for a pre-v9 save", () => {
    const save = migrateSave({ version: 8, gold: 500, unitXp: { ogre: 100 } });
    expect(save.soulShards).toBe(0);
    expect(save.items).toEqual({});
    expect(save.loadouts).toEqual({});
    expect(save.gold).toBe(500); // untouched by the new fields
  });

  it("preserves valid v9 fields end to end", () => {
    const save = migrateSave({
      version: 9,
      soulShards: 42,
      items: { "soldiers_blade:rare:2": 3, "ember_charm:legendary:1": 1 },
      loadouts: {
        ogre: {
          weapon: "soldiers_blade:rare:2",
          trinket: "ember_charm:legendary:1",
        },
      },
      unlockedUnits: [...STARTER_UNIT_IDS],
    });
    expect(save.soulShards).toBe(42);
    expect(save.items).toEqual({
      "soldiers_blade:rare:2": 3,
      "ember_charm:legendary:1": 1,
    });
    expect(save.loadouts.ogre).toEqual({
      weapon: "soldiers_blade:rare:2",
      trinket: "ember_charm:legendary:1",
    });
  });

  it("sanitizes hand-edited v9 garbage: bad keys, bad counts, bad shards", () => {
    const save = migrateSave({
      version: 9,
      soulShards: -12,
      items: {
        "soldiers_blade:rare:1": 2.9, // floors to 2
        "not_a_line:rare:1": 4, // unknown line → dropped
        "soldiers_blade:mythic:1": 4, // unknown quality → dropped
        "soldiers_blade:rare:9": 4, // star out of range → dropped
        "squires_plate:rare:1": -3, // negative → dropped
      },
    });
    expect(save.soulShards).toBe(0);
    expect(save.items).toEqual({ "soldiers_blade:rare:1": 2 });
  });

  // ---- v10: shop bookkeeping ----------------------------------------------

  it("defaults shop to never-visited for a pre-v10 save", () => {
    const save = migrateSave({ version: 9, gold: 500 });
    expect(save.shop).toEqual({ day: -1, rerolls: 0, bought: [] });
    expect(save.gold).toBe(500);
  });

  it("preserves valid v10 shop bookkeeping", () => {
    const save = migrateSave({
      version: 10,
      shop: { day: 1037543, rerolls: 1, bought: [0, 2] },
    });
    expect(save.shop).toEqual({ day: 1037543, rerolls: 1, bought: [0, 2] });
  });

  it("sanitizes hand-edited v10 shop garbage", () => {
    const save = migrateSave({
      version: 10,
      shop: {
        day: 3.7, // non-integer → never-visited
        rerolls: 99, // clamps to the per-day cap
        bought: [0, 0, -1, 9, 2.5, "x", 3], // dedupe + drop out-of-range/junk
      } as unknown as PlayerSave["shop"],
    });
    expect(save.shop.day).toBe(-1);
    expect(save.shop.rerolls).toBe(1);
    expect(save.shop.bought).toEqual([0, 3]);
  });

  it("enforces the loadout invariant: slot types match and references ≤ counts", () => {
    const save = migrateSave({
      version: 9,
      items: { "soldiers_blade:rare:1": 1, "squires_plate:rare:1": 1 },
      loadouts: {
        ogre: {
          weapon: "soldiers_blade:rare:1",
          armor: "soldiers_blade:rare:1", // weapon in the armor slot → dropped
        },
        archer: { weapon: "soldiers_blade:rare:1" }, // over-referenced → dropped
        not_a_unit: { armor: "squires_plate:rare:1" }, // unknown unit → dropped
      },
    });
    // Sorted defId order: archer wins the single blade copy.
    expect(save.loadouts.archer).toEqual({ weapon: "soldiers_blade:rare:1" });
    expect(save.loadouts.ogre).toBeUndefined();
    expect(save.loadouts.not_a_unit).toBeUndefined();
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
