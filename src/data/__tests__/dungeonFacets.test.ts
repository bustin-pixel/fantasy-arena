// ============================================================================
// Dungeon facet completeness — the guard on "adding a dungeon means editing N
// files in lockstep."
//
// A dungeon's combat facets live on its def (data/dungeons), and so do the ones
// that are pure data: bossChestTier, capstone, milestoneUnlocks. The rest CAN'T
// move there without inverting the layering — audio/music and the compendium's
// splash gallery both import data/dungeons, and data/atlas* is the atlas's own
// concern. Every one of those lookups falls back silently (Depths music, the
// armory still-life, no map pin), so a dungeon missing an entry doesn't crash —
// it ships wrong. These specs are what make that a failing test instead.
//
// Adding a dungeon? A red line here IS the checklist.
// ============================================================================

import { describe, expect, it } from "vitest";
import { DUNGEON_IDS, getDungeon } from "@/data/dungeons";
import { DUNGEON_TRACKS } from "@/audio/music";
import { hasSplashScene } from "@/components/compendium/splashArt";
import { WORLD_POINTS } from "@/data/atlasLayout";
import { ATLAS_BIOMES } from "@/data/atlasBiomes";

describe("every dungeon has its layer-owned facets", () => {
  it("a soundtrack set — floor tracks + a bespoke boss track", () => {
    for (const id of DUNGEON_IDS) {
      const set = DUNGEON_TRACKS[id];
      expect(set, `${id} has no DUNGEON_TRACKS entry`).toBeDefined();
      expect(set.floors.length, `${id} has no floor tracks`).toBeGreaterThan(0);
      expect(set.boss, `${id} has no boss track`).toBeTruthy();
    }
  });

  it("a painted compendium splash scene", () => {
    for (const id of DUNGEON_IDS) {
      expect(hasSplashScene(id), `${id} has no splash scene`).toBe(true);
    }
  });

  it("an atlas world point, inside the map", () => {
    for (const id of DUNGEON_IDS) {
      const pt = WORLD_POINTS[id];
      expect(pt, `${id} has no WORLD_POINTS entry`).toBeDefined();
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(1);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  it("an atlas biome", () => {
    for (const id of DUNGEON_IDS) {
      expect(ATLAS_BIOMES[id], `${id} has no ATLAS_BIOMES entry`).toBeDefined();
    }
  });
});

describe("the facets that live on the def", () => {
  it("only capstones claim the capstone flag, and they pay the top chest tiers", () => {
    const capstones = DUNGEON_IDS.filter((id) => getDungeon(id).capstone);
    expect(capstones).toEqual(["deep_forge", "eclipse_spire"]);
    // A capstone is the only place arcane/dragon first-clear chests drop.
    for (const id of capstones) {
      expect(["arcane", "dragon"]).toContain(getDungeon(id).bossChestTier);
    }
  });

  it("every declared boss chest tier is a real tier", () => {
    const tiers = ["wooden", "silver", "gold", "arcane", "dragon"];
    for (const id of DUNGEON_IDS) {
      const tier = getDungeon(id).bossChestTier;
      if (tier !== undefined) expect(tiers).toContain(tier);
    }
  });
});
