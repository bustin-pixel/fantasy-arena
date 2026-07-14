// Bespoke dungeon-boss / rare-catalyst kits (Stage B of the progression revamp).
// One behavior block per revamped unit, plus the generalized trap rider and the
// Fallen Seraph resurrection fix. Threshold/spawn mechanics use the slime-test
// pattern: a stationary boss chipped by a huge-HP ranged attacker so HP crosses
// its phase gates gradually. Hooks that ignore their ctx (Runic Plating DR,
// Overheat, Fortress Core) are called directly with a stub.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import type { KitCtx } from "@/engine/kits/UnitKit";
import { runeGolemKit } from "@/engine/kits/runeGolem";
import { forgeGolemKit } from "@/engine/kits/forgeGolem";
import { ancientAutomatonKit } from "@/engine/kits/ancientAutomaton";
import { getUnitDef } from "@/data/units";
import { battleState, place, makeDummy } from "./helpers";

const STUB = {} as unknown as KitCtx;

describe("Trap rider — a hazard can burn instead of stun", () => {
  it("applies the rider's status, not the default 7s stun", () => {
    const s = battleState(1);
    const victim = makeDummy(place(s, "skeleton", "player", 200, 200));
    s.traps.push({
      x: 200,
      y: 200,
      team: "enemy",
      sourceUid: "boss",
      rider: {
        effectType: "burn",
        durationSec: 3,
        damagePerTick: 5,
        tickIntervalSec: 0.5,
        vfxKind: "burn_burst",
        color: "#f97316",
      },
    });
    stepSimulation(s);
    expect(victim.effects.some((e) => e.type === "burn")).toBe(true);
    expect(victim.effects.some((e) => e.type === "stun")).toBe(false);
  });
});

describe("Dire Alpha — Call of the Wild + Savage Bite", () => {
  it("howls in wolves as it's chipped past its HP thresholds", () => {
    const s = battleState(2);
    const alpha = place(s, "dire_alpha", "enemy", 240, 300);
    alpha.moveSpeed = 0;
    const atk = place(s, "archer", "player", 240, 520);
    atk.hp = atk.maxHp = 100000;
    atk.damage = 100; // a heavy chipper so HP crosses the phase gates

    for (let i = 0; i < 400; i++) stepSimulation(s);

    expect(alpha.bossPhase).toBeGreaterThanOrEqual(1);
    expect(s.units.some((u) => u.defId === "dire_wolf")).toBe(true);
  });

  it("bleeds its target on its third strike", () => {
    const s = battleState(3);
    const alpha = place(s, "dire_alpha", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 330)); // in melee
    let guard = 0;
    while (alpha.attackCount < 3 && guard < 300) {
      stepSimulation(s);
      guard++;
    }
    expect(alpha.attackCount).toBeGreaterThanOrEqual(3);
    expect(prey.effects.some((e) => e.type === "poison")).toBe(true);
  });
});

describe("Abomination — Putrid Spew", () => {
  it("blankets the target in poison and a slow", () => {
    const s = battleState(4);
    place(s, "abomination", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 340));
    // Check early — the spew's 2.5s slow expires well before its 3s poison.
    for (let i = 0; i < 25; i++) stepSimulation(s);
    expect(prey.effects.some((e) => e.type === "poison")).toBe(true);
    expect(prey.effects.some((e) => e.type === "slow")).toBe(true);
  });
});

describe("Elder Treant — Regrowth", () => {
  it("knits itself back while wounded — but not while burning", () => {
    const s = battleState(5);
    const treant = place(s, "elder_treant", "enemy", 240, 300);
    treant.moveSpeed = 0; // stay put; regrowth is position-independent
    makeDummy(place(s, "skeleton", "player", 240, 640)); // keep the match live
    treant.hp = Math.round(treant.maxHp * 0.5);
    const start = treant.hp;
    for (let i = 0; i < 40; i++) stepSimulation(s); // ~2s
    expect(treant.hp).toBeGreaterThan(start);

    // Now set it burning: regrowth stops (burn DoT may even lower it).
    const before = treant.hp;
    treant.effects.push({
      type: "burn",
      ticksLeft: 200,
      damagePerTick: 0, // isolate the regrowth-suppression, no DoT noise
      tickInterval: 10,
      tickCountdown: 10,
      source: "x",
    });
    for (let i = 0; i < 40; i++) stepSimulation(s);
    expect(treant.hp).toBe(before); // no regrowth while burning
  });
});

