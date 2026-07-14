// Seraph — the legendary raid healer with three layered supports on two cast
// slots: Divine Light (a 1.5s cast that pours 100 HP into EVERY teammate and
// then lays a renewing HoT on each), Sanctuary (an instant team-wide +55 absorb
// bubble, capped 150/ally) and Resurrection (a 1s cast, once per battle, that
// revives a fallen allied HERO — deckable units only — at half HP). Tests
// isolate mechanics by parking the others on long cooldowns; every scenario
// needs a live enemy so the Seraph doesn't idle out before its act slot.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

// Turn a placed unit into a corpse (the state a rez target is found in).
function kill(u: Unit): void {
  u.hp = 0;
  u.state = "dead";
  u.animState = "dead";
}

describe("Seraph — Divine Light (team-wide cast heal + renewing glow)", () => {
  it("pours 100 HP into every teammate and lays the renewing HoT on each", () => {
    const s = battleState(1);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999; // isolate the cast heal from Sanctuary
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560)); // wounded
    ally.maxHp = 200;
    ally.hp = 50;
    const ally2 = makeDummy(place(s, "skeleton", "player", 340, 560)); // wounded too
    ally2.maxHp = 200;
    ally2.hp = 90;
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // gives the Seraph a target

    // 1.5s cast (30 ticks) + a begin tick; fires exactly once inside 34 ticks
    // (10s cooldown), and the first HoT pulse (1s later) hasn't landed yet.
    for (let i = 0; i < 34; i++) stepSimulation(s);

    expect(ally.hp).toBe(150); // 50 + 100, exactly — the whole team, not one pick
    expect(ally2.hp).toBe(190); // 90 + 100
    expect(ally.effects.some((e) => e.type === "regen")).toBe(true);
    expect(ally2.effects.some((e) => e.type === "regen")).toBe(true);
    expect(seraph.effects.some((e) => e.type === "regen")).toBe(true); // self too

    // The glow keeps healing afterwards.
    const hp = ally.hp;
    for (let i = 0; i < 25; i++) stepSimulation(s); // past one 1s HoT pulse
    expect(ally.hp).toBeGreaterThan(hp);
  });

  it("never over-heals past maxHp", () => {
    const s = battleState(2);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 240, 560));
    ally.maxHp = 100;
    ally.hp = 80; // only 20 missing
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 34; i++) stepSimulation(s);

    expect(ally.hp).toBe(100); // clamped, not 180
  });
});

describe("Seraph — Sanctuary (team-wide bubble)", () => {
  it("bubbles the whole team with a +55 absorb, self included", () => {
    const s = battleState(3);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.abilityCooldown = 9999; // block Divine Light
    // Full-HP ally so nobody is "wounded" — only Sanctuary should fire.
    const ally = makeDummy(place(s, "skeleton", "player", 340, 560));
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // target

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(ally.shieldHp).toBe(55);
    expect(seraph.shieldHp).toBe(55); // it shields itself too
  });

  it("stacks on an existing shield but caps at 150 per ally", () => {
    const s = battleState(4);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.abilityCooldown = 9999;
    const ally = makeDummy(place(s, "skeleton", "player", 340, 560));
    ally.shieldHp = 120; // pretend a Knight's Taunt already bubbled it
    ally.shieldHpMax = 120;
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(ally.shieldHp).toBe(150); // 120 + 55 clamped to the cap, not 175
  });
});

describe("Seraph — Resurrection (once-per-battle hero revive)", () => {
  it("revives a fallen hero at half HP after the 1s cast", () => {
    const s = battleState(5);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    const hero = place(s, "archer", "player", 300, 560); // a deckable hero
    kill(hero);
    makeDummy(place(s, "skeleton", "enemy", 240, 100)); // target

    // 1s cast (20 ticks) + a begin tick.
    for (let i = 0; i < 25; i++) stepSimulation(s);

    expect(hero.state).not.toBe("dead");
    expect(hero.hp).toBe(Math.max(1, Math.round(hero.maxHp * 0.5)));
    expect(seraph.resurrectionUsed).toBe(true);
  });

  it("only fires once per battle — a second death stays dead", () => {
    const s = battleState(6);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    const hero = place(s, "archer", "player", 300, 560);
    kill(hero);
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 25; i++) stepSimulation(s);
    expect(hero.state).not.toBe("dead"); // first rez landed

    kill(hero); // dies again
    for (let i = 0; i < 60; i++) stepSimulation(s);
    expect(hero.state).toBe("dead"); // no second miracle
  });

  it("ignores fallen summons — a rez brings back real bodies, not pets", () => {
    // (Monsters ARE revivable now — see bossRevamp.test's Fallen Seraph spec —
    // but summons like skeletons/wolves/turrets never are.)
    const s = battleState(7);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    const bones = place(s, "skeleton", "player", 300, 560); // a summon
    kill(bones);
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    for (let i = 0; i < 30; i++) stepSimulation(s);

    expect(bones.state).toBe("dead");
    expect(seraph.resurrectionUsed).toBe(false); // still holding the miracle
  });

  it("outranks Divine Light — the rez wind-up starts even with wounded allies", () => {
    const s = battleState(8);
    const seraph = place(s, "seraph", "player", 240, 600);
    seraph.sanctuaryCooldown = 9999;
    const wounded = makeDummy(place(s, "skeleton", "player", 200, 560));
    wounded.maxHp = 200;
    wounded.hp = 20; // badly hurt — Divine Light bait
    const hero = place(s, "archer", "player", 300, 560);
    kill(hero);
    makeDummy(place(s, "skeleton", "enemy", 240, 100));

    // Inside the first second only the 1s rez can complete (Divine Light needs
    // 1.5s and can't have started first if the rez outranks it).
    for (let i = 0; i < 25; i++) stepSimulation(s);

    expect(hero.state).not.toBe("dead");
  });
});
