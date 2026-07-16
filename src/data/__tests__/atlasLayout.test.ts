// ============================================================================
// atlasLayout spec — the Dungeon Atlas's pure geometry + node-state layer.
// Guards the two things that would fail silently in the UI: a dungeon missing
// its authored world point (NaN positions), and node-state boundaries
// (locked/current/completed, the fork double-current, the floor cap).
// ============================================================================

import { describe, expect, it } from "vitest";
import { DUNGEONS, DUNGEON_IDS, getDungeon } from "@/data/dungeons";
import {
  WORLD_POINTS,
  floorNodes,
  floorTrailPoints,
  markerNodeId,
  trailPath,
  worldEdges,
  worldNodes,
  worldTrailPlan,
} from "@/data/atlasLayout";

/** clearedFloorOf stub from a partial progress map (missing = 0). */
const clearedOf =
  (progress: Record<string, number>) =>
  (id: string): number =>
    progress[id] ?? 0;

/** Progress map with the whole trunk (through eclipse_spire) fully cleared. */
function trunkCleared(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of worldTrailPlan().trunk) out[id] = getDungeon(id).floors;
  return out;
}

describe("world trail data", () => {
  it("WORLD_POINTS and DUNGEONS are a bijection", () => {
    expect(Object.keys(WORLD_POINTS).sort()).toEqual(
      Object.keys(DUNGEONS).sort()
    );
  });

  it("all world points are inside the normalized box", () => {
    for (const p of Object.values(WORLD_POINTS)) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
  });

  it("worldEdges holds every gate, with both fork children under the spire", () => {
    const edges = worldEdges();
    // Every dungeon except the gateless root contributes one edge.
    expect(edges.length).toBe(DUNGEON_IDS.length - 1);
    const forkChildren = edges
      .filter(([from]) => from === "eclipse_spire")
      .map(([, to]) => to)
      .sort();
    expect(forkChildren).toEqual(["fallen_cathedral", "rogues_den"]);
  });

  it("worldTrailPlan: trunk runs depths → eclipse_spire, two 2-node branches", () => {
    const { trunk, branches } = worldTrailPlan();
    expect(trunk[0]).toBe("depths");
    expect(trunk[trunk.length - 1]).toBe("eclipse_spire");
    // Trunk + branch tails cover every dungeon exactly once.
    const covered = [...trunk, ...branches.flatMap((b) => b.slice(1))].sort();
    expect(covered).toEqual([...DUNGEON_IDS].sort());
    // Each branch starts at the fork node so its curve leaves the trunk.
    for (const b of branches) expect(b[0]).toBe("eclipse_spire");
    expect(branches.length).toBe(2);
  });
});

