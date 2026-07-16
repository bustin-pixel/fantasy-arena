// ============================================================================
// Atlas layout — pure geometry + node-state derivation for the Dungeon Atlas
// (the winding-trail map that replaced the flat dungeon/floor list sheets).
//
// Two coordinate jobs live here, both persistence-free and DOM-free:
//   • WHERE nodes sit — hand-authored points for the 9-dungeon world trail
//     (authored once; a new dungeon only needs one more point) and a
//     procedural serpentine for every dungeon's floor trail (zero authoring).
//   • HOW the trail bends — centripetal Catmull-Rom through the points,
//     emitted as SVG cubic path strings, with per-segment sub-paths so the
//     unlock ceremony can stroke-draw ONE segment and slide the marker along
//     it via getPointAtLength.
//
// All positions are normalized 0..1 (x across, y down; 0 = top). The atlas
// component scales them into its viewBox and positions the DOM node buttons
// from the SAME numbers, so the SVG curve and the clickable nodes can't drift.
// ============================================================================

import type { Vec2 } from "@/types";
import {
  DUNGEONS,
  DUNGEON_IDS,
  isBossFloorIn,
  isDungeonUnlocked,
  type Dungeon,
} from "./dungeons";

// ---------------------------------------------------------------------------
// World trail — authored points + edges derived from the gate chain.
// ---------------------------------------------------------------------------

/** Aspect of the world map box: height ÷ width. The 9-node serpentine wants
 *  roughly 1.7 screens of parchment on a phone; the atlas scrolls it. */
export const WORLD_ASPECT = 1.7;

/** Normalized (0..1) positions, authored bottom-to-top: the Depths (the
 *  entrance) at the bottom edge, the trunk winding upward, and the endgame
 *  fork branching left/right at the top. Every dungeon id MUST have a point
 *  (a test enforces the bijection with DUNGEONS). */
export const WORLD_POINTS: Record<string, Vec2> = {
  depths: { x: 0.5, y: 0.94 },
  bonefields: { x: 0.24, y: 0.83 },
  wilds: { x: 0.68, y: 0.72 },
  overgrowth: { x: 0.3, y: 0.61 },
  sealed_vault: { x: 0.62, y: 0.5 },
  deep_forge: { x: 0.28, y: 0.39 },
  eclipse_spire: { x: 0.52, y: 0.28 },
  fallen_cathedral: { x: 0.24, y: 0.12 },
  rogues_den: { x: 0.78, y: 0.12 },
};

/** Every gate edge as [parentId, childId]. Derived from the registry, so the
 *  fork (two children of eclipse_spire) — and any future branch — is free. */
export function worldEdges(): [string, string][] {
  return Object.values(DUNGEONS)
    .filter((d) => d.gate)
    .map((d) => [d.gate!.dungeonId, d.id]);
}

/** The world trail decomposed for drawing: one trunk polyline from the root
 *  down the single-child chain, then each branch as its own point run STARTING
 *  at its fork parent (so the branch curve visually leaves the trunk node).
 *  Branches recurse — a chain hanging off a fork child stays one branch. */
export function worldTrailPlan(): { trunk: string[]; branches: string[][] } {
  const children = new Map<string, string[]>();
  for (const [from, to] of worldEdges()) {
    const list = children.get(from) ?? [];
    list.push(to);
    children.set(from, list);
  }
  const root = Object.values(DUNGEONS).find((d) => !d.gate);
  if (!root) throw new Error("Dungeon gate chain has no root");

  /** Follow single-child links from `id` (exclusive) as far as they go. */
  const chainFrom = (id: string): string[] => {
    const out: string[] = [];
    let kids = children.get(id) ?? [];
    while (kids.length === 1) {
      out.push(kids[0]);
      kids = children.get(kids[0]) ?? [];
    }
    return out;
  };

  const trunk = [root.id, ...chainFrom(root.id)];
  const forkId = trunk[trunk.length - 1];
  const branches = (children.get(forkId) ?? []).map((child) => [
    forkId,
    child,
    ...chainFrom(child),
  ]);
  return { trunk, branches };
}

