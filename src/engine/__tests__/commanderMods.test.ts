// Commander engine specs — the MatchOptions.commanderMods match input:
// identity/absence keeps sims byte-identical, the teamMods fold lands on the
// player side (with the arena stat mirror), deploy shields apply to deck
// deploys, and the input is recorded in the replay. The new TeamMods reads
// (magicDmgMult / abilityCooldownMult / summonStatPct / abilitiesStartReady)
// are exercised through hand-built states.
import { describe, expect, it } from "vitest";
import {
  BLOODLUST_ATK_FRAC,
  BLOODLUST_LIFESTEAL,
  resolveCommanderMods,
} from "@/meta/commander";
import { MatchController } from "@/engine/MatchController";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, digest, makeDummy, place, runMatch } from "./helpers";

const DECK = ["knight", "archer", "warrior", "mage"];

/** A full stat-talent allocation for match-level tests. */
const STAT_ALLOC = {
  sharpened_steel: 3, // +6% dmg
  tempered_plate: 3, // −6% taken
};

describe("commanderMods — the match input", () => {
  it("absent and null are byte-identical to a pre-feature sim", () => {
    const a = runMatch(42, DECK, DECK);
    const b = runMatch(42, DECK, DECK, { commanderMods: null });
    expect(digest(b.state)).toBe(digest(a.state));
  });

  it("same mods + same seed reproduce byte-identically (determinism holds)", () => {
    const mods = resolveCommanderMods(STAT_ALLOC);
    const a = runMatch(42, DECK, DECK, { commanderMods: mods });
    const b = runMatch(42, DECK, DECK, { commanderMods: mods });
    expect(digest(b.state)).toBe(digest(a.state));
  });

  it("folds onto teamMods.player and stat-mirrors onto the arena enemy", () => {
    const mods = resolveCommanderMods({
      ...STAT_ALLOC,
      victory_feast: 2,
      bloodlust: 1,
    });
    const mc = new MatchController(1, DECK, DECK, { commanderMods: mods });
    const t = mc.state.teamMods.player;
    expect(t.dmgMult).toBeCloseTo(1.06);
    expect(t.damageTakenMult).toBeCloseTo(0.94);
    expect(t.killHeal).toBe(12);
    expect(t.atkDelayMult).toBeCloseTo(1 - BLOODLUST_ATK_FRAC);
    expect(t.lifestealBonus).toBeCloseTo(BLOODLUST_LIFESTEAL);
    // Arena mirror: flat stats only (Bloodlust's speed components ride it —
    // that's what keeps the fair fight fair), never procs/lifesteal.
    const e = mc.state.teamMods.enemy;
    expect(e.dmgMult).toBeCloseTo(1.06);
    expect(e.damageTakenMult).toBeCloseTo(0.94);
    expect(e.atkDelayMult).toBeCloseTo(1 - BLOODLUST_ATK_FRAC);
    expect(e.killHeal).toBe(0);
    expect(e.lifestealBonus).toBe(0);
  });

  it("PvE modes install player mods but never mirror to the horde", () => {
    const mods = resolveCommanderMods(STAT_ALLOC);
    const mc = new MatchController(1, DECK, ["skeleton"], {
      mode: "depths",
      floor: 1,
      commanderMods: mods,
    });
    expect(mc.state.teamMods.player.dmgMult).toBeCloseTo(1.06);
    expect(mc.state.teamMods.enemy.dmgMult).toBe(1);
  });

  it("Bulwark Training: deck deploys arrive with the absorb shield", () => {
    const mods = resolveCommanderMods({
      tempered_plate: 2,
      bulwark_training: 2, // 10% of max HP
    });
    const mc = new MatchController(1, DECK, DECK, { commanderMods: mods });
    const u = mc.deploy("player", "knight", { x: 100, y: 500 })!;
    expect(u.shieldHp).toBe(Math.round(u.maxHp * 0.1));
    // The enemy side never got the talent — bare deploys.
    const foe = mc.deploy("enemy", "knight", { x: 100, y: 100 })!;
    expect(foe.shieldHp).toBe(0);
  });

  it("is recorded in the replay exactly when present", () => {
    const mods = resolveCommanderMods(STAT_ALLOC)!;
    const withMods = new MatchController(1, DECK, DECK, { commanderMods: mods });
    expect(withMods.getReplay().commanderMods).toEqual(mods);
    const bare = new MatchController(1, DECK, DECK);
    expect(bare.getReplay().commanderMods).toBeUndefined();
  });
});

