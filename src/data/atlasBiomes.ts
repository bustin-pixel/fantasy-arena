// ============================================================================
// atlasBiomes — pure data + placement math for the atlas's painted biome
// layer ("Painted Realm" mockup pick). The world map is seamless terrain:
// every point belongs to the nearest dungeon's biome (soft-blended), densely
// cluttered with themed doodads and one-off hero props (giant tombstones at
// the Bonefields, a volcano at the Deep Forge…). Floor views reuse the same
// kit at larger scale on a full-bleed themed ground.
//
// Like atlasLayout, this module is pure and DOM-free: same inputs → same
// placements (all randomness flows through atlasLayout's hash01). Rendering
// lives in components/atlas/BiomeLayer.tsx.
//
// Keyed by DUNGEON id — a test enforces the bijection with DUNGEONS (adding
// a dungeon means adding a biome here, same rule as WORLD_POINTS).
// ============================================================================

import { hash01, type TrailNode } from "./atlasLayout";
import { DUNGEONS } from "./dungeons";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type DoodadKind =
  // shared ground clutter
  | "tuft"
  | "pebble"
  | "rock"
  // depths
  | "candle"
  | "stalag"
  | "caveMouth"
  | "castle"
  | "barbican"
  // bonefields
  | "tombSmall"
  | "tombBig"
  | "skullPile"
  | "deadTree"
  // wilds
  | "pine"
  | "pineSmall"
  | "pineBig"
  // overgrowth
  | "blobTree"
  | "mushroom"
  | "mushroomBig"
  | "fern"
  // sealed vault
  | "crystal"
  | "crystalBig"
  // deep forge
  | "mountain"
  | "volcano"
  | "lava"
  // eclipse spire
  | "spireTower"
  // fallen cathedral
  | "ruinColumn"
  | "arch"
  | "archBig"
  | "cathedral"
  // rogue's den
  | "tent"
  | "tentBig"
  | "dagger";

export interface BiomeSpec {
  /** Terrain color this dungeon's region paints on the map (hand-picked to
   *  echo its arena theme — ArenaTheme exposes no harvestable palette). */
  ground: string;
  /** Filler doodads scattered through the region, weighted. */
  scatter: { kind: DoodadKind; weight: number }[];
  /** Signature one-off props, hand-offset from the node in viewBox units.
   *  Floor views stamp the LAST entry at the map corners, so a dungeon with a
   *  showpiece first hero (the Cathedral's church) keeps its old corner prop. */
  heroes: { kind: DoodadKind; dx: number; dy: number; scale: number }[];
  /** Floor views: the landmark stamped at the map corners. Defaults to the
   *  LAST hero; set it when a dungeon shows one landmark on the world map but
   *  wants a different corner filler on its floors — the Depths puts its
   *  castle on the map, yet keeps cave mounds in the floor corners. */
  floorCorner?: { kind: DoodadKind; scale: number };
  /** Floor views only: a landmark stamped beside the trail's deepest node
   *  (the boss lair) — the Fallen Cathedral's church looms over its Lair. */
  bossProp?: { kind: DoodadKind; dx: number; dy: number; scale: number };
}

/** Uncharted terrain — a misty neutral so fogged regions spoil nothing. */
export const FOG_GROUND = "#8a8272";

