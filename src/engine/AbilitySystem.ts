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

import type { Projectile, Unit, Vfx } from "@/types";
import { ABILITIES } from "@/data/abilities";
import { getUnitDef } from "@/data/units";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  secToTicks,
} from "@/utils/constants";
import { clamp, dist, dir } from "@/utils/math";
import {
  applyEffect,
  isSilenced,
  isStunned,
  makeEffect,
} from "./StatusEffectSystem";

export interface AbilityContext {
  unit: Unit;
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
  /** Claim the nearest recent corpse for raising; returns its position or null. */
  claimCorpse: () => { x: number; y: number } | null;
}

/** Abilities that are passive (no active cast). Everything else is cast-gated. */
const PASSIVE_ABILITIES = new Set<Unit["ability"]>(["lifesteal", "bloodrage", "slime_split", "momentum", "ambush", "aegis"]);

/** True if this ability is an active (cooldown-gated) cast. */
function isActiveAbility(unit: Unit): boolean {
  return !PASSIVE_ABILITIES.has(unit.ability);
}

/** Convert seconds to ticks for the given ability cooldown. */
export function abilityCooldownTicks(abilityId: Unit["ability"]): number {
  return secToTicks(ABILITIES[abilityId].cooldown);
}

/**
 * Attempt to fire `unit`'s ability this tick. Returns true if it fired (the
 * CombatSystem then resets the cooldown and may enter the casting state).
 */
export function tryCastAbility(ctx: AbilityContext): boolean {
  const { unit } = ctx;
  if (!isActiveAbility(unit)) return false;
  if (unit.abilityCooldown > 0) return false;
  if (isStunned(unit) || isSilenced(unit)) return false;

  switch (unit.ability) {
    case "crushing_slam":
      return castCrushingSlam(ctx);
    case "kiting_leap":
      return castKitingLeap(ctx);
    case "shield_block":
      return castShieldBlock(ctx);
    case "taunt_roar":
      return castTauntRoar(ctx);
    case "fireball":
      return castFireball(ctx);
    case "frost_blast":
      return castFrostBlast(ctx);
    case "arcane_barrage":
      return castArcaneBarrage(ctx);
    case "charge":
      return castCharge(ctx);
    case "mend":
      return castMend(ctx);
    case "blessing":
      return castBlessing(ctx);
    case "summon_wolves":
      return castSummonWolves(ctx);
    case "raise_dead":
      return castNecromancer(ctx);
    case "fear_aura":
      return castFear(ctx);
    default:
      return false;
  }
}

// --- OGRE: Crushing Slam -----------------------------------------------------
function castCrushingSlam(ctx: AbilityContext): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;
  if (dist(unit.pos, target.pos) > unit.range + unit.radius) return false;

  ctx.dealDamage(target, 25, unit);
  applyEffect(
    target,
    makeEffect("stun", { source: unit.uid, durationSec: 1.5 })
  );
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: target.pos.x, y: target.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// --- ARCHER: Kiting Leap -----------------------------------------------------
function castKitingLeap(ctx: AbilityContext): boolean {
  const { unit, enemies } = ctx;
  // Only leap if a melee enemy is closing in.
  const threatRange = unit.radius * 2.4;
  const threat = enemies.find(
    (e) =>
      e.state !== "dead" &&
      getUnitDef(e.defId).range <= 80 &&
      dist(unit.pos, e.pos) <= threatRange
  );
  if (!threat) return false;

  // Leap away from the threat (~2 tiles ≈ 130px), clamped to field.
  const away = dir(threat.pos, unit.pos);
  const leap = 130;
  unit.pos.x = clamp(unit.pos.x + away.x * leap, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(unit.pos.y + away.y * leap, unit.radius, FIELD_HEIGHT - unit.radius);
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.25),
    maxLife: secToTicks(0.25),
    color: "#fde68a",
  });
  return true;
}

