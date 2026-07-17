// Random encounters — the omen paths and the three floor flavors (cursed,
// treasure_vault, treasure_room) plus the rare quarry. The overriding contract:
// a "normal" floor is byte-identical to before (guarded rolls never shift its
// RNG order), while each special reshapes the wave and/or the reward
// deterministically. The rare banner belongs to the fusion-quest rare ALONE —
// no ordinary monster is ever promoted to a rare elite (see the last describe).
import { describe, expect, it } from "vitest";
import { MatchController } from "@/engine/MatchController";
import { WaveController } from "@/engine/WaveController";
import { createSimState, type SimState } from "@/engine/CombatSystem";
import {
  DUNGEON_IDS,
  getDungeon,
  floorStatMultipliersIn,
  tierForFloorIn,
} from "@/data/dungeons";
import { getUnitDef } from "@/data/units";
import { questRequiredUnits, questUnlockIds } from "@/data/depths";
import {
  assignOmens,
  OMEN_META,
  type EncounterKind,
  type Omen,
  type OmenArrow,
  type OmenDir,
} from "@/data/encounters";
import { computeBattleRewards, computeTreasureRewards } from "@/meta/rewards";

const depths = getDungeon("depths");

/** Drain a WaveController's whole plan with an unlimited enemy cap, returning
 *  the spawn order. Clears each spawn so gated phases advance. */
function drain(seed: number, floor: number, encounter?: EncounterKind): string[] {
  const wc = new WaveController(seed, depths, floor, encounter);
  const s: SimState = createSimState(seed, 300);
  s.activeCaps = { player: 4, enemy: 999 };
  const out: string[] = [];
  let guard = 0;
  while (wc.remaining > 0 && guard < 8000) {
    const before = s.units.length;
    wc.step(s);
    if (s.units.length > before) {
      out.push(s.units[s.units.length - 1].defId);
      s.units[s.units.length - 1].state = "dead";
    }
    guard++;
  }
  return out;
}

/** Drive a phased floor (boss/rare quarry), clearing the field each tick,
 *  logging the spawn order + the telegraph banners in first-seen order. */
function simulate(
  seed: number,
  floor: number,
  encounter: EncounterKind
): { spawns: string[]; banners: string[] } {
  const wc = new WaveController(seed, depths, floor, encounter);
  const s: SimState = createSimState(seed, 300);
  s.activeCaps = { player: 4, enemy: 12 };
  const spawns: string[] = [];
  const banners: string[] = [];
  let lastBanner: unknown = null;
  let guard = 0;
  while (wc.remaining > 0 && guard < 8000) {
    const before = s.units.length;
    wc.step(s);
    if (s.waveBanner && s.waveBanner !== lastBanner) banners.push(s.waveBanner.kind);
    lastBanner = s.waveBanner;
    if (s.units.length > before) spawns.push(s.units[s.units.length - 1].defId);
    for (const u of s.units) if (u.team === "enemy") u.state = "dead";
    guard++;
  }
  return { spawns, banners };
}

/** The highest-cost monster in a floor's pool (what the removed ambush elite
 *  used to promote to a rare — kept so the guard below can name it). */
function priciest(floor: number): string {
  return Object.entries(tierForFloorIn(depths, floor).monsters).sort(
    (a, b) => b[1] - a[1]
  )[0][0];
}

describe("no-regression — a normal floor is unchanged", () => {
  it("passing encounter='normal' matches the default (no shift)", () => {
    for (const floor of [1, 2, 3, 4, 5]) {
      expect(drain(42, floor, "normal")).toEqual(drain(42, floor));
    }
  });

  it("treasure_vault builds the exact same wave as normal (reward-only)", () => {
    expect(drain(6, 2, "treasure_vault")).toEqual(drain(6, 2, "normal"));
    expect(drain(6, 3, "treasure_vault")).toEqual(drain(6, 3, "normal"));
  });
});

