// Ranger (defId "ranger") — a ranged anti-swarm archer. One mechanic:
//   Multishot — every second basic attack looses three arrows at once instead of
//               one, each locked onto a different enemy in range (the committed
//               target plus the two nearest others, nearest-first with a uid
//               tiebreak). Against a lone foe only one arrow finds a mark, so it's
//               a spread, not extra single-target burst.
// The `multishot` ability slot is a passive (no active cast), so the cast pipeline
// leaves it alone; the volley fully REPLACES the default shot (onBasicAttack → true).
import type { Unit } from "@/types";
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { dist } from "@/utils/math";

export const rangerKit: UnitKit = {
  roleClass: "ranged",

  // Replace the default shot. On even attacks add up to two extra targets picked
  // nearest-first (uid tiebreak) so the volley is deterministic. Filtering
  // ctx.enemies with the dead-skip matches the old state.units scan exactly (same
  // alive-snapshot set/order), and attackCount was already bumped by the caller.
  onBasicAttack(unit, target, ctx) {
    const def = getUnitDef(unit.defId);
    const shots: Unit[] = [target];
    if (unit.attackCount % 2 === 0) {
      const extras = ctx.enemies
        .filter(
          (e) =>
            e.state !== "dead" &&
            e.uid !== target.uid &&
            dist(unit.pos, e.pos) <= unit.range
        )
        .sort((a, b) => {
          const da = dist(unit.pos, a.pos);
          const db = dist(unit.pos, b.pos);
          if (da !== db) return da - db;
          return a.uid < b.uid ? -1 : 1;
        });
      for (const e of extras.slice(0, 2)) shots.push(e);
    }
    for (const t of shots) {
      ctx.spawnProjectile({
        pos: { x: unit.pos.x, y: unit.pos.y },
        target: { x: t.pos.x, y: t.pos.y },
        targetUid: t.uid,
        speed: 380,
        damage: unit.damage,
        team: unit.team,
        sourceUid: unit.uid,
        ability: "lifesteal", // sentinel: basic shot, no on-hit status
        color: def.accent,
        angle: 0,
      });
    }
    return true;
  },
};