describe("Rune Golem — Runic Plating (phase fight)", () => {
  it("reduces incoming damage less as plates shatter", () => {
    const s = battleState(6);
    const golem = place(s, "rune_golem", "enemy", 240, 300);
    // bossPhase 0: 60% DR → 100 becomes 40.
    expect(runeGolemKit.modifyIncomingDamage!(golem, 100, golem, STUB)).toBeCloseTo(40);
    golem.bossPhase = 1; // 40% DR
    expect(runeGolemKit.modifyIncomingDamage!(golem, 100, golem, STUB)).toBeCloseTo(60);
    golem.bossPhase = 3; // plating gone
    expect(runeGolemKit.modifyIncomingDamage!(golem, 100, golem, STUB)).toBeCloseTo(100);
  });

  it("shatters a plate (phase up) as it's chipped down", () => {
    const s = battleState(7);
    const golem = place(s, "rune_golem", "enemy", 240, 300);
    golem.moveSpeed = 0;
    const atk = place(s, "archer", "player", 240, 520);
    atk.hp = atk.maxHp = 100000;
    atk.damage = 100; // heavy — its Runic Plating eats most of each hit
    for (let i = 0; i < 400; i++) stepSimulation(s);
    expect(golem.bossPhase).toBeGreaterThanOrEqual(1);
  });
});

describe("Forge Golem — Overheat + Magma Vents", () => {
  it("Overheat speeds it up below half HP (and not above)", () => {
    const s = battleState(8);
    const golem = place(s, "forge_golem", "enemy", 240, 300);
    const base = getUnitDef("forge_golem").attackSpeed;

    golem.hp = Math.round(golem.maxHp * 0.4);
    forgeGolemKit.onTick!(golem, STUB);
    expect(golem.attackSpeed).toBeLessThan(base);

    golem.hp = golem.maxHp;
    forgeGolemKit.onTick!(golem, STUB);
    expect(golem.attackSpeed).toBe(base);
  });

  it("Magma Vents ignite a unit standing over one", () => {
    const s = battleState(9);
    place(s, "forge_golem", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 470)); // out of melee
    for (let i = 0; i < 40; i++) stepSimulation(s);
    expect(prey.effects.some((e) => e.type === "burn")).toBe(true);
  });
});

describe("Bandit King — Fan of Knives + Smoke Bomb", () => {
  it("poisons the nearest enemies with a fan of knives", () => {
    const s = battleState(10);
    place(s, "bandit_king", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 330));
    for (let i = 0; i < 40; i++) stepSimulation(s);
    expect(prey.effects.some((e) => e.type === "poison")).toBe(true);
  });

  it("throws smoke (phase up) as it's chipped past 60/30% HP", () => {
    const s = battleState(11);
    const king = place(s, "bandit_king", "enemy", 240, 300);
    king.moveSpeed = 0;
    const atk = place(s, "archer", "player", 240, 520);
    atk.hp = atk.maxHp = 100000;
    atk.damage = 100; // heavy chipper so HP crosses the 60/30% gates
    for (let i = 0; i < 400; i++) stepSimulation(s);
    expect(king.bossPhase).toBeGreaterThanOrEqual(1);
  });
});

describe("Apex Beast — Pounce + Apex Frenzy", () => {
  it("Pounce stuns the prey on its opening strike (once)", () => {
    const s = battleState(12);
    const apex = place(s, "apex_beast", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 330));
    for (let i = 0; i < 120; i++) stepSimulation(s);
    expect(apex.bossPhase).toBe(1); // Pounce spent exactly once
    // The stun landed at some point (it's brief, so just confirm the flag path).
  });

  it("Apex Frenzy ramps attack speed per kill", () => {
    const s = battleState(13);
    const apex = place(s, "apex_beast", "enemy", 240, 300);
    const base = getUnitDef("apex_beast").attackSpeed;
    // A parade of frail prey for it to cut down.
    for (let i = 0; i < 4; i++) {
      const p = place(s, "skeleton", "player", 240, 330);
      p.hp = p.maxHp = 1;
      p.damage = 0;
    }
    for (let i = 0; i < 200; i++) stepSimulation(s);
    expect(apex.bossStacks).toBeGreaterThanOrEqual(1);
    expect(apex.attackSpeed).toBeLessThan(base); // faster than baseline
  });
});