describe("reward tier bumps", () => {
  const base = {
    mode: "depths" as const,
    floor: 2,
    dungeonId: "depths",
    outcome: "victory" as const,
    unlockedUnits: [] as string[],
    highestClearedFloor: 1, // floor 2 is a first clear
    chestSeed: 1234,
  };

  it("a normal first-clear drops the base wooden chest", () => {
    expect(computeBattleRewards(base).chest?.tier).toBe("wooden");
    expect(computeBattleRewards({ ...base, encounter: "normal" }).chest?.tier).toBe(
      "wooden"
    );
  });

  it("cursed / treasure_vault each bump it a tier", () => {
    for (const enc of ["cursed", "treasure_vault"] as const) {
      expect(computeBattleRewards({ ...base, encounter: enc }).chest?.tier).toBe(
        "silver"
      );
    }
  });
});

describe("no ordinary monster is ever promoted to a rare — EVERY dungeon", () => {
  // Regression guard for the removed "ambush" encounter, which turned a floor's
  // priciest ORDINARY monster (the Depths' Zombie Shambler) into a telegraphed
  // rare elite. The rare banner is the fusion-quest rare's alone — and that has
  // to hold for all nine dungeons, not just the one that surfaced the bug.
  // EVERY EncounterKind, exhaustiveness enforced by the compiler: `satisfies`
  // makes adding a kind a type error here until it's listed, so a future
  // encounter can't quietly reintroduce a promoted-fodder rare.
  const ALL_ENCOUNTERS = Object.keys({
    normal: 1,
    cursed: 1,
    rare_spawn: 1,
    treasure_vault: 1,
    treasure_room: 1,
  } satisfies Record<EncounterKind, 1>) as EncounterKind[];

  it("pins the old elite's identity (the Depths' priciest fodder)", () => {
    expect(priciest(2)).toBe("zombie_shambler");
  });

  it("across every dungeon, EVERY encounter kind: only the quest rare is rare", () => {
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      const rareId = d.quest!.spawnId;
      for (let seed = 1; seed <= 40; seed++) {
        for (const floor of [1, 2, 3, 4, 6, 7]) {
          for (const enc of ALL_ENCOUNTERS) {
            if (enc === "treasure_room") continue; // no combat at all
            // `false` = explicitly NOT the lair, so any rare here would be a
            // non-boss floor manufacturing one.
            const plan = new WaveController(seed, d, floor, enc, false).planForTest();
            const where = `${id} f${floor} ${enc}`;
            if (enc === "rare_spawn") {
              // The one non-boss floor allowed a rare — and it must be the
              // dungeon's own quest rare, never fodder.
              expect(plan, where).not.toBeNull();
              expect(plan!.catalyst, where).toBe(rareId);
            } else {
              // A phased plan is the ONLY thing that can telegraph a rare; an
              // ordinary floor must stay a flat trickle.
              expect(plan, where).toBeNull();
            }
          }
        }
      }
    }
  });

  it("every rare that CAN spawn is that dungeon's own quest rare", () => {
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      const rareId = d.quest!.spawnId;
      // A quarry floor: the rare is guaranteed and is the quest rare.
      const quarry = new WaveController(1, d, 3, "rare_spawn").planForTest();
      expect(quarry!.catalyst, id).toBe(rareId);
      // A lair floor: the catalyst either doesn't roll, or is the quest rare.
      for (let seed = 1; seed <= 120; seed++) {
        const cat = new WaveController(seed, d, 5, "normal", true, false)
          .planForTest()!.catalyst;
        if (cat !== null) expect(cat, id).toBe(rareId);
      }
    }
  });

  it("no dungeon's quest rare is also one of its fodder monsters", () => {
    // Belt-and-braces on the rule itself: if a quest rare were IN the fodder
    // pool, ordinary spawns of it would blur the "rares are special" line.
    for (const id of DUNGEON_IDS) {
      const d = getDungeon(id);
      for (const tier of d.tiers) {
        expect(Object.keys(tier.monsters), id).not.toContain(d.quest!.spawnId);
      }
    }
  });

  it("cursed is still a real ominous floor (bigger horde, no fake rare)", () => {
    expect(drain(3, 2, "cursed")).not.toEqual(drain(3, 2, "normal"));
    expect(drain(3, 2, "normal")).toEqual(drain(3, 2)); // normal path intact
  });
});

