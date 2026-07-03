// Cleric (defId "healer", shown as "Cleric") — a backline support healer. One
// mechanic:
//   Mend — a 1.5s cast (5s cooldown) that heals the most-wounded ally in range
//          (including itself) for 32. The heal lands on cast COMPLETION; the Cleric
//          only BEGINS the wind-up when someone actually needs healing, so it never
//          freezes mid-field channeling a heal that would land on nobody.
// Mend is a cast-time ability: the engine owns the cast bar (begin / tick / fire on
// completion), and the kit supplies the two decisions — wantsToCast (the begin-cast
// gate) and fireAbility (the effect fired when the cast finishes).
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

// The most-wounded ally within heal range (including self), or null if no one needs
// healing. Shared by wantsToCast (so the Cleric doesn't begin its cast at full HP)
// and fireAbility (re-evaluated on completion, since the pick may shift mid-cast).
function mendTarget(ctx: KitCtx): Unit | null {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) => u.state !== "dead" && u.hp < u.maxHp
  );
  if (candidates.length === 0) return null;

  const healRange = unit.range + unit.radius;
  const inRange = candidates.filter((u) => dist(unit.pos, u.pos) <= healRange);
  const pool = inRange.length > 0 ? inRange : [unit];

  // Most-wounded by missing HP; uid tiebreak keeps it deterministic.
  let best = pool[0];
  let bestMissing = best.maxHp - best.hp;
  for (const u of pool) {
    const missing = u.maxHp - u.hp;
    if (missing > bestMissing || (missing === bestMissing && u.uid < best.uid)) {
      best = u;
      bestMissing = missing;
    }
  }
  return bestMissing > 0 ? best : null;
}

export const clericKit: UnitKit = {
  roleClass: "support",

  // Only commit the long wind-up when there's a wounded ally to land it on.
  wantsToCast(ctx) {
    return mendTarget(ctx) != null;
  },

  // Fired when the cast completes: heal the (re-evaluated) most-wounded ally for 32.
  fireAbility(ctx) {
    const best = mendTarget(ctx);
    if (!best) return false;

    ctx.heal(best, 32);
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: best.pos.x, y: best.pos.y - 4 },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(ctx.unit.defId).accent,
    });
    return true;
  },
};
