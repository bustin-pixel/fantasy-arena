// ============================================================================
// WaveController
// The dungeon horde director — a meta-layer piece like MatchController, NOT
// part of the per-tick combat core. It builds a floor's monsters deterministically
// from (seed, floor) and feeds them onto the field.
//
// Two shapes:
//  • Normal floors — a flat queue that TRICKLES in from the top edge whenever the
//    enemy side has room, so the simultaneous count stays bounded.
//  • Boss floors — a phased CLIMAX: the fodder pool pours in (bounded by the enemy
//    cap) and must be fully CLEARED (no enemies left alive) before anything else;
//    then the rare quest catalyst (if it rolled) enters alone; then the boss. The
//    rare and the boss are each preceded by a telegraph banner (state.waveBanner).
//    This stops the boss from sharing the field with the whole horde.
//
// Determinism: it owns its own seeded RNG (separate stream from the sim RNG, so a
// dungeon never perturbs Arena battles). The monster composition + spawn positions
// are byte-identical to the old single-queue build (same RNG call order) — only the
// PACING is new. Same seed + floor + player inputs ⇒ identical run.
// ============================================================================

import { RNG } from "@/utils/rng";
import { FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { createUnit } from "@/entities/createUnit";
import { getUnitDef } from "@/data/units";
import type { SimState } from "./CombatSystem";
import {
  BOSS_BANNER_SEC,
  BOSS_TELEGRAPH_SEC,
  WAVE_SPAWN_INTERVAL_SEC,
} from "@/data/depths";
import {
  floorStatMultipliersIn,
  isBossFloorIn,
  monsterLevelFor,
  questForFloorIn,
  tierForFloorIn,
  waveBudgetIn,
  type Dungeon,
  type MonsterSpawnKind,
} from "@/data/dungeons";
import {
  CURSED_BUDGET_MULT,
  CURSED_DMG_MULT,
  CURSED_HP_MULT,
  QUARRY_FODDER_SHARE,
  type EncounterKind,
} from "@/data/encounters";
import type { TierId } from "@/data/tiers";

/** Spawn y — nudged to the top edge so monsters visibly creep in from
 *  off-screen (movement clamps them fully on-field on their first step). */
const SPAWN_Y = 18;

/** Spend `budget` on a cost-weighted monster pool (cheap fodder dominates). Pure
 *  + deterministic in `rng`'s call order — shared by the WaveController's floor
 *  builds and the EndlessController's fodder waves so both compose identically. */
export function buildFodderQueue(
  rng: RNG,
  monsters: Record<string, number>,
  budget: number
): string[] {
  const ids = Object.keys(monsters);
  const out: string[] = [];
  let guard = 0;
  while (budget > 0 && guard < 500) {
    guard++;
    const affordable = ids.filter((id) => monsters[id] <= budget);
    if (affordable.length === 0) break;
    const pick = rng.pick(affordable);
    out.push(pick);
    budget -= monsters[pick];
  }
  return out;
}

/** Boss-floor phases, in order:
 *  fodder → (rare_telegraph → rare)? → boss_telegraph → boss → done. */
type BossPhase =
  | "fodder"
  | "rare_telegraph"
  | "rare"
  | "boss_telegraph"
  | "boss"
  | "done";

export class WaveController {
  readonly floor: number;
  private readonly dungeon: Dungeon;
  private rng: RNG;
  private spawnCooldown = 0;
  private readonly isBoss: boolean;
  /** True when the boss was flagged explicitly (the RNG "hunt for the boss"
   *  lair) rather than derived from the floor number — the fusion-quest catalyst
   *  then rides this boss regardless of its floor number. */
  private readonly bossIsLair: boolean;
  /** On the boss floor, skip the fusion-quest rare roll — the run already met
   *  its rare on a rare-quarry encounter floor (mutual exclusivity). */
  private readonly suppressQuestRare: boolean;
  /** This floor's encounter flavor (cursed/rare_spawn/… reshape the horde). */
  private readonly encounter: EncounterKind;
  /** Difficulty tier — shifts monster LEVELS only (the band map inside
   *  monsterLevelFor); composition, budget, and floor scaling are untouched. */
  private readonly tier: TierId;
  /** Runs the phased plan (boss floors AND rare-quarry floors) vs the trickle. */
  private isPhased = false;
  /** Whether the phased plan ends in a boss (false for a rare-quarry floor). */
  private hasBoss = true;

  // -- Normal-floor state: a flat trickle queue. --
  private queue: string[] = [];

  // -- Boss-floor state: a phased plan + a small state machine. --
  private fodder: string[] = []; // the whole boss-floor fodder pool
  private catalyst: string | null = null; // rolled rare quest spawn, or null
  private boss = "";
  private phase: BossPhase = "fodder";
  /** Monsters of the CURRENT batch (fodder pool / [catalyst] / [boss]) still to spawn. */
  private pending: string[] = [];
  private telegraphTicks = 0;
  private total = 0; // total monsters in the plan (for `remaining`)
  private spawned = 0;

  constructor(
    seed: number,
    dungeon: Dungeon,
    floor: number,
    encounter: EncounterKind = "normal",
    /** Whether this floor is the boss lair. In the RNG "hunt for the boss"
     *  descent the boss sits at a run-seeded random depth, so the caller passes
     *  it explicitly; omitted, it falls back to the legacy every-Nth-floor rule
     *  (isBossFloorIn) so existing tests stay byte-identical. */
    isBoss?: boolean,
    /** On the boss floor, skip the fusion-quest rare roll (the run already met
     *  its rare on a rare-quarry encounter). Ignored off the boss floor. */
    suppressQuestRare: boolean = false,
    /** Difficulty tier — Normal keeps every existing caller byte-identical. */
    tier: TierId = "normal"
  ) {
    this.floor = floor;
    this.dungeon = dungeon;
    this.encounter = encounter;
    this.tier = tier;
    // Mix the floor into the seed so every floor of one run rolls fresh.
    this.rng = new RNG((seed ^ 0x5eed50a1 ^ Math.imul(floor, 0x9e3779b9)) >>> 0);
    this.isBoss = isBoss ?? isBossFloorIn(dungeon, floor);
    this.bossIsLair = isBoss === true;
    this.suppressQuestRare = suppressQuestRare;
    if (this.isBoss) {
      this.isPhased = true;
      this.buildBossPlan();
    } else if (encounter === "rare_spawn" && dungeon.quest) {
      // A rare-quarry floor: reuse the phased machine (fodder → rare → done),
      // spawning the fusion-quest rare as the telegraphed finale, no boss.
      // Gated on the dungeon HAVING a quest: the rare banner belongs to the
      // fusion-quest rare alone, so a questless dungeon falls through to a
      // plain floor rather than promoting an ordinary monster to stand in.
      // (assignOmens never offers rare_spawn without a quest — belt-and-braces.)
      this.isPhased = true;
      this.hasBoss = false;
      this.buildRarePlan();
    } else {
      // Normal / cursed / treasure_vault floors: the flat bounded trickle.
      // Cursed throws a bigger horde (its own seed stream, so a NORMAL floor's
      // composition stays byte-identical to before).
      const budget =
        encounter === "cursed"
          ? Math.round(waveBudgetIn(dungeon, floor) * CURSED_BUDGET_MULT)
          : waveBudgetIn(dungeon, floor);
      this.queue = this.buildFodder(budget);
    }
  }

  /** Spend `budget` on this floor's tier monsters (cheap fodder dominates). Wraps
   *  the shared pure builder — identical RNG call order to the old inline loop. */
  private buildFodder(budget: number): string[] {
    const tier = tierForFloorIn(this.dungeon, this.floor);
    return buildFodderQueue(this.rng, tier.monsters, budget);
  }

  /** Compose the boss floor: one fodder pool, roll the rare catalyst, then the
   *  boss. The fodder loop + catalyst roll happen in the SAME order as the old
   *  build, so the composition stays byte-identical; only the pacing is new. */
  private buildBossPlan(): void {
    const tier = tierForFloorIn(this.dungeon, this.floor);
    const fodderBudget = Math.max(
      2,
      Math.round(waveBudgetIn(this.dungeon, this.floor) * this.dungeon.bossFloorFodderShare)
    );
    this.fodder = this.buildFodder(fodderBudget);

    // The fusion-quest catalyst rides the boss floor — UNLESS the run already
    // met its rare on a rare-quarry encounter (suppressQuestRare). In the
    // RNG-run model the boss lair can sit on any floor, so the quest comes off
    // the dungeon directly; the legacy every-Nth path keeps the floor match.
    const quest = this.suppressQuestRare
      ? undefined
      : this.bossIsLair
        ? this.dungeon.quest
        : questForFloorIn(this.dungeon, this.floor);
    if (quest && this.rng.next() < quest.chance) this.catalyst = quest.spawnId;
    this.boss = tier.boss;
    this.total = this.fodder.length + (this.catalyst ? 1 : 0) + 1; // +1 boss

    // Kick off the fodder pool (or skip straight to the climax if a floor somehow
    // has no fodder). `pending` is a copy so `fodder` stays intact for planForTest.
    if (this.fodder.length > 0) {
      this.phase = "fodder";
      this.pending = this.fodder.slice();
    } else if (this.catalyst) {
      this.beginTelegraph(null, "rare_telegraph");
    } else {
      this.beginTelegraph(null, "boss_telegraph");
    }
  }

  /** Compose a RARE QUARRY floor: a lead-in fodder pool, then the dungeon's
   *  fusion-quest RARE (GUARANTEED — the whole point of the encounter),
   *  telegraphed like a boss. No dungeon boss; the phase machine ends after the
   *  rare falls. Only ever called with a quest present (see the constructor). */
  private buildRarePlan(): void {
    const fodderBudget = Math.max(
      2,
      Math.round(waveBudgetIn(this.dungeon, this.floor) * QUARRY_FODDER_SHARE)
    );
    this.fodder = this.buildFodder(fodderBudget);
    this.catalyst = this.dungeon.quest!.spawnId;
    this.boss = "";
    this.total = this.fodder.length + 1; // +1 rare (no boss)
    if (this.fodder.length > 0) {
      this.phase = "fodder";
      this.pending = this.fodder.slice();
    } else {
      this.beginTelegraph(null, "rare_telegraph");
    }
  }

  /** Monsters not yet on the field — the sim's `enemyReserves`, so a cleared
   *  board is only a victory once the whole floor (incl. the un-spawned boss) is
   *  spent. During a telegraph the field can be empty while this stays > 0, which
   *  is exactly what keeps the win check from firing before the boss arrives. */
  get remaining(): number {
    return this.isPhased ? this.total - this.spawned : this.queue.length;
  }

  /** Called once per battle tick (before stepSimulation). */
  step(state: SimState): void {
    if (this.isPhased) this.stepBoss(state);
    else this.stepTrickle(state);
  }

  // -- Normal floor: the original bounded trickle. --------------------------
  private stepTrickle(state: SimState): void {
    if (this.queue.length === 0) return;
    if (this.spawnCooldown > 0) {
      this.spawnCooldown--;
      return;
    }
    if (this.enemiesAlive(state) >= state.activeCaps.enemy) return;
    this.spawnMonster(state, this.queue.shift()!, "fodder");
  }

  // -- Boss floor: fodder pool → rare → boss, gated on clearing each batch. ----
  private stepBoss(state: SimState): void {
    // Publish any banner staged before we held a state ref (no-fodder edge case).
    if (this.pendingBanner) {
      state.waveBanner = this.pendingBanner;
      this.pendingBanner = null;
    }
    // Banner countdown runs every tick so it can linger past the spawn.
    if (state.waveBanner) {
      state.waveBanner.ticks--;
      if (state.waveBanner.ticks <= 0) state.waveBanner = null;
    }
    if (this.phase === "done") return;

    // Telegraph: hold for the pause, then release the rare/boss into `pending`.
    if (this.phase === "rare_telegraph" || this.phase === "boss_telegraph") {
      if (this.telegraphTicks > 0) {
        this.telegraphTicks--;
        return;
      }
      if (this.phase === "rare_telegraph") {
        this.pending = [this.catalyst!];
        this.phase = "rare";
      } else {
        this.pending = [this.boss];
        this.phase = "boss";
      }
      this.spawnCooldown = 0; // enter immediately after the pause
    }

    // Spawn the current batch, trickling under the concurrent cap.
    if (this.pending.length > 0) {
      if (this.spawnCooldown > 0) {
        this.spawnCooldown--;
        return;
      }
      if (this.enemiesAlive(state) >= state.activeCaps.enemy) return;
      const kind: MonsterSpawnKind =
        this.phase === "rare" ? "rare" : this.phase === "boss" ? "boss" : "fodder";
      this.spawnMonster(state, this.pending.shift()!, kind);
      return;
    }

    // Batch fully spawned — the next thing only comes once the field is CLEAR.
    if (this.enemiesAlive(state) > 0) return;
    this.advance(state);
  }

  /** The batch just cleared — move on to the rare, or the boss, or finish. */
  private advance(state: SimState): void {
    if (this.phase === "fodder") {
      // Fodder cleared → the rare (if it rolled), else straight to the boss.
      if (this.catalyst) this.beginTelegraph(state, "rare_telegraph");
      else this.beginTelegraph(state, "boss_telegraph");
    } else if (this.phase === "rare") {
      // Boss floor → on to the boss; rare quarry → the rare was the finale.
      if (this.hasBoss) this.beginTelegraph(state, "boss_telegraph");
      else this.phase = "done";
    } else if (this.phase === "boss") {
      this.phase = "done";
    }
  }

  /** Enter a telegraph phase: raise the banner NOW and start the pre-spawn pause.
   *  `state` is null only when called from the constructor (no-fodder edge case),
   *  where the banner is stashed and published on the first step. */
  private beginTelegraph(
    state: SimState | null,
    phase: "rare_telegraph" | "boss_telegraph"
  ): void {
    this.phase = phase;
    this.telegraphTicks = secToTicks(BOSS_TELEGRAPH_SEC);
    const isRare = phase === "rare_telegraph";
    const id = isRare ? this.catalyst! : this.boss;
    const banner: SimState["waveBanner"] = {
      kind: isRare ? "rare" : "boss",
      name: getUnitDef(id).name,
      ticks: secToTicks(BOSS_BANNER_SEC),
    };
    if (state) state.waveBanner = banner;
    else this.pendingBanner = banner;
  }

  /** Banner staged in the constructor before we held a state ref. */
  private pendingBanner: SimState["waveBanner"] = null;

  private enemiesAlive(state: SimState): number {
    return state.units.filter((u) => u.team === "enemy" && u.state !== "dead")
      .length;
  }

  private spawnMonster(
    state: SimState,
    defId: string,
    kind: MonsterSpawnKind
  ): void {
    const x = this.rng.float(60, FIELD_WIDTH - 60);
    // Monsters carry the dungeon's tier-banded unit level (elites +1) through
    // the same createUnit bake as player units — level consumes no RNG, so a
    // floor's composition and positions are identical at every tier.
    const level = monsterLevelFor(this.dungeon, kind, this.tier);
    const unit = createUnit(defId, "enemy", { x, y: SPAWN_Y }, level);
    // Depth pressure: monsters (bosses included) spawn pre-scaled by floor,
    // layered ON TOP of the level bake (nested rounding — see NOTES §8).
    const mult = floorStatMultipliersIn(this.dungeon, this.floor);
    // Cursed floors also thicken/harden every monster (no RNG draw — a plain
    // floor's spawned stats are unchanged).
    const cursed = this.encounter === "cursed";
    const hpMult = cursed ? mult.hp * CURSED_HP_MULT : mult.hp;
    const dmgMult = cursed ? mult.dmg * CURSED_DMG_MULT : mult.dmg;
    unit.maxHp = Math.round(unit.maxHp * hpMult);
    unit.hp = unit.maxHp;
    unit.damage = Math.round(unit.damage * dmgMult);
    state.units.push(unit);
    if (this.isPhased) this.spawned++;
    this.spawnCooldown = secToTicks(WAVE_SPAWN_INTERVAL_SEC);
  }

  /** For tests: the boss-floor plan (fodder pool, rolled catalyst, boss). Null on
   *  non-boss floors. Lets specs assert composition without simulating a clear. */
  planForTest(): { fodder: string[]; catalyst: string | null; boss: string } | null {
    if (!this.isPhased) return null;
    return { fodder: this.fodder, catalyst: this.catalyst, boss: this.boss };
  }
}
