// ============================================================================
// EndlessController
// The survival-mode horde director — a meta-layer sibling of the WaveController
// (NOT part of the per-tick combat core). It runs an unbounded sequence of waves:
// each 5-wave cycle is fodder → fodder → rare miniboss → fodder → dungeon boss,
// borrowing one dungeon's pool + boss per cycle (rotation shuffled per run seed).
//
// Between waves the run enters an INTERMISSION: the sim is frozen (MatchController
// stops ticking), the warband is healed, dead enemy corpses are pruned, and three
// party-wide boons are offered. The player's pick is an INPUT (like a deployment),
// so a run is a pure function of (seed, deployments, ordered pick indices) — no
// drift from how long the player deliberates.
//
// Determinism: owns its own seeded RNG (separate stream from the sim RNG, so an
// endless run never perturbs anything else), never Math.random. Boons fold into
// SimState.teamMods (read at the combat funnels) or fire one-shot events on the
// warband units; nothing here runs a per-unit defId branch in the combat core.
// ============================================================================

import { RNG } from "@/utils/rng";
import { FIELD_HEIGHT, FIELD_WIDTH, TICK_RATE, secToTicks } from "@/utils/constants";
import { createUnit } from "@/entities/createUnit";
import { getUnitDef } from "@/data/units";
import type { Unit, WaveBanner } from "@/types";
import {
  metaHeal,
  reviveUnit,
  type SimState,
  type TeamMods,
} from "./CombatSystem";
import { getKit } from "./kits/UnitKit";
import { applyEffect, makeEffect } from "./StatusEffectSystem";
import { buildFodderQueue } from "./WaveController";
import {
  BOSS_BANNER_SEC,
  BOSS_TELEGRAPH_SEC,
  WAVE_SPAWN_INTERVAL_SEC,
} from "@/data/depths";
import {
  BOONS,
  rollBoonOffers,
  type BoonDef,
  type BoonRarity,
  type TeamModField,
} from "@/data/boons";
import {
  ENDLESS_INTERMISSION_HEAL,
  ENDLESS_MOMENTUM_PER_WAVE,
  ENDLESS_RARE_POOL,
  ENDLESS_RHYTHM_MAX,
  ENDLESS_RHYTHM_PER_SEC,
  ENDLESS_ROTATION_BASE,
  ENDLESS_WAVE_TIME_SEC,
  dungeonForCycle,
  endlessCycle,
  endlessWaveBudget,
  endlessWaveKind,
  endlessWaveStatMultipliers,
  themedRareFor,
} from "@/data/endless";

/** Same top-edge spawn line the WaveController uses. */
const SPAWN_Y = 18;

/** Per-wave lifecycle. Rare/boss waves open on "telegraph"; fodder waves skip
 *  straight to "spawning". A wave clears (→ "intermission") once its queue is
 *  spent AND the field is empty. */
type WavePhase = "telegraph" | "spawning" | "clearing" | "intermission";

/** A boon offer surfaced to the UI. */
export interface BoonOffer {
  id: string;
  name: string;
  rarity: BoonRarity;
  description: string;
}

/** A tally row for the "your boons" strip. */
export interface BoonTally {
  id: string;
  name: string;
  rarity: BoonRarity;
  count: number;
}

/** Read-model handed to the React layer each snapshot. */
export interface EndlessStatus {
  wave: number;
  wavesCleared: number;
  intermission: { wave: number; offers: BoonOffer[] } | null;
  boonsPicked: BoonTally[];
}

export class EndlessController {
  private rng: RNG;
  private rotation: string[];

  /** Current wave being fought (1-based; the HUD pill shows this). */
  private wave = 1;
  /** Highest fully-cleared wave — the run's score. */
  private wavesCleared = 0;

  private phase: WavePhase = "spawning";
  private queue: string[] = [];
  private telegraphTicks = 0;
  private spawnCooldown = 0;
  private offers: string[] | null = null;

