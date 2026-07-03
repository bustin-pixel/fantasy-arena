// Mage (defId "mage") — a ranged controller. One mechanic:
//   Polymorph — a 1s cast (20s cooldown) that turns the nearest non-summoned,
//               un-sheeped, visible enemy into a harmless sheep for 7s; it can't
//               act until it reverts. Only real (deckable) units can be sheeped —
//               summons (wolves/skeletons/clones/turrets) are immune.
// Cast-time ability: the engine owns the cast bar; the kit supplies wantsToCast
// (the begin-cast gate — so the Mage doesn't freeze winding up with no legal
// target) and fireAbility (the effect on completion), plus its own target picker.
import type { Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { NON_DECK_UNITS } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import {
  applyEffect,
  isPolymorphed,
  isStealthed,
  makeEffect,
} from "../StatusEffectSystem";

const POLYMORPH_DURATION_SEC = 7;

// Nearest legal sheep target (skips summons, already-sheeped, and stealthed foes),
// or null. Shared by wantsToCast (begin gate) and fireAbility (re-evaluated on
// completion). Deterministic: ties broken by uid.
function polymorphTarget(unit: Unit, enemies: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (NON_DECK_UNITS.has(e.defId)) continue; // not summoned units
    if (isPolymorphed(e) || isStealthed(e)) continue;
    const d = dist(unit.pos, e.pos);
    if (d < bestD || (d === bestD && best != null && e.uid < best.uid)) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export const mageKit: UnitKit = {
  roleClass: "ranged",

  wantsToCast(ctx) {
    return polymorphTarget(ctx.unit, ctx.enemies) != null;
  },

  fireAbility(ctx) {
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
  },
};
