// Hunter (defId "hunter") — a legendary beastmaster ranged unit. Three mechanics:
//   Boar Companion — keeps a live pet boar beside it; summons one at deploy and
//                    re-summons ~8s after the boar dies (onTick, pre-gate — so a
//                    stunned Hunter still keeps its boar, matching today).
//   Scatter Trap   — lays a spread of ground traps ahead of it on a cooldown; any
//                    enemy that later steps on one is stunned (onTick). The trap
//                    TRIGGER stays generic plumbing in CombatSystem (over
//                    state.traps); the kit only lays them via ctx.spawnTrap.
//   Mend Beast     — an instant cast that lays a heal-over-time on its most-wounded
//                    boar (fireAbility). Only fires when a boar is actually hurt.
// The boar itself (guard-charge) is a summon still gated by defId in CombatSystem,
// pending the shared charge-system refactor (with the Orc) — not this kit.
import type { Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { applyEffect, makeEffect } from "../StatusEffectSystem";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp } from "@/utils/math";

const SCATTER_TRAP_CD_SEC = 12; // between trap sets

export const hunterKit: UnitKit = {
  roleClass: "ranged",

  // Pre-gate maintenance: keep a boar alive, and lay traps on cooldown. Both run
  // even while stunned (they land in the digest), matching the pre-refactor
  // placement; the exact pre-gate spot is digest-irrelevant (spawns flush after
  // the loop, traps trigger after movement).
  onTick(unit, ctx) {
    // Boar Companion: re-summon once no live boar remains (timer frozen while one
    // lives, so it starts at 0 and summons immediately at deploy).
    const hasBoar = ctx.allies.some((a) => a.defId === "boar");
    if (!hasBoar) {
      if (unit.boarCooldown > 0) unit.boarCooldown--;
      if (unit.boarCooldown <= 0) {
        ctx.spawnUnit("boar", unit.team, {
          x: unit.pos.x + (unit.team === "player" ? -30 : 30),
          y: unit.pos.y + 12,
        });
        unit.boarCooldown = secToTicks(8);
      }
    }

    // Scatter Trap: a spread of three traps on the ground ahead (toward the enemy).
    if (unit.trapCooldown > 0) unit.trapCooldown--;
    if (unit.trapCooldown <= 0) {
      const forward = unit.team === "player" ? -1 : 1;
      for (const dx of [-70, 0, 70]) {
        ctx.spawnTrap({
          x: clamp(unit.pos.x + dx, 20, FIELD_WIDTH - 20),
          y: clamp(unit.pos.y + forward * 120, 20, FIELD_HEIGHT - 20),
          team: unit.team,
        });
      }
      unit.trapCooldown = secToTicks(SCATTER_TRAP_CD_SEC);
    }
  },

  // Mend Beast (instant): heal-over-time on the most-wounded boar (5 HP/s for 6s).
  // Returns false when no boar is hurt, so the cooldown isn't wasted.
  fireAbility(ctx) {
    let boar: Unit | null = null;
    let bestMissing = 0;
    for (const a of ctx.allies) {
      if (a.defId !== "boar" || a.state === "dead") continue;
      const missing = a.maxHp - a.hp;
      if (missing > bestMissing) {
        boar = a;
        bestMissing = missing;
      }
    }
    if (!boar) return false;
    applyEffect(
      boar,
      makeEffect("regen", {
        source: ctx.unit.uid,
        healPerTick: 5,
        tickIntervalSec: 1,
        durationSec: 6,
      })
    );
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: boar.pos.x, y: boar.pos.y - 4 },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: "#a3e635",
    });
    return true;
  },
};
