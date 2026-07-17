// Items engine specs — the equipment channel (createUnit bake + itemMods
// funnel reads + spawn stamps + arena mirror). The overarching invariants:
//   IDENTITY — a sim with no loadouts is byte-identical to one never told
//   about items at all (digest equality), and
//   DETERMINISM — same seed + same loadouts → identical digests.
// Behavior specs use hand-built battleStates (skeleton wearers/dummies — the
// Knight's shield and Ogre's slam mask measured damage, see helpers).
import { describe, expect, it } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { hasEffect } from "@/engine/StatusEffectSystem";
import { abilityCooldownTicks } from "@/engine/AbilitySystem";
import { MatchController } from "@/engine/MatchController";
import { getUnitDef } from "@/data/units";
import {
  ITEM_LINES,
  describeItemKey,
  makeItemKey,
  nextItemKey,
  resolveItemMods,
  resolveLoadoutMods,
} from "@/data/items";
import { levelStatMultipliers } from "@/meta/leveling";
import type { ItemLoadout, ItemLoadouts, ItemMods, Unit } from "@/types";
import type { ItemCarry } from "@/entities/createUnit";
import { battleState, digest, makeDummy, place, runMatch } from "./helpers";

/** Resolve a loadout into the carry `deploy()` would hand to createUnit. */
function carry(defId: string, loadout: ItemLoadout): ItemCarry {
  const mods = resolveLoadoutMods(loadout);
  if (!mods) throw new Error("empty loadout in test");
  return { mods, owner: defId };
}

const P_DECK = ["ogre", "archer", "knight", "fire_mage"];
const E_DECK = ["warrior", "mage", "healer", "berserker"];
const FULL_LOADOUTS: ItemLoadouts = {
  knight: {
    weapon: "soldiers_blade:legendary:3",
    armor: "golem_core:legendary:2",
    trinket: "giant_slayer_idol:epic:1",
  },
  archer: { weapon: "windlash_saber:epic:2", trinket: "ember_charm:rare:3" },
  ogre: { armor: "squires_plate:legendary:1" },
};

describe("items — identity & determinism", () => {
  it("empty loadouts are byte-identical to no loadouts at all (two seeds)", () => {
    for (const seed of [11, 4242]) {
      const bare = runMatch(seed, P_DECK, E_DECK);
      const empty = runMatch(seed, P_DECK, E_DECK, { itemLoadouts: {} });
      expect(digest(empty.state)).toBe(digest(bare.state));
    }
  });

  it("a loadout on a unit NOT in the deck changes nothing", () => {
    const bare = runMatch(77, P_DECK, E_DECK);
    const stray = runMatch(77, P_DECK, E_DECK, {
      itemLoadouts: { necromancer: { weapon: "hexblade:legendary:3" } },
    });
    expect(digest(stray.state)).toBe(digest(bare.state));
  });

  it("same seed + same loadouts → identical digests; different loadouts diverge", () => {
    const a = runMatch(99, P_DECK, E_DECK, { itemLoadouts: FULL_LOADOUTS });
    const b = runMatch(99, P_DECK, E_DECK, { itemLoadouts: FULL_LOADOUTS });
    expect(digest(a.state)).toBe(digest(b.state));
    const c = runMatch(99, P_DECK, E_DECK, {
      itemLoadouts: { knight: { weapon: "twinfang_daggers:rare:1" } },
    });
    expect(digest(c.state)).not.toBe(digest(a.state));
  });
});

