// ============================================================================
// CORE TYPES
// All shared types for the deterministic combat slice live here.
// These are intentionally framework-agnostic (no React) so the engine can be
// lifted onto a Node.js/Colyseus server unchanged for multiplayer.
// ============================================================================

export type Rarity = "rare" | "epic" | "legendary";

export type Team = "player" | "enemy";

/** Finite states a unit can occupy. Transitions go through the state machine. */
export type UnitState =
  | "idle"
  | "moving"
  | "attacking"
  | "casting"
  | "stunned"
  | "dead";

export type StatusEffectType =
  | "burn"
  | "slow"
  | "stun"
  | "shield"
  | "haste"
  | "poison"
  | "silence"
  | "stealth"
  | "death_immune"
  | "taunt"
  | "fear";

export type AbilityId =
  | "crushing_slam"
  | "lifesteal"
  | "kiting_leap"
  | "shield_block"
  | "taunt_roar"
  | "aegis"
  | "fireball"
  | "frost_blast"
  | "ambush"
  | "charge"
  | "bloodrage"
  | "fear_aura"
  | "raise_dead"
  | "slime_split"
  | "mystic_shift"
  | "arcane_barrage"
  | "mend"
  | "summon_wolves";

export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Data definitions (loaded from /data, never mutated at runtime)
// ---------------------------------------------------------------------------

export interface AbilityDef {
  id: AbilityId;
  name: string;
  description: string;
  /** Cooldown in seconds. */
  cooldown: number;
}

export interface UnitDef {
  id: string;
  name: string;
  rarity: Rarity;
  hp: number;
  damage: number;
  /** Seconds between attacks. */
  attackSpeed: number;
  /** Pixels per simulation second. */
  moveSpeed: number;
  /** Attack range in pixels. */
  range: number;
  ability: AbilityId;
  /** Fraction of basic-attack damage healed back (0..1). Passive; independent
   *  of the ability slot, so a unit can have both lifesteal and an active. */
  lifesteal?: number;
  /** Accent color used for procedural sprite + portrait. */
  color: string;
  /** Hex accent for ability effects/projectiles. */
  accent: string;
  role: string;
  /** Damage school of this unit's attacks/abilities. Absent = physical. */
  school?: "physical" | "magic";
  /** Human-readable passive traits (engine-coded behaviors) for the detail UI. */
  traits?: { name: string; description: string }[];
}

// ---------------------------------------------------------------------------
// Runtime simulation state (mutated only by the engine, deterministically)
// ---------------------------------------------------------------------------

export interface ActiveStatusEffect {
  type: StatusEffectType;
  /** Remaining duration in ticks. */
  ticksLeft: number;
  /** For DoT effects: ticks between damage applications. */
  tickInterval?: number;
  /** Countdown to next DoT application. */
  tickCountdown?: number;
  /** Damage per DoT application. */
  damagePerTick?: number;
  /** Multiplier (e.g. 0.5 for 50% slow). */
  magnitude?: number;
  /** Charges remaining (e.g. shield blocks). */
  charges?: number;
  source: string; // unit id that applied it
}

/** A live combatant in the simulation. */
export interface Unit {
  /** Stable runtime id (deterministic, assigned at deploy). */
  uid: string;
  defId: string;
  team: Team;
  state: UnitState;

  pos: Vec2;
  /** Facing: -1 left, 1 right (for sprite flip). */
  facing: number;

  hp: number;
  maxHp: number;

  // resolved stats (copied from def, modifiable by effects later)
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  range: number;
  radius: number;

  ability: AbilityId;

