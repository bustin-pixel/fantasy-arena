// ============================================================================
// UnitKit — the per-unit-mechanics seam (see docs/adr/0001-unitkit-seam.md)
//
// One stateless kit per defId in a static registry. CombatSystem loops over a
// kit's hooks instead of testing defId string literals; the AI (MatchController)
// and the cast pipeline read the same kit. A kit implements only what it needs.
//
// Coexistence during the strangler-fig migration: every seam call in the engine
// PREFERS the kit and falls back to the old hardcoded path for un-migrated units
// (`if (kit?.hook) …  else <old branch>`). While the registry is empty every
// guard is false, so the engine runs byte-identical — the digest() gate. A
// unit's old branches are deleted in the SAME commit its kit is born, so a
// mechanic never fires twice.
//
// KitCtx IS the engine's AbilityContext: it carries the single HP funnel
// (dealDamage / heal), the summon/vfx/floating-text spawners, and the subject's
// live enemies/allies. Kits mutate ONLY through it — never touch unit.hp or the
// targeting directly (the determinism guardrails).
// ============================================================================

import type { Projectile, Unit } from "@/types";
import type { AbilityContext } from "../AbilitySystem";
import { aegisKnightKit } from "./aegisKnight";
import { arcaneMageKit } from "./arcaneMage";
import { archerKit } from "./archer";
import { assassinKit } from "./assassin";
import { berserkerKit } from "./berserker";
import { bloaterKit, bloatlingKit } from "./bloater";
import { boarKit } from "./boar";
import { bonecallerKit } from "./bonecaller";
import { clericKit } from "./cleric";
import { druidKit } from "./druid";
import { electricMageKit } from "./electricMage";
import { engineerKit } from "./engineer";
import { fireMageKit } from "./fireMage";
import { holyKnightKit } from "./holyKnight";
import { hunterKit } from "./hunter";
import { iceMageKit } from "./iceMage";
import { knightKit } from "./knight";
import { mageKit } from "./mage";
import { mysticArcherKit } from "./mysticArcher";
import { necromancerKit } from "./necromancer";
import { ogreKit } from "./ogre";
import { orcKit } from "./orc";
import { outlawKit } from "./outlaw";
import { priestKit } from "./priest";
import { rangerKit } from "./ranger";
import { rogueKit } from "./rogue";
import { runeGolemKit } from "./runeGolem";
import { seraphKit } from "./seraph";
import { slimeKit, slimeCloneKit } from "./slime";
import { slimeKnightKit, slimeBlobKit } from "./slimeKnight";
import { tricksterKit } from "./trickster";
import { warriorKit } from "./warrior";
import { zombieShamblerKit } from "./zombieShambler";

/** The context every kit hook receives (the engine's AbilityContext). For the
 *  HP-funnel hooks the subject (`ctx.unit`) is the victim/killer; for the acting
 *  hooks it is the unit taking its turn. */
export type KitCtx = AbilityContext;

export interface UnitKit {
  /** Tactical class the AI reads for positioning + counter-pick scoring. A *fact*
   *  about the unit; the *opinions* about matchups stay in MatchController. */
  roleClass?: "melee" | "ranged" | "support" | "assassin";

  // --- lifecycle ---
  /** Fired when the unit enters the field, from BOTH deploy (MatchController) and
   *  the summon flush (CombatSystem). It gets no KitCtx: deploy runs outside the
   *  combat funnel (no dealDamage/heal), and the only spawn behavior — opening
   *  stealth — just needs the unit + the directly-imported applyEffect. */
  onSpawn?(unit: Unit): void;
  /** Fired the tick the unit dies — may re-enter dealDamage (Bloater / Slime
   *  death burst). Runs inside the HP funnel's death branch. */
  onDeath?(unit: Unit, ctx: KitCtx): void;

  // --- tick: the engine owns the skeleton; these are its two ordered slots ---
  /** Pre-gate maintenance — runs every tick, even while stunned (timers, periodic
   *  passives like Raise Dead / Field Repairs, per-tick stat recompute, threshold
   *  transforms). Determinism forces this to stay pre-gate (see ADR decision 3). */
  onTick?(unit: Unit, ctx: KitCtx): void;
  /** Post-target, POST-idle: only when the unit still has a live target (or is
   *  mid-cast) — the instant acts that need something to act on (Rejuvenation, the
   *  Necromancer's custom dual-cast). Return `true` to signal the kit OWNS this
   *  unit's cast pipeline (the Necromancer's dual Curse/Terrify on one bar): the
   *  engine then bypasses its standard cast-handling chain, and locks the unit for
   *  the tick while that cast is mid-flight. An instant act (Druid Rejuvenation)
   *  returns void and falls through to the standard chain. */
  onActTick?(unit: Unit, ctx: KitCtx): boolean | void;
  /** Post-target, PRE-idle: reactive acts that fire even when the unit's committed
   *  target just died — they react to the wider board (Trickster Shadow Step
   *  interrupts any nearby caster; Arcane Blink dodges a closing melee threat).
   *  Runs at a separate call site BEFORE the target-dead idle-out. */
  onReactTick?(unit: Unit, ctx: KitCtx): void;

