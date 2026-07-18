// ============================================================================
// CORE TYPES
// All shared types for the deterministic combat slice live here.
// These are intentionally framework-agnostic (no React) so the engine can be
// lifted onto a Node.js/Colyseus server unchanged for multiplayer.
// ============================================================================

import type { CommanderMods, SpellId } from "@/meta/commander"; // type-only: meta/commander imports nothing

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
  | "flash_heal"
  | "renew"
  | "polymorph"
  | "mend_beast"
  | "scatter_trap"
  | "summon_wolves"
  | "summon_imps"
  | "gelatinous_guard"
  | "divide_reconvene"
  | "killing_spree"
  | "divine_light"
  | "sanctuary"
  | "resurrection"
  | "grand_grimoire"
  // Bespoke dungeon boss / rare-catalyst abilities.
  | "call_of_the_wild"
  | "putrid_spew"
  | "grasping_roots"
  | "runic_plating"
  | "magma_vents"
  | "fan_of_knives"
  | "apex_predator"
  | "verdant_pulse"
  | "sentry_protocol"
  | "umbral_veil";

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

/** Creature-type tags for tribal mechanics — data, like `school` and
 *  `wardedAgainst`, so the engine reads them without defId branches. The Slime
 *  Knight's Absorb Bones keys on "skeleton"; future holy-vs-undead effects can
 *  key on "undead". A skeleton carries BOTH. */
export type UnitTag = "undead" | "skeleton";

/** Targeting personality — a fixed, per-unit preference that reorders the
 *  CANDIDATE choice inside acquireTarget's steps 2 (lowest-HP in range) and 4
 *  (nearest). Taunt and the retaliation rules are never overridden. Absent on
 *  a UnitDef ⇒ "brawler" (today's exact behavior). Display copy lives in
 *  data/tendencies.ts; the type lives here so the engine reads it off the
 *  Unit without importing the data layer. */
