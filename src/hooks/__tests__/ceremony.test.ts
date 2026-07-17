// ============================================================================
// Ceremony stage-graph specs — the post-victory flow's first tests.
//
// The cinematic itself is canvas and can't be asserted, so the GRAPH is what's
// pinned here: which stage follows which, on every branch (lair / ordinary
// floor / treasure room / reduced motion), and that stray events can't corrupt
// it. These transcribe the behavior that used to live as ad-hoc React state in
// BattleScreen.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  ceremonyStep,
  type CeremonyCtx,
  type CeremonyStage,
} from "@/hooks/ceremony";

const ctx = (over: Partial<CeremonyCtx> = {}): CeremonyCtx => ({
  isBoss: false,
  isTreasureRoom: false,
  hasChest: true,
  reducedMotion: false,
  ...over,
});

/** Drive the graph through a list of events, collecting every stage + effect. */
const run = (
  start: CeremonyStage,
  c: CeremonyCtx,
  events: Parameters<typeof ceremonyStep>[1][]
) => {
  let stage = start;
  const effects: string[] = [];
  for (const e of events) {
    const step = ceremonyStep(stage, e, c);
    stage = step.stage;
    for (const f of step.effects) effects.push(f.kind);
  }
  return { stage, effects };
};

describe("the lair (boss floor) — the run ends here", () => {
  it("a won lair opens the chest ON the floor, and the fallen stay down", () => {
    const step = ceremonyStep("idle", { kind: "resolved" }, ctx({ isBoss: true }));
    expect(step.stage).toBe("chest");
    expect(step.effects).toEqual([
      { kind: "startChest", reviveFallen: false, delayMs: 900 },
    ]);
  });

  it("dismissing the loot surfaces the result card — no campfire, no exits", () => {
    const step = ceremonyStep(
      "chest",
      { kind: "revealDismissed" },
      ctx({ isBoss: true })
    );
    expect(step.stage).toBe("result");
    // Immediate: the loot reveal already gave the beat its pause.
    expect(step.effects).toEqual([{ kind: "showResult", delayMs: 0 }]);
  });

  it("a chestless lair replay skips straight to the result card", () => {
    const step = ceremonyStep(
      "idle",
      { kind: "resolved" },
      ctx({ isBoss: true, hasChest: false })
    );
    expect(step.stage).toBe("result");
    expect(step.effects).toEqual([{ kind: "showResult", delayMs: 700 }]);
  });

  it("reduced motion skips the floor chest even in the lair", () => {
    const step = ceremonyStep(
      "idle",
      { kind: "resolved" },
      ctx({ isBoss: true, reducedMotion: true })
    );
    expect(step.stage).toBe("result");
  });

  it("a LOSS carries no chest, so it routes to the result card like any other", () => {
    // `resolved` fires on defeat/draw too; hasChest is false on every loss.
    const step = ceremonyStep(
      "idle",
      { kind: "resolved" },
      ctx({ isBoss: true, hasChest: false })
    );
    expect(step.stage).toBe("result");
    expect(step.effects).toEqual([{ kind: "showResult", delayMs: 700 }]);
  });
});