export const ATLAS_BIOMES: Record<string, BiomeSpec> = {
  depths: {
    ground: "#6f6659",
    scatter: [
      { kind: "rock", weight: 3 },
      { kind: "stalag", weight: 2 },
      { kind: "candle", weight: 2 },
      { kind: "pebble", weight: 2 },
    ],
    // The gatehouse castle is the world map's lone landmark, standing where
    // the cave mound used to but raised clear of the node's "The Depths"
    // label (user-placed). The mound lives on in the floor corners for
    // variety, and the rock-hewn barbican guards the Lair.
    heroes: [{ kind: "castle", dx: 9, dy: -4, scale: 1.1 }],
    floorCorner: { kind: "caveMouth", scale: 1.6 },
    bossProp: { kind: "barbican", dx: 12, dy: 3, scale: 1.0 },
  },
  bonefields: {
    ground: "#a39a7c",
    scatter: [
      { kind: "tombSmall", weight: 3 },
      { kind: "skullPile", weight: 2 },
      { kind: "deadTree", weight: 2 },
      { kind: "rock", weight: 1 },
      { kind: "pebble", weight: 1 },
    ],
    heroes: [
      { kind: "tombBig", dx: -9, dy: -4, scale: 1 },
      { kind: "tombBig", dx: 8, dy: 5, scale: 0.8 },
    ],
  },
  wilds: {
    ground: "#5e7d43",
    scatter: [
      { kind: "pine", weight: 3 },
      { kind: "pineSmall", weight: 3 },
      { kind: "rock", weight: 1 },
      { kind: "tuft", weight: 2 },
    ],
    heroes: [{ kind: "pineBig", dx: 10, dy: -5, scale: 1 }],
  },
  overgrowth: {
    ground: "#4c7a38",
    scatter: [
      { kind: "blobTree", weight: 3 },
      { kind: "mushroom", weight: 2 },
      { kind: "fern", weight: 2 },
      { kind: "tuft", weight: 2 },
    ],
    heroes: [{ kind: "mushroomBig", dx: -10, dy: 4, scale: 1 }],
  },
  sealed_vault: {
    ground: "#5d5470",
    scatter: [
      { kind: "crystal", weight: 4 },
      { kind: "rock", weight: 2 },
      { kind: "pebble", weight: 1 },
    ],
    heroes: [{ kind: "crystalBig", dx: 10, dy: 4, scale: 1 }],
  },
  deep_forge: {
    ground: "#7a5843",
    scatter: [
      { kind: "mountain", weight: 3 },
      { kind: "lava", weight: 2 },
      { kind: "rock", weight: 2 },
      { kind: "pebble", weight: 1 },
    ],
    heroes: [{ kind: "volcano", dx: -10, dy: -5, scale: 1 }],
  },
  eclipse_spire: {
    ground: "#4a4a66",
    scatter: [
      { kind: "rock", weight: 2 },
      { kind: "crystal", weight: 2 },
      { kind: "deadTree", weight: 2 },
      { kind: "pebble", weight: 1 },
    ],
    heroes: [{ kind: "spireTower", dx: 9, dy: -4, scale: 1 }],
  },
  fallen_cathedral: {
    ground: "#98917f",
    scatter: [
      { kind: "ruinColumn", weight: 2 },
      { kind: "arch", weight: 1 },
      { kind: "deadTree", weight: 2 },
      { kind: "rock", weight: 2 },
    ],
    // The stained-glass church is the showpiece (user-placed: above-left of
    // the world node, left of the floor trail's Lair); the giant arch stays
    // as a secondary landmark (and the floor corners' prop — heroes[last]).
    heroes: [
      { kind: "cathedral", dx: 2, dy: -8, scale: 0.85 },
      { kind: "archBig", dx: 9, dy: 4, scale: 0.7 },
    ],
    bossProp: { kind: "cathedral", dx: -13, dy: 2, scale: 1.05 },
  },
  rogues_den: {
    ground: "#6d4a3e",
    scatter: [
      { kind: "tent", weight: 2 },
      { kind: "dagger", weight: 2 },
      { kind: "rock", weight: 2 },
      { kind: "tuft", weight: 2 },
    ],
    heroes: [{ kind: "tentBig", dx: 8, dy: 5, scale: 1 }],
  },
};

// ---------------------------------------------------------------------------
// Ground blending — seamless nearest-biome terrain
// ---------------------------------------------------------------------------

export interface GroundRegion {
  id: string;
  /** Node center in viewBox units. */
  x: number;
  y: number;
  rgb: [number, number, number];
  uncharted: boolean;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** World nodes → blendable ground regions. Uncharted regions paint fog, not
 *  their biome — the terrain itself is part of the reveal. */
export function worldGroundRegions(
  nodes: TrailNode[],
  H: number
): GroundRegion[] {
  return nodes.map((n) => ({
    id: n.id,
    x: n.x * 100,
    y: n.y * H,
    rgb: hexToRgb(n.uncharted ? FOG_GROUND : ATLAS_BIOMES[n.id].ground),
    uncharted: n.uncharted ?? false,
  }));
}

/** Terrain color at a point: inverse-distance⁴ mix of every region, so each
 *  biome dominates near its node and borders melt into each other. Pure math
 *  — the render layer rasterizes this once to a tiny canvas (no SVG filters,
 *  which jank mobile zoom transitions). */
export function blendGround(
  x: number,
  y: number,
  regions: GroundRegion[]
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  for (const rg of regions) {
    const d2 = (rg.x - x) * (rg.x - x) + (rg.y - y) * (rg.y - y) + 4;
    const w = 1 / (d2 * d2);
    r += rg.rgb[0] * w;
    g += rg.rgb[1] * w;
    b += rg.rgb[2] * w;
    wsum += w;
  }
  return [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)];
}

