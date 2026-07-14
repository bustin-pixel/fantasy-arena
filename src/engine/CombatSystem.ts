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
  ItemEffect,
  MatchPhase,
  Projectile,
  ShotRider,
  Team,
  Trap,
  Unit,
  Vec2,
  Vfx,
  WaveBanner,
} from "@/types";
import { RNG } from "@/utils/rng";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FLOAT_TEXT_TICKS,
  HIT_FLASH_TICKS,
  MAX_ACTIVE_UNITS_PER_SIDE,
  MAX_EFFECTS,
  MAX_PROJECTILES,
  SEC_PER_TICK,
  secToTicks,
} from "@/utils/constants";
import { clamp, dir, dist } from "@/utils/math";
import { getUnitDef } from "@/data/units";
import { EXECUTE_THRESHOLD } from "@/data/boons";
import { createUnit, type ItemCarry } from "@/entities/createUnit";
import {
  abilityCastTimeTicks,
  abilityCooldownTicks,
  applyLifesteal,
  onProjectileHit,
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
  isStunned,
  makeEffect,
  tickEffects,
  tryConsumeShield,
} from "./StatusEffectSystem";
import { stepAnimation } from "./AnimationSystem";

/** Team-wide combat multipliers, read at the funnel sites. Identity by default
 *  (all 1s / lifesteal 0) so Arena/Depths are unaffected; Endless mode's boons
 *  fold into the player's set. Reading these at the funnels (rather than mutating
 *  per-unit stats) means the mods survive kits that recompute stats every tick and
 *  cover summoned units for free. */
/** An every-Nth-attack status rider granted by a boon (Thunderclap stun, Venom
 *  poison). Applied to the target in performBasicAttack. */
export interface TeamRider {
  effectType: import("@/types").StatusEffectType;
  everyNth: number;
  durationSec: number;
  magnitude?: number;
  damagePerTick?: number;
  tickIntervalSec?: number;
}

export interface TeamMods {
  /** Outgoing damage multiplier. */
  dmgMult: number;
  /** Attack-cooldown multiplier (<1 = faster attacks). */
  atkDelayMult: number;
  /** Move-speed multiplier. */
  moveSpeedMult: number;
  /** Incoming damage multiplier (<1 = takes less). */
  damageTakenMult: number;
  /** Additive lifesteal fraction on top of a unit's own (melee). */
  lifestealBonus: number;
  // --- proc / mechanic mods (Endless slice-2 boons; all identity by default) ---
  /** Executioner: +frac damage vs enemies below EXECUTE_THRESHOLD. */
  executeBonus: number;
  /** Thornmail: reflect this fraction of incoming damage at the attacker. */
  thornsFrac: number;
  /** Bloodfeast: heal the whole team this many HP per kill. */
  killHeal: number;
  /** Bounty Hunter: killer gains this much permanent max HP per kill. */
  bountyHp: number;
  /** Overheal Ward: overheal banks as shield. */
  overheal: boolean;
  /** Last Breath: once-per-wave cheat death (consumes unit.cheatDeathReady). */
  lastBreath: boolean;
  /** Overkill: every Nth attack deals double (0 = off). */
  critEveryNth: number;
  /** Marksman's Focus: ranged basics lifesteal this fraction. */
  rangedLifesteal: number;
  /** Berserker's Rhythm: live attack-speed bonus, ramped by the controller. */
  rhythmBonus: number;
  /** Thunderclap / Venom Coating on-hit riders. */
  onHitRiders: TeamRider[];
}

export function identityTeamMods(): TeamMods {
  return {
    dmgMult: 1,
    atkDelayMult: 1,
    moveSpeedMult: 1,
    damageTakenMult: 1,
    lifestealBonus: 0,
    executeBonus: 0,
    thornsFrac: 0,
    killHeal: 0,
    bountyHp: 0,
    overheal: false,
    lastBreath: false,
    critEveryNth: 0,
    rangedLifesteal: 0,
    rhythmBonus: 0,
    onHitRiders: [],
  };
}

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
  /** Opening ability grace: ticks remaining during which units hold their active
   *  casts (they still move + basic-attack). MatchController arms this at battle
   *  start; a hand-built sim (tests, direct use) leaves it 0 = no grace. */
  castGraceTicks: number;
  /** Units queued to spawn from inside dealDamage (slime splits/clones).
   *  Flushed each tick alongside ability-driven summons. `init` stamps
   *  deterministic starting state on the created unit (Slime Knight blobs/rebirth). */
  damageSpawns: {
    defId: string;
    team: Team;
    pos: Vec2;
    /** Creator's level — summons inherit it (stats bake before `init` runs). */
    level?: number;
    /** Creator's carried equipment — rides INERT unless the spawn's defId is
     *  the gear's owner (Slime Knight rebirth). True summons never activate it. */
    items?: ItemCarry;
    /** Creator's Summoner's Sigil bonus — spawned units get +frac stats. */
    sigilPct?: number;
    init?: (u: Unit) => void;
  }[];
  /** Boss-floor telegraph banner (rare catalyst / boss incoming), or null. Set
   *  by the WaveController; surfaced to the HUD via the snapshot. */
  waveBanner: WaveBanner | null;
  /** Per-team combat multipliers (Endless boons fold into `player`; identity in
   *  Arena/Depths). Read at the damage / attack-speed / movement / lifesteal
   *  funnels. */
  teamMods: { player: TeamMods; enemy: TeamMods };
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
    castGraceTicks: 0,
    damageSpawns: [],
    waveBanner: null,
    teamMods: { player: identityTeamMods(), enemy: identityTeamMods() },
  };
}

function nextId(state: SimState, prefix: string): string {
  return `${prefix}${state.idCounter++}`;
}

// ---------------------------------------------------------------------------
// Item-effect helpers — per-unit equipment (unit.itemMods), the per-unit twin
// of TeamMods. Every read is `?.`-guarded so an unequipped unit costs nothing
// and an itemless sim stays byte-identical to pre-items builds.
// ---------------------------------------------------------------------------

/** Items' execute threshold (Soldier's Blade legendary): below 25% HP. */
const ITEM_EXECUTE_THRESHOLD = 0.25;

function findItemEffect<K extends ItemEffect["kind"]>(
  unit: Unit,
  kind: K
): Extract<ItemEffect, { kind: K }> | undefined {
  return unit.itemMods?.effects.find(
    (e): e is Extract<ItemEffect, { kind: K }> => e.kind === kind
  );
}

/** Pack Tactics (Alpha's Pelt legendary): bonus fraction per LIVING ally. */
function packTacticsFrac(state: SimState, unit: Unit): number {
  const pt = findItemEffect(unit, "packTactics");
  if (!pt) return 0;
  let allies = 0;
  for (const u of state.units) {
    if (u !== unit && u.team === unit.team && u.state !== "dead") allies++;
  }
  return pt.perAlly * allies;
}

