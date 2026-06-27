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
  applyLifesteal,
  fireCastAbility,
  onProjectileHit,
  tryCastAbility,
  type AbilityContext,
} from "./AbilitySystem";
import { stepMovement } from "./MovementSystem";
import { updateTarget } from "./TargetingSystem";
import {
  applyEffect,
  attackDelayMultiplier,
  hasEffect,
  isFeared,
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
  clockTicks: number;
  rng: RNG;
  idCounter: number;
  /** Reserve cards still deployable per side. Set by MatchController each tick.
   *  A side only loses when its board is empty AND it has no reserves left. */
  playerReserves: number;
  enemyReserves: number;
  /** Recent corpses (death position + tick), for Necromancer's Raise Dead.
   *  Pruned after a few seconds so only fresh corpses can be raised. */
  corpses: { x: number; y: number; tick: number }[];
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
    clockTicks: secToTicks(clockSec),
    rng: new RNG(seed),
    idCounter: 0,
    playerReserves: 0,
    enemyReserves: 0,
    corpses: [],
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

function makeDamageDealer(state: SimState) {
  return function dealDamage(target: Unit, amount: number, source: Unit): void {
    if (target.state === "dead") return;

    // Shield fully blocks a single hit.
    if (tryConsumeShield(target)) {
      spawnFloatingText(state, target, "Block", "heal");
      target.hitFlash = HIT_FLASH_TICKS;
      return;
    }

    // Aegis Knight soaks magic: most of a magic hit is banked as overhealth
    // shield (applied after, so it doesn't absorb this same hit) — only a sliver
    // leaks through as HP damage.
    let effAmount = amount;
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

    // Slime Split: the ORIGINAL slime spawns a weaker clone each time its health
    // crosses a 25% threshold (at 75%, 50%, 25% remaining → up to 3 clones).
    // Clones (defId "slime_clone") are terminal and never split.
    if (target.defId === "slime" && target.hp > 0) {
      // How many 25% thresholds have been crossed so far.
      const thresholdsCrossed = Math.floor((1 - target.hp / target.maxHp) / 0.25);
      const wantSplits = Math.min(3, thresholdsCrossed);
      while (target.splitsSpawned < wantSplits) {
        target.splitsSpawned++;
        const side = target.splitsSpawned % 2 === 0 ? 1 : -1;
        state.damageSpawns.push({
          defId: "slime_clone",
          team: target.team,
          pos: {
            x: target.pos.x + side * 30,
            y: target.pos.y + 20,
          },
        });
        spawnVfx(state, {
          kind: "frost",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.3),
          maxLife: secToTicks(0.3),
          color: getUnitDef(target.defId).accent,
        });
      }
    }

    // Ogre Second Wind: the first time a hit drops it to/below 25% HP (even a
    // lethal one), it surges back to full instead. Once per match. A tank that
    // refuses to fall the first time.
    if (
      target.defId === "ogre" &&
      !target.secondWindUsed &&
      target.hp <= target.maxHp * 0.25
    ) {
      target.secondWindUsed = true;
      target.hp = target.maxHp;
      spawnFloatingText(state, target, "Second Wind!", "heal");
      spawnVfx(state, {
        kind: "shield_pop",
        pos: { x: target.pos.x, y: target.pos.y - 4 },
        life: secToTicks(0.7),
        maxLife: secToTicks(0.7),
        color: "#fbbf24",
      });
      return; // survived this blow at full HP
    }

    if (target.hp <= 0) {
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
      } else {
        transitionTo(target, "dead");
        target.targetUid = null;
        // Record a corpse (skeletons/wolves don't leave raisable corpses).
        if (
          target.defId !== "skeleton" &&
          target.defId !== "wolf" &&
          target.defId !== "turret"
        ) {
          state.corpses.push({
            x: target.pos.x,
            y: target.pos.y,
            tick: state.tick,
          });
        }
        spawnVfx(state, {
          kind: "death",
          pos: { x: target.pos.x, y: target.pos.y },
          life: secToTicks(0.5),
          maxLife: secToTicks(0.5),
          color: getUnitDef(target.defId).color,
        });

        // Slime death-burst: any slime (original or clone) explodes on death,
        // dealing AoE damage to nearby ENEMIES. Chain reactions are intentional
        // and safe — a unit only dies (and thus explodes) once.
        if (target.defId === "slime" || target.defId === "slime_clone") {
          const BURST_RADIUS = 90;
          const BURST_DMG = target.defId === "slime" ? 40 : 20;
          for (const u of state.units) {
            if (u.state === "dead" || u.team === target.team) continue;
            if (dist(target.pos, u.pos) <= BURST_RADIUS) {
              dealDamage(u, BURST_DMG, target);
            }
          }
          spawnVfx(state, {
            kind: "slam",
            pos: { x: target.pos.x, y: target.pos.y },
            life: secToTicks(0.45),
            maxLife: secToTicks(0.45),
            color: getUnitDef(target.defId).accent,
          });
        }
      }
    }
  };
}

