// Dire Alpha — the Wilds boss. A pack leader whose fight escalates in stages
// rather than the old borrowed Berserker rage:
//   Call of the Wild — at 66% and 33% HP it throws back its head and howls: two
//     dire wolves lope in, the whole pack surges forward (haste), and the players
//     recoil in fear for 1s (onDamaged, HP-threshold gated via bossPhase).
//   Savage Bite — every third strike tears a bleeding wound (a poison DoT) into
//     its target (onAfterAttack, keyed on the engine-bumped attackCount).
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const HOWL_FEAR_RADIUS = 220;
// A brief recoil, not a lock — a full 1s fear per howl chain-stunned the player
// out of ever damaging the boss (swept 0%). 0.5s reads as a flinch.
const HOWL_FEAR_SEC = 0.5;
const PACK_HASTE = 0.3; // +30% move speed for the surging pack
const PACK_HASTE_SEC = 4;
const BLEED_EVERY = 3; // every Nth melee strike bleeds

function howl(unit: Unit, ctx: KitCtx): void {
  // Two wolves lope in beside the alpha (routes through the same-tick spawn queue).
  for (const side of [-1, 1]) {
    ctx.spawnUnit("dire_wolf", unit.team, {
      x: unit.pos.x + side * 34,
      y: unit.pos.y + 18,
    });
  }
  // The pack surges — haste the alpha and every packmate.
  for (const ally of [unit, ...ctx.allies]) {
    if (ally.state === "dead") continue;
    applyEffect(
      ally,
      makeEffect("haste", {
        source: unit.uid,
        durationSec: PACK_HASTE_SEC,
        magnitude: PACK_HASTE,
      })
    );
  }
  // The players recoil in terror.
  for (const e of ctx.enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= HOWL_FEAR_RADIUS) {
      applyEffect(
        e,
        makeEffect("fear", { source: unit.uid, durationSec: HOWL_FEAR_SEC })
      );
    }
  }
  ctx.spawnFloatingText(unit, "AWOOO!", "heal");
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.6),
    maxLife: secToTicks(0.6),
    color: getUnitDef(unit.defId).accent,
  });
}

export const direAlphaKit: UnitKit = {
  roleClass: "melee",

  onDamaged(unit, _amount, _source, ctx) {
    const missing = 1 - unit.hp / unit.maxHp;
    const want = (missing >= 0.34 ? 1 : 0) + (missing >= 0.67 ? 1 : 0);
    while (unit.bossPhase < want) {
      unit.bossPhase++;
      howl(unit, ctx);
    }
  },

  onAfterAttack(unit, target, ctx) {
    if (unit.attackCount % BLEED_EVERY !== 0) return;
    applyEffect(
      target,
      makeEffect("poison", {
        source: unit.uid,
        durationSec: 3,
        damagePerTick: 3,
        tickIntervalSec: 0.5,
      })
    );
    ctx.spawnVfx({
      kind: "death",
      pos: { x: target.pos.x, y: target.pos.y - 4 },
      life: secToTicks(0.3),
      maxLife: secToTicks(0.3),
      color: "#ef4444",
    });
  },
};
