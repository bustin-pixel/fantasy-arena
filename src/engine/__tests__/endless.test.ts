// Endless mode — the survival wave loop + warband boons. Determinism (a run is a
// pure function of seed + deployments + pick indices), the frozen intermission,
// the 5-wave boss cadence, and that team-mod boons survive kits that recompute
// unit stats every tick. Headless like the rest of the engine specs.
import { describe, it, expect } from "vitest";
import { MatchController } from "@/engine/MatchController";
import {
  metaHeal,
  reviveUnit,
  stepSimulation,
} from "@/engine/CombatSystem";
import { battleState, place, makeDummy, digest } from "./helpers";
import { RNG } from "@/utils/rng";
import { rollBoonOffers } from "@/data/boons";
import { DUNGEON_IDS, getDungeon } from "@/data/dungeons";
import { ENDLESS_RARE_POOL } from "@/data/endless";
import { getUnitDef } from "@/data/units";

const DECK = ["ogre", "knight", "berserker", "archer"];

/** Drive a full endless run, answering each intermission via `choose`. Records the
 *  banner kinds seen per wave and guards the never-victory / reserves invariants. */
function drive(
  seed: number,
  choose: (mc: MatchController) => number,
  tickCap = 40000
): {
  mc: MatchController;
  wave: number;
  phase: string;
  bannersByWave: Map<number, Set<string>>;
  reservesEverZero: boolean;
} {
  const mc = new MatchController(seed, DECK, [], { mode: "endless" });
  const bannersByWave = new Map<number, Set<string>>();
  let reservesEverZero = false;
  let guard = 0;
  // The loop exits the moment phase leaves battle/deployment, so if a "victory"
  // ever fired the returned `phase` would be it — that's the invariant assertion.
  while (
    mc.phase !== "defeat" &&
    mc.phase !== "victory" &&
    mc.phase !== "draw" &&
    guard < tickCap
  ) {
    mc.tick();
    guard++;
    const st = mc.endlessStatus();
    if (st && mc.state.phase === "battle" && !st.intermission) {
      // While enemies are on the field the reserve sentinel must stay ≥ 1, or the
      // win check (enemies gone AND reserves ≤ 0) could misfire as a "victory".
      const enemiesAlive = mc.state.units.filter(
        (u) => u.team === "enemy" && u.state !== "dead"
      ).length;
      if (enemiesAlive > 0 && mc.state.enemyReserves <= 0) reservesEverZero = true;
    }
    if (st && mc.state.waveBanner) {
      const set = bannersByWave.get(st.wave) ?? new Set<string>();
      set.add(mc.state.waveBanner.kind);
      bannersByWave.set(st.wave, set);
    }
    if (st?.intermission) mc.pickBoon(choose(mc));
  }
  return {
    mc,
    wave: mc.wavesSurvived(),
    phase: mc.phase,
    bannersByWave,
    reservesEverZero,
  };
}

/** Drive with the warband topped up to full each tick (god mode) so the run
 *  reliably reaches the boss wave regardless of balance — the point is to observe
 *  the wave cadence + banner wiring, not to measure difficulty. */
function driveGodMode(
  seed: number,
  tickCap = 20000
): {
  mc: MatchController;
  bannersByWave: Map<number, Set<string>>;
  phase: string;
  reservesEverZero: boolean;
  maxWave: number;
} {
  const mc = new MatchController(seed, DECK, [], { mode: "endless" });
  const bannersByWave = new Map<number, Set<string>>();
  let reservesEverZero = false;
  let maxWave = 0;
  let guard = 0;
  while (
    mc.phase !== "defeat" &&
    mc.phase !== "victory" &&
    mc.phase !== "draw" &&
    guard < tickCap
  ) {
    mc.tick();
    guard++;
    for (const u of mc.state.units) {
      if (u.team === "player" && u.state !== "dead") metaHeal(mc.state, u, u.maxHp);
    }
    const st = mc.endlessStatus();
    if (st) {
      maxWave = Math.max(maxWave, st.wave);
      if (mc.state.phase === "battle" && !st.intermission) {
        const enemiesAlive = mc.state.units.filter(
          (u) => u.team === "enemy" && u.state !== "dead"
        ).length;
        if (enemiesAlive > 0 && mc.state.enemyReserves <= 0) reservesEverZero = true;
      }
      if (mc.state.waveBanner) {
        const set = bannersByWave.get(st.wave) ?? new Set<string>();
        set.add(mc.state.waveBanner.kind);
        bannersByWave.set(st.wave, set);
      }
      if (st.intermission) mc.pickBoon(0);
    }
    if (maxWave >= 6) break; // enough waves to cover the first full cycle
  }
  return { mc, bannersByWave, phase: mc.phase, reservesEverZero, maxWave };
}