describe("cursed gauntlet", () => {
  it("throws a bigger wave on average than a normal floor", () => {
    const avg = (enc: EncounterKind) => {
      let total = 0;
      for (let seed = 1; seed <= 12; seed++) total += drain(seed, 2, enc).length;
      return total / 12;
    };
    expect(avg("cursed")).toBeGreaterThan(avg("normal"));
  });

  it("hardens each monster past the plain floor scaling", () => {
    const wc = new WaveController(31, depths, 2, "cursed");
    const s: SimState = createSimState(31, 120);
    s.activeCaps = { player: 4, enemy: 999 };
    let guard = 0;
    while (s.units.length === 0 && guard < 100) {
      wc.step(s);
      guard++;
    }
    const u = s.units[0];
    const def = getUnitDef(u.defId);
    // Depths fodder is level 1 (no level bake), so a plain floor spawn would be
    // round(def.hp * floorMult). Cursed layers its multiplier ON TOP.
    const plain = Math.round(def.hp * floorStatMultipliersIn(depths, 2).hp);
    expect(u.maxHp).toBeGreaterThan(plain);
  });

  it("stays deterministic", () => {
    expect(drain(5, 3, "cursed")).toEqual(drain(5, 3, "cursed"));
  });
});

describe("treasure room", () => {
  it("computeTreasureRewards returns three deterministic, independent chests", () => {
    const input = {
      floor: 2,
      highestClearedFloor: 1,
      chestSeed: 999,
      unlockedUnits: [] as string[],
    };
    const a = computeTreasureRewards(input);
    const b = computeTreasureRewards(input);
    expect(a.chests.length).toBe(3);
    expect(a.firstClear).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic
    // The three chests roll off INDEPENDENT seeds (distinct contents streams).
    expect(new Set(a.chests.map((c) => c.seed)).size).toBe(3);
  });

  it("MatchController fields the warband, spawns no horde, and never resolves", () => {
    const mc = new MatchController(
      7,
      ["knight", "archer", "warrior", "mage"],
      [],
      { mode: "depths", floor: 2, encounter: "treasure_room" }
    );
    expect(mc.countActive("player")).toBeGreaterThan(0); // warband auto-fielded
    expect(mc.countActive("enemy")).toBe(0); // no monsters
    // tick() is a no-op — nothing ever steps the sim to a victory/defeat.
    const phaseBefore = mc.phase;
    for (let i = 0; i < 60; i++) mc.tick();
    expect(mc.phase).toBe(phaseBefore);
    expect(["victory", "defeat", "draw"]).not.toContain(mc.phase);
  });
});

describe("assignOmens — the exit-arrow paths", () => {
  /** The three arrows' encounter kinds (what they actually LEAD to). */
  const kindsOf = (o: Record<OmenDir, OmenArrow>): EncounterKind[] =>
    Object.values(o).map((a) => a.kind);

  it("is deterministic for a given seed", () => {
    expect(assignOmens(12345, depths, 2)).toEqual(assignOmens(12345, depths, 2));
  });

  it("never offers a room/curse when the next floor is a boss floor", () => {
    // Depths floor 5 is a boss floor: entering it must be all-normal.
    for (let seed = 1; seed <= 60; seed++) {
      expect(kindsOf(assignOmens(seed, depths, 5))).toEqual([
        "normal",
        "normal",
        "normal",
      ]);
    }
  });

  it("can offer a special on an ordinary next floor", () => {
    let sawSpecial = false;
    for (let seed = 1; seed <= 300 && !sawSpecial; seed++) {
      if (kindsOf(assignOmens(seed, depths, 3)).some((k) => k !== "normal")) {
        sawSpecial = true;
      }
    }
    expect(sawSpecial).toBe(true);
  });

  it("can offer a RARE QUARRY in a quest dungeon, but never when disallowed", () => {
    let sawQuarry = false;
    for (let seed = 1; seed <= 400 && !sawQuarry; seed++) {
      if (kindsOf(assignOmens(seed, depths, 3)).includes("rare_spawn")) {
        sawQuarry = true;
      }
    }
    expect(sawQuarry).toBe(true); // depths has a fusion quest → quarry reachable
    // Once the run has met its rare (allowRareSpawn=false), never again.
    for (let seed = 1; seed <= 400; seed++) {
      const omens = assignOmens(seed, depths, 3, false, false);
      expect(kindsOf(omens)).not.toContain("rare_spawn");
    }
  });
});

