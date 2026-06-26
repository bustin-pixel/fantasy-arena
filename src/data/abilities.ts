import type { AbilityDef, AbilityId } from "@/types";

// Cooldowns here mirror the design spec. The actual *effects* are implemented
// in engine/AbilitySystem.ts — this file is pure data so abilities can be
// rebalanced without touching logic.

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  crushing_slam: {
    id: "crushing_slam",
    name: "Crushing Slam",
    description: "Every 5s: +25 damage and stuns the target for 1.5s.",
    cooldown: 5,
  },
  lifesteal: {
    id: "lifesteal",
    name: "Lifesteal",
    description: "Passive: heals for 30% of damage dealt.",
    cooldown: 0,
  },
  charge: {
    id: "charge",
    name: "Charge",
    description: "Every 7s: charge a distant enemy, slamming for bonus damage.",
    cooldown: 7,
  },
  kiting_leap: {
    id: "kiting_leap",
    name: "Kiting Leap",
    description: "When a melee enemy closes in, leap back. 6s cooldown.",
    cooldown: 6,
  },
  shield_block: {
    id: "shield_block",
    // Currently unused — no unit has this ability (Knight uses taunt_roar).
    // Retained as reusable logic; see castShieldBlock in AbilitySystem.ts.
    name: "Shield Block",
    description: "Every 2.5s: fully blocks the next incoming attack.",
    cooldown: 2.5,
  },
  taunt_roar: {
    id: "taunt_roar",
    name: "Taunting Roar",
    description:
      "Every 8s: forces nearby enemies to attack it for 2.5s and gains a protective shield.",
    cooldown: 8,
  },
  aegis: {
    id: "aegis",
    name: "Mana-Siphon Shield",
    description:
      "Passive: soaks most incoming magic damage, banking it as a growing shield.",
    cooldown: 0,
  },
  fireball: {
    id: "fireball",
    name: "Fireball",
    description: "Every 4s: hurls a fireball for 25 burst damage.",
    cooldown: 4,
  },
  frost_blast: {
    id: "frost_blast",
    name: "Frost Blast",
    description: "Every 5s: 20 damage + 50% slow for 2.5s.",
    cooldown: 5,
  },
  ambush: {
    id: "ambush",
    name: "Ambush",
    description:
      "Passive: starts the battle hidden. Its first strike stuns the target for 3s and reveals it.",
    cooldown: 0,
  },
  mend: {
    id: "mend",
    name: "Mend",
    description: "Every 3s: heals the most-wounded ally in range for 32.",
    cooldown: 3,
  },
  summon_wolves: {
    id: "summon_wolves",
    name: "Summon Wolves",
    description: "Every 12s: calls a spirit wolf to fight alongside.",
    cooldown: 12,
  },
  bloodrage: {
    id: "bloodrage",
    name: "Bloodrage",
    description: "Passive: the lower its health, the more damage and speed it gains.",
    cooldown: 0,
  },
  fear_aura: {
    id: "fear_aura",
    name: "Terrify",
    description: "Every 8s: nearby enemies flee in terror for 2s, unable to attack.",
    cooldown: 8,
  },
  raise_dead: {
    id: "raise_dead",
    name: "Raise Dead",
    description: "Every 4s: raises a skeleton from a recent corpse to fight for it.",
    cooldown: 4,
  },
  slime_split: {
    id: "slime_split",
    name: "Split",
    description:
      "Passive: spawns a weaker clone each time it loses 25% HP. Every slime bursts for AoE on death.",
    cooldown: 0,
  },
  mystic_shift: {
    id: "mystic_shift",
    name: "Light & Dark",
    description:
      "Passive: shifts between two forms. Each shot marks its target; at 3 marks the foe detonates and the Archer flips to its other form.",
    cooldown: 0,
  },
  arcane_barrage: {
    id: "arcane_barrage",
    name: "Arcane Barrage",
    description:
      "Passive: a volley of arcane missiles. Each consecutive hit builds Instability, ramping the mage's fire rate; at high Instability the missiles splash to nearby foes.",
    cooldown: 0,
  },
};