// --- KNIGHT: Shield Block ----------------------------------------------------
// NOTE: shield_block is currently UNUSED by any unit — the Knight switched to
// taunt_roar. Kept because it's clean, reusable logic a future tank could claim.
// If you remove it, also delete the type entry, the dispatch case, and the
// ability definition in data/abilities.ts.
function castShieldBlock(ctx: AbilityContext): boolean {
  const { unit } = ctx;
  applyEffect(
    unit,
    makeEffect("shield", { source: unit.uid, durationSec: 6, charges: 1 })
  );
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: unit.pos.x, y: unit.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// --- KNIGHT: Taunting Roar ---------------------------------------------------
// Forces nearby enemies to attack the Knight for a few seconds (overriding their
// normal target priority) and grants the Knight an absorb shield so it can soak
// the incoming fire. The protector tank: it pulls aggro off your backline.
function castTauntRoar(ctx: AbilityContext): boolean {
  const { unit, enemies } = ctx;
  const TAUNT_RADIUS = 200;
  const TAUNT_SEC = 2.5;

  let taunted = 0;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= TAUNT_RADIUS) {
      applyEffect(
        e,
        makeEffect("taunt", { source: unit.uid, durationSec: TAUNT_SEC })
      );
      e.tauntedByUid = unit.uid;
      e.targetUid = unit.uid; // immediately yank their target
      taunted++;
    }
  }

  // Grant the Knight an absorb shield (overhealth) — scales a bit with how many
  // it pulled, so a big group taunt is rewarded with more protection. (Kept in
  // sync with the absorb numbers in the taunt_roar description in abilities.ts.)
  const bubble = 45 + taunted * 10;
  unit.shieldHp = Math.max(unit.shieldHp, bubble);
  unit.shieldHpMax = Math.max(unit.shieldHpMax, unit.shieldHp);

  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: unit.pos.x, y: unit.pos.y - 4 },
    life: secToTicks(0.6),
    maxLife: secToTicks(0.6),
    color: "#cbd5e1",
  });
  return true;
}

// --- FIRE MAGE: Fireball -----------------------------------------------------
function castFireball(ctx: AbilityContext): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;

  ctx.spawnProjectile({
    pos: { x: unit.pos.x, y: unit.pos.y },
    target: { x: target.pos.x, y: target.pos.y },
    targetUid: target.uid,
    speed: 300,
    damage: 25,
    team: unit.team,
    sourceUid: unit.uid,
    ability: "fireball",
    color: getUnitDef(unit.defId).accent,
    angle: 0,
  });
  return true;
}

// --- ICE MAGE: Frost Blast ---------------------------------------------------
function castFrostBlast(ctx: AbilityContext): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;

  ctx.spawnProjectile({
    pos: { x: unit.pos.x, y: unit.pos.y },
    target: { x: target.pos.x, y: target.pos.y },
    targetUid: target.uid,
    speed: 320,
    damage: 20,
    team: unit.team,
    sourceUid: unit.uid,
    ability: "frost_blast",
    color: getUnitDef(unit.defId).accent,
    angle: 0,
  });
  return true;
}

// --- ARCANE MAGE: Arcane Barrage ---------------------------------------------
// A burst nuke at a single target. This cast just ARMS a 3-missile volley locked
// onto the current target; CombatSystem (stepArcaneBarrage) streams the missiles
// out one after another in quick succession, so they fire in sequence rather than
// all leaving at once. Each missile resolves as straight damage on impact.
function castArcaneBarrage(ctx: AbilityContext): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;

  unit.barrageShots = 3;
  unit.barrageTimer = 0; // the first missile fires on the next tick
  unit.barrageTargetUid = target.uid;
  return true;
}

// Assassin "Ambush" is a passive (opening stealth + first-strike stun) resolved
// in CombatSystem, not an active cast — see performBasicAttack / deploy().

// --- ORC: Charge -------------------------------------------------------------
// A gap-closer: when its target is out of melee reach, the orc commits to a fast
// RUSH toward it (not a teleport). The dash and the slam-on-contact are resolved
// over several ticks in CombatSystem (stepCharge); this cast just locks in the
// charge. Lets the orc catch kiting ranged units it could otherwise never reach.
function castCharge(ctx: AbilityContext): boolean {
  const { unit, unitsByUid } = ctx;
  const target = unit.targetUid ? unitsByUid.get(unit.targetUid) : null;
  if (!target || target.state === "dead") return false;

  const d = dist(unit.pos, target.pos);
  // Only worth charging if there's real distance to cover.
  if (d < unit.range + unit.radius + 40) return false;

  // Commit to the rush. CombatSystem drives the dash each tick and slams on
  // contact; chargeTicks is a safety cap so a charge that never connects ends.
  unit.chargeTargetUid = target.uid;
  unit.chargeTicks = secToTicks(1.5);
  unit.facing = target.pos.x >= unit.pos.x ? 1 : -1;
  // Dust kick-up at the orc's feet as it launches forward.
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.25),
    maxLife: secToTicks(0.25),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// --- CLERIC: Mend ------------------------------------------------------------