  /** Captured on the first step (all player units on the field = the warband). */
  private warbandUids: Set<string> | null = null;

  // -- Persistent run modifiers, accumulated from boon picks. ----------------
  private intermissionHealPct = ENDLESS_INTERMISSION_HEAL;
  private regenPerSec = 0;
  private shieldPerWave = 0;
  /** Berserker's Rhythm active + its live ramp (ticks since this wave began). */
  private rhythmActive = false;
  private rhythmTicks = 0;
  /** Momentum active — bumps team damage each clean-wave clear. */
  private momentumActive = false;
  /** Wave-start summon orders (Kennel Master wolves, War Machine turret). */
  private summons: { defId: string; count: number }[] = [];
  /** uids of the pets summoned last wave, cleared + respawned each wave. */
  private petUids = new Set<string>();

  /** Ordered boon ids picked (for the tally + replay parity). */
  private picks: string[] = [];
  /** Enemy defIds encountered this run (ledger; survives corpse pruning). */
  private bestiary = new Set<string>();
  /** Enemy defIds that DIED this run — recorded as corpses are pruned, since the
   *  compendium can't scan them off the field afterward. */
  private bestiaryDefeated = new Set<string>();

  constructor(seed: number) {
    // Own stream, xor-mixed so it never shares draws with the sim RNG.
    this.rng = new RNG((seed ^ 0xe17d1e55) >>> 0);
    this.rotation = this.rng.shuffle(ENDLESS_ROTATION_BASE);
  }

  // -- Public read model ------------------------------------------------------

  get currentWave(): number {
    return this.wave;
  }
  get wavesSurvived(): number {
    return this.wavesCleared;
  }
  get inIntermission(): boolean {
    return this.phase === "intermission";
  }
  /** Enemy-reserve sentinel: always ≥ 1 while the run lives, so the win check
   *  (enemies dead AND reserves ≤ 0) can never fire. An endless run only ends on
   *  a player wipe or a wave-clock timeout, both handled by MatchController. */
  get reservesSentinel(): number {
    return 1;
  }
  /** The run's compendium ledger: everything encountered (`seen`) and the subset
   *  that died to you (`slain`). Accumulated as we spawn + prune, so it survives
   *  corpse pruning that a live-unit scan would miss. */
  ledger(): { seen: string[]; slain: string[] } {
    return { seen: [...this.bestiary], slain: [...this.bestiaryDefeated] };
  }

  status(): EndlessStatus {
    return {
      wave: this.wave,
      wavesCleared: this.wavesCleared,
      intermission:
        this.phase === "intermission" && this.offers
          ? { wave: this.wavesCleared, offers: this.offers.map(toOffer) }
          : null,
      boonsPicked: this.boonTally(),
    };
  }

