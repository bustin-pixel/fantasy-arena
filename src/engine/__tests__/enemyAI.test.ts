// ============================================================================
// Enemy tactical AI specs — the enemy's matchup opinions and threat
// positioning, which were previously unreachable: they lived inside
// MatchController's private methods and were only ever exercised incidentally
// by whole-match runs. Now they're seeded RNG in, decision out.
// ============================================================================

import { describe, expect, it } from "vitest";
import { chooseEnemyCard, pickEnemyPos, planEnemyDeploy } from "@/engine/EnemyAI";
import { getUnitDef } from "@/data/units";
import { ENEMY_ZONE, FIELD_WIDTH } from "@/utils/constants";
import { RNG } from "@/utils/rng";
import { battleState, place } from "./helpers";

const rng = () => new RNG(1234);

/** A live player board built from defIds. */
function playerBoard(defIds: string[]) {
  const s = battleState(1);
  return defIds.map((id, i) => place(s, id, "player", 100 + i * 40, 600));
}

describe("chooseEnemyCard — matchup opinions", () => {
  it("an empty hand yields nothing; a single card needs no thought", () => {
    expect(chooseEnemyCard([], playerBoard(["knight"]), rng())).toBeNull();
    expect(chooseEnemyCard(["mage"], playerBoard(["knight"]), rng())).toBe("mage");
  });

  it("an empty player board falls back to the first card in hand", () => {
    expect(chooseEnemyCard(["healer", "mage"], [], rng())).toBe("healer");
  });

  it("dives a ranged player board with a melee/assassin rather than a caster", () => {
    // archer + mage = ranged, no tank → melee/assassin scores +3, ranged 0.
    const board = playerBoard(["archer", "mage"]);
    expect(chooseEnemyCard(["mage", "assassin"], board, rng())).toBe("assassin");
    expect(chooseEnemyCard(["mage", "warrior"], board, rng())).toBe("warrior");
  });

  it("answers a heavy tank with ranged DPS rather than more melee", () => {
    // The Ogre is the tank (hp >= 200) and is melee, so nothing scores the
    // dive bonus — ranged takes the +2.
    const board = playerBoard(["ogre"]);
    expect(getUnitDef("ogre").hp).toBeGreaterThanOrEqual(200);
    expect(chooseEnemyCard(["warrior", "archer"], board, rng())).toBe("archer");
  });

  it("never leads with the healer when anything else is on offer", () => {
    const board = playerBoard(["knight"]);
    expect(chooseEnemyCard(["healer", "warrior"], board, rng())).toBe("warrior");
  });

  it("is deterministic — the same seed picks the same card through tie-breaks", () => {
    const board = playerBoard(["knight"]);
    // An all-equal hand forces the rng tie-break path on every candidate.
    const hand = ["warrior", "knight", "berserker"];
    const a = chooseEnemyCard(hand, board, new RNG(77));
    const b = chooseEnemyCard(hand, board, new RNG(77));
    expect(a).toBe(b);
  });
});

describe("pickEnemyPos — threat positioning", () => {
  const inZone = (y: number) =>
    y >= ENEMY_ZONE.top && y <= ENEMY_ZONE.bottom;

  it("every role lands inside the enemy zone and on the field", () => {
    for (const id of ["archer", "healer", "assassin", "warrior", "ogre"]) {
      const pos = pickEnemyPos(getUnitDef(id), playerBoard(["knight"]), rng());
      expect(inZone(pos.y), `${id} y=${pos.y}`).toBe(true);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(FIELD_WIDTH);
    }
  });

  it("ranged and support hang back; melee pushes forward", () => {
    const board = playerBoard(["knight"]);
    const back = ENEMY_ZONE.top + (ENEMY_ZONE.bottom - ENEMY_ZONE.top) * 0.35;
    // Ranged/support draw y from the back 35% of the zone.
    expect(pickEnemyPos(getUnitDef("archer"), board, rng()).y).toBeLessThanOrEqual(back);
    expect(pickEnemyPos(getUnitDef("healer"), board, rng()).y).toBeLessThanOrEqual(back);
    // Melee draws from the forward half — strictly deeper than the back band.
    expect(pickEnemyPos(getUnitDef("warrior"), board, rng()).y).toBeGreaterThan(back);
  });

  it("an empty player board still produces a legal position", () => {
    for (const id of ["archer", "assassin", "warrior"]) {
      const pos = pickEnemyPos(getUnitDef(id), [], rng());
      expect(inZone(pos.y)).toBe(true);
      expect(pos.x).toBeGreaterThanOrEqual(60);
      expect(pos.x).toBeLessThanOrEqual(FIELD_WIDTH - 60);
    }
  });
});

describe("planEnemyDeploy — one decision per window", () => {
  it("a spent hand plans nothing", () => {
    expect(planEnemyDeploy([], playerBoard(["knight"]), rng())).toBeNull();
  });

  it("returns the chosen card with a legal position", () => {
    const plan = planEnemyDeploy(["archer", "warrior"], playerBoard(["ogre"]), rng());
    expect(plan).not.toBeNull();
    expect(["archer", "warrior"]).toContain(plan!.card);
    expect(plan!.pos.y).toBeGreaterThanOrEqual(ENEMY_ZONE.top);
    expect(plan!.pos.y).toBeLessThanOrEqual(ENEMY_ZONE.bottom);
  });

  it("same seed + same board → the same plan (replays depend on this)", () => {
    const hand = ["archer", "warrior", "healer"];
    const board = playerBoard(["knight", "mage"]);
    const a = planEnemyDeploy(hand, board, new RNG(9));
    const b = planEnemyDeploy(hand, board, new RNG(9));
    expect(a).toEqual(b);
  });
});