/** Soft light/dark patches that break up a floor view's single-biome ground.
 *  Deterministic per dungeon; `amt` is a lightness shift (-/+). */
export function floorGroundSpots(
  dungeonId: string,
  H: number
): { x: number; y: number; r: number; amt: number }[] {
  return [0, 1, 2].map((i) => ({
    x: 10 + hash01(`${dungeonId}:spotx${i}`) * 80,
    y: 8 + hash01(`${dungeonId}:spoty${i}`) * (H - 16),
    r: 22 + hash01(`${dungeonId}:spotr${i}`) * 14,
    amt: i === 1 ? -14 : i === 0 ? 12 : 8,
  }));
}

// ---------------------------------------------------------------------------
// Doodad placement — dense deterministic clutter
// ---------------------------------------------------------------------------

export interface DoodadPlacement {
  kind: DoodadKind;
  /** viewBox units. */
  x: number;
  y: number;
  scale: number;
  /** Biome ground hex — tints tufts/pebbles and the cave-mouth hill. */
  ground: string;
  /** Region this doodad belongs to (world: for conceal/dim; floor: the
   *  dungeon). Lets the unlock ceremony fade a whole region's props in. */
  dungeonId: string;
  /** Per-instance lightness jitter for organic kinds (a forest stops being
   *  identical clones). Deterministic, from the placement hash. */
  tint?: number;
  /** Signature landmark prop — gets the heavier contact shadow and hosts the
   *  Enchanted Chart's living-landmark effects (wisps, smoke, sparkles). */
  hero?: boolean;
}

/** Doodads may not crowd a node's medallion. */
export const MIN_NODE_DIST = 6.5;

/** Footprint radius per kind (viewBox units at scale 1). Solid doodads claim
 *  their footprint during placement so props never stack on each other;
 *  tuft/pebble (0) stay free clutter that may nest under anything. */
export const DOODAD_FOOT: Record<DoodadKind, number> = {
  tuft: 0,
  pebble: 0,
  rock: 2.1,
  candle: 1.5,
  stalag: 2,
  caveMouth: 6.5,
  castle: 6.2,
  barbican: 6.6,
  tombSmall: 2.1,
  tombBig: 5.2,
  skullPile: 2.2,
  deadTree: 2.3,
  pine: 3.1,
  pineSmall: 2.2,
  pineBig: 5.8,
  blobTree: 3,
  mushroom: 1.7,
  mushroomBig: 4.4,
  fern: 1.7,
  crystal: 1.7,
  crystalBig: 4.6,
  mountain: 4.6,
  volcano: 8,
  lava: 3.2,
  spireTower: 4.2,
  ruinColumn: 1.6,
  arch: 2.9,
  archBig: 6,
  cathedral: 6.3,
  tent: 2.5,
  tentBig: 5,
  dagger: 1.3,
};

/** Solid-doodad separation ledger: candidates must clear every claimed
 *  footprint (at 80% of the summed radii — a light nestle reads painterly,
 *  a full stack reads broken). */
function makeSolids() {
  const solids: { x: number; y: number; rad: number }[] = [];
  return {
    clears(x: number, y: number, rad: number): boolean {
      for (const s of solids) {
        const dx = s.x - x;
        const dy = s.y - y;
        const m = (s.rad + rad) * 0.8;
        if (dx * dx + dy * dy < m * m) return false;
      }
      return true;
    },
    add(x: number, y: number, rad: number) {
      solids.push({ x, y, rad });
    },
  };
}

const pickWeighted = (
  spec: BiomeSpec,
  seed: string
): DoodadKind => {
  const total = spec.scatter.reduce((s, e) => s + e.weight, 0);
  let r = hash01(seed) * total;
  for (const e of spec.scatter) {
    r -= e.weight;
    if (r <= 0) return e.kind;
  }
  return spec.scatter[spec.scatter.length - 1].kind;
};