describe("items — the stat bake (createUnit)", () => {
  it("nested rounding, level first: round(round(def × lvl) × item)", () => {
    const s = battleState(1);
    const items = carry("skeleton", { weapon: "soldiers_blade:legendary:3" });
    const u = place(s, "skeleton", "player", 100, 100, 3, items);
    const def = getUnitDef("skeleton");
    const lvl = levelStatMultipliers(3);
    expect(u.maxHp).toBe(
      Math.round(Math.round(def.hp * lvl.hp) * items.mods.hpMult) // the blade's hp sub
    );
    expect(u.damage).toBe(
      Math.round(Math.round(def.damage * lvl.dmg) * items.mods.dmgMult)
    );
    expect(u.itemMods).toBeDefined();
    expect(u.latentItems).toBe(items);
  });

  it("carried gear with a foreign owner stays latent (no bake, no itemMods)", () => {
    const s = battleState(1);
    const foreign = carry("necromancer", { weapon: "soldiers_blade:legendary:3" });
    const u = place(s, "skeleton", "player", 100, 100, 1, foreign);
    expect(u.damage).toBe(getUnitDef("skeleton").damage);
    expect(u.itemMods).toBeUndefined();
    expect(u.latentItems).toBe(foreign);
  });

  it("Golem Core: spawns with a shield worth the fraction of baked max HP", () => {
    const s = battleState(1);
    const items = carry("skeleton", { armor: "golem_core:legendary:1" });
    const u = place(s, "skeleton", "player", 100, 100, 1, items);
    expect(u.shieldHp).toBe(Math.round(u.maxHp * 0.15));
    expect(u.shieldHpMax).toBe(u.shieldHp);
  });
});

describe("items — damage funnel effects", () => {
  /** Wearer + adjacent stationary dummy; returns both. */
  function duel(seed: number, loadout?: ItemLoadout, dummyDef = "skeleton") {
    const s = battleState(seed);
    const wearer = place(
      s,
      "skeleton",
      "player",
      100,
      100,
      1,
      loadout ? carry("skeleton", loadout) : undefined
    );
    wearer.moveSpeed = 0;
    const dummy = makeDummy(place(s, dummyDef, "enemy", 130, 100));
    return { s, wearer, dummy };
  }

  /** Step until the wearer has landed `n` attacks (or a tick cap). */
  function stepUntilAttacks(
    s: ReturnType<typeof battleState>,
    wearer: Unit,
    n: number,
    cap = 400
  ) {
    for (let i = 0; i < cap && wearer.attackCount < n; i++) stepSimulation(s);
  }

  it("execute (Soldier's Blade legendary): +25% vs targets below 25% HP", () => {
    const { s, wearer, dummy } = duel(3, { weapon: "soldiers_blade:legendary:1" });
    dummy.hp = 10000; // 10% of 100000 — inside the execute window
    stepUntilAttacks(s, wearer, 1);
    expect(10000 - dummy.hp).toBe(Math.round(wearer.damage * 1.25));
  });

  it("giant slayer: bonus only vs higher-max-HP enemies", () => {
    const { s, wearer, dummy } = duel(4, { trinket: "giant_slayer_idol:rare:1" });
    stepUntilAttacks(s, wearer, 1);
    expect(100000 - dummy.hp).toBe(Math.round(wearer.damage * 1.1));
  });

  it("lifesteal (Bloodletter legendary): melee hits heal the wearer", () => {
    const { s, wearer } = duel(5, { weapon: "bloodletter_axe:legendary:3" });
    wearer.hp = Math.floor(wearer.maxHp / 2);
    const before = wearer.hp;
    stepUntilAttacks(s, wearer, 1);
    expect(wearer.hp - before).toBe(Math.round(wearer.damage * 0.2));
  });

  it("thorns (Squire's Plate legendary): reflects a fraction at the attacker", () => {
    const s = battleState(6);
    const attacker = place(s, "skeleton", "player", 100, 100);
    attacker.moveSpeed = 0;
    attacker.hp = attacker.maxHp = 1000;
    const thorny = makeDummy(
      place(s, "skeleton", "enemy", 130, 100, 1, carry("skeleton", {
        armor: "squires_plate:legendary:1",
      }))
    );
    expect(thorny.itemMods?.thornsFrac).toBe(0.1);
    stepUntilAttacks(s, attacker, 1);
    expect(1000 - attacker.hp).toBe(Math.round(attacker.damage * 0.1));
  });

  it("Phasecloak: one-shot stealth on first drop below half HP", () => {
    const s = battleState(7);
    const wearer = place(s, "skeleton", "player", 100, 100, 1, carry("skeleton", {
      armor: "phasecloak:legendary:1",
    }));
    wearer.moveSpeed = 0;
    const killer = place(s, "skeleton", "enemy", 130, 100);
    killer.moveSpeed = 0;
    killer.hp = killer.maxHp = 100000;
    killer.damage = Math.ceil(wearer.maxHp * 0.6); // one hit → below half, alive
    for (let i = 0; i < 200 && !hasEffect(wearer, "stealth"); i++) {
      stepSimulation(s);
    }
    expect(wearer.state).not.toBe("dead");
    expect(hasEffect(wearer, "stealth")).toBe(true);
    expect(wearer.stealthTriggerUsed).toBe(true);
  });
});

