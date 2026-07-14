// Arcane Mage (defId "arcane_mage") — a ranged burst caster with a defensive
// escape. Two mechanics:
//   Blink          — an instant defensive teleport (170px, own 5s cooldown) away
//                    from the nearest closing melee attacker. Reactive and on its
//                    OWN cooldown, independent of its active cast — it fires from
//                    the pre-idle onReactTick slot, so it can dodge even while a
//                    cast/attack target has just died. Can't blink from an unseen
//                    (stealthed) attacker.
//   Arcane Barrage — its active cast (0.6s) ARMS a 3-missile volley locked onto the
//                    current target (fireAbility). The engine streams the missiles
//                    out one at a time (stepArcaneBarrage, field-gated on
//                    barrageShots — like stepCharge, it stays engine plumbing); the
//                    kit only arms it, the same split as the Hunter's traps.
// Its basic attack is the default ranged shot.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { isStealthed } from "../StatusEffectSystem";

const BLINK_RANGE = 170;
const BLINK_COOLDOWN_SEC = 5;

// Teleport away from the nearest visible melee attacker within threat range
// (radius * 2.6). Returns true if it blinked. Deterministic: the nearest threat
// wins, first-encountered on a distance tie (ctx.enemies is in unit order).
// Exported for the Archmage (kits/archMage.ts), which shares the escape.
export function blink(unit: Unit, ctx: KitCtx): boolean {
  const threatRange = unit.radius * 2.6;
  let threat: Unit | null = null;
  let bestD = Infinity;
  for (const e of ctx.enemies) {
    if (e.state === "dead") continue;
    if (isStealthed(e)) continue; // can't blink away from an unseen attacker
    if (getUnitDef(e.defId).range > 80) continue; // only melee threats trigger Blink
    const d = dist(unit.pos, e.pos);
    if (d <= threatRange && d < bestD) {
      bestD = d;
      threat = e;
    }
  }
  if (!threat) return false;

  let away = dir(threat.pos, unit.pos);
  // Degenerate case (threat exactly overlapping): retreat toward own side.
  if (away.x === 0 && away.y === 0) {
    away = { x: 0, y: unit.team === "player" ? -1 : 1 };
  }
  unit.pos.x = clamp(unit.pos.x + away.x * BLINK_RANGE, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(unit.pos.y + away.y * BLINK_RANGE, unit.radius, FIELD_HEIGHT - unit.radius);
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.3),
    maxLife: secToTicks(0.3),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// Blink as a reactive-slot hook body: fire the escape when its own cooldown is
// ready. Shared verbatim by the Arcane Mage and the Archmage (kits/archMage.ts).
export function reactiveBlink(unit: Unit, ctx: KitCtx): void {
  if (unit.blinkCooldown > 0) return;
  if (blink(unit, ctx)) {
    unit.blinkCooldown = secToTicks(BLINK_COOLDOWN_SEC);
  }
}

// Arcane Barrage (fired on cast completion): arm a 3-missile volley on the
// current target; the engine's stepArcaneBarrage streams the missiles out.
// Exported for the Archmage's Grand Grimoire, which can roll the same volley.
export function armArcaneBarrage(ctx: KitCtx): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;

  unit.barrageShots = 3;
  unit.barrageTimer = 0; // the first missile fires on the next tick
  unit.barrageTargetUid = target.uid;
  return true;
}

export const arcaneMageKit: UnitKit = {
  roleClass: "ranged",

  // Blink runs in the pre-idle reactive slot, on its own cooldown (independent of
  // the active cast). blinkCooldown ticks down with the generic cooldowns.
  onReactTick: reactiveBlink,

  fireAbility: armArcaneBarrage,
};