// Heals the most-wounded ally within range (including self). Only fires if
// someone actually needs healing, so the cooldown isn't wasted at full HP.
function castMend(ctx: AbilityContext): boolean {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) => u.state !== "dead" && u.hp < u.maxHp
  );
  if (candidates.length === 0) return false;

  const healRange = unit.range + unit.radius;
  const inRange = candidates.filter((u) => dist(unit.pos, u.pos) <= healRange);
  const pool = inRange.length > 0 ? inRange : [unit];

  // Most-wounded by missing HP.
  let best = pool[0];
  let bestMissing = best.maxHp - best.hp;
  for (const u of pool) {
    const missing = u.maxHp - u.hp;
    if (missing > bestMissing || (missing === bestMissing && u.uid < best.uid)) {
      best = u;
      bestMissing = missing;
    }
  }
  if (bestMissing <= 0) return false;

  ctx.heal(best, 32);
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: best.pos.x, y: best.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// --- HOLY KNIGHT: Blessing ---------------------------------------------------
// A frontline support pulse: grants an absorb shield + small heal to itself and
// every ally within range. The shield STACKS on top of any existing absorb
// (the Knight's Taunt bubble, the Aegis Knight's banked magic), capped per unit
// so a stack of shielders is strong, not unkillable. Pure ability — it just
// writes the shieldHp pool and calls heal(), no defId gating in CombatSystem.
function castBlessing(ctx: AbilityContext): boolean {
  const { unit, allies } = ctx;
  const BLESSING_RADIUS = 180;
  const SHIELD_GRANT = 40;
  const SHIELD_CAP = 150;
  const HEAL = 15;

  const blessed = [unit, ...allies].filter(
    (u) => u.state !== "dead" && dist(unit.pos, u.pos) <= BLESSING_RADIUS
  );

  for (const ally of blessed) {
    ally.shieldHp = Math.min(SHIELD_CAP, ally.shieldHp + SHIELD_GRANT);
    ally.shieldHpMax = Math.max(ally.shieldHpMax, ally.shieldHp);
    ctx.heal(ally, HEAL);
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: ally.pos.x, y: ally.pos.y - 4 },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
  }
  return true;
}

// --- DRUID: Summon Wolves ----------------------------------------------------
// Spawns a spirit wolf next to the summoner, on the same team. The wolf is a
// full sim unit and fights under the same rules as everyone else.
function castSummonWolves(ctx: AbilityContext): boolean {
  const { unit } = ctx;
  const offsetX = unit.facing >= 0 ? 36 : -36;
  ctx.spawnUnit("wolf", unit.team, {
    x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40),
    y: clamp(unit.pos.y + 24, 40, FIELD_HEIGHT - 40),
  });
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// --- NECROMANCER: Raise Dead + Terrify ---------------------------------------
// The Necromancer raises a skeleton from the nearest fresh corpse when one is
// available; if there are no corpses to feed on, it instead terrifies nearby
// enemies (fear) to buy its team space. One unit, two behaviors driven by the
// state of the battlefield — it gets stronger the more carnage there is.
function castNecromancer(ctx: AbilityContext): boolean {
  const corpse = ctx.claimCorpse();
  if (corpse) {
    const { unit } = ctx;
    ctx.spawnUnit("skeleton", unit.team, {
      x: clamp(corpse.x, 40, FIELD_WIDTH - 40),
      y: clamp(corpse.y, 40, FIELD_HEIGHT - 40),
    });
    ctx.spawnVfx({
      kind: "death",
      pos: { x: corpse.x, y: corpse.y },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  }
  // No corpse to raise — terrify instead.
  return castFear(ctx);
}

// Terrify: nearby enemies flee in terror (fear status) and can't attack for 2s.
function castFear(ctx: AbilityContext): boolean {
  const { unit, enemies } = ctx;
  const FEAR_RADIUS = 200;
  let feared = 0;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= FEAR_RADIUS) {
      applyEffect(
        e,
        makeEffect("fear", { source: unit.uid, durationSec: 2 })
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
    // Fireball is now pure burst damage; the Fire Mage's burn comes from its
    // every-third basic attack instead (see performBasicAttack / onHitBurn).
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
