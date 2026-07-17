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
  summon_imps: {
    id: "summon_imps",
    name: "Summon Imps",
    description:
      "Tears open a rift and calls two void imps — ranged minions that fight until they fall. Limited by the battlefield's summon cap.",
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
  flash_heal: {
    id: "flash_heal",
    name: "Flash Heal",
    description:
      "A 1s prayer that restores 22 HP to the most-wounded ally in range (itself included).",
    cooldown: 3,
    castTimeSec: 1,
  },
  renew: {
    id: "renew",
    name: "Renew",
    description:
      "Instant: lays a healing-over-time on the most-wounded ally in range — 5 HP every 1s for 6s (30 total).",
    cooldown: 6,
  },
  divine_light: {
    id: "divine_light",
    name: "Divine Light",
    description:
      "A 1.5s prayer that pours 100 HP into EVERY teammate (itself included), then blankets them all in a renewing glow — 6 HP every 1s for 6s (36 more each).",
    cooldown: 10,
    castTimeSec: 1.5,
  },
  sanctuary: {
    id: "sanctuary",
    name: "Sanctuary",
    description:
      "Instant: bathes the whole team in a +55 absorb bubble (itself included), stacking on any existing shield, capped at 150 per ally.",
    cooldown: 11,
  },
  resurrection: {
    id: "resurrection",
    name: "Resurrection",
    description:
      "A 1s prayer that brings a fallen hero back to life at half HP. Once per battle (summons don't count as heroes).",
    // Once per battle: the kit gates it on a spent-flag, not this cooldown.
    cooldown: 0,
    castTimeSec: 1,
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
      "On death it bursts and flings out 3 slime blobs that ignore the fight and ooze back to its corpse. Cut them all down before one arrives (they burst when killed) or the knight is reborn at half HP — and each rebirth flings one fewer blob (3 → 2 → 1), so a fully-intercepted knight stays dead.",
    cooldown: 0,
  },
  killing_spree: {
    id: "killing_spree",
    name: "Killing Spree",
    description:
      "Charges up over its first 10s alive (a gold bar fills under its health — it still moves and fights while it charges). At full it erupts into a 5s spree, blinking between enemies and striking each one, all while immune to every source of damage and crowd control — stuns included. 60s cooldown.",
    cooldown: 60,
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
  grand_grimoire: {
    id: "grand_grimoire",
    name: "Grand Grimoire",
    description:
      "Each cast rips a random page from the grimoire: Fireball, Frost Blast, Chain Lightning, Arcane Barrage, Polymorph, Mirror Image (a fragile illusion double), or the jackpot — Twincast, which casts two of the others back to back.",
    cooldown: 6,
    castTimeSec: 0.8,
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

  // ---- bespoke dungeon boss / rare-catalyst abilities ----------------------
  call_of_the_wild: {
    id: "call_of_the_wild",
    name: "Call of the Wild",
    description:
      "Passive: at 66% and 33% HP it howls — two dire wolves lope in, the whole pack surges, and nearby enemies recoil in fear for 1s.",
    cooldown: 0,
  },
  putrid_spew: {
    id: "putrid_spew",
    name: "Putrid Spew",
    description:
      "Belches a toxic cloud over the target's cluster: damage, a lingering poison, and a 40% slow.",
    cooldown: 10,
  },
  grasping_roots: {
    id: "grasping_roots",
    name: "Grasping Roots",
    description:
      "Erupts roots around the target, damaging the cluster and pinning it in place with an 85% slow for 2.5s.",
    cooldown: 11,
  },
  runic_plating: {
    id: "runic_plating",
    name: "Runic Plating",
    description:
      "Passive: starts at 60% damage reduction. Each time its HP crosses 75/50/25% a plate shatters — its reduction drops, a shockwave damages and stuns nearby foes, and it swings 15% faster.",
    cooldown: 0,
  },
  magma_vents: {
    id: "magma_vents",
    name: "Magma Vents",
    description:
      "Opens burning vents beneath up to three of the player's units, setting each alight.",
    cooldown: 10,
  },
  fan_of_knives: {
    id: "fan_of_knives",
    name: "Fan of Knives",
    description:
      "Flings five poisoned knives, split across the nearest enemies — a lone target eats all five.",
    cooldown: 9,
  },
  apex_predator: {
    id: "apex_predator",
    name: "Apex Predator",
    description:
      "Passive: its opening pounce stuns the prey for 1s, and every kill it makes permanently ramps its attack speed (+12% each, up to +72%).",
    cooldown: 0,
  },
  verdant_pulse: {
    id: "verdant_pulse",
    name: "Verdant Pulse",
    description:
      "Passive: every 6s it pulses life, healing the whole grove; its thorns bite back at melee attackers; and it buds two dryads when it falls.",
    cooldown: 0,
  },
  sentry_protocol: {
    id: "sentry_protocol",
    name: "Sentry Protocol",
    description:
      "Passive: rebuilds a turret every 8s (up to two). While any turret stands, its wards cut incoming damage 40% — destroy them to expose the core.",
    cooldown: 0,
  },
  umbral_veil: {
    id: "umbral_veil",
    name: "Umbral Veil",
    description:
      "Drapes a shroud over the target's cluster: a 2.5s silence and a 30% slow.",
    cooldown: 12,
  },
};
