// Engineer (defId "engineer") — a legendary fortress-builder. Two mechanics:
//   Field Repairs — every 2s, repairs itself and nearby friendly turrets, keeping
//                   its emplacements alive longer than their raw HP suggests
//                   (onTick). Suppressed while incapacitated (stun/fear/polymorph)
//                   — a balance dividend: stun now stops the fort's self-sustain.
//   Deploy Turret — an instant ability (9s cooldown) that builds a stationary
//                   ranged turret beside it (a summoned, non-deck unit). Like the
//                   Druid's wolves it's queued via spawnUnit; the per-team summon
//                   cap bounds how many turrets can exist, so the fort can't flood.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp, dist } from "@/utils/math";
import { isIncapacitated } from "../StatusEffectSystem";

const REPAIR = 8;
const REPAIR_RADIUS = 200;
const REPAIR_INTERVAL_SEC = 2;

export const engineerKit: UnitKit = {
  roleClass: "ranged",

  // Field Repairs: heal self + nearby turrets on the 2s cadence. Suppressed while
  // incapacitated — a stunned/feared/sheeped Engineer can't keep its fort patched.
  onTick(unit, ctx) {
    if (isIncapacitated(unit)) return;
    if (ctx.tick % secToTicks(REPAIR_INTERVAL_SEC) !== 0) return;
    ctx.heal(unit, REPAIR);
    for (const ally of ctx.allies) {
      if (ally.defId === "turret" && dist(unit.pos, ally.pos) <= REPAIR_RADIUS) {
        ctx.heal(ally, REPAIR);
      }
    }
  },

  // Deploy Turret (instant): build a turret just ahead, clamped to the field.
  fireAbility(ctx) {
    const { unit } = ctx;
    const offsetX = unit.facing >= 0 ? 40 : -40;
    const x = clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40);
    ctx.spawnUnit("turret", unit.team, {
      x,
      y: clamp(unit.pos.y, 40, FIELD_HEIGHT - 40),
    });
    ctx.spawnVfx({
      kind: "slam",
      pos: { x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
