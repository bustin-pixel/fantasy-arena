// Slime Knight behavior (kits/slimeKnight.ts) — Divide & Reconvene:
//   1. On death it flings a shrinking squad of Slime Blobs (3 at stage 0), into open
//      field so a wall-hugging corpse can't clamp one straight onto the grave.
//   2. A blob that oozes back to the corpse reincarnates the knight at half HP,
//      one rebirth-stage higher, and dissolves the rest of the squad.
//   3. At the final stage (3) it's terminal — no blobs, stays dead.
//   4. Blobs ignore combat entirely (homeAnchor suppresses their targeting).
// Exercises the new seam: the spawnUnit `init` stamp, the homeAnchor movement +
// targeting suppression, and the onTick reincarnation.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
import { applyEffect, makeEffect } from "@/engine/StatusEffectSystem";
import { getUnitDef } from "@/data/units";
import { battleState, place, makeDummy } from "./helpers";
import type { Unit } from "@/types";

/** Place a stationary one-shot killer next to a corpse-point. Melee, huge HP, so
 *  it kills the knight but can't chase the blobs that scatter 110px away. */
function killerAt(s: ReturnType<typeof battleState>, x: number, y: number): Unit {
  const k = place(s, "skeleton", "player", x, y);
  k.damage = 9999;
  k.hp = k.maxHp = 1_000_000;
  k.moveSpeed = 0;
  return k;
}

describe("Slime Knight — Divide (flings blobs on death)", () => {
  it("flings 3 blobs into open field — even against a wall, never onto the corpse", () => {
    const s = battleState(1);
    // Knight jammed against the TOP wall — the failure case: an offset straight up
    // would clamp the blob back down onto the grave and instantly reincarnate. The
    // fling must reflect off the wall into open field instead.
    const knight = place(s, "slime_knight", "enemy", 240, 40);
    knight.moveSpeed = 0;
    killerAt(s, 240, 96); // in melee reach, just below the knight

    for (let i = 0; i < 60; i++) {
      stepSimulation(s);
      if (knight.state === "dead") break;
    }

    expect(knight.state).toBe("dead");
    const blobs = s.units.filter((u) => u.defId === "slime_squire");
    expect(blobs.length).toBe(3); // was 4
    expect(blobs.every((b) => b.state !== "dead")).toBe(true);
    expect(blobs.every((b) => b.rebornStage === 1)).toBe(true);
    expect(blobs.every((b) => b.homeAnchor != null)).toBe(true);
    // Every blob spawned well clear of the grave (no auto-reform) and on the field.
    for (const b of blobs) {
      expect(Math.hypot(b.pos.x - 240, b.pos.y - 40)).toBeGreaterThan(60);
      expect(b.pos.x).toBeGreaterThanOrEqual(32);
      expect(b.pos.x).toBeLessThanOrEqual(448);
      expect(b.pos.y).toBeGreaterThanOrEqual(32);
      expect(b.pos.y).toBeLessThanOrEqual(688);
    }
  });
});

describe("Slime Knight — Reconvene (reincarnates from a returning blob)", () => {
  it("reincarnates at half HP, stage +1, when a blob reaches the corpse", () => {
    const s = battleState(2);
    const knight = place(s, "slime_knight", "enemy", 240, 300);
    knight.moveSpeed = 0;
    const killer = killerAt(s, 240, 348); // kills the knight from the south

    // Kill the knight...
    for (let i = 0; i < 60; i++) {
      stepSimulation(s);
      if (knight.state === "dead") break;
    }
    expect(knight.state).toBe("dead");
    // ...then defang the interceptor so this isolates "a blob reaching home
    // reincarnates it" from the (separately-tuned) interception race. It stays alive
    // so the player isn't wiped, but can't kill the blobs oozing back.
    killer.damage = 0;

    let reborn: Unit | undefined;
    for (let i = 0; i < 300; i++) {
      stepSimulation(s);
      reborn = s.units.find(
        (u) => u.defId === "slime_knight" && u.uid !== knight.uid
      );
      if (reborn) break;
    }

    expect(reborn).toBeDefined();
    expect(reborn!.rebornStage).toBe(1);
    // Half HP (rounded), and a real, living unit.
    expect(reborn!.hp).toBe(Math.round(reborn!.maxHp * 0.5));
    expect(reborn!.state).not.toBe("dead");
    // The squad dissolved into the rebirth — no living blobs remain.
    const liveBlobs = s.units.filter(
      (u) => u.defId === "slime_squire" && u.state !== "dead"
    );
    expect(liveBlobs.length).toBe(0);
  });
});

