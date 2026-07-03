// ============================================================================
// AbilitySystem
// Implements each unit's special ability. Abilities are keyed by AbilityId and
// fire when their cooldown reaches 0 and conditions are met. Cooldowns are
// driven down by the CombatSystem each tick.
//
// Effects funnel through StatusEffectSystem; damage funnels through the
// dealDamage callback supplied by CombatSystem so all HP changes, lifesteal,
// shields, and floating numbers stay centralized and deterministic.
// ============================================================================

import type { FloatingText, Projectile, Trap, Unit, Vfx } from "@/types";
import { ABILITIES } from "@/data/abilities";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";
import { applyEffect, isStealthed, makeEffect } from "./StatusEffectSystem";

export interface AbilityContext {
  unit: Unit;
  /** The current global sim tick (for tick-synced periodics like Raise Dead). */
  tick: number;
  unitsByUid: Map<string, Unit>;
  enemies: Unit[];
  /** Living allies (same team, excluding self) — for healing/support abilities. */
  allies: Unit[];
  /** Centralized damage application (handles shield/lifesteal/flash/death). */
  dealDamage: (target: Unit, amount: number, source: Unit) => void;
  spawnProjectile: (p: Omit<Projectile, "id" | "alive">) => void;
  spawnVfx: (v: Omit<Vfx, "id">) => void;
  heal: (target: Unit, amount: number) => void;
  /** Spawn a fresh unit into the live sim (e.g. summoner's wolves). */
  spawnUnit: (defId: string, team: Unit["team"], pos: { x: number; y: number }) => void;
  /** Lay a ground trap into the sim (Hunter's Scatter Trap). The generic trigger
   *  (stun on step-on) stays in CombatSystem; the kit just places them. */
  spawnTrap: (trap: Trap) => void;
  /** Spawn a floating combat number/label over a unit (kit hooks: "Vanish!",
   *  "Second Wind!", heal ticks). Presentation-only; never affects the digest. */
  spawnFloatingText: (
    unit: Unit,
    value: string,
    kind: FloatingText["kind"]
  ) => void;
}

// (The PASSIVE_ABILITIES set + isActiveAbility check are retired: whether a unit
// has an active cast is now "its kit defines fireAbility" — read at the CombatSystem
// cast seam — so there's no ability-name allowlist to maintain.)

/** Convert seconds to ticks for the given ability cooldown. */
export function abilityCooldownTicks(abilityId: Unit["ability"]): number {
  return secToTicks(ABILITIES[abilityId].cooldown);
}

/** Convert seconds to ticks for an ability's cast (wind-up) time, 0 if instant. */
export function abilityCastTimeTicks(abilityId: Unit["ability"]): number {
  return secToTicks(ABILITIES[abilityId].castTimeSec ?? 0);
}

// (The dispatchAbility switch + tryCastAbility/fireCastAbility/wantsToCast are
// retired: every unit's ability effect now lives in its kit's fireAbility (fired by
// the CombatSystem cast seam), its begin-cast gate in the kit's wantsToCast, and
// the Necromancer's Terrify reaches castFear directly via applyTerrify below.)

// --- OGRE: Crushing Slam -----------------------------------------------------
// Migrated to kits/ogre.ts (fireAbility), together with Second Wind.

// (ARCHER: Kiting Leap now lives in kits/archer.ts — an instant fireAbility that
// hops away from a closing melee threat, or returns false so the cooldown isn't
// spent when there's nothing to kite.)

// (KNIGHT: Shield Block removed — it was UNUSED by any unit [the Knight uses
// taunt_roar] and only reachable via the now-deleted dispatch switch. Recoverable
// from git history if a future tank wants it.)

// --- KNIGHT: Taunting Roar ---------------------------------------------------
// Migrated to kits/knight.ts (fireAbility). The Knight now drives Taunting Roar
// through the UnitKit seam; the engine keeps the cast pipeline (cooldown from
// ABILITIES["taunt_roar"], the stun/silence gate).

// (FIRE MAGE: Fireball + ICE MAGE: Frost Blast now live in kits/fireMage.ts and
// kits/iceMage.ts — cast-time fireAbilities that lob the projectile; their impacts
// still resolve in the shared onProjectileHit resolver below, keyed on the
// "fireball"/"frost_blast" tags. The every-Nth-attack burn/freeze riders are pure
// UnitDef data (basicShotRider), applied in stepProjectiles.)

// (ARCANE MAGE: Arcane Barrage now lives in kits/arcaneMage.ts — a cast-time
// fireAbility that ARMS a 3-missile volley on the current target; CombatSystem's
// stepArcaneBarrage streamer (field-gated on barrageShots) sends the missiles out.)

// Assassin "Ambush" is a passive (opening stealth + first-strike stun) resolved
// in CombatSystem, not an active cast — see performBasicAttack / deploy().

// (ORC: Charge now lives in kits/orc.ts — an instant fireAbility that ARMS the
// rush when the target is out of reach; CombatSystem's stepCharge drives the dash
// and the kit's onChargeContact resolves the slam.)