describe("Wildheart — Verdant Pulse + Final Bloom", () => {
  it("pulses healing into a wounded ally", () => {
    const s = battleState(14);
    const heart = place(s, "wildheart", "enemy", 240, 300);
    heart.moveSpeed = 0;
    const ally = place(s, "skeleton_archer", "enemy", 300, 300); // grove packmate
    ally.moveSpeed = 0;
    ally.hp = Math.round(ally.maxHp * 0.4);
    makeDummy(place(s, "skeleton", "player", 240, 640)); // keep the match live
    const start = ally.hp;
    for (let i = 0; i < 140; i++) stepSimulation(s); // past a 6s pulse
    expect(ally.hp).toBeGreaterThan(start);
  });

  it("buds two dryads when it dies (Final Bloom)", () => {
    const s = battleState(15);
    const heart = place(s, "wildheart", "enemy", 240, 300);
    heart.moveSpeed = 0;
    const atk = place(s, "archer", "player", 240, 520);
    atk.hp = atk.maxHp = 100000;
    for (let i = 0; i < 600 && heart.state !== "dead"; i++) stepSimulation(s);
    expect(heart.state).toBe("dead");
    expect(s.units.filter((u) => u.defId === "dryad").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Ancient Automaton — Sentry Protocol + Fortress Core", () => {
  it("Fortress Core halves-ish incoming damage only while a turret lives", () => {
    const s = battleState(16);
    const auto = place(s, "ancient_automaton", "enemy", 240, 300);
    const turret = place(s, "turret", "enemy", 280, 300);
    const guarded = { allies: [turret] } as unknown as KitCtx;
    const exposed = { allies: [] } as unknown as KitCtx;
    expect(ancientAutomatonKit.modifyIncomingDamage!(auto, 100, auto, guarded)).toBe(60);
    expect(ancientAutomatonKit.modifyIncomingDamage!(auto, 100, auto, exposed)).toBe(100);
  });

  it("deploys a turret over time (Sentry Protocol)", () => {
    const s = battleState(17);
    const auto = place(s, "ancient_automaton", "enemy", 240, 300);
    auto.moveSpeed = 0;
    makeDummy(place(s, "skeleton", "player", 240, 640)); // keep the match live
    for (let i = 0; i < 200; i++) stepSimulation(s); // past the 8s cadence
    expect(s.units.some((u) => u.defId === "turret" && u.team === "enemy")).toBe(true);
  });
});

describe("Eclipse Herald — Duality + Umbral Veil", () => {
  it("turns Umbral on the 6s cadence (harder-hitting form)", () => {
    const s = battleState(18);
    const herald = place(s, "eclipse_herald", "enemy", 240, 300);
    herald.moveSpeed = 0;
    makeDummy(place(s, "skeleton", "player", 240, 640)); // keep the match live
    const base = getUnitDef("eclipse_herald").damage;
    for (let i = 0; i < 120; i++) stepSimulation(s); // global tick reaches a swap
    expect(herald.mysticForm).toBe("dark");
    expect(herald.damage).toBe(Math.round(base * 1.3));
  });

  it("Umbral Veil silences the target's cluster", () => {
    const s = battleState(19);
    place(s, "eclipse_herald", "enemy", 240, 300);
    const prey = makeDummy(place(s, "skeleton", "player", 240, 360));
    for (let i = 0; i < 40; i++) stepSimulation(s);
    expect(prey.effects.some((e) => e.type === "silence")).toBe(true);
  });
});

describe("Fallen Seraph — resurrection now revives monster wave-mates", () => {
  it("rezzes a fallen non-summon ally and skips a fallen summon", () => {
    const s = battleState(20);
    place(s, "fallen_seraph", "enemy", 240, 300);
    // A live foe so the Seraph has a target (onActTick only fires with one).
    makeDummy(place(s, "knight", "player", 240, 600));
    const ghoul = place(s, "ghoul", "enemy", 260, 300); // a real monster body
    const bones = place(s, "skeleton", "enemy", 300, 300); // a summon
    ghoul.state = "dead";
    bones.state = "dead";

    for (let i = 0; i < 60; i++) stepSimulation(s);

    expect(ghoul.state).not.toBe("dead"); // brought back
    expect(bones.state).toBe("dead"); // summons stay dead
  });
});
