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

import type { FloatingText, Projectile, Unit, Vfx } from "@/types";
import { ABILITIES } from "@/data/abilities";
import { getUnitDef, NON_DECK_UNITS } from "@/data/units";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  secToTicks,
} from "@/utils/constants";
import { clamp, dist, dir } from "@/utils/math";
import {
  applyEffect,
  isPolymorphed,
  isSilenced,
  isStealthed,
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
  /** Spawn a floating combat number/label over a unit (kit hooks: "Vanish!",
   *  "Second Wind!", heal ticks). Presentation-only; never affects the digest. */
  spawnFloatingText: (
    unit: Unit,
    value: string,
    kind: FloatingText["kind"]
  ) => void;
}

/** Abilities that are passive (no active cast). Everything else is cast-gated. */
// "Passive" here means "not driven by the standard active-cast pipeline" — the
// effect runs elsewhere. shadow_step is reactive (handled in CombatSystem like
// Blink), so it lives here even though the UI shows it as an active (cooldown > 0).
const PASSIVE_ABILITIES = new Set<Unit["ability"]>(["lifesteal", "bloodrage", "slime_split", "momentum", "multishot", "whirlwind", "ambush", "aegis", "venom", "shadow_step"]);

/** True if this ability is an active (cooldown-gated) cast. */
function isActiveAbility(unit: Unit): boolean {
  return !PASSIVE_ABILITIES.has(unit.ability);
}

/** Convert seconds to ticks for the given ability cooldown. */
export function abilityCooldownTicks(abilityId: Unit["ability"]): number {
  return secToTicks(ABILITIES[abilityId].cooldown);
}

/** Convert seconds to ticks for an ability's cast (wind-up) time, 0 if instant. */
export function abilityCastTimeTicks(abilityId: Unit["ability"]): number {
  return secToTicks(ABILITIES[abilityId].castTimeSec ?? 0);
}

/** Dispatch an ability's EFFECT (no cooldown/stun gating). */
function dispatchAbility(ctx: AbilityContext): boolean {
  switch (ctx.unit.ability) {
    case "kiting_leap":
      return castKitingLeap(ctx);
    case "shield_block":
      return castShieldBlock(ctx);
    case "fireball":
      return castFireball(ctx);
    case "frost_blast":
      return castFrostBlast(ctx);
    case "arcane_barrage":
      return castArcaneBarrage(ctx);
    case "chain_lightning":
      return castChainLightning(ctx);
    case "charge":
      return castCharge(ctx);
    case "mend":
      return castMend(ctx);
    case "blessing":
      return castBlessing(ctx);
    case "deploy_turret":
      return castDeployTurret(ctx);
    case "summon_wolves":
      return castSummonWolves(ctx);
    case "polymorph":
      return castPolymorph(ctx);
    case "mend_beast":
      return castMendBeast(ctx);
    case "fear_aura":
      return castFear(ctx);
    default:
      return false;
  }
}

/**
 * Attempt to fire `unit`'s ability this tick. For INSTANT abilities the effect
 * fires immediately. Cast-time abilities (the mages) are begun + released by
 * CombatSystem instead; their effect is fired via fireCastAbility on completion.
 */
export function tryCastAbility(ctx: AbilityContext): boolean {
  const { unit } = ctx;
  if (!isActiveAbility(unit)) return false;
  if (unit.abilityCooldown > 0) return false;
  if (isStunned(unit) || isSilenced(unit)) return false;
  return dispatchAbility(ctx);
}

/** Fire a cast-time ability's effect when its cast completes (the cooldown was
 *  paid at cast start; a stun/fear interrupts earlier, so there's no re-check). */
export function fireCastAbility(ctx: AbilityContext): boolean {
  return dispatchAbility(ctx);
}

/** Whether a cast-time ability has a reason to BEGIN its cast this tick. Most
 *  casts always do (there's always an enemy to hit); the Cleric's Mend only
 *  commits to its long wind-up when an ally actually needs healing — otherwise
 *  the Cleric would lock itself in place casting into nothing. */
export function wantsToCast(ctx: AbilityContext): boolean {
  if (ctx.unit.ability === "mend") return mendTarget(ctx) != null;
  if (ctx.unit.ability === "polymorph")
    return polymorphTarget(ctx.unit, ctx.enemies) != null;
  return true;
}

// --- OGRE: Crushing Slam -----------------------------------------------------
// Migrated to kits/ogre.ts (fireAbility), together with Second Wind.

// --- ARCHER: Kiting Leap -----------------------------------------------------
function castKitingLeap(ctx: AbilityContext): boolean {
  const { unit, enemies } = ctx;
  // Only leap if a melee enemy is closing in.
  const threatRange = unit.radius * 2.4;
  const threat = enemies.find(
    (e) =>
      e.state !== "dead" &&
      !isStealthed(e) && // can't leap away from an unseen attacker
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
// Migrated to kits/knight.ts (fireAbility). The Knight now drives Taunting Roar
// through the UnitKit seam; the engine keeps the cast pipeline (cooldown from
// ABILITIES["taunt_roar"], the stun/silence gate).

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
// The most-wounded ally within heal range (including self), or null if no one
// needs healing. Shared by castMend (the effect) and wantsToCast (so the Cleric
// doesn't begin its 2.5s cast at full HP and freeze in place healing no one).
function mendTarget(ctx: AbilityContext): Unit | null {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) => u.state !== "dead" && u.hp < u.maxHp
  );
  if (candidates.length === 0) return null;

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
  return bestMissing > 0 ? best : null;
}

