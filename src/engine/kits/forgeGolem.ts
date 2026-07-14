// Forge Golem — the Deep Forge boss. A molten construct that turns the arena into
// a foundry, no longer a reskinned Ogre:
//   Magma Vents — stamps burning vents (traps carrying a burn rider) under the
//     player's units; whoever is standing over one is set alight (fireAbility,
//     ~10s). Uses the generic trap rider — no engine special-case.
//   Overheat — below 50% HP its core runs away with it: +40% attack speed AND its
//     basic swings themselves ignite the target (onTick recompute + onAfterAttack).
import type { ShotRider, Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const OVERHEAT_BELOW = 0.5;
const OVERHEAT_HASTE = 0.4; // +40% attack speed under half HP
const VENT_COUNT = 3;

const BURN_RIDER: ShotRider = {
  effectType: "burn",
  durationSec: 3,
  damagePerTick: 5,
  tickIntervalSec: 0.5,
  vfxKind: "burn_burst",
  color: "#f97316",
};

function isOverheated(unit: Unit): boolean {
  return unit.hp < unit.maxHp * OVERHEAT_BELOW;
}

export const forgeGolemKit: UnitKit = {
  roleClass: "melee",

  // Overheat: recompute attack speed from base each tick so the bonus toggles the
  // instant HP crosses the threshold (and survives any external stat reset).
  onTick(unit) {
    const base = getUnitDef(unit.defId).attackSpeed;
    unit.attackSpeed = isOverheated(unit) ? base / (1 + OVERHEAT_HASTE) : base;
  },

  // Overheated basics ignite the target.
  onAfterAttack(unit, target, ctx) {
    if (!isOverheated(unit)) return;
    applyEffect(
      target,
      makeEffect("burn", {
        source: unit.uid,
        durationSec: 2,
        damagePerTick: 4,
        tickIntervalSec: 0.5,
      })
    );
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.3),
      maxLife: secToTicks(0.3),
      color: "#f97316",
    });
  },

  // Magma Vents: a burning vent under up to three of the player's units.
  fireAbility(ctx) {
    const { unit } = ctx;
    const spots = ctx.enemies
      .filter((e) => e.state !== "dead")
      .slice(0, VENT_COUNT);
    if (spots.length === 0) return false;
    for (const e of spots) {
      ctx.spawnTrap({
        x: clamp(e.pos.x, 20, FIELD_WIDTH - 20),
        y: clamp(e.pos.y, 20, FIELD_HEIGHT - 20),
        team: unit.team,
        rider: BURN_RIDER,
        sourceUid: unit.uid,
      });
    }
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