describe("Slime Knight — decay is terminal", () => {
  it("a stage-3 knight flings no blobs and stays dead", () => {
    const s = battleState(3);
    const knight = place(s, "slime_knight", "enemy", 240, 300);
    knight.rebornStage = 3; // reborn the maximum number of times (3 → 2 → 1 → 0)
    knight.moveSpeed = 0;
    killerAt(s, 240, 348);

    for (let i = 0; i < 120; i++) stepSimulation(s);

    expect(knight.state).toBe("dead");
    expect(s.units.some((u) => u.defId === "slime_squire")).toBe(false);
    // No reincarnation: the only slime_knight is the original, and it's dead.
    const knights = s.units.filter((u) => u.defId === "slime_knight");
    expect(knights.length).toBe(1);
    expect(knights[0].state).toBe("dead");
  });
});

describe("Slime Blob — ignores combat, races home", () => {
  it("never targets or attacks an adjacent enemy; oozes toward its anchor", () => {
    const s = battleState(4);
    const blob = place(s, "slime_squire", "enemy", 240, 300);
    blob.homeAnchor = { x: 240, y: 120 }; // 180px north — well outside reform range
    const foe = makeDummy(place(s, "skeleton", "player", 240, 348));

    for (let i = 0; i < 5; i++) stepSimulation(s);

    expect(blob.targetUid).toBeNull(); // aggro suppressed
    expect(foe.hp).toBe(foe.maxHp); // never attacked
    expect(blob.pos.y).toBeLessThan(300); // moved toward home (north)
    expect(blob.state).not.toBe("dead");
  });
});

describe("Slime Knight — Caustic Aura (acid beat on nearby enemies)", () => {
  it("ticks a fraction of its damage to enemies in radius; none beyond it", () => {
    const s = battleState(11);
    const knight = place(s, "slime_knight", "player", 240, 300);
    knight.moveSpeed = 0;
    // Inside the aura (dist 88 ≤ 90) but outside melee reach (range 48 + the
    // two bodies' radius slop ≈ 76) — any HP the dummy loses is aura damage,
    // in whole per-beat multiples.
    const near = makeDummy(place(s, "skeleton", "enemy", 240, 388));
    // Well outside the aura (dist 180) — the control, must stay untouched.
    const far = makeDummy(place(s, "skeleton", "enemy", 240, 480));

    for (let i = 0; i < 45; i++) stepSimulation(s); // ≥ 2 one-second beats

    const perBeat = Math.max(1, Math.round(knight.damage * 0.3));
    const lost = near.maxHp - near.hp;
    expect(lost).toBeGreaterThanOrEqual(perBeat * 2);
    expect(lost % perBeat).toBe(0);
    expect(far.hp).toBe(far.maxHp);
  });

  it("goes silent while the knight is stunned", () => {
    const s = battleState(12);
    const knight = place(s, "slime_knight", "player", 240, 300);
    knight.moveSpeed = 0;
    applyEffect(knight, makeEffect("stun", { durationSec: 5, source: knight.uid }));
    const near = makeDummy(place(s, "skeleton", "enemy", 240, 388));

    for (let i = 0; i < 45; i++) stepSimulation(s);

    expect(near.hp).toBe(near.maxHp);
  });
});