describe("commander TeamMods reads (hand-built states)", () => {
  // One attacker vs one skeleton dummy (a SUMMONED defId, so the mage never
  // burns ticks winding up Polymorph — pure basic attacks), total damage read
  // off the dummy. Isolated pairs keep attribution unambiguous.
  const soloDamage = (defId: string, magicMult: number) => {
    const s = battleState(7);
    s.teamMods.player.magicDmgMult = magicMult;
    s.castGraceTicks = 0;
    place(s, defId, "player", 100, 100);
    const dummy = makeDummy(place(s, "skeleton", "enemy", 140, 100));
    for (let i = 0; i < 100; i++) stepSimulation(s);
    return 100000 - dummy.hp;
  };

  it("magicDmgMult scales a magic-school source but not a physical one", () => {
    const baseMage = soloDamage("mage", 1);
    expect(baseMage).toBeGreaterThan(0);
    // ×1.5 exaggerated for a clean read; per-hit rounding allows slack.
    expect(soloDamage("mage", 1.5)).toBeGreaterThan(baseMage * 1.3);
    const baseWarrior = soloDamage("warrior", 1);
    expect(baseWarrior).toBeGreaterThan(0);
    expect(soloDamage("warrior", 1.5)).toBe(baseWarrior);
  });

  // The mage's Polymorph needs a legal (non-summoned) sheep target to begin
  // its cast — a knight dummy qualifies. No damage assertions, so its shield
  // doesn't matter.
  it("abilityCooldownMult shortens the cooldown stamped on cast", () => {
    const run = (mult: number) => {
      const s = battleState(9);
      s.teamMods.player.abilityCooldownMult = mult;
      s.castGraceTicks = 0;
      const mage = place(s, "mage", "player", 100, 100);
      makeDummy(place(s, "knight", "enemy", 200, 100));
      // Step until the mage has begun (and locked in) a cast.
      let guard = 0;
      while (mage.abilityCooldown <= 0 && guard++ < 200) stepSimulation(s);
      return mage.abilityCooldown;
    };
    const base = run(1);
    const reduced = run(0.91); // Keen Focus ×3
    expect(base).toBeGreaterThan(0);
    expect(reduced).toBe(Math.round(base * 0.91));
  });

  it("castTimeMult shortens the cast bar a spell winds up with", () => {
    const castBar = (mult: number) => {
      const s = battleState(13);
      s.teamMods.player.castTimeMult = mult;
      s.castGraceTicks = 0;
      const mage = place(s, "mage", "player", 100, 100);
      makeDummy(place(s, "knight", "enemy", 200, 100));
      let guard = 0;
      while (mage.castTicksMax <= 0 && guard++ < 200) stepSimulation(s);
      return mage.castTicksMax;
    };
    const base = castBar(1);
    expect(base).toBeGreaterThan(1);
    expect(castBar(0.8)).toBe(Math.max(1, Math.round(base * 0.8)));
  });

  it("abilitiesStartReady bypasses the opening cast grace", () => {
    const run = (ready: boolean) => {
      const s = battleState(11);
      s.castGraceTicks = 100;
      s.teamMods.player.abilitiesStartReady = ready;
      const mage = place(s, "mage", "player", 100, 100);
      makeDummy(place(s, "knight", "enemy", 200, 100));
      for (let i = 0; i < 30; i++) stepSimulation(s);
      return mage.castTicks > 0 || mage.abilityCooldown > 0;
    };
    expect(run(false)).toBe(false); // grace holds the cast
    expect(run(true)).toBe(true); // Chronomancer lets it fly
  });
});