describe("items — swing effects", () => {
  function duel(seed: number, loadout: ItemLoadout) {
    const s = battleState(seed);
    const wearer = place(s, "skeleton", "player", 100, 100, 1, carry("skeleton", loadout));
    wearer.moveSpeed = 0;
    const dummy = makeDummy(place(s, "skeleton", "enemy", 130, 100));
    return { s, wearer, dummy };
  }

  it("Hexblade legendary: every 4th hit silences", () => {
    const { s, wearer, dummy } = duel(8, { weapon: "hexblade:legendary:1" });
    for (let i = 0; i < 300 && wearer.attackCount < 4; i++) stepSimulation(s);
    expect(wearer.attackCount).toBeGreaterThanOrEqual(4);
    expect(hasEffect(dummy, "silence")).toBe(true);
  });

  it("Twinfang legendary: the 3rd attack strikes twice", () => {
    const { s, wearer, dummy } = duel(9, { weapon: "twinfang_daggers:legendary:1" });
    for (let i = 0; i < 300 && wearer.attackCount < 3; i++) stepSimulation(s);
    expect(wearer.attackCount).toBe(3);
    expect(100000 - dummy.hp).toBe(4 * wearer.damage); // 3 swings + 1 extra
  });

  it("Stormpiercer legendary: the 4th attack chains to the nearest other enemy", () => {
    const { s, wearer, dummy } = duel(10, { weapon: "stormpiercer:legendary:1" });
    const bystander = makeDummy(place(s, "skeleton", "enemy", 180, 100));
    for (let i = 0; i < 300 && wearer.attackCount < 4; i++) stepSimulation(s);
    // The giant-slayer sub is live here: the huge dummies out-HP the wearer.
    const gs = 1 + wearer.itemMods!.giantSlayerPct;
    expect(100000 - bystander.hp).toBe(
      Math.round(Math.round(wearer.damage * 0.5) * gs)
    );
    expect(100000 - dummy.hp).toBe(4 * Math.round(wearer.damage * gs));
  });

  it("Windlash Tempo: consecutive hits on one target stack (count − 1)", () => {
    const { s, wearer } = duel(11, { weapon: "windlash_saber:legendary:1" });
    for (let i = 0; i < 300 && wearer.attackCount < 4; i++) stepSimulation(s);
    expect(wearer.tempoStacks).toBe(wearer.attackCount - 1);
  });

  it("Venom Fang legendary: hits on a poisoned target spread the poison", () => {
    const { s, wearer, dummy } = duel(12, { trinket: "venom_fang:legendary:1" });
    const bystander = makeDummy(place(s, "skeleton", "enemy", 165, 100)); // within 55px of dummy
    for (let i = 0; i < 400 && wearer.attackCount < 4; i++) stepSimulation(s);
    expect(hasEffect(dummy, "poison")).toBe(true); // rider landed on the 3rd
    expect(hasEffect(bystander, "poison")).toBe(true); // 4th hit splashed it
  });

  it("Ember Charm legendary: burning victims detonate on death (nova + burn)", () => {
    const s = battleState(13);
    const wearer = place(s, "skeleton", "player", 100, 100, 1, carry("skeleton", {
      trinket: "ember_charm:legendary:1",
    }));
    wearer.moveSpeed = 0;
    const victim = place(s, "skeleton", "enemy", 130, 100);
    victim.moveSpeed = 0;
    victim.damage = 0;
    victim.hp = victim.maxHp = wearer.damage * 4 + 5; // dies ~4th hit, burn active
    const bystander = makeDummy(place(s, "skeleton", "enemy", 170, 100)); // within 60px
    for (let i = 0; i < 600 && victim.state !== "dead"; i++) stepSimulation(s);
    expect(victim.state).toBe("dead");
    expect(100000 - bystander.hp).toBeGreaterThanOrEqual(20); // nova damage (+ possible splash)
    expect(hasEffect(bystander, "burn")).toBe(true);
  });
});