describe("an ordinary floor — chest, campfire, choose a path, walk out", () => {
  it("resolving shows the result card first (that's where continue-deeper lives)", () => {
    const step = ceremonyStep("idle", { kind: "resolved" }, ctx());
    expect(step.stage).toBe("result");
    expect(step.effects).toEqual([{ kind: "showResult", delayMs: 700 }]);
  });

  it("the full walk: continue → chest → camp → choice → walkout → handoff", () => {
    const { stage, effects } = run("result", ctx(), [
      { kind: "continueDeeper" },
      { kind: "revealDismissed" },
      { kind: "campSettled" },
      { kind: "exitChosen", dir: "left", encounter: "cursed" },
      { kind: "walkedOff", encounter: "cursed" },
    ]);
    expect(stage).toBe("walkout");
    expect(effects).toEqual(["startChest", "startCamp", "walkOff", "handOff"]);
  });

  it("the band is revived at the campfire on an ordinary floor", () => {
    const step = ceremonyStep("result", { kind: "continueDeeper" }, ctx());
    expect(step.effects).toEqual([
      { kind: "startChest", reviveFallen: true, delayMs: 0 },
    ]);
  });

  it("a chestless replay goes straight from the result card to the campfire", () => {
    const step = ceremonyStep(
      "result",
      { kind: "continueDeeper" },
      ctx({ hasChest: false })
    );
    expect(step.stage).toBe("camp");
    expect(step.effects).toEqual([{ kind: "startCamp" }]);
  });

  it("the chosen arrow's encounter rides through to the handoff", () => {
    const chosen = ceremonyStep(
      "choice",
      { kind: "exitChosen", dir: "right", encounter: "treasure_vault" },
      ctx()
    );
    expect(chosen.effects).toEqual([
      { kind: "walkOff", dir: "right", encounter: "treasure_vault" },
    ]);
    const done = ceremonyStep(
      "walkout",
      { kind: "walkedOff", encounter: "treasure_vault" },
      ctx()
    );
    expect(done.effects).toEqual([
      { kind: "handOff", encounter: "treasure_vault" },
    ]);
  });

  it("reduced motion hands off immediately — no cinematic, no path choice", () => {
    const step = ceremonyStep(
      "result",
      { kind: "continueDeeper" },
      ctx({ reducedMotion: true })
    );
    expect(step.stage).toBe("walkout");
    expect(step.effects).toEqual([{ kind: "handOff", encounter: "normal" }]);
  });
});

describe("a treasure room — no fight, three chests, then the campfire", () => {
  const treasure = ctx({ isTreasureRoom: true });

  it("the granted hoard opens the chest beat WITHOUT standing chests up", () => {
    const step = ceremonyStep("idle", { kind: "treasureGranted" }, treasure);
    expect(step.stage).toBe("chest");
    // Effect-free on purpose: useBattleEngine's init effect already stood the
    // chests up in lockstep with the controller. Emitting a start here races
    // StrictMode's double-mount and orphans them.
    expect(step.effects).toEqual([]);
  });

  it("opening them all leads to the campfire, then the usual choice", () => {
    const { stage, effects } = run("idle", treasure, [
      { kind: "treasureGranted" },
      { kind: "treasureSettled" },
      { kind: "campSettled" },
    ]);
    expect(stage).toBe("choice");
    expect(effects).toEqual(["startCamp"]);
  });

  it("reduced motion skips the hoard cinematic to the campfire", () => {
    const step = ceremonyStep(
      "idle",
      { kind: "treasureGranted" },
      ctx({ isTreasureRoom: true, reducedMotion: true })
    );
    expect(step.stage).toBe("camp");
    expect(step.effects).toEqual([{ kind: "startCamp" }]);
  });
});

describe("stray events can't corrupt the flow", () => {
  it("a double-fired resolve doesn't restart the chest beat", () => {
    const { stage, effects } = run("idle", ctx({ isBoss: true }), [
      { kind: "resolved" },
      { kind: "resolved" },
    ]);
    expect(stage).toBe("chest");
    expect(effects).toEqual(["startChest"]); // exactly one
  });

  it("a stray reveal outside the chest beat is a no-op", () => {
    const step = ceremonyStep("camp", { kind: "revealDismissed" }, ctx());
    expect(step.stage).toBe("camp");
    expect(step.effects).toEqual([]);
  });

  it("continue-deeper only fires from the result card", () => {
    for (const stage of ["idle", "chest", "camp", "choice", "walkout"] as const) {
      expect(ceremonyStep(stage, { kind: "continueDeeper" }, ctx())).toEqual({
        stage,
        effects: [],
      });
    }
  });

  it("an exit can only be chosen at the choice stage", () => {
    const step = ceremonyStep(
      "camp",
      { kind: "exitChosen", dir: "left", encounter: "normal" },
      ctx()
    );
    expect(step.stage).toBe("camp");
    expect(step.effects).toEqual([]);
  });

  it("a repeat walkedOff re-emits the handoff — the alive-guard is the backstop", () => {
    // Pinning current behavior, not endorsing it: BattleScreen's aliveRef is
    // what actually stops a second handoff, and App unmounts on the first.
    const { effects } = run("walkout", ctx(), [
      { kind: "walkedOff", encounter: "normal" },
      { kind: "walkedOff", encounter: "normal" },
    ]);
    expect(effects).toEqual(["handOff", "handOff"]);
  });
});
