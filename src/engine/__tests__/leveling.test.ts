// Unit-level apply path: levels are a deterministic MATCH INPUT (like the
// seed) baked into hp/damage at createUnit. Covers the bake itself, the two
// summon-inheritance queue paths (pendingSpawns via the Necromancer's Raise
// Dead, damageSpawns via the Slime's split), the arena AI level mirror, and
// dungeon monster levels (fodder at Dungeon.monsterLevel mapped through the
// difficulty-tier band, elites +1 — data/tiers.ts).
import { describe, it, expect } from "vitest";
import { createSimState, stepSimulation, type SimState } from "@/engine/CombatSystem";
import { MatchController } from "@/engine/MatchController";
import { WaveController } from "@/engine/WaveController";
import { createUnit, resetUidCounter } from "@/entities/createUnit";
import { getUnitDef } from "@/data/units";
import {
  floorStatMultipliersIn,
  getDungeon,
  monsterLevelFor,
} from "@/data/dungeons";
import { averageDeckLevel, levelStatMultipliers } from "@/meta/leveling";
import { TIER_IDS, type TierId } from "@/data/tiers";
import { battleState, digest, makeDummy, place } from "./helpers";

const DECK = ["ogre", "archer", "knight", "fire_mage"];

/** runMatch, but with unit levels supplied as a match input. */
function runLeveledMatch(
  seed: number,
  levels: Record<string, number>,
  mode: "arena" | "depths" = "arena",
  dungeonId = "depths",
  floor = 1,
  tier?: TierId
): MatchController {
  const mc = new MatchController(seed, DECK, mode === "arena" ? DECK : [], {
    mode,
    floor,
    dungeonId,
    unitLevels: levels,
    tier,
  });
  let guard = 0;
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < 8000
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

describe("dungeon monster levels — fodder at Dungeon.monsterLevel, elites +1", () => {
  /** Drain a dungeon floor with an unlimited-cap dummy state, recording every
   *  spawn's stats at spawn time (each is killed so gated phases advance). */
  function drainFloorSpawns(
    seed: number,
    dungeonId: string,
    floor: number,
    tier: TierId = "normal"
  ): { defId: string; level: number; maxHp: number; damage: number }[] {
    const wc = new WaveController(
      seed,
      getDungeon(dungeonId),
      floor,
      "normal",
      undefined,
      false,
      tier
    );
    const s: SimState = createSimState(seed, 120);
    s.activeCaps = { player: 4, enemy: 999 };
    const out: { defId: string; level: number; maxHp: number; damage: number }[] =
      [];
    let guard = 0;
    while (wc.remaining > 0 && guard < 8000) {
      const before = s.units.length;
      wc.step(s);
      if (s.units.length > before) {
        const u = s.units[s.units.length - 1];
        out.push({
          defId: u.defId,
          level: u.level,
          maxHp: u.maxHp,
          damage: u.damage,
        });
        u.state = "dead";
      }
      guard++;
    }
    return out;
  }

  it("Depths fodder stays level 1 even when the player deck is leveled", () => {
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

  it("Bonefields fodder spawns at the dungeon's monster level (Lv 4)", () => {
    const bonefields = getDungeon("bonefields");
    expect(monsterLevelFor(bonefields, "fodder")).toBe(4);
    // Floor 1: the floor multiplier is identity, so stats are the pure Lv-4 bake.
    const spawns = drainFloorSpawns(31, "bonefields", 1);
    expect(spawns.length).toBeGreaterThan(0);
    const mult = levelStatMultipliers(4);
    for (const spawn of spawns) {
      const def = getUnitDef(spawn.defId);
      expect(spawn.level).toBe(4);
      expect(spawn.maxHp).toBe(Math.round(def.hp * mult.hp));
      expect(spawn.damage).toBe(Math.round(def.damage * mult.dmg));
    }
  });

  it("the boss spawns one level above the fodder, layered under floor scaling", () => {
    const bonefields = getDungeon("bonefields");
    const boss = drainFloorSpawns(9, "bonefields", 5).find(
      (u) => u.defId === "abomination"
    )!;
    expect(boss).toBeDefined();
    expect(boss.level).toBe(5); // monsterLevel 4 + elite bonus
    const lvl = levelStatMultipliers(5);
    const mult = floorStatMultipliersIn(bonefields, 5);
    const def = getUnitDef("abomination");
    expect(boss.maxHp).toBe(Math.round(Math.round(def.hp * lvl.hp) * mult.hp));
    expect(boss.damage).toBe(
      Math.round(Math.round(def.damage * lvl.dmg) * mult.dmg)
    );
  });

  it("the rare quest catalyst is an elite too (+1)", () => {
    // Scan seeds until the Lich rolls in (~15% per seed), then drain that run.
    let seed = 0;
    for (let s = 1; s <= 500 && seed === 0; s++) {
      const wc = new WaveController(s, getDungeon("bonefields"), 5);
      if (wc.planForTest()!.catalyst === "lich") seed = s;
    }
    expect(seed).toBeGreaterThan(0);
    const lich = drainFloorSpawns(seed, "bonefields", 5).find(
      (u) => u.defId === "lich"
    )!;
    expect(lich).toBeDefined();
    expect(lich.level).toBe(5);
  });

  it("the Eclipse Warden tops the Normal chain's back stretch at Lv 18 (17+1)", () => {
    const spire = getDungeon("eclipse_spire");
    expect(monsterLevelFor(spire, "boss")).toBe(18);
    const warden = drainFloorSpawns(9, "eclipse_spire", 5).find(
      (u) => u.defId === "eclipse_warden"
    )!;
    expect(warden).toBeDefined();
    expect(warden.level).toBe(18);
  });

  it("Elite re-bands the same fight: Spire fodder Lv 38, Warden Lv 39 — past the player cap, nested under floor scaling", () => {
    const spire = getDungeon("eclipse_spire");
    expect(monsterLevelFor(spire, "boss", "elite")).toBe(39);
    const spawns = drainFloorSpawns(9, "eclipse_spire", 5, "elite");
    const warden = spawns.find((u) => u.defId === "eclipse_warden")!;
    expect(warden).toBeDefined();
    expect(warden.level).toBe(39);
    const lvl = levelStatMultipliers(39);
    const mult = floorStatMultipliersIn(spire, 5);
    const def = getUnitDef("eclipse_warden");
    expect(warden.maxHp).toBe(Math.round(Math.round(def.hp * lvl.hp) * mult.hp));
    expect(warden.damage).toBe(
      Math.round(Math.round(def.damage * lvl.dmg) * mult.dmg)
    );
    // Fodder rides the band without the elite bonus.
    const fodder = spawns.find(
      (u) => u.defId !== "eclipse_warden" && u.defId !== "eclipse_herald"
    )!;
    expect(fodder).toBeDefined();
    expect(fodder.level).toBe(38);
  });

  it("tier shifts LEVELS only: same seed spawns the identical boss-floor plan at every tier", () => {
    const plans = TIER_IDS.map((tier) =>
      new WaveController(
        31,
        getDungeon("bonefields"),
        5,
        "normal",
        undefined,
        false,
        tier
      ).planForTest()
    );
    expect(plans[1]).toEqual(plans[0]);
    expect(plans[2]).toEqual(plans[0]);
  });

  it("a leveled dungeon match is deterministic (same seed → same digest)", () => {
    const levels = { ogre: 4, archer: 4, knight: 4, fire_mage: 4 };
    const a = runLeveledMatch(13, levels, "depths", "bonefields", 5);
    const b = runLeveledMatch(13, levels, "depths", "bonefields", 5);
    expect(digest(a.state)).toBe(digest(b.state));
  });

  it("a Hard-tier dungeon match is deterministic (same seed + tier → same digest)", () => {
    const levels = { ogre: 20, archer: 20, knight: 20, fire_mage: 20 };
    const a = runLeveledMatch(13, levels, "depths", "bonefields", 5, "hard");
    const b = runLeveledMatch(13, levels, "depths", "bonefields", 5, "hard");
    expect(digest(a.state)).toBe(digest(b.state));
  });

  it("passing tier 'normal' is byte-identical to omitting it (regression guard)", () => {
    const levels = { ogre: 4, archer: 4, knight: 4, fire_mage: 4 };
    const a = runLeveledMatch(13, levels, "depths", "bonefields", 5);
    const b = runLeveledMatch(13, levels, "depths", "bonefields", 5, "normal");
    expect(digest(a.state)).toBe(digest(b.state));
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
