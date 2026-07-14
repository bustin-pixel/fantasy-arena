// Eclipse Herald — the rare Eclipse Spire catalyst. A herald of twin light that
// foreshadows the Warden's form-flip, no longer a reskinned Arcane Mage:
//   Umbral Veil — drapes a shroud over the player's line: silence 2.5s + a 30%
//     slow to everything near its target (fireAbility, ~12s).
//   Duality — every 6s it turns from Radiant (mends itself ~2%/s) to Umbral (+30%
//     attack damage) and back (onTick, global-clock synced). Reuses the mysticForm
//     flag ("light" = Radiant, "dark" = Umbral); it owns no mystic-archer kit, so
//     the field is free.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const SWAP_INTERVAL_SEC = 6;
const UMBRAL_DMG = 0.3; // +30% damage in Umbral
const RADIANT_REGEN_PCT = 0.02; // of max HP per second, in Radiant
const VEIL_RADIUS = 150;

export const eclipseHeraldKit: UnitKit = {
  roleClass: "ranged",

  onTick(unit, ctx) {
    // Flip forms on the 6s cadence.
    if (ctx.tick % secToTicks(SWAP_INTERVAL_SEC) === 0) {
      unit.mysticForm = unit.mysticForm === "light" ? "dark" : "light";
      ctx.spawnVfx({
        kind: unit.mysticForm === "dark" ? "death" : "shield_pop",
        pos: { x: unit.pos.x, y: unit.pos.y },
        life: secToTicks(0.4),
        maxLife: secToTicks(0.4),
        color: getUnitDef(unit.defId).accent,
      });
    }
    // Umbral bites harder; Radiant mends. Recompute damage from base each tick.
    const def = getUnitDef(unit.defId);
    unit.damage =
      unit.mysticForm === "dark"
        ? Math.round(def.damage * (1 + UMBRAL_DMG))
        : def.damage;
    if (
      unit.mysticForm === "light" &&
      ctx.tick % secToTicks(1) === 0 &&
      unit.hp < unit.maxHp
    ) {
      ctx.heal(unit, Math.round(unit.maxHp * RADIANT_REGEN_PCT));
    }
  },

  // Umbral Veil: silence + slow the cluster around the target. Returns false with
  // nothing in reach so the cooldown isn't wasted.
  fireAbility(ctx) {
    const { unit, unitsByUid } = ctx;
    const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
    if (!target || target.state === "dead") return false;
    let hit = 0;
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(target.pos, e.pos) <= VEIL_RADIUS) {
        applyEffect(
          e,
          makeEffect("silence", { source: unit.uid, durationSec: 2.5 })
        );
        applyEffect(
          e,
          makeEffect("slow", {
            source: unit.uid,
            durationSec: 2.5,
            magnitude: 0.3,
          })
        );
        hit++;
      }
    }
    if (hit === 0) return false;
    ctx.spawnVfx({
      kind: "frost",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
