// ============================================================================
// WaveController
// The Depths' horde director — a meta-layer piece like MatchController, NOT
// part of the per-tick combat core. It builds a floor's monster queue
// deterministically from (seed, floor) and trickles spawns in from the top
// edge whenever the enemy side has room, so the *simultaneous* unit count
// stays bounded no matter how big the total wave is.
//
// Determinism: it owns its own seeded RNG (separate stream from the sim RNG,
// so adding Depths never perturbs Arena battles). Same seed + floor + player
// inputs ⇒ identical spawn order, timing and positions.
// ============================================================================

import { RNG } from "@/utils/rng";
import { FIELD_WIDTH, secToTicks } from "@/utils/constants";
import { createUnit } from "@/entities/createUnit";
import type { SimState } from "./CombatSystem";
import { WAVE_SPAWN_INTERVAL_SEC } from "@/data/depths";
import {
  floorStatMultipliersIn,
  isBossFloorIn,
  questForFloorIn,
  tierForFloorIn,
  waveBudgetIn,
  type Dungeon,
} from "@/data/dungeons";

/** Spawn y — nudged to the top edge so monsters visibly creep in from
 *  off-screen (movement clamps them fully on-field on their first step). */
const SPAWN_Y = 18;

export class WaveController {
  readonly floor: number;
  private readonly dungeon: Dungeon;
  /** Monsters still waiting off-screen, in spawn order (boss last). */
  private queue: string[];
  private rng: RNG;
  private spawnCooldown = 0;

  constructor(seed: number, dungeon: Dungeon, floor: number) {
    this.floor = floor;
    this.dungeon = dungeon;
    // Mix the floor into the seed so every floor of one run rolls fresh waves.
    this.rng = new RNG((seed ^ 0x5eed50a1 ^ Math.imul(floor, 0x9e3779b9)) >>> 0);
    this.queue = this.buildQueue();
  }

  /** Compose the floor's wave: spend the budget on tier monsters (cheap fodder
   *  naturally dominates), then append the boss on boss floors. */
  private buildQueue(): string[] {
    const tier = tierForFloorIn(this.dungeon, this.floor);
    const boss = isBossFloorIn(this.dungeon, this.floor);
    let budget = waveBudgetIn(this.dungeon, this.floor);
    if (boss)
      budget = Math.max(
        2,
        Math.round(budget * this.dungeon.bossFloorFodderShare)
      );

    const ids = Object.keys(tier.monsters);
    const queue: string[] = [];
    let guard = 0;
    while (budget > 0 && guard < 500) {
      guard++;
      const affordable = ids.filter((id) => tier.monsters[id] <= budget);
      if (affordable.length === 0) break;
      const pick = this.rng.pick(affordable);
      queue.push(pick);
      budget -= tier.monsters[pick];
    }
    // Rare-spawn quest: a rare legendary may crash this floor. Rolled AFTER the
    // fodder loop (so the horde composition stays byte-identical) and inserted
    // BEFORE the boss (so the boss remains the wave's finale). See data/dungeons.
    const quest = questForFloorIn(this.dungeon, this.floor);
    if (quest && this.rng.next() < quest.chance) queue.push(quest.spawnId);
    if (boss) queue.push(tier.boss);
    return queue;
  }

  /** Monsters not yet on the field — the sim's `enemyReserves`, so a cleared
   *  board is only a victory once the whole horde is spent. */
  get remaining(): number {
    return this.queue.length;
  }

  /** Called once per battle tick (before stepSimulation): if the pacing timer
   *  is up and the enemy side is below its concurrent cap, the next queued
   *  monster creeps in at a random spot along the top edge. */
  step(state: SimState): void {
    if (this.queue.length === 0) return;
    if (this.spawnCooldown > 0) {
      this.spawnCooldown--;
      return;
    }
    const active = state.units.filter(
      (u) => u.team === "enemy" && u.state !== "dead"
    ).length;
    if (active >= state.activeCaps.enemy) return;

    const defId = this.queue.shift()!;
    const x = this.rng.float(60, FIELD_WIDTH - 60);
    const unit = createUnit(defId, "enemy", { x, y: SPAWN_Y });
    // Depth pressure: monsters (bosses included) spawn pre-scaled by floor.
    // Applied here — not in createUnit — so summons/arena stay untouched.
    const mult = floorStatMultipliersIn(this.dungeon, this.floor);
    unit.maxHp = Math.round(unit.maxHp * mult.hp);
    unit.hp = unit.maxHp;
    unit.damage = Math.round(unit.damage * mult.dmg);
    state.units.push(unit);
    this.spawnCooldown = secToTicks(WAVE_SPAWN_INTERVAL_SEC);
  }
}
