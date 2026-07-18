// Commander spell specs — the castable is a LOGGED PLAYER INPUT: one charge
// per battle, queued via MatchController.castCommanderSpell and consumed at
// the top of the next tick (SimState.pendingCommanderSpell), so wall-clock
// tap timing can never shift the sim. Effects: Rally (team haste + a timed
// player-side damage surge), Bulwark (team absorb shields), Arcane Storm
// (flat damage to every enemy through the HP funnel).
import { describe, expect, it } from "vitest";
import {
  ARCANE_STORM_DAMAGE,
  BULWARK_SHIELD_FRAC,
  RALLY_SEC,
} from "@/meta/commander";
import { MatchController } from "@/engine/MatchController";
import { stepSimulation } from "@/engine/CombatSystem";
import { secToTicks } from "@/utils/constants";
import { battleState, digest, makeDummy, place, runMatch } from "./helpers";

const DECK = ["knight", "archer", "warrior", "mage"];

describe("castCommanderSpell — the input", () => {
  it("no equipped spell: status null, casts refused", () => {
    const mc = new MatchController(1, DECK, DECK);
    expect(mc.commanderSpellStatus()).toBeNull();
    expect(mc.castCommanderSpell()).toBe(false);
  });

  it("refused before battle, accepted once mid-battle, then spent", () => {
    const mc = new MatchController(1, DECK, DECK, { commanderSpell: "bulwark" });
    expect(mc.commanderSpellStatus()).toEqual({ spell: "bulwark", ready: false });
    expect(mc.castCommanderSpell()).toBe(false); // deployment phase
    mc.state.phase = "battle";
    expect(mc.castCommanderSpell()).toBe(true);
    expect(mc.commanderSpellStatus()).toEqual({ spell: "bulwark", ready: false });
    expect(mc.castCommanderSpell()).toBe(false); // one charge per battle
  });

  it("a cast is recorded in the replay with its tick", () => {
    const mc = new MatchController(1, DECK, DECK, { commanderSpell: "rally" });
    mc.state.phase = "battle";
    mc.state.tick = 77;
    mc.castCommanderSpell();
    expect(mc.getReplay().commanderCasts).toEqual([{ tick: 77, spell: "rally" }]);
    const bare = new MatchController(1, DECK, DECK);
    expect(bare.getReplay().commanderCasts).toBeUndefined();
  });

  it("an equipped-but-uncast spell leaves the match byte-identical", () => {
    const a = runMatch(42, DECK, DECK);
    const b = runMatch(42, DECK, DECK, { commanderSpell: "rally" });
    expect(digest(b.state)).toBe(digest(a.state));
  });
});

describe("spell effects (hand-built states)", () => {
  it("Bulwark shields every living player unit for 25% max HP", () => {
    const s = battleState(5);
    const knight = place(s, "knight", "player", 100, 100);
    const archer = place(s, "archer", "player", 100, 160);
    place(s, "skeleton", "enemy", 400, 100);
    const priorK = knight.shieldHp;
    s.pendingCommanderSpell = "bulwark";
    stepSimulation(s);
    expect(knight.shieldHp).toBe(
      priorK + Math.round(knight.maxHp * BULWARK_SHIELD_FRAC)
    );
    expect(archer.shieldHp).toBe(
      Math.round(archer.maxHp * BULWARK_SHIELD_FRAC)
    );
    expect(s.pendingCommanderSpell).toBeNull(); // consumed
  });

  it("Arcane Storm hits every living enemy through the HP funnel", () => {
    const s = battleState(5);
    place(s, "knight", "player", 100, 100);
    const a = makeDummy(place(s, "skeleton", "enemy", 380, 100));
    const b = makeDummy(place(s, "skeleton", "enemy", 380, 200));
    s.pendingCommanderSpell = "arcane_storm";
    stepSimulation(s);
    expect(100000 - a.hp).toBe(ARCANE_STORM_DAMAGE);
    expect(100000 - b.hp).toBe(ARCANE_STORM_DAMAGE);
  });

  it("Rally hastes the team and opens the player-only damage surge window", () => {
    const dmgAfterRally = (rally: boolean) => {
      const s = battleState(5);
      s.castGraceTicks = 999; // basics only — no ability noise
      place(s, "warrior", "player", 100, 100);
      const dummy = makeDummy(place(s, "skeleton", "enemy", 130, 100));
      if (rally) s.pendingCommanderSpell = "rally";
      for (let i = 0; i < secToTicks(RALLY_SEC) - 2; i++) stepSimulation(s);
      return 100000 - dummy.hp;
    };
    const base = dmgAfterRally(false);
    const surged = dmgAfterRally(true);
    expect(base).toBeGreaterThan(0);
    // +25% surge (per-hit rounding gives slack).
    expect(surged).toBeGreaterThan(base * 1.15);

    // The haste status landed on the player unit.
    const s = battleState(5);
    const warrior = place(s, "warrior", "player", 100, 100);
    makeDummy(place(s, "skeleton", "enemy", 400, 100));
    s.pendingCommanderSpell = "rally";
    stepSimulation(s);
    expect(warrior.effects.some((e) => e.type === "haste")).toBe(true);
    expect(s.commanderSurgeTicks).toBeGreaterThan(0);
  });

  it("a cast at the same tick reproduces byte-identically", () => {
    const run = () => {
      const mc = new MatchController(9, DECK, DECK, {
        commanderSpell: "arcane_storm",
      });
      let cast = false;
      let guard = 0;
      while (
        mc.phase !== "victory" &&
        mc.phase !== "defeat" &&
        mc.phase !== "draw" &&
        guard < 3400
      ) {
        if (!cast && mc.phase === "battle" && mc.state.tick >= 40) {
          cast = mc.castCommanderSpell();
        }
        mc.tick();
        guard++;
      }
      return mc;
    };
    const a = run();
    const b = run();
    expect(a.getReplay().commanderCasts).toEqual(b.getReplay().commanderCasts);
    expect(digest(b.state)).toBe(digest(a.state));
  });
});
