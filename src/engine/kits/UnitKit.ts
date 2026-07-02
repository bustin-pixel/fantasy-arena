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

import type { Unit } from "@/types";
import type { AbilityContext } from "../AbilitySystem";
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
  /** Fired when the unit enters the field (opening stealth, deploy-time summons).
   *  NOTE: its only site today is MatchController.deploy — wired when the first
   *  onSpawn unit (the opening-stealth trio) migrates, not during scaffolding. */
  onSpawn?(unit: Unit, ctx: KitCtx): void;
  /** Fired the tick the unit dies — may re-enter dealDamage (Bloater / Slime
   *  death burst). Runs inside the HP funnel's death branch. */
  onDeath?(unit: Unit, ctx: KitCtx): void;

  // --- tick: the engine owns the skeleton; these are its two ordered slots ---
  /** Pre-gate maintenance — runs every tick, even while stunned (timers, periodic
   *  passives like Raise Dead / Field Repairs, per-tick stat recompute, threshold
   *  transforms). Determinism forces this to stay pre-gate (see ADR decision 3). */
  onTick?(unit: Unit, ctx: KitCtx): void;
  /** Post-target, only when the unit can act (Blink, Shadow Step, Rejuvenation,
   *  the Necromancer's custom dual-cast). */
  onActTick?(unit: Unit, ctx: KitCtx): void;

  // --- HP funnel (called from inside dealDamage / heal) ---
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
}

export type UnitKitRegistry = Record<string /* defId */, UnitKit>;

/** The kit registry. Grows one unit at a time (strangler fig); for un-migrated
 *  units getKit returns undefined and the engine falls back to the old hardcoded
 *  path, so behavior — and digest() — is unchanged until a unit's kit is born. */
export const UNIT_KITS: UnitKitRegistry = {
  zombie_shambler: zombieShamblerKit,
};

/** The kit for a defId, or undefined if the unit hasn't been migrated yet. */
export function getKit(defId: string): UnitKit | undefined {
  return UNIT_KITS[defId];
}