// ---------------------------------------------------------------------------
// Floor trails — procedural serpentine, deterministic per dungeon.
// ---------------------------------------------------------------------------

/** Aspect of a floor map box (5-ish nodes fit one phone screen). */
export const FLOOR_ASPECT = 1.25;

/** Tiny deterministic string hash → 0..1 (per-dungeon trail jitter; also the
 *  one hashing convention for the biome layer's scatter — see atlasBiomes). */
export function hash01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 10_000) / 10_000;
}

/** A winding bottom-to-top trail for `count` floor nodes: alternating
 *  left/right serpentine with small per-dungeon jitter (hashed from the
 *  dungeonId) so every dungeon's trail bends slightly differently. Pure and
 *  deterministic — same inputs, same trail. Handles any count ≥ 1. */
export function floorTrailPoints(dungeonId: string, count: number): Vec2[] {
  const points: Vec2[] = [];
  const top = 0.1;
  const bottom = 0.9;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const y = bottom - t * (bottom - top);
    const baseX = i % 2 === 0 ? 0.32 : 0.68;
    const jx = (hash01(`${dungeonId}:x${i}`) - 0.5) * 0.16;
    const jy = (hash01(`${dungeonId}:y${i}`) - 0.5) * 0.04;
    points.push({
      x: Math.min(0.85, Math.max(0.15, baseX + jx)),
      y: Math.min(0.95, Math.max(0.05, y + jy)),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Curve builder — centripetal Catmull-Rom → SVG cubic path.
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One cubic bezier segment p1→p2 whose control points come from the
 *  centripetal Catmull-Rom through (p0, p1, p2, p3). Centripetal (alpha 0.5)
 *  avoids the loops/overshoot uniform CR produces on unevenly spaced points. */
function crSegment(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): [Vec2, Vec2] {
  const alpha = 0.5;
  const dist = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);
  const d1 = Math.pow(dist(p0, p1), alpha);
  const d2 = Math.pow(dist(p1, p2), alpha);
  const d3 = Math.pow(dist(p2, p3), alpha);
  const eps = 1e-4;
  // Degenerate spacing (duplicate points) → fall back to a straight segment.
  if (d2 < eps) return [p1, p2];
  const c1 =
    d1 < eps
      ? p1
      : {
          x:
            (p2.x * d1 * d1 -
              p0.x * d2 * d2 +
              p1.x * (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2)) /
            (3 * d1 * (d1 + d2)),
          y:
            (p2.y * d1 * d1 -
              p0.y * d2 * d2 +
              p1.y * (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2)) /
            (3 * d1 * (d1 + d2)),
        };
  const c2 =
    d3 < eps
      ? p2
      : {
          x:
            (p1.x * d3 * d3 -
              p3.x * d2 * d2 +
              p2.x * (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2)) /
            (3 * d3 * (d3 + d2)),
          y:
            (p1.y * d3 * d3 -
              p3.y * d2 * d2 +
              p2.y * (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2)) /
            (3 * d3 * (d3 + d2)),
        };
  return [c1, c2];
}

export interface TrailPath {
  /** The whole trail as one SVG path `d`. */
  d: string;
  /** Per-segment sub-paths (segments[i] = points[i] → points[i+1]) built from
   *  the SAME control points as `d`, so a segment overlays the trail exactly —
   *  the unlock draw-in strokes one of these, and the marker slide samples it
   *  with getPointAtLength. */
  segments: string[];
}

/** Smooth trail through `points` (already in viewBox units). */
export function trailPath(points: Vec2[]): TrailPath {
  if (points.length < 2) return { d: "", segments: [] };
  const segments: string[] = [];
  let d = `M ${round2(points[0].x)} ${round2(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const [c1, c2] = crSegment(p0, p1, p2, p3);
    const curve = `C ${round2(c1.x)} ${round2(c1.y)}, ${round2(c2.x)} ${round2(
      c2.y
    )}, ${round2(p2.x)} ${round2(p2.y)}`;
    d += ` ${curve}`;
    segments.push(`M ${round2(p1.x)} ${round2(p1.y)} ${curve}`);
  }
  return { d, segments };
}

// ---------------------------------------------------------------------------
// Node-state derivation — pure functions of the save's cleared-floor marks.
// ---------------------------------------------------------------------------

export type NodeState = "completed" | "current" | "locked";

export interface TrailNode {
  /** dungeonId on the world trail; `${dungeonId}:${floor}` on a floor trail. */
  id: string;
  /** Normalized 0..1 position (shared by the SVG curve and the DOM button). */
  x: number;
  y: number;
  state: NodeState;
  /** Boss floor (floor trail) / endgame fork dungeon (world trail): ☠ badge. */
  boss?: boolean;
  /** Fog of war (world trail): locked AND its gate dungeon is itself locked —
   *  a shrouded "uncharted" smudge, name and gate hidden. The first locked
   *  dungeon past the frontier stays charted (its gate parent is known). */
  uncharted?: boolean;
  label: string;
}

/** World-trail nodes in gate-chain order. `clearedFloorOf` abstracts the save
 *  (same contract as isDungeonUnlocked). After the fork gate clears, BOTH fork
 *  dungeons are legitimately "current" — the player picks their path. */
export function worldNodes(
  clearedFloorOf: (dungeonId: string) => number
): TrailNode[] {
  // Parents-first (DUNGEON_IDS is gate-chain ordered), so each node can read
  // its gate parent's already-computed state for the fog-of-war flag.
  const stateOf = new Map<string, NodeState>();
  return DUNGEON_IDS.map((id) => {
    const d = DUNGEONS[id];
    const p = WORLD_POINTS[id];
    if (!p) throw new Error(`No WORLD_POINTS entry for dungeon: ${id}`);
    const state: NodeState =
      clearedFloorOf(id) >= d.floors
        ? "completed"
        : isDungeonUnlocked(d, clearedFloorOf)
          ? "current"
          : "locked";
    stateOf.set(id, state);
    const uncharted =
      state === "locked" &&
      d.gate != null &&
      stateOf.get(d.gate.dungeonId) === "locked";
    return {
      id,
      x: p.x,
      y: p.y,
      state,
      uncharted,
      label: uncharted ? "Uncharted" : d.name,
    };
  });
}

/** Floor-trail nodes for one dungeon, floor 1 (bottom) to the deepest floor.
 *  Completed = cleared (replayable); current = the next uncleared floor,
 *  capped at the deepest; a fully cleared dungeon has no current floor. */
export function floorNodes(dungeon: Dungeon, cleared: number): TrailNode[] {
  const points = floorTrailPoints(dungeon.id, dungeon.floors);
  const currentFloor = Math.min(cleared + 1, dungeon.floors);
  const nodes: TrailNode[] = [];
  for (let f = 1; f <= dungeon.floors; f++) {
    const state: NodeState =
      f <= cleared ? "completed" : f === currentFloor ? "current" : "locked";
    nodes.push({
      id: `${dungeon.id}:${f}`,
      x: points[f - 1].x,
      y: points[f - 1].y,
      state,
      boss: isBossFloorIn(dungeon, f),
      label: `Floor ${f}`,
    });
  }
  return nodes;
}

/** Where the player marker stands: the first "current" node, else the LAST
 *  completed one (a fully cleared trail), else the first node.
 *
 *  `entryOnFullClear` (floor view): a fully-cleared trail parks the marker back
 *  at the ENTRANCE instead of the boss — you re-enter a completed dungeon at
 *  floor 1 for a fresh run, so "you are here" is the start, not the deepest
 *  floor you once reached. The world trail leaves this off (it stays on the
 *  furthest dungeon you've conquered). */
export function markerNodeId(
  nodes: TrailNode[],
  entryOnFullClear = false
): string {
  const current = nodes.find((n) => n.state === "current");
  if (current) return current.id;
  if (entryOnFullClear) return nodes[0]?.id ?? "";
  const completed = nodes.filter((n) => n.state === "completed");
  if (completed.length > 0) return completed[completed.length - 1].id;
  return nodes[0]?.id ?? "";
}
