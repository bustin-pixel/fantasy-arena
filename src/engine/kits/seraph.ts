// Seraph (defId "seraph") — the legendary capstone healer: a squishy backline
// raid-medic that juggles TWO casts on ONE cast bar (the Necromancer pattern:
// it OWNS its cast pipeline in onActTick and returns true so the engine's
// standard cast chain is bypassed).
//   Resurrection — a 1s cast, ONCE per battle: brings the most valuable fallen
//                  allied HERO back at 50% max HP (the game's back-from-the-dead
//                  convention — Second Chance boon, Slime Knight rebirth).
//                  "Hero" = a deckable unit: summons (wolves, skeletons,
//                  turrets) and dungeon monsters don't count. The Slime Knight
//                  is excluded — its rebirth SPAWNS a new knight and leaves the
//                  corpse behind, so rezzing that corpse would duplicate it.
//                  Spent when the cast BEGINS (Necro convention), so a stun
//                  interrupt burns it — killing the Seraph mid-prayer is real
//                  counterplay. Discriminated on completion by castTargetUid
//                  (set = Resurrection, null = Divine Light).
//   Divine Light — a 1.5s cast (10s cooldown) that pours 100 HP into EVERY
//                  living teammate (self included) and then blankets them all
//                  in the renewing glow (6 HP/s for 6s = 36 more each — the old
//                  standalone Renewal, now folded into this one prayer). Only
//                  begins when someone on the team is actually hurt.
//   Sanctuary    — instant (11s cooldown): a +55 absorb bubble on EVERY living
//                  ally (self included), stacking on any existing shield and
//                  capped at 150/ally (the Holy Knight's Blessing rule). Reuses
//                  the shieldHp pool. Never fires mid-cast; stun/silence block it.
// Its niche vs the Priest/Cleric: those heal ONE ally; the Seraph blankets the
// WHOLE deployed side — and once a battle it undoes a kill. Squishy with a token
// attack, so "kill the healer" is the counterplay.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { SUMMONED_UNIT_IDS, getUnitDef } from "@/data/units";
import { abilityCastTimeTicks, abilityCooldownTicks } from "../AbilitySystem";
import { applyEffect, isSilenced, isStunned, makeEffect } from "../StatusEffectSystem";
import { secToTicks } from "@/utils/constants";

const DIVINE_LIGHT_AMOUNT = 100;

const SANCTUARY_SHIELD = 55;
const SANCTUARY_CAP = 150; // per-ally absorb ceiling (matches the Holy Knight)

// The renewing glow Divine Light leaves behind: 6 HP every 1s for 6s (36 total).
const RENEWING_HEAL_PER_TICK = 6;
const RENEWING_TICK_SEC = 1;
const RENEWING_DURATION_SEC = 6;

const RESURRECT_HP_FRAC = 0.5; // revived hero returns at half HP

// Every living ally on the Seraph's side, self included — the "whole team" its
// supports blanket. No range gate: only 1–2 allies are ever on the field, so
// "entire team" is the intended reach.
function team(ctx: KitCtx): Unit[] {
  return [ctx.unit, ...ctx.allies].filter((u) => u.state !== "dead");
}

// The most valuable fallen ally, or null. Excludes SUMMONS (wolves, skeletons,
// turrets, bloatlings) — a rez should bring back a real body, not a disposable
// pet. This is intentionally team-relative rather than deckable-only: the player
// Seraph rezzes a fallen hero, and via the Seraphiel boss (same kit) the same
// rule rezzes a fallen MONSTER wave-mate — the boss's signature "the choir will
// not stay dead" moment (before, monsters weren't deckable so its rez never
// fired). Slime Knight excluded: its corpse persists after its own blob-rebirth
// spawns a NEW knight, so a rez would duplicate it. Highest maxHp first, uid
// tiebreak — deterministic.
function fallenHero(ctx: KitCtx): Unit | null {
  let best: Unit | null = null;
  for (const u of ctx.unitsByUid.values()) {
    if (u.team !== ctx.unit.team || u.state !== "dead") continue;
    if (SUMMONED_UNIT_IDS.has(u.defId)) continue;
    if (u.defId === "slime_knight") continue;
    if (
      !best ||
      u.maxHp > best.maxHp ||
      (u.maxHp === best.maxHp && u.uid < best.uid)
    ) {
      best = u;
    }
  }
  return best;
}

