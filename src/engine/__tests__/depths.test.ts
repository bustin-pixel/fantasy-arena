// The Depths (PvE) — slice 1: the seeded WaveController + the first monsters.
// Covers the mode's core contract: deterministic waves, the horde honoring the
// enemy concurrent cap, victory only once the whole queue is spent, and the
// two new monster mechanics (Numbing Bite, Putrid Burst).
import { describe, expect, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import { WaveController } from "@/engine/WaveController";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { createSimState } from "@/engine/CombatSystem";
import {
  tierForFloor,
  isBossFloor,
  floorStatMultipliers,
  rareSpawnQuestForFloor,
} from "@/data/depths";
import { getUnitDef } from "@/data/units";
import { DEPTHS_ENEMY_ACTIVE, DEPTHS_MATCH_TIME_SEC, secToTicks } from "@/utils/constants";
import { battleState, digest, place, makeDummy } from "./helpers";

/** Run a full Depths floor with a scripted player deployment. Returns the
 *  controller plus the peak simultaneous enemy count seen across the match. */
function runDepths(
  seed: number,
  floor: number,
  deck: string[]
): { mc: MatchController; peakEnemies: number } {
  const mc = new MatchController(seed, deck, [], { mode: "depths", floor });
  deck.forEach((id, i) => mc.deploy("player", id, { x: 90 + i * 100, y: 620 }));
  let peakEnemies = 0;
  let guard = 0;
  // Guard covers the full Depths clock (300s = 6000 ticks) plus deployment.
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < 8000
  ) {
    mc.tick();
    peakEnemies = Math.max(peakEnemies, mc.countActive("enemy"));
    guard++;
  }
  return { mc, peakEnemies };
}

/** Drain a WaveController's queue with an unlimited-cap dummy state. */
function drainQueue(seed: number, floor: number): string[] {
  const wc = new WaveController(seed, floor);
  const s: SimState = createSimState(seed, 120);
  s.activeCaps = { player: 4, enemy: 999 };
  const out: string[] = [];
  let guard = 0;
  while (wc.remaining > 0 && guard < 5000) {
    const before = s.units.length;
    wc.step(s);
    if (s.units.length > before) out.push(s.units[s.units.length - 1].defId);
    guard++;
  }
  return out;
}

describe("WaveController — wave composition", () => {
  it("same seed + floor => identical wave, deterministic across runs", () => {
    expect(drainQueue(42, 1)).toEqual(drainQueue(42, 1));
    expect(drainQueue(42, 3)).toEqual(drainQueue(42, 3));
  });

  it("only spawns monsters from the floor's tier (plus its boss + rare spawn)", () => {
    for (const floor of [1, 2, 5]) {
      const tier = tierForFloor(floor);
      const rare = rareSpawnQuestForFloor(floor)?.spawnId;
      const legal = new Set([
        ...Object.keys(tier.monsters),
        tier.boss,
        ...(rare ? [rare] : []),
      ]);
      for (const id of drainQueue(7, floor)) {
        expect(legal.has(id)).toBe(true);
      }
    }
  });

  it("boss floors end with the boss; normal floors have none", () => {
    const floor5 = drainQueue(9, 5);
    expect(isBossFloor(5)).toBe(true);
    expect(floor5[floor5.length - 1]).toBe("bloater");
    expect(drainQueue(9, 1)).not.toContain("bloater");
  });

  it("floor 5 can roll the rare Slime, before the boss (boss stays last)", () => {
    const quest = rareSpawnQuestForFloor(5)!;
    expect(quest.spawnId).toBe("slime");
    // Scan seeds for a run where the rare spawn rolled in (~15% each).
    let withSlime: string[] | null = null;
    for (let seed = 1; seed <= 500 && !withSlime; seed++) {
      const q = drainQueue(seed, 5);
      if (q.includes("slime")) withSlime = q;
    }
    expect(withSlime).not.toBeNull();
    // The Bloater is still the finale, and the Slime emerges just before it.
    expect(withSlime![withSlime!.length - 1]).toBe("bloater");
    expect(withSlime!.indexOf("slime")).toBe(withSlime!.length - 2);
  });

  it("floor 1 spawns at bestiary stats; deeper floors spawn pre-scaled", () => {
    const spawnOne = (floor: number) => {
      const wc = new WaveController(31, floor);
      const s: SimState = createSimState(31, 120);
      s.activeCaps = { player: 4, enemy: 999 };
      let guard = 0;
      while (s.units.length === 0 && guard < 100) {
        wc.step(s);
        guard++;
      }
      return s.units[0];
    };

    const shallow = spawnOne(1);
    const shallowDef = getUnitDef(shallow.defId);
    expect(shallow.maxHp).toBe(shallowDef.hp);
    expect(shallow.damage).toBe(shallowDef.damage);

    const deep = spawnOne(5);
    const deepDef = getUnitDef(deep.defId);
    const mult = floorStatMultipliers(5);
    expect(deep.maxHp).toBe(Math.round(deepDef.hp * mult.hp));
    expect(deep.hp).toBe(deep.maxHp);
    expect(deep.damage).toBe(Math.round(deepDef.damage * mult.dmg));
    expect(deep.maxHp).toBeGreaterThan(deepDef.hp);
  });

  it("the boss scales with floor depth too", () => {
    // Floor 5's Bloater must carry the floor multiplier, or boss floors stay soft.
    const wc = new WaveController(9, 5);
    const s: SimState = createSimState(9, 120);
    s.activeCaps = { player: 4, enemy: 999 };
    let guard = 0;
    while (wc.remaining > 0 && guard < 5000) {
      wc.step(s);
      guard++;
    }
    const boss = s.units.find((u) => u.defId === "bloater")!;
    const mult = floorStatMultipliers(5);
    expect(boss.maxHp).toBe(Math.round(getUnitDef("bloater").hp * mult.hp));
    expect(boss.damage).toBe(Math.round(getUnitDef("bloater").damage * mult.dmg));
  });

  it("deeper floors roll bigger waves", () => {
    // Compare total budget spent via queue length proxy across several seeds
    // (composition is random, so assert on the average).
    const avg = (floor: number) => {
      let total = 0;
      for (let seed = 1; seed <= 10; seed++) total += drainQueue(seed, floor).length;
      return total / 10;
    };
    expect(avg(4)).toBeGreaterThan(avg(1));
  });
});

