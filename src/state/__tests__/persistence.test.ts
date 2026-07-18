// Save migration specs — migrateSave is pure, so no localStorage/DOM needed.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAVE,
  highestUnlockedTier,
  isTierCleared,
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
import { BESTIARY_REWARDS, STARTER_UNIT_IDS } from "@/meta/economy";
import {
  computeRetroBestiaryRewards,
  earnedTitleIds,
} from "@/meta/bestiaryRewards";
import { TOTAL_XP_CAP } from "@/meta/leveling";
import { COMMANDER_XP_CAP, pointsSpent } from "@/meta/commander";

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
    expect(save.version).toBe(17);
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
    // Gold is NOT 0: this v2 fixture already had the Bloater (a dungeon boss)
    // defeated, so the v16 bestiary retro-grant pays that page once — boss
    // encounter + boss defeat + its shard. See the retro spec below.
    expect(save.gold).toBe(
      BESTIARY_REWARDS.bossEncounterGold + BESTIARY_REWARDS.bossDefeatGold
    );
    expect(save.soulShards).toBe(BESTIARY_REWARDS.bossDefeatShards);
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

  it("v13: a completed Sealed Vault quest retroactively unlocks the Archmage", () => {
    // Aegis Knight buyable (quest done, not yet bought) → Archmage buyable too.
    const buyable = migrateSave({ version: 12, questUnlocks: ["aegis_knight"] });
    expect(buyable.questUnlocks).toContain("archmage");
    // Aegis Knight already OWNED (quest done and bought) → same grandfather.
    const owned = migrateSave({
      version: 12,
      unlockedUnits: ["aegis_knight"],
    });
    expect(owned.questUnlocks).toContain("archmage");
    // Untouched quest → no free Archmage; and the grant is idempotent.
    expect(migrateSave({ version: 12 }).questUnlocks).not.toContain("archmage");
    const again = migrateSave(buyable);
    expect(again.questUnlocks.filter((id) => id === "archmage").length).toBe(1);
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

  it("v14: clearedTiers absent for older saves; valid flags survive the round-trip", () => {
    const old = migrateSave({
      version: 13,
      dungeons: { depths: { highestClearedFloor: 5 } },
    });
    expect(old.dungeons.depths.clearedTiers).toBeUndefined();
    const kept = migrateSave({
      version: 14,
      dungeons: {
        depths: { highestClearedFloor: 5, clearedTiers: { hard: true } },
        bonefields: {
          highestClearedFloor: 5,
          clearedTiers: { hard: true, elite: true },
        },
      },
    });
    expect(kept.dungeons.depths.clearedTiers).toEqual({ hard: true });
    expect(kept.dungeons.bonefields.clearedTiers).toEqual({
      hard: true,
      elite: true,
    });
  });

  it("v14: sanitizes junk clearedTiers — strict booleans, elite implies hard, empty/garbage drop", () => {
    const save = migrateSave({
      version: 14,
      dungeons: {
        depths: { highestClearedFloor: 5, clearedTiers: { hard: "yes", elite: 1 } },
        bonefields: { highestClearedFloor: 5, clearedTiers: { elite: true } },
        wilds: { highestClearedFloor: 5, clearedTiers: {} },
        overgrowth: { highestClearedFloor: 5, clearedTiers: "garbage" },
      } as unknown as PlayerSave["dungeons"],
    });
    expect(save.dungeons.depths.clearedTiers).toBeUndefined(); // junk flags drop
    expect(save.dungeons.bonefields.clearedTiers).toEqual({
      hard: true,
      elite: true, // the ladder invariant promotes hard
    });
    expect(save.dungeons.wilds.clearedTiers).toBeUndefined(); // empty drops
    expect(save.dungeons.overgrowth.clearedTiers).toBeUndefined(); // non-object drops
  });

  it("v15: monsterKills defaults to {} for an older save", () => {
    expect(migrateSave({ version: 14, gold: 100 }).monsterKills).toEqual({});
  });

  it("v15: keeps trackable monsterKills and drops/clamps junk", () => {
    const save = migrateSave({
      version: 15,
      monsterKills: {
        giant_rat: 37,
        ghoul: 12.9, // floats floor
        lich: -3, // negatives clamp to 0
        skeleton: 8, // summon def BUT a real dungeon denizen → kept
        knight: 50, // hero → dropped
        wolf: 50, // summon-only def → dropped
        not_a_unit: 50, // unknown → dropped
        dire_wolf: Number.POSITIVE_INFINITY, // non-finite → dropped
      },
    });
    expect(save.monsterKills).toEqual({
      giant_rat: 37,
      ghoul: 12,
      lich: 0,
      skeleton: 8,
    });
  });

  it("v15: two migrations never share a monsterKills reference", () => {
    const raw = { version: 15, monsterKills: { giant_rat: 5 } };
    const a = migrateSave(raw);
    const b = migrateSave(raw);
    a.monsterKills.giant_rat = 999;
    expect(b.monsterKills.giant_rat).toBe(5);
  });

  // --- v16: the bestiary retro-grant + equipped title -----------------------

  it("v16: retro-grants every already-earned bestiary reward exactly once", () => {
    // A veteran save: an ordinary monster discovered + defeated, a boss page
    // complete, and enough kills to have crossed slayer levels I and II.
    const raw = {
      version: 15,
      gold: 1000,
      soulShards: 10,
      bestiary: {
        giant_rat: { encountered: true, defeated: true },
        bloater: { encountered: true, defeated: true },
        zombie_shambler: { encountered: true, defeated: false },
      },
      monsterKills: { giant_rat: 30 }, // ≥25 ⇒ slayer II
    };
    const expected = computeRetroBestiaryRewards(raw.bestiary, raw.monsterKills);
    // Sanity: the fixture really does earn something on each stream.
    expect(expected.discoveries.length).toBeGreaterThan(0);
    expect(expected.milestones.map((m) => m.level)).toEqual([1, 2]);

    const save = migrateSave(raw);
    expect(save.gold).toBe(1000 + expected.gold);
    expect(save.soulShards).toBe(10 + expected.shards);

    // Re-migrating the ALREADY-migrated save must not pay a second time —
    // that's what the version gate buys.
    const again = migrateSave(save);
    expect(again.gold).toBe(save.gold);
    expect(again.soulShards).toBe(save.soulShards);
  });

  it("v16: a brand-new save gets no retro grant", () => {
    const save = migrateSave(null);
    expect(save.gold).toBe(0);
    expect(save.soulShards).toBe(0);
    expect(save.title).toBeNull();
  });

  it("v16: keeps an earned title and clears an unearned/junk one", () => {
    const bestiary = { bloater: { encountered: true, defeated: true } };
    const earned = earnedTitleIds(bestiary, {});
    expect(earned).toContain("slayer:bloater");

    expect(migrateSave({ version: 15, bestiary, title: "slayer:bloater" }).title).toBe(
      "slayer:bloater"
    );
    // Never defeated that boss → the title isn't in the derived set.
    expect(migrateSave({ version: 15, bestiary, title: "slayer:abomination" }).title)
      .toBeNull();
    expect(migrateSave({ version: 15, bestiary, title: "not_a_title" }).title).toBeNull();
  });

  it("v17: commander fields default to the zero state for older saves", () => {
    const save = migrateSave({ version: 16 });
    expect(save.commanderXp).toBe(0);
    expect(save.talents).toEqual({});
    expect(save.equippedSpell).toBeNull();
  });

  it("v17: clamps commanderXp and replays talents through the gate rules", () => {
    // 4,500 XP = commander level 10 = 9 talent points.
    const save = migrateSave({
      version: 17,
      commanderXp: 4500,
      talents: {
        sharpened_steel: 3,
        drill_sergeant: 3,
        forced_march: 2,
        bloodlust: 99, // clamps to maxRanks(2), but the 9-point budget caps it at 1
        warpath: 1, // keystone needs 8 in-branch and the budget is spent — drops
        junk_talent: 5,
      },
    });
    expect(save.commanderXp).toBe(4500);
    expect(save.talents.sharpened_steel).toBe(3);
    expect(save.talents.junk_talent).toBeUndefined();
    expect(save.talents.warpath).toBeUndefined();
    expect(pointsSpent(save.talents)).toBe(9);
    // Junk XP resets rather than crashes.
    expect(migrateSave({ version: 17, commanderXp: NaN }).commanderXp).toBe(0);
    expect(migrateSave({ version: 17, commanderXp: 1e12 }).commanderXp).toBe(
      COMMANDER_XP_CAP
    );
  });

  it("v17: equipped spell survives only while its branch is deep enough", () => {
    // 8 points into warlord (needs level ≥ 9 → 3,600 XP).
    const talents = {
      sharpened_steel: 3,
      drill_sergeant: 3,
      forced_march: 2,
    };
    const kept = migrateSave({
      version: 17,
      commanderXp: 4500,
      talents,
      equippedSpell: "rally",
    });
    expect(kept.equippedSpell).toBe("rally");
    // Not that branch's spell / not unlocked → cleared.
    expect(
      migrateSave({ version: 17, commanderXp: 4500, talents, equippedSpell: "bulwark" })
        .equippedSpell
    ).toBeNull();
    expect(
      migrateSave({ version: 17, commanderXp: 0, talents: {}, equippedSpell: "rally" })
        .equippedSpell
    ).toBeNull();
  });

  it("v17: two migrations never share a talents reference", () => {
    const raw = { version: 17, commanderXp: 1000, talents: { sharpened_steel: 2 } };
    const a = migrateSave(structuredClone(raw));
    const b = migrateSave(structuredClone(raw));
    a.talents.sharpened_steel = 1;
    expect(b.talents.sharpened_steel).toBe(2);
  });

  it("v14: two migrations never share a clearedTiers reference", () => {
    const raw = {
      version: 14,
      dungeons: {
        depths: { highestClearedFloor: 5, clearedTiers: { hard: true } },
      },
    };
    const a = migrateSave(structuredClone(raw));
    const b = migrateSave(structuredClone(raw));
    a.dungeons.depths.clearedTiers!.elite = true;
    expect(b.dungeons.depths.clearedTiers).toEqual({ hard: true });
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

describe("tier ladder helpers (isTierCleared / highestUnlockedTier)", () => {
  const withDungeons = (dungeons: PlayerSave["dungeons"]): PlayerSave => ({
    ...migrateSave(null),
    dungeons,
  });

  it("normal reads the floor signal; hard/elite read the v14 flags", () => {
    const save = withDungeons({
      depths: { highestClearedFloor: 5, clearedTiers: { hard: true } },
    });
    expect(isTierCleared(save, "depths", "normal")).toBe(true);
    expect(isTierCleared(save, "depths", "hard")).toBe(true);
    expect(isTierCleared(save, "depths", "elite")).toBe(false);
    expect(isTierCleared(save, "bonefields", "normal")).toBe(false);
    expect(isTierCleared(save, "bonefields", "hard")).toBe(false);
  });

  it("highestUnlockedTier walks the per-dungeon ladder", () => {
    expect(highestUnlockedTier(migrateSave(null), "depths")).toBe("normal");
    expect(
      highestUnlockedTier(
        withDungeons({ depths: { highestClearedFloor: 5 } }),
        "depths"
      )
    ).toBe("hard");
    expect(
      highestUnlockedTier(
        withDungeons({
          depths: { highestClearedFloor: 5, clearedTiers: { hard: true } },
        }),
        "depths"
      )
    ).toBe("elite");
    expect(
      highestUnlockedTier(
        withDungeons({
          depths: {
            highestClearedFloor: 5,
            clearedTiers: { hard: true, elite: true },
          },
        }),
        "depths"
      )
    ).toBe("elite");
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