describe("the rare quarry is never telegraphed", () => {
  /** Every arrow across a wide seed sweep, split by whether it hides the rare. */
  function sweep(): { rare: Set<Omen>; plain: Set<Omen> } {
    const rare = new Set<Omen>();
    const plain = new Set<Omen>();
    for (let seed = 1; seed <= 800; seed++) {
      for (const arrow of Object.values(assignOmens(seed, depths, 3))) {
        (arrow.kind === "rare_spawn" ? rare : plain).add(arrow.omen);
      }
    }
    return { rare, plain };
  }

  it("has no rare omen to render at all — there is nothing to give it away", () => {
    expect(Object.keys(OMEN_META).sort()).toEqual(["ominous", "safe", "treasure"]);
  });

  it("hides behind ALL THREE omens, not just the ominous one", () => {
    const { rare } = sweep();
    expect([...rare].sort()).toEqual(["ominous", "safe", "treasure"]);
  });

  it("wears only omens that ordinary floors also wear (the glyph never tells)", () => {
    const { rare, plain } = sweep();
    // For every omen a quarry can wear, a harmless arrow wears it too — so
    // reading an arrow can never prove the rare is behind it.
    for (const omen of rare) expect(plain.has(omen)).toBe(true);
  });
});

describe("rare quarry encounter", () => {
  const rareId = depths.quest!.spawnId; // the fusion-quest rare (the Slime)

  it("plans fodder + the fusion-quest rare (guaranteed), no boss", () => {
    const plan = new WaveController(1, depths, 3, "rare_spawn").planForTest();
    expect(plan).not.toBeNull();
    expect(plan!.boss).toBe(""); // no dungeon boss — the rare is the finale
    expect(plan!.catalyst).toBe(rareId); // the rare, always (not a chance roll)
    expect(plan!.fodder.length).toBeGreaterThan(0);
  });

  it("telegraphs the rare and enters it last", () => {
    const { spawns, banners } = simulate(3, 3, "rare_spawn");
    expect(banners).toEqual(["rare"]);
    expect(spawns[spawns.length - 1]).toBe(rareId);
  });

  it("unlocks the fusion quest when slain with the required unit fielded", () => {
    const q = depths.quest!;
    const r = computeBattleRewards({
      mode: "depths",
      dungeonId: "depths",
      floor: 3, // a rare-quarry floor sits at any depth, not floor 5
      outcome: "victory",
      unlockedUnits: [],
      chestSeed: 7,
      encounter: "rare_spawn",
      deck: questRequiredUnits(q),
      slain: [q.spawnId],
    });
    expect(r.questUnlocks).toEqual(questUnlockIds(q));
  });
});

describe("boss-floor rare suppression (mutual exclusivity)", () => {
  const rareId = depths.quest!.spawnId;

  it("suppressQuestRare removes the rare from every boss-floor plan", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const plan = new WaveController(
        seed,
        depths,
        5,
        "normal",
        true, // isBoss
        true // suppressQuestRare
      ).planForTest();
      expect(plan!.catalyst).toBeNull();
    }
  });

  it("without suppression the boss floor still rolls the rare sometimes", () => {
    let sawRare = false;
    for (let seed = 1; seed <= 300 && !sawRare; seed++) {
      const plan = new WaveController(
        seed,
        depths,
        5,
        "normal",
        true,
        false
      ).planForTest();
      if (plan!.catalyst === rareId) sawRare = true;
    }
    expect(sawRare).toBe(true);
  });
});
