// Ancient Automaton — the rare Deep Forge catalyst. A relic war-construct, no
// longer sharing the Rune Golem's flat damage halving:
//   Sentry Protocol — redeploys defensive turrets, one every 8s, up to two at a
//     time (onTick, global-clock synced; suppressed while incapacitated).
//   Fortress Core — while ANY of its turrets still stands it runs its wards at
//     full power (40% damage reduction); with the last turret gone the core is
//     exposed and it takes full damage. Kill the adds to crack it
//     (modifyIncomingDamage). Turns the fight into a target-priority puzzle.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp } from "@/utils/math";
import { isIncapacitated } from "../StatusEffectSystem";

const SENTRY_INTERVAL_SEC = 8;
const MAX_TURRETS = 2;
const CORE_DR = 0.4;

export const ancientAutomatonKit: UnitKit = {
  roleClass: "melee",

  // Sentry Protocol: rebuild a turret on the 8s cadence, up to two live.
  onTick(unit, ctx) {
    if (isIncapacitated(unit)) return;
    if (ctx.tick % secToTicks(SENTRY_INTERVAL_SEC) !== 0) return;
    const live = ctx.allies.filter(
      (a) => a.defId === "turret" && a.state !== "dead"
    ).length;
    if (live >= MAX_TURRETS) return;
    const offsetX = unit.facing >= 0 ? 40 : -40;
    ctx.spawnUnit("turret", unit.team, {
      x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40),
      y: unit.pos.y,
    });
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
  },

  // Fortress Core: 40% damage reduction while a turret lives, else full damage.
  modifyIncomingDamage(_unit, amount, _source, ctx) {
    const guarded = ctx.allies.some(
      (a) => a.defId === "turret" && a.state !== "dead"
    );
    return guarded ? amount * (1 - CORE_DR) : amount;
  },
};
