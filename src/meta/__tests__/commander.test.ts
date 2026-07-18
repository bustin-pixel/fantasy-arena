// Commander meta specs — the XP curve, talent-point math, tier gates, the
// defensive allocation sanitizer, CommanderMods resolution (identity = null),
// and spell unlock/equip invariants. Headless, no DOM.

import { describe, expect, it } from "vitest";
import {
  addCommanderXp,
  BLOODLUST_ATK_FRAC,
  BLOODLUST_LIFESTEAL,
  BLOODLUST_MOVE_FRAC,
  BRANCH_IDS,
  BRANCHES,
  buyTalent,
  canBuyTalent,
  COMMANDER_LEVEL_CAP,
  COMMANDER_XP_CAP,
  commanderLevelFromXp,
  commanderXpForNext,
  pointsSpent,
  pointsSpentInBranch,
  resolveCommanderMods,
  sanitizeEquippedSpell,
  sanitizeTalentAllocation,
  SPELL_UNLOCK_POINTS,
  spellsUnlocked,
  TALENTS,
  TALENTS_BY_ID,
  talentPointsForLevel,
  TIER_GATES,
  totalCommanderXpForLevel,
  type TalentAllocation,
} from "@/meta/commander";

/** Spend points down a branch tier-by-tier until `target` points are in. */
function fillBranch(branch: string, target: number): TalentAllocation {
  let alloc: TalentAllocation = {};
  const nodes = TALENTS.filter((t) => t.branch === branch).sort(
    (a, b) => a.tier - b.tier
  );
  while (pointsSpent(alloc) < target) {
    const next = nodes.find((t) => canBuyTalent(alloc, t.id, 99));
    if (!next) throw new Error(`branch ${branch} exhausted at ${pointsSpent(alloc)}`);
    alloc = buyTalent(alloc, next.id);
  }
  return alloc;
}

describe("commander XP curve", () => {
  it("level 1 at zero XP; cap at COMMANDER_XP_CAP", () => {
    expect(commanderLevelFromXp(0)).toBe(1);
    expect(commanderLevelFromXp(COMMANDER_XP_CAP)).toBe(COMMANDER_LEVEL_CAP);
    expect(commanderLevelFromXp(COMMANDER_XP_CAP * 10)).toBe(COMMANDER_LEVEL_CAP);
  });

  it("waypoints match the documented curve (50·(L−1)·L)", () => {
    expect(totalCommanderXpForLevel(5)).toBe(1000);
    expect(totalCommanderXpForLevel(10)).toBe(4500);
    expect(totalCommanderXpForLevel(COMMANDER_LEVEL_CAP)).toBe(19000);
  });

  it("addCommanderXp clamps to the cap and floors at 0", () => {
    expect(addCommanderXp(COMMANDER_XP_CAP - 5, 50)).toBe(COMMANDER_XP_CAP);
    expect(addCommanderXp(-100, 10)).toBe(10);
  });

  it("xpForNext is null exactly at the cap", () => {
    expect(commanderXpForNext(COMMANDER_XP_CAP)).toBeNull();
    expect(commanderXpForNext(0)).toBe(totalCommanderXpForLevel(2));
  });

  it("talent points: 0 at level 1, cap−1 at the cap", () => {
    expect(talentPointsForLevel(1)).toBe(0);
    expect(talentPointsForLevel(COMMANDER_LEVEL_CAP)).toBe(
      COMMANDER_LEVEL_CAP - 1
    );
  });
});

describe("talent tree structure", () => {
  it("every branch has exactly one keystone, in the last tier", () => {
    for (const b of BRANCH_IDS) {
      const keystones = TALENTS.filter((t) => t.branch === b && t.keystone);
      expect(keystones).toHaveLength(1);
      expect(keystones[0].tier).toBe(TIER_GATES.length - 1);
    }
  });

  it("a maxed commander cannot buy the whole tree (routes are choices)", () => {
    const totalRanks = TALENTS.reduce((a, t) => a + t.maxRanks, 0);
    expect(totalRanks).toBeGreaterThan(
      talentPointsForLevel(COMMANDER_LEVEL_CAP)
    );
  });
});

describe("tier gates + buying", () => {
  it("tier-0 nodes buyable with a point; deeper tiers gated on branch spend", () => {
    expect(canBuyTalent({}, "sharpened_steel", 1)).toBe(true);
    expect(canBuyTalent({}, "forced_march", 5)).toBe(false); // tier 1 needs 2 in-branch
    expect(canBuyTalent({}, "bloodlust", 19)).toBe(false); // keystone needs 8
    const eight = fillBranch("warlord", 8);
    expect(canBuyTalent(eight, "bloodlust", 19)).toBe(true);
  });

  it("cross-branch points do not open another branch's gates", () => {
    const guardian = fillBranch("guardian", 5);
    expect(canBuyTalent(guardian, "executioners_eye", 19)).toBe(false);
  });

  it("respects maxRanks and the point budget", () => {
    let alloc: TalentAllocation = {};
    for (let i = 0; i < 3; i++) alloc = buyTalent(alloc, "sharpened_steel");
    expect(canBuyTalent(alloc, "sharpened_steel", 19)).toBe(false); // ranks
    expect(canBuyTalent(alloc, "drill_sergeant", 3)).toBe(false); // budget spent
    expect(canBuyTalent(alloc, "drill_sergeant", 4)).toBe(true);
  });
});