export type TendencyId =
  | "brawler"
  | "backline_stalker"
  | "executioner"
  | "bodyguard"
  | "spellwrath"
  | "big_game"
  | "faithbane"
  | "focus_fire"
  | "lone_wolf";

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
  /** Creature-type tags (the whole Bonefields roster is "undead"; raised bones
   *  are also "skeleton"). Absent = untyped. */
  tags?: UnitTag[];
  /** Targeting personality (see TendencyId). Declarative data like `school` /
   *  `wardedAgainst` — never a kit hook. Absent = "brawler". */
  tendency?: TendencyId;
  /** Battlefield-only sprite magnification so bosses tower over rank-and-file
   *  units. Presentation only: read by the Renderer/sprite draw, NEVER by the
   *  simulation — collision `radius` and the digest are untouched. It does not
   *  apply to the fixed-size hub portrait, so unit cards stay uniform. Absent = 1. */
  battleScale?: number;
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

  /** Unit level, fixed at spawn — hp/maxHp/damage above already have the
   *  level multipliers baked in (meta/leveling, applied by createUnit).
   *  Summons inherit their creator's level via the spawn queue. */
  level: number;

  // resolved stats (copied from def, modifiable by effects later)
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  range: number;
  radius: number;

  ability: AbilityId;

  /** Targeting personality, copied off the UnitDef at createUnit so the
   *  per-tick acquireTarget never re-derives it. Absent = "brawler". */
  tendency?: TendencyId;

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
  /** Endless "Last Breath" boon: a per-wave cheat-death charge. The controller
   *  refreshes it each wave start; the damage funnel consumes it on a fatal blow. */
  cheatDeathReady: boolean;
  /** Number of split-clones the slime has already spawned (caps splitting). */
  splitsSpawned: number;
  /** Slime Knight rebirth counter: 0 for a fresh knight, +1 each reincarnation.
   *  Drives the decaying split (4 - stage blobs spawned on death) and caps it. */
  rebornStage: number;
  /** Set on a Slime Knight's split blob: the corpse point it oozes back toward to
   *  reincarnate the knight. A unit with a homeAnchor ignores combat entirely
   *  (never acquires a target, never attacks); MovementSystem walks it home and the
   *  blob's kit resolves arrival. Null/absent for every normal unit. */
  homeAnchor?: Vec2 | null;
  /** Mystic Archer's stance: "light" (single-target) or "dark" (chain AoE). */
  mysticForm: "light" | "dark";
  /** Mystic Archer Momentum: stacks gained per form shift (capped at 5 =
   *  +75% attack speed). */
  momentumStacks: number;
  /** Affliction stacks ON this unit from a Mystic Archer (per-target). */
  lightStacks: number;
  darkStacks: number;
  /** Bespoke-boss phase counter: how many HP-threshold transitions have fired
   *  (Dire Alpha's howls at 66/33%, the Rune Golem's shattering plates at
   *  75/50/25%, the Bandit King's smoke escapes at 60/30%). Like splitsSpawned,
   *  but for phase gates rather than splits. 0 for every non-boss. */
  bossPhase: number;
  /** Bespoke-boss permanent stack counter — a running total that ramps a stat
   *  (the Apex Beast's per-kill Frenzy). 0 for every non-boss. */
  bossStacks: number;
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
  /** Priest: ticks until Renew (instant HoT) is ready again. */
  renewCooldown: number;
  /** Seraph: ticks until Sanctuary (team-wide absorb bubble) is ready again. */
  sanctuaryCooldown: number;
  /** Seraph: true once its once-per-battle Resurrection cast has been spent. */
  resurrectionUsed: boolean;
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
  /** Outlaw Killing Spree: the ultimate's charge meter, in ticks. ultChargeMax
   *  is 0 for every non-ult unit (the Renderer draws no bar and the charge logic
   *  is off); the Outlaw's kit sets it to 10s at spawn, then the 60s cooldown
   *  after each spree. When ultCharge reaches ultChargeMax the kit arms a spree. */
  ultCharge: number;
  ultChargeMax: number;
  /** Outlaw Killing Spree: ticks remaining in an ACTIVE spree (0 = not spreeing).
   *  Gates the engine driver (stepKillingSpree), the movement skip, and the
   *  funnel's full-damage immunity. */
  spreeTicks: number;
  /** Outlaw Killing Spree: ticks until the next blink-strike in the spree. */
  spreeJumpTimer: number;
  /** Outlaw Killing Spree: round-robin cursor into the uid-sorted enemy list, so
   *  successive blinks bounce across every foe deterministically. */
  spreeIndex: number;
  /** Electric Mage: ticks left in the Chain Lightning cast (0 = not casting).
   *  Drives the cast bar; a stun/fear mid-cast resets it (interrupt). */
  castTicks: number;
  /** Electric Mage: the cast's full duration, for the cast-bar proportion. */
  castTicksMax: number;
  /** Electric Mage: target locked at the start of the cast (blast origin). */
  castTargetUid: string | null;
  /** Mirror Image: ticks until the illusion dissolves. ABSENT for every real
   *  unit (like the item fields), so existing sims stay byte-identical; stamped
   *  by the Arch Mage's summon init and counted down by the illusion's kit. */
  lifespanTicks?: number;

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

  // ---- equipment (items) — ALL fields absent for an unequipped unit, so an
  // itemless sim stays byte-identical to pre-items builds (digest identity). --
  /** Resolved item modifiers ACTIVE on this unit (dmg/hp already baked at
   *  createUnit). Set only when latentItems.owner === defId. */
  itemMods?: ItemMods;
  /** The equipment pair this unit CARRIES (inert): its creator's mods + the
   *  defId that owns them. Rides spawn stamps like `level`, so a Slime
   *  Knight's blob can hand the knight's gear back to the reborn knight while
   *  a skeleton never activates its necromancer's sword. */
  latentItems?: { mods: ItemMods; owner: string };
  /** Windlash Tempo: consecutive-hit stacks on the current tempo target. */
  tempoStacks?: number;
  tempoTargetUid?: string | null;
  /** Runic Barrier: ticks until the shield re-forms. */
  barrierCountdown?: number;
  /** Phasecloak: true once the one-shot below-half stealth has fired. */
  stealthTriggerUsed?: boolean;

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
  /** A second rider slot for equipped-item on-hit effects (e.g. the Ember
   *  Charm's burn). Separate from `rider` so an item never displaces a unit's
   *  innate shot rider — both apply on impact. */
  itemRider?: ShotRider;
}