/** Apply an item rider's status + impact vfx to a target (melee hits, item
 *  projectile riders, detonation novae all funnel through here). */
function applyItemRider(
  state: SimState,
  target: Unit,
  sourceUid: string,
  r: ShotRider
): void {
  applyEffect(
    target,
    makeEffect(r.effectType, {
      source: sourceUid,
      durationSec: r.durationSec,
      damagePerTick: r.damagePerTick,
      tickIntervalSec: r.tickIntervalSec,
      magnitude: r.magnitude,
    })
  );
  spawnVfx(state, {
    kind: r.vfxKind,
    pos: { x: target.pos.x, y: target.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: r.color,
  });
}

/** Per-tick equipment upkeep: Heartwood regen (through the heal funnel, once
 *  per second on the global clock) and the Runeward barrier re-form timer.
 *  Runs in the pre-gate maintenance slot, so it ticks even while stunned. */
function stepItemUpkeep(
  state: SimState,
  unit: Unit,
  heal: (t: Unit, amt: number) => void
): void {
  for (const e of unit.itemMods!.effects) {
    if (e.kind === "regen") {
      if (state.tick % secToTicks(1) === 0 && unit.hp < unit.maxHp) {
        const doubled = e.doubledBelowHalf && unit.hp < unit.maxHp / 2 ? 2 : 1;
        heal(
          unit,
          Math.max(1, Math.round((unit.maxHp * e.pctPerSec * doubled) / 100))
        );
      }
    } else if (e.kind === "runicBarrier") {
      if (unit.barrierCountdown == null || unit.barrierCountdown <= 0) {
        const amt = Math.round(unit.maxHp * e.frac);
        unit.shieldHp = Math.max(unit.shieldHp, amt);
        unit.shieldHpMax = Math.max(unit.shieldHpMax, unit.shieldHp);
        unit.barrierCountdown = secToTicks(e.intervalSec);
      } else {
        unit.barrierCountdown--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HP mutation helpers — the ONLY places hp changes.
// ---------------------------------------------------------------------------

function makeDamageDealer(
  state: SimState,
  makeKitCtx: (subject: Unit, damageContext?: boolean) => KitCtx,
  heal: (target: Unit, amount: number) => void
) {
  return function dealDamage(target: Unit, amount: number, source: Unit): void {
    if (target.state === "dead") return;

    const kit = getKit(target.defId);

    // [seam] kit full-negate veto: the target avoids the hit entirely and shows
    // its own text (Outlaw's 50% Slippery dodge; Killing Spree damage immunity).
    // Runs before shield/mitigation so a dodged blow costs nothing — no HP change,
    // no hit flash, no "-0". Identity for every unit without the hook (the guard
    // is false), so no other unit's digest moves.
    if (
      amount > 0 &&
      kit?.onWouldTakeDamage &&
      kit.onWouldTakeDamage(target, amount, source, makeKitCtx(target, true))
    ) {
      return;
    }

    // Shield fully blocks a single hit.
    if (tryConsumeShield(target)) {
      spawnFloatingText(state, target, "Block", "heal");
      target.hitFlash = HIT_FLASH_TICKS;
      return;
    }

    // [seam] kit incoming-damage modifier (open contract 1): reduce the hit before
    // HP is applied (Aegis magic soak → 0.25x). Identity while un-migrated; the
    // post-hit shield bank rides onDamaged below.
    let effAmount = amount;
    if (amount > 0 && kit?.modifyIncomingDamage) {
      effAmount = kit.modifyIncomingDamage(target, effAmount, source, makeKitCtx(target, true));
    }

    // Team-wide combat mods: the source's outgoing multiplier and the target's
    // incoming multiplier fold in alongside the unit's own damageTakenMult.
    // Identity (×1) in Arena/Depths, so those runs stay byte-identical.
    const srcMods = state.teamMods[source.team];
    // Executioner: bonus damage vs a target already below the execute threshold.
    const execMult =
      srcMods.executeBonus > 0 &&
      target.maxHp > 0 &&
      target.hp / target.maxHp < EXECUTE_THRESHOLD
        ? 1 + srcMods.executeBonus
        : 1;
    // Equipment mods, the per-unit twins: source-side execute / giant slayer /
    // pack tactics, target-side damage reduction / magic reduction / pack
    // tactics. Both stay exactly 1 for unequipped units.
    let itemMult = 1;
    const srcItems = source.itemMods;
    if (srcItems) {
      if (
        srcItems.executeBonus > 0 &&
        target.maxHp > 0 &&
        target.hp / target.maxHp < ITEM_EXECUTE_THRESHOLD
      ) {
        itemMult *= 1 + srcItems.executeBonus;
      }
      if (srcItems.giantSlayerPct > 0 && target.maxHp > source.maxHp) {
        itemMult *= 1 + srcItems.giantSlayerPct;
      }
      const pt = packTacticsFrac(state, source);
      if (pt > 0) itemMult *= 1 + pt;
    }
    let itemTakenMult = 1;
    const tgtItems = target.itemMods;
    if (tgtItems) {
      itemTakenMult *= tgtItems.damageTakenMult;
      if (
        tgtItems.magicTakenMult !== 1 &&
        getUnitDef(source.defId).school === "magic"
      ) {
        itemTakenMult *= tgtItems.magicTakenMult;
      }
      const pt = packTacticsFrac(state, target);
      if (pt > 0) itemTakenMult *= Math.max(0, 1 - pt);
    }
    const scaled =
      effAmount *
      srcMods.dmgMult *
      execMult *
      itemMult *
      target.damageTakenMult *
      state.teamMods[target.team].damageTakenMult *
      itemTakenMult;
    let dmg = Math.max(0, Math.round(scaled));
    const shown = dmg; // pre-absorb hit shown as the floating number

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
    spawnFloatingText(state, target, `-${shown}`, "damage");

    // [seam] kit post-hit reaction on a surviving target — gets the ORIGINAL
    // incoming amount (Slime split reads hp thresholds; the Aegis magic bank needs
    // the pre-mitigation hit). Slime split → kits/slime.ts; Aegis bank → aegisKnight.ts.
    if (kit?.onDamaged && target.hp > 0) {
      kit.onDamaged(target, amount, source, makeKitCtx(target, true));
    }

    // (Ogre Second Wind now lives in its kit — kits/ogre.ts. onDamaged catches a
    // non-lethal hit that crosses 25%; onWouldDie below catches the lethal one.)

    // Phasecloak (legendary): one-shot stealth the first time the wearer drops
    // below half HP. Timed, so it can't stalemate a last-unit-standing check.
    if (
      target.hp > 0 &&
      target.itemMods &&
      !target.stealthTriggerUsed &&
      target.hp < target.maxHp / 2
    ) {
      const cloak = findItemEffect(target, "stealthBelowHalf");
      if (cloak) {
        target.stealthTriggerUsed = true;
        applyEffect(
          target,
          makeEffect("stealth", {
            source: target.uid,
            durationSec: cloak.durationSec,
          })
        );
        spawnFloatingText(state, target, "Phase!", "heal");
      }
    }

    if (target.hp <= 0) {
      // [seam] kit death veto (open contract 3): runs BEFORE the generic
      // death_immune check, matching today's order. If the kit kept the unit
      // alive (Ogre Second Wind / Vanish / Last Stand), the hit is fully handled.
      if (kit?.onWouldDie && kit.onWouldDie(target, source, makeKitCtx(target, true))) {
        return;
      }
      // Last Breath boon (Endless): once per wave, a fatal blow leaves the unit at
      // 1 HP. Consumes the per-wave charge the controller refreshes.
      if (state.teamMods[target.team].lastBreath && target.cheatDeathReady) {
        target.cheatDeathReady = false;
        target.hp = 1;
        spawnFloatingText(state, target, "Last Breath!", "heal");
        return;
      }
      // Death-immunity window (e.g. Assassin's Vanish): clamp to 1 HP and survive.
      // (Vanish + Berserker Last Stand now live in their kits' onWouldDie, above.)
      if (hasEffect(target, "death_immune")) {
        target.hp = 1;
      } else {
        transitionTo(target, "dead");
        target.targetUid = null;

        // [seam] kit on-kill reaction on the KILLER (Berserker Bloodthirst now
        // lives in kits/berserker.ts onKill, healing through the funnel).
        const srcKit = getKit(source.defId);
        if (srcKit?.onKill && source !== target && source.state !== "dead") {
          srcKit.onKill(source, target, makeKitCtx(source, true));
        }

        // Team on-kill boons (Endless): Bounty Hunter grows the killer, Bloodfeast
        // heals the whole warband. Identity when both are 0.
        if (source !== target && source.state !== "dead") {
          const km = state.teamMods[source.team];
          if (km.bountyHp > 0) {
            source.maxHp += km.bountyHp;
            source.hp += km.bountyHp; // grow into the new max
          }
          if (km.killHeal > 0) {
            for (const ally of state.units) {
              if (ally.team === source.team && ally.state !== "dead") {
                heal(ally, km.killHeal);
              }
            }
          }
          // Equipment on-kill: Gravewhisper heals the killer, Quicksilver
          // grants a haste burst. Absent on unequipped units.
          if (source.itemMods) {
            if (source.itemMods.killHeal > 0) {
              heal(source, source.itemMods.killHeal);
            }
            const hok = findItemEffect(source, "hasteOnKill");
            if (hok) {
              applyEffect(
                source,
                makeEffect("haste", {
                  source: source.uid,
                  durationSec: hok.durationSec,
                  magnitude: hok.magnitude,
                })
              );
            }
          }
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

        // (Bloater Putrid Burst + Slime death-burst now live in their kits'
        // onDeath, fired by the onDeath seam above; both re-enter dealDamage via
        // ctx.dealDamage on the same-tick damage funnel.)

        // [seam] kit death OBSERVERS on every other living unit (Slime Knight
        // Absorb Bones). After the victim's onDeath so corpse bursts resolve
        // first; a unit killed BY that burst re-enters here with any dead
        // observers already skipped. Array order = uid order = deterministic.
        for (const watcher of state.units) {
          if (watcher.state === "dead" || watcher === target) continue;
          const wKit = getKit(watcher.defId);
          if (wKit?.onUnitDeath) {
            wKit.onUnitDeath(watcher, target, source, makeKitCtx(watcher, true));
          }
        }

        // Elemental detonations (legendary Ember/Frostbite/Venom): a victim
        // dying while afflicted by burn/slow/poison erupts if that status's
        // SOURCE wears the matching detonation trinket. Statuses merge per
        // type, so at most one detonation per element fires per corpse. The
        // rider lands before the nova damage, so a nova kill can chain-detonate
        // — bounded (each corpse detonates once) and deterministic.
        for (const eff of target.effects) {
          if (
            eff.type !== "burn" &&
            eff.type !== "slow" &&
            eff.type !== "poison"
          ) {
            continue;
          }
          const wearer = state.units.find((u) => u.uid === eff.source);
          if (!wearer || wearer.state === "dead") continue;
          const det = wearer.itemMods?.effects.find(
            (e): e is Extract<ItemEffect, { kind: "detonateOnDeath" }> =>
              e.kind === "detonateOnDeath" && e.element === eff.type
          );
          if (!det) continue;
          spawnVfx(state, {
            kind: eff.type === "slow" ? "frost" : "burn_burst",
            pos: { x: target.pos.x, y: target.pos.y },
            life: secToTicks(0.45),
            maxLife: secToTicks(0.45),
            color: det.vfxColor,
          });
          for (const foe of state.units) {
            if (
              foe.state === "dead" ||
              foe.team === wearer.team ||
              foe === target
            ) {
              continue;
            }
            if (dist(foe.pos, target.pos) > det.radius) continue;
            if (det.rider) applyItemRider(state, foe, wearer.uid, det.rider);
            if (det.damage > 0) dealDamage(foe, det.damage, wearer);
          }
        }
      }
    }

    // Thornmail (Endless): after the hit fully resolves, reflect a fraction of it
    // back at the attacker. One level deep only — the reflected hit lands on an
    // enemy (thornsFrac 0), so it can't re-reflect. Identity when thornsFrac is 0.
    const thorns =
      state.teamMods[target.team].thornsFrac +
      (target.itemMods?.thornsFrac ?? 0); // Squire's Plate stacks with Thornmail
    if (thorns > 0 && source !== target && source.state !== "dead" && shown > 0) {
      const back = Math.round(shown * thorns);
      if (back > 0) dealDamage(source, back, target);
    }

    // Spell Feedback (Runeward legendary): reflect a fraction of a MAGIC hit
    // at the caster. Like thorns, reflections shrink geometrically (round of a
    // fraction), so mutual feedback converges.
    const feedback = target.itemMods
      ? findItemEffect(target, "spellFeedback")
      : undefined;
    if (
      feedback &&
      source !== target &&
      source.state !== "dead" &&
      shown > 0 &&
      getUnitDef(source.defId).school === "magic"
    ) {
      const back = Math.round(shown * feedback.frac);
      if (back > 0) dealDamage(source, back, target);
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
    const before = target.hp;
    const raw = before + Math.round(amt);
    target.hp = Math.min(target.maxHp, raw);
    // Overheal Ward (Endless): overflow past max HP banks as shield (capped at
    // one max-HP bar). Identity when the boon isn't owned.
    if (state.teamMods[target.team].overheal && raw > target.maxHp) {
      const overflow = raw - target.maxHp;
      target.shieldHp = Math.min(target.maxHp, target.shieldHp + overflow);
      target.shieldHpMax = Math.max(target.shieldHpMax, target.shieldHp);
    }
    const gained = target.hp - before;
    if (gained > 0) spawnFloatingText(state, target, `+${gained}`, "heal");
  };
}

/** Out-of-combat heal used by the EndlessController between waves. Clamps to
 *  maxHp and shows a heal number. Deliberately bypasses kit `modifyIncomingHeal`
 *  (it's a meta recovery, not a Cleric cast) and only ever runs while the sim is
 *  frozen for an intermission — never inside the tick loop. */
export function metaHeal(state: SimState, unit: Unit, amount: number): void {
  if (unit.state === "dead" || amount <= 0) return;
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(amount));
  const gained = unit.hp - before;
  if (gained > 0) spawnFloatingText(state, unit, `+${gained}`, "heal");
}

/** Bring a fallen unit back at a fraction of max HP (Endless "Second Chance"
 *  boon). `transitionTo` treats "dead" as terminal, so this restores the state
 *  fields directly and clears the stale target/effect bookkeeping a corpse holds. */
export function reviveUnit(state: SimState, unit: Unit, hpFrac: number): void {
  if (unit.state !== "dead") return;
  unit.state = "idle";
  unit.animState = "idle";
  unit.hp = Math.max(1, Math.round(unit.maxHp * hpFrac));
  unit.effects = [];
  unit.targetUid = null;
  unit.attackedByUid = null;
  unit.tauntedByUid = null;
  unit.deathFade = 0;
  unit.hitFlash = 0;
  spawnFloatingText(state, unit, "Revived!", "heal");
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

// (Druid -> Bear shapeshift now lives in kits/druid.ts onTick — the pre-gate
// maintenance slot, together with its guard-timer countdown.)

// Orc Charge speed — well above any unit's normal moveSpeed so the rush reads as
// a fast lunge that quickly closes the gap, without being an instant teleport.
const CHARGE_SPEED = 340; // px/sec

// Hunter Scatter Trap tuning. (The lay-cadence, SCATTER_TRAP_CD_SEC, now lives in
// kits/hunter.ts; these two drive the generic trap TRIGGER, still in this file.)
const TRAP_STUN_SEC = 7; // how long a caught unit is held
const TRAP_RADIUS = 26; // how close a foe must step to trigger it

// Advance an in-progress Orc charge by one tick. The orc dashes toward its locked
// target at CHARGE_SPEED and slams on contact (bonus damage + brief stun). This
// owns the unit's movement for the duration (MovementSystem skips charging units)
// so the dash can't be double-applied. Fully deterministic — no randomness.
function stepCharge(unit: Unit, ctx: KitCtx): void {
  unit.chargeTicks--;

  const target = unit.chargeTargetUid
    ? ctx.unitsByUid.get(unit.chargeTargetUid)
    : null;
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
    // [seam] the kit resolves the on-contact effect (Orc slam / Boar taunt); the
    // driver stays defId-free. Field-gated on chargeTicks, like stepArcaneBarrage.
    getKit(unit.defId)?.onChargeContact?.(unit, target, ctx);
    ctx.spawnVfx({
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

// Arcane Mage: Arcane Barrage volley. The kit's fireAbility (kits/arcaneMage.ts)
// arms a 3-shot burst locked onto one target; this streamer fires the missiles one
// at a time in quick succession so they leave in sequence rather than all at once.
// Field-gated on barrageShots (not defId) — like stepCharge, it stays engine
// plumbing while the kit only arms it. Runs every tick while a volley is queued.
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

// Killing Spree (Outlaw ultimate). While spreeTicks is live the Outlaw teleports
// between enemies, striking each — this streamer owns the blink + strike cadence.
// Field-gated on spreeTicks (not defId), exactly like stepArcaneBarrage/stepCharge:
// the kit ARMS it (charge-up in kits/outlaw.ts onTick) and the funnel veto grants
// the immunity; here we just drive the hops. Fully deterministic — the enemy
// rotation is uid-sorted, no RNG.
const SPREE_JUMP_INTERVAL = secToTicks(0.5); // a blink-strike every ~0.5s (~10 over 5s)
const SPREE_JUMP_DAMAGE = 26; // ~260 total across a full spree

function stepKillingSpree(
  state: SimState,
  unit: Unit,
  dealDamage: (target: Unit, amount: number, source: Unit) => void
): void {
  unit.spreeTicks--;

  if (unit.spreeJumpTimer > 0) {
    unit.spreeJumpTimer--;
  } else {
    // Uid-sorted living enemies → a deterministic round-robin the blink walks.
    const enemies = state.units
      .filter((e) => e.team !== unit.team && e.state !== "dead")
      .sort((a, b) => (a.uid < b.uid ? -1 : 1));
    if (enemies.length > 0) {
      const target = enemies[unit.spreeIndex % enemies.length];
      unit.spreeIndex++;

      // Blink in just short of the target along the line of approach (as the
      // Trickster's Shadow Step lands), then strike.
      let toward = dir(unit.pos, target.pos);
      if (toward.x === 0 && toward.y === 0) {
        toward = { x: 0, y: unit.team === "player" ? -1 : 1 };
      }
      const standoff = unit.radius + target.radius - 4;
      unit.pos.x = clamp(
        target.pos.x - toward.x * standoff,
        unit.radius,
        FIELD_WIDTH - unit.radius
      );
      unit.pos.y = clamp(
        target.pos.y - toward.y * standoff,
        unit.radius,
        FIELD_HEIGHT - unit.radius
      );
      unit.facing = target.pos.x >= unit.pos.x ? 1 : -1;

      dealDamage(target, SPREE_JUMP_DAMAGE, unit);
      spawnVfx(state, {
        kind: "slam",
        pos: { x: target.pos.x, y: target.pos.y },
        life: secToTicks(0.35),
        maxLife: secToTicks(0.35),
        color: getUnitDef(unit.defId).accent,
      });
      unit.spreeJumpTimer = SPREE_JUMP_INTERVAL;
    }
  }

  // Reads as an active strike; MovementSystem declines to move a spreeing unit.
  transitionTo(unit, "attacking");
}

// (Arcane Mage Blink now lives in kits/arcaneMage.ts onReactTick — the pre-idle
// reactive teleport away from a closing melee threat, on its own blinkCooldown.)

// (Trickster Shadow Step + its tuning now live in kits/trickster.ts — onReactTick
// blinks to a nearby casting enemy and kicks/interrupts it, in the pre-idle
// reactive act slot.)

// (Necromancer casting — the dual Curse/Terrify cast bar — now lives in
// kits/necromancer.ts onActTick, which returns true so the engine bypasses its
// standard cast-handling chain. Raise Dead moved to that kit's onTick.)

// Create queued summons into the live unit list, respecting a hard per-team cap so a
// summoner (or a splitting slime) can't flood the board past the perf ceiling. Summon
// headroom rides on the side's concurrent cap: Arena (cap 2) keeps its proven 5/7
// ceiling; The Depths' bigger caps scale it up. Called after the AI loop AND again
// after projectiles, so a unit finished off by a ranged blow still lands its onDeath
// summons (the Slime Knight's blobs) before the win/loss check runs.
function flushSpawns(
  state: SimState,
  byUid: Map<string, Unit>,
  spawns: SimState["damageSpawns"]
): void {
  for (const spawn of spawns) {
    const isClone =
      spawn.defId === "slime_clone" ||
      spawn.defId === "bloatling" ||
      spawn.defId === "slime_squire";
    const cap = state.activeCaps[spawn.team] + (isClone ? 5 : 3);
    const teamCount = state.units.filter(
      (u) => u.team === spawn.team && u.state !== "dead"
    ).length;
    if (teamCount >= cap) continue;
    // Summons inherit their creator's level (spawn.level) — a leveled
    // summoner's skeletons/turrets/blobs must not under-scale the rest of
    // the warband. Level bakes into hp/maxHp BEFORE init runs, so inits that
    // derive from maxHp (Slime Knight rebirth) scale correctly. Carried
    // equipment (spawn.items) activates inside createUnit ONLY when the
    // spawn's defId owns it (Slime Knight rebirth keeps its gear).
    const summoned = createUnit(
      spawn.defId,
      spawn.team,
      spawn.pos,
      spawn.level ?? 1,
      spawn.items
    );
    // Summoner's Sigil: the creator's trinket buffs its summons' stats. Applied
    // before `init` (like the level bake) so maxHp-derived inits scale. A
    // self-respawn that reactivated its own gear is not a "summon" — skip it.
    if (spawn.sigilPct && spawn.sigilPct > 0 && !summoned.itemMods) {
      summoned.hp = Math.round(summoned.hp * (1 + spawn.sigilPct));
      summoned.maxHp = summoned.hp;
      summoned.damage = Math.round(summoned.damage * (1 + spawn.sigilPct));
    }
    spawn.init?.(summoned); // stamp deterministic starting state (blob anchor / rebirth HP)
    state.units.push(summoned);
    byUid.set(summoned.uid, summoned);
    getKit(summoned.defId)?.onSpawn?.(summoned); // [seam] spawn hook (both spawn paths)
  }
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
  const pendingSpawns: SimState["damageSpawns"] = [];

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
      tick: state.tick,
      rng: state.rng,
      unitsByUid: byUid,
      enemies: liveNow.filter((e) => e.team !== subject.team),
      allies: liveNow.filter(
        (a) => a.team === subject.team && a.uid !== subject.uid
      ),
      dealDamage,
      heal,
      spawnProjectile: (p) => spawnProjectile(state, p),
      spawnVfx: (v) => spawnVfx(state, v),
      spawnUnit: (defId, team, pos, init) =>
        (damageContext ? state.damageSpawns : pendingSpawns).push({
          defId,
          team,
          pos,
          level: subject.level, // summons inherit their creator's level
          items: subject.latentItems, // carried gear (inert unless owner-defId)
          sigilPct: subject.itemMods?.summonStatPct,
          init,
        }),
      spawnTrap: (t) => state.traps.push(t),
      spawnFloatingText: (u, v, k) => spawnFloatingText(state, u, v, k),
      revive: (u, frac) => reviveUnit(state, u, frac),
    };
  };

  heal = makeHealer(state, makeKitCtx);
  dealDamage = makeDamageDealer(state, makeKitCtx, heal);

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
    if (unit.renewCooldown > 0) unit.renewCooldown--;
    if (unit.sanctuaryCooldown > 0) unit.sanctuaryCooldown--;

    // Equipment upkeep (Heartwood regen, Runeward barrier) — pre-gate like kit
    // onTick, so it runs even while stunned. No-op for unequipped units.
    if (unit.itemMods) stepItemUpkeep(state, unit, heal);

    // (Bear Form's guard-timer countdown now lives in kits/druid.ts onTick — the
    // pre-gate maintenance slot, decremented before the transform check.)

    // (Trickster re-cloak countdown now lives in kits/trickster.ts onTick — the
    // pre-gate maintenance slot.)

    // [seam] kit pre-gate maintenance slot — runs every tick, even while stunned
    // (periodic passives, per-tick stat recompute, threshold transforms). This is
    // where Field Repairs / Raise Dead / boar+trap / bloodrage / momentum / bear
    // transform migrate. Placement is behavior-defining once units move here, so
    // each migration re-verifies digest().
    {
      const kit = getKit(unit.defId);
      if (kit?.onTick) kit.onTick(unit, makeKitCtx(unit));
    }

    // [driver] Killing Spree — while a spree is live the Outlaw owns its whole
    // turn: it teleports between enemies (stepKillingSpree) and is immune to all
    // damage (the funnel veto) and to crowd control. Placed BEFORE the stun / fear
    // / polymorph gates below so nothing can interrupt the rampage. Field-gated on
    // spreeTicks, not defId — the same engine-driver pattern as stepCharge.
    if (unit.spreeTicks > 0) {
      stepKillingSpree(state, unit, dealDamage);
      continue;
    }

    // (Engineer Field Repairs now lives in kits/engineer.ts onTick — the pre-gate
    // maintenance slot, on the same 2s cadence, healing itself + nearby turrets.)

    // (Necromancer Raise Dead now lives in kits/necromancer.ts onTick — the
    // pre-gate maintenance slot, synced to the global tick.)

    // (Hunter Boar Companion + Scatter Trap laying now live in kits/hunter.ts
    // onTick — the pre-gate maintenance slot. The generic trap TRIGGER stays
    // below in the movement step; the boar's guard-charge stays gated by defId
    // pending the shared charge-system refactor.)

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

    // (Druid Bear Form shapeshift now lives in kits/druid.ts onTick — the
    // pre-gate maintenance slot.)

    // (Berserker Bloodrage now lives in kits/berserker.ts onTick — the pre-gate
    // maintenance slot, recomputed each tick from base stats.)

    // (Mystic Archer Momentum recompute now lives in kits/mysticArcher.ts onTick
    // — the pre-gate maintenance slot, recomputed each tick from base stats.)

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

    // Stream out any queued Arcane Barrage missiles (one at a time), armed by the
    // Arcane Mage kit's fireAbility. Field-gated on barrageShots, so it stays engine
    // plumbing. Non-blocking — the mage still moves/attacks normally during the volley.
    if (unit.barrageShots > 0) stepArcaneBarrage(state, unit, byUid);

    // (Boar guard-charge arming now lives in kits/boar.ts onTick — guarded to match
    // its old post-gate spot, it locks a rush at the Hunter's attacker before the
    // charge-step below fires it the same tick.)

    // Orc Charge (and Boar guard-charge): while a rush is in progress it owns
    // movement until contact. The dash driver is field-gated on chargeTicks (not
    // defId); the kit arms it (Orc fireAbility / Boar onTick) and defines the
    // contact effect (onChargeContact).
    if (unit.chargeTicks > 0) {
      stepCharge(unit, makeKitCtx(unit));
      continue;
    }

    const enemies = alive.filter((e) => e.team !== unit.team);
    updateTarget(unit, byUid, enemies);

    // [seam] pre-idle reactive act slot — runs after targeting but BEFORE the
    // target-dead idle-out below, so a kit reacts even when its committed target
    // just died (Trickster Shadow Step interrupts any nearby caster; Arcane Mage
    // Blinks away from a closing melee threat, on its own blinkCooldown). The
    // post-idle act slot (onActTick: Rejuvenation / Necromancer cast) is after the
    // idle-out, where an instant act needs a live target.
    {
      const kit = getKit(unit.defId);
      if (kit?.onReactTick) kit.onReactTick(unit, makeKitCtx(unit));
    }

    // (Trickster Shadow Step + Arcane Mage Blink now fire from the pre-idle
    // onReactTick seam above — kits/trickster.ts, kits/arcaneMage.ts.)

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
      tick: state.tick,
      rng: state.rng,
      unitsByUid: byUid,
      enemies,
      allies,
      dealDamage,
      heal,
      spawnProjectile: (p) => spawnProjectile(state, p),
      spawnVfx: (v) => spawnVfx(state, v),
      spawnUnit: (defId, team, pos, init) =>
        pendingSpawns.push({
          defId,
          team,
          pos,
          level: unit.level, // summons inherit their creator's level
          items: unit.latentItems, // carried gear (inert unless owner-defId)
          sigilPct: unit.itemMods?.summonStatPct,
          init,
        }),
      spawnTrap: (t) => state.traps.push(t),
      spawnFloatingText: (u, v, k) => spawnFloatingText(state, u, v, k),
      revive: (u, frac) => reviveUnit(state, u, frac),
    };
    const abilityKit = getKit(unit.defId);

    // [seam] kit post-idle act slot — reached only with a LIVE target (the idle-out
    // above already fired for a dead/absent target) or mid-cast, and always
    // un-stunned/un-feared. Druid Rejuvenation runs here (instant → returns void).
    // A kit that OWNS its whole cast pipeline (the Necromancer's dual Curse/Terrify
    // on one bar) returns true, so the standard cast-handling chain below is
    // bypassed. Passes the loop's abilityCtx so allies/enemies match the funnel
    // exactly (makeKitCtx would rebuild a fresher snapshot).
    // [opening grace] For the first OPENING_CAST_GRACE_SEC of battle, hold every
    // active ability cast so the opening reads clearly — units still move and
    // basic-attack, they just don't cast. This gates the kit-owned cast pipeline
    // (Necromancer) here and the begin-cast/instant-fire paths below; passive and
    // reactive kit hooks (shields, on-hit riders, Second Wind) are unaffected.
    // Chrono Amulet legendary ("ability starts the battle ready"): the wearer
    // ignores the opening cast grace — its first cast comes before anyone's.
    const inOpeningGrace =
      state.castGraceTicks > 0 &&
      !(unit.itemMods && findItemEffect(unit, "abilityStartsReady"));
    const ownsCast = inOpeningGrace
      ? undefined
      : abilityKit?.onActTick?.(unit, abilityCtx);

    // Cast handling. An in-flight cast (the cast bar) ticks down and fires its
    // spell on completion, locking the mage meanwhile. Otherwise, begin a
    // cast-time ability (the mages) or fire an instant one (taunt, mend, charge,
    // kiting leap, summon, …) — kiting leap can interrupt the approach.
    if (ownsCast) {
      // The kit ran its own cast pipeline (Necromancer). If it's mid-cast the unit
      // is locked for the tick; otherwise fall through to attack — either way the
      // standard cast-handling chain below is skipped.
      if (unit.castTicks > 0) continue;
    } else if (unit.castTicks > 0) {
      unit.castTicks--;
      if (unit.castTicks <= 0) {
        // The kit fires the completed cast's effect (every cast unit has one).
        abilityKit?.fireAbility?.(abilityCtx); // the spell goes off
        unit.castTicksMax = 0;
        unit.castTargetUid = null;
      } else {
        transitionTo(unit, "casting"); // locked in place, committed
        continue;
      }
    } else if (!inOpeningGrace && unit.abilityCooldown <= 0) {
      const castTime = abilityCastTimeTicks(unit.ability);
      if (castTime > 0) {
        // Begin a cast. A stun/silence blocks the start, and some casts (Mend)
        // only begin when they have a reason to — so the Cleric doesn't freeze
        // mid-field winding up a heal with no wounded ally to land it on.
        // A kit may gate its begin-cast (Cleric Mend / Mage Polymorph won't wind
        // up with no valid target); every other cast always wants to (there's an
        // enemy to hit).
        const wants = abilityKit?.wantsToCast
          ? abilityKit.wantsToCast(abilityCtx)
          : true;
        if (!isStunned(unit) && !isSilenced(unit) && wants) {
          unit.castTicks = castTime;
          unit.castTicksMax = castTime;
          unit.castTargetUid = target ? target.uid : null;
          // Chrono Amulet: item cooldown reduction (×1 when unequipped).
          unit.abilityCooldown = Math.round(
            abilityCooldownTicks(unit.ability) *
              (unit.itemMods?.cooldownMult ?? 1)
          );
          transitionTo(unit, "casting");
          continue;
        }
      } else {
        // Instant cast: the kit fires the effect (has-an-active-cast <=>
        // fireAbility defined), gated on stun/silence. A unit with no active-cast
        // kit does nothing here — its passive/reactive mechanics run elsewhere.
        const fired =
          abilityKit?.fireAbility != null &&
          !isStunned(unit) &&
          !isSilenced(unit) &&
          abilityKit.fireAbility(abilityCtx);
        if (fired) {
          // Chrono Amulet: item cooldown reduction (×1 when unequipped).
          unit.abilityCooldown = Math.round(
            abilityCooldownTicks(unit.ability) *
              (unit.itemMods?.cooldownMult ?? 1)
          );
        }
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
        // Berserker's Rhythm (Endless): the live rhythm bonus shrinks the delay on
        // top of the flat attack-speed mod. Identity when rhythmBonus is 0.
        const tm = state.teamMods[unit.team];
        // Equipment attack speed: the flat item multiplier (Windlash /
        // Quicksilver) plus Tempo stacks built in performBasicAttack.
        let itemDelay = unit.itemMods?.atkDelayMult ?? 1;
        const tempo = unit.itemMods ? findItemEffect(unit, "tempo") : undefined;
        if (tempo && unit.tempoStacks) {
          itemDelay /= 1 + tempo.perStack * unit.tempoStacks;
        }
        const delay =
          (unit.attackSpeed *
            attackDelayMultiplier(unit) *
            tm.atkDelayMult *
            itemDelay) /
          (1 + tm.rhythmBonus);
        unit.attackCooldown = secToTicks(delay);
      }
    } else {
      transitionTo(unit, "moving");
    }
  }

  // Flush summons created this tick into the live unit list (ability-driven +
  // same-tick death/damage spawns), respecting the per-team cap. See flushSpawns.
  flushSpawns(state, byUid, [...pendingSpawns, ...state.damageSpawns]);
  state.damageSpawns = [];

  // 5a. Movement + collisions.
  stepMovement({
    units: state.units,
    unitsByUid: byUid,
    teamMods: state.teamMods,
  });

  // 5a-ii. Scatter Traps: an enemy of the trap's owner that has stepped onto it is
  // caught (stunned) and the trap is spent. Checked after movement so it fires the
  // moment a foe walks in.
  if (state.traps.length > 0) {
    for (let i = state.traps.length - 1; i >= 0; i--) {
      const trap = state.traps[i];
      for (const u of state.units) {
        if (u.state === "dead" || u.team === trap.team) continue;
        if (dist(u.pos, trap) <= TRAP_RADIUS) {
          if (trap.rider) {
            // A boss hazard (burn/poison vent) — funnel through the shared item
            // rider path so the status + tinted impact vfx match everything else.
            applyItemRider(state, u, trap.sourceUid ?? "trap", trap.rider);
          } else {
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
          }
          state.traps.splice(i, 1);
          break; // trap consumed
        }
      }
    }
  }

  // 5b. Projectiles.
  stepProjectiles(state, byUid, dealDamage, heal, makeKitCtx);

  // 5b-ii. A unit finished off by a projectile THIS tick (a ranged blow killing a
  // Slime Knight) queued its onDeath summons into damageSpawns AFTER the flush above.
  // Flush them now so those units are on the board for the win/loss check below —
  // otherwise a projectile-killed last unit is declared "out" before its blobs spawn,
  // and the match ends before the Slime Knight ever splits.
  if (state.damageSpawns.length > 0) {
    flushSpawns(state, byUid, state.damageSpawns);
    state.damageSpawns = [];
  }

  // 5c. Floating texts / vfx decay.
  for (const ft of state.floatingTexts) ft.life--;
  state.floatingTexts = state.floatingTexts.filter((f) => f.life > 0);
  for (const v of state.vfx) v.life--;
  state.vfx = state.vfx.filter((v) => v.life > 0);

  // 6. Animation (presentation only).
  stepAnimation(state.units);

  // 6b. Opening ability grace winds down (gated the cast pipeline above this tick).
  if (state.castGraceTicks > 0) state.castGraceTicks--;

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

  // [seam] before the swing resolves (open contract 2). Assassin Ambush (opening
  // stun + reveal) and the Trickster's reveal + re-cloak restart now live in their
  // kits (kits/assassin.ts, kits/trickster.ts onBeforeAttack).
  if (kit?.onBeforeAttack) kit.onBeforeAttack(unit, target, ctx);

  unit.attackCount += 1;

  // Windlash Tempo: consecutive hits on the SAME target stack attack speed;
  // switching targets resets. Bookkept before the swing so kit-replaced swings
  // count too; the attack-cooldown site reads the stacks.
  const im = unit.itemMods;
  if (im) {
    const tempo = findItemEffect(unit, "tempo");
    if (tempo) {
      if (unit.tempoTargetUid === target.uid) {
        unit.tempoStacks = Math.min(
          tempo.maxStacks,
          (unit.tempoStacks ?? 0) + 1
        );
      } else {
        unit.tempoTargetUid = target.uid;
        unit.tempoStacks = 0;
      }
    }
  }

  // Team on-hit boons (Endless): every-Nth-attack status riders (Thunderclap stun,
  // Venom poison) apply to the primary target on any swing; Overkill's crit doubles
  // the default swing below. Both are no-ops when the team has none.
  const tmods = state.teamMods[unit.team];
  for (const r of tmods.onHitRiders) {
    if (unit.attackCount % r.everyNth === 0) {
      applyEffect(
        target,
        makeEffect(r.effectType, {
          source: unit.uid,
          durationSec: r.durationSec,
          magnitude: r.magnitude,
          damagePerTick: r.damagePerTick,
          tickIntervalSec: r.tickIntervalSec,
        })
      );
    }
  }
  // Crit: team Overkill or the item's own crit cadence (Forgemaster's Hammer)
  // — either firing doubles the default swing.
  const itemCrit =
    im != null && im.critEveryNth > 0 && unit.attackCount % im.critEveryNth === 0;
  const critMult =
    (tmods.critEveryNth > 0 && unit.attackCount % tmods.critEveryNth === 0) ||
    itemCrit
      ? 2
      : 1;

  // [seam] replace the default swing entirely (open contract 2 — Mystic / Ranger /
  // Warrior do their own thing). attackCount is already bumped, matching today.
  // Mystic Archer fires its form-tagged shot here (kits/mysticArcher.ts
  // onBasicAttack); its stacking/detonation resolves on impact (onProjectileHit).
  if (kit?.onBasicAttack && kit.onBasicAttack(unit, target, ctx)) return;

  // [seam] Ranger Multishot (the every-2nd-shot three-arrow spread) now lives in
  // kits/ranger.ts onBasicAttack, fired above.

  // (The Arcane Mage has no special basic attack — it uses the default ranged
  // shot below, and nukes with its active Arcane Barrage on cooldown.)

  // Equipment on-hit rider (Ember/Frostbite/Venom/Hexblade): fires every Nth
  // attack, riding the projectile for ranged units (a SECOND slot so it never
  // displaces an innate basicShotRider) and applying directly for melee.
  const itemRiderEff = im?.effects.find(
    (e): e is Extract<ItemEffect, { kind: "onHitRider" }> =>
      e.kind === "onHitRider" && unit.attackCount % e.everyNth === 0
  );

  if (ranged) {
    // Ranged basic attacks spawn a simple projectile (archer arrows etc.). A unit
    // with a basicShotRider (Ice Mage freeze / Fire Mage burn) plants its on-hit
    // rider every Nth attack — pure UnitDef data, resolved in stepProjectiles.
    const sr = def.basicShotRider;
    const rider =
      sr && unit.attackCount % sr.everyNthAttack === 0 ? sr.rider : undefined;
    spawnProjectile(state, {
      pos: { x: unit.pos.x, y: unit.pos.y },
      target: { x: target.pos.x, y: target.pos.y },
      targetUid: target.uid,
      speed: 380,
      damage: unit.damage * critMult,
      team: unit.team,
      sourceUid: unit.uid,
      ability: "lifesteal", // sentinel: "basic"; on-hit rider carried in `rider`
      color: rider ? rider.color : def.accent,
      angle: 0,
      rider,
      itemRider: itemRiderEff?.rider,
    });
  } else {
    // [seam] Warrior Whirlwind (the AoE spin + bleed that replaces the swing) now
    // lives in kits/warrior.ts onBasicAttack, fired above.
    dealDamage(target, unit.damage * critMult, unit);
    applyLifesteal(
      unit,
      unit.damage * critMult,
      heal,
      tmods.lifestealBonus + (im?.lifesteal ?? 0) // Bloodletter adds on top
    );

    // Equipment on-hit rider lands with the melee swing.
    if (itemRiderEff) {
      applyItemRider(state, target, unit.uid, itemRiderEff.rider);
    }

    // [seam] after the default melee swing lands (open contract 2). Zombie
    // Shambler's Numbing Bite now lives in its kit (kits/zombieShambler.ts);
    // Venom / Cleave / Backlash migrate here next.
    if (kit?.onAfterAttack) kit.onAfterAttack(unit, target, ctx);

    // (Rogue Venom now lives in kits/rogue.ts onAfterAttack, fired by the seam.)

    // (Berserker Cleave now lives in kits/berserker.ts onAfterAttack, fired by
    // the onAfterAttack seam above.)

    // (Aegis Knight Backlash now lives in kits/aegisKnight.ts onAfterAttack,
    // fired by the onAfterAttack seam above.)
  }

  // --- Equipment swing effects (default swings only — a kit-replaced swing
  // returned above). All share the attackCount cadence counter. -------------
  if (!im) return;

  // Twinfang: every Nth attack strikes twice (a second full swing).
  const twin = findItemEffect(unit, "doubleStrikeNth");
  if (twin && unit.attackCount % twin.everyNth === 0) {
    if (ranged) {
      spawnProjectile(state, {
        pos: { x: unit.pos.x, y: unit.pos.y },
        target: { x: target.pos.x, y: target.pos.y },
        targetUid: target.uid,
        speed: 380,
        damage: unit.damage * critMult,
        team: unit.team,
        sourceUid: unit.uid,
        ability: "lifesteal",
        color: def.accent,
        angle: 0,
      });
    } else {
      dealDamage(target, unit.damage * critMult, unit);
      applyLifesteal(
        unit,
        unit.damage * critMult,
        heal,
        tmods.lifestealBonus + im.lifesteal
      );
    }
  }

  // Stormpiercer: every Nth attack arcs to the nearest OTHER enemy.
  const chain = findItemEffect(unit, "chainNth");
  if (chain && unit.attackCount % chain.everyNth === 0) {
    let nearest: Unit | null = null;
    let nd = Infinity;
    for (const e of ctx.enemies) {
      if (e === target || e.state === "dead") continue;
      const d = dist(unit.pos, e.pos);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }
    if (nearest) {
      spawnVfx(state, {
        kind: "lightning",
        pos: { x: target.pos.x, y: target.pos.y },
        to: { x: nearest.pos.x, y: nearest.pos.y },
        life: secToTicks(0.3),
        maxLife: secToTicks(0.3),
        color: "#38bdf8",
      });
      dealDamage(nearest, Math.round(unit.damage * chain.frac), unit);
    }
  }

  // Eclipse Pendant: every Nth hit lands bonus shadow damage (+ leg. stun).
  const eclipse = findItemEffect(unit, "nthBonusDamage");
  if (eclipse && unit.attackCount % eclipse.everyNth === 0) {
    spawnVfx(state, {
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.35),
      maxLife: secToTicks(0.35),
      color: "#facc15",
    });
    dealDamage(target, eclipse.bonus, unit);
    if (eclipse.stunSec) {
      applyEffect(
        target,
        makeEffect("stun", { source: unit.uid, durationSec: eclipse.stunSec })
      );
    }
  }

  // Venom Fang legendary: hits on a poisoned target splash the poison nearby.
  const spread = findItemEffect(unit, "spreadPoisonOnAttack");
  if (spread && target.effects.some((e) => e.type === "poison")) {
    for (const foe of ctx.enemies) {
      if (foe === target || foe.state === "dead") continue;
      if (dist(foe.pos, target.pos) > spread.radius) continue;
      applyItemRider(state, foe, unit.uid, spread.rider);
    }
  }
}

// (Mystic Archer's on-hit resolution now lives in kits/mysticArcher.ts
// onProjectileHit — Light single-target mark/detonate + Dark radius chain + form
// flip + Momentum stack, dispatched from stepProjectiles via the source's kit.)

function stepProjectiles(
  state: SimState,
  byUid: Map<string, Unit>,
  dealDamage: (t: Unit, amt: number, s: Unit) => void,
  heal: (t: Unit, amt: number) => void,
  makeKitCtx: (subject: Unit, damageContext?: boolean) => KitCtx
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
        // [seam] the SOURCE unit's kit resolves its own shot's impact (Mystic
        // Light/Dark stacks/detonate/flip → kits/mysticArcher.ts onProjectileHit).
        // Keyed on the mystic_shift tag so a dead source fizzles exactly as before;
        // the kit owns the damage + stack bookkeeping via ctx.
        if (proj.ability === "mystic_shift") {
          if (source) {
            getKit(source.defId)?.onProjectileHit?.(
              source,
              target,
              proj,
              makeKitCtx(source, true)
            );
          }
        } else if (isBasic) {
          if (source) {
            dealDamage(target, proj.damage, source);
            // Marksman's Focus (Endless) + Bloodletter (item): ranged basics
            // lifesteal. No-op at 0.
            const rl =
              state.teamMods[source.team].rangedLifesteal +
              (source.itemMods?.lifesteal ?? 0);
            if (rl > 0) heal(source, Math.round(proj.damage * rl));
          }
          // On-hit rider (Ice freeze / Fire burn) — applied generically from the
          // shot's data-descriptor (UnitDef.basicShotRider → proj.rider), so no
          // per-unit defId branch lives here.
          if (proj.rider) {
            const r = proj.rider;
            applyEffect(
              target,
              makeEffect(r.effectType, {
                source: proj.sourceUid,
                durationSec: r.durationSec,
                damagePerTick: r.damagePerTick,
                tickIntervalSec: r.tickIntervalSec,
                magnitude: r.magnitude,
              })
            );
            spawnVfx(state, {
              kind: r.vfxKind,
              pos: { x: target.pos.x, y: target.pos.y },
              life: secToTicks(0.4),
              maxLife: secToTicks(0.4),
              color: r.color,
            });
          }
          // Equipment on-hit rider (second slot — never displaces the innate
          // rider above; both may land on the same shot).
          if (proj.itemRider) {
            applyItemRider(state, target, proj.sourceUid, proj.itemRider);
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
    waveBanner: state.waveBanner,
  };
}