describe("endless — slay-quest kill tally", () => {
  it("the run ledger records every kill (multiset), not just distinct types", () => {
    // God-mode reliably clears the first 6-wave cycle, killing many repeating
    // fodder. slain must carry duplicates so a slay bounty counts each kill —
    // the same defect as the dungeon "Slay 18× Spore Pod" +1/run report.
    const { mc } = driveGodMode(4242);
    const led = mc.endlessLedger()!;
    expect(led.slain.length).toBeGreaterThan(new Set(led.slain).size);
  });
});

describe("endless — determinism", () => {
  it("same seed + same pick sequence => byte-identical end state", () => {
    const a = drive(4242, () => 0, 6000);
    const b = drive(4242, () => 0, 6000);
    expect(digest(b.mc.state)).toBe(digest(a.mc.state));
    expect(b.wave).toBe(a.wave);
  });

  it("the offer sequence is deterministic from the seed", () => {
    const firstOffers = (seed: number): string[] => {
      const mc = new MatchController(seed, DECK, [], { mode: "endless" });
      for (let i = 0; i < 8000; i++) {
        mc.tick();
        const st = mc.endlessStatus();
        if (st?.intermission) return st.intermission.offers.map((o) => o.id);
      }
      return [];
    };
    const offers = firstOffers(4242);
    expect(offers.length).toBe(3);
    expect(new Set(offers).size).toBe(3); // distinct slots
    expect(firstOffers(4242)).toEqual(offers);
  });

  it("different pick choices diverge the run", () => {
    const a = drive(4242, () => 0, 6000);
    const b = drive(4242, () => 1, 6000);
    expect(digest(b.mc.state)).not.toBe(digest(a.mc.state));
  });
});

describe("endless — frozen intermission", () => {
  it("ticking during an intermission does not advance the sim", () => {
    const mc = new MatchController(777, DECK, [], { mode: "endless" });
    let guard = 0;
    while (guard < 8000 && !mc.endlessStatus()?.intermission) {
      mc.tick();
      guard++;
    }
    expect(mc.endlessStatus()?.intermission).toBeTruthy();
    const before = digest(mc.state);
    for (let i = 0; i < 60; i++) mc.tick();
    expect(digest(mc.state)).toBe(before);
  });
});