// (CLERIC: Mend now lives in kits/cleric.ts — a cast-time fireAbility that heals
// the most-wounded ally in range on completion, gated by wantsToCast so the Cleric
// won't begin its wind-up with no wounded ally to land it on. Its mendTarget helper
// moved into the kit.)

// (HOLY KNIGHT: Blessing now lives in kits/holyKnight.ts — an instant fireAbility
// that grants a capped, stacking absorb shield + small heal to itself and nearby
// allies.)

// (DRUID: Summon Wolves + Rejuvenation now live in kits/druid.ts — fireAbility
// summons the wolf on cast completion; onActTick lays the Rejuvenation HoT.)

// (MAGE: Polymorph now lives in kits/mage.ts — a cast-time fireAbility that sheeps
// the nearest non-summoned, un-sheeped, visible enemy for 7s, with wantsToCast as
// the begin-cast gate. Its polymorphTarget picker moved into the kit.)

// (HUNTER: Mend Beast now lives in kits/hunter.ts fireAbility — an instant HoT on
// the most-wounded boar ally.)

// (ELECTRIC MAGE: Chain Lightning now lives in kits/electricMage.ts — a cast-time
// fireAbility that arcs a decaying, stunning bolt through up to 5 enemies on cast
// completion.)

// (DWARVEN ENGINEER: Deploy Turret now lives in kits/engineer.ts — an instant
// fireAbility that queues a turret summon beside the engineer, together with its
// onTick Field Repairs.)

// --- NECROMANCER: Terrify ----------------------------------------------------
// Terrify: nearby enemies flee in terror (fear status) and can't attack for 2s.
// Cast by the Necromancer's custom handler (CombatSystem) via applyTerrify.
function castFear(ctx: AbilityContext): boolean {
  const { unit, enemies } = ctx;
  const FEAR_RADIUS = 200;
  let feared = 0;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (isStealthed(e)) continue; // can't terrify an enemy it can't see
    if (dist(unit.pos, e.pos) <= FEAR_RADIUS) {
      applyEffect(
        e,
        makeEffect("fear", { source: unit.uid, durationSec: 1 })
      );
      feared++;
    }
  }
  if (feared === 0) return false; // nothing in range; don't waste the cooldown
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// Necromancer Curse: a single-target damage-over-time on the cast target
// (22 over 5.5s). Its own `curse` status so it never merges with poison/venom and
// isn't stopped by the Aegis Knight's burn/slow/poison ward. The Necromancer's
// custom cast handler (CombatSystem) calls this on cast completion.
const CURSE_DURATION_SEC = 5.5;
const CURSE_DAMAGE_PER_TICK = 2; // every 0.5s → 11 ticks → 22 total
const CURSE_TICK_SEC = 0.5;

export function applyCurse(ctx: AbilityContext): boolean {
  const target = ctx.unit.castTargetUid
    ? ctx.unitsByUid.get(ctx.unit.castTargetUid)
    : null;
  if (!target || target.state === "dead") return false;
  applyEffect(
    target,
    makeEffect("curse", {
      source: ctx.unit.uid,
      durationSec: CURSE_DURATION_SEC,
      damagePerTick: CURSE_DAMAGE_PER_TICK,
      tickIntervalSec: CURSE_TICK_SEC,
    })
  );
  ctx.spawnVfx({
    kind: "death",
    pos: { x: target.pos.x, y: target.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(ctx.unit.defId).accent,
  });
  return true;
}

/** Terrify's AoE-fear effect, reused by the Necromancer's custom cast handler. */
export function applyTerrify(ctx: AbilityContext): boolean {
  return castFear(ctx);
}

// --- Projectile impact resolution (called by CombatSystem) -------------------
export function onProjectileHit(
  proj: Projectile,
  target: Unit,
  source: Unit | undefined,
  ctx: Pick<AbilityContext, "dealDamage" | "spawnVfx">
): void {
  if (!source) return;
  ctx.dealDamage(target, proj.damage, source);

  if (proj.ability === "fireball") {
    // Fireball is pure burst damage; the Fire Mage's burn comes from its every-3rd
    // basic-attack rider instead (UnitDef.basicShotRider → proj.rider).
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: proj.color,
    });
  } else if (proj.ability === "frost_blast") {
    applyEffect(
      target,
      makeEffect("slow", {
        source: proj.sourceUid,
        durationSec: 2.5,
        magnitude: 0.5,
      })
    );
    ctx.spawnVfx({
      kind: "frost",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: proj.color,
    });
  } else if (proj.ability === "arcane_barrage") {
    // Arcane Barrage missiles are pure burst; just a small impact pop.
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.3),
      maxLife: secToTicks(0.3),
      color: proj.color,
    });
  }
}

/** Passive lifesteal hook, invoked by CombatSystem after a basic attack lands.
 *  Driven by the unit's `lifesteal` fraction in data, independent of its ability
 *  slot, so a unit can have both lifesteal and an active ability (e.g. the Orc). */
export function applyLifesteal(
  attacker: Unit,
  damageDealt: number,
  heal: (u: Unit, amt: number) => void
): void {
  const frac = getUnitDef(attacker.defId).lifesteal ?? 0;
  if (frac > 0) {
    heal(attacker, Math.round(damageDealt * frac));
  }
}
