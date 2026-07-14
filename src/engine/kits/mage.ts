// Mage (defId "mage") — a ranged controller. One mechanic:
//   Polymorph — a 1s cast (20s cooldown) that turns the nearest non-summoned,
//               un-sheeped, visible enemy into a harmless sheep for 7s; it can't
//               act until it reverts. Only real (deckable) units can be sheeped —
//               summons (wolves/skeletons/clones/turrets) are immune.
// Cast-time ability: the engine owns the cast bar; the kit supplies wantsToCast
// (the begin-cast gate — so the Mage doesn't freeze winding up with no legal
// target) and fireAbility (the effect on completion), plus its own target picker.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef, SUMMONED_UNIT_IDS } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import {
  applyEffect,
  isPolymorphed,
  isStealthed,
  makeEffect,
} from "../StatusEffectSystem";

const POLYMORPH_DURATION_SEC = 7;

// Nearest legal sheep target, or null. Skips summons (sheep the master, not the
// minion — Depths monsters are real enemies, NOT summons), already-sheeped,
// stealthed, and polymorph-warded foes (bosses: don't wind up a cast that
// StatusEffectSystem would drop at application). Shared by wantsToCast (begin
// gate) and fireAbility (re-evaluated on completion). Ties broken by uid.
export function polymorphTarget(unit: Unit, enemies: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (SUMMONED_UNIT_IDS.has(e.defId)) continue;
    if (getUnitDef(e.defId).wardedAgainst?.includes("polymorph")) continue;
    if (isPolymorphed(e) || isStealthed(e)) continue;
    const d = dist(unit.pos, e.pos);
    if (d < bestD || (d === bestD && best != null && e.uid < best.uid)) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// Sheep the nearest legal target (re-evaluated on cast completion). Exported
// for the Archmage's Grand Grimoire, which can roll the same sheep.
export function castPolymorph(ctx: KitCtx): boolean {
  const target = polymorphTarget(ctx.unit, ctx.enemies);
  if (!target) return false;

  applyEffect(
    target,
    makeEffect("polymorph", {
      source: ctx.unit.uid,
      durationSec: POLYMORPH_DURATION_SEC,
    })
  );
  // It can't keep acting on whatever it was doing.
  target.targetUid = null;
  target.castTicks = 0;
  target.castTicksMax = 0;
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: target.pos.x, y: target.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: "#f0abfc", // magic pink poof
  });
  return true;
}

export const mageKit: UnitKit = {
  roleClass: "ranged",

  wantsToCast(ctx) {
    return polymorphTarget(ctx.unit, ctx.enemies) != null;
  },

  fireAbility: castPolymorph,
};