  // --- HP funnel (called from inside dealDamage / heal) ---
  /** Full-negate veto, run at the very top of dealDamage (before shield /
   *  mitigation). Return true to make the hit whiff entirely — no HP change, no
   *  flash, no floating number; the kit spawns its own text. Only called for
   *  positive incoming damage (the Outlaw's 50% dodge + Killing Spree immunity).
   *  May draw ctx.rng (deterministic). Distinct from modifyIncomingDamage, which
   *  scales a hit that still lands. */
  onWouldTakeDamage?(unit: Unit, amount: number, source: Unit, ctx: KitCtx): boolean;
  /** Transform an incoming heal before it lands (Druid bear form 1.5x). */
  modifyIncomingHeal?(unit: Unit, amount: number, ctx: KitCtx): number;
  /** Reduce an incoming hit before HP is applied (Aegis magic soak → 0.25x).
   *  Paired with onDamaged for the post-hit shield bank (open contract 1). */
  modifyIncomingDamage?(
    unit: Unit,
    amount: number,
    source: Unit,
    ctx: KitCtx
  ): number;
  /** Fired after a hit lands and the unit survives (Slime split; Aegis bank). */
  onDamaged?(unit: Unit, amount: number, source: Unit, ctx: KitCtx): void;
  /** Veto run BEFORE the generic death_immune check when hp hits 0; return true if
   *  the kit kept the unit alive (Ogre Second Wind / Vanish / Last Stand). */
  onWouldDie?(unit: Unit, source: Unit, ctx: KitCtx): boolean;
  /** Fired on the KILLER when its blow kills `victim` (Berserker Bloodthirst). */
  onKill?(source: Unit, victim: Unit, ctx: KitCtx): void;
  /** Death OBSERVER: fired on every OTHER living unit when `victim` dies, any
   *  team, any killer — after the victim's own onDeath, so corpse bursts resolve
   *  first (Slime Knight Absorb Bones: slurp enemy skeletons dying in its aura).
   *  The observer filters team/tags/radius itself. Dispatch iterates units in
   *  array (uid) order — deterministic. */
  onUnitDeath?(unit: Unit, victim: Unit, killer: Unit, ctx: KitCtx): void;

  // --- ability: has-an-active-cast <=> fireAbility is defined ---
  /** Fire the unit's active ability EFFECT. The engine still owns the cast
   *  pipeline (cooldown, cast bar, interrupt) and reads timing from ABILITIES. */
  fireAbility?(ctx: KitCtx): boolean;
  /** Whether the unit has a reason to begin its cast this tick (Cleric Mend won't
   *  commit its wind-up with no wounded ally in range). */
  wantsToCast?(ctx: KitCtx): boolean;

  // --- basic-attack timing split (open contract 2) ---
  /** Before the swing resolves (Assassin Ambush: opening stun + reveal). */
  onBeforeAttack?(unit: Unit, target: Unit, ctx: KitCtx): void;
  /** REPLACE the default swing entirely; return true if it did (Mystic / Ranger /
   *  Warrior do their own thing instead of a plain hit). */
  onBasicAttack?(unit: Unit, target: Unit, ctx: KitCtx): boolean;
  /** After the default MELEE swing lands (Venom / Cleave / Backlash / Numbing
   *  slow). Ranged on-hit riders (Ice freeze / Fire burn) are a projectile
   *  descriptor — a separate ADR — not this hook. */
  onAfterAttack?(unit: Unit, target: Unit, ctx: KitCtx): void;