function healVfx(ctx: KitCtx, target: Unit): void {
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: target.pos.x, y: target.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(ctx.unit.defId).accent,
  });
}

// Replicates CombatSystem.transitionTo(unit, "casting") — the dead-guard matters
// (a Seraph killed earlier this tick can still reach onActTick, and its state
// must stay "dead").
function lockCasting(unit: Unit): void {
  if (unit.state !== "dead") unit.state = "casting";
}

// The dual-cast pipeline (Necromancer pattern). Mutates the shared cast-bar
// fields; the seam reads castTicks > 0 to decide whether the unit is locked
// this tick. Resurrection outranks Divine Light — a dead hero is more urgent
// than topping up the living.
function seraphCast(unit: Unit, ctx: KitCtx): void {
  if (unit.castTicks > 0) {
    unit.castTicks--;
    if (unit.castTicks <= 0) {
      // Cast complete: Resurrection (a corpse is targeted) or Divine Light.
      if (unit.castTargetUid) {
        const corpse = ctx.unitsByUid.get(unit.castTargetUid);
        if (corpse && corpse.state === "dead") {
          ctx.revive(corpse, RESURRECT_HP_FRAC);
          healVfx(ctx, corpse);
        }
      } else {
        // Divine Light: 100 HP into every living teammate, then the renewing
        // glow on each (re-evaluated at completion — the team may have changed).
        for (const ally of team(ctx)) {
          ctx.heal(ally, DIVINE_LIGHT_AMOUNT);
          applyEffect(
            ally,
            makeEffect("regen", {
              source: unit.uid,
              healPerTick: RENEWING_HEAL_PER_TICK,
              tickIntervalSec: RENEWING_TICK_SEC,
              durationSec: RENEWING_DURATION_SEC,
            })
          );
          healVfx(ctx, ally);
        }
      }
      unit.castTicksMax = 0;
      unit.castTargetUid = null;
    } else {
      lockCasting(unit);
    }
    return;
  }

  if (isStunned(unit) || isSilenced(unit)) return;

  // Resurrection — once per battle, spent at cast BEGIN (an interrupt burns it).
  if (!unit.resurrectionUsed) {
    const corpse = fallenHero(ctx);
    if (corpse) {
      unit.castTicks = abilityCastTimeTicks("resurrection");
      unit.castTicksMax = unit.castTicks;
      unit.castTargetUid = corpse.uid;
      unit.resurrectionUsed = true;
      lockCasting(unit);
      return;
    }
  }

  // Divine Light — only wind up when someone on the team is actually hurt.
  if (unit.abilityCooldown <= 0 && team(ctx).some((u) => u.hp < u.maxHp)) {
    unit.castTicks = abilityCastTimeTicks("divine_light");
    unit.castTicksMax = unit.castTicks;
    unit.castTargetUid = null; // team-wide → Divine Light on completion
    unit.abilityCooldown = abilityCooldownTicks("divine_light");
    lockCasting(unit);
    return;
  }
}

export const seraphKit: UnitKit = {
  roleClass: "support",

  // Owns the whole cast pipeline (Resurrection + Divine Light on one bar) and
  // runs the Sanctuary instant, then returns true so the engine bypasses its
  // standard cast-handling chain (the seam derives "locked" from castTicks > 0).
  onActTick(unit, ctx) {
    // Sanctuary — proactive team-wide bubble; top up whenever it's ready. Never
    // mid-cast (matches the old behavior), and a silence/stun blocks it.
    if (unit.castTicks <= 0 && !isStunned(unit) && !isSilenced(unit)) {
      if (unit.sanctuaryCooldown <= 0) {
        for (const ally of team(ctx)) {
          ally.shieldHp = Math.min(SANCTUARY_CAP, ally.shieldHp + SANCTUARY_SHIELD);
          ally.shieldHpMax = Math.max(ally.shieldHpMax, ally.shieldHp);
          healVfx(ctx, ally);
        }
        unit.sanctuaryCooldown = abilityCooldownTicks("sanctuary");
      }
    }

    seraphCast(unit, ctx);
    return true;
  },
};