describe("floorTrailPoints", () => {
  it("is deterministic and returns the requested count", () => {
    const a = floorTrailPoints("bonefields", 5);
    const b = floorTrailPoints("bonefields", 5);
    expect(a).toEqual(b);
    expect(a.length).toBe(5);
  });

  it("stays inside the normalized box and winds bottom-to-top", () => {
    for (const id of DUNGEON_IDS) {
      const pts = floorTrailPoints(id, getDungeon(id).floors);
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0.15);
        expect(p.x).toBeLessThanOrEqual(0.85);
        expect(p.y).toBeGreaterThanOrEqual(0.05);
        expect(p.y).toBeLessThanOrEqual(0.95);
      }
      // Floor 1 sits below the last floor (y grows downward).
      expect(pts[0].y).toBeGreaterThan(pts[pts.length - 1].y);
    }
  });

  it("gives different dungeons different trails (jitter)", () => {
    expect(floorTrailPoints("bonefields", 5)).not.toEqual(
      floorTrailPoints("wilds", 5)
    );
  });

  it("handles tiny counts without NaN", () => {
    expect(floorTrailPoints("depths", 1).length).toBe(1);
    for (const p of floorTrailPoints("depths", 1)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("trailPath", () => {
  const pts = floorTrailPoints("depths", 5).map((p) => ({
    x: p.x * 100,
    y: p.y * 125,
  }));

  it("emits one segment per point pair, all valid path strings", () => {
    const { d, segments } = trailPath(pts);
    expect(d.startsWith("M ")).toBe(true);
    expect(segments.length).toBe(pts.length - 1);
    for (const s of segments) {
      expect(s.startsWith("M ")).toBe(true);
      expect(s).toContain("C ");
      expect(s).not.toContain("NaN");
    }
    expect(d).not.toContain("NaN");
  });

  it("segment endpoints land on the node points", () => {
    const { segments } = trailPath(pts);
    for (let i = 0; i < segments.length; i++) {
      const nums = segments[i].match(/-?\d+(\.\d+)?/g)!.map(Number);
      // "M x0 y0 C c1x c1y, c2x c2y, x1 y1" → first pair and last pair.
      expect(nums[0]).toBeCloseTo(pts[i].x, 1);
      expect(nums[1]).toBeCloseTo(pts[i].y, 1);
      expect(nums[nums.length - 2]).toBeCloseTo(pts[i + 1].x, 1);
      expect(nums[nums.length - 1]).toBeCloseTo(pts[i + 1].y, 1);
    }
  });

  it("degenerate inputs return empty rather than throwing", () => {
    expect(trailPath([]).segments).toEqual([]);
    expect(trailPath([{ x: 1, y: 1 }]).d).toBe("");
    // Duplicate points must not divide by zero.
    const dup = trailPath([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    expect(dup.d).not.toContain("NaN");
  });
});

describe("worldNodes state derivation", () => {
  it("fresh save: depths is current, everything gated is locked", () => {
    const nodes = worldNodes(clearedOf({}));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.depths.state).toBe("current");
    for (const id of DUNGEON_IDS.filter((i) => i !== "depths")) {
      expect(byId[id].state).toBe("locked");
    }
  });

  it("clearing a gate completes the parent and opens the child", () => {
    const nodes = worldNodes(clearedOf({ depths: getDungeon("depths").floors }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.depths.state).toBe("completed");
    expect(byId.bonefields.state).toBe("current");
    expect(byId.wilds.state).toBe("locked");
  });

  it("fork: clearing the spire makes BOTH endgame dungeons current", () => {
    const nodes = worldNodes(clearedOf(trunkCleared()));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.fallen_cathedral.state).toBe("current");
    expect(byId.rogues_den.state).toBe("current");
    // Marker stands on the first current node in chain order.
    expect(markerNodeId(nodes)).toBe("fallen_cathedral");
  });

  it("partial progress in a dungeon keeps it current (never re-locks)", () => {
    const nodes = worldNodes(clearedOf({ depths: 2 }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.depths.state).toBe("current");
  });

  it("fog of war: only the first locked dungeon past the frontier is charted", () => {
    const nodes = worldNodes(clearedOf({ depths: getDungeon("depths").floors }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    // Bonefields is current; Wilds is the visible next gate; deeper is fog.
    expect(byId.wilds.uncharted).toBe(false);
    expect(byId.wilds.label).toBe("The Wilds");
    expect(byId.overgrowth.uncharted).toBe(true);
    expect(byId.overgrowth.label).toBe("Uncharted");
    expect(byId.rogues_den.uncharted).toBe(true);
  });

  it("fog of war: fork children are charted once the spire is unlocked", () => {
    // Everything through the Deep Forge cleared → the spire is current, and
    // both fork children become visible locked nodes (parent no longer locked).
    const progress: Record<string, number> = {};
    for (const id of worldTrailPlan().trunk.slice(0, -1)) {
      progress[id] = getDungeon(id).floors;
    }
    const nodes = worldNodes(clearedOf(progress));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.eclipse_spire.state).toBe("current");
    expect(byId.fallen_cathedral.state).toBe("locked");
    expect(byId.fallen_cathedral.uncharted).toBe(false);
    expect(byId.rogues_den.uncharted).toBe(false);
  });

  it("fog of war: unlocked and completed nodes are never shrouded", () => {
    const nodes = worldNodes(clearedOf(trunkCleared()));
    for (const n of nodes) {
      if (n.state !== "locked") expect(n.uncharted).toBe(false);
    }
  });
});

describe("floorNodes state derivation", () => {
  const bonefields = getDungeon("bonefields");

  it("fresh dungeon: floor 1 current, the rest locked", () => {
    const nodes = floorNodes(bonefields, 0);
    expect(nodes[0].state).toBe("current");
    for (const n of nodes.slice(1)) expect(n.state).toBe("locked");
    expect(markerNodeId(nodes)).toBe("bonefields:1");
  });

  it("mid progress: cleared floors completed, next current, rest locked", () => {
    const nodes = floorNodes(bonefields, 2);
    expect(nodes.map((n) => n.state)).toEqual([
      "completed",
      "completed",
      "current",
      "locked",
      "locked",
    ]);
  });

  it("fully cleared: all completed, marker on the last floor", () => {
    const nodes = floorNodes(bonefields, bonefields.floors);
    for (const n of nodes) expect(n.state).toBe("completed");
    expect(markerNodeId(nodes)).toBe(`bonefields:${bonefields.floors}`);
  });

  it("fully cleared with entryOnFullClear: marker returns to the entrance", () => {
    const nodes = floorNodes(bonefields, bonefields.floors);
    // The floor view re-enters at floor 1, so the marker sits on the entrance,
    // not the boss it once ended on.
    expect(markerNodeId(nodes, true)).toBe("bonefields:1");
    // A fresh trail's first node is already "current" — the flag is a no-op there.
    expect(markerNodeId(floorNodes(bonefields, 0), true)).toBe("bonefields:1");
  });

  it("flags the boss floor", () => {
    const nodes = floorNodes(bonefields, 0);
    expect(nodes[nodes.length - 1].boss).toBe(true);
    expect(nodes[0].boss).toBe(false);
  });
});
