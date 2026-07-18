// ============================================================================
// Compendium slayer bonus — the teamMods.slayerVs table at the damage funnel.
// The contract: the multiplier applies to the player's damage vs EXACTLY the
// tabled defId, never to the enemy team, and an absent/empty table leaves the
// sim byte-identical to a pre-feature run (the identity invariant).
// ============================================================================

import { describe, expect, it } from "vitest";
import { stepSimulation, type SimState } from "@/engine/CombatSystem";
import { battleState, digest, makeDummy, place, runMatch } from "./helpers";
import type { Team, Unit } from "@/types";

/** Stationary attacker + adjacent stationary dummy on the opposing team. */
function duel(seed: number, attackerTeam: Team = "player") {
  const s = battleState(seed);
  const enemyTeam: Team = attackerTeam === "player" ? "enemy" : "player";
  const attacker = place(s, "skeleton", attackerTeam, 100, 100);
  attacker.moveSpeed = 0;
  const dummy = makeDummy(place(s, "skeleton", enemyTeam, 130, 100));
  return { s, attacker, dummy };
}

function stepUntilAttacks(s: SimState, attacker: Unit, n: number, cap = 400) {
  for (let i = 0; i < cap && attacker.attackCount < n; i++) stepSimulation(s);
}

describe("slayer bonus at the damage funnel", () => {
  it("multiplies player damage vs the tabled defId", () => {
    const { s, attacker, dummy } = duel(1);
    s.teamMods.player.slayerVs = { skeleton: 1.1 };
    stepUntilAttacks(s, attacker, 1);
    expect(100000 - dummy.hp).toBe(Math.round(attacker.damage * 1.1));
  });

  it("a different tabled defId is identity — the bonus targets one monster", () => {
    const { s, attacker, dummy } = duel(2);
    s.teamMods.player.slayerVs = { wolf: 1.1 };
    stepUntilAttacks(s, attacker, 1);
    expect(100000 - dummy.hp).toBe(Math.round(attacker.damage));
  });

  it("never boosts the enemy team (the table lives on player mods only)", () => {
    const { s, attacker, dummy } = duel(3, "enemy");
    s.teamMods.player.slayerVs = { skeleton: 1.1 };
    stepUntilAttacks(s, attacker, 1);
    expect(100000 - dummy.hp).toBe(Math.round(attacker.damage));
  });
});

describe("slayer bonus as a match input", () => {
  const player = ["arcane_mage", "knight", "archer", "ogre"];

  it("an empty table is byte-identical to no option at all (identity invariant)", () => {
    const opts = { mode: "depths" as const, floor: 1 };
    const bare = digest(runMatch(20260718, player, [], opts).state);
    const empty = digest(
      runMatch(20260718, player, [], { ...opts, slayerBonuses: {} }).state
    );
    expect(empty).toBe(bare);
  });

  it("same seed + same table => byte-identical end state across two runs", () => {
    const opts = {
      mode: "depths" as const,
      floor: 1,
      slayerBonuses: { giant_rat: 1.1, zombie_shambler: 1.04 },
    };
    const a = digest(runMatch(20260718, player, [], opts).state);
    const b = digest(runMatch(20260718, player, [], opts).state);
    expect(b).toBe(a);
  });

  it("a live table actually moves the sim (rats die faster)", () => {
    const opts = { mode: "depths" as const, floor: 1 };
    const bare = digest(runMatch(20260718, player, [], opts).state);
    const boosted = digest(
      runMatch(20260718, player, [], {
        ...opts,
        slayerBonuses: { giant_rat: 1.1 },
      }).state
    );
    expect(boosted).not.toBe(bare);
  });

  it("records the table in the replay", () => {
    const mc = runMatch(5, player, [], {
      mode: "depths",
      floor: 1,
      slayerBonuses: { giant_rat: 1.06 },
    });
    expect(mc.getReplay().slayerBonuses).toEqual({ giant_rat: 1.06 });
  });
});