  /** Multiplier applied to incoming damage (1 = normal, 0.5 = take half). */
  damageTakenMult: number;
  /** True once a shapeshifter (Druid) has transformed; transform is one-way. */
  transformed: boolean;
  /** True once the Assassin's death-cheat (Vanish) has been spent this match. */
  vanishUsed: boolean;
  /** Assassin Ambush: true until its first strike (opening stealth + stun). */
  ambushReady: boolean;
  /** True once the Ogre's Second Wind full-heal has triggered this match. */
  secondWindUsed: boolean;
  /** Number of split-clones the slime has already spawned (caps splitting). */
  splitsSpawned: number;
  /** Mystic Archer's stance: "light" (single-target) or "dark" (chain AoE). */
  mysticForm: "light" | "dark";
  /** Affliction stacks ON this unit from a Mystic Archer (per-target). */
  lightStacks: number;
  darkStacks: number;
  /** Arcane Mage: rising charge from consecutive Arcane Barrage hits. Speeds up
   *  fire rate and, past a threshold, adds splash + minor self-damage. Decays
   *  while not attacking. */
  instability: number;
  /** Arcane Mage: ticks until Blink (defensive teleport) is ready again. */
  blinkCooldown: number;

  // timers (in ticks)
  attackCooldown: number;
  abilityCooldown: number;
  /** Ticks remaining in current cast/attack windup. */
  actionTimer: number;
  /** Count of basic attacks landed, for alternating on-hit effects
   *  (e.g. the Ice Mage freezing on every second attack). */
  attackCount: number;

  targetUid: string | null;
  /** uid of unit currently attacking this one (for target priority). */
  attackedByUid: string | null;
  /** uid of a unit that has taunted this one — forces target until taunt expires. */
  tauntedByUid: string | null;
  /** Orc Charge: ticks remaining in an active rush (0 = not charging). */
  chargeTicks: number;
  /** Orc Charge: uid of the unit currently being charged, or null. */
  chargeTargetUid: string | null;
  /** Absorb shield (overhealth): soaks damage before HP. Shown as a silver bar. */
  shieldHp: number;
  /** Max absorb shield, for rendering the silver segment proportionally. */
  shieldHpMax: number;

  effects: ActiveStatusEffect[];

  // ---- presentation-only fields (read by renderer, ignored by sim logic) --
  /** Ticks of red-flash remaining. */
  hitFlash: number;
  /** Animation phase accumulator (seconds), advanced by AnimationSystem. */
  animTime: number;
  animState: UnitState;
  /** Death fade 0..1 (1 = fully gone). */
  deathFade: number;
}

export interface Projectile {
  id: string;
  pos: Vec2;
  target: Vec2;
  targetUid: string;
  speed: number;
  damage: number;
  team: Team;
  sourceUid: string;
  ability: AbilityId;
  color: string;
  /** rotation for rendering */
  angle: number;
  alive: boolean;
  /** If set, the projectile applies a stun of this many seconds on impact.
   *  Used by the Ice Mage's every-second-attack freeze. */
  onHitStunSec?: number;
  /** If set, the projectile applies Burn on impact.
   *  Used by the Fire Mage's every-third-attack ignite. */
  onHitBurn?: boolean;
  /** If set, the projectile splashes a fraction of its damage to enemies within
   *  this pixel radius of the impact. Used by the Arcane Mage's volatile missiles. */
  splashRadius?: number;
}

export type FloatingTextKind = "damage" | "heal" | "crit";

export interface FloatingText {
  id: string;
  pos: Vec2;
  value: string;
  kind: FloatingTextKind;
  /** ticks remaining */
  life: number;
  maxLife: number;
}

export type VfxKind = "slam" | "frost" | "burn_burst" | "shield_pop" | "death";

export interface Vfx {
  id: string;
  kind: VfxKind;
  pos: Vec2;
  life: number;
  maxLife: number;
  color: string;
}

export type MatchPhase = "deployment" | "battle" | "victory" | "defeat" | "draw";

export interface BattleSnapshot {
  tick: number;
  phase: MatchPhase;
  units: Unit[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  vfx: Vfx[];
  /** ticks remaining on the 2:00 match clock */
  clockTicks: number;
}

/** Recorded inputs sufficient to replay a match deterministically. */
export interface DeploymentRecord {
  tick: number;
  team: Team;
  defId: string;
  pos: Vec2;
}

export interface ReplayData {
  seed: number;
  deployments: DeploymentRecord[];
  playerDeck: string[];
  enemyDeck: string[];
}
