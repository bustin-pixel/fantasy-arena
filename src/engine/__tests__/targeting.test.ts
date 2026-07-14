// Tendencies — per-unit targeting personalities (data/tendencies.ts).
// A tendency reorders the CANDIDATE preference inside acquireTarget's steps 2
// (lowest-HP in range) and 4 (nearest) ONLY; taunt and the retaliation rules
// are untouched — the taunt-still-wins spec below guards that locked decision.
// Scenarios are hand-built with harmless skeleton dummies (the Knight's shield
// and the Ogre's slam mask measured behavior — see helpers.makeDummy).
import { describe, it, expect } from "vitest";
import { acquireTarget } from "@/engine/TargetingSystem";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import type { Unit } from "@/types";
import { battleState, place, makeDummy } from "./helpers";

function uidMap(s: SimState): Map<string, Unit> {
  return new Map(s.units.map((u) => [u.uid, u]));
}

function enemiesOf(s: SimState, team: "player" | "enemy"): Unit[] {
  return s.units.filter((u) => u.team !== team);
}

describe("tendency data plumbing", () => {
  it("createUnit copies the def's tendency onto the unit", () => {
    const s = battleState(1);
    expect(place(s, "rogue", "player", 240, 560).tendency).toBe(
      "backline_stalker"
    );
    expect(place(s, "archer", "player", 300, 560).tendency).toBeUndefined();
  });
});

describe("Brawler (default) — unchanged behavior", () => {
  it("with nothing in range, closes on the NEAREST enemy", () => {
    const s = battleState(2);
    const warrior = place(s, "warrior", "player", 240, 560); // no tendency
    const near = makeDummy(place(s, "skeleton", "enemy", 240, 300));
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // farther
    expect(acquireTarget(warrior, uidMap(s), enemiesOf(s, "player"))).toBe(
      near.uid
    );
  });
});

describe("Backline Stalker — hunts ranged/casters", () => {
  it("seeks a deep archer over a nearer frontliner (step 4)", () => {
    const s = battleState(3);
    const rogue = place(s, "rogue", "player", 240, 560);
    makeDummy(place(s, "skeleton", "enemy", 240, 460)); // nearer, melee
    const archer = makeDummy(place(s, "archer", "enemy", 240, 120)); // deep
    expect(acquireTarget(rogue, uidMap(s), enemiesOf(s, "player"))).toBe(
      archer.uid
    );
  });

  it("prefers the archer even when a frontliner is ALSO in range (step 2)", () => {
    const s = battleState(4);
    const rogue = place(s, "rogue", "player", 240, 560);
    const tank = makeDummy(place(s, "skeleton", "enemy", 240, 520)); // 40px
    const archer = makeDummy(place(s, "archer", "enemy", 240, 620)); // 60px
    tank.hp = 50; // the wounded default would pick the tank
    expect(acquireTarget(rogue, uidMap(s), enemiesOf(s, "player"))).toBe(
      archer.uid
    );
  });

  it("walks past a nearer enemy and actually engages the backline", () => {
    const s = battleState(5);
    const rogue = place(s, "rogue", "player", 240, 560);
    // Off the path and pinned (dummy): near, but never in the rogue's range.
    makeDummy(place(s, "skeleton", "enemy", 420, 400));
    const archer = makeDummy(place(s, "archer", "enemy", 240, 200));
    for (let i = 0; i < 140; i++) stepSimulation(s);
    expect(rogue.targetUid).toBe(archer.uid);
    expect(archer.hp).toBeLessThan(archer.maxHp); // it reached it and struck
  });
});

describe("Executioner — runs down the most wounded", () => {
  it("seeks the lowest-HP enemy anywhere, ignoring distance (step 4)", () => {
    const s = battleState(6);
    const zerk = place(s, "berserker", "player", 240, 560);
    makeDummy(place(s, "skeleton", "enemy", 240, 460)); // near, full HP
    const wounded = makeDummy(place(s, "skeleton", "enemy", 240, 60)); // far
    wounded.hp = 500;
    expect(acquireTarget(zerk, uidMap(s), enemiesOf(s, "player"))).toBe(
      wounded.uid
    );
  });
});

describe("Bodyguard — answers for allies", () => {
  it("turns on the enemy that is targeting an ally (step 4)", () => {
    const s = battleState(7);
    const knight = place(s, "knight", "player", 240, 560);
    const ally = place(s, "archer", "player", 400, 560);
    const menace = makeDummy(place(s, "skeleton", "enemy", 240, 400));
    const idler = makeDummy(place(s, "skeleton", "enemy", 240, 440)); // nearer
    idler.hp = 50; // and more wounded — default would pick it
    menace.targetUid = ally.uid;
    expect(acquireTarget(knight, uidMap(s), enemiesOf(s, "player"))).toBe(
      menace.uid
    );
  });
});

describe("Spellwrath — magic-wielders die first", () => {
  it("picks the caster over a more wounded melee, both in range (step 2)", () => {
    const s = battleState(8);
    const trickster = place(s, "trickster", "player", 240, 560);
    const grunt = makeDummy(place(s, "skeleton", "enemy", 240, 520)); // 40px
    const mage = makeDummy(place(s, "fire_mage", "enemy", 240, 620)); // 60px
    grunt.hp = 50;
    expect(acquireTarget(trickster, uidMap(s), enemiesOf(s, "player"))).toBe(
      mage.uid
    );
  });
});

