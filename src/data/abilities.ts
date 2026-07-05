import type { AbilityDef, AbilityId } from "@/types";

// Cooldowns here mirror the design spec. The actual *effects* are implemented
// in engine/AbilitySystem.ts — this file is pure data so abilities can be
// rebalanced without touching logic.

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  crushing_slam: {
    id: "crushing_slam",
    name: "Crushing Slam",
    description: "Slams the target for +25 damage and stuns it for 1.5s.",
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
    description: "Charges a distant enemy, slamming it for bonus damage.",
    cooldown: 7,
  },
  kiting_leap: {
    id: "kiting_leap",
    name: "Kiting Leap",
    description: "Leaps backward when a melee enemy closes in.",
    cooldown: 6,
  },
  taunt_roar: {
    id: "taunt_roar",
    name: "Taunting Roar",
    description:
      "Forces nearby enemies to attack it for 2.5s and raises a shield that absorbs 45 damage, +10 per foe taunted.",
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
    description: "Hurls a fireball for 25 burst damage.",
    cooldown: 4,
    castTimeSec: 0.8,
  },
  frost_blast: {
    id: "frost_blast",
    name: "Frost Blast",
    description: "Blasts the target for 20 damage and slows it 50% for 2.5s.",
    cooldown: 5,
    castTimeSec: 0.8,
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
    description: "Heals the most-wounded ally in range for 32.",
    cooldown: 5,
    castTimeSec: 1.5,
  },
  venom: {
    id: "venom",
    name: "Venom",
    description:
      "Passive: its blades drip with poison — every strike envenoms the target, dealing damage over time (refreshes on each hit, does not stack).",
    cooldown: 0,
  },
  shadow_step: {
    id: "shadow_step",
    name: "Shadow Step",
    description:
      "When an enemy nearby begins casting, blinks to it and kicks — interrupting the cast and dealing light damage.",
    cooldown: 6,
  },
  curse: {
    id: "curse",
    name: "Curse",
    description:
      "Afflicts an enemy with a withering curse — damage over time (22 over 5.5s). Long cooldown.",
    cooldown: 14,
    castTimeSec: 1.5,
  },
  summon_wolves: {
    id: "summon_wolves",
    name: "Summon Wolves",
    description: "Calls a spirit wolf to fight alongside it.",
    cooldown: 10,
    castTimeSec: 0.5,
  },
  rejuvenation: {
    id: "rejuvenation",
    name: "Rejuvenation",
    description:
      "Instant: lays a healing-over-time on an injured ally — 6 HP every 2s for 8s (24 total).",
    cooldown: 16,
  },
  polymorph: {
    id: "polymorph",
    name: "Polymorph",
    description:
      "Transforms a non-summoned enemy into a harmless sheep for 7s — it can't act until it reverts. Long cooldown.",
    cooldown: 20,
    castTimeSec: 1,
  },
  mend_beast: {
    id: "mend_beast",
    name: "Mend Beast",
    description:
      "Instant: heals its boar over time — 5 HP every 1s for 6s (30 total).",
    cooldown: 10,
  },
  scatter_trap: {
    id: "scatter_trap",
    name: "Scatter Trap",
    description:
      "Scatters traps on the ground ahead of it. The first enemy to step on a trap is caught and stunned for 7s.",
    cooldown: 12,
  },
  bloodrage: {
    id: "bloodrage",
    name: "Bloodrage",
    description:
      "Passive: the lower its health, the more damage and attack speed it gains. Each kill restores 5% of its maximum health.",
    cooldown: 0,
  },
  fear_aura: {
    id: "fear_aura",
    name: "Terrify",
    description: "Channels a terrifying wail — nearby enemies flee in terror for 1s, unable to attack.",
    cooldown: 7,
    castTimeSec: 1.2,
  },
  slime_split: {
    id: "slime_split",
    name: "Split",
    description:
      "Passive: spawns a weaker clone each time it loses 25% HP. Every slime bursts for AoE on death.",
    cooldown: 0,
  },
  gelatinous_guard: {
    id: "gelatinous_guard",
    name: "Gelatinous Guard",
    description:
      "Sheathes itself in a rubbery ooze that absorbs the next 45 damage. Refreshes off cooldown while it fights.",
    cooldown: 8,
  },
  divide_reconvene: {
    id: "divide_reconvene",
    name: "Divide & Reconvene",
    description:
      "On death it bursts and flings out slime blobs that ignore the fight and ooze back to its corpse. If one arrives, the knight is reborn at half HP — but each rebirth flings one fewer blob (4 → 3 → 2 → 1), so a fully-intercepted knight stays dead.",
    cooldown: 0,
  },
  // The Mystic Archer's headline passive is now `momentum`; `mystic_shift` is kept
  // only as the projectile tag that drives the Light/Dark on-hit resolution (its
  // name/description are no longer surfaced in the UI). The Light Form / Dark Form
  // *traits* in data/units.ts explain the form mechanic instead.
  mystic_shift: {
    id: "mystic_shift",
    name: "Light & Dark",
    description:
      "Passive: shifts between two forms. Each shot marks its target; at 3 marks the foe detonates and the Archer flips to its other form.",
    cooldown: 0,
  },
  whirlwind: {
    id: "whirlwind",
    name: "Whirlwind",
    description:
      "In melee it spins its claymore in a full circle — striking every enemy in reach for its damage and leaving them bleeding for 12 more over 2s (3 every 0.5s, refreshes each spin).",
    cooldown: 0,
  },
  multishot: {
    id: "multishot",
    name: "Multishot",
    description:
      "Passive: every second shot looses three arrows at once, striking up to three different enemies.",
    cooldown: 0,
  },
  momentum: {
    id: "momentum",
    name: "Momentum",
    description:
      "Passive: every time it shifts between Light and Dark, its attack speed ramps up by 15% — stacking up to +75%.",
    cooldown: 0,
  },
  arcane_barrage: {
    id: "arcane_barrage",
    name: "Arcane Barrage",
    description: "Rapidly fires 3 arcane missiles in quick succession at a single target.",
    cooldown: 6,
    castTimeSec: 0.6,
  },
  blessing: {
    id: "blessing",
    name: "Blessing",
    description: "Shields itself and nearby allies for 40 absorb and heals them for 15.",
    cooldown: 8,
  },
  deploy_turret: {
    id: "deploy_turret",
    name: "Deploy Turret",
    description: "Builds a stationary turret beside it that holds ground until destroyed.",
    cooldown: 9,
  },
  chain_lightning: {
    id: "chain_lightning",
    name: "Chain Lightning",
    description:
      "Casts for ~2s, then arcs a bolt through up to 5 nearby enemies for heavy damage, briefly stunning each. Interrupted if stunned mid-cast.",
    cooldown: 8,
    castTimeSec: 2,
  },
};
