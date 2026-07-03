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
  | "curse"
  | "regen"
  | "polymorph"
  | "silence"
  | "stealth"
  | "death_immune"
  | "taunt"
  | "fear";

export type AbilityId =
  | "crushing_slam"
  | "lifesteal"
  | "kiting_leap"
  | "taunt_roar"
  | "aegis"
  | "fireball"
  | "frost_blast"
  | "ambush"
  | "charge"
  | "bloodrage"
  | "fear_aura"
  | "slime_split"
  | "mystic_shift"
  | "momentum"
  | "multishot"
  | "whirlwind"
  | "arcane_barrage"
  | "blessing"
  | "deploy_turret"
  | "chain_lightning"
  | "mend"
  | "venom"
  | "shadow_step"
  | "curse"
  | "rejuvenation"
  | "polymorph"
  | "mend_beast"
  | "scatter_trap"
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
  /** Cast (wind-up) time in seconds before the effect fires. Absent/0 = instant.
   *  A cast shows a cast bar and is interrupted by a stun/fear (the mages). */
  castTimeSec?: number;
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
  /** Secondary abilities beyond the primary `ability`, for multi-ability units
   *  (e.g. the Necromancer's Terrify alongside Curse). Shown in the detail panel
   *  with their own Active/Passive tag + cast/cooldown, same as the primary. */
  abilities?: AbilityId[];
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
  /** Status effects this unit is immune to (e.g. the Aegis Knight's Warded ward
   *  against burn/slow/poison). A static resistance, so it lives in data like
   *  `school` — StatusEffectSystem drops a warded effect at application. */
  wardedAgainst?: StatusEffectType[];
  /** If set, this unit's basic shot plants an on-hit rider every Nth attack (the
   *  Ice Mage's every-2nd freeze, the Fire Mage's every-3rd burn). Data, like
   *  `wardedAgainst`: performBasicAttack attaches `rider` to the shot's projectile
   *  and stepProjectiles applies it — no per-unit `defId` branch. */
  basicShotRider?: { everyNthAttack: number; rider: ShotRider };
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
  /** Heal per HoT application (e.g. the Druid's Rejuvenation). */
  healPerTick?: number;
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
  /** True once the Berserker's Last Stand death-cheat has been spent this life. */
  lastStandUsed: boolean;
  /** Number of split-clones the slime has already spawned (caps splitting). */
  splitsSpawned: number;
  /** Mystic Archer's stance: "light" (single-target) or "dark" (chain AoE). */
  mysticForm: "light" | "dark";
  /** Mystic Archer Momentum: stacks gained per form shift (capped at 5 =
   *  +75% attack speed). */
  momentumStacks: number;
  /** Affliction stacks ON this unit from a Mystic Archer (per-target). */
  lightStacks: number;
  darkStacks: number;
  /** Arcane Mage: ticks until Blink (defensive teleport) is ready again. */
  blinkCooldown: number;
  /** Trickster: ticks until Shadow Step (reactive interrupt-blink) is ready. */
  shadowCooldown: number;
  /** Trickster: ticks until it melts back into stealth after acting (0 = idle). */
  recloakTimer: number;
  /** Necromancer: ticks until its big Curse (DoT) cast is ready again. */
  curseCooldown: number;
  /** Druid: ticks until Rejuvenation (instant HoT) is ready again. */
  rejuvCooldown: number;
  /** Druid: ticks of Bear Form's 80% damage reduction left (0 = expired). */
  bearGuardTimer: number;
  /** Hunter: ticks until it can re-summon its boar after the boar dies. */
  boarCooldown: number;
  /** Hunter: ticks until it can lay another set of Scatter Traps. */
  trapCooldown: number;
  /** Arcane Mage: missiles left to fire in the current Arcane Barrage volley
   *  (0 = not firing). The volley streams out one missile at a time. */
  barrageShots: number;
  /** Arcane Mage: ticks until the next missile in the volley. */
  barrageTimer: number;
  /** Arcane Mage: the target locked for the whole volley (all 3 hit it). */
  barrageTargetUid: string | null;
  /** Electric Mage: ticks left in the Chain Lightning cast (0 = not casting).
   *  Drives the cast bar; a stun/fear mid-cast resets it (interrupt). */
  castTicks: number;
  /** Electric Mage: the cast's full duration, for the cast-bar proportion. */
  castTicksMax: number;
  /** Electric Mage: target locked at the start of the cast (blast origin). */
  castTargetUid: string | null;

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

/** The DATA half of projectile-on-hit: the status effect a basic shot plants on
 *  impact, plus its impact vfx and the projectile's tint while it carries the
 *  rider (the Ice Mage's freeze, the Fire Mage's burn). Pure data, like
 *  `wardedAgainst` — the Mystic Archer's `onProjectileHit` kit hook is the CODE
 *  half. `source` is filled from the firing projectile at impact. */
export interface ShotRider {
  effectType: StatusEffectType;
  durationSec: number;
  damagePerTick?: number;
  tickIntervalSec?: number;
  magnitude?: number;
  vfxKind: VfxKind;
  /** Both the projectile's tint and the impact-vfx color. */
  color: string;
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
  /** On-hit rider this shot carries (Ice freeze / Fire burn), applied generically
   *  in stepProjectiles. Attached by performBasicAttack from the source's
   *  `UnitDef.basicShotRider`; absent for a plain shot. */
  rider?: ShotRider;
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

export type VfxKind =
  | "slam"
  | "frost"
  | "burn_burst"
  | "shield_pop"
  | "death"
  | "lightning";

export interface Vfx {
  id: string;
  kind: VfxKind;
  pos: Vec2;
  /** For line-style vfx (lightning): the far endpoint the bolt arcs to. */
  to?: Vec2;
  life: number;
  maxLife: number;
  color: string;
}

export type MatchPhase = "deployment" | "battle" | "victory" | "defeat" | "draw";

/** A Hunter's Scatter Trap sitting on the ground until an enemy steps on it. */
export interface Trap {
  x: number;
  y: number;
  /** Owner's team; the trap catches units of the OTHER team. */
  team: Team;
}

export interface BattleSnapshot {
  tick: number;
  phase: MatchPhase;
  units: Unit[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  vfx: Vfx[];
  traps: Trap[];
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
