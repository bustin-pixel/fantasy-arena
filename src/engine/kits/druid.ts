// Druid (defId "summoner", displayed "Druid") — a legendary caster-shapeshifter
// with four mechanics across two active casts:
//   Summon Wolves — its primary cast (0.5s wind-up): a spirit wolf fights beside
//                   it. The engine owns the cast pipeline; the kit supplies the
//                   effect on completion (fireAbility).
//   Rejuvenation  — an instant HoT on the most-wounded ally in range (incl.
//                   itself), on its own cooldown; works in bear form too. Runs in
//                   the post-idle act slot (onActTick) — it needs a live target
//                   and never uses the cast bar.
//   Bear Form     — a one-way shapeshift at <30% HP into a melee bruiser that
//                   takes 80% less damage for 5s, then reverts. Pre-gate
//                   maintenance (onTick): the guard-timer countdown + the
//                   threshold transform. It keeps summoning and Rejuvenating.
//   Bear healing  — while a bear it receives 50% more healing (modifyIncomingHeal).
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { abilityCooldownTicks } from "../AbilitySystem";
import { applyEffect, isSilenced, isStunned, makeEffect } from "../StatusEffectSystem";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp, dist } from "@/utils/math";

// Rejuvenation: 6 HP every 2s for 8s (24 total) on the most-wounded ally in range.
const REJUV_RANGE = 160;
const REJUV_HEAL_PER_TICK = 6;
const REJUV_TICK_SEC = 2;
const REJUV_DURATION_SEC = 8;

// Druid -> Bear. One-way shapeshift into a melee bruiser. Its thick hide gives
// 80% damage reduction, but only for the first 5s (then normal toughness). It
// keeps its caster kit — still summons wolves and Rejuvenates.
function transformToBear(unit: Unit, ctx: KitCtx): void {
  unit.transformed = true;
  unit.range = 48; // melee
  unit.damage = 26; // bigger claws
  unit.attackSpeed = 1.1; // faster than caster form
  unit.moveSpeed = 78; // charges in
  unit.damageTakenMult = 0.2; // thick hide — takes only 20% damage…
  unit.bearGuardTimer = secToTicks(5); // …for 5s, then reverts to normal
  unit.abilityCooldown = 0; // keeps summoning as a bear
  unit.attackCooldown = 0;
  // Burst of leaves/spirit energy on transform.
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: unit.pos.x, y: unit.pos.y - 4 },
    life: secToTicks(0.6),
    maxLife: secToTicks(0.6),
    color: "#a3e635",
  });
  ctx.spawnFloatingText(unit, "Bear Form!", "heal");
}

// Lay a healing-over-time on the most-wounded ally in range (including itself).
// Most-wounded by missing HP, uid tie-break for determinism. Returns false when
// no one is hurt, so the caller can save the cooldown.
function rejuvenate(ctx: KitCtx): boolean {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) =>
      u.state !== "dead" &&
      u.hp < u.maxHp &&
      dist(unit.pos, u.pos) <= REJUV_RANGE
  );
  if (candidates.length === 0) return false; // no one hurt; save the cooldown

  let best = candidates[0];
  let bestMissing = best.maxHp - best.hp;
  for (const u of candidates) {
    const missing = u.maxHp - u.hp;
    if (missing > bestMissing || (missing === bestMissing && u.uid < best.uid)) {
      best = u;
      bestMissing = missing;
    }
  }

  applyEffect(
    best,
    makeEffect("regen", {
      source: unit.uid,
      healPerTick: REJUV_HEAL_PER_TICK,
      tickIntervalSec: REJUV_TICK_SEC,
      durationSec: REJUV_DURATION_SEC,
    })
  );
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: best.pos.x, y: best.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: "#a3e635",
  });
  return true;
}

export const druidKit: UnitKit = {
  roleClass: "ranged",

  // Pre-gate maintenance: count the Bear Form guard-timer down (reverting the 80%
  // reduction after 5s), then run the one-way <30% HP shapeshift. Kept in
  // decrement-then-transform order to match the pre-refactor sequencing (the
  // exact spot in the pre-gate is digest-irrelevant — damageTakenMult is only
  // read in dealDamage, which runs later).
  onTick(unit, ctx) {
    if (unit.bearGuardTimer > 0) {
      unit.bearGuardTimer--;
      if (unit.bearGuardTimer === 0) unit.damageTakenMult = 1;
    }
    if (!unit.transformed && unit.hp <= unit.maxHp * 0.3) {
      transformToBear(unit, ctx);
    }
  },

  // Post-idle act slot: Rejuvenation on its own cooldown. Instant (never uses the
  // cast bar), but it won't fire mid-summon-cast, and a silence blocks it. The
  // stun guard is inherited from the pre-refactor block and can't actually fire
  // here — a stunned unit already `continue`d in the tick skeleton — but is kept
  // for a byte-identical move.
  onActTick(unit, ctx) {
    if (
      unit.castTicks <= 0 &&
      unit.rejuvCooldown <= 0 &&
      !isStunned(unit) &&
      !isSilenced(unit)
    ) {
      if (rejuvenate(ctx)) {
        unit.rejuvCooldown = abilityCooldownTicks("rejuvenation");
      }
    }
  },

  // Bear Form receives 50% more healing (reads `transformed` at heal time).
  modifyIncomingHeal(unit, amount) {
    return unit.transformed ? amount * 1.5 : amount;
  },

  // Summon Wolves fires on cast completion (the engine drives the 0.5s wind-up +
  // the cooldown from ABILITIES). A spirit wolf spawns beside the Druid, same
  // team, and fights under the same rules as everyone else.
  fireAbility(ctx) {
    const { unit } = ctx;
    const offsetX = unit.facing >= 0 ? 36 : -36;
    ctx.spawnUnit("wolf", unit.team, {
      x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40),
      y: clamp(unit.pos.y + 24, 40, FIELD_HEIGHT - 40),
    });
    ctx.spawnVfx({
      kind: "frost",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