describe("items — casts (Chrono Amulet)", () => {
  function knightScenario(seed: number, loadout?: ItemLoadout, graceTicks = 0) {
    const s = battleState(seed);
    s.castGraceTicks = graceTicks;
    const knight = place(
      s,
      "knight",
      "player",
      100,
      100,
      1,
      loadout ? carry("knight", loadout) : undefined
    );
    knight.moveSpeed = 0;
    makeDummy(place(s, "skeleton", "enemy", 130, 100));
    return { s, knight };
  }

  it("cooldown reduction: the set cooldown shrinks by the item multiplier", () => {
    const base = abilityCooldownTicks("taunt_roar");
    const a = knightScenario(14);
    const b = knightScenario(14, { trinket: "chrono_amulet:legendary:1" });
    for (let i = 0; i < 100; i++) {
      stepSimulation(a.s);
      stepSimulation(b.s);
      if (a.knight.abilityCooldown > 0 || b.knight.abilityCooldown > 0) break;
    }
    // Both fired on the same tick (identical scenario pre-cast), so the gap is
    // exactly the CDR (legendary 1★ = 20%).
    expect(a.knight.abilityCooldown - b.knight.abilityCooldown).toBe(
      base - Math.round(base * 0.8)
    );
  });

  it("legendary 'starts ready': ignores the opening cast grace", () => {
    const grace = 400;
    const bare = knightScenario(15, undefined, grace);
    const chrono = knightScenario(
      15,
      { trinket: "chrono_amulet:legendary:1" },
      grace
    );
    for (let i = 0; i < 100; i++) {
      stepSimulation(bare.s);
      stepSimulation(chrono.s);
    }
    expect(chrono.knight.abilityCooldown).toBeGreaterThan(0); // cast during grace
    expect(bare.knight.abilityCooldown).toBe(0); // still held
  });
});

describe("items — summons & self-respawn", () => {
  it("gear does NOT transfer to summons; Summoner's Sigil stats DO", () => {
    // Hunter auto-summons its boar via onTick — the cleanest summon driver.
    const boarOf = (loadout?: ItemLoadout) => {
      const s = battleState(16);
      place(
        s,
        "hunter",
        "player",
        100,
        200,
        1,
        loadout ? carry("hunter", loadout) : undefined
      );
      makeDummy(place(s, "skeleton", "enemy", 400, 600));
      for (let i = 0; i < 100; i++) {
        stepSimulation(s);
        const boar = s.units.find((u) => u.defId === "boar");
        if (boar) return boar;
      }
      throw new Error("no boar spawned");
    };
    const bare = boarOf();
    const withWeapon = boarOf({ weapon: "soldiers_blade:legendary:3" });
    const withSigil = boarOf({ trinket: "summoners_sigil:rare:1" });
    // A weapon on the hunter leaves the boar untouched (carried inert)…
    expect(withWeapon.damage).toBe(bare.damage);
    expect(withWeapon.maxHp).toBe(bare.maxHp);
    expect(withWeapon.itemMods).toBeUndefined();
    expect(withWeapon.latentItems?.owner).toBe("hunter");
    // …while the Sigil grants flat +10% stats.
    expect(withSigil.maxHp).toBe(Math.round(bare.maxHp * 1.1));
    expect(withSigil.damage).toBe(Math.round(bare.damage * 1.1));
  });

  it("Slime Knight rebirth keeps its gear through the blob hop", () => {
    const s = battleState(17);
    const items = carry("slime_knight", { weapon: "bloodletter_axe:legendary:3" });
    const knight = place(s, "slime_knight", "enemy", 240, 300, 1, items);
    knight.moveSpeed = 0;
    const bakedDamage = knight.damage;
    expect(bakedDamage).toBe(
      Math.round(getUnitDef("slime_knight").damage * 1.4)
    );
    // One-shot killer in melee reach (the slimeKnight.test.ts driver).
    const killer = place(s, "skeleton", "player", 240, 348);
    killer.damage = 9999;
    killer.hp = killer.maxHp = 1_000_000;
    killer.moveSpeed = 0;
    for (let i = 0; i < 60 && knight.state !== "dead"; i++) stepSimulation(s);
    expect(knight.state).toBe("dead");
    killer.damage = 0; // let the blobs ooze home
    // The blobs carry the knight's gear INERT.
    const blob = s.units.find((u) => u.defId === "slime_squire");
    expect(blob?.latentItems?.owner).toBe("slime_knight");
    expect(blob?.itemMods).toBeUndefined();
    let reborn: Unit | undefined;
    for (let i = 0; i < 300 && !reborn; i++) {
      stepSimulation(s);
      reborn = s.units.find(
        (u) => u.defId === "slime_knight" && u.uid !== knight.uid
      );
    }
    expect(reborn).toBeDefined();
    expect(reborn!.itemMods).toBeDefined(); // gear reactivated
    expect(reborn!.damage).toBe(bakedDamage); // same bake as the original
  });
});