describe("Slime Knight — Absorb Bones (slurps enemy skeletons dying in the aura)", () => {
  it("heals 12 when its own acid melts a skeleton", () => {
    const s = battleState(13);
    const knight = place(s, "slime_knight", "player", 240, 300);
    knight.moveSpeed = 0;
    knight.hp = knight.maxHp - 50;
    const skel = place(s, "skeleton", "enemy", 240, 360); // inside the aura
    skel.moveSpeed = 0;
    skel.hp = 1; // the first acid beat kills it

    let guard = 0;
    while (skel.state !== "dead" && guard < 60) {
      stepSimulation(s);
      guard++;
    }

    expect(skel.state).toBe("dead");
    expect(knight.hp).toBe(knight.maxHp - 50 + 12);
  });

  it("absorbs a skeleton an ALLY killed inside the aura (any killer counts)", () => {
    const s = battleState(14);
    const knight = place(s, "slime_knight", "player", 240, 300);
    knight.moveSpeed = 0;
    knight.hp = knight.maxHp - 50;
    // Tanky enough that the aura can't kill it before the archer's shot lands.
    const skel = place(s, "skeleton", "enemy", 240, 360);
    skel.moveSpeed = 0;
    skel.hp = skel.maxHp = 1000;
    const archer = place(s, "archer", "player", 240, 470); // in bow range of skel
    archer.moveSpeed = 0;
    archer.damage = 999; // one-shot

    let guard = 0;
    while (skel.state !== "dead" && guard < 120) {
      stepSimulation(s);
      guard++;
    }

    expect(skel.state).toBe("dead");
    expect(knight.hp).toBe(knight.maxHp - 50 + 12);
  });

  it("does NOT absorb non-skeleton undead (a ghoul melts unslurped)", () => {
    const s = battleState(15);
    const knight = place(s, "slime_knight", "player", 240, 300);
    knight.moveSpeed = 0;
    knight.hp = knight.maxHp - 50;
    const ghoul = place(s, "ghoul", "enemy", 240, 360);
    ghoul.moveSpeed = 0;
    ghoul.hp = 1;

    let guard = 0;
    while (ghoul.state !== "dead" && guard < 60) {
      stepSimulation(s);
      guard++;
    }

    expect(ghoul.state).toBe("dead");
    expect(knight.hp).toBe(knight.maxHp - 50); // no heal
  });
});

describe("creature tags (UnitDef.tags) — the undead roster", () => {
  it("skeletons carry both tags; the rest of the roster is undead only", () => {
    expect(getUnitDef("skeleton").tags).toEqual(["undead", "skeleton"]);
    expect(getUnitDef("skeleton_archer").tags).toEqual(["undead", "skeleton"]);
    for (const id of ["zombie_shambler", "ghoul", "bonecaller", "abomination", "lich"]) {
      expect(getUnitDef(id).tags).toContain("undead");
      expect(getUnitDef(id).tags).not.toContain("skeleton");
    }
  });
});

describe("Slime Knight — split survives a ranged killing blow (regression)", () => {
  it("still flings blobs and doesn't insta-end the match when a projectile lands the kill", () => {
    const s = battleState(7);
    // The knight is the ONLY enemy unit, finished off from range: its onDeath runs
    // during projectile resolution — AFTER the main summon flush — so the blobs must
    // be flushed again before the win/loss check, or the enemy is declared out first
    // and the match ends before the knight ever splits.
    const knight = place(s, "slime_knight", "enemy", 240, 300);
    knight.hp = knight.maxHp = 10; // one big arrow punches through the Guard shield
    knight.moveSpeed = 0;
    const archer = place(s, "archer", "player", 240, 430); // in range, stationary
    archer.damage = 200;
    archer.hp = archer.maxHp = 100000;

    for (let i = 0; i < 120; i++) {
      stepSimulation(s);
      if (knight.state === "dead") break;
    }

    expect(knight.state).toBe("dead");
    // Blobs came out the SAME tick the projectile killed it...
    expect(s.units.filter((u) => u.defId === "slime_squire").length).toBe(3);
    // ...and the match did NOT end — the enemy still has the blobs on the board.
    expect(s.phase).toBe("battle");
  });
});