function clearsNodes(
  x: number,
  y: number,
  pts: { x: number; y: number }[]
): boolean {
  for (const p of pts) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < MIN_NODE_DIST * MIN_NODE_DIST) return false;
  }
  return true;
}

/** All world-map doodads, y-sorted for painter's-order overlap: the hero
 *  landmarks first (so everything else keeps clear of them), a dense themed
 *  scatter around each charted node (separation-aware — props never stack),
 *  and a global tuft/pebble pass over the whole map (colored by the nearest
 *  biome). Uncharted regions get nothing — bare fog terrain. */
export function worldDoodads(nodes: TrailNode[], H: number): DoodadPlacement[] {
  const pts = nodes.map((n) => ({ ...n, x: n.x * 100, y: n.y * H }));
  const out: DoodadPlacement[] = [];
  const solids = makeSolids();

  // Hero landmarks FIRST — the scatter respects them.
  for (const p of pts) {
    if (p.uncharted) continue;
    const spec = ATLAS_BIOMES[p.id];
    for (const h of spec.heroes) {
      const x = p.x + h.dx;
      const y = p.y + h.dy;
      solids.add(x, y, DOODAD_FOOT[h.kind] * h.scale);
      out.push({
        kind: h.kind,
        x,
        y,
        scale: h.scale,
        ground: spec.ground,
        dungeonId: p.id,
        hero: true,
      });
    }
  }

  // Themed scatter per charted region.
  for (const p of pts) {
    if (p.uncharted) continue;
    const spec = ATLAS_BIOMES[p.id];
    let placed = 0;
    for (let i = 0; i < 260 && placed < 24; i++) {
      const a = hash01(`${p.id}:${i}:a`) * Math.PI * 2;
      const r = MIN_NODE_DIST + Math.sqrt(hash01(`${p.id}:${i}:r`)) * 17;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r * 0.8;
      if (x < 3 || x > 97 || y < 3 || y > H - 3) continue;
      if (!clearsNodes(x, y, pts)) continue;
      const kind = pickWeighted(spec, `${p.id}:${i}:k`);
      const scale = 0.75 + hash01(`${p.id}:${i}:s`) * 0.5;
      const rad = DOODAD_FOOT[kind] * scale;
      if (rad > 0 && !solids.clears(x, y, rad)) continue;
      if (rad > 0) solids.add(x, y, rad);
      out.push({
        kind,
        x,
        y,
        scale,
        ground: spec.ground,
        dungeonId: p.id,
        tint: Math.round((hash01(`${p.id}:${i}:t`) - 0.5) * 22),
      });
      placed++;
    }
  }

  // Global ground clutter, edge to edge (nests under anything harmlessly).
  for (let i = 0; i < 150; i++) {
    const x = 3 + hash01(`clutter-x/${i * 13 + 5}`) * 94;
    const y = 3 + hash01(`ycl~${i * 29 + 11}`) * (H - 6);
    if (!clearsNodes(x, y, pts)) continue;
    let best = pts[0];
    let bd = Infinity;
    for (const p of pts) {
      const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d2 < bd) {
        bd = d2;
        best = p;
      }
    }
    if (best.uncharted) continue;
    out.push({
      kind: hash01(`clk:${i}`) < 0.6 ? "tuft" : "pebble",
      x,
      y,
      scale: 0.8,
      ground: ATLAS_BIOMES[best.id].ground,
      dungeonId: best.id,
      tint: Math.round((hash01(`clt:${i}`) - 0.5) * 18),
    });
  }

  out.sort((a, b) => a.y - b.y);
  return out;
}

/** A floor doodad must also keep clear of the serpentine trail; segment
 *  midpoints approximate the curve (the CR spline hugs its polyline). */
export const MIN_TRAIL_DIST = 6.3;

/** Floor-view doodads: the dungeon's kit at ×1.4 scale scattered across the
 *  whole ground (trail corridor kept clear), plus its hero prop stamped at
 *  up to three map corners — the Bonefields' giant tombstones et al. */
