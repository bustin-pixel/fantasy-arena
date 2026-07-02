// ============================================================================
// CombatSystem
// The orchestrator. Each tick it:
//   1. ticks status effects (DoT, expirations)
//   2. updates targets
//   3. runs the per-unit state machine (idle/moving/attacking/casting/stunned)
//   4. resolves basic attacks, ability casts, projectiles
//   5. advances movement + animation
//   6. checks win/loss/timeout
//
// ALL HP changes go through dealDamage/heal here so shields, lifesteal, hit
// flashes, floating numbers and death transitions stay in one deterministic
// place. No React, no Math.random — fully replayable from a seed.
// ============================================================================

import type {
  BattleSnapshot,
  FloatingText,
  MatchPhase,
  Projectile,
  Team,
  Trap,
  Unit,
  Vec2,
  Vfx,
} from "@/types";
import { RNG } from "@/utils/rng";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FLOAT_TEXT_TICKS,
  HIT_FLASH_TICKS,
  MATCH_TIME_SEC,
  MAX_ACTIVE_UNITS_PER_SIDE,
  MAX_EFFECTS,
  MAX_PROJECTILES,
  SEC_PER_TICK,
  secToTicks,
} from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { getUnitDef } from "@/data/units";
import { createUnit } from "@/entities/createUnit";
import {
  abilityCastTimeTicks,
  abilityCooldownTicks,
  applyCurse,
  applyLifesteal,
  applyRejuvenation,
  applyTerrify,
  fireCastAbility,
  onProjectileHit,
  tryCastAbility,
  wantsToCast,
  type AbilityContext,
} from "./AbilitySystem";
import { getKit, type KitCtx } from "./kits/UnitKit";
import { stepMovement } from "./MovementSystem";
import { updateTarget } from "./TargetingSystem";
import {
  applyEffect,
  attackDelayMultiplier,
  hasEffect,
  isFeared,
  isPolymorphed,
  isSilenced,
  isStealthed,
  isStunned,
  makeEffect,
  tickEffects,
  tryConsumeShield,
} from "./StatusEffectSystem";
import { stepAnimation } from "./AnimationSystem";

export interface SimState {
  tick: number;
  phase: MatchPhase;
  units: Unit[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  vfx: Vfx[];
  traps: Trap[];
  clockTicks: number;
  rng: RNG;
  idCounter: number;
  /** Reserve cards still deployable per side. Set by MatchController each tick.
   *  A side only loses when its board is empty AND it has no reserves left. */
  playerReserves: number;
  enemyReserves: number;
  /** Per-side concurrent-unit caps. Arena keeps the shared 2; The Depths raises
   *  them (player 4, enemy 8). MatchController sets these at match creation;
   *  the summon flush derives its ceiling from them. */
  activeCaps: { player: number; enemy: number };
  /** Units queued to spawn from inside dealDamage (slime splits/clones).
   *  Flushed each tick alongside ability-driven summons. */
  damageSpawns: { defId: string; team: Team; pos: Vec2 }[];
}

export function createSimState(seed: number, clockSec: number): SimState {
  return {
    tick: 0,
    phase: "deployment",
    units: [],
    projectiles: [],
    floatingTexts: [],
    vfx: [],
    traps: [],
    clockTicks: secToTicks(clockSec),
    rng: new RNG(seed),
    idCounter: 0,
    playerReserves: 0,
    enemyReserves: 0,
    activeCaps: {
      player: MAX_ACTIVE_UNITS_PER_SIDE,
      enemy: MAX_ACTIVE_UNITS_PER_SIDE,
    },
    damageSpawns: [],
  };
}

function nextId(state: SimState, prefix: string): string {
  return `${prefix}${state.idCounter++}`;
}

// ---------------------------------------------------------------------------
// HP mutation helpers — the ONLY places hp changes.
// ---------------------------------------------------------------------------

/** True if the damage comes from a magic-school unit (the casters). */
function isMagicSource(source: Unit): boolean {
  return getUnitDef(source.defId).school === "magic";
}

/** Cap on the Aegis Knight's banked magic shield; also its Backlash threshold. */
const AEGIS_SHIELD_CAP = 120;

function makeDamageDealer(
  state: SimState,
  makeKitCtx: (subject: Unit, damageContext?: boolean) => KitCtx
) {
  return function dealDamage(target: Unit, amount: number, source: Unit): void {
    if (target.state === "dead") return;

    const kit = getKit(target.defId);

    // Shield fully blocks a single hit.
    if (tryConsumeShield(target)) {
      spawnFloatingText(state, target, "Block", "heal");
      target.hitFlash = HIT_FLASH_TICKS;
      return;
    }

    // [seam] kit incoming-damage modifier (open contract 1): reduce the hit before
    // HP is applied. Identity while un-migrated; the post-hit bank rides onDamaged.
    let effAmount = amount;
    if (amount > 0 && kit?.modifyIncomingDamage) {
      effAmount = kit.modifyIncomingDamage(target, effAmount, source, makeKitCtx(target, true));
    }

    // Aegis Knight soaks magic: most of a magic hit is banked as overhealth
    // shield (applied after, so it doesn't absorb this same hit) — only a sliver
    // leaks through as HP damage.
    let aegisBank = 0;
    if (amount > 0 && target.defId === "aegis_knight" && isMagicSource(source)) {
      effAmount = amount * 0.25;
      aegisBank = Math.round(amount * 0.6);
    }

    let dmg = Math.max(0, Math.round(effAmount * target.damageTakenMult));

    // Absorb shield (overhealth) soaks damage before HP.
    if (target.shieldHp > 0 && dmg > 0) {
      const absorbed = Math.min(target.shieldHp, dmg);
      target.shieldHp -= absorbed;
      dmg -= absorbed;
      if (target.shieldHp <= 0) target.shieldHpMax = 0;
    }

    target.hp = Math.max(0, target.hp - dmg);
    target.hitFlash = HIT_FLASH_TICKS;
    target.attackedByUid = source.uid;
    spawnFloatingText(state, target, `-${Math.round(effAmount * target.damageTakenMult)}`, "damage");

    // Bank the absorbed magic into the Aegis shield (capped), after the hit.
    if (aegisBank > 0 && target.hp > 0) {
      target.shieldHpMax = AEGIS_SHIELD_CAP;
      target.shieldHp = Math.min(AEGIS_SHIELD_CAP, target.shieldHp + aegisBank);
    }

    // [seam] kit post-hit reaction on a surviving target. Slime split now lives
    // in its kit (kits/slime.ts onDamaged, routing clones to damageSpawns);
    // Aegis bank migrates here next.
    if (kit?.onDamaged && target.hp > 0) {
      kit.onDamaged(target, dmg, source, makeKitCtx(target, true));
    }

    // (Ogre Second Wind now lives in its kit — kits/ogre.ts. onDamaged catches a
    // non-lethal hit that crosses 25%; onWouldDie below catches the lethal one.)

    if (target.hp <= 0) {
      // [seam] kit death veto (open contract 3): runs BEFORE the generic
      // death_immune check, matching today's order. If the kit kept the unit
      // alive (Ogre Second Wind / Vanish / Last Stand), the hit is fully handled.
      if (kit?.onWouldDie && kit.onWouldDie(target, source, makeKitCtx(target, true))) {
        return;
      }
      // Death-immunity window (e.g. Assassin's Vanish): clamp to 1 HP and survive.
      if (hasEffect(target, "death_immune")) {
        target.hp = 1;
      } else if (target.defId === "assassin" && !target.vanishUsed) {
        // Vanish: the first lethal blow doesn't kill. The assassin survives at
        // 1 HP and becomes untargetable (stealth) + immune to death for 2.5s so
        // it can slip away.
        target.vanishUsed = true;
        target.hp = 1;
        applyEffect(
          target,
          makeEffect("death_immune", { source: target.uid, durationSec: 2.5 })
        );
        applyEffect(
          target,
          makeEffect("stealth", { source: target.uid, durationSec: 2.5 })
        );
        target.attackedByUid = null;
        spawnFloatingText(state, target, "Vanish!", "heal");
        spawnVfx(state, {
          kind: "death",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: getUnitDef(target.defId).accent,
        });
      } else if (target.defId === "berserker" && !target.lastStandUsed) {
        // Berserker Last Stand: once per life, a killing blow leaves it at 1 HP and
        // unkillable for 5s. Unlike Vanish it does NOT stealth — it stays in the
        // fight, and its kill-heal can claw HP back before the window closes.
        target.lastStandUsed = true;
        target.hp = 1;
        applyEffect(
          target,
          makeEffect("death_immune", { source: target.uid, durationSec: 5 })
        );
        spawnFloatingText(state, target, "Last Stand!", "heal");
        spawnVfx(state, {
          kind: "slam",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: getUnitDef(target.defId).accent,
        });
      } else {
        transitionTo(target, "dead");
        target.targetUid = null;

        // [seam] kit on-kill reaction on the KILLER (Berserker Bloodthirst).
        const srcKit = getKit(source.defId);
        if (srcKit?.onKill && source !== target && source.state !== "dead") {
          srcKit.onKill(source, target, makeKitCtx(source, true));
        }

        // Berserker Bloodthirst: landing a killing blow restores 5% of its max
        // HP. Fires per kill (a Cleave that drops several foes heals several
        // times), feeding the Last Stand comeback.
        if (
          source.defId === "berserker" &&
          source !== target &&
          source.state !== "dead"
        ) {
          const before = source.hp;
          source.hp = Math.min(
            source.maxHp,
            source.hp + Math.round(source.maxHp * 0.05)
          );
          const gained = source.hp - before;
          if (gained > 0) spawnFloatingText(state, source, `+${gained}`, "heal");
        }

        spawnVfx(state, {
          kind: "death",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: getUnitDef(target.defId).color,
        });

        // [seam] kit on-death reaction on the victim (Bloater / Slime burst —
        // may re-enter dealDamage; the makeKitCtx(damageContext) summon queue
        // keeps any spawned clones on the same-tick flush).
        if (kit?.onDeath) kit.onDeath(target, makeKitCtx(target, true));

        // Bloater Putrid Burst: on death it ruptures — AoE damage plus a
        // lingering poison on every nearby enemy. Same one-shot safety as the
        // slime burst (a unit only dies once).
        if (target.defId === "bloater") {
          const CLOUD_RADIUS = 110;
          const CLOUD_DMG = 30;
          for (const u of state.units) {
            if (u.state === "dead" || u.team === target.team) continue;
            if (dist(target.pos, u.pos) <= CLOUD_RADIUS) {
              dealDamage(u, CLOUD_DMG, target);
              applyEffect(
                u,
                makeEffect("poison", {
                  source: target.uid,
                  durationSec: 4,
                  damagePerTick: 4,
                  tickIntervalSec: 0.5,
                })
              );
            }
          }
          spawnVfx(state, {
            kind: "slam",
            pos: { x: target.pos.x, y: target.pos.y },
            life: secToTicks(0.6),
            maxLife: secToTicks(0.6),
            color: getUnitDef(target.defId).accent,
          });
        }

        // (Slime death-burst now lives in its kit — kits/slime.ts onDeath, fired
        // by the onDeath seam above; it re-enters dealDamage via ctx.dealDamage.)
      }
    }
  };
}

function makeHealer(
  state: SimState,
  makeKitCtx: (subject: Unit, damageContext?: boolean) => KitCtx
) {
  return function heal(target: Unit, amount: number): void {
    if (target.state === "dead" || amount <= 0) return;
    const kit = getKit(target.defId);
    // [seam] kit incoming-heal modifier (Druid bear form 1.5x). Identity while
    // un-migrated.
    let amt = amount;
    if (kit?.modifyIncomingHeal) {
      amt = kit.modifyIncomingHeal(target, amount, makeKitCtx(target, true));
    }
    // Bear Form: the Druid receives 50% more healing while transformed.
    if (target.defId === "summoner" && target.transformed) amt = amount * 1.5;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + Math.round(amt));
    const gained = target.hp - before;
    if (gained > 0) spawnFloatingText(state, target, `+${gained}`, "heal");
  };
}

