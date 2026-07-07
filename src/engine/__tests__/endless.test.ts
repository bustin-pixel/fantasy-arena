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
  return { bannersByWave, phase: mc.phase, reservesEverZero, maxWave };
}

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
});
