// Slime Knight behavior (kits/slimeKnight.ts) — Divide & Reconvene:
//   1. On death it flings a shrinking squad of Slime Blobs (2 at stage 0), into open
//      field so a wall-hugging corpse can't clamp one straight onto the grave.
//   2. A blob that oozes back to the corpse reincarnates the knight at half HP,
//      one rebirth-stage higher, and dissolves the rest of the squad.
//   3. At the final stage (2) it's terminal — no blobs, stays dead.
//   4. Blobs ignore combat entirely (homeAnchor suppresses their targeting).
// Exercises the new seam: the spawnUnit `init` stamp, the homeAnchor movement +
// targeting suppression, and the onTick reincarnation.
import { describe, it, expect } from "vitest";
import { stepSimulation } from "@/engine/CombatSystem";
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
  it("flings 2 blobs into open field — even against a wall, never onto the corpse", () => {
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
    expect(blobs.length).toBe(2); // reduced from 4
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
  it("a stage-2 knight flings no blobs and stays dead", () => {
    const s = battleState(3);
    const knight = place(s, "slime_knight", "enemy", 240, 300);
    knight.rebornStage = 2; // reborn the maximum number of times (2 → 1 → 0)
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
    expect(s.units.filter((u) => u.defId === "slime_squire").length).toBe(2);
    // ...and the match did NOT end — the enemy still has the blobs on the board.
    expect(s.phase).toBe("battle");
  });
});