function castMend(ctx: AbilityContext): boolean {
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

// --- DRUID: Rejuvenation -----------------------------------------------------
// Instant cast: lays a healing-over-time on the most-wounded ally in range
// (including itself) — 6 HP every 2s for 8s (24 total). Fired by CombatSystem on
// the Druid's own cooldown; works in caster and bear form alike.
const REJUV_RANGE = 160;
const REJUV_HEAL_PER_TICK = 6;
const REJUV_TICK_SEC = 2;
const REJUV_DURATION_SEC = 8;

export function applyRejuvenation(ctx: AbilityContext): boolean {
  const { unit, allies } = ctx;
  const candidates = [unit, ...allies].filter(
    (u) =>
      u.state !== "dead" &&
      u.hp < u.maxHp &&
      dist(unit.pos, u.pos) <= REJUV_RANGE
  );
  if (candidates.length === 0) return false; // no one hurt; save the cooldown

  // Most-wounded by missing HP (uid tie-break for determinism).
  let best = candidates[0];
  let bestMissing = best.maxHp - best.hp;
  for (const u of candidates) {
    const missing = u.maxHp - u.hp;
    if (missing > bestMissing || (missing === bestMissing && u.uid < best.uid)) {
      best = u;
      bestMissing = missing;
    }
  }

  applyEffect(
    best,
    makeEffect("regen", {
      source: unit.uid,
      healPerTick: REJUV_HEAL_PER_TICK,
      tickIntervalSec: REJUV_TICK_SEC,
      durationSec: REJUV_DURATION_SEC,
    })
  );
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: best.pos.x, y: best.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: "#a3e635",
  });
  return true;
}

// --- MAGE: Polymorph ---------------------------------------------------------
// Turns the nearest non-summoned enemy into a harmless sheep for 7s. Only real
// (deckable) units can be sheeped — summons (wolves, skeletons, slime clones,
// turrets) are immune. Skips already-sheeped and stealthed foes.
const POLYMORPH_DURATION_SEC = 7;

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

function castPolymorph(ctx: AbilityContext): boolean {
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

// --- HUNTER: Mend Beast ------------------------------------------------------
// Instant: lays a heal-over-time on the Hunter's boar (5 HP/s for 6s = 30).
// Only fires when the boar is actually wounded, so the cooldown isn't wasted.
function castMendBeast(ctx: AbilityContext): boolean {
  let boar: Unit | null = null;
  let bestMissing = 0;
  for (const a of ctx.allies) {
    if (a.defId !== "boar" || a.state === "dead") continue;
    const missing = a.maxHp - a.hp;
    if (missing > bestMissing) {
      boar = a;
      bestMissing = missing;
    }
  }
  if (!boar) return false;
  applyEffect(
    boar,
    makeEffect("regen", {
      source: ctx.unit.uid,
      healPerTick: 5,
      tickIntervalSec: 1,
      durationSec: 6,
    })
  );
  ctx.spawnVfx({
    kind: "shield_pop",
    pos: { x: boar.pos.x, y: boar.pos.y - 4 },
    life: secToTicks(0.5),
    maxLife: secToTicks(0.5),
    color: "#a3e635",
  });
  return true;
}

// --- ELECTRIC MAGE: Chain Lightning ------------------------------------------
// Fired when the ~2s cast completes. Arcs from the mage to the cast target (or
// the nearest enemy if it died during the cast), then jumps to the nearest
// un-hit enemy within range, up to 5 targets — heavy damage decaying per jump,
// briefly paralyzing (stunning) each. Each arc spawns a lightning vfx. Hits
// stealthed units too (consistent with the game's other AoE). Deterministic:
// ties broken by uid.
function castChainLightning(ctx: AbilityContext): boolean {
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

  const MAX_TARGETS = 5;
  const JUMP_RADIUS = 130;
  const STUN_SEC = 0.8;
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
}

// --- DWARVEN ENGINEER: Deploy Turret -----------------------------------------
// Builds a stationary ranged turret beside the engineer (a summoned, non-deck
// unit). Like the Druid's wolves it's queued via spawnUnit; the per-team summon
// cap bounds how many turrets can exist, so the fort can't flood the board.
function castDeployTurret(ctx: AbilityContext): boolean {
  const { unit } = ctx;
  const offsetX = unit.facing >= 0 ? 40 : -40;
  ctx.spawnUnit("turret", unit.team, {
    x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40),
    y: clamp(unit.pos.y, 40, FIELD_HEIGHT - 40),
  });
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: clamp(unit.pos.x + offsetX, 40, FIELD_WIDTH - 40), y: unit.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

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
