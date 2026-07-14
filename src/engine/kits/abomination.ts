// Abomination — the Bonefields boss. A mindless mountain of stitched corpses,
// no longer a reskinned Ogre:
//   Putrid Spew — belches a cloud over its target's cluster: damage + a lingering
//     poison + a heavy slow to everything caught in it (fireAbility, ~10s).
//   Rot Aura — the reek around it festers, poisoning anything in melee reach every
//     2s (onTick, synced to the global clock).
// Too mindless to fear (wardedAgainst: ["fear"], data) — a menace you can slow or
// stun but never scare off.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const SPEW_RADIUS = 120; // Putrid Spew's cloud around the target
const ROT_RADIUS = 78; // Rot Aura reach (just past melee)
const ROT_INTERVAL_SEC = 2;

export const abominationKit: UnitKit = {
  roleClass: "melee",

  // Rot Aura: poison every enemy in reach on the 2s cadence.
  onTick(unit, ctx) {
    if (ctx.tick % secToTicks(ROT_INTERVAL_SEC) !== 0) return;
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(unit.pos, e.pos) <= ROT_RADIUS) {
        applyEffect(
          e,
          makeEffect("poison", {
            source: unit.uid,
            durationSec: 2,
            damagePerTick: 3,
            tickIntervalSec: 0.5,
          })
        );
      }
    }
  },

  // Putrid Spew: a poison+slow cloud over the target's cluster. Returns false with
  // nothing in reach so the cooldown isn't wasted.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;
    let hit = 0;
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(target.pos, e.pos) <= SPEW_RADIUS) {
        ctx.dealDamage(e, 12, unit);
        applyEffect(
          e,
          makeEffect("poison", {
            source: unit.uid,
            durationSec: 3,
            damagePerTick: 4,
            tickIntervalSec: 0.5,
          })
        );
        applyEffect(
          e,
          makeEffect("slow", {
            source: unit.uid,
            durationSec: 2.5,
            magnitude: 0.4,
          })
        );
        hit++;
      }
    }
    if (hit === 0) return false;
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
