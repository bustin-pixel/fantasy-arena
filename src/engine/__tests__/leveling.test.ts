// Unit-level apply path: levels are a deterministic MATCH INPUT (like the
// seed) baked into hp/damage at createUnit. Covers the bake itself, the two
// summon-inheritance queue paths (pendingSpawns via the Necromancer's Raise
// Dead, damageSpawns via the Slime's split), the arena AI level mirror, and
// the depths regression (PvE enemies never level).
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { MatchController } from "@/engine/MatchController";
import { createUnit, resetUidCounter } from "@/entities/createUnit";
import { getUnitDef } from "@/data/units";
import { averageDeckLevel, levelStatMultipliers } from "@/meta/leveling";
import { battleState, digest, makeDummy, place } from "./helpers";

const DECK = ["ogre", "archer", "knight", "fire_mage"];

/** runMatch, but with unit levels supplied as a match input. */
function runLeveledMatch(
  seed: number,
  levels: Record<string, number>,
  mode: "arena" | "depths" = "arena"
): MatchController {
  const mc = new MatchController(seed, DECK, mode === "arena" ? DECK : [], {
    mode,
    floor: 1,
    unitLevels: levels,
  });
  let guard = 0;
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < 3400
  ) {
    mc.tick();
    guard++;
  }
  return mc;
}

describe("createUnit level bake", () => {
  it("level 1 is the exact identity (raw def stats)", () => {
    resetUidCounter();
    const def = getUnitDef("archer");
    const u = createUnit("archer", "player", { x: 0, y: 0 });
    expect(u.level).toBe(1);
    expect(u.hp).toBe(def.hp);
    expect(u.maxHp).toBe(def.hp);
    expect(u.damage).toBe(def.damage);
  });

  it("bakes the level multipliers into hp and damage at spawn", () => {
    resetUidCounter();
    const def = getUnitDef("archer");
    const mult = levelStatMultipliers(5);
    const u = createUnit("archer", "player", { x: 0, y: 0 }, 5);
    expect(u.level).toBe(5);
    expect(u.hp).toBe(Math.round(def.hp * mult.hp));
    expect(u.maxHp).toBe(Math.round(def.hp * mult.hp));
    expect(u.damage).toBe(Math.round(def.damage * mult.dmg));
    // Speed/range are untouched — levels scale hp/dmg only, like enemy floors.
    expect(u.attackSpeed).toBe(def.attackSpeed);
    expect(u.moveSpeed).toBe(def.moveSpeed);
    expect(u.range).toBe(def.range);
  });
});

describe("summon inheritance (both spawn-queue paths)", () => {
  it("a leveled Necromancer raises leveled skeletons (pendingSpawns path)", () => {
    const s = battleState(1);
    place(s, "necromancer", "player", 240, 600, 5);
    makeDummy(place(s, "skeleton", "enemy", 240, 80)); // far, unkillable target

    for (let i = 0; i < 230; i++) stepSimulation(s); // ≥ two 5s raise ticks

    const raised = s.units.filter(
      (u) => u.defId === "skeleton" && u.team === "player"
    );
    expect(raised.length).toBeGreaterThanOrEqual(1);
    const skelDef = getUnitDef("skeleton");
    const mult = levelStatMultipliers(5);
    for (const skel of raised) {
      expect(skel.level).toBe(5);
      expect(skel.maxHp).toBe(Math.round(skelDef.hp * mult.hp));
      expect(skel.damage).toBe(Math.round(skelDef.damage * mult.dmg));
    }
  });

  it("a leveled Slime splits into leveled clones (damageSpawns path)", () => {
    const s = battleState(5);
    const slime = place(s, "slime", "enemy", 240, 300, 5);
    slime.moveSpeed = 0; // stationary so it just soaks damage in place
    const atk = place(s, "archer", "player", 240, 460);
    atk.hp = atk.maxHp = 100000; // survives the clones it spawns

    for (let i = 0; i < 240; i++) stepSimulation(s);

    const clones = s.units.filter((u) => u.defId === "slime_clone");
    expect(clones.length).toBeGreaterThanOrEqual(1);
    for (const clone of clones) expect(clone.level).toBe(5);
  });

  it("unleveled units still summon level-1 units (default path unchanged)", () => {
    const s = battleState(1);
    place(s, "necromancer", "player", 240, 600);
    makeDummy(place(s, "skeleton", "enemy", 240, 80));

    for (let i = 0; i < 230; i++) stepSimulation(s);

    const raised = s.units.filter(
      (u) => u.defId === "skeleton" && u.team === "player"
    );
    expect(raised.length).toBeGreaterThanOrEqual(1);
    for (const skel of raised) expect(skel.level).toBe(1);
  });
});

describe("arena AI level mirror", () => {
  it("every enemy unit fights at the player's average deck level", () => {
    const levels = { ogre: 6, archer: 4, knight: 3, fire_mage: 5 };
    const expected = averageDeckLevel(DECK, levels); // 4.5 → 5 (rounded)
    const mc = runLeveledMatch(11, levels);

    const enemies = mc.state.units.filter((u) => u.team === "enemy");
    expect(enemies.length).toBeGreaterThan(0);
    for (const e of enemies) expect(e.level).toBe(expected);

    // Player units carry their OWN per-unit levels, not the average.
    for (const p of mc.state.units.filter((u) => u.team === "player")) {
      const own = levels[p.defId as keyof typeof levels];
      if (own !== undefined) expect(p.level).toBe(own);
    }
  });
});

describe("depths regression — PvE enemies never level", () => {
  it("floor monsters stay level 1 even when the player deck is leveled", () => {
    const levels = { ogre: 10, archer: 10, knight: 10, fire_mage: 10 };
    const mc = runLeveledMatch(7, levels, "depths");

    const enemies = mc.state.units.filter((u) => u.team === "enemy");
    expect(enemies.length).toBeGreaterThan(0);
    for (const e of enemies) expect(e.level).toBe(1);
    // The player side IS leveled — levels apply in every mode.
    const players = mc.state.units.filter(
      (u) => u.team === "player" && DECK.includes(u.defId)
    );
    expect(players.length).toBeGreaterThan(0);
    for (const p of players) expect(p.level).toBe(10);
  });
});

describe("determinism with levels as inputs", () => {
  it("same seed + decks + levels twice → byte-identical end state", () => {
    const levels = { ogre: 3, archer: 7, knight: 2, fire_mage: 9 };
    const a = runLeveledMatch(42, levels);
    const b = runLeveledMatch(42, levels);
    expect(digest(a.state)).toBe(digest(b.state));
    expect(a.getReplay()).toEqual(b.getReplay());
  });

  it("records the levels in the replay (a match input, like the seed)", () => {
    const levels = { ogre: 3, archer: 7, knight: 2, fire_mage: 9 };
    const mc = runLeveledMatch(42, levels);
    expect(mc.getReplay().unitLevels).toEqual(levels);
  });
});
