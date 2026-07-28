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
  type TeamRider,
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
  boonCopiesOwned,
  boonDescription,
  boonIntStep,
  boonMaxStacks,
  boonSlotsUsed,
  boonStackStep,
  rollBoonOffers,
  type BoonDef,
  type BoonRarity,
  type BoonStackStep,
  type TeamModField,
} from "@/data/boons";
import {
  ENDLESS_INTERMISSION_HEAL,
  ENDLESS_MOMENTUM_PER_WAVE,
  ENDLESS_RARE_POOL,
  ENDLESS_RHYTHM_MAX,
  ENDLESS_RHYTHM_PER_SEC,
  ENDLESS_REROLLS_START,
  ENDLESS_REROLL_EVERY_WAVES,
  ENDLESS_FINAL_WAVE,
  ENDLESS_ROTATION_BASE,
  ENDLESS_SKIP_HEAL_PCT,
  ENDLESS_STALL_TIME_SEC,
  ENDLESS_WAVE_HARD_CAP_SEC,
  ENDLESS_WAVE_TIME_SEC,
  dungeonForCycle,
  endlessBoonDefenseScale,
  endlessBoonOffenseScale,
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

/** A boon offer surfaced to the UI. `description` is this RANK's own share of the
 *  boon, not the completed thing — what you are buying, not what you'd end up
 *  with. `rank`/`maxRank` let the card say which of the two it is. */
export interface BoonOffer {
  id: string;
  name: string;
  rarity: BoonRarity;
  description: string;
  rank: number;
  maxRank: number;
}

/** A tally row for the "your boons" strip. `count` of `maxRank` ranks bought —
 *  equal means the boon is complete and will never be offered again. */
export interface BoonTally {
  id: string;
  name: string;
  rarity: BoonRarity;
  count: number;
  maxRank: number;
}

/** Read-model handed to the React layer each snapshot. */
export interface EndlessStatus {
  wave: number;
  wavesCleared: number;
  intermission: { wave: number; offers: BoonOffer[] } | null;
  boonsPicked: BoonTally[];
  /** Momentum stacks banked (clean waves since picking it), or null if the boon
   *  isn't owned — drives the HUD chip. */
  momentumStacks: number | null;
  /** Berserker's Rhythm's live attack-speed bonus (0..max), or null if unowned. */
  rhythmBonus: number | null;
  /** Boon rerolls still banked this run. */
  rerollsLeft: number;
  /** True once the capstone wave has been cleared — drives the "Endless
   *  Conquered" intermission and the completed framing on the results card. */
  completedFinalWave: boolean;
  /** True only at the intermission immediately AFTER the capstone fell, i.e.
   *  the one moment the claim/continue choice is offered. */
  atFinalWaveChoice: boolean;
  /** The exclusive deep-tier slots this run has spent. A run may take ONE
   *  legendary and ONE mythic boon, ever; once taken, that whole tier stops being
   *  offered. Surfaced so the pick overlay can say so rather than leaving the
   *  player wondering why the gold cards dried up. */
  legendarySlotUsed: boolean;
  mythicSlotUsed: boolean;
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
  //
  // NOTE two different disciplines live here, and mixing them up is the easy bug:
  //   * most boons FOLD ONCE into state.teamMods at pick time (applyBoon), and
  //   * the wave-scaled ones store an UNSCALED BASE here and are REBUILT from it
  //     at every wave start (applyWaveStartBoons), so their live value tracks the
  //     current wave's curve. applyWaveStartBoons is their single writer — never
  //     fold these into teamMods at pick time or they'll double-apply.
  private intermissionHealPct = ENDLESS_INTERMISSION_HEAL;
  /** Unscaled Mending Aura HP/sec (see endlessBoonDefenseScale). */
  private regenPerSecBase = 0;
  /** Unscaled Bulwark shield. */
  private shieldPerWaveBase = 0;
  /** Unscaled Bloodfeast heal-per-kill. */
  private killHealBase = 0;
  /** Unscaled on-hit riders (Venom Coating's damagePerTick is wave-scaled; the
   *  status riders like Thunderclap's stun carry no flat number and ride along
   *  unchanged). */
  private riderBase: TeamRider[] = [];
  /** Berserker's Rhythm active + its live ramp (ticks since this wave began). */
  private rhythmActive = false;
  private rhythmTicks = 0;
  /** Momentum active — bumps team damage each clean-wave clear. */
  private momentumActive = false;
  /** Clean waves banked since Momentum was picked (HUD display only; the actual
   *  damage fold happens directly on teamMods at each clean clear). */
  private momentumStacks = 0;
  /** Wave-start summon orders (Kennel Master wolves, War Machine turret). */
  private summons: { defId: string; count: number }[] = [];

  // -- Legendary deep-tier boons -------------------------------------------------
  /** Ascendant: total per-wave compounding rate banked (0 = unowned). Applied
   *  again at every wave start, which is what makes it a RATE rather than a level
   *  and gives a strong run its tail — until `ascendantAccruedPct` reaches
   *  `ascendantCapPct`, at which point the warband is as grown as it will ever be.
   *  That ceiling is load-bearing, not flavour: it is what makes total player
   *  power finite, and a finite player is the only reason the wave curve can be
   *  gentle enough to keep deep-run numbers readable. See data/endless.ts. */
  private ascendantPerWave = 0;
  private ascendantCapPct = 0;
  private ascendantAccruedPct = 0;
  /** Warlord's Horn: read + cleared by MatchController's endless branch each wave
   *  (spellChargeUsed lives on the controller, out of reach from here). */
  spellRearmPending = false;
  private spellRechargeOwned = false;
  /** Phoenix Pact revive fraction (0 = unowned). */
  private phoenixHpPct = 0;
  /** Undying Legion: raise EVERY corpse each wave, not just the first to fall. */
  private phoenixAll = false;
  /** Siege Train ramp per 30s of wave (0 = unowned). */
  private siegePctPer30Sec = 0;
  /** Soul Harvest damage per kill for the rest of the wave (0 = unowned). */
  private killStackPct = 0;
  /** uids of the pets summoned last wave, cleared + respawned each wave. */
  private petUids = new Set<string>();

  // -- Stall detection (see ENDLESS_STALL_TIME_SEC) ---------------------------
  /** Ticks elapsed in the current wave, for the absolute hard cap. */
  private waveTicks = 0;
  /** High-watermark of total enemy HP REMOVED this wave, summed as `maxHp - hp`
   *  over every enemy (dead ones sit at hp 0 until the intermission prune, so they
   *  contribute their whole bar). Two properties make this the right signal:
   *  a freshly spawned enemy contributes 0, so the trickle can't fake progress;
   *  and comparing against a watermark rather than the previous frame means a boss
   *  that heals back everything you land never registers, while chipping one does. */
  private damageProgress = 0;
  /** Corpses counted this wave (reset each wave; enemy dead bodies persist until
   *  the intermission prune, so this is monotone within a wave). */
  private killsThisWave = 0;
  /** Spawn queue length at the last progress check. */
  private lastQueueLen = 0;

  /** Ordered boon ids picked (for the tally + replay parity). */
  private picks: string[] = [];
  /** Rerolls banked. Starts at ENDLESS_REROLLS_START, +1 every
   *  ENDLESS_REROLL_EVERY_WAVES cleared; never regenerates otherwise. */
  private rerollsLeft = ENDLESS_REROLLS_START;
  /** Enemy defIds encountered this run (ledger; survives corpse pruning). */
  private bestiary = new Set<string>();
  /** Every enemy killed this run, recorded as corpses are pruned (the compendium
   *  can't scan them off the field afterward). A MULTISET — one entry per kill,
   *  NOT per type — so slay bounties count each kill; the compendium dedupes on
   *  its own side. */
  private slainLog: string[] = [];

  /** Whether the commander brought a battle spell — gates Warlord's Horn out of
   *  the pool entirely when there is no spell for it to recharge. */
  private hasSpell: boolean;

  constructor(seed: number, hasSpell = false) {
    // Own stream, xor-mixed so it never shares draws with the sim RNG.
    this.rng = new RNG((seed ^ 0xe17d1e55) >>> 0);
    this.rotation = this.rng.shuffle(ENDLESS_ROTATION_BASE);
    this.hasSpell = hasSpell;
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
   *  a player wipe or a wave-clock timeout, both handled by MatchController.
   *
   *  DELIBERATELY still unconditional now that wave 100 can be COMPLETED: the
   *  capstone victory is set explicitly by MatchController, never inferred from
   *  an empty field. Weakening this to "0 once you've won" would re-open the
   *  every-intermission-is-a-victory hole it exists to close. */
  get reservesSentinel(): number {
    return 1;
  }

  /** Whether this run has cleared the capstone wave. Latches true and stays
   *  true if the player chooses to press on past it. */
  get completedFinalWave(): boolean {
    return this.wavesCleared >= ENDLESS_FINAL_WAVE;
  }
  /** The run's compendium ledger: everything encountered (`seen`) and the subset
   *  that died to you (`slain`). Accumulated as we spawn + prune, so it survives
   *  corpse pruning that a live-unit scan would miss. */
  ledger(): { seen: string[]; slain: string[] } {
    return { seen: [...this.bestiary], slain: [...this.slainLog] };
  }

  status(): EndlessStatus {
    const slots = boonSlotsUsed(this.picks);
    return {
      wave: this.wave,
      wavesCleared: this.wavesCleared,
      intermission:
        this.phase === "intermission" && this.offers
          ? {
              wave: this.wavesCleared,
              // Described against the wave this pick OPENS, so a scaled boon's
              // card quotes what it will actually be worth. BoonOffer.description
              // is already a plain string, so no UI change is needed.
              offers: this.offers.map((id) =>
                toOffer(id, this.wave + 1, boonCopiesOwned(this.picks, id))
              ),
            }
          : null,
      boonsPicked: this.boonTally(),
      momentumStacks: this.momentumActive ? this.momentumStacks : null,
      rhythmBonus: this.rhythmActive
        ? Math.min(ENDLESS_RHYTHM_MAX, ENDLESS_RHYTHM_PER_SEC * (this.rhythmTicks / TICK_RATE))
        : null,
      rerollsLeft: this.rerollsLeft,
      completedFinalWave: this.completedFinalWave,
      atFinalWaveChoice:
        this.phase === "intermission" && this.wavesCleared === ENDLESS_FINAL_WAVE,
      legendarySlotUsed: slots.legendary,
      mythicSlotUsed: slots.mythic,
    };
  }

  private boonTally(): BoonTally[] {
    const counts = new Map<string, number>();
    for (const id of this.picks) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([id, count]) => {
      const b = BOONS[id];
      return { id, name: b.name, rarity: b.rarity, count, maxRank: boonMaxStacks(b) };
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

    this.trackProgress(state);

    // Berserker's Rhythm: ramp the live attack-speed bonus up over the wave.
    if (this.rhythmActive) {
      this.rhythmTicks++;
      state.teamMods.player.rhythmBonus = Math.min(
        ENDLESS_RHYTHM_MAX,
        ENDLESS_RHYTHM_PER_SEC * (this.rhythmTicks / TICK_RATE)
      );
    }
    // Siege Train: outgoing damage climbs with the wave's elapsed time, and Soul
    // Harvest with its body count (killsThisWave is maintained by trackProgress
    // just above). Both are uncapped by design — they are the deep game's answer
    // to a wave that would otherwise become an unwinnable slog.
    if (this.siegePctPer30Sec > 0) {
      state.teamMods.player.siegeBonus =
        this.siegePctPer30Sec * (this.waveTicks / TICK_RATE / 30);
    }
    if (this.killStackPct > 0) {
      state.teamMods.player.killStackBonus = this.killStackPct * this.killsThisWave;
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

  /** Refresh the stall clock whenever the warband is getting somewhere, and
   *  enforce the absolute per-wave ceiling. Owns every write to `state.clockTicks`
   *  during a wave; MatchController still owns the "clock ran out ⇒ run over"
   *  check, so there is exactly one place a run can end this way.
   *
   *  Progress is any of: an enemy died, the spawn queue drained by one, or the
   *  live enemy HP pool hit a new low for this wave. The last is what makes a
   *  BOSS wave work — there is only one enemy to kill, so a kill-only rule would
   *  guillotine any warband that can't burst a boss inside the stall window. */
  private trackProgress(state: SimState): void {
    this.waveTicks++;
    if (this.waveTicks >= secToTicks(ENDLESS_WAVE_HARD_CAP_SEC)) {
      state.clockTicks = 1; // MatchController ends the run on its next check
      return;
    }

    let kills = 0;
    let removed = 0;
    for (const u of state.units) {
      if (u.team !== "enemy") continue;
      if (u.state === "dead") kills++;
      removed += u.maxHp - u.hp;
    }

    const progressed =
      kills > this.killsThisWave ||
      this.queue.length < this.lastQueueLen ||
      removed > this.damageProgress;

    this.killsThisWave = Math.max(this.killsThisWave, kills);
    this.lastQueueLen = this.queue.length;
    this.damageProgress = Math.max(this.damageProgress, removed);

    if (progressed) {
      state.clockTicks = Math.max(
        state.clockTicks,
        secToTicks(ENDLESS_STALL_TIME_SEC)
      );
    }
  }

  // -- Wave lifecycle ---------------------------------------------------------

  private startWave(state: SimState): void {
    const wave = this.wave;
    state.clockTicks = secToTicks(ENDLESS_WAVE_TIME_SEC); // fresh per-wave backstop
    state.waveBanner = null;
    this.spawnCooldown = 0;
    // Fresh stall accounting for the new wave. The previous wave's corpses are
    // pruned at the intermission, so every counter genuinely restarts at zero.
    this.waveTicks = 0;
    this.damageProgress = 0;
    this.killsThisWave = 0;
    this.lastQueueLen = Infinity;

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

    // A fresh reroll every so many waves cleared.
    if (this.wave % ENDLESS_REROLL_EVERY_WAVES === 0) this.rerollsLeft++;

    // Momentum: a clean wave (no warband death) grants a permanent damage bump.
    // Checked before the heal so a dead unit still counts as a death this wave.
    if (
      this.momentumActive &&
      this.warbandUnits(state).every((u) => u.state !== "dead")
    ) {
      // ADDITIVE stacking: total bonus is +5% × stacks, not ×1.05^stacks — the
      // compounding version eventually outruns the horde's own curve and makes
      // runs literally unkillable. Fold in the ratio that moves the team mult
      // from the old additive total to the new one.
      this.momentumStacks++;
      state.teamMods.player.dmgMult *=
        (1 + ENDLESS_MOMENTUM_PER_WAVE * this.momentumStacks) /
        (1 + ENDLESS_MOMENTUM_PER_WAVE * (this.momentumStacks - 1));
    }

    // Phoenix Pact: one fallen ally comes back as the wave closes. Ordered
    // deliberately — AFTER the Momentum check, so a death still breaks Momentum
    // (you were saved, not spared), and BEFORE the heal so the returned unit gets
    // topped up with everyone else. It also lands before rollBoonOffers, so a
    // phoenixed warband correctly stops forcing Second Chance into the offer.
    if (this.phoenixHpPct > 0) {
      if (this.phoenixAll) {
        for (const u of this.warbandUnits(state)) {
          if (u.state === "dead") reviveUnit(state, u, this.phoenixHpPct);
        }
      } else {
        this.reviveLowest(state, this.phoenixHpPct);
      }
    }

    // Baseline (+ Field Medicine) recovery on the living warband.
    for (const u of this.warbandUnits(state)) {
      if (u.state === "dead") continue;
      const missing = u.maxHp - u.hp;
      if (missing > 0) metaHeal(state, u, Math.round(missing * this.intermissionHealPct));
    }

    const hasDead = this.warbandUnits(state).some((u) => u.state === "dead");
    this.offers = rollBoonOffers(
      this.wave,
      this.rng,
      hasDead,
      this.picks,
      this.hasSpell
    );
    this.phase = "intermission";
  }

  /** Reroll the current offer set. Stays in the intermission — the wave does NOT
   *  advance — so the run's input log records it as its own action.
   *
   *  DETERMINISM: this simply draws from the same RNG stream again. `this.rng` is
   *  a stream, not a hash of the wave, so the second draw naturally differs and
   *  the run stays a pure function of (seed, ordered inputs). Deliberately NO
   *  per-attempt counter — that would make the Nth reroll independent of how many
   *  draws earlier rolls consumed, which is a strictly weaker guarantee. Also
   *  deliberately no "reroll until the set differs" loop: extra draws, a new
   *  edge case, and with the widened rarity table an identical reroll is
   *  vanishingly unlikely anyway.
   *
   *  Returns false when refused, and a refusal must consume NO randomness — see
   *  the guard order below, and the spec that pins it. */
  rerollBoons(state: SimState): boolean {
    if (this.phase !== "intermission" || !this.offers) return false;
    if (this.rerollsLeft <= 0) return false;
    this.rerollsLeft--;
    const hasDead = this.warbandUnits(state).some((u) => u.state === "dead");
    this.offers = rollBoonOffers(
      this.wave,
      this.rng,
      hasDead,
      this.picks,
      this.hasSpell
    );
    return true;
  }

  /** Decline every offer in exchange for extra recovery, and open the next wave.
   *  Same shape as pickBoon (advances the run), so the input log stays a flat
   *  ordered list of actions. */
  skipBoon(state: SimState): boolean {
    if (this.phase !== "intermission" || !this.offers) return false;
    for (const u of this.warbandUnits(state)) {
      if (u.state === "dead") continue;
      const missing = u.maxHp - u.hp;
      if (missing > 0) {
        metaHeal(state, u, Math.round(missing * ENDLESS_SKIP_HEAL_PCT));
      }
    }
    this.offers = null;
    this.wave += 1;
    this.startWave(state);
    return true;
  }

  /** Apply the chosen offer and open the next wave. Returns false if not in an
   *  intermission or the index is out of range (idempotent-safe). */
  pickBoon(state: SimState, offerIndex: number): boolean {
    if (this.phase !== "intermission" || !this.offers) return false;
    if (offerIndex < 0 || offerIndex >= this.offers.length) return false;
    const boon = BOONS[this.offers[offerIndex]];
    if (!boon) return false;

    // Which RANK this copy is decides how much of the boon it buys.
    this.applyBoon(state, boon, boonStackStep(boon, boonCopiesOwned(this.picks, boon.id)));
    this.picks.push(boon.id);
    this.offers = null;
    this.wave += 1;
    this.startWave(state);
    return true;
  }

  // -- Boon application -------------------------------------------------------

  /** Apply ONE RANK of a boon. `step` is that rank's share of the boon's headline
   *  (see boonStackStep) — every number below is scaled by it, so three ranks of
   *  Hardy add up to the +26% its card promises and there is no fourth.
   *
   *  The multiplicative fields drift a hair above the headline, because the
   *  controller folds each rank separately ((1+.065)(1+.091)(1+.104) = 1.283 for a
   *  1.26 headline) rather than solving for the exact product. Two percent on a
   *  bounded total is not worth the arithmetic; boonStackSummary mirrors the same
   *  folds so the panel and the sim never disagree about what you own. */
  private applyBoon(state: SimState, boon: BoonDef, step: BoonStackStep): void {
    const f = step.frac;
    for (const eff of boon.effects) {
      switch (eff.type) {
        case "teamMod":
          foldTeamMod(state.teamMods.player, eff.field, eff.value * f);
          break;
        case "maxHp":
          this.applyMaxHp(state, eff.pct * f);
          break;
        case "intermissionHeal":
          this.intermissionHealPct = Math.min(
            0.9,
            this.intermissionHealPct + eff.addPct * f
          );
          break;
        // The wave-scaled family: record the UNSCALED base; applyWaveStartBoons
        // rebuilds the live value against the current wave's curve.
        case "regen":
          this.regenPerSecBase += eff.hpPerSec * f;
          break;
        case "waveShield":
          this.shieldPerWaveBase += eff.amount * f;
          break;
        case "revive":
          // Never rank-scaled: half a revive is not a thing, and the boon that
          // carries this is the force-offered one that pays full value every time.
          this.reviveLowest(state, eff.hpPct);
          break;
        // --- slice-2 proc / mechanic boons ---
        case "execute":
          state.teamMods.player.executeBonus += eff.bonus * f;
          break;
        case "thorns":
          state.teamMods.player.thornsFrac += eff.frac * f;
          break;
        case "killHeal":
          this.killHealBase += eff.amount * f; // wave-scaled at wave start
          break;
        case "bounty":
          // Bounty Hunter grants PERMANENT max HP per kill, so it is the one flat
          // boon that must NOT ride the enemy curve: scaled naively a wave-70 kill
          // would grant ~150 max HP, and 40 of them ~6,000, compounding forever —
          // the exact runaway the deep-end backstop exists to prevent. It scales
          // off the killer's OWN max HP instead, capped per wave AND per run in
          // dealDamage (the per-wave cap alone is still an exponential).
          state.teamMods.player.bountyPct += eff.pctOfMax * f;
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
          state.teamMods.player.rangedLifesteal += eff.frac * f;
          break;
        case "rhythm":
          this.rhythmActive = true;
          break;
        case "momentum":
          this.momentumActive = true;
          break;
        case "onHitRider": {
          // Base only — applyWaveStartBoons rebuilds teamMods.onHitRiders so a
          // rider's flat damagePerTick tracks the wave. A second RANK deepens the
          // rider it already owns rather than pushing a duplicate: two entries
          // with the same cadence would fire twice per proc, which is a different
          // (and much stronger) boon than the card describes.
          const existing = this.riderBase.find(
            (r) => r.effectType === eff.effectType && r.everyNth === eff.everyNth
          );
          if (existing && eff.damagePerTick != null) {
            existing.damagePerTick = (existing.damagePerTick ?? 0) + eff.damagePerTick * f;
          } else if (!existing) {
            this.riderBase.push({
              effectType: eff.effectType,
              everyNth: eff.everyNth,
              durationSec: eff.durationSec,
              magnitude: eff.magnitude,
              damagePerTick:
                eff.damagePerTick == null ? undefined : eff.damagePerTick * f,
              tickIntervalSec: eff.tickIntervalSec,
            });
          }
          break;
        }
        case "waveSummon": {
          // Whole bodies only: the rank's share is rounded off the running total
          // so N ranks summon exactly the headline count, never N+1.
          const add = boonIntStep(eff.count, step);
          if (add > 0) {
            const owned = this.summons.find((s) => s.defId === eff.defId);
            if (owned) owned.count += add;
            else this.summons.push({ defId: eff.defId, count: add });
          }
          break;
        }
        // --- legendary deep tier ---
        case "ascendant":
          // The base lands immediately; the per-wave part is re-applied at every
          // subsequent wave start (see applyWaveStartBoons) until it has accrued
          // its cap, which is what keeps total player power finite.
          this.applyMaxHp(state, eff.basePct * f);
          foldTeamMod(state.teamMods.player, "dmgMult", eff.basePct * f);
          this.ascendantPerWave += eff.perWavePct * f;
          this.ascendantCapPct += eff.capPct * f;
          break;
        case "spellRecharge":
          this.spellRechargeOwned = true;
          this.spellRearmPending = true; // and again at every wave start
          break;
        case "phoenix":
          this.phoenixHpPct = Math.max(this.phoenixHpPct, eff.hpPct);
          if (eff.all) this.phoenixAll = true;
          break;
        case "maxHpRend":
          state.teamMods.player.maxHpRend += eff.frac * f;
          break;
        case "siege":
          this.siegePctPer30Sec = eff.pctPer30Sec;
          break;
        case "killStack":
          this.killStackPct += eff.dmgPct * f;
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
   *  HoT, and arm the Last Breath charge. Also re-arms the units' own once-per-
   *  battle one-shots, resets the rhythm ramp and summons fresh pets. Called at
   *  the top of every wave.
   *
   *  Also the SINGLE WRITER for the wave-scaled boon family (see the base fields
   *  above): their live values are rebuilt here from the unscaled bases against
   *  this wave's curve, so a Bulwark taken at wave 5 is still worth taking at
   *  wave 50 and the "don't pick the flat ones early" trap is gone. */
  private applyWaveStartBoons(state: SimState): void {
    const lastBreath = state.teamMods.player.lastBreath;
    const defScale = endlessBoonDefenseScale(this.wave);
    const shieldPerWave = Math.round(this.shieldPerWaveBase * defScale);
    const regenPerSec = this.regenPerSecBase * defScale;

    // Ascendant: the compounding tick. Applied every wave, so owning it raises
    // the warband's growth RATE rather than its level — but only until it has
    // paid out `ascendantCapPct` in total. After that the tick is a no-op and the
    // warband is finished growing while the horde is not, which is exactly how an
    // endless run is guaranteed to end now that the curve itself is gentle.
    if (this.ascendantPerWave > 0) {
      const grant = Math.min(
        this.ascendantPerWave,
        this.ascendantCapPct - this.ascendantAccruedPct
      );
      if (grant > 0) {
        this.ascendantAccruedPct += grant;
        this.applyMaxHp(state, grant);
        foldTeamMod(state.teamMods.player, "dmgMult", grant);
      }
    }
    // Warlord's Horn re-arms the commander's spell; MatchController reads this.
    if (this.spellRechargeOwned) this.spellRearmPending = true;
    // Fresh per-wave ramps for Siege Train / Soul Harvest.
    state.teamMods.player.siegeBonus = 0;
    state.teamMods.player.killStackBonus = 0;

    // Rebuild (never accumulate) the scaled team mods for this wave.
    state.teamMods.player.killHeal = Math.round(this.killHealBase * defScale);
    if (this.riderBase.length > 0) {
      const offScale = endlessBoonOffenseScale(this.wave);
      state.teamMods.player.onHitRiders = this.riderBase.map((r) => ({
        ...r,
        damagePerTick:
          r.damagePerTick == null
            ? undefined
            : Math.round(r.damagePerTick * offScale),
      }));
    }
    for (const u of this.warbandUnits(state)) {
      if (u.state === "dead") continue;
      if (lastBreath) u.cheatDeathReady = true;
      // Each wave is a fresh fight: re-arm the once-per-battle one-shots — the
      // death-cheats (Vanish / Second Wind / Last Stand), the Phasecloak item's
      // one-time stealth, the Seraph's Resurrection, and the Ambush opener
      // (flag is only ever set for ability "ambush"; re-arming includes its
      // opening stealth, like onSpawn).
      u.vanishUsed = false;
      u.secondWindUsed = false;
      u.lastStandUsed = false;
      u.stealthTriggerUsed = false;
      u.resurrectionUsed = false;
      // Fresh Bounty Hunter allowance, measured against this wave's opening max HP.
      u.bountyWaveGain = 0;
      u.bountyBaseHp = u.maxHp;
      // The RUN-total allowance is latched once, at the first wave, and never
      // refreshed — that is the whole point of it (see BOUNTY_TOTAL_CAP_FRAC).
      if (u.bountyRunBase === 0) u.bountyRunBase = u.maxHp;
      if (u.ability === "ambush") {
        u.ambushReady = true;
        applyEffect(
          u,
          makeEffect("stealth", { source: u.uid, durationSec: ENDLESS_WAVE_TIME_SEC })
        );
      }
      if (shieldPerWave > 0) {
        u.shieldHp = Math.max(u.shieldHp, shieldPerWave);
        u.shieldHpMax = Math.max(u.shieldHpMax, shieldPerWave);
      }
      if (regenPerSec > 0) {
        applyEffect(
          u,
          makeEffect("regen", {
            source: u.uid,
            healPerTick: regenPerSec,
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
      if (u.team === "enemy" && u.state === "dead") this.slainLog.push(u.defId);
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

function toOffer(id: string, wave: number, copiesOwned: number): BoonOffer {
  const b = BOONS[id];
  const maxRank = boonMaxStacks(b);
  return {
    id,
    name: b.name,
    rarity: b.rarity,
    description: boonDescription(id, wave, boonStackStep(b, copiesOwned)),
    // Clamped because Second Chance is force-offered and deliberately repeatable,
    // so its copy count can outrun its (nominal) single rank.
    rank: Math.min(copiesOwned + 1, maxRank),
    maxRank,
  };
}