describe("items — arena mirror", () => {
  it("the AI deck fights with a flat bump derived from the player's gear", () => {
    const deploy = (loadouts?: ItemLoadouts) => {
      const mc = new MatchController(21, P_DECK, E_DECK, {
        mode: "arena",
        itemLoadouts: loadouts,
      });
      return mc.deploy("enemy", "warrior", { x: 240, y: 150 })!;
    };
    const bare = deploy();
    const mirrored = deploy(FULL_LOADOUTS);
    expect(mirrored.maxHp).toBeGreaterThan(bare.maxHp);
    expect(mirrored.damage).toBeGreaterThan(bare.damage);
    expect(mirrored.itemMods).toBeDefined();
    // Deterministic: the same loadouts produce the same bump.
    expect(deploy(FULL_LOADOUTS).maxHp).toBe(mirrored.maxHp);
  });
});

describe("items — sub-stats (weapons & armors)", () => {
  // Every weapon/armor line's fixed secondary (the SUB table): the rare 1★
  // pin, and at legendary BOTH the grown sub and the signature must show.
  const PINS: Record<string, { rare1: string; leg1: string; leg1Sig: string }> = {
    soldiers_blade: {
      rare1: "+3% health",
      leg1: "+10% health",
      leg1Sig: "below 25% HP",
    },
    bloodletter_axe: {
      rare1: "+5% damage vs enemies below 25% HP",
      leg1: "+15% damage vs enemies below 25% HP",
      leg1Sig: "Heals 10% of attack damage dealt",
    },
    stormpiercer: {
      rare1: "+4% damage vs larger foes",
      leg1: "+12% damage vs larger foes",
      leg1Sig: "chains to a second enemy",
    },
    hexblade: {
      rare1: "Takes 4% less magic damage",
      leg1: "Takes 12% less magic damage",
      leg1Sig: "silence",
    },
    twinfang_daggers: {
      rare1: "+3% attack speed",
      leg1: "+8% attack speed",
      leg1Sig: "strikes twice",
    },
    windlash_saber: {
      rare1: "+2% move speed",
      leg1: "+6% move speed",
      leg1Sig: "max 5 stacks",
    },
    gravewhisper_blade: {
      rare1: "Heals 2% of attack damage dealt",
      leg1: "Heals 8% of attack damage dealt",
      leg1Sig: "Kills heal the wearer 15 HP",
    },
    forgemasters_hammer: {
      rare1: "Takes 1% less damage",
      leg1: "Takes 5% less damage",
      leg1Sig: "Every 5th attack crits",
    },
    guildmasters_dirk: {
      rare1: "Kills heal the wearer 4 HP",
      leg1: "Kills heal the wearer 12 HP",
      leg1Sig: "Kills grant +30% speed",
    },
    squires_plate: {
      rare1: "+2% damage",
      leg1: "+9% damage",
      leg1Sig: "Reflects 10% of damage taken",
    },
    bulwark_shield: {
      rare1: "Takes 3% less magic damage",
      leg1: "Takes 10% less magic damage",
      leg1Sig: "Takes 5% less damage",
    },
    wanderers_cloak: {
      rare1: "Every 10th attack crits",
      leg1: "Every 8th attack crits",
      leg1Sig: "+8% move speed",
    },
    golem_core: {
      rare1: "Summons spawn with +5% stats",
      leg1: "Summons spawn with +18% stats",
      leg1Sig: "Starts battle with a shield",
    },
    phasecloak: {
      rare1: "Ability cooldown reduced 3%",
      leg1: "Ability cooldown reduced 10%",
      leg1Sig: "stealth",
    },
  };

  it("every line carries its sub at rare 1★ and keeps it, plus the signature, at legendary", () => {
    for (const [lineId, pin] of Object.entries(PINS)) {
      const rare = describeItemKey(makeItemKey(lineId, "rare", 1)).join(" · ");
      const leg = describeItemKey(makeItemKey(lineId, "legendary", 1)).join(" · ");
      expect(rare, lineId).toContain(pin.rare1);
      expect(leg, lineId).toContain(pin.leg1);
      expect(leg, lineId).toContain(pin.leg1Sig);
    }
  });

  it("no two same-slot lines read identically at rare 1★, and none is a bare primary", () => {
    for (const slot of ["weapon", "armor"] as const) {
      const texts = Object.values(ITEM_LINES)
        .filter((l) => l.slot === slot)
        .map((l) => describeItemKey(makeItemKey(l.id, "rare", 1)).join(" · "));
      expect(new Set(texts).size).toBe(texts.length);
      for (const t of texts) expect(t).toContain(" · "); // ≥ 2 effect lines
    }
  });

  it("each sub only grows along the 9-step merge path (rare 1★ → legendary 3★)", () => {
    const GOODNESS: Record<string, (m: ItemMods) => number> = {
      soldiers_blade: (m) => m.hpMult,
      bloodletter_axe: (m) => m.executeBonus,
      stormpiercer: (m) => m.giantSlayerPct,
      hexblade: (m) => 1 - m.magicTakenMult,
      twinfang_daggers: (m) => 1 / m.atkDelayMult,
      windlash_saber: (m) => m.moveSpeedMult,
      gravewhisper_blade: (m) => m.lifesteal,
      forgemasters_hammer: (m) => 1 - m.damageTakenMult,
      guildmasters_dirk: (m) => m.killHeal,
      squires_plate: (m) => m.dmgMult,
      bulwark_shield: (m) => 1 - m.magicTakenMult,
      wanderers_cloak: (m) => -m.critEveryNth,
      golem_core: (m) => m.summonStatPct,
      phasecloak: (m) => 1 - m.cooldownMult,
    };
    for (const [lineId, goodness] of Object.entries(GOODNESS)) {
      let key: string | null = makeItemKey(lineId, "rare", 1);
      let prev = -Infinity;
      let steps = 0;
      while (key) {
        const g = goodness(resolveItemMods(key));
        expect(g, key).toBeGreaterThanOrEqual(prev);
        prev = g;
        key = nextItemKey(key);
        steps++;
      }
      expect(steps).toBe(9);
    }
  });

  it("sub-stat folds: crit min-rule and multiplicative magic resist", () => {
    const hammerAndCloak = resolveLoadoutMods({
      weapon: "forgemasters_hammer:legendary:1",
      armor: "wanderers_cloak:rare:1",
    })!;
    expect(hammerAndCloak.critEveryNth).toBe(5); // the more frequent source wins
    expect(resolveItemMods("wanderers_cloak:rare:1").critEveryNth).toBe(10);
    const antiMage = resolveLoadoutMods({
      weapon: "hexblade:rare:1",
      armor: "bulwark_shield:rare:1",
    })!;
    expect(antiMage.magicTakenMult).toBeCloseTo(0.96 * 0.97, 12);
  });

  it("Wanderer's crit cadence fires from the armor slot: the 10th swing crits", () => {
    const s = battleState(31);
    const wearer = place(s, "skeleton", "player", 100, 100, 1, carry("skeleton", {
      armor: "wanderers_cloak:rare:1",
    }));
    wearer.moveSpeed = 0;
    const dummy = makeDummy(place(s, "skeleton", "enemy", 130, 100));
    for (let i = 0; i < 600 && wearer.attackCount < 10; i++) stepSimulation(s);
    expect(wearer.attackCount).toBe(10);
    expect(100000 - dummy.hp).toBe(11 * wearer.damage); // 9 swings + a double
  });
});