  private boonTally(): BoonTally[] {
    const counts = new Map<string, number>();
    for (const id of this.picks) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([id, count]) => {
      const b = BOONS[id];
      return { id, name: b.name, rarity: b.rarity, count };
    });
  }

  // -- Tick -------------------------------------------------------------------

  /** Called once per battle tick, before stepSimulation (MatchController skips
   *  this entirely while `inIntermission`, so the sim is frozen there). */
  step(state: SimState): void {
    if (this.warbandUids === null) {
      this.captureWarband(state);
      this.startWave(state); // wave 1 opens (banner + first spawn next tick)
      return;
    }

    // We own the banner countdown here (the WaveController's is a separate,
    // never-coexisting stream; endless mode uses no WaveController).
    if (state.waveBanner) {
      state.waveBanner.ticks--;
      if (state.waveBanner.ticks <= 0) state.waveBanner = null;
    }

    if (this.phase === "intermission") return; // frozen (guard; shouldn't be reached)

    // Berserker's Rhythm: ramp the live attack-speed bonus up over the wave.
    if (this.rhythmActive) {
      this.rhythmTicks++;
      state.teamMods.player.rhythmBonus = Math.min(
        ENDLESS_RHYTHM_MAX,
        ENDLESS_RHYTHM_PER_SEC * (this.rhythmTicks / TICK_RATE)
      );
    }

    if (this.phase === "telegraph") {
      if (this.telegraphTicks > 0) {
        this.telegraphTicks--;
        return;
      }
      this.phase = "spawning";
      this.spawnCooldown = 0;
    }

    if (this.phase === "spawning") {
      if (this.queue.length > 0) {
        if (this.spawnCooldown > 0) {
          this.spawnCooldown--;
          return;
        }
        if (this.enemiesAlive(state) >= state.activeCaps.enemy) return;
        this.spawnMonster(state, this.queue.shift()!);
        return;
      }
      this.phase = "clearing";
    }

    if (this.phase === "clearing") {
      if (this.enemiesAlive(state) > 0) return;
      this.enterIntermission(state);
    }
  }

  // -- Wave lifecycle ---------------------------------------------------------

  private startWave(state: SimState): void {
    const wave = this.wave;
    state.clockTicks = secToTicks(ENDLESS_WAVE_TIME_SEC); // fresh per-wave backstop
    state.waveBanner = null;
    this.spawnCooldown = 0;

    const dungeon = dungeonForCycle(this.rotation, endlessCycle(wave));
    const kind = endlessWaveKind(wave);

    if (kind === "fodder") {
      this.queue = buildFodderQueue(
        this.rng,
        dungeon.tiers[0].monsters,
        endlessWaveBudget(wave)
      );
      this.phase = "spawning";
      this.setBanner(state, "wave", `Wave ${wave}`);
    } else {
      const id =
        kind === "rare"
          ? themedRareFor(dungeon) ?? this.rng.pick(ENDLESS_RARE_POOL)
          : dungeon.tiers[0].boss;
      this.queue = [id];
      this.telegraphTicks = secToTicks(BOSS_TELEGRAPH_SEC);
      this.phase = "telegraph";
      this.setBanner(state, kind, getUnitDef(id).name);
    }

    this.applyWaveStartBoons(state);
  }

  private enterIntermission(state: SimState): void {
    this.wavesCleared = this.wave;
    this.pruneDeadEnemies(state);

    // Momentum: a clean wave (no warband death) grants a permanent damage bump.
    // Checked before the heal so a dead unit still counts as a death this wave.
    if (
      this.momentumActive &&
      this.warbandUnits(state).every((u) => u.state !== "dead")
    ) {
      state.teamMods.player.dmgMult *= 1 + ENDLESS_MOMENTUM_PER_WAVE;
    }

    // Baseline (+ Field Medicine) recovery on the living warband.
    for (const u of this.warbandUnits(state)) {
      if (u.state === "dead") continue;
      const missing = u.maxHp - u.hp;
      if (missing > 0) metaHeal(state, u, Math.round(missing * this.intermissionHealPct));
    }

    const hasDead = this.warbandUnits(state).some((u) => u.state === "dead");
    this.offers = rollBoonOffers(this.wave, this.rng, hasDead);
    this.phase = "intermission";
  }

  /** Apply the chosen offer and open the next wave. Returns false if not in an
   *  intermission or the index is out of range (idempotent-safe). */
  pickBoon(state: SimState, offerIndex: number): boolean {
    if (this.phase !== "intermission" || !this.offers) return false;
    if (offerIndex < 0 || offerIndex >= this.offers.length) return false;
    const boon = BOONS[this.offers[offerIndex]];
    if (!boon) return false;

    this.applyBoon(state, boon);
    this.picks.push(boon.id);
    this.offers = null;
    this.wave += 1;
    this.startWave(state);
    return true;
  }

  // -- Boon application -------------------------------------------------------

  private applyBoon(state: SimState, boon: BoonDef): void {
    for (const eff of boon.effects) {
      switch (eff.type) {
        case "teamMod":
          foldTeamMod(state.teamMods.player, eff.field, eff.value);
          break;
        case "maxHp":
          this.applyMaxHp(state, eff.pct);
          break;
        case "intermissionHeal":
          this.intermissionHealPct = Math.min(
            0.9,
            this.intermissionHealPct + eff.addPct
          );
          break;
        case "regen":
          this.regenPerSec += eff.hpPerSec; // takes effect at wave start
          break;
        case "waveShield":
          this.shieldPerWave += eff.amount; // takes effect at wave start
          break;
        case "revive":
          this.reviveLowest(state, eff.hpPct);
          break;
        // --- slice-2 proc / mechanic boons ---
        case "execute":
          state.teamMods.player.executeBonus += eff.bonus;
          break;
        case "thorns":
          state.teamMods.player.thornsFrac += eff.frac;
          break;
        case "killHeal":
          state.teamMods.player.killHeal += eff.amount;
          break;
        case "bounty":
          state.teamMods.player.bountyHp += eff.hp;
          break;
        case "overheal":
          state.teamMods.player.overheal = true;
          break;
        case "lastBreath":
          state.teamMods.player.lastBreath = true;
          break;
        case "crit":
          state.teamMods.player.critEveryNth = eff.everyNth;
          break;
        case "rangedLifesteal":
          state.teamMods.player.rangedLifesteal += eff.frac;
          break;
        case "rhythm":
          this.rhythmActive = true;
          break;
        case "momentum":
          this.momentumActive = true;
          break;
        case "onHitRider":
          state.teamMods.player.onHitRiders.push({
            effectType: eff.effectType,
            everyNth: eff.everyNth,
            durationSec: eff.durationSec,
            magnitude: eff.magnitude,
            damagePerTick: eff.damagePerTick,
            tickIntervalSec: eff.tickIntervalSec,
          });
          break;
        case "waveSummon":
          this.summons.push({ defId: eff.defId, count: eff.count });
          break;
      }
    }
  }

  /** Bump every warband unit's max HP (living AND dead, so a later revive isn't
   *  weaker) and heal the living the gain. */
  private applyMaxHp(state: SimState, pct: number): void {
    for (const u of this.warbandUnits(state)) {
      const diff = Math.round(u.maxHp * pct);
      u.maxHp += diff;
      metaHeal(state, u, diff); // no-op on the dead
    }
  }

  private reviveLowest(state: SimState, hpFrac: number): void {
    const dead = this.warbandUnits(state)
      .filter((u) => u.state === "dead")
      .sort((a, b) => (a.uid < b.uid ? -1 : 1));
    if (dead.length > 0) reviveUnit(state, dead[0], hpFrac);
  }

  /** Wave-start boons on the living warband: refresh shields, (re)apply the regen
   *  HoT, and arm the Last Breath charge. Also resets the rhythm ramp and summons
   *  fresh pets. Called at the top of every wave. */
  private applyWaveStartBoons(state: SimState): void {
    const lastBreath = state.teamMods.player.lastBreath;
    for (const u of this.warbandUnits(state)) {
      if (u.state === "dead") continue;
      if (lastBreath) u.cheatDeathReady = true;
      if (this.shieldPerWave > 0) {
        u.shieldHp = Math.max(u.shieldHp, this.shieldPerWave);
        u.shieldHpMax = Math.max(u.shieldHpMax, this.shieldPerWave);
      }
      if (this.regenPerSec > 0) {
        applyEffect(
          u,
          makeEffect("regen", {
            source: u.uid,
            healPerTick: this.regenPerSec,
            tickIntervalSec: 1,
            durationSec: ENDLESS_WAVE_TIME_SEC,
          })
        );
      }
    }
    // Fresh rhythm ramp for the new wave.
    this.rhythmTicks = 0;
    if (this.rhythmActive) state.teamMods.player.rhythmBonus = 0;
    // Summon this wave's pets (clearing last wave's survivors first).
    this.spawnPets(state);
  }

  /** Summon the boon pets for this wave (Kennel Master wolves, War Machine turret),
   *  clearing any that survived the last wave so they never accumulate. Pet HP
   *  scales with the wave curve so they keep soaking; damage stays base + team
   *  boons. */
  private spawnPets(state: SimState): void {
    if (this.summons.length === 0) return;
    if (this.petUids.size > 0) {
      state.units = state.units.filter((u) => !this.petUids.has(u.uid));
      this.petUids.clear();
    }
    const mult = endlessWaveStatMultipliers(this.wave);
    for (const order of this.summons) {
      for (let i = 0; i < order.count; i++) {
        const x = this.rng.float(80, FIELD_WIDTH - 80);
        const y = this.rng.float(FIELD_HEIGHT - 90, FIELD_HEIGHT - 40);
        const unit = createUnit(order.defId, "player", { x, y });
        unit.maxHp = Math.round(unit.maxHp * mult.hp);
        unit.hp = unit.maxHp;
        getKit(order.defId)?.onSpawn?.(unit);
        state.units.push(unit);
        this.petUids.add(unit.uid);
      }
    }
  }

  // -- Helpers ----------------------------------------------------------------

  private captureWarband(state: SimState): void {
    this.warbandUids = new Set(
      state.units.filter((u) => u.team === "player").map((u) => u.uid)
    );
  }

  private warbandUnits(state: SimState): Unit[] {
    const uids = this.warbandUids;
    if (!uids) return [];
    return state.units.filter((u) => uids.has(u.uid));
  }

  private enemiesAlive(state: SimState): number {
    return state.units.filter((u) => u.team === "enemy" && u.state !== "dead")
      .length;
  }

  private pruneDeadEnemies(state: SimState): void {
    for (const u of state.units) {
      if (u.team === "enemy" && u.state === "dead") this.bestiaryDefeated.add(u.defId);
    }
    state.units = state.units.filter(
      (u) => !(u.team === "enemy" && u.state === "dead")
    );
  }

  private spawnMonster(state: SimState, defId: string): void {
    const x = this.rng.float(60, FIELD_WIDTH - 60);
    const unit = createUnit(defId, "enemy", { x, y: SPAWN_Y });
    const mult = endlessWaveStatMultipliers(this.wave);
    unit.maxHp = Math.round(unit.maxHp * mult.hp);
    unit.hp = unit.maxHp;
    unit.damage = Math.round(unit.damage * mult.dmg);
    state.units.push(unit);
    this.bestiary.add(defId);
    this.spawnCooldown = secToTicks(WAVE_SPAWN_INTERVAL_SEC);
  }

  private setBanner(state: SimState, kind: WaveBanner["kind"], name: string): void {
    state.waveBanner = { kind, name, ticks: secToTicks(BOSS_BANNER_SEC) };
  }
}

/** Fold a boon's team modifier into the player's mod set (multiplicative, so
 *  repeats stack). `value` is the buff magnitude; each field knows its direction. */
function foldTeamMod(mods: TeamMods, field: TeamModField, value: number): void {
  switch (field) {
    case "dmgMult":
      mods.dmgMult *= 1 + value;
      break;
    case "moveSpeedMult":
      mods.moveSpeedMult *= 1 + value;
      break;
    case "atkDelayMult":
      mods.atkDelayMult *= 1 / (1 + value); // +attack speed → shorter delay
      break;
    case "damageTakenMult":
      mods.damageTakenMult *= 1 - value; // damage reduction
      break;
    case "lifestealBonus":
      mods.lifestealBonus += value; // additive fraction
      break;
  }
}

function toOffer(id: string): BoonOffer {
  const b = BOONS[id];
  return { id, name: b.name, rarity: b.rarity, description: b.description };
}