// ---------------------------------------------------------------------------
// Items — equipment modifiers resolved from data/items.ts and baked onto units.
// Like ShotRider, the TYPES live here so the engine can read them without
// importing data modules.
// ---------------------------------------------------------------------------

export type ItemSlot = "weapon" | "armor" | "trinket";

/** Triggered item effects (the DATA half; CombatSystem reads these at its
 *  existing seams — no per-item branches). All magnitudes are pre-resolved for
 *  the item's quality/star by data/items.resolveItemMods. */
export type ItemEffect =
  /** Plant `rider` on every Nth basic attack (melee: applied directly; ranged:
   *  carried via Projectile.itemRider). */
  | { kind: "onHitRider"; everyNth: number; rider: ShotRider }
  /** Enemies that die while carrying `element` (applied by the wearer) erupt:
   *  `damage` + `rider` hit enemies within `radius` of the corpse. */
  | {
      kind: "detonateOnDeath";
      element: StatusEffectType;
      damage: number;
      radius: number;
      rider?: ShotRider;
      vfxColor: string;
    }
  /** Basic hits on a poisoned target splash the wearer's poison rider to other
   *  enemies within `radius` of the target. */
  | { kind: "spreadPoisonOnAttack"; radius: number; rider: ShotRider }
  /** Every Nth basic attack also strikes the nearest OTHER enemy for `frac`
   *  of attack damage. */
  | { kind: "chainNth"; everyNth: number; frac: number }
  /** Every Nth basic attack hits twice (second hit at full damage). */
  | { kind: "doubleStrikeNth"; everyNth: number }
  /** Every Nth basic attack deals `bonus` extra damage (and optionally stuns). */
  | { kind: "nthBonusDamage"; everyNth: number; bonus: number; stunSec?: number }
  /** Kills grant the wearer haste. */
  | { kind: "hasteOnKill"; durationSec: number; magnitude: number }
  /** Consecutive hits on the same target stack attack speed (reset on retarget). */
  | { kind: "tempo"; perStack: number; maxStacks: number }
  /** +dmg dealt and -dmg taken per LIVING ally (read live at the damage funnel). */
  | { kind: "packTactics"; perAlly: number }
  /** Spawn with an absorb shield worth `frac` of max HP. */
  | { kind: "startShield"; frac: number }
  /** One-shot: first time below 50% HP, stealth for `durationSec`. */
  | { kind: "stealthBelowHalf"; durationSec: number }
  /** Regenerate `pctPerSec`% of max HP each second (through the heal funnel). */
  | { kind: "regen"; pctPerSec: number; doubledBelowHalf?: boolean }
  /** Reflect `frac` of incoming MAGIC damage back at the caster. */
  | { kind: "spellFeedback"; frac: number }
  /** An absorb shield worth `frac` of max HP that re-forms every `intervalSec`. */
  | { kind: "runicBarrier"; frac: number; intervalSec: number }
  /** The unit's ability starts the battle off cooldown. */
  | { kind: "abilityStartsReady" };

/** A unit's resolved equipment modifiers (all three slots merged). Multipliers
 *  default to 1 and additive fields to 0 — identityItemMods() in data/items.ts.
 *  dmgMult/hpMult are baked into stats at createUnit (like levels); everything
 *  else is read live at CombatSystem's existing funnel seams. */
export interface ItemMods {
  dmgMult: number;
  hpMult: number;
  /** <1 = attacks faster (multiplies seconds-between-attacks). */
  atkDelayMult: number;
  moveSpeedMult: number;
  damageTakenMult: number;
  /** Extra multiplier on incoming MAGIC-school damage. */
  magicTakenMult: number;
  /** Fraction of basic-attack damage healed back (adds to team lifesteal). */
  lifesteal: number;
  /** Fraction of received hits reflected at the attacker. */
  thornsFrac: number;
  /** Extra damage fraction vs targets below 25% HP. */
  executeBonus: number;
  /** Flat heal to the wearer on kill. */
  killHeal: number;
  /** Every Nth basic attack crits (×2). 0 = never. */
  critEveryNth: number;
  /** Multiplier on ability cooldown (<1 = faster). */
  cooldownMult: number;
  /** Extra damage fraction vs enemies with higher max HP than the wearer. */
  giantSlayerPct: number;
  /** The wearer's summons spawn with +this fraction of hp/damage. */
  summonStatPct: number;
  effects: ItemEffect[];
}

