// Trickster (defId "trickster") — an epic anti-caster disruptor and the last
// stealther. It enters stealthed (onSpawn), reveals on any strike and restarts a
// short re-cloak countdown (onBeforeAttack), melts back into stealth when that
// countdown lapses (onTick), and Shadow Steps to interrupt a nearby cast
// (onReactTick — the pre-idle reactive slot). Its `shadow_step` ability slot is a
// passive (reactive, no active cast), so the cast pipeline leaves it alone.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, MATCH_TIME_SEC, secToTicks } from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { applyEffect, isStealthed, makeEffect } from "../StatusEffectSystem";

// Shadow Step is a reactive interrupt: a large reaction radius so it polices casts
// across most of the board, a short interrupting stun, light damage (its value is
// denial, not burst), and a cooldown so casters can bait it.
const TRICKSTER_REACH = 400;
const TRICKSTER_KICK_DAMAGE = 20;
const TRICKSTER_STUN_SEC = 0.75;
const TRICKSTER_COOLDOWN_SEC = 6;
const TRICKSTER_RECLOAK_SEC = 1.5;

function reveal(unit: Unit): void {
  unit.effects = unit.effects.filter((e) => e.type !== "stealth");
  unit.recloakTimer = secToTicks(TRICKSTER_RECLOAK_SEC);
}

// Blink to the nearest VISIBLE enemy that's mid-cast within reach and kick it —
// the stun fizzles the in-flight cast (the cast-fizzle rule cancels it when the
// stunned victim is processed). Returns true if it fired.
function shadowStep(unit: Unit, ctx: KitCtx): boolean {
  let victim: Unit | null = null;
  let bestD = Infinity;
  for (const e of ctx.enemies) {
    if (e.state === "dead" || e.castTicks <= 0) continue; // only mid-cast foes
    if (isStealthed(e)) continue; // can't react to an unseen caster
    const d = dist(unit.pos, e.pos);
    if (d <= TRICKSTER_REACH && d < bestD) {
      bestD = d;
      victim = e;
    }
  }
  if (!victim) return false;

  // Land just short of the victim, along the line of approach.
  let toward = dir(unit.pos, victim.pos);
  if (toward.x === 0 && toward.y === 0) {
    toward = { x: 0, y: unit.team === "player" ? -1 : 1 };
  }
  const standoff = unit.radius + victim.radius - 4;
  unit.pos.x = clamp(victim.pos.x - toward.x * standoff, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(victim.pos.y - toward.y * standoff, unit.radius, FIELD_HEIGHT - unit.radius);
  unit.facing = victim.pos.x >= unit.pos.x ? 1 : -1;

  // Kick: light damage + a short stun (the stun fizzles the in-flight cast).
  ctx.dealDamage(victim, TRICKSTER_KICK_DAMAGE, unit);
  applyEffect(victim, makeEffect("stun", { source: unit.uid, durationSec: TRICKSTER_STUN_SEC }));

  // Revealed by the strike; start the re-cloak countdown so it vanishes again.
  reveal(unit);

  ctx.spawnVfx({
    kind: "slam",
    pos: { x: victim.pos.x, y: victim.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

export const tricksterKit: UnitKit = {
  roleClass: "melee",

  onSpawn(unit) {
    applyEffect(
      unit,
      makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
    );
  },

  // Re-cloak: a beat after it last struck, it melts back into stealth. Pre-gate
  // (runs even while stunned), matching the pre-refactor placement.
  onTick(unit) {
    if (unit.recloakTimer > 0) {
      unit.recloakTimer--;
      if (unit.recloakTimer === 0 && !isStealthed(unit)) {
        applyEffect(
          unit,
          makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
        );
      }
    }
  },

  // Reveal on the strike (a no-op once already revealed) + restart the re-cloak
  // countdown, so it slips back into stealth a beat after it stops swinging.
  onBeforeAttack(unit) {
    reveal(unit);
  },

  // Pre-idle reactive slot: Shadow Step interrupts a nearby cast even when the
  // Trickster's own committed target just died (hence onReactTick, not onActTick).
  onReactTick(unit, ctx) {
    if (unit.shadowCooldown > 0) return;
    if (shadowStep(unit, ctx)) {
      unit.shadowCooldown = secToTicks(TRICKSTER_COOLDOWN_SEC);
    }
  },
};