describe("endless — cadence + win-condition safety", () => {
  it("rare telegraphs on wave 3, boss on wave 5; never a mid-run victory", () => {
    const run = driveGodMode(4242);

    // God mode guarantees we reach the first boss wave, so the cadence is exercised.
    expect(run.maxWave).toBeGreaterThanOrEqual(6);
    // An endless run must never resolve to a victory, and enemyReserves stays ≥ 1
    // while a wave is live so the win check can't fire between waves.
    expect(run.phase).not.toBe("victory");
    expect(run.reservesEverZero).toBe(false);

    // Fodder waves announce "Wave N"; wave 3 telegraphs a rare, wave 5 a boss.
    expect(run.bannersByWave.get(1)).toContain("wave");
    expect(run.bannersByWave.get(3)).toContain("rare");
    expect(run.bannersByWave.get(5)).toContain("boss");
  });

  it("a plain run is playable and ends in defeat (no crash / hang)", () => {
    const run = drive(4242, () => 0, 40000);
    expect(run.phase).toBe("defeat");
    expect(run.wave).toBeGreaterThanOrEqual(2);
  });

  it("endless monsters stay level 1 (dungeon monster levels never apply here)", () => {
    // Endless borrows dungeon pools per cycle but its own wave curve is the sole
    // difficulty driver — Dungeon.monsterLevel must not leak into its spawns.
    const mc = new MatchController(4242, DECK, [], { mode: "endless" });
    let sawEnemy = false;
    let leveledEnemy: string | null = null;
    let guard = 0;
    while (
      mc.phase !== "defeat" &&
      mc.phase !== "victory" &&
      mc.phase !== "draw" &&
      guard < 8000
    ) {
      mc.tick();
      guard++;
      const st = mc.endlessStatus();
      if (st?.intermission) mc.pickBoon(0);
      for (const u of mc.state.units) {
        if (u.team !== "enemy") continue;
        sawEnemy = true;
        if (u.level !== 1 && leveledEnemy === null) {
          leveledEnemy = `${u.defId} Lv ${u.level}`;
        }
      }
    }
    expect(sawEnemy).toBe(true);
    expect(leveledEnemy).toBeNull();
  });

  it("every dungeon boss and every rare resolve to a real unit def", () => {
    for (const id of DUNGEON_IDS) {
      const boss = getDungeon(id).tiers[0].boss;
      expect(() => getUnitDef(boss)).not.toThrow();
    }
    for (const rare of ENDLESS_RARE_POOL) {
      expect(() => getUnitDef(rare)).not.toThrow();
    }
  });
});

describe("endless — boon correctness", () => {
  it("team dmg mult scales a Berserker's hit despite its per-tick stat recompute", () => {
    const firstHit = (dmgMult: number): number => {
      const s = battleState(9);
      s.teamMods.player.dmgMult = dmgMult;
      place(s, "berserker", "player", 200, 300);
      const dummy = makeDummy(place(s, "skeleton", "enemy", 200, 350));
      const start = dummy.hp;
      let guard = 0;
      while (dummy.hp === start && guard < 200) {
        stepSimulation(s);
        guard++;
      }
      return start - dummy.hp;
    };
    const base = firstHit(1);
    expect(base).toBeGreaterThan(0);
    // Berserker recomputes unit.damage each tick from its def; the team mult still
    // lands because it's read at the damage funnel, not stored on the unit.
    expect(firstHit(2)).toBe(base * 2);
  });

  it("team damage-taken mult reduces incoming damage", () => {
    const taken = (mult: number): number => {
      const s = battleState(10);
      s.teamMods.player.damageTakenMult = mult;
      const victim = place(s, "knight", "player", 200, 350);
      victim.moveSpeed = 0;
      const attacker = place(s, "berserker", "enemy", 200, 300);
      attacker.moveSpeed = 0;
      const start = victim.hp;
      let guard = 0;
      while (victim.hp === start && guard < 200) {
        stepSimulation(s);
        guard++;
      }
      return start - victim.hp;
    };
    const full = taken(1);
    const halved = taken(0.5);
    expect(full).toBeGreaterThan(0);
    expect(halved).toBeLessThan(full);
  });

  it("reviveUnit brings a dead unit back at a fraction of max HP", () => {
    const s = battleState(1);
    const u = place(s, "knight", "player", 100, 100);
    u.state = "dead";
    u.hp = 0;
    reviveUnit(s, u, 0.5);
    expect(u.state).toBe("idle");
    expect(u.hp).toBe(Math.round(u.maxHp * 0.5));
  });

  it("metaHeal clamps to maxHp and no-ops on the dead", () => {
    const s = battleState(1);
    const u = place(s, "knight", "player", 100, 100);
    u.hp = 10;
    metaHeal(s, u, 5);
    expect(u.hp).toBe(15);
    metaHeal(s, u, 99999);
    expect(u.hp).toBe(u.maxHp);
    const dead = place(s, "skeleton", "enemy", 50, 50);
    dead.state = "dead";
    dead.hp = 0;
    metaHeal(s, dead, 100);
    expect(dead.hp).toBe(0);
  });
});

