// Necromancer (defId "necromancer") — a legendary controller/summoner and the
// most bespoke caster: it juggles TWO casts on ONE cast bar, so it OWNS its cast
// pipeline (onActTick) rather than using the shared one. Raise Dead is a separate
// pre-gate passive (onTick).
//   Raise Dead — every 5s it raises a skeleton beside it (onTick, synced to the
//                GLOBAL tick so every Necromancer raises in lockstep). Pre-gate —
//                fires even while stunned, matching the pre-refactor placement.
//   Curse      — a heavy single-target DoT, saved for its long cooldown.
//   Terrify    — an AoE fear when Curse is on cooldown and a foe is in reach.
// Curse/Terrify share the cast bar. onActTick returns true so the engine bypasses
// its standard cast-handling chain and locks the unit while the cast is mid-flight
// (the seam derives "locked" from castTicks > 0).
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import {
  abilityCastTimeTicks,
  abilityCooldownTicks,
  applyCurse,
  applyTerrify,
} from "../AbilitySystem";
import { isSilenced, isStealthed, isStunned } from "../StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

const NECRO_FEAR_REACH = 210; // a foe must be roughly within Terrify's range to bother
const RAISE_INTERVAL_SEC = 5; // Raise Dead cadence

function hasFearTarget(unit: Unit, enemies: Unit[]): boolean {
  return enemies.some(
    (e) =>
      e.state !== "dead" &&
      !isStealthed(e) &&
      dist(unit.pos, e.pos) <= NECRO_FEAR_REACH
  );
}

// Replicates CombatSystem.transitionTo(unit, "casting") — the dead-guard matters
// (a Necromancer killed earlier this tick can still reach onActTick with a live
// target, and its state must stay "dead").
function lockCasting(unit: Unit): void {
  if (unit.state !== "dead") unit.state = "casting";
}

// The dual-cast pipeline (was CombatSystem.stepNecromancerCast). Mutates the
// shared cast-bar fields; the seam reads castTicks > 0 to decide whether the unit
// is locked this tick. Curse first (saved for its long cooldown), then Terrify.
function necroCast(unit: Unit, ctx: KitCtx): void {
  if (unit.castTicks > 0) {
    unit.castTicks--;
    if (unit.castTicks <= 0) {
      // Cast complete: Curse (a target is set) or Terrify (AoE, no target).
      if (unit.castTargetUid) applyCurse(ctx);
      else applyTerrify(ctx);
      unit.castTicksMax = 0;
      unit.castTargetUid = null;
    } else {
      lockCasting(unit);
    }
    return;
  }

  if (isStunned(unit) || isSilenced(unit)) return;
  const target = unit.targetUid ? ctx.unitsByUid.get(unit.targetUid) : null;

  if (unit.curseCooldown <= 0 && target && target.state !== "dead") {
    unit.castTicks = abilityCastTimeTicks("curse");
    unit.castTicksMax = unit.castTicks;
    unit.castTargetUid = target.uid;
    unit.curseCooldown = abilityCooldownTicks("curse");
    lockCasting(unit);
    return;
  }
  if (unit.abilityCooldown <= 0 && hasFearTarget(unit, ctx.enemies)) {
    unit.castTicks = abilityCastTimeTicks("fear_aura");
    unit.castTicksMax = unit.castTicks;
    unit.castTargetUid = null; // AoE → Terrify on completion
    unit.abilityCooldown = abilityCooldownTicks("fear_aura");
    lockCasting(unit);
    return;
  }
}

export const necromancerKit: UnitKit = {
  roleClass: "ranged",

  // Raise Dead: every 5s, raise a skeleton beside the Necromancer. Synced to the
  // GLOBAL tick (not a per-unit timer) so behavior is byte-identical to the old
  // passive. Pre-gate — fires even while stunned; the summon cap gates the flush.
  onTick(unit, ctx) {
    if (ctx.tick % secToTicks(RAISE_INTERVAL_SEC) === 0) {
      ctx.spawnUnit("skeleton", unit.team, {
        x: unit.pos.x,
        y: unit.pos.y + (unit.team === "player" ? -24 : 24),
      });
    }
  },

  // Owns the cast pipeline: run the dual Curse/Terrify cast bar and return true so
  // the engine bypasses its standard cast-handling chain (and locks the unit for
  // the tick when castTicks > 0).
  onActTick(unit, ctx) {
    necroCast(unit, ctx);
    return true;
  },
};