  /** Resolve the impact of a projectile THIS unit fired, replacing the default
   *  on-hit damage (Mystic Archer's Light/Dark stack + detonate + form flip). The
   *  engine calls it from the projectile step for the SOURCE unit's kit; the kit
   *  owns all damage/stack bookkeeping via ctx. This is the *code-hook* half of
   *  projectile-on-hit; the *data-descriptor* half (Ice/Fire riders) is still the
   *  deferred ADR-candidate 3. (Distinct from AbilitySystem's free
   *  `onProjectileHit`, which resolves cast-ability projectiles like Fireball.) */
  onProjectileHit?(unit: Unit, target: Unit, proj: Projectile, ctx: KitCtx): void;

  /** Resolve the on-contact effect when THIS unit's charge reaches its target —
   *  the Orc slams (bonus damage + stagger), the Boar taunts it off the Hunter. The
   *  shared dash driver (stepCharge) stays engine plumbing, field-gated on
   *  chargeTicks like stepArcaneBarrage; this replaces its one defId branch (the
   *  kit-arms / engine-drives split, as with the Hunter's traps). */
  onChargeContact?(unit: Unit, target: Unit, ctx: KitCtx): void;
}

export type UnitKitRegistry = Record<string /* defId */, UnitKit>;

/** The kit registry. Grows one unit at a time (strangler fig); for un-migrated
 *  units getKit returns undefined and the engine falls back to the old hardcoded
 *  path, so behavior — and digest() — is unchanged until a unit's kit is born. */
export const UNIT_KITS: UnitKitRegistry = {
  abomination: ogreKit, // Bonefields boss: Second Wind + Crushing Slam (reused)
  aegis_knight: aegisKnightKit,
  ancient_automaton: runeGolemKit, // Deep Forge catalyst: Warded Plating (halves damage)
  apex_beast: ogreKit, // The Wilds catalyst: a great bear — Second Wind + Slam (reused)
  arcane_mage: arcaneMageKit,
  archer: archerKit,
  archmage: arcaneMageKit, // Sealed Vault catalyst: Arcane Barrage + Blink (reused)
  assassin: assassinKit,
  bandit_king: berserkerKit, // Rogue's Den boss: Bloodrage + Cleave + Last Stand (reused)
  berserker: berserkerKit,
  bloater: bloaterKit,
  bloatling: bloatlingKit,
  boar: boarKit,
  bonecaller: bonecallerKit, // Bonefields: Raise Dead (skeletons)
  dire_alpha: berserkerKit, // The Wilds boss: Bloodrage + Cleave + Last Stand (reused)
  dryad: clericKit, // The Overgrowth: Mend (grove healer, reused)
  eclipse_herald: arcaneMageKit, // Eclipse Spire catalyst: Arcane Barrage + Blink (reused)
  eclipse_warden: mysticArcherKit, // Eclipse Spire boss: Light/Dark + Momentum (reused)
  elder_treant: ogreKit, // The Overgrowth boss: Crushing Slam + Regrowth (reused)
  electric_mage: electricMageKit,
  engineer: engineerKit,
  fallen_seraph: seraphKit, // Fallen Cathedral boss: Sanctuary + Divine Light (reused)
  fire_mage: fireMageKit,
  forge_golem: ogreKit, // Deep Forge boss: Crushing Slam + Reforge (reused)
  healer: clericKit,
  holy_knight: holyKnightKit,
  hunter: hunterKit,
  ice_mage: iceMageKit,
  knight: knightKit,
  lich: necromancerKit, // Bonefields catalyst: raise + Curse + Terrify (reused)
  mage: mageKit,
  mystic_archer: mysticArcherKit,
  necromancer: necromancerKit,
  ogre: ogreKit,
  orc: orcKit,
  outlaw: outlawKit,
  penitent: priestKit, // Fallen Cathedral catalyst: Flash Heal + Renew — heals its wave (reused)
  priest: priestKit,
  ranger: rangerKit,
  rogue: rogueKit,
  rune_golem: runeGolemKit, // Sealed Vault boss: Warded Hide (halves all damage)
  seraph: seraphKit,
  silencer: outlawKit, // Rogue's Den catalyst: dodge + stealth + Killing Spree (reused)
  slime: slimeKit,
  slime_clone: slimeCloneKit,
  slime_knight: slimeKnightKit,
  slime_squire: slimeBlobKit,
  summoner: druidKit,
  trickster: tricksterKit,
  warrior: warriorKit,
  wildheart: berserkerKit, // The Overgrowth catalyst: Wild Fury + Thrash + Ever-Green (reused)
  zombie_shambler: zombieShamblerKit,
};

/** The kit for a defId, or undefined if the unit hasn't been migrated yet. */
export function getKit(defId: string): UnitKit | undefined {
  return UNIT_KITS[defId];
}
