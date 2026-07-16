// ============================================================================
// atlasBiomes spec — the painted biome layer's pure data + placement math.
// Guards what would fail silently on the map: a dungeon missing its biome
// (bare terrain), doodads crowding node medallions or the floor trail, fog
// leaking an uncharted region's props, and non-determinism (the atlas would
// reshuffle every React render).
// ============================================================================

import { describe, expect, it } from "vitest";
import { DUNGEONS, DUNGEON_IDS, getDungeon } from "@/data/dungeons";
import {
  FLOOR_ASPECT,
  WORLD_ASPECT,
  floorNodes,
  worldNodes,
} from "@/data/atlasLayout";
import {
  ATLAS_BIOMES,
  FOG_GROUND,
  MIN_NODE_DIST,
  MIN_TRAIL_DIST,
  blendGround,
  floorDoodads,
  floorGroundSpots,
  hexToRgb,
  worldDoodads,
  worldGroundRegions,
} from "@/data/atlasBiomes";

const WORLD_H = Math.round(100 * WORLD_ASPECT);
const FLOOR_H = Math.round(100 * FLOOR_ASPECT);

/** clearedFloorOf stub from a partial progress map (missing = 0). */
const clearedOf =
  (progress: Record<string, number>) =>
  (id: string): number =>
    progress[id] ?? 0;

/** Everything unlocked/completed — the full 9-biome map. */
function allCleared(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of DUNGEON_IDS) out[id] = getDungeon(id).floors;
  return out;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe("ATLAS_BIOMES registry", () => {
  it("is a bijection with DUNGEONS (a new dungeon needs a biome)", () => {
    expect(Object.keys(ATLAS_BIOMES).sort()).toEqual(
      Object.keys(DUNGEONS).sort()
    );
  });

  it("every spec has a valid ground, weighted scatter, and a hero", () => {
    for (const [id, spec] of Object.entries(ATLAS_BIOMES)) {
      expect(spec.ground, id).toMatch(HEX_RE);
      expect(spec.scatter.length, id).toBeGreaterThan(0);
      for (const s of spec.scatter) expect(s.weight, id).toBeGreaterThan(0);
      expect(spec.heroes.length, id).toBeGreaterThan(0);
    }
  });
});