/** One unit's equipped item keys ("lineId:quality:star"), by slot. */
export interface ItemLoadout {
  weapon?: string;
  armor?: string;
  trinket?: string;
}

/** Equipped items by unit defId — a deterministic match input, like unitLevels. */
export type ItemLoadouts = Record<string, ItemLoadout>;

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

/** A ground trap sitting until an enemy steps on it. The Hunter's Scatter Trap
 *  (bare = stun) and boss hazards like the Forge Golem's Magma Vents (a burn
 *  `rider`) both ride this one type — the trigger in CombatSystem stays generic. */
export interface Trap {
  x: number;
  y: number;
  /** Owner's team; the trap catches units of the OTHER team. */
  team: Team;
  /** On-step status instead of the default 7s stun (e.g. a burn/poison rider).
   *  Absent = the Hunter's plain stun, byte-identical to the pre-rider build. */
  rider?: ShotRider;
  /** uid to credit the rider's DoT to (so a burn trap's ticks feed the boss's
   *  kill count). Absent = "trap" sentinel (the Hunter never needs the credit). */
  sourceUid?: string;
}

/** A transient boss-floor callout. On a boss floor the WaveController telegraphs
 *  the rare catalyst and the boss with a flashing banner; the HUD reads this off
 *  the snapshot. `ticks` counts down (cleared at 0), so it lingers briefly as the
 *  unit walks in. Null on every non-boss floor / in the Arena. */
export interface WaveBanner {
  /** "rare"/"boss" telegraph an incoming unit; "wave" announces a new Endless
   *  wave starting (name carries the headline, e.g. "Wave 7"). */
  kind: "rare" | "boss" | "wave";
  /** Display name of the incoming unit (e.g. "Lich", "Abomination"). */
  name: string;
  /** Display ticks remaining. */
  ticks: number;
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
  /** Boss-floor telegraph banner, or null. */
  waveBanner: WaveBanner | null;
}

/** Recorded inputs sufficient to replay a match deterministically. */
export interface DeploymentRecord {
  tick: number;
  team: Team;
  defId: string;
  pos: Vec2;
}

/** One player unit's deploy-time mark, carried between floors of a dungeon
 *  descent so the next floor can field the warband on the same spots (the
 *  march-in). An ORDERED list (not a map): deploy order fixes uid assignment,
 *  so it must be preserved, and a deck may run duplicate defIds. */
export interface FormationMark {
  defId: string;
  pos: Vec2;
}

export interface ReplayData {
  seed: number;
  deployments: DeploymentRecord[];
  playerDeck: string[];
  enemyDeck: string[];
  /** Endless mode: ordered boon-pick offer indices (the between-wave inputs).
   *  Absent/empty for Arena and Depths. */
  picks?: number[];
  /** Player unit levels by defId (a match input — re-simulation must bake the
   *  same stat multipliers). Absent = everything level 1. */
  unitLevels?: Record<string, number>;
  /** Player equipped items by defId (a match input, like unitLevels — the
   *  same loadouts must be resolved and baked on re-simulation). */
  itemLoadouts?: ItemLoadouts;
  /** Player slayer bonus table by enemy defId (a match input, like unitLevels
   *  — re-simulation must install the same damage multipliers). Absent/empty
   *  = identity. */
  slayerBonuses?: Record<string, number>;
  /** The player's resolved commander talents (a match input, like unitLevels —
   *  re-simulation must install the same teamMods folds). Absent = identity. */
  commanderMods?: CommanderMods;
  /** Commander spell casts (tick + spell) — a logged player input, like
   *  `deployments`. Absent/empty = no cast this match. */
  commanderCasts?: { tick: number; spell: SpellId }[];
}
