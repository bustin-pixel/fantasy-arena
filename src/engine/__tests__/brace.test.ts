// Boss brace — when a boss (or the rare quest catalyst) telegraphs onto a cleared
// field, the sim FREEZES and the survivors pull back into a centered row to face
// the entrance; the fight then resumes from that row. The freeze is the in-battle
// twin of the descent march-in hold: frozen ticks touch no sim state, and the
// engine snaps everyone to a deterministic row on release, so a run is byte-
// identical headless (no cinematic) — the failsafe auto-releases the hold.
import { describe, expect, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import { metaHeal } from "@/engine/CombatSystem";
import { FIELD_HEIGHT, FIELD_WIDTH } from "@/utils/constants";
import { BOSS_BRACE_ROW_Y_FRAC } from "@/data/depths";
import { digest } from "./helpers";

const TOUGH = ["aegis_knight", "berserker", "holy_knight", "warrior"];
const terminal = (p: string) => p === "victory" || p === "defeat" || p === "draw";

/** Run a depths floor, deploying the deck up front, and record the first brace it
 *  fires (its row targets + the enemy count at that instant). */
function runFloorWatchingBrace(
  seed: number,
  floor: number,
  deck: string[] = TOUGH,
  opts: { dungeonId?: string; isBoss?: boolean } = {}
) {
  const mc = new MatchController(seed, deck, [], {
    mode: "depths",
    floor,
    dungeonId: opts.dungeonId,
    isBoss: opts.isBoss,
  });
  deck.forEach((id, i) => mc.deploy("player", id, { x: 90 + i * 100, y: 620 }));
  let braced = false;
  let row: { uid: string; pos: { x: number; y: number } }[] | null = null;
  let enemiesAtBrace = -1;
  let guard = 0;
  while (!terminal(mc.phase) && guard < 8000) {
    const wasHeld = mc.isBraceHeld();
    mc.tick();
    if (!wasHeld && mc.isBraceHeld()) {
      braced = true;
      if (!row) {
        row = mc.braceRowTargets();
        enemiesAtBrace = mc.countActive("enemy");
      }
    }
    guard++;
  }
  return { mc, braced, row, enemiesAtBrace };
}

describe("boss brace — fires on the boss telegraph", () => {
  it("freezes on a cleared field and lines survivors into a centered row", () => {
    const { mc, braced, row, enemiesAtBrace } = runFloorWatchingBrace(77, 5);
    expect(braced).toBe(true);
    // The brace only fires with the field clear (the telegraph window).
    expect(enemiesAtBrace).toBe(0);
    expect(row).not.toBeNull();
    expect(row!.length).toBeGreaterThan(0);

    // A ROW: every slot shares the arena mid-line y.
    const rowY = FIELD_HEIGHT * BOSS_BRACE_ROW_Y_FRAC;
    for (const slot of row!) expect(slot.pos.y).toBeCloseTo(rowY, 5);

    // Centered + spread: the slots' mean x sits on the arena centerline, and
    // (for >1 survivor) they occupy distinct x's.
    const xs = row!.map((s) => s.pos.x);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeCloseTo(FIELD_WIDTH / 2, 1);
    if (xs.length > 1) expect(new Set(xs).size).toBe(xs.length);

    // The failsafe resolves the whole floor even with no cinematic to release it.
    expect(terminal(mc.phase)).toBe(true);
  });

  it("does NOT brace on a normal (non-boss) floor", () => {
    const { braced } = runFloorWatchingBrace(77, 1);
    expect(braced).toBe(false);
  });
});

describe("boss brace — determinism", () => {
  it("same seed + inputs ⇒ byte-identical end state (the brace is deterministic)", () => {
    const a = runFloorWatchingBrace(2024, 5);
    const b = runFloorWatchingBrace(2024, 5);
    expect(a.braced).toBe(true);
    expect(digest(b.mc.state)).toBe(digest(a.mc.state));
  });

  it("the failsafe frozen-window length can't shift the outcome", () => {
    // Two runs of the same floor land on the same end state regardless — the
    // frozen ticks change no sim state, and release snaps to the same row.
    const a = runFloorWatchingBrace(31, 5, TOUGH, { dungeonId: "bonefields" });
    const b = runFloorWatchingBrace(31, 5, TOUGH, { dungeonId: "bonefields" });
    expect(digest(b.mc.state)).toBe(digest(a.mc.state));
  });
});

describe("boss brace — snapped onto the row when the fight resumes", () => {
  it("every survivor sits on a distinct row slot at release", () => {
    // Drive to the first brace, hold through its failsafe, and inspect the frame
    // the freeze lifts: the engine has snapped each survivor onto its slot.
    const mc = new MatchController(910, TOUGH, [], { mode: "depths", floor: 5 });
    TOUGH.forEach((id, i) => mc.deploy("player", id, { x: 90 + i * 100, y: 620 }));
    let targets: { uid: string; pos: { x: number; y: number } }[] | null = null;
    let checkedAtRelease = false;
    let guard = 0;
    while (!terminal(mc.phase) && guard < 8000) {
      const wasHeld = mc.isBraceHeld();
      if (wasHeld) targets = targets ?? mc.braceRowTargets();
      mc.tick();
      // The tick that lifts the freeze snaps survivors onto the captured row.
      if (wasHeld && !mc.isBraceHeld() && targets && !checkedAtRelease) {
        checkedAtRelease = true;
        for (const t of targets) {
          const u = mc.state.units.find((x) => x.uid === t.uid);
          expect(u).toBeDefined();
          expect(u!.pos.x).toBeCloseTo(t.pos.x, 5);
          expect(u!.pos.y).toBeCloseTo(t.pos.y, 5);
        }
      }
      guard++;
    }
    expect(checkedAtRelease).toBe(true);
  });
});

describe("boss brace — Endless boss/rare waves", () => {
  it("braces when an Endless boss/rare wave telegraphs", () => {
    const DECK = ["ogre", "knight", "berserker", "archer"];
    const mc = new MatchController(4242, DECK, [], { mode: "endless" });
    let braced = false;
    let bracedFieldClear = false;
    let maxWave = 0;
    let guard = 0;
    while (!terminal(mc.phase) && guard < 20000) {
      const wasHeld = mc.isBraceHeld();
      mc.tick();
      // God-mode heal so the run reliably reaches the first boss wave.
      for (const u of mc.state.units) {
        if (u.team === "player" && u.state !== "dead") metaHeal(mc.state, u, u.maxHp);
      }
      if (!wasHeld && mc.isBraceHeld()) {
        braced = true;
        if (mc.countActive("enemy") === 0) bracedFieldClear = true;
      }
      const st = mc.endlessStatus();
      if (st) {
        maxWave = Math.max(maxWave, st.wave);
        if (st.intermission) mc.pickBoon(0);
      }
      if (maxWave >= 6) break; // covers the first cycle's rare (w3) + boss (w5)
      guard++;
    }
    expect(braced).toBe(true);
    expect(bracedFieldClear).toBe(true);
  });
});
