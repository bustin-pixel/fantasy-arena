// Electric Mage (defId "electric_mage") — a ranged burst caster. One mechanic:
//   Chain Lightning — a ~2s cast (8s cooldown) that arcs from the mage to its cast
//                     target (or the nearest enemy if it died mid-cast), then jumps
//                     to the nearest un-hit enemy within range, up to 5 targets —
//                     heavy damage decaying 20% per jump, briefly stunning each.
// Pure cast-time ability (no projectile rider, no defId gating): the engine owns
// the cast bar and fires this on completion via fireAbility. It always has a reason
// to cast (there's an enemy to arc at), so no wantsToCast gate is needed.
import type { Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

const MAX_TARGETS = 5;
const JUMP_RADIUS = 130;
const STUN_SEC = 0.8;

export const electricMageKit: UnitKit = {
  roleClass: "ranged",

  // Fired when the cast completes. Re-acquires the nearest enemy as the arc origin
  // if the cast target died during the wind-up; then chains jump-to-nearest-un-hit,
  // decaying per jump. Deterministic: ties broken by uid.
  fireAbility(ctx) {
    const { unit, unitsByUid, enemies } = ctx;
    let origin = unit.castTargetUid ? unitsByUid.get(unit.castTargetUid) : null;
    if (!origin || origin.state === "dead") {
      origin = null;
      let nd = Infinity;
      for (const e of enemies) {
        if (e.state === "dead") continue;
        const d = dist(unit.pos, e.pos);
        if (d < nd || (d === nd && origin && e.uid < origin.uid)) {
          nd = d;
          origin = e;
        }
      }
    }
    if (!origin) return false; // no enemies left — the cast fizzles harmlessly

    let dmg = 30;
    const hit = new Set<string>();
    let current: Unit | null = origin;
    let from = { x: unit.pos.x, y: unit.pos.y - unit.radius * 0.4 };

    for (let i = 0; i < MAX_TARGETS && current; i++) {
      ctx.dealDamage(current, Math.round(dmg), unit);
      applyEffect(
        current,
        makeEffect("stun", { source: unit.uid, durationSec: STUN_SEC })
      );
      ctx.spawnVfx({
        kind: "lightning",
        pos: { x: from.x, y: from.y },
        to: { x: current.pos.x, y: current.pos.y },
        life: secToTicks(0.35),
        maxLife: secToTicks(0.35),
        color: "#fde047",
      });
      hit.add(current.uid);
      from = { x: current.pos.x, y: current.pos.y };
      dmg *= 0.8; // decay per jump

      let next: Unit | null = null;
      let nd = Infinity;
      for (const e of enemies) {
        if (e.state === "dead" || hit.has(e.uid)) continue;
        const d = dist(current.pos, e.pos);
        if (d <= JUMP_RADIUS && (d < nd || (d === nd && next && e.uid < next.uid))) {
          nd = d;
          next = e;
        }
      }
      current = next;
    }
    return true;
  },
};