describe("worldGroundRegions + blendGround", () => {
  it("uncharted regions paint fog, charted paint their biome", () => {
    const nodes = worldNodes(clearedOf({ depths: getDungeon("depths").floors }));
    const regions = worldGroundRegions(nodes, WORLD_H);
    const byId = Object.fromEntries(regions.map((r) => [r.id, r]));
    expect(byId.depths.rgb).toEqual(hexToRgb(ATLAS_BIOMES.depths.ground));
    expect(byId.overgrowth.uncharted).toBe(true);
    expect(byId.overgrowth.rgb).toEqual(hexToRgb(FOG_GROUND));
  });

  it("blends to the local biome near a node and stays a valid color everywhere", () => {
    const nodes = worldNodes(clearedOf(allCleared()));
    const regions = worldGroundRegions(nodes, WORLD_H);
    for (const r of regions) {
      const c = blendGround(r.x, r.y, regions);
      // At the node itself the region dominates the mix.
      for (let i = 0; i < 3; i++) expect(Math.abs(c[i] - r.rgb[i])).toBeLessThan(24);
    }
    for (let y = 0; y < WORLD_H; y += 17) {
      for (let x = 0; x < 100; x += 10) {
        const c = blendGround(x, y, regions);
        for (const v of c) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

describe("worldDoodads", () => {
  const nodes = worldNodes(clearedOf(allCleared()));

  it("is deterministic", () => {
    expect(worldDoodads(nodes, WORLD_H)).toEqual(worldDoodads(nodes, WORLD_H));
  });

  it("covers every charted region and keeps clear of node medallions", () => {
    const dd = worldDoodads(nodes, WORLD_H);
    const perRegion = new Map<string, number>();
    for (const d of dd) {
      perRegion.set(d.dungeonId, (perRegion.get(d.dungeonId) ?? 0) + 1);
      for (const n of nodes) {
        const dist = Math.hypot(n.x * 100 - d.x, n.y * WORLD_H - d.y);
        expect(dist).toBeGreaterThanOrEqual(MIN_NODE_DIST);
      }
      expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
    }
    // Dense clutter: each of the 9 regions carries a real prop count.
    for (const id of DUNGEON_IDS) {
      expect(perRegion.get(id) ?? 0, id).toBeGreaterThanOrEqual(10);
    }
    // Hero props made it in (e.g. the Bonefields' giant tombstones).
    expect(dd.filter((d) => d.kind === "tombBig").length).toBeGreaterThanOrEqual(2);
  });

  it("is y-sorted for painter's-order overlap", () => {
    const dd = worldDoodads(nodes, WORLD_H);
    for (let i = 1; i < dd.length; i++) {
      expect(dd[i].y).toBeGreaterThanOrEqual(dd[i - 1].y);
    }
  });

  it("fog of war: uncharted regions get no props at all", () => {
    const fresh = worldNodes(clearedOf({}));
    const uncharted = new Set(
      fresh.filter((n) => n.uncharted).map((n) => n.id)
    );
    expect(uncharted.size).toBeGreaterThan(0);
    for (const d of worldDoodads(fresh, WORLD_H)) {
      expect(uncharted.has(d.dungeonId)).toBe(false);
    }
  });
});

describe("floorDoodads", () => {
  it("is deterministic and stays clear of nodes and the trail, every dungeon", () => {
    for (const id of DUNGEON_IDS) {
      const dungeon = getDungeon(id);
      const nodes = floorNodes(dungeon, 0);
      const dd = floorDoodads(id, nodes, FLOOR_H);
      expect(dd).toEqual(floorDoodads(id, nodes, FLOOR_H));
      expect(dd.length, id).toBeGreaterThanOrEqual(20);
      const pts = nodes.map((n) => ({ x: n.x * 100, y: n.y * FLOOR_H }));
      for (const d of dd) {
        for (const p of pts) {
          expect(Math.hypot(p.x - d.x, p.y - d.y)).toBeGreaterThanOrEqual(
            MIN_NODE_DIST
          );
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          expect(Math.hypot(mx - d.x, my - d.y)).toBeGreaterThanOrEqual(
            MIN_TRAIL_DIST
          );
        }
        expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
      }
    }
  });

  it("stamps the dungeon's hero prop (big tombstones on Bonefields floors)", () => {
    const nodes = floorNodes(getDungeon("bonefields"), 0);
    const heroes = floorDoodads("bonefields", nodes, FLOOR_H).filter(
      (d) => d.kind === "tombBig"
    );
    expect(heroes.length).toBeGreaterThanOrEqual(1);
  });

  it("different dungeons scatter differently", () => {
    const a = floorDoodads(
      "bonefields",
      floorNodes(getDungeon("bonefields"), 0),
      FLOOR_H
    );
    const b = floorDoodads("wilds", floorNodes(getDungeon("wilds"), 0), FLOOR_H);
    expect(a.map((d) => `${d.kind}@${d.x},${d.y}`)).not.toEqual(
      b.map((d) => `${d.kind}@${d.x},${d.y}`)
    );
  });
});

describe("floorGroundSpots", () => {
  it("is deterministic, in-bounds, and mixes light + dark", () => {
    for (const id of DUNGEON_IDS) {
      const spots = floorGroundSpots(id, FLOOR_H);
      expect(spots).toEqual(floorGroundSpots(id, FLOOR_H));
      expect(spots.length).toBe(3);
      for (const s of spots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(FLOOR_H);
        expect(s.r).toBeGreaterThan(0);
      }
      expect(spots.some((s) => s.amt > 0)).toBe(true);
      expect(spots.some((s) => s.amt < 0)).toBe(true);
    }
  });
});
