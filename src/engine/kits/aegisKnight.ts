// Aegis Knight — an anti-magic bulwark. It soaks magic (only a sliver of a magic
// hit leaks through as HP damage; most is banked afterward as overhealth shield),
// and once that shield fills, its next swing discharges it as an area Backlash
// burst. Its Warded immunity (burn/slow/poison) is data-driven (def.wardedAgainst,
// read by StatusEffectSystem), not a kit hook. Magic is identified by the SOURCE
// unit's school (the casters).
import type { UnitKit } from "./UnitKit";
import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

// Cap on the banked magic shield; also the Backlash discharge threshold.
const AEGIS_SHIELD_CAP = 120;

function isMagicSource(source: Unit): boolean {
  return getUnitDef(source.defId).school === "magic";
}

export const aegisKnightKit: UnitKit = {
  roleClass: "melee",

  // Phase 1: reduce a magic hit to 0.25x before it lands (open contract 1).
  modifyIncomingDamage(_unit, amount, source) {
    return isMagicSource(source) ? amount * 0.25 : amount;
  },

  // Phase 2: bank most of the original magic hit as overhealth shield afterward
  // (so it doesn't absorb the same hit). Capped. Fires post-hit on a survivor.
  onDamaged(unit, amount, source) {
    if (!isMagicSource(source)) return;
    const bank = Math.round(amount * 0.6);
    if (bank <= 0) return;
    unit.shieldHpMax = AEGIS_SHIELD_CAP;
    unit.shieldHp = Math.min(AEGIS_SHIELD_CAP, unit.shieldHp + bank);
  },

  // Backlash: a full shield discharges as an area burst on the next swing.
  onAfterAttack(unit, _target, ctx) {
    if (unit.shieldHp < AEGIS_SHIELD_CAP) return;
    const burst = Math.min(55, Math.round(unit.shieldHp * 0.5));
    unit.shieldHp = 0;
    unit.shieldHpMax = 0;
    for (const e of ctx.enemies) {
      if (dist(unit.pos, e.pos) <= 100) ctx.dealDamage(e, burst, unit);
    }
    ctx.spawnVfx({
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
  },
};
