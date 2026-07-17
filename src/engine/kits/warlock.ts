// Warlock (defId "warlock") — a rare caster with exactly one mechanic: it summons
// in PAIRS. The roster's only non-legendary summoner, and the only one whose pets
// are ranged (the Necromancer raises melee skeletons, the Druid calls melee wolves).
//   Summon Imps — its only cast (0.5s wind-up, ⟳10s): two void imps claw out of a
//                 rift flanking the Warlock. The engine owns the cast pipeline; the
//                 kit just supplies the effect on completion (fireAbility).
// No onTick, no reactions, no funnel hooks — the pact is the whole unit.
//
// The pair does NOT compound: flushSpawns caps a team at activeCap + 3 living units
// (5 in the Arena, 7 in the Depths), so past the cap the summon is silently dropped
// and the Warlock is really re-filling imps as they die. That cap IS this unit's
// balance lever — see the "Pact of Two" trait, which says so to the player.
import type { UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { FIELD_HEIGHT, FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { clamp } from "@/utils/math";

// Both imps spawn on the Warlock's facing side, one high and one low, so the pair
// reads as a pair. Offsets are fixed (never rng) — same seed, same rift.
const RIFT_OFFSET_X = 34;
const RIFT_OFFSET_Y = 22;

export const warlockKit: UnitKit = {
  roleClass: "ranged",

  // Fires on cast completion (the engine drives the wind-up + the cooldown from
  // ABILITIES). Two spawnUnit calls = two imps; the flush applies the cap per
  // spawn, so a Warlock one slot under the cap lands one imp and drops the other.
  fireAbility(ctx) {
    const { unit } = ctx;
    const offsetX = unit.facing >= 0 ? RIFT_OFFSET_X : -RIFT_OFFSET_X;
    for (const dy of [-RIFT_OFFSET_Y, RIFT_OFFSET_Y]) {
      ctx.spawnUnit("void_imp", unit.team, {
        x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40),
        y: clamp(unit.pos.y + dy, 40, FIELD_HEIGHT - 40),
      });
    }
    // The rift itself — one pulse in the Warlock's pact-blue.
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: unit.pos.x + offsetX, y: unit.pos.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },
};