function makeHealer(state: SimState) {
  return function heal(target: Unit, amount: number): void {
    if (target.state === "dead" || amount <= 0) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + Math.round(amount));
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

// Druid -> Bear. One-way shapeshift: melee bruiser that takes only 20% damage
// (80% reduction — intentionally dominant per design choice).
function transformDruid(state: SimState, unit: Unit): void {
  unit.transformed = true;
  unit.range = 48; // melee
  unit.damage = 26; // bigger claws
  unit.attackSpeed = 1.1; // faster than caster form
  unit.moveSpeed = 78; // charges in
  unit.damageTakenMult = 0.2; // thick hide — takes only 20% damage (80% reduction)
  unit.abilityCooldown = 99999; // stop summoning while a bear
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

  const contact = unit.radius + target.radius - 6;
  const d = dist(unit.pos, target.pos);

  if (d <= contact) {
    // Arrived — slam for bonus damage and a short stagger.
    dealDamage(target, 22, unit);
    applyEffect(
      target,
      makeEffect("stun", { source: unit.uid, durationSec: 0.8 })
    );
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

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

export function stepSimulation(state: SimState): void {
  if (state.phase !== "battle") return;
  state.tick++;
  state.clockTicks = Math.max(0, state.clockTicks - 1);

  const living = state.units.filter((u) => u.state !== "dead");
  const byUid = new Map(state.units.map((u) => [u.uid, u]));

  const dealDamage = makeDamageDealer(state);
  const heal = makeHealer(state);

  // 1. Status effect timers + DoT.
  const dots = tickEffects(living);
  for (const { unit, damage } of dots) {
    const src = unit.effects.find((e) => e.type === "burn" || e.type === "poison");
    const source = src ? byUid.get(src.source) ?? unit : unit;
    dealDamage(unit, damage, source);
  }

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

  // 2 & 3 & 4. Per-unit AI / state machine.
  // Units summoned this tick are queued and added after the loop, so we never
  // mutate the array we're iterating.
  const pendingSpawns: {
    defId: string;
    team: Unit["team"];
    pos: { x: number; y: number };
  }[] = [];
  for (const unit of alive) {
    // Cooldowns always tick down.
    if (unit.attackCooldown > 0) unit.attackCooldown--;
    if (unit.abilityCooldown > 0) unit.abilityCooldown--;
    if (unit.blinkCooldown > 0) unit.blinkCooldown--;

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

    // A spell cast in progress (the cast bar) is interrupted by a stun or fear —
    // the spell fizzles. Runs before the stun check so the stun can cancel it;
    // the cast's tick-down + release happens after targeting (see below).
    if (unit.castTicks > 0 && (isStunned(unit) || isFeared(unit))) {
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

    // Orc Charge: while a rush is in progress it owns movement until contact.
    if (unit.chargeTicks > 0) {
      stepCharge(state, unit, byUid, dealDamage);
      continue;
    }

    const enemies = alive.filter((e) => e.team !== unit.team);
    updateTarget(unit, byUid, enemies);

    // Arcane Mage: Blink away from a closing melee threat (own cooldown, so it's
    // independent of the passive ability slot). Just repositions; the rest of the
    // tick (movement/kiting) resumes from the new spot.
    if (unit.defId === "arcane_mage" && unit.blinkCooldown <= 0) {
      if (tryBlink(state, unit, enemies)) {
        unit.blinkCooldown = secToTicks(5);
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
      claimCorpse: () => {
        // Nearest recent corpse to the caster; remove it so it's used once.
        if (state.corpses.length === 0) return null;
        let bestIdx = -1;
        let bestD = Infinity;
        for (let i = 0; i < state.corpses.length; i++) {
          const c = state.corpses[i];
          const d = (c.x - unit.pos.x) ** 2 + (c.y - unit.pos.y) ** 2;
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) return null;
        const c = state.corpses[bestIdx];
        state.corpses.splice(bestIdx, 1);
        return { x: c.x, y: c.y };
      },
    };

    // Cast handling. An in-flight cast (the cast bar) ticks down and fires its
    // spell on completion, locking the mage meanwhile. Otherwise, begin a
    // cast-time ability (the mages) or fire an instant one (taunt, mend, charge,
    // kiting leap, summon, …) — kiting leap can interrupt the approach.
    if (unit.castTicks > 0) {
      unit.castTicks--;
      if (unit.castTicks <= 0) {
        fireCastAbility(abilityCtx); // the spell goes off
        unit.castTicksMax = 0;
        unit.castTargetUid = null;
      } else {
        transitionTo(unit, "casting"); // locked in place, committed
        continue;
      }
    } else if (unit.abilityCooldown <= 0) {
      const castTime = abilityCastTimeTicks(unit.ability);
      if (castTime > 0) {
        // Begin a cast. Target is valid here; a stun/silence blocks the start.
        if (!isStunned(unit) && !isSilenced(unit)) {
          unit.castTicks = castTime;
          unit.castTicksMax = castTime;
          unit.castTargetUid = target ? target.uid : null;
          unit.abilityCooldown = abilityCooldownTicks(unit.ability);
          transitionTo(unit, "casting");
          continue;
        }
      } else {
        const fired = tryCastAbility(abilityCtx);
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
        performBasicAttack(state, unit, target, byUid, dealDamage, heal);
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
    const isClone = spawn.defId === "slime_clone";
    const cap = isClone ? 7 : 5;
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

  // 5b. Projectiles.
  stepProjectiles(state, byUid, dealDamage);

  // 5c. Floating texts / vfx decay.
  for (const ft of state.floatingTexts) ft.life--;
  state.floatingTexts = state.floatingTexts.filter((f) => f.life > 0);
  for (const v of state.vfx) v.life--;
  state.vfx = state.vfx.filter((v) => v.life > 0);

  // Prune corpses older than ~8s so only fresh ones can be raised.
  const corpseTtl = secToTicks(8);
  state.corpses = state.corpses.filter((c) => state.tick - c.tick <= corpseTtl);

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
  heal: (t: Unit, amt: number) => void
): void {
  const def = getUnitDef(unit.defId);
  const ranged = def.range > 80;

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

  unit.attackCount += 1;
  // Ice Mage: every second basic attack freezes the target (2s stun).
  const freezeThisHit =
    unit.defId === "ice_mage" && unit.attackCount % 2 === 0;
  // Fire Mage: every third basic attack sets the target ablaze (Burn).
  const burnThisHit =
    unit.defId === "fire_mage" && unit.attackCount % 3 === 0;

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
  } else {
    dealDamage(target, unit.damage, unit);
    applyLifesteal(unit, unit.damage, heal);

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
    clockTicks: state.clockTicks,
  };
}
