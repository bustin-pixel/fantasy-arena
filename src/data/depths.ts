// ============================================================================
// THE DEPTHS — floor / wave data
// Declarative tuning for the PvE descent. The WaveController reads these to
// build a floor's monster queue; nothing here runs inside the tick loop.
//
// Floors roll out the bestiary in themed tiers; every BOSS_FLOOR_INTERVAL-th
// floor appends the tier's boss to the end of the wave (it emerges once the
// fodder has thinned). Wave sizes are budget-driven, mirroring the AIDeck
// cost model: deeper floor → bigger budget → more / meatier monsters.
// ============================================================================

export interface DepthsTier {
  /** Inclusive floor range this tier covers. */
  floors: [number, number];
  /** Monster id → wave-budget cost. Cheap fodder fills a wave; costly
   *  monsters make it meaner. */
  monsters: Record<string, number>;
  /** Boss appended on boss floors (every 5th). */
  boss: string;
}

/** Every 5th floor is a boss floor. */
export const BOSS_FLOOR_INTERVAL = 5;

/** Fraction of a boss floor's budget spent on fodder (the rest is the boss). */
export const BOSS_FLOOR_FODDER_SHARE = 0.5;

/** Seconds between trickle-spawns while the field has room. */
export const WAVE_SPAWN_INTERVAL_SEC = 0.7;

/**
 * The tier rollout. Only the fodder tier exists so far (Depths slice 1);
 * later tiers (undead / deep crypt / the throne) slot in as their monsters
 * are built. Floors past the last tier reuse it.
 */
export const DEPTHS_TIERS: DepthsTier[] = [
  {
    floors: [1, 5],
    // Cheap costs keep early waves swarmy — floor 1 (budget 13) rolls a dozen
    // or so bodies rather than a handful of expensive ones.
    monsters: { giant_rat: 1, skeleton: 1, zombie_shambler: 2 },
    boss: "bloater",
  },
];

export function tierForFloor(floor: number): DepthsTier {
  for (const tier of DEPTHS_TIERS) {
    if (floor >= tier.floors[0] && floor <= tier.floors[1]) return tier;
  }
  return DEPTHS_TIERS[DEPTHS_TIERS.length - 1];
}

/** Total wave budget for a floor — the difficulty dial. Floor 1 ≈ a dozen
 *  fodder monsters; each floor deeper adds a few more. */
export function waveBudget(floor: number): number {
  return 10 + floor * 3;
}

export function isBossFloor(floor: number): boolean {
  return floor % BOSS_FLOOR_INTERVAL === 0;
}
