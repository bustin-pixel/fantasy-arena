// ============================================================================
// Outro cinematic specs — the post-victory gather, tested headlessly.
//
// This is a pure lerper (deliberately NOT MovementSystem), so the property that
// matters is assertable without a canvas: NOBODY TELEPORTS. A hero must never
// move further in one step than a step's worth of walking.
//
// That's the bug these pin. `finish()` snaps everyone to their exact slot, so
// any hero who stopped short of their mark popped that distance the moment the
// slowest one landed — the whole band hitching into place together. The arrive
// deadzone is what left them short.
// ============================================================================

import { describe, expect, it } from "vitest";
import { OutroCinematic } from "@/hooks/OutroCinematic";
import { battleState, place } from "@/engine/__tests__/helpers";

const WALK_SPEED = 120; // field px/s — mirrors OutroCinematic's constant
const FRAME = 16; // ms, ~60fps
/** The furthest a hero can legitimately travel in one frame, plus a hair for
 *  floating-point slop. Anything beyond this is a snap, not a walk. */
const MAX_STEP = (WALK_SPEED * FRAME) / 1000 + 0.01;

/** A scene with a warband scattered far from the chest, so they all have a real
 *  walk ahead of them and arrive at DIFFERENT times (the case that pops). */
function scene() {
  const s = battleState(1);
  place(s, "knight", "player", 60, 700);
  place(s, "archer", "player", 420, 690);
  place(s, "warrior", "player", 240, 710);
  place(s, "mage", "player", 100, 660);
  return s;
}

/** Drive the gather to completion, returning the largest single-frame jump any
 *  hero made. */
function largestJump(run: (o: OutroCinematic) => void): number {
  const s = scene();
  const outro = new OutroCinematic(s);
  const players = s.units.filter((u) => u.team === "player");
  run(outro);

  let worst = 0;
  let settled = false;
  for (let i = 0; i < 600 && !settled; i++) {
    const before = players.map((u) => ({ x: u.pos.x, y: u.pos.y }));
    outro.step(FRAME);
    players.forEach((u, j) => {
      const d = Math.hypot(u.pos.x - before[j].x, u.pos.y - before[j].y);
      if (d > worst) worst = d;
    });
    // Settled once nobody is moving any more.
    settled = players.every(
      (u, j) => u.pos.x === before[j].x && u.pos.y === before[j].y
    );
  }
  return worst;
}

describe("the gather never teleports anyone", () => {
  it("walking to the reward chest: every frame is a step, not a snap", () => {
    const worst = largestJump((o) => o.gatherAtChest("wooden", () => {}));
    expect(worst).toBeLessThanOrEqual(MAX_STEP);
  });

  it("walking to the campfire: same", () => {
    const worst = largestJump((o) => o.gatherAtCamp(() => {}));
    expect(worst).toBeLessThanOrEqual(MAX_STEP);
  });

  it("the band actually arrives (the gather settles and calls back)", () => {
    const s = scene();
    const outro = new OutroCinematic(s);
    let settled = false;
    outro.gatherAtChest("wooden", () => {
      settled = true;
    });
    for (let i = 0; i < 600 && !settled; i++) outro.step(FRAME);
    expect(settled).toBe(true);
  });

  it("an explicit finish() is still allowed to snap (reduced motion / impatient tap)", () => {
    // finish() is the deliberate escape hatch — it SHOULD place everyone at
    // once. The specs above prove the normal walk never reaches it mid-stride.
    const s = scene();
    const outro = new OutroCinematic(s);
    let settled = false;
    outro.gatherAtChest("wooden", () => {
      settled = true;
    });
    outro.finish();
    expect(settled).toBe(true);
  });
});