export function floorDoodads(
  dungeonId: string,
  nodes: TrailNode[],
  H: number
): DoodadPlacement[] {
  const spec = ATLAS_BIOMES[dungeonId];
  const pts = nodes.map((n) => ({ x: n.x * 100, y: n.y * H }));
  const mids: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    mids.push({
      x: (pts[i].x + pts[i + 1].x) / 2,
      y: (pts[i].y + pts[i + 1].y) / 2,
    });
  }
  const clearsTrail = (x: number, y: number) => {
    for (const m of mids) {
      const dx = m.x - x;
      const dy = m.y - y;
      if (dx * dx + dy * dy < MIN_TRAIL_DIST * MIN_TRAIL_DIST) return false;
    }
    return true;
  };

  const out: DoodadPlacement[] = [];
  const solids = makeSolids();

  // Boss-lair landmark first of all (the Fallen Cathedral's church looms
  // beside the deepest node): authored offset, mirrored if the spot is
  // blocked, and it wins its space before the corner heroes and scatter.
  if (spec.bossProp && pts.length > 0) {
    const bp = spec.bossProp;
    const boss = pts[pts.length - 1];
    for (const sx of [1, -1]) {
      const x = boss.x + bp.dx * sx;
      const y = boss.y + bp.dy;
      if (x < 6 || x > 94 || y < 6 || y > H - 6) continue;
      if (!clearsNodes(x, y, pts) || !clearsTrail(x, y)) continue;
      const rad = DOODAD_FOOT[bp.kind] * bp.scale;
      if (!solids.clears(x, y, rad)) continue;
      solids.add(x, y, rad);
      out.push({
        kind: bp.kind,
        x,
        y,
        scale: bp.scale,
        ground: spec.ground,
        dungeonId,
        hero: true,
      });
      break;
    }
  }

  // Hero props next, at the corners (first three spots that clear the
  // trail/nodes), so the scatter keeps clear of the landmarks. Top-corner
  // spots sit low enough (and modestly scaled) that even the tallest hero —
  // the Wilds' pineBig, the Spire's tower — clears the viewBox top edge
  // instead of poking above it and getting sliced flat by the map frame.
  // heroes[last]: a dungeon whose showpiece hero is first (the Cathedral's
  // church) keeps its old corner prop for the floor scatter. `floorCorner`
  // overrides that outright (the Depths' mounds, absent from its world map).
  const lastHero = spec.heroes[spec.heroes.length - 1];
  const hero = spec.floorCorner ?? { kind: lastHero.kind, scale: lastHero.scale };
  const corners: [number, number, number][] = [
    [14, 22, 1.2],
    [86, 24, 1.15],
    [87, H - 18, 1.35],
    [13, H - 24, 1.25],
    [50, H - 8, 1.1],
    [50, 18, 1.0],
  ];
  let stamped = 0;
  for (const [x, y, s] of corners) {
    if (stamped >= 3) break;
    if (!clearsNodes(x, y, pts) || !clearsTrail(x, y)) continue;
    const scale = s * hero.scale;
    const rad = DOODAD_FOOT[hero.kind] * scale;
    if (!solids.clears(x, y, rad)) continue;
    solids.add(x, y, rad);
    out.push({
      kind: hero.kind,
      x,
      y,
      scale,
      ground: spec.ground,
      dungeonId,
      hero: true,
    });
    stamped++;
  }

  let placed = 0;
  for (let i = 0; i < 700 && placed < 52; i++) {
    const x = 5 + hash01(`floor-x/${i * 13 + 5}`) * 90;
    const y = 6 + hash01(`yfd~${i * 29 + 11}`) * (H - 12);
    if (!clearsNodes(x, y, pts) || !clearsTrail(x, y)) continue;
    // Mix the biome kit with ground clutter so floors feel lived-in.
    const kind =
      hash01(`fdk:${dungeonId}:${i}`) < 0.25
        ? hash01(`fdc:${i}`) < 0.6
          ? "tuft"
          : "pebble"
        : pickWeighted(spec, `${dungeonId}:fd${i}:k`);
    const scale = (0.9 + hash01(`${dungeonId}:fd${i}:s`) * 0.6) * 1.4;
    const rad = DOODAD_FOOT[kind] * scale;
    if (rad > 0 && !solids.clears(x, y, rad)) continue;
    if (rad > 0) solids.add(x, y, rad);
    out.push({
      kind,
      x,
      y,
      scale,
      ground: spec.ground,
      dungeonId,
      tint: Math.round((hash01(`${dungeonId}:fd${i}:t`) - 0.5) * 22),
    });
    placed++;
  }

  out.sort((a, b) => a.y - b.y);
  return out;
}