describe("endless — boon offer gating", () => {
  it("revive is offered only when a warband unit is dead; slots stay distinct", () => {
    const noDead = rollBoonOffers(3, new RNG(5), false);
    expect(noDead).not.toContain("second_chance");
    expect(noDead.length).toBe(3);
    expect(new Set(noDead).size).toBe(3);

    const withDead = rollBoonOffers(3, new RNG(5), true);
    expect(withDead).toContain("second_chance");
    expect(withDead.length).toBe(3);
    expect(new Set(withDead).size).toBe(3);
  });

  it("owned unique boons leave the offer pool; stackable ones stay", () => {
    // A second copy of a unique boon (Momentum, Overkill, …) is a no-op, so it
    // must never be re-offered. Stackable boons may repeat.
    const uniques = new Set([
      "overkill",
      "last_breath",
      "overheal_ward",
      "berserkers_rhythm",
      "momentum",
    ]);
    for (let seed = 1; seed <= 40; seed++) {
      const offers = rollBoonOffers(12, new RNG(seed), false, uniques);
      for (const id of offers) expect(uniques.has(id)).toBe(false);
    }
    // Sanity: with nothing owned, uniques CAN appear (find at least one).
    let sawUnique = false;
    for (let seed = 1; seed <= 40 && !sawUnique; seed++) {
      sawUnique = rollBoonOffers(12, new RNG(seed), false).some((id) =>
        uniques.has(id)
      );
    }
    expect(sawUnique).toBe(true);
  });
});

describe("endless — once-per-battle passives re-arm each wave", () => {
  it("spent one-shots reset and Ambush re-stealths when the next wave opens", () => {
    const mc = new MatchController(
      321,
      ["ogre", "assassin", "berserker", "archer"],
      [],
      { mode: "endless" }
    );
    let guard = 0;
    while (guard < 12000 && !mc.endlessStatus()?.intermission) {
      mc.tick();
      guard++;
      // God-mode heal so the whole warband reliably survives to the intermission.
      for (const u of mc.state.units) {
        if (u.team === "player" && u.state !== "dead") metaHeal(mc.state, u, u.maxHp);
      }
    }
    expect(mc.endlessStatus()?.intermission).toBeTruthy();

    // Mark every one-shot as spent, as a long wave would have.
    const warband = mc.state.units.filter((u) => u.team === "player");
    const assassin = warband.find((u) => u.defId === "assassin")!;
    for (const u of warband) {
      u.vanishUsed = true;
      u.secondWindUsed = true;
      u.lastStandUsed = true;
      u.stealthTriggerUsed = true;
      u.resurrectionUsed = true; // the Seraph's once-per-battle rez
      u.ambushReady = false;
    }
    assassin.effects = assassin.effects.filter((e) => e.type !== "stealth");

    mc.pickBoon(0); // next wave opens -> wave-start prep runs

    for (const u of warband) {
      expect(u.vanishUsed).toBe(false);
      expect(u.secondWindUsed).toBe(false);
      expect(u.lastStandUsed).toBe(false);
      expect(u.stealthTriggerUsed).toBe(false);
      expect(u.resurrectionUsed).toBe(false);
    }
    // Ambush re-arms only on the assassin (flag + fresh opening stealth).
    expect(assassin.ambushReady).toBe(true);
    expect(assassin.effects.some((e) => e.type === "stealth")).toBe(true);
    const ogre = warband.find((u) => u.defId === "ogre")!;
    expect(ogre.ambushReady).toBe(false);
  });
});

describe("endless — retire", () => {
  it("retiring is only legal at an intermission; it ends the run keeping the score", () => {
    const mc = new MatchController(777, DECK, [], { mode: "endless" });
    expect(mc.retireEndless()).toBe(false); // mid-wave: refused
    let guard = 0;
    while (guard < 8000 && !mc.endlessStatus()?.intermission) {
      mc.tick();
      guard++;
    }
    expect(mc.endlessStatus()?.intermission).toBeTruthy();
    const cleared = mc.wavesSurvived();
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect(mc.retireEndless()).toBe(true);
    expect(mc.phase).toBe("defeat"); // the endless end-of-run phase
    expect(mc.wavesSurvived()).toBe(cleared); // the banked score is untouched
  });
});