describe("sanitizeTalentAllocation", () => {
  it("drops junk and clamps ranks", () => {
    const out = sanitizeTalentAllocation(
      { sharpened_steel: 99, nonsense: 3, drill_sergeant: -2, victory_feast: NaN },
      19
    );
    expect(out.sharpened_steel).toBe(3);
    expect(out.nonsense).toBeUndefined();
    expect(out.drill_sergeant).toBeUndefined();
    expect(out.victory_feast).toBeUndefined();
  });

  it("replays gates: a deep node without its branch spend is dropped", () => {
    const out = sanitizeTalentAllocation({ bloodlust: 1 }, 19);
    expect(out.bloodlust).toBeUndefined();
  });

  it("caps the sum at totalPoints (XP rollback self-heals)", () => {
    const out = sanitizeTalentAllocation(
      { sharpened_steel: 3, drill_sergeant: 3 },
      4
    );
    expect(pointsSpent(out)).toBe(4);
  });

  it("a legitimately built allocation round-trips unchanged", () => {
    const alloc = fillBranch("warlord", 9); // includes the keystone gate met
    const out = sanitizeTalentAllocation(alloc, 19);
    expect(out).toEqual(alloc);
  });
});

describe("resolveCommanderMods", () => {
  it("empty allocation resolves to null (the byte-identical contract)", () => {
    expect(resolveCommanderMods({})).toBeNull();
    expect(resolveCommanderMods({ unknown_id: 2 })).toBeNull();
  });

  it("folds multiplicative and additive effects per rank", () => {
    const mods = resolveCommanderMods({
      sharpened_steel: 3,
      tempered_plate: 2,
      victory_feast: 2,
      keen_focus: 1,
    })!;
    expect(mods.dmgMult).toBeCloseTo(1.06);
    expect(mods.damageTakenMult).toBeCloseTo(0.96);
    expect(mods.killHeal).toBe(12);
    expect(mods.abilityCooldownMult).toBeCloseTo(0.97);
    // Untouched fields stay identity.
    expect(mods.moveSpeedMult).toBe(1);
    expect(mods.overheal).toBe(false);
  });

  it("keystones resolve (Bloodlust's composite lands every field)", () => {
    const mods = resolveCommanderMods({
      bloodlust: 1,
      undying_will: 1,
      chronomancer: 1,
    })!;
    expect(mods.atkDelayMult).toBeCloseTo(1 - BLOODLUST_ATK_FRAC);
    expect(mods.moveSpeedMult).toBeCloseTo(1 + BLOODLUST_MOVE_FRAC);
    expect(mods.lifestealBonus).toBeCloseTo(BLOODLUST_LIFESTEAL);
    expect(mods.rangedLifesteal).toBeCloseTo(BLOODLUST_LIFESTEAL);
    expect(mods.lastBreath).toBe(true);
    expect(mods.abilitiesStartReady).toBe(true);
  });

  it("Bloodlust stacks multiplicatively with Drill Sergeant", () => {
    const mods = resolveCommanderMods({ drill_sergeant: 3, bloodlust: 1 })!;
    expect(mods.atkDelayMult).toBeCloseTo(0.94 * (1 - BLOODLUST_ATK_FRAC));
  });
});

describe("spells", () => {
  it("a branch's spell unlocks at SPELL_UNLOCK_POINTS in that branch", () => {
    expect(spellsUnlocked({})).toEqual([]);
    const deep = fillBranch("guardian", SPELL_UNLOCK_POINTS);
    expect(spellsUnlocked(deep)).toEqual([BRANCHES.guardian.spell]);
  });

  it("sanitizeEquippedSpell clears a no-longer-unlocked pick", () => {
    const deep = fillBranch("warlord", SPELL_UNLOCK_POINTS);
    expect(sanitizeEquippedSpell("rally", deep)).toBe("rally");
    expect(sanitizeEquippedSpell("rally", {})).toBeNull();
    expect(sanitizeEquippedSpell("bulwark", deep)).toBeNull();
    expect(sanitizeEquippedSpell(42, deep)).toBeNull();
  });

  it("every talent id in the registry is consistent", () => {
    for (const t of TALENTS) expect(TALENTS_BY_ID[t.id]).toBe(t);
    // pointsSpentInBranch counts only its branch.
    const mixed = { sharpened_steel: 2, tempered_plate: 1 };
    expect(pointsSpentInBranch(mixed, "warlord")).toBe(2);
    expect(pointsSpentInBranch(mixed, "guardian")).toBe(1);
  });
});