describe("Depths match — full-floor invariants", () => {
  const DECK = ["knight", "archer", "fire_mage", "ogre"];

  it("same seed + inputs => byte-identical end state (determinism)", () => {
    const a = digest(runDepths(20260701, 1, DECK).mc.state);
    const b = digest(runDepths(20260701, 1, DECK).mc.state);
    expect(b).toBe(a);
  });

  it("resolves to a terminal phase and never exceeds the enemy cap", () => {
    const { mc, peakEnemies } = runDepths(123, 2, DECK);
    expect(["victory", "defeat", "draw"]).toContain(mc.phase);
    expect(peakEnemies).toBeLessThanOrEqual(DEPTHS_ENEMY_ACTIVE);
    // The horde must actually use the raised cap — more than Arena's 2.
    expect(peakEnemies).toBeGreaterThan(2);
  });

  it("clearing the whole horde is a victory (queue counts as reserves)", () => {
    // A strong warband vs floor 1 fodder should always clear it.
    const { mc } = runDepths(55, 1, ["aegis_knight", "berserker", "holy_knight", "warrior"]);
    expect(mc.phase).toBe("victory");
    expect(mc.state.enemyReserves).toBe(0);
  });

  it("boss floor 5 completes and fields the Bloater", () => {
    const { mc } = runDepths(77, 5, ["aegis_knight", "berserker", "holy_knight", "warrior"]);
    expect(["victory", "defeat", "draw"]).toContain(mc.phase);
    expect(mc.state.units.some((u) => u.defId === "bloater")).toBe(true);
  });

  it("depths matches run on the long PvE clock", () => {
    const mc = new MatchController(5, DECK, [], { mode: "depths", floor: 1 });
    expect(mc.state.clockTicks).toBe(secToTicks(DEPTHS_MATCH_TIME_SEC));
  });

  it("monsters creep in from the top edge", () => {
    const mc = new MatchController(3, ["knight", "archer"], [], {
      mode: "depths",
      floor: 1,
    });
    mc.deploy("player", "knight", { x: 200, y: 620 });
    mc.deploy("player", "archer", { x: 280, y: 640 });
    let guard = 0;
    while (mc.countActive("enemy") === 0 && guard < 400) {
      mc.tick();
      guard++;
    }
    const first = mc.state.units.find((u) => u.team === "enemy");
    expect(first).toBeDefined();
    // Spawned at the top edge (before movement pulls it fully on-field).
    expect(first!.pos.y).toBeLessThan(60);
  });
});

describe("Zombie Shambler — Numbing Bite", () => {
  it("its melee hit applies a 30% slow", () => {
    const s = battleState(11);
    place(s, "zombie_shambler", "enemy", 240, 520);
    const dummy = makeDummy(place(s, "skeleton", "player", 240, 560)); // in reach

    for (let i = 0; i < 10; i++) stepSimulation(s);

    const slow = dummy.effects.find((e) => e.type === "slow");
    expect(slow).toBeDefined();
    expect(slow!.magnitude).toBe(0.3);
  });
});

describe("Bloater — Putrid Burst", () => {
  it("on death it damages and poisons nearby enemies", () => {
    const s = battleState(13);
    const bloater = place(s, "bloater", "enemy", 240, 520);
    const orc = place(s, "orc", "player", 240, 560); // survives the burst
    bloater.hp = 1; // next hit ruptures it

    let guard = 0;
    while (bloater.state !== "dead" && guard < 100) {
      stepSimulation(s);
      guard++;
    }
    expect(bloater.state).toBe("dead");
    expect(orc.effects.some((e) => e.type === "poison")).toBe(true);
    expect(orc.hp).toBeLessThan(orc.maxHp); // took the 30 burst
  });

  it("the burst does not hit its own team", () => {
    const s = battleState(17);
    const bloater = place(s, "bloater", "enemy", 240, 520);
    const rat = place(s, "giant_rat", "enemy", 260, 520);
    rat.moveSpeed = 0; // keep it inside the blast radius
    const orc = place(s, "orc", "player", 240, 560);
    void orc;
    bloater.hp = 1;

    let guard = 0;
    while (bloater.state !== "dead" && guard < 100) {
      stepSimulation(s);
      guard++;
    }
    expect(rat.effects.some((e) => e.type === "poison")).toBe(false);
  });
});
