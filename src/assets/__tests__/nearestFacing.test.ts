import { describe, expect, it } from "vitest";
import { DIRS, nearestFacingWithArt, type Dir8 } from "@/assets/imageSprites";

/** Build an art map holding a dummy value at each listed facing. */
function arts(...dirs: Dir8[]): Partial<Record<Dir8, unknown>> {
  const out: Partial<Record<Dir8, unknown>> = {};
  for (const d of dirs) out[d] = 1;
  return out;
}

describe("nearestFacingWithArt", () => {
  it("resolves every facing to itself on a full 8-facing unit (ogre/knight)", () => {
    const full = arts(...DIRS);
    for (let i = 0; i < 8; i++) {
      expect(nearestFacingWithArt(full, i)).toBe(DIRS[i]);
    }
  });

  it("returns null when there is no art at all", () => {
    expect(nearestFacingWithArt({}, 0)).toBeNull();
  });

  it("handles out-of-range and negative dir indices like the lookup does", () => {
    const full = arts(...DIRS);
    expect(nearestFacingWithArt(full, 8)).toBe("s");
    expect(nearestFacingWithArt(full, -1)).toBe("sw");
    expect(nearestFacingWithArt(full, 9)).toBe("se");
  });

  it("snaps every cardinal onto a diagonal-4 unit", () => {
    const diag = arts("se", "ne", "sw", "nw");
    // s and n sit between two equally-southern diagonals: index tie-break.
    expect(nearestFacingWithArt(diag, DIRS.indexOf("s"))).toBe("se");
    expect(nearestFacingWithArt(diag, DIRS.indexOf("n"))).toBe("ne");
    // e and w tie between a southern and a northern diagonal: camera-facing
    // (southern) candidate wins.
    expect(nearestFacingWithArt(diag, DIRS.indexOf("e"))).toBe("se");
    expect(nearestFacingWithArt(diag, DIRS.indexOf("w"))).toBe("sw");
    // Diagonals resolve to themselves.
    for (const d of ["se", "ne", "sw", "nw"] as const) {
      expect(nearestFacingWithArt(diag, DIRS.indexOf(d))).toBe(d);
    }
  });

  it("resolves any facing onto s/n-only death art (ogre/knight death)", () => {
    const death = arts("s", "n");
    expect(nearestFacingWithArt(death, DIRS.indexOf("se"))).toBe("s");
    expect(nearestFacingWithArt(death, DIRS.indexOf("sw"))).toBe("s");
    expect(nearestFacingWithArt(death, DIRS.indexOf("ne"))).toBe("n");
    expect(nearestFacingWithArt(death, DIRS.indexOf("nw"))).toBe("n");
    // e/w sit exactly between s and n: the camera-facing s wins.
    expect(nearestFacingWithArt(death, DIRS.indexOf("e"))).toBe("s");
    expect(nearestFacingWithArt(death, DIRS.indexOf("w"))).toBe("s");
  });

  it("future diagonal death set (se/ne + mirrors) covers every facing", () => {
    const death = arts("se", "ne", "sw", "nw");
    for (let i = 0; i < 8; i++) {
      expect(nearestFacingWithArt(death, i)).not.toBeNull();
    }
  });

  it("prefers ring distance over southernness", () => {
    // Requested n: ne is one step away, s is four — distance must win even
    // though s is maximally camera-facing.
    expect(nearestFacingWithArt(arts("s", "ne"), DIRS.indexOf("n"))).toBe("ne");
  });
});
