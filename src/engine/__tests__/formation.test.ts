// Descent march-in / Regroup — the auto-line-up between dungeon floors.
//
// A formation (the previous floor's deploy-time marks) fields the warband on
// those spots at construction, behind an intro hold; the hook plays a walk-in,
// then releases the hold to run the normal countdown. The player may Regroup to
// scrap the line-up and place manually. These specs pin the deterministic core:
// the hold is a no-op, fielding at marks is byte-identical to manually placing
// the same marks (the anti-drift keystone), and regroup restores manual flow.
import { describe, expect, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import type { FormationMark } from "@/types";
import { DEPLOY_TIME_SEC, PLAYER_ZONE } from "@/utils/constants";
import { digest } from "./helpers";

const DECK = ["knight", "archer", "fire_mage", "ogre"];

/** Marks spread across the player zone, one per deck card (all in-zone). */
const marksFor = (deck: string[]): FormationMark[] =>
  deck.map((defId, i) => ({ defId, pos: { x: 90 + i * 100, y: 600 } }));

/** A depths controller fielded on `formation`, still under the intro hold. */
const heldController = (
  seed: number,
  deck: string[] = DECK,
  formation: FormationMark[] = marksFor(deck)
) => new MatchController(seed, deck, [], { mode: "depths", floor: 1, formation });

/** Drive a controller to a terminal phase (or a generous tick cap). */
function driveToTerminal(mc: MatchController, guardMax = 8000): MatchController {
  let guard = 0;
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < guardMax
  ) {
    mc.tick();
    guard++;
  }
  return mc;
}

/** Living player units, sorted by uid for stable comparison. */
const playerUnits = (mc: MatchController) =>
  mc.state.units
    .filter((u) => u.team === "player")
    .sort((a, b) => (a.uid < b.uid ? -1 : 1));

describe("march-in — fielding on the marks (F1)", () => {
  it("fields the whole warband on its marks, held, hand empty", () => {
    const marks = marksFor(DECK);
    const mc = heldController(1, DECK, marks);

    expect(mc.isIntroHeld()).toBe(true);
    expect(mc.phase).toBe("deployment");
    expect(mc.canRegroup()).toBe(true);
    expect(mc.startCountdownSec()).toBeNull();
    expect(mc.deploySecLeft()).toBeNull();
    expect(mc.playerHand()).toEqual([]);

    const units = playerUnits(mc);
    expect(units).toHaveLength(4);
    // Each mark is occupied by its unit at the exact spot (deck order = uid order).
    marks.forEach((m, i) => {
      expect(units[i].defId).toBe(m.defId);
      expect(units[i].pos.x).toBeCloseTo(m.pos.x, 5);
      expect(units[i].pos.y).toBeCloseTo(m.pos.y, 5);
    });
  });
});

describe("march-in — the hold is a no-op (F2)", () => {
  it("50 held ticks leave the state byte-identical", () => {
    const mc = heldController(2);
    const before = digest(mc.state);
    for (let i = 0; i < 50; i++) mc.tick();
    expect(digest(mc.state)).toBe(before);
    // Still held — nothing released it.
    expect(mc.isIntroHeld()).toBe(true);
    expect(mc.phase).toBe("deployment");
  });
});

describe("march-in — equivalence to manual placement (F3, anti-drift)", () => {
  it("formation+release ≡ manually deploying the same marks (identical digest)", () => {
    const seed = 20260717;
    const marks = marksFor(DECK);

    const a = heldController(seed, DECK, marks);
    a.releaseIntroHold();
    driveToTerminal(a);

    const b = new MatchController(seed, DECK, [], { mode: "depths", floor: 1 });
    marks.forEach((m) => b.deploy("player", m.defId, m.pos));
    driveToTerminal(b);

    expect(digest(b.state)).toBe(digest(a.state));
  });
});

describe("march-in — determinism (F4)", () => {
  it("same seed + formation ⇒ identical end state (facing-sensitive kits included)", () => {
    // engineer + summoner (Druid) read `facing` for spawn-side offsets — the
    // walk-in must leave it byte-identical, so exercise them under the digest.
    const deck = ["engineer", "summoner", "knight", "archer"];
    const run = () => {
      const mc = heldController(4242, deck);
      mc.releaseIntroHold();
      return digest(driveToTerminal(mc).state);
    };
    expect(run()).toBe(run());
  });
});

describe("march-in — release runs the countdown, marks preserved (F5)", () => {
  it("release ⇒ 3s countdown ⇒ battle with units still on their marks", () => {
    const marks = marksFor(DECK);
    const mc = heldController(7, DECK, marks);
    mc.releaseIntroHold();

    // First deployment tick arms the countdown (both sides ready).
    mc.tick();
    expect(mc.startCountdownSec()).toBe(3);

    let guard = 0;
    while (mc.phase === "deployment" && guard < 200) {
      mc.tick();
      guard++;
    }
    expect(mc.phase).toBe("battle");

    // Units held their marks through the whole countdown (no drift before combat).
    const units = playerUnits(mc);
    marks.forEach((m, i) => {
      expect(units[i].pos.x).toBeCloseTo(m.pos.x, 5);
      expect(units[i].pos.y).toBeCloseTo(m.pos.y, 5);
    });
  });
});