describe("endless — proc boon mechanics (via teamMods funnels)", () => {
  /** Step until `target`'s HP first changes, returning the amount lost. */
  function firstHpLoss(s: ReturnType<typeof battleState>, target: { hp: number }) {
    const start = target.hp;
    let guard = 0;
    while (target.hp === start && guard < 300) {
      stepSimulation(s);
      guard++;
    }
    return start - target.hp;
  }

  it("Executioner adds damage only vs targets below the execute threshold", () => {
    const hit = (bonus: number, hpFrac: number): number => {
      const s = battleState(31);
      s.teamMods.player.executeBonus = bonus;
      place(s, "berserker", "player", 200, 300); // base 14 dmg at full HP
      const dummy = place(s, "skeleton", "enemy", 200, 350);
      dummy.moveSpeed = 0;
      dummy.damage = 0;
      dummy.maxHp = 1000;
      dummy.hp = Math.round(1000 * hpFrac);
      return firstHpLoss(s, dummy);
    };
    // Healthy target (80% HP): the execute bonus does nothing.
    expect(hit(1, 0.8)).toBe(hit(0, 0.8));
    // Low target (20% HP): +100% execute doubles the hit.
    const base = hit(0, 0.2);
    expect(hit(1, 0.2)).toBe(base * 2);
  });

  it("Overkill's crit doubles the marked swing", () => {
    const hit = (everyNth: number): number => {
      const s = battleState(32);
      s.teamMods.player.critEveryNth = everyNth;
      place(s, "berserker", "player", 200, 300);
      const dummy = makeDummy(place(s, "skeleton", "enemy", 200, 350));
      return firstHpLoss(s, dummy);
    };
    const base = hit(0);
    expect(base).toBeGreaterThan(0);
    expect(hit(1)).toBe(base * 2); // every attack crits
  });

  it("Thornmail reflects a fraction of damage taken back at the attacker", () => {
    const s = battleState(33);
    s.teamMods.player.thornsFrac = 0.5;
    // Player victim soaks hits and deals none; enemy attacker takes reflect.
    const victim = place(s, "skeleton", "player", 200, 340);
    victim.moveSpeed = 0;
    victim.damage = 0;
    victim.maxHp = victim.hp = 100000;
    const attacker = place(s, "berserker", "enemy", 200, 300);
    attacker.moveSpeed = 0;
    const loss = firstHpLoss(s, attacker); // only source of loss is thorns
    expect(loss).toBeGreaterThan(0);
  });

  it("an on-hit rider stuns the target every Nth attack", () => {
    const s = battleState(34);
    s.teamMods.player.onHitRiders = [
      { effectType: "stun", everyNth: 1, durationSec: 1 },
    ];
    place(s, "berserker", "player", 200, 300);
    const dummy = makeDummy(place(s, "skeleton", "enemy", 200, 350));
    let guard = 0;
    while (!dummy.effects.some((e) => e.type === "stun") && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(dummy.effects.some((e) => e.type === "stun")).toBe(true);
  });

  it("Bloodfeast heals the whole warband on a kill", () => {
    const s = battleState(35);
    s.teamMods.player.killHeal = 20;
    place(s, "berserker", "player", 200, 300); // the slayer
    // A wounded, idle ally that should be topped up by the kill.
    const ally = place(s, "skeleton", "player", 100, 300);
    ally.moveSpeed = 0;
    ally.damage = 0;
    ally.maxHp = 1000;
    ally.hp = 10;
    const prey = place(s, "skeleton", "enemy", 200, 350);
    prey.moveSpeed = 0;
    prey.damage = 0;
    prey.hp = prey.maxHp = 5; // one berserker swing kills it
    let guard = 0;
    while (prey.state !== "dead" && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(prey.state).toBe("dead");
    expect(ally.hp).toBe(30); // 10 + 20 killHeal
  });

  it("Bounty Hunter grows the slayer's max HP on a kill", () => {
    const s = battleState(36);
    s.teamMods.player.bountyHp = 5;
    const slayer = place(s, "berserker", "player", 200, 300);
    const startMax = slayer.maxHp;
    const prey = place(s, "skeleton", "enemy", 200, 350);
    prey.moveSpeed = 0;
    prey.damage = 0;
    prey.hp = prey.maxHp = 5;
    let guard = 0;
    while (prey.state !== "dead" && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(prey.state).toBe("dead");
    expect(slayer.maxHp).toBe(startMax + 5);
  });

  it("Last Breath cheats a fatal blow once, then is spent", () => {
    const s = battleState(37);
    s.teamMods.player.lastBreath = true;
    const victim = place(s, "skeleton", "player", 200, 340);
    victim.moveSpeed = 0;
    victim.damage = 0;
    victim.hp = victim.maxHp = 10;
    victim.cheatDeathReady = true;
    const attacker = place(s, "berserker", "enemy", 200, 300); // ~14 dmg, lethal
    attacker.moveSpeed = 0;
    // First lethal blow: survives at 1 HP, charge consumed.
    let guard = 0;
    while (victim.cheatDeathReady && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(victim.state).not.toBe("dead");
    expect(victim.hp).toBe(1);
    expect(victim.cheatDeathReady).toBe(false);
    // Next lethal blow finishes it (charge is spent).
    guard = 0;
    while (victim.state !== "dead" && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(victim.state).toBe("dead");
  });

  it("Overheal Ward banks lifesteal overflow as shield", () => {
    const s = battleState(38);
    s.teamMods.player.overheal = true;
    s.teamMods.player.lifestealBonus = 3; // heals 3x damage — guaranteed overflow
    const zerk = place(s, "berserker", "player", 200, 300); // spawns at full HP
    const dummy = makeDummy(place(s, "skeleton", "enemy", 200, 350));
    let guard = 0;
    while (zerk.shieldHp === 0 && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(zerk.shieldHp).toBeGreaterThan(0);
  });

  it("Marksman's Focus heals a ranged attacker on hit", () => {
    const s = battleState(39);
    s.teamMods.player.rangedLifesteal = 0.5;
    const archer = place(s, "archer", "player", 200, 300);
    archer.hp = 10; // wounded so the heal is observable
    const dummy = makeDummy(place(s, "skeleton", "enemy", 200, 380));
    let guard = 0;
    while (archer.hp === 10 && guard < 200) {
      stepSimulation(s);
      guard++;
    }
    expect(archer.hp).toBeGreaterThan(10);
  });

  it("Kennel Master / War Machine summon defIds are real units", () => {
    expect(() => getUnitDef("wolf")).not.toThrow();
    expect(() => getUnitDef("turret")).not.toThrow();
  });

  it("picking a summon boon puts pets on the field at the next wave", () => {
    // God-mode survival so the run reaches deep-enough offers to be shown a summon
    // boon, then pick it and confirm wolves/turrets appear on the player team.
    const mc = new MatchController(9182, DECK, [], { mode: "endless" });
    let guard = 0;
    let pickedSummon = false;
    let sawPet = false;
    while (guard < 40000) {
      mc.tick();
      guard++;
      for (const u of mc.state.units) {
        if (u.team === "player" && u.state !== "dead") metaHeal(mc.state, u, u.maxHp);
      }
      if (
        mc.state.units.some(
          (u) => u.team === "player" && (u.defId === "wolf" || u.defId === "turret")
        )
      ) {
        sawPet = true;
        break;
      }
      const st = mc.endlessStatus();
      if (st?.intermission) {
        const idx = st.intermission.offers.findIndex(
          (o) => o.id === "kennel_master" || o.id === "war_machine"
        );
        if (idx >= 0) {
          mc.pickBoon(idx);
          pickedSummon = true;
        } else {
          mc.pickBoon(0);
        }
      }
    }
    expect(pickedSummon).toBe(true);
    expect(sawPet).toBe(true);
  });
});