function spawnFloatingText(
  state: SimState,
  unit: Unit,
  value: string,
  kind: FloatingText["kind"]
): void {
  state.floatingTexts.push({
    id: nextId(state, "ft"),
    pos: { x: unit.pos.x, y: unit.pos.y - unit.radius },
    value,
    kind,
    life: FLOAT_TEXT_TICKS,
    maxLife: FLOAT_TEXT_TICKS,
  });
}

function spawnVfx(state: SimState, v: Omit<Vfx, "id">): void {
  if (state.vfx.length >= MAX_EFFECTS) state.vfx.shift();
  state.vfx.push({ ...v, id: nextId(state, "vfx") });
}

function spawnProjectile(
  state: SimState,
  p: Omit<Projectile, "id" | "alive">
): void {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  state.projectiles.push({ ...p, id: nextId(state, "proj"), alive: true });
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

function transitionTo(unit: Unit, next: Unit["state"]): void {
  if (unit.state === "dead") return; // terminal
  unit.state = next;
}

// Druid -> Bear. One-way shapeshift into a melee bruiser. Its thick hide gives
// 80% damage reduction, but only for the first 5s (then it's a normal-toughness
// brawler). It keeps its caster kit — still summons wolves and Rejuvenates.
function transformDruid(state: SimState, unit: Unit): void {
  unit.transformed = true;
  unit.range = 48; // melee
  unit.damage = 26; // bigger claws
  unit.attackSpeed = 1.1; // faster than caster form
  unit.moveSpeed = 78; // charges in
  unit.damageTakenMult = 0.2; // thick hide — takes only 20% damage…
  unit.bearGuardTimer = secToTicks(5); // …for 5s, then reverts to normal
  unit.abilityCooldown = 0; // keeps summoning as a bear
  unit.attackCooldown = 0;
  // Burst of leaves/spirit energy on transform.
  spawnVfx(state, {
    kind: "shield_pop",
    pos: { x: unit.pos.x, y: unit.pos.y - 4 },
    life: secToTicks(0.6),
    maxLife: secToTicks(0.6),
    color: "#a3e635",
  });
  spawnFloatingText(state, unit, "Bear Form!", "heal");
}

// Orc Charge speed — well above any unit's normal moveSpeed so the rush reads as
// a fast lunge that quickly closes the gap, without being an instant teleport.
const CHARGE_SPEED = 340; // px/sec

// Hunter Scatter Trap tuning.
const SCATTER_TRAP_CD_SEC = 12; // between trap sets
const TRAP_STUN_SEC = 7; // how long a caught unit is held
const TRAP_RADIUS = 26; // how close a foe must step to trigger it

// Advance an in-progress Orc charge by one tick. The orc dashes toward its locked
// target at CHARGE_SPEED and slams on contact (bonus damage + brief stun). This
// owns the unit's movement for the duration (MovementSystem skips charging units)
// so the dash can't be double-applied. Fully deterministic — no randomness.
function stepCharge(
  state: SimState,
  unit: Unit,
  byUid: Map<string, Unit>,
  dealDamage: (target: Unit, amount: number, source: Unit) => void
): void {
  unit.chargeTicks--;

  const target = unit.chargeTargetUid ? byUid.get(unit.chargeTargetUid) : null;
  if (!target || target.state === "dead") {
    // Target gone — abandon the charge and resume normal AI next tick.
    unit.chargeTicks = 0;
    unit.chargeTargetUid = null;
    return;
  }

  // Slightly beyond the two radii: collision resolution parks units exactly at
  // radius-sum apart, so a smaller threshold would never register against a
  // stationary target (the charge would oscillate at the collision boundary).
  const contact = unit.radius + target.radius + 4;
  const d = dist(unit.pos, target.pos);

  if (d <= contact) {
    if (unit.defId === "boar") {
      // Boar guard: on contact, taunt the target onto itself (charge, then taunt).
      applyEffect(
        target,
        makeEffect("taunt", { source: unit.uid, durationSec: 2.5 })
      );
      target.tauntedByUid = unit.uid;
      target.targetUid = unit.uid;
    } else {
      // Orc: slam for bonus damage and a short stagger.
      dealDamage(target, 22, unit);
      applyEffect(
        target,
        makeEffect("stun", { source: unit.uid, durationSec: 0.8 })
      );
    }
    spawnVfx(state, {
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: getUnitDef(unit.defId).accent,
    });
    unit.chargeTicks = 0;
    unit.chargeTargetUid = null;
    transitionTo(unit, "attacking");
    return;
  }

  // Dash one step toward the (possibly moving) target.
  const v = dir(unit.pos, target.pos);
  const step = CHARGE_SPEED * SEC_PER_TICK;
  unit.pos.x = clamp(unit.pos.x + v.x * step, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(unit.pos.y + v.y * step, unit.radius, FIELD_HEIGHT - unit.radius);
  unit.facing = v.x >= 0 ? 1 : -1;
  transitionTo(unit, "moving");

  // Safety cap reached without connecting — end the charge gracefully.
  if (unit.chargeTicks <= 0) unit.chargeTargetUid = null;
}

// Arcane Mage: Arcane Barrage volley. The active cast (castArcaneBarrage) arms a
// 3-shot burst locked onto one target; this fires the missiles one at a time in
// quick succession so they stream out rather than all leaving at once. Runs every
// tick while a volley is queued; the locked target is held for the whole volley.
const ARCANE_MISSILE_DAMAGE = 12;
const ARCANE_VOLLEY_GAP = 2; // ticks between consecutive missiles (~0.15s)

function stepArcaneBarrage(
  state: SimState,
  unit: Unit,
  byUid: Map<string, Unit>
): void {
  if (unit.barrageTimer > 0) {
    unit.barrageTimer--;
    return;
  }
  const tgt = unit.barrageTargetUid ? byUid.get(unit.barrageTargetUid) : null;
  if (!tgt || tgt.state === "dead") {
    // Locked target gone — abort the rest of the volley.
    unit.barrageShots = 0;
    unit.barrageTargetUid = null;
    return;
  }
  spawnProjectile(state, {
    pos: { x: unit.pos.x, y: unit.pos.y },
    target: { x: tgt.pos.x, y: tgt.pos.y },
    targetUid: tgt.uid,
    speed: 360,
    damage: ARCANE_MISSILE_DAMAGE,
    team: unit.team,
    sourceUid: unit.uid,
    ability: "arcane_barrage",
    color: getUnitDef(unit.defId).accent,
    angle: 0,
  });
  unit.barrageShots--;
  unit.barrageTimer = unit.barrageShots > 0 ? ARCANE_VOLLEY_GAP : 0;
}

// Arcane Mage: Blink. An instant defensive teleport (not a dash) away from the
// nearest melee attacker that has closed in. Reactive and on its own cooldown,
// so it's independent of the unit's active ability (Arcane Barrage).
function tryBlink(state: SimState, unit: Unit, enemies: Unit[]): boolean {
  const threatRange = unit.radius * 2.6;
  let threat: Unit | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    if (isStealthed(e)) continue; // can't blink away from an unseen attacker
    if (getUnitDef(e.defId).range > 80) continue; // only melee threats trigger Blink
    const d = dist(unit.pos, e.pos);
    if (d <= threatRange && d < bestD) {
      bestD = d;
      threat = e;
    }
  }
  if (!threat) return false;

  let away = dir(threat.pos, unit.pos);
  // Degenerate case (threat exactly overlapping): retreat toward own side.
  if (away.x === 0 && away.y === 0) {
    away = { x: 0, y: unit.team === "player" ? -1 : 1 };
  }
  const BLINK = 170;
  unit.pos.x = clamp(unit.pos.x + away.x * BLINK, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(unit.pos.y + away.y * BLINK, unit.radius, FIELD_HEIGHT - unit.radius);
  spawnVfx(state, {
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.3),
    maxLife: secToTicks(0.3),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// Trickster tuning. Shadow Step is a reactive interrupt: a large reaction radius
// so it polices casts across most of the board, a short interrupting stun, light
// damage (its value is denial, not burst), and a cooldown so casters can bait it.
const TRICKSTER_REACH = 400;
const TRICKSTER_KICK_DAMAGE = 20;
const TRICKSTER_STUN_SEC = 0.75;
const TRICKSTER_COOLDOWN_SEC = 6;
const TRICKSTER_RECLOAK_SEC = 1.5;

// Trickster: Shadow Step. When an enemy within reach begins a cast, blink to it and
// kick — the stun interrupts the cast (the cast-fizzle rule handles the actual
// cancel when the stunned victim is processed). Reactive, on its own cooldown.
function tryShadowStep(
  state: SimState,
  unit: Unit,
  enemies: Unit[],
  dealDamage: (t: Unit, amt: number, s: Unit) => void
): boolean {
  let victim: Unit | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.state === "dead" || e.castTicks <= 0) continue; // only mid-cast foes
    if (isStealthed(e)) continue; // can't react to an unseen caster
    const d = dist(unit.pos, e.pos);
    if (d <= TRICKSTER_REACH && d < bestD) {
      bestD = d;
      victim = e;
    }
  }
  if (!victim) return false;

  // Land just short of the victim, along the line of approach.
  let toward = dir(unit.pos, victim.pos);
  if (toward.x === 0 && toward.y === 0) {
    toward = { x: 0, y: unit.team === "player" ? -1 : 1 };
  }
  const standoff = unit.radius + victim.radius - 4;
  unit.pos.x = clamp(victim.pos.x - toward.x * standoff, unit.radius, FIELD_WIDTH - unit.radius);
  unit.pos.y = clamp(victim.pos.y - toward.y * standoff, unit.radius, FIELD_HEIGHT - unit.radius);
  unit.facing = victim.pos.x >= unit.pos.x ? 1 : -1;

  // Kick: light damage + a short stun (the stun fizzles the in-flight cast).
  dealDamage(victim, TRICKSTER_KICK_DAMAGE, unit);
  applyEffect(victim, makeEffect("stun", { source: unit.uid, durationSec: TRICKSTER_STUN_SEC }));

  // Revealed by the strike; start the re-cloak countdown so it vanishes again.
  unit.effects = unit.effects.filter((e) => e.type !== "stealth");
  unit.recloakTimer = secToTicks(TRICKSTER_RECLOAK_SEC);

  spawnVfx(state, {
    kind: "slam",
    pos: { x: victim.pos.x, y: victim.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef(unit.defId).accent,
  });
  return true;
}

// Necromancer casting. It juggles two casts on one cast bar, so it's handled
// here instead of the shared mage pipeline: its big Curse (long cooldown) when
// ready, otherwise Terrify. Raise Dead is a separate passive (periodic spawn).
// Cast times + cooldowns come from the ability data (curse / fear_aura) so the
// engine and the detail panel never drift.
const NECRO_FEAR_REACH = 210; // a foe must be roughly within Terrify's range to bother

function necroHasFearTarget(unit: Unit, enemies: Unit[]): boolean {
  return enemies.some(
    (e) =>
      e.state !== "dead" &&
      !isStealthed(e) &&
      dist(unit.pos, e.pos) <= NECRO_FEAR_REACH
  );
}

/** Returns true while the Necromancer is busy casting (caller should skip the
 *  rest of its tick). A finished cast fires Curse (castTargetUid set → DoT a
 *  target) or Terrify (castTargetUid null → AoE fear). */
function stepNecromancerCast(state: SimState, ctx: AbilityContext): boolean {
  const unit = ctx.unit;

  if (unit.castTicks > 0) {
    unit.castTicks--;
    if (unit.castTicks <= 0) {
      if (unit.castTargetUid) applyCurse(ctx);
      else applyTerrify(ctx);
      unit.castTicksMax = 0;
      unit.castTargetUid = null;
      return false; // free to basic-attack the rest of the tick
    }
    transitionTo(unit, "casting");
    return true;
  }

  if (isStunned(unit) || isSilenced(unit)) return false;
  const target = unit.targetUid ? ctx.unitsByUid.get(unit.targetUid) : null;

  // Curse first (saved for its long cooldown), then Terrify.
  if (unit.curseCooldown <= 0 && target && target.state !== "dead") {
    unit.castTicks = abilityCastTimeTicks("curse");
    unit.castTicksMax = unit.castTicks;
    unit.castTargetUid = target.uid;
    unit.curseCooldown = abilityCooldownTicks("curse");
    transitionTo(unit, "casting");
    return true;
  }
  if (unit.abilityCooldown <= 0 && necroHasFearTarget(unit, ctx.enemies)) {
    unit.castTicks = abilityCastTimeTicks("fear_aura");
    unit.castTicksMax = unit.castTicks;
    unit.castTargetUid = null; // AoE → Terrify on completion
    unit.abilityCooldown = abilityCooldownTicks("fear_aura");
    transitionTo(unit, "casting");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

export function stepSimulation(state: SimState): void {
  if (state.phase !== "battle") return;
  state.tick++;
  state.clockTicks = Math.max(0, state.clockTicks - 1);

  const living = state.units.filter((u) => u.state !== "dead");
  const byUid = new Map(state.units.map((u) => [u.uid, u]));

  // Units summoned this tick are queued here and flushed after the AI loop, so we
  // never mutate the array we're iterating. Hoisted above the funnel so the kit
  // context builder can route a kit's ability-driven summons into this queue.
  const pendingSpawns: {
    defId: string;
    team: Unit["team"];
    pos: { x: number; y: number };
  }[] = [];

  // The single HP funnel, forward-declared so makeKitCtx (which a kit hook fired
  // from *inside* dealDamage/heal captures) can reference them. Both are assigned
  // immediately below, before any tick logic — and thus any hook — runs.
  let dealDamage!: (target: Unit, amount: number, source: Unit) => void;
  let heal!: (target: Unit, amount: number) => void;

  // Build the context a kit hook receives. `damageContext` routes a kit's summons
  // to the same-tick damageSpawns queue (on-damage / on-death hooks re-enter the
  // funnel); otherwise they join pendingSpawns like ability-driven summons. Only
  // ever invoked from a guarded call site, so it costs nothing while no unit is
  // migrated (the registry is empty).
  const makeKitCtx = (subject: Unit, damageContext = false): KitCtx => {
    const liveNow = state.units.filter((u) => u.state !== "dead");
    return {
      unit: subject,
      unitsByUid: byUid,
      enemies: liveNow.filter((e) => e.team !== subject.team),
      allies: liveNow.filter(
        (a) => a.team === subject.team && a.uid !== subject.uid
      ),
      dealDamage,
      heal,
      spawnProjectile: (p) => spawnProjectile(state, p),
      spawnVfx: (v) => spawnVfx(state, v),
      spawnUnit: (defId, team, pos) =>
        (damageContext ? state.damageSpawns : pendingSpawns).push({
          defId,
          team,
          pos,
        }),
      spawnFloatingText: (u, v, k) => spawnFloatingText(state, u, v, k),
    };
  };

  dealDamage = makeDamageDealer(state, makeKitCtx);
  heal = makeHealer(state, makeKitCtx);

  // 1. Status effect timers + DoT / HoT.
  const { dots, hots } = tickEffects(living);
  for (const { unit, damage } of dots) {
    const src = unit.effects.find((e) => e.type === "burn" || e.type === "poison");
    const source = src ? byUid.get(src.source) ?? unit : unit;
    dealDamage(unit, damage, source);
  }
  for (const { unit, amount } of hots) heal(unit, amount);

  // Recompute living after DoT (some may have died).
  const alive = state.units.filter((u) => u.state !== "dead");

  // Clear stale "attackedBy" if aggressor died.
  for (const u of alive) {
    if (u.attackedByUid) {
      const agg = byUid.get(u.attackedByUid);
      if (!agg || agg.state === "dead") u.attackedByUid = null;
    }
    // Clear taunt link once the taunt status has expired or the taunter died.
    if (u.tauntedByUid) {
      const taunter = byUid.get(u.tauntedByUid);
      const stillTaunted = u.effects.some((e) => e.type === "taunt");
      if (!stillTaunted || !taunter || taunter.state === "dead") {
        u.tauntedByUid = null;
      }
    }
  }

  // 2 & 3 & 4. Per-unit AI / state machine. (pendingSpawns is declared above the
  // funnel so the kit context builder can queue ability-driven summons into it.)
  for (const unit of alive) {
    // Cooldowns always tick down.
    if (unit.attackCooldown > 0) unit.attackCooldown--;
    if (unit.abilityCooldown > 0) unit.abilityCooldown--;
    if (unit.blinkCooldown > 0) unit.blinkCooldown--;
    if (unit.shadowCooldown > 0) unit.shadowCooldown--;
    if (unit.curseCooldown > 0) unit.curseCooldown--;
    if (unit.rejuvCooldown > 0) unit.rejuvCooldown--;

    // Bear Form's 80% damage reduction lasts 5s, then the bear reverts to normal
    // toughness. (Only the transformed Druid ever sets bearGuardTimer.)
    if (unit.bearGuardTimer > 0) {
      unit.bearGuardTimer--;
      if (unit.bearGuardTimer === 0) unit.damageTakenMult = 1;
    }

    // Trickster re-cloak: a beat after it last struck, it melts back into stealth.
    // (Only the Trickster ever sets recloakTimer, so no defId gate is needed.)
    if (unit.recloakTimer > 0) {
      unit.recloakTimer--;
      if (unit.recloakTimer === 0 && !isStealthed(unit)) {
        applyEffect(
          unit,
          makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
        );
      }
    }

    // [seam] kit pre-gate maintenance slot — runs every tick, even while stunned
    // (periodic passives, per-tick stat recompute, threshold transforms). This is
    // where Field Repairs / Raise Dead / boar+trap / bloodrage / momentum / bear
    // transform migrate. Placement is behavior-defining once units move here, so
    // each migration re-verifies digest().
    {
      const kit = getKit(unit.defId);
      if (kit?.onTick) kit.onTick(unit, makeKitCtx(unit));
    }

    // Engineer Field Repairs: every 2s, repair itself and nearby turrets,
    // keeping its emplacements alive longer than their raw HP suggests.
    if (unit.defId === "engineer" && state.tick % secToTicks(2) === 0) {
      const REPAIR = 8;
      const REPAIR_RADIUS = 200;
      heal(unit, REPAIR);
      for (const ally of state.units) {
        if (ally.state === "dead" || ally.team !== unit.team) continue;
        if (ally.defId === "turret" && dist(unit.pos, ally.pos) <= REPAIR_RADIUS) {
          heal(ally, REPAIR);
        }
      }
    }

    // Necromancer Raise Dead: a passive that continuously raises a skeleton every
    // 5s. The summon cap is enforced when spawns flush, so it can't flood the board.
    if (unit.defId === "necromancer" && state.tick % secToTicks(5) === 0) {
      pendingSpawns.push({
        defId: "skeleton",
        team: unit.team,
        pos: { x: unit.pos.x, y: unit.pos.y + (unit.team === "player" ? -24 : 24) },
      });
    }

    // Hunter Boar Companion: keep a pet boar alive beside the Hunter. Summons one
    // immediately at deploy (boarCooldown 0), and after the boar dies the timer
    // (frozen while a boar lives) counts down to re-summon ~8s later.
    if (unit.defId === "hunter") {
      const hasBoar = state.units.some(
        (u) => u.defId === "boar" && u.team === unit.team && u.state !== "dead"
      );
      if (!hasBoar) {
        if (unit.boarCooldown > 0) unit.boarCooldown--;
        if (unit.boarCooldown <= 0) {
          pendingSpawns.push({
            defId: "boar",
            team: unit.team,
            pos: {
              x: unit.pos.x + (unit.team === "player" ? -30 : 30),
              y: unit.pos.y + 12,
            },
          });
          unit.boarCooldown = secToTicks(8);
        }
      }
    }

    // Hunter Scatter Trap: on its cooldown, lay a spread of traps on the ground
    // ahead of it (toward the enemy). Any enemy that later steps on one is caught
    // (stunned) and the trap is spent. First set is laid at deploy.
    if (unit.defId === "hunter") {
      if (unit.trapCooldown > 0) unit.trapCooldown--;
      if (unit.trapCooldown <= 0) {
        const forward = unit.team === "player" ? -1 : 1;
        for (const dx of [-70, 0, 70]) {
          state.traps.push({
            x: clamp(unit.pos.x + dx, 20, FIELD_WIDTH - 20),
            y: clamp(unit.pos.y + forward * 120, 20, FIELD_HEIGHT - 20),
            team: unit.team,
          });
        }
        unit.trapCooldown = secToTicks(SCATTER_TRAP_CD_SEC);
      }
    }

    // A spell cast in progress (the cast bar) is interrupted by a stun or fear —
    // the spell fizzles. Runs before the stun check so the stun can cancel it;
    // the cast's tick-down + release happens after targeting (see below).
    if (
      unit.castTicks > 0 &&
      (isStunned(unit) || isFeared(unit) || isPolymorphed(unit))
    ) {
      unit.castTicks = 0;
      unit.castTicksMax = 0;
      unit.castTargetUid = null;
      spawnVfx(state, {
        kind: "frost",
        pos: { x: unit.pos.x, y: unit.pos.y - 4 },
        life: secToTicks(0.3),
        maxLife: secToTicks(0.3),
        color: "#fde047",
      });
    }

    // Druid shapeshift: at <30% HP, transform into a bear — melee bruiser that
    // takes only 20% damage (80% reduction). One-way. Stops summoning; becomes
    // a frontline brawler.
    if (
      unit.defId === "summoner" &&
      !unit.transformed &&
      unit.hp <= unit.maxHp * 0.3
    ) {
      transformDruid(state, unit);
    }

    // Berserker Bloodrage: damage and attack speed scale up as HP drops. At full
    // HP it's baseline; near death it hits much harder and faster. Recomputed
    // each tick from the unit's data-defined base stats.
    if (unit.defId === "berserker") {
      const def = getUnitDef(unit.defId);
      const missing = 1 - unit.hp / unit.maxHp; // 0 at full, ~1 near death
      const dmgBonus = 1 + missing * 0.9; // up to +90% damage
      const spdBonus = 1 - missing * 0.4; // up to 40% faster attacks
      unit.damage = Math.round(def.damage * dmgBonus);
      unit.attackSpeed = def.attackSpeed * spdBonus;
    }

    // Mystic Archer Momentum: each Light/Dark form shift permanently ramps its
    // attack speed by 15% (capped at +75%). Recomputed from base each tick.
    if (unit.defId === "mystic_archer") {
      const def = getUnitDef(unit.defId);
      const bonus = Math.min(0.75, unit.momentumStacks * 0.15);
      unit.attackSpeed = def.attackSpeed / (1 + bonus);
    }

    // Stun overrides everything.
    if (isStunned(unit)) {
      if (unit.state !== "dead") transitionTo(unit, "stunned");
      continue;
    }
    // Polymorph: a harmless sheep — can't move, attack, or cast (stands frozen).
    if (isPolymorphed(unit)) {
      if (unit.state !== "dead") transitionTo(unit, "stunned");
      continue;
    }
    if (unit.state === "stunned") transitionTo(unit, "idle");

    // Fear: the unit can't attack or cast — it flees. Movement handles the
    // actual retreat; here we just force it into the moving state and skip the
    // combat logic so it never attacks while afraid.
    if (isFeared(unit)) {
      transitionTo(unit, "moving");
      continue;
    }

    // Arcane Mage: stream out any queued Arcane Barrage missiles (one at a time).
    // Non-blocking — the mage still moves/attacks normally during the volley.
    if (unit.barrageShots > 0) stepArcaneBarrage(state, unit, byUid);

    // Boar guard: when its Hunter is attacked, charge that attacker (Orc-charge
    // dash) and, on contact, taunt it off the Hunter — so it works even when the
    // boar is far away. Re-charges each time the 2.5s taunt lapses. Runs before
    // the charge-step below so the rush kicks off the same tick.
    if (unit.defId === "boar" && unit.chargeTicks <= 0) {
      const hunter = alive.find(
        (u) => u.defId === "hunter" && u.team === unit.team
      );
      const attacker = hunter?.attackedByUid
        ? byUid.get(hunter.attackedByUid)
        : null;
      if (
        attacker &&
        attacker.state !== "dead" &&
        attacker.team !== unit.team &&
        attacker.tauntedByUid !== unit.uid
      ) {
        unit.chargeTargetUid = attacker.uid;
        unit.chargeTicks = secToTicks(1.5);
        unit.facing = attacker.pos.x >= unit.pos.x ? 1 : -1;
      }
    }

    // Orc Charge (and Boar guard-charge): while a rush is in progress it owns
    // movement until contact.
    if (unit.chargeTicks > 0) {
      stepCharge(state, unit, byUid, dealDamage);
      continue;
    }

    const enemies = alive.filter((e) => e.team !== unit.team);
    updateTarget(unit, byUid, enemies);

    // [seam] kit post-target act slot — the unit has a target (or none) and is
    // un-stunned/un-feared here. This is where Blink / Shadow Step / Rejuvenation
    // / the Necromancer's custom cast migrate. Timing among those varies (some run
    // before the "no target" idle-out below, some after), so each migration
    // re-verifies digest() and relocates this call if its unit needs it.
    {
      const kit = getKit(unit.defId);
      if (kit?.onActTick) kit.onActTick(unit, makeKitCtx(unit));
    }

    // Arcane Mage: Blink away from a closing melee threat (own cooldown, so it's
    // independent of the passive ability slot). Just repositions; the rest of the
    // tick (movement/kiting) resumes from the new spot.
    if (unit.defId === "arcane_mage" && unit.blinkCooldown <= 0) {
      if (tryBlink(state, unit, enemies)) {
        unit.blinkCooldown = secToTicks(5);
      }
    }

    // Trickster: Shadow Step to an enemy that just started casting and kick it,
    // interrupting the cast. Reactive, on its own cooldown — independent of its
    // basic attacks (it still brawls normally when nothing is casting).
    if (unit.defId === "trickster" && unit.shadowCooldown <= 0) {
      if (tryShadowStep(state, unit, enemies, dealDamage)) {
        unit.shadowCooldown = secToTicks(TRICKSTER_COOLDOWN_SEC);
      }
    }

    const target = unit.targetUid ? byUid.get(unit.targetUid) : null;

    // A casting unit keeps going even if its target died — the spell still fires
    // on completion (re-acquiring the nearest enemy as the origin).
    if ((!target || target.state === "dead") && unit.castTicks <= 0) {
      transitionTo(unit, "idle");
      continue;
    }

    const allies = alive.filter(
      (a) => a.team === unit.team && a.uid !== unit.uid
    );

    const abilityCtx: AbilityContext = {
      unit,
      unitsByUid: byUid,
      enemies,
      allies,
      dealDamage,
      heal,
      spawnProjectile: (p) => spawnProjectile(state, p),
      spawnVfx: (v) => spawnVfx(state, v),
      spawnUnit: (defId, team, pos) => pendingSpawns.push({ defId, team, pos }),
      spawnFloatingText: (u, v, k) => spawnFloatingText(state, u, v, k),
    };
    const abilityKit = getKit(unit.defId);

    // Druid Rejuvenation: an instant HoT on the most-wounded nearby ally (incl.
    // itself), on its own cooldown. Works in bear form too. Instant, so it never
    // uses the cast bar — but it won't fire mid-summon-cast.
    if (
      unit.defId === "summoner" &&
      unit.castTicks <= 0 &&
      unit.rejuvCooldown <= 0 &&
      !isStunned(unit) &&
      !isSilenced(unit)
    ) {
      if (applyRejuvenation(abilityCtx)) {
        unit.rejuvCooldown = abilityCooldownTicks("rejuvenation");
      }
    }

    // Cast handling. An in-flight cast (the cast bar) ticks down and fires its
    // spell on completion, locking the mage meanwhile. Otherwise, begin a
    // cast-time ability (the mages) or fire an instant one (taunt, mend, charge,
    // kiting leap, summon, …) — kiting leap can interrupt the approach.
    if (unit.defId === "necromancer") {
      // Necromancer runs its own cast logic (Curse / Terrify) — see above.
      if (stepNecromancerCast(state, abilityCtx)) continue;
    } else if (unit.castTicks > 0) {
      unit.castTicks--;
      if (unit.castTicks <= 0) {
        // [seam] kit fires the completed cast's effect; else the old dispatch.
        if (abilityKit?.fireAbility) abilityKit.fireAbility(abilityCtx);
        else fireCastAbility(abilityCtx); // the spell goes off
        unit.castTicksMax = 0;
        unit.castTargetUid = null;
      } else {
        transitionTo(unit, "casting"); // locked in place, committed
        continue;
      }
    } else if (unit.abilityCooldown <= 0) {
      const castTime = abilityCastTimeTicks(unit.ability);
      if (castTime > 0) {
        // Begin a cast. A stun/silence blocks the start, and some casts (Mend)
        // only begin when they have a reason to — so the Cleric doesn't freeze
        // mid-field winding up a heal with no wounded ally to land it on.
        // [seam] the kit's wantsToCast overrides the old one when present.
        const wants = abilityKit?.wantsToCast
          ? abilityKit.wantsToCast(abilityCtx)
          : wantsToCast(abilityCtx);
        if (!isStunned(unit) && !isSilenced(unit) && wants) {
          unit.castTicks = castTime;
          unit.castTicksMax = castTime;
          unit.castTargetUid = target ? target.uid : null;
          unit.abilityCooldown = abilityCooldownTicks(unit.ability);
          transitionTo(unit, "casting");
          continue;
        }
      } else {
        // [seam] instant cast: the kit fires the effect (has-an-active-cast <=>
        // fireAbility defined), gated on stun/silence like tryCastAbility; else
        // the old dispatch handles gating internally.
        const fired = abilityKit?.fireAbility
          ? !isStunned(unit) && !isSilenced(unit) && abilityKit.fireAbility(abilityCtx)
          : tryCastAbility(abilityCtx);
        if (fired) unit.abilityCooldown = abilityCooldownTicks(unit.ability);
      }
    }

    // A unit that just finished a cast may have lost its target (it died during
    // the cast). With nothing to attack, idle out the rest of the tick.
    if (!target || target.state === "dead") {
      transitionTo(unit, "idle");
      continue;
    }

    const reach = unit.range + unit.radius;
    const d = dist(unit.pos, target.pos);

    if (d <= reach) {
      // In range: attack if off cooldown.
      transitionTo(unit, "attacking");
      unit.facing = target.pos.x >= unit.pos.x ? 1 : -1;
      if (unit.attackCooldown <= 0) {
        performBasicAttack(state, unit, target, byUid, dealDamage, heal, abilityCtx);
        const delay = unit.attackSpeed * attackDelayMultiplier(unit);
        unit.attackCooldown = secToTicks(delay);
      }
    } else {
      transitionTo(unit, "moving");
    }
  }

  // Flush summons created this tick into the live unit list. Respect a hard
  // per-team cap so a summoner can't flood the board past the performance
  // ceiling (keeps active units bounded for 60fps on mobile). Slime clones get
  // a slightly higher ceiling so a splitting slime isn't fully blocked.
  const allSpawns = [...pendingSpawns, ...state.damageSpawns];
  state.damageSpawns = [];
  for (const spawn of allSpawns) {
    // Summon headroom rides on the side's concurrent cap: Arena (cap 2) keeps
    // its proven 5/7 ceiling; The Depths' bigger caps scale it up so summoners
    // aren't starved on a fuller field.
    const isClone = spawn.defId === "slime_clone";
    const cap = state.activeCaps[spawn.team] + (isClone ? 5 : 3);
    const teamCount = state.units.filter(
      (u) => u.team === spawn.team && u.state !== "dead"
    ).length;
    if (teamCount >= cap) continue;
    const summoned = createUnit(spawn.defId, spawn.team, spawn.pos);
    state.units.push(summoned);
    byUid.set(summoned.uid, summoned);
  }

  // 5a. Movement + collisions.
  stepMovement({ units: state.units, unitsByUid: byUid });

  // 5a-ii. Scatter Traps: an enemy of the trap's owner that has stepped onto it is
  // caught (stunned) and the trap is spent. Checked after movement so it fires the
  // moment a foe walks in.
  if (state.traps.length > 0) {
    for (let i = state.traps.length - 1; i >= 0; i--) {
      const trap = state.traps[i];
      for (const u of state.units) {
        if (u.state === "dead" || u.team === trap.team) continue;
        if (dist(u.pos, trap) <= TRAP_RADIUS) {
          applyEffect(
            u,
            makeEffect("stun", { source: "trap", durationSec: TRAP_STUN_SEC })
          );
          spawnVfx(state, {
            kind: "slam",
            pos: { x: trap.x, y: trap.y },
            life: secToTicks(0.4),
            maxLife: secToTicks(0.4),
            color: "#9ca3af",
          });
          state.traps.splice(i, 1);
          break; // trap consumed
        }
      }
    }
  }

  // 5b. Projectiles.
  stepProjectiles(state, byUid, dealDamage);

  // 5c. Floating texts / vfx decay.
  for (const ft of state.floatingTexts) ft.life--;
  state.floatingTexts = state.floatingTexts.filter((f) => f.life > 0);
  for (const v of state.vfx) v.life--;
  state.vfx = state.vfx.filter((v) => v.life > 0);

  // 6. Animation (presentation only).
  stepAnimation(state.units);

  // 7. Win/loss.
  evaluateOutcome(state);
}

function performBasicAttack(
  state: SimState,
  unit: Unit,
  target: Unit,
  _byUid: Map<string, Unit>,
  dealDamage: (t: Unit, amt: number, s: Unit) => void,
  heal: (t: Unit, amt: number) => void,
  ctx: KitCtx
): void {
  const def = getUnitDef(unit.defId);
  const kit = getKit(unit.defId);
  // Use the LIVE range, not the static def — the Druid's bear form drops its range
  // to melee, so it should swing, not fire a projectile.
  const ranged = unit.range > 80;

  // [seam] before the swing resolves (open contract 2 — Assassin Ambush).
  if (kit?.onBeforeAttack) kit.onBeforeAttack(unit, target, ctx);

  // Assassin Ambush: the first strike out of opening stealth stuns the victim for
  // 3s and reveals the assassin. One-time (ambushReady) so a later re-stealth
  // (e.g. Vanish) never re-triggers it.
  if (unit.ambushReady) {
    unit.ambushReady = false;
    unit.effects = unit.effects.filter((e) => e.type !== "stealth");
    applyEffect(target, makeEffect("stun", { source: unit.uid, durationSec: 3 }));
    spawnVfx(state, {
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: def.accent,
    });
  }

  // Rogue & Trickster reveal on a strike (stripping is a no-op once revealed). The
  // Trickster also (re)starts its re-cloak timer, so it slips back into stealth a
  // beat after it stops swinging.
  if (unit.defId === "rogue" || unit.defId === "trickster") {
    unit.effects = unit.effects.filter((e) => e.type !== "stealth");
    if (unit.defId === "trickster") unit.recloakTimer = secToTicks(TRICKSTER_RECLOAK_SEC);
  }

  unit.attackCount += 1;
  // Ice Mage: every second basic attack freezes the target (2s stun).
  const freezeThisHit =
    unit.defId === "ice_mage" && unit.attackCount % 2 === 0;
  // Fire Mage: every third basic attack sets the target ablaze (Burn).
  const burnThisHit =
    unit.defId === "fire_mage" && unit.attackCount % 3 === 0;

  // [seam] replace the default swing entirely (open contract 2 — Mystic / Ranger /
  // Warrior do their own thing). attackCount is already bumped, matching today.
  if (kit?.onBasicAttack && kit.onBasicAttack(unit, target, ctx)) return;

  // Mystic Archer fires a form-tagged shot; stacking/detonation resolves on hit.
  if (unit.defId === "mystic_archer") {
    spawnProjectile(state, {
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 400,
      damage: unit.damage,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "mystic_shift", // resolved specially on impact
      color: unit.mysticForm === "light" ? "#fcd34d" : "#7c3aed",
      angle: 0,
    });
    return;
  }

  // Ranger Multishot: every second shot looses three arrows at once, each locked
  // onto a different enemy in range (the committed target plus the two nearest
  // others). Against a lone foe only one arrow finds a mark, so it's an anti-swarm
  // spread rather than extra single-target burst. Extra targets are picked nearest-
  // first with a uid tiebreak so the volley is deterministic.
  if (unit.defId === "ranger") {
    const shots: Unit[] = [target];
    if (unit.attackCount % 2 === 0) {
      const extras = state.units
        .filter(
          (e) =>
            e.team !== unit.team &&
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
      spawnProjectile(state, {
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
    return;
  }

  // (The Arcane Mage has no special basic attack — it uses the default ranged
  // shot below, and nukes with its active Arcane Barrage on cooldown.)

  if (ranged) {
    // Ranged basic attacks spawn a simple projectile (archer arrows etc.).
    spawnProjectile(state, {
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 380,
      damage: unit.damage,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "lifesteal", // sentinel: "basic"; no on-hit status
      color: freezeThisHit ? "#bae6fd" : burnThisHit ? "#fb923c" : def.accent,
      angle: 0,
      onHitStunSec: freezeThisHit ? 2 : undefined,
      onHitBurn: burnThisHit || undefined,
    });
  } else if (unit.defId === "warrior") {
    // Whirlwind: the Warrior spins its claymore instead of a single swing —
    // striking every enemy within melee reach for its damage and leaving a
    // refreshing bleed (poison-type DoT) on each. Anti-swarm melee; no lifesteal.
    const reach = unit.range + unit.radius;
    for (const e of state.units) {
      if (e.team === unit.team || e.state === "dead") continue;
      if (dist(unit.pos, e.pos) <= reach) {
        dealDamage(e, unit.damage, unit);
        applyEffect(
          e,
          makeEffect("poison", {
            source: unit.uid,
            durationSec: 2,
            damagePerTick: 3,
            tickIntervalSec: 0.5,
          })
        );
      }
    }
    spawnVfx(state, {
      kind: "slam",
      pos: { x: unit.pos.x, y: unit.pos.y },
      life: secToTicks(0.4),
      maxLife: secToTicks(0.4),
      color: def.accent,
    });
  } else {
    dealDamage(target, unit.damage, unit);
    applyLifesteal(unit, unit.damage, heal);

    // [seam] after the default melee swing lands (open contract 2). Zombie
    // Shambler's Numbing Bite now lives in its kit (kits/zombieShambler.ts);
    // Venom / Cleave / Backlash migrate here next.
    if (kit?.onAfterAttack) kit.onAfterAttack(unit, target, ctx);

    // Rogue Venom: every strike envenoms the target. A short, fast-ticking poison
    // (refreshed each hit via applyEffect, never stacked) so it keeps damaging even
    // between the Rogue's quick swings.
    if (unit.defId === "rogue") {
      applyEffect(
        target,
        makeEffect("poison", {
          source: unit.uid,
          durationSec: 3,
          damagePerTick: 3,
          tickIntervalSec: 0.5,
        })
      );
    }

    // Berserker Cleave: the same swing also strikes every other enemy within
    // melee reach, so it carves through a crowd.
    if (unit.defId === "berserker") {
      const reach = unit.range + unit.radius;
      for (const e of state.units) {
        if (e === target || e.team === unit.team || e.state === "dead") continue;
        if (dist(unit.pos, e.pos) <= reach) {
          dealDamage(e, unit.damage, unit);
        }
      }
      spawnVfx(state, {
        kind: "slam",
        pos: { x: unit.pos.x, y: unit.pos.y },
        life: secToTicks(0.3),
        maxLife: secToTicks(0.3),
        color: def.accent,
      });
    }

    // Aegis Knight Backlash: a full magic shield discharges as an area burst on
    // the next swing, spending the shield.
    if (unit.defId === "aegis_knight" && unit.shieldHp >= AEGIS_SHIELD_CAP) {
      const burst = Math.min(55, Math.round(unit.shieldHp * 0.5));
      unit.shieldHp = 0;
      unit.shieldHpMax = 0;
      for (const e of state.units) {
        if (e.team === unit.team || e.state === "dead") continue;
        if (dist(unit.pos, e.pos) <= 100) dealDamage(e, burst, unit);
      }
      spawnVfx(state, {
        kind: "slam",
        pos: { x: unit.pos.x, y: unit.pos.y },
        life: secToTicks(0.5),
        maxLife: secToTicks(0.5),
        color: def.accent,
      });
    }
  }
}

// Mystic Archer's on-hit resolution. Light form marks a single target; at 3
// light stacks that target detonates and the archer flips to Dark. Dark form
// chains to all enemies in a radius, stacking darkness on each; when any reaches
// 3 dark stacks it detonates and the archer flips back to Light.
function resolveMysticHit(
  state: SimState,
  archer: Unit,
  target: Unit,
  damage: number,
  dealDamage: (t: Unit, amt: number, s: Unit) => void
): void {
  const accent = getUnitDef(archer.defId).accent;
  const DETONATE = 28; // burst damage when 3 stacks pop

  if (archer.mysticForm === "light") {
    // Single-target hit + light stack.
    dealDamage(target, damage, archer);
    if (target.state === "dead") return;
    target.lightStacks += 1;
    spawnVfx(state, {
      kind: "slam",
      pos: { x: target.pos.x, y: target.pos.y - 4 },
      life: secToTicks(0.25),
      maxLife: secToTicks(0.25),
      color: "#fcd34d",
    });
    if (target.lightStacks >= 3) {
      // Detonate this target, clear its light stacks, flip to Dark.
      dealDamage(target, DETONATE, archer);
      target.lightStacks = 0;
      archer.mysticForm = "dark";
      archer.momentumStacks = Math.min(5, archer.momentumStacks + 1); // +15% atk speed/shift

      spawnVfx(state, {
        kind: "death",
        pos: { x: target.pos.x, y: target.pos.y },
        life: secToTicks(0.5),
        maxLife: secToTicks(0.5),
        color: "#fde68a",
      });
    }
  } else {
    // Dark form: chain to all enemies in a radius around the primary target.
    const CHAIN_RADIUS = 130;
    dealDamage(target, damage, archer);
    let flipped = false;
    for (const e of state.units) {
      if (e.state === "dead" || e.team === archer.team) continue;
      if (dist(target.pos, e.pos) > CHAIN_RADIUS) continue;
      // Chain damage to secondary targets (primary already took the hit).
      if (e.uid !== target.uid) dealDamage(e, Math.round(damage * 0.6), archer);
      if (e.hp <= 0) continue; // may have died from the chain hit
      e.darkStacks += 1;
      spawnVfx(state, {
        kind: "frost",
        pos: { x: e.pos.x, y: e.pos.y - 4 },
        life: secToTicks(0.25),
        maxLife: secToTicks(0.25),
        color: "#7c3aed",
      });
      if (e.darkStacks >= 3) {
        dealDamage(e, DETONATE, archer);
        e.darkStacks = 0;
        flipped = true;
        spawnVfx(state, {
          kind: "death",
          pos: { x: e.pos.x, y: e.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: "#a78bfa",
        });
      }
    }
    if (flipped) {
      archer.mysticForm = "light";
      archer.momentumStacks = Math.min(5, archer.momentumStacks + 1); // +15% atk speed/shift
    }
  }
}

function stepProjectiles(
  state: SimState,
  byUid: Map<string, Unit>,
  dealDamage: (t: Unit, amt: number, s: Unit) => void
): void {
  for (const proj of state.projectiles) {
    if (!proj.alive) continue;
    const target = byUid.get(proj.targetUid);

    // Home toward live target; if dead, fly to last known point and fizzle.
    const aim = target && target.state !== "dead" ? target.pos : proj.target;
    const dx = aim.x - proj.pos.x;
    const dy = aim.y - proj.pos.y;
    const len = Math.hypot(dx, dy);
    const step = proj.speed * SEC_PER_TICK;
    proj.angle = Math.atan2(dy, dx);

    if (len <= step || len === 0) {
      // Impact.
      if (target && target.state !== "dead") {
        const source = byUid.get(proj.sourceUid);
        const isBasic =
          proj.ability === "lifesteal"; // sentinel for basic ranged shot
        const isMystic = proj.ability === "mystic_shift";
        if (isMystic) {
          if (source) resolveMysticHit(state, source, target, proj.damage, dealDamage);
        } else if (isBasic) {
          if (source) dealDamage(target, proj.damage, source);
          // Ice Mage every-second-attack freeze.
          if (proj.onHitStunSec) {
            applyEffect(
              target,
              makeEffect("stun", {
                source: proj.sourceUid,
                durationSec: proj.onHitStunSec,
              })
            );
            spawnVfx(state, {
              kind: "frost",
              pos: { x: target.pos.x, y: target.pos.y },
              life: secToTicks(0.4),
              maxLife: secToTicks(0.4),
              color: "#bae6fd",
            });
          }
          // Fire Mage every-third-attack burn.
          if (proj.onHitBurn) {
            applyEffect(
              target,
              makeEffect("burn", {
                source: proj.sourceUid,
                durationSec: 3,
                damagePerTick: 7,
                tickIntervalSec: 1,
              })
            );
            spawnVfx(state, {
              kind: "burn_burst",
              pos: { x: target.pos.x, y: target.pos.y },
              life: secToTicks(0.4),
              maxLife: secToTicks(0.4),
              color: "#fb923c",
            });
          }
        } else {
          onProjectileHit(proj, target, source, {
            dealDamage,
            spawnVfx: (v) => spawnVfx(state, v),
          });
        }
      }
      proj.alive = false;
    } else {
      proj.pos.x += (dx / len) * step;
      proj.pos.y += (dy / len) * step;
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
}

// ---------------------------------------------------------------------------
// Outcome / timeout resolution
// ---------------------------------------------------------------------------

function teamAlive(state: SimState, team: Team): Unit[] {
  return state.units.filter((u) => u.team === team && u.state !== "dead");
}

function evaluateOutcome(state: SimState): void {
  const players = teamAlive(state, "player");
  const enemies = teamAlive(state, "enemy");

  // A side is only "out" when it has no units on the field AND no reserves
  // left to deploy. This prevents an instant loss when your last active unit
  // dies but you still have cards in hand (they auto-deploy next tick).
  const playerOut = players.length === 0 && state.playerReserves <= 0;
  const enemyOut = enemies.length === 0 && state.enemyReserves <= 0;

  if (playerOut && enemyOut) {
    state.phase = "draw";
    return;
  }
  if (enemyOut) {
    state.phase = "victory";
    return;
  }
  if (playerOut) {
    state.phase = "defeat";
    return;
  }

  if (state.clockTicks <= 0) {
    // Timeout: most survivors, then highest total HP, else draw.
    if (players.length !== enemies.length) {
      state.phase = players.length > enemies.length ? "victory" : "defeat";
      return;
    }
    const phpTotal = players.reduce((s, u) => s + u.hp, 0);
    const ehpTotal = enemies.reduce((s, u) => s + u.hp, 0);
    if (phpTotal === ehpTotal) state.phase = "draw";
    else state.phase = phpTotal > ehpTotal ? "victory" : "defeat";
  }
}

// ---------------------------------------------------------------------------
// Snapshot for the renderer (cheap shallow copy of arrays).
// ---------------------------------------------------------------------------

export function snapshot(state: SimState): BattleSnapshot {
  return {
    tick: state.tick,
    phase: state.phase,
    units: state.units,
    projectiles: state.projectiles,
    floatingTexts: state.floatingTexts,
    vfx: state.vfx,
    traps: state.traps,
    clockTicks: state.clockTicks,
  };
}