describe("Big-Game Hunter — stalks the largest", () => {
  it("squares up to the highest-maxHp enemy, not the near/wounded one (step 4)", () => {
    const s = battleState(9);
    const ogre = place(s, "ogre", "player", 240, 560);
    const runt = place(s, "skeleton", "enemy", 240, 440); // near, 45 maxHp
    runt.hp = 10; // even wounded, it's not the big one
    const big = place(s, "ogre", "enemy", 240, 120); // 250 maxHp, far
    expect(acquireTarget(ogre, uidMap(s), enemiesOf(s, "player"))).toBe(
      big.uid
    );
  });
});

describe("Faithbane — healers die first", () => {
  it("picks the Cleric over a nearer, more wounded melee, both in range (step 2)", () => {
    const s = battleState(11);
    const necro = place(s, "necromancer", "player", 240, 560); // long range
    const grunt = makeDummy(place(s, "skeleton", "enemy", 240, 520)); // 40px
    const cleric = makeDummy(place(s, "healer", "enemy", 240, 620)); // 60px
    grunt.hp = 50; // the wounded default would pick the grunt
    expect(acquireTarget(necro, uidMap(s), enemiesOf(s, "player"))).toBe(
      cleric.uid
    );
  });

  it("walks past the archer too — support beats ranged (unlike Backline Stalker)", () => {
    const s = battleState(12);
    const necro = place(s, "necromancer", "player", 240, 620);
    makeDummy(place(s, "archer", "enemy", 240, 300)); // ranged, out of range
    const cleric = makeDummy(place(s, "healer", "enemy", 240, 60)); // deeper
    expect(acquireTarget(necro, uidMap(s), enemiesOf(s, "player"))).toBe(
      cleric.uid
    );
  });
});

describe("Focus Fire — piles onto the pack's prey", () => {
  it("seeks the enemy the most allies already target, not the wounded one (step 4)", () => {
    const s = battleState(13);
    const wolf = place(s, "wolf", "player", 240, 560);
    const stray = makeDummy(place(s, "skeleton", "enemy", 240, 400));
    const prey = makeDummy(place(s, "skeleton", "enemy", 240, 100)); // farther
    stray.hp = 50; // wounded AND nearer — default would pick it
    place(s, "archer", "player", 400, 560).targetUid = prey.uid;
    place(s, "warrior", "player", 80, 560).targetUid = prey.uid;
    expect(acquireTarget(wolf, uidMap(s), enemiesOf(s, "player"))).toBe(
      prey.uid
    );
  });

  it("ignores dead allies' locks (falls back to most wounded)", () => {
    const s = battleState(14);
    const wolf = place(s, "wolf", "player", 240, 560);
    const wounded = makeDummy(place(s, "skeleton", "enemy", 240, 400));
    const other = makeDummy(place(s, "skeleton", "enemy", 240, 100));
    wounded.hp = 50;
    const fallen = place(s, "archer", "player", 400, 560);
    fallen.targetUid = other.uid;
    fallen.state = "dead"; // its lock must not count
    expect(acquireTarget(wolf, uidMap(s), enemiesOf(s, "player"))).toBe(
      wounded.uid
    );
  });
});

describe("Lone Wolf — picks its own fight", () => {
  it("seeks the foe no ally is fighting, even past a wounded claimed one (step 4)", () => {
    const s = battleState(15);
    const outlaw = place(s, "outlaw", "player", 240, 560);
    const claimed = makeDummy(place(s, "skeleton", "enemy", 240, 440));
    const unclaimed = makeDummy(place(s, "skeleton", "enemy", 240, 100));
    claimed.hp = 50; // wounded AND nearer — default would pick it
    place(s, "archer", "player", 400, 560).targetUid = claimed.uid;
    expect(acquireTarget(outlaw, uidMap(s), enemiesOf(s, "player"))).toBe(
      unclaimed.uid
    );
  });

  it("when every foe is claimed, takes the most wounded", () => {
    const s = battleState(16);
    const outlaw = place(s, "outlaw", "player", 240, 560);
    const a = makeDummy(place(s, "skeleton", "enemy", 240, 440));
    const b = makeDummy(place(s, "skeleton", "enemy", 240, 100));
    b.hp = 50;
    place(s, "archer", "player", 400, 560).targetUid = a.uid;
    place(s, "warrior", "player", 80, 560).targetUid = b.uid;
    expect(acquireTarget(outlaw, uidMap(s), enemiesOf(s, "player"))).toBe(
      b.uid
    );
  });
});

describe("taunt still wins (locked decision)", () => {
  it("a taunted Backline Stalker attacks the taunter, not the deep archer", () => {
    const s = battleState(10);
    const rogue = place(s, "rogue", "player", 240, 560);
    const taunter = place(s, "knight", "enemy", 240, 480);
    makeDummy(place(s, "archer", "enemy", 240, 120)); // the preferred catch
    rogue.tauntedByUid = taunter.uid;
    rogue.effects.push({ type: "taunt", ticksLeft: 100, source: taunter.uid });
    expect(acquireTarget(rogue, uidMap(s), enemiesOf(s, "player"))).toBe(
      taunter.uid
    );
  });

  it("a taunted Faithbane attacks the taunter, not the Cleric", () => {
    const s = battleState(17);
    const necro = place(s, "necromancer", "player", 240, 560);
    const taunter = place(s, "knight", "enemy", 240, 480);
    makeDummy(place(s, "healer", "enemy", 240, 120)); // the preferred catch
    necro.tauntedByUid = taunter.uid;
    necro.effects.push({ type: "taunt", ticksLeft: 100, source: taunter.uid });
    expect(acquireTarget(necro, uidMap(s), enemiesOf(s, "player"))).toBe(
      taunter.uid
    );
  });
});