describe("regroup — restores the manual flow (F6)", () => {
  it("clears the line-up, returns the hand, re-arms the timer", () => {
    const mc = heldController(9);

    expect(mc.regroup()).toBe(true);
    expect(mc.state.units.filter((u) => u.team === "player")).toHaveLength(0);
    expect(mc.playerHand()).toHaveLength(4);
    expect(mc.deploySecLeft()).toBe(DEPLOY_TIME_SEC);
    expect(mc.startCountdownSec()).toBeNull();
    expect(mc.canRegroup()).toBe(false);
    expect(mc.getPlayerFormation()).toEqual([]);

    // Manual placement then completes an ordinary battle, and the capture now
    // reflects only the manual marks.
    const manual: FormationMark[] = DECK.map((defId, i) => ({
      defId,
      pos: { x: 120 + i * 80, y: 560 },
    }));
    manual.forEach((m) => mc.deploy("player", m.defId, m.pos));
    expect(mc.getPlayerFormation()).toEqual(manual);
    driveToTerminal(mc);
    expect(["victory", "defeat", "draw"]).toContain(mc.phase);
  });
});

describe("regroup — timing invariance (F7)", () => {
  it("regroup at any moment yields identical state after the same placement", () => {
    const manual: FormationMark[] = DECK.map((defId, i) => ({
      defId,
      pos: { x: 100 + i * 90, y: 580 },
    }));
    const afterRegroup = (prep: (mc: MatchController) => void): string => {
      const mc = heldController(31);
      prep(mc);
      mc.regroup();
      manual.forEach((m) => mc.deploy("player", m.defId, m.pos));
      return digest(driveToTerminal(mc).state);
    };

    // X: regroup after 2 held ticks (still under the hold).
    const x = afterRegroup((mc) => {
      mc.tick();
      mc.tick();
    });
    // Y: regroup after releasing + 1 countdown tick.
    const y = afterRegroup((mc) => {
      mc.releaseIntroHold();
      mc.tick();
    });
    expect(x).toBe(y);
  });
});

describe("march-in — kit onSpawn fires at construction (F8)", () => {
  it("an assassin marches in already stealthed", () => {
    const deck = ["assassin", "knight", "archer", "ogre"];
    const mc = heldController(11, deck);
    const assassin = mc.state.units.find((u) => u.defId === "assassin");
    expect(assassin).toBeDefined();
    expect(assassin!.effects.some((e) => e.type === "stealth")).toBe(true);
  });
});

describe("march-in — mark validity (F9)", () => {
  it("a stray defId is skipped; a missing mark is topped up (warband stays whole)", () => {
    // Ghost mark (no such deck card) is ignored — never fields a free unit.
    const ghost: FormationMark[] = [
      { defId: "knight", pos: { x: 90, y: 600 } },
      { defId: "wizard", pos: { x: 190, y: 600 } }, // not in the deck
      { defId: "archer", pos: { x: 290, y: 600 } },
      { defId: "fire_mage", pos: { x: 390, y: 600 } },
      { defId: "ogre", pos: { x: 440, y: 600 } },
    ];
    const a = heldController(13, DECK, ghost);
    expect(a.state.units.filter((u) => u.team === "player")).toHaveLength(4);
    expect(a.state.units.some((u) => u.defId === "wizard")).toBe(false);

    // Missing mark (only 3 of 4) — the fourth card is filled by the spread
    // fallback, so all four are still fielded.
    const short = marksFor(DECK).slice(0, 3);
    const b = heldController(13, DECK, short);
    expect(b.countActive("player")).toBe(4);
    expect(b.state.units.some((u) => u.defId === "ogre")).toBe(true);
  });
});

describe("march-in — out-of-zone marks clamp (F10)", () => {
  it("a mark above the player zone is clamped, and the capture reflects it", () => {
    const deck = ["knight"];
    const mc = heldController(17, deck, [
      { defId: "knight", pos: { x: 200, y: 100 } }, // y=100 is in the ENEMY zone
    ]);
    const knight = mc.state.units.find((u) => u.defId === "knight")!;
    expect(knight.pos.y).toBe(PLAYER_ZONE.top);
    expect(mc.getPlayerFormation()[0].pos.y).toBe(PLAYER_ZONE.top);
  });
});

describe("treasure room — fields on marks, carries them forward (F11)", () => {
  it("fields at the marks, starts in battle, not held, capture = input", () => {
    const marks = marksFor(DECK);
    const mc = new MatchController(3, DECK, [], {
      mode: "depths",
      floor: 2,
      encounter: "treasure_room",
      formation: marks,
    });

    expect(mc.phase).toBe("battle");
    expect(mc.isIntroHeld()).toBe(false);
    const units = playerUnits(mc);
    marks.forEach((m, i) => {
      expect(units[i].defId).toBe(m.defId);
      expect(units[i].pos.x).toBeCloseTo(m.pos.x, 5);
      expect(units[i].pos.y).toBeCloseTo(m.pos.y, 5);
    });
    // The treasure floor is frozen — tick() is a no-op.
    const before = digest(mc.state);
    mc.tick();
    expect(digest(mc.state)).toBe(before);
    // Marks are re-recorded, so the NEXT floor carries the same formation.
    expect(mc.getPlayerFormation()).toEqual(marks);
  });
});
