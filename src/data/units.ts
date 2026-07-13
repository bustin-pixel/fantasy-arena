import type { UnitDef } from "@/types";
import { FIELD_THIRD, FIELD_WIDTH } from "@/utils/constants";

// ============================================================================
// UNIT DATABASE
// Every stat lives here. The engine reads these — nothing is hardcoded in
// systems. Ranges that the spec describes relative to the field are resolved
// to pixels here so the data stays declarative.
//
// melee range = UNIT_RADIUS*2-ish contact distance (~70px center-to-center)
// ============================================================================

// melee range is the contact distance at which melee units stop and swing.
// With a 32px unit radius (64px body-to-body), 48 keeps them nearly touching.
const MELEE = 48;

export const UNITS: Record<string, UnitDef> = {
  ogre: {
    id: "ogre",
    name: "Ogre",
    rarity: "epic",
    role: "Tank Bruiser",
    hp: 250,
    damage: 15,
    attackSpeed: 2.0,
    moveSpeed: 42, // slow
    range: MELEE,
    ability: "crushing_slam",
    tendency: "big_game",
    color: "#6b8e3a",
    accent: "#c2410c",
    traits: [
      {
        name: "Second Wind",
        description:
          "Once per match, the first hit that would drop it to 25% HP or below fully heals it instead.",
      },
    ],
  },
  orc: {
    id: "orc",
    name: "Orc",
    rarity: "epic",
    role: "Sustained Fighter",
    hp: 230,
    damage: 17,
    attackSpeed: 1.3,
    moveSpeed: 70,
    range: MELEE,
    ability: "charge",
    lifesteal: 0.4,
    color: "#557d4a",
    accent: "#22c55e",
    traits: [
      {
        name: "Lifesteal",
        description: "Heals for 40% of the damage its basic attacks deal.",
      },
    ],
  },
  archer: {
    id: "archer",
    name: "Archer",
    rarity: "rare",
    role: "Ranged DPS",
    hp: 120,
    damage: 12,
    attackSpeed: 0.85,
    moveSpeed: 78,
    range: FIELD_THIRD, // one-third battlefield width
    ability: "kiting_leap",
    color: "#a9763d",
    accent: "#facc15",
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    rarity: "rare",
    role: "Volley Ranger",
    hp: 110,
    damage: 11,
    attackSpeed: 1.0,
    moveSpeed: 76,
    range: FIELD_THIRD, // one-third battlefield width, like the Archer
    ability: "multishot", // passive headline: Multishot (every 2nd shot → 3 arrows)
    color: "#39603a", // deep-cowl forest green (2026-07-05 sprite pick B)
    accent: "#fcd34d",
  },
  knight: {
    id: "knight",
    name: "Knight",
    rarity: "rare",
    role: "Tank",
    hp: 200,
    damage: 18,
    attackSpeed: 2.0,
    moveSpeed: 60,
    range: MELEE,
    ability: "taunt_roar",
    tendency: "bodyguard",
    color: "#9aa3ad",
    accent: "#e2e8f0",
  },
  warrior: {
    id: "warrior",
    name: "Warrior",
    rarity: "rare",
    role: "Whirlwind Bruiser",
    hp: 250,
    damage: 10,
    attackSpeed: 1.4,
    moveSpeed: 58,
    range: MELEE,
    ability: "whirlwind", // passive: melee swing becomes an AoE spin + bleed
    color: "#4b5563",
    accent: "#dc2626",
  },
  fire_mage: {
    id: "fire_mage",
    name: "Fire Mage",
    rarity: "epic",
    role: "Damage Over Time",
    hp: 115,
    damage: 20,
    attackSpeed: 2.6,
    moveSpeed: 58,
    range: FIELD_WIDTH * 0.3, // a bit more reach so it isn't caught in melee
    ability: "fireball",
    school: "magic",
    color: "#b91c1c",
    accent: "#fb923c",
    basicShotRider: {
      everyNthAttack: 3,
      rider: {
        effectType: "burn",
        durationSec: 3,
        damagePerTick: 7,
        tickIntervalSec: 1,
        vfxKind: "burn_burst",
        color: "#fb923c",
      },
    },
    traits: [
      {
        name: "Kindling",
        description:
          "Every third basic attack sets the target ablaze — Burn (3 ticks of 7).",
      },
    ],
  },
  ice_mage: {
    id: "ice_mage",
    name: "Ice Mage",
    rarity: "epic",
    role: "Control",
    hp: 90,
    damage: 20,
    attackSpeed: 2.4,
    moveSpeed: 60,
    range: FIELD_WIDTH * 0.32, // medium
    ability: "frost_blast",
    school: "magic",
    color: "#2563eb",
    accent: "#7dd3fc",
    basicShotRider: {
      everyNthAttack: 2,
      rider: {
        effectType: "stun",
        durationSec: 2,
        vfxKind: "frost",
        color: "#bae6fd",
      },
    },
    traits: [
      {
        name: "Frostbite",
        description: "Every second basic attack freezes the target for 2s.",
      },
    ],
  },
  electric_mage: {
    id: "electric_mage",
    name: "Electric Mage",
    rarity: "epic",
    role: "Chain Burst",
    hp: 100,
    damage: 16,
    attackSpeed: 2.4,
    moveSpeed: 58,
    range: FIELD_WIDTH * 0.32, // medium
    ability: "chain_lightning",
    school: "magic",
    color: "#4338ca", // indigo robe
    accent: "#fde047", // electric yellow
    traits: [
      {
        name: "Paralyze",
        description:
          "Every enemy struck by its Chain Lightning is briefly stunned (0.8s) — heavy AoE damage and control.",
      },
    ],
  },
  arcane_mage: {
    id: "arcane_mage",
    name: "Arcane Mage",
    rarity: "epic",
    role: "Arcane Artillery",
    hp: 100,
    damage: 9, // light basic shot; the burst comes from the Arcane Barrage active
    attackSpeed: 1.2, // basic-attack cadence
    moveSpeed: 64,
    range: FIELD_WIDTH * 0.33, // medium-long
    ability: "arcane_barrage",
    school: "magic",
    color: "#6d28d9",
    accent: "#c084fc",
    traits: [
      {
        name: "Blink",
        description:
          "Roughly every 5s, when a melee attacker closes in, the mage blinks a safe distance away.",
      },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    rarity: "rare",
    role: "Crowd Control",
    hp: 90,
    damage: 10,
    attackSpeed: 1.6,
    moveSpeed: 60,
    range: FIELD_WIDTH * 0.3, // medium-long ranged
    ability: "polymorph",
    school: "magic",
    color: "#cbd5e1", // pale grey robe — set apart from the colored mages
    accent: "#c4b5fd", // soft lavender orb
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    rarity: "epic",
    role: "Burst / Backline",
    hp: 85,
    damage: 22,
    attackSpeed: 0.8, // very fast
    moveSpeed: 105, // fastest in the game — rushes
    range: MELEE,
    ability: "ambush",
    tendency: "backline_stalker",
    color: "#4b2e6b",
    accent: "#c084fc",
    traits: [
      {
        name: "Vanish",
        description:
          "The first lethal blow leaves it at 1 HP — stealthed and unable to die for 2.5s.",
      },
    ],
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    rarity: "epic",
    role: "Stealth Skirmisher",
    hp: 95,
    damage: 13,
    attackSpeed: 0.85, // fast
    moveSpeed: 98, // quick flanker (just under the Assassin)
    range: MELEE,
    ability: "venom",
    tendency: "backline_stalker",
    color: "#1e3a2f", // dark poison-green cloak
    accent: "#84cc16", // venom lime
    traits: [
      {
        name: "Ambusher",
        description:
          "Deploys hidden — stealthed and untargetable — and stays unseen until its first strike reveals it.",
      },
    ],
  },
  trickster: {
    id: "trickster",
    name: "Trickster",
    rarity: "epic",
    role: "Anti-Caster Disruptor",
    hp: 100,
    damage: 16,
    attackSpeed: 0.9,
    moveSpeed: 95,
    range: MELEE,
    ability: "shadow_step",
    tendency: "spellwrath",
    color: "#241b33", // shadowed violet
    accent: "#5eead4", // trickster teal shimmer
    traits: [
      {
        name: "Cloak",
        description:
          "Deploys hidden and melts back into stealth ~1.5s after it stops acting — untargetable while it lurks, revealed only when it strikes.",
      },
    ],
  },
  outlaw: {
    id: "outlaw",
    name: "Outlaw",
    rarity: "legendary",
    role: "Evasive Duelist",
    hp: 120,
    damage: 17,
    attackSpeed: 0.8, // fast
    moveSpeed: 102, // fastest legendary (just under the Assassin)
    range: MELEE,
    ability: "killing_spree",
    tendency: "backline_stalker", // slips past the front line for the soft targets
    color: "#2f2a33", // dusk-grey duster
    accent: "#e8b04b", // brass / gold trim
    traits: [
      {
        name: "Slippery",
        description:
          "A 50% chance to completely dodge any incoming hit — the blow simply misses and deals no damage.",
      },
      {
        name: "Ghost",
        description:
          "Deploys hidden in stealth — untargetable until its first strike gives it away.",
      },
    ],
  },
  healer: {
    id: "healer",
    name: "Cleric",
    rarity: "rare",
    role: "Support / Healer",
    hp: 140,
    damage: 8,
    attackSpeed: 1.6,
    moveSpeed: 58,
    range: FIELD_WIDTH * 0.3, // medium, stays back
    ability: "mend",
    color: "#cbb26a",
    accent: "#fde68a",
  },
  summoner: {
    id: "summoner",
    name: "Druid",
    rarity: "legendary",
    role: "Summoner / Shapeshifter",
    hp: 130,
    damage: 12,
    attackSpeed: 1.8,
    moveSpeed: 52,
    range: FIELD_WIDTH * 0.28,
    ability: "summon_wolves",
    abilities: ["rejuvenation"], // a second active cast
    color: "#5c4326",
    accent: "#a3e635",
    traits: [
      {
        name: "Bear Form",
        description:
          "At 30% HP it transforms into a bear: a melee bruiser that takes 80% less damage for 5s, then normal toughness. One-way. It keeps summoning and Rejuvenating, and receives 50% more healing while a bear.",
      },
    ],
  },
  // Spirit wolf — summoned by the Druid, never in a deck. Small, fast, weak.
  wolf: {
    id: "wolf",
    name: "Spirit Wolf",
    rarity: "rare",
    role: "Summoned",
    hp: 55,
    damage: 9,
    attackSpeed: 1.0,
    moveSpeed: 95,
    range: MELEE,
    ability: "lifesteal", // passive, harmless filler
    color: "#6b7280",
    accent: "#a3e635",
  },
  hunter: {
    id: "hunter",
    name: "Hunter",
    rarity: "legendary",
    role: "Beastmaster Ranged",
    hp: 120,
    damage: 14,
    attackSpeed: 1.0,
    moveSpeed: 70,
    range: FIELD_WIDTH * 0.34, // long range
    ability: "mend_beast",
    abilities: ["scatter_trap"], // a second active
    tendency: "big_game",
    color: "#4d7c0f", // hunter green
    accent: "#d9a441", // tan leather
    traits: [
      {
        name: "Boar Companion",
        description:
          "Fights with a pet boar. When the Hunter is attacked, the boar charges the attacker and taunts it off the Hunter — even from across the field. If the boar falls, the Hunter calls a new one after 8s.",
      },
    ],
  },
  // Boar — the Hunter's pet, never in a deck. A sturdy melee guard.
  boar: {
    id: "boar",
    name: "Boar",
    rarity: "rare",
    role: "Summoned",
    hp: 140,
    damage: 14,
    attackSpeed: 1.2,
    moveSpeed: 85,
    range: MELEE,
    ability: "lifesteal", // passive, harmless filler
    color: "#6b4423", // boar brown
    accent: "#d6d3d1", // tusks
  },
  berserker: {
    id: "berserker",
    name: "Berserker",
    rarity: "epic",
    role: "Scaling Bruiser",
    hp: 160,
    damage: 14,
    attackSpeed: 1.3,
    moveSpeed: 80,
    range: MELEE,
    ability: "bloodrage",
    tendency: "executioner",
    color: "#7f1d1d",
    accent: "#ef4444",
    traits: [
      {
        name: "Cleave",
        description:
          "Each swing also strikes every other enemy in melee range, not just its target.",
      },
      {
        name: "Last Stand",
        description:
          "Once per life, a blow that would kill it instead leaves it at 1 HP and unkillable for 5s — long enough to rage back from the brink.",
      },
    ],
  },
  necromancer: {
    id: "necromancer",
    name: "Necromancer",
    rarity: "legendary",
    role: "Controller / Summoner",
    hp: 100,
    damage: 14,
    attackSpeed: 2.0,
    moveSpeed: 55,
    range: FIELD_WIDTH * 0.32,
    ability: "curse", // signature active
    abilities: ["fear_aura"], // Terrify — its second active cast
    school: "magic",
    color: "#3b2a52",
    accent: "#a78bfa",
    traits: [
      {
        name: "Raise Dead",
        description:
          "Continuously raises a skeleton to fight for it every 5s, up to the battlefield's summon cap.",
      },
    ],
  },
  // Skeleton — raised by the Necromancer, never in a deck. Weak, expendable body.
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    rarity: "rare",
    role: "Summoned",
    hp: 45,
    damage: 8,
    attackSpeed: 1.1,
    moveSpeed: 72,
    range: MELEE,
    ability: "lifesteal", // passive filler
    tags: ["undead", "skeleton"],
    color: "#d6d3d1",
    accent: "#a78bfa",
  },
  slime: {
    id: "slime",
    name: "Slime",
    rarity: "legendary",
    role: "Splitter / Swarm",
    hp: 220,
    damage: 14,
    attackSpeed: 1.5,
    moveSpeed: 54,
    range: MELEE,
    ability: "slime_split",
    color: "#16a34a",
    accent: "#86efac",
  },
  slime_knight: {
    id: "slime_knight",
    name: "Slime Knight",
    rarity: "legendary",
    role: "Undying Bruiser",
    hp: 230,
    damage: 16,
    attackSpeed: 1.7,
    moveSpeed: 55,
    range: MELEE,
    ability: "gelatinous_guard",
    abilities: ["divide_reconvene"],
    color: "#2b9d54",
    accent: "#a7f3c0",
    traits: [
      {
        name: "Caustic Aura",
        description:
          "Its acid body constantly dissolves every enemy nearby — 30% of its damage per second. Skeletons fare far worse: each pulse melts 90% of their remaining bones, and any enemy skeleton that falls inside the aura is slurped into its body, restoring 20 health.",
      },
    ],
  },
  mystic_archer: {
    id: "mystic_archer",
    name: "Mystic Archer",
    rarity: "legendary",
    role: "Light / Dark Ranged",
    hp: 110,
    damage: 13,
    attackSpeed: 1.0,
    moveSpeed: 72,
    range: FIELD_WIDTH * 0.34,
    ability: "momentum",
    school: "magic",
    color: "#7c3aed",
    accent: "#fcd34d",
    traits: [
      {
        name: "Light Form",
        description:
          "Single-target. Arrows mark one enemy with Light; at 3 marks it detonates for burst damage and the Archer shifts to Dark.",
      },
      {
        name: "Dark Form",
        description:
          "Area. Arrows chain to all nearby foes, marking each with Dark; 3 marks on any of them detonates and shifts the Archer back to Light.",
      },
    ],
  },
  aegis_knight: {
    id: "aegis_knight",
    name: "Aegis Knight",
    rarity: "legendary",
    role: "Anti-Magic Bulwark",
    hp: 230,
    damage: 14,
    attackSpeed: 1.7,
    moveSpeed: 52,
    range: MELEE,
    ability: "aegis",
    tendency: "spellwrath",
    color: "#5b6b8a",
    accent: "#7dd3fc",
    wardedAgainst: ["burn", "slow", "poison"],
    traits: [
      {
        name: "Backlash",
        description:
          "When its shield fills with absorbed magic, its next swing releases it as an area burst.",
      },
      {
        name: "Warded",
        description: "Immune to Burn, Slow, and Poison.",
      },
    ],
  },
  holy_knight: {
    id: "holy_knight",
    name: "Holy Knight",
    rarity: "epic",
    role: "Support Bulwark",
    hp: 200,
    damage: 14,
    attackSpeed: 1.8,
    moveSpeed: 55,
    range: MELEE,
    ability: "blessing",
    tendency: "bodyguard",
    color: "#c9a227",
    accent: "#fff4c2",
    traits: [
      {
        name: "Bulwark of Faith",
        description:
          "Blessing's absorb shields stack on top of other shields (the Knight's Taunt, the Aegis Knight's bank), up to 150 overhealth per ally.",
      },
    ],
  },
  priest: {
    id: "priest",
    name: "Priest",
    rarity: "epic",
    role: "Support / Healer",
    hp: 125,
    damage: 8,
    attackSpeed: 1.6,
    moveSpeed: 58,
    range: FIELD_WIDTH * 0.3, // medium, stays back
    ability: "flash_heal",
    abilities: ["renew"], // a second, instant heal-over-time
    school: "magic", // holy — its smite counts as magic damage
    color: "#e6dfc4",
    accent: "#ffe08a",
  },
  seraph: {
    id: "seraph",
    name: "Seraph",
    rarity: "legendary",
    role: "Support / Raid Healer",
    hp: 130, // squishy backline capstone healer, a hair above the Priest
    damage: 7, // token attack — it heals, it doesn't fight
    attackSpeed: 1.6,
    moveSpeed: 56, // hangs back
    range: FIELD_WIDTH * 0.3, // medium, like the Priest
    ability: "divine_light", // the big 1.5s cast heal (cast pipeline)
    abilities: ["sanctuary", "renewal"], // two instant team-wide supports
    school: "magic", // radiant / holy
    color: "#f4ecd6", // pale ivory
    accent: "#ffd76a", // radiant gold
  },
  engineer: {
    id: "engineer",
    name: "Engineer",
    rarity: "legendary",
    role: "Fortifier",
    hp: 175,
    damage: 12,
    attackSpeed: 1.6,
    moveSpeed: 52, // slow dwarf, hangs mid-line
    range: FIELD_WIDTH * 0.22, // short-range
    ability: "deploy_turret",
    color: "#8a6a3d", // dwarven brass
    accent: "#f59e0b", // amber spark
    traits: [
      {
        name: "Field Repairs",
        description:
          "Every 2s, repairs itself and nearby turrets for 8 HP, keeping its emplacements alive.",
      },
      {
        name: "Turret",
        description:
          "Its turrets are stationary ranged constructs (70 HP) that hold ground until destroyed. Bounded by the summon cap.",
      },
    ],
  },
  // Turret — built by the Engineer, never in a deck. Stationary
  // (moveSpeed 0) ranged emplacement; destructible.
  turret: {
    id: "turret",
    name: "Turret",
    rarity: "rare",
    role: "Construct",
    hp: 70,
    damage: 10,
    attackSpeed: 1.2,
    moveSpeed: 0, // stationary
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    color: "#8a6a3d",
    accent: "#f59e0b",
  },
  // -------------------------------------------------------------------------
  // The Depths — PvE monsters (never in a deck; spawned by the WaveController).
  // Fodder tier, floors 1–5. Stat band ≈ Skeleton 45hp/8dmg … Boar 140hp,
  // except the Bloater, which is the tier's boss.
  // -------------------------------------------------------------------------
  giant_rat: {
    id: "giant_rat",
    name: "Giant Rat",
    rarity: "rare",
    role: "Swarming Vermin",
    hp: 30,
    damage: 5,
    attackSpeed: 0.65, // frantic nibbling
    moveSpeed: 105, // fastest thing in the dungeon
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#6d5c4d", // mangy brown-grey
    accent: "#f4a8a8", // pink ears/tail
  },
  zombie_shambler: {
    id: "zombie_shambler",
    name: "Zombie Shambler",
    rarity: "rare",
    role: "Shambling Dead",
    hp: 85,
    damage: 10,
    attackSpeed: 1.9, // slow, heavy bites
    moveSpeed: 32, // shambles
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    tags: ["undead"],
    color: "#7a8f6a", // rot green
    accent: "#c9d1c0", // pallid flesh
    traits: [
      {
        name: "Numbing Bite",
        description:
          "Its bite numbs the victim — 30% slower movement and attacks for 2s.",
      },
    ],
  },
  bloater: {
    id: "bloater",
    name: "Bloater",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Bloated Horror",
    hp: 800, // rebalanced up from 380 — the winrate sweep had it folding to 4 units
    damage: 28,
    attackSpeed: 2.2,
    moveSpeed: 30, // lumbering
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#8a9a3b", // pus green
    accent: "#d4e157",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    traits: [
      {
        name: "Putrid Burst",
        description:
          "When it dies it ruptures — dealing 30 damage and poisoning every enemy nearby. Back away when it swells low.",
      },
      {
        name: "Sloughing Mass",
        description:
          "Each time it drops past a quarter of its health, a Bloatling sloughs off (up to 3). They rupture on death too.",
      },
      {
        name: "Too Big to Baa",
        description: "Far too massive to polymorph — no sheep holds this much.",
      },
    ],
  },
  // Bloatling — sloughs off the Bloater as it's chipped down (Slime-style split).
  // Never in a deck; terminal (doesn't split further) but ruptures on death.
  bloatling: {
    id: "bloatling",
    name: "Bloatling",
    rarity: "rare",
    role: "Summoned",
    hp: 200, // ~25% of the parent, mirroring the Slime→Slimeling ratio
    damage: 14, // ~50% of the parent
    attackSpeed: 2.2,
    moveSpeed: 36, // less mass to lumber with
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#8a9a3b",
    accent: "#d4e157",
  },
  // -------------------------------------------------------------------------
  // The Bonefields — undead tier (the Necromancer's dungeon; see data/dungeons).
  // Gated behind Depths floor 5; its boss floor hosts the rare Lich fusion quest
  // (Fire Mage + Lich → Necromancer). Sprites recolor the skeleton / zombie /
  // brute bodies (the reskin pattern); the Lich reuses the Necromancer kit and
  // the Abomination reuses the Ogre kit — no new engine branches, no new abilities.
  // -------------------------------------------------------------------------
  skeleton_archer: {
    id: "skeleton_archer",
    name: "Skeleton Archer",
    rarity: "rare",
    role: "Undead Ranged",
    hp: 40,
    damage: 9,
    attackSpeed: 1.3,
    moveSpeed: 70,
    range: FIELD_WIDTH * 0.32, // plain arrows, no rider
    ability: "lifesteal", // passive filler — never casts
    tags: ["undead", "skeleton"],
    color: "#d8d2c2", // bleached bone
    accent: "#9bd0ff", // cold blue fletching
  },
  ghoul: {
    id: "ghoul",
    name: "Ghoul",
    rarity: "rare",
    role: "Ravenous Dead",
    hp: 70,
    damage: 12,
    attackSpeed: 1.0,
    moveSpeed: 95, // lunges — far faster than a shambler
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    tags: ["undead"],
    color: "#8a9b7a", // grave-rot grey-green
    accent: "#e0c48a", // jaundiced claws
  },
  bonecaller: {
    id: "bonecaller",
    name: "Bonecaller",
    rarity: "epic",
    role: "Undead Summoner",
    hp: 95,
    damage: 8,
    attackSpeed: 1.9,
    moveSpeed: 50, // hangs back and raises the dead
    range: FIELD_WIDTH * 0.28,
    ability: "lifesteal", // Raise Dead is a passive (kit onTick), not a cast
    school: "magic",
    tags: ["undead"],
    color: "#4b3f6b", // violet grave-robes
    accent: "#c4b5fd",
    traits: [
      {
        name: "Raise Dead",
        description:
          "Every 5s it claws a fresh skeleton up from the ground to fight for it, up to the battlefield's summon cap.",
      },
    ],
  },
  // Abomination — the Bonefields boss. A hulking stitched-together corpse: huge
  // HP, a crushing slam, and one refusal to die (reuses the Ogre kit).
  abomination: {
    id: "abomination",
    name: "Abomination",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Undead Horror",
    hp: 900,
    damage: 30,
    attackSpeed: 2.2,
    moveSpeed: 30, // lumbering
    range: MELEE,
    ability: "crushing_slam",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    tags: ["undead"],
    color: "#6f7a58", // grey-green stitched flesh
    accent: "#b7c48a",
    traits: [
      {
        name: "Crushing Slam",
        description:
          "Periodically caves in its target for heavy damage and a stun.",
      },
      {
        name: "Refuses to Die",
        description:
          "Once per battle, a blow that would fell it instead heaves it back to full health.",
      },
      {
        name: "Too Big to Baa",
        description: "Far too massive to polymorph — no sheep holds this much.",
      },
    ],
  },
  // Lich — the rare Bonefields catalyst (the fusion quest's spawn). A deathless
  // lord that curses, terrifies, and raises the dead (reuses the Necromancer
  // kit). Fell it with a Fire Mage fielded to earn the Necromancer.
  lich: {
    id: "lich",
    name: "Lich",
    rarity: "legendary",
    role: "Deathless Lord",
    hp: 300,
    damage: 14,
    attackSpeed: 2.0,
    moveSpeed: 52,
    range: FIELD_WIDTH * 0.32,
    ability: "curse", // signature single-target DoT
    abilities: ["fear_aura"], // Terrify — its AoE second cast
    school: "magic",
    wardedAgainst: ["polymorph"],
    tags: ["undead"],
    color: "#2a2140", // black-violet bone
    accent: "#a78bfa",
    traits: [
      {
        name: "Raise Dead",
        description: "Every 5s it raises a skeleton to bolster its host.",
      },
      {
        name: "Curse",
        description: "Lays a heavy decaying curse on a single foe.",
      },
      {
        name: "Terrify",
        description: "Wails to send nearby enemies fleeing in fear.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Wilds — feral beast tier (the Hunter's dungeon; see data/dungeons).
  // Gated behind Depths floor 5; its boss floor hosts the rare Apex Beast fusion
  // quest (Archer + Apex Beast → Hunter). Sprites reuse the wolf / boar / bear
  // draws; the boss reuses the Berserker kit and the Apex Beast the Ogre kit.
  // -------------------------------------------------------------------------
  dire_wolf: {
    id: "dire_wolf",
    name: "Dire Wolf",
    rarity: "rare",
    role: "Pack Hunter",
    hp: 55,
    damage: 11,
    attackSpeed: 1.0,
    moveSpeed: 100, // runs the field down
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#5b6470", // slate-grey pelt
    accent: "#c7ccd4",
  },
  razorback: {
    id: "razorback",
    name: "Razorback",
    rarity: "rare",
    role: "Charging Brute",
    hp: 150,
    damage: 16,
    attackSpeed: 1.6,
    moveSpeed: 70,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#5a3f2c", // bristly brown hide
    accent: "#d9c2a3", // tusks
  },
  grizzly: {
    id: "grizzly",
    name: "Grizzly",
    rarity: "rare",
    role: "Woodland Bruiser",
    hp: 110,
    damage: 15,
    attackSpeed: 1.5,
    moveSpeed: 60,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#7a5a34", // brown bear
    accent: "#e8d3ad",
  },
  // Dire Alpha — the Wilds boss. A pack leader that turns berserk as it's
  // wounded and cleaves the whole line (reuses the Berserker kit).
  dire_alpha: {
    id: "dire_alpha",
    name: "Dire Alpha",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Pack Alpha",
    hp: 850,
    damage: 26,
    attackSpeed: 1.3,
    moveSpeed: 78, // fast for its size
    range: MELEE,
    ability: "bloodrage",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#3f4550", // near-black dire pelt
    accent: "#ef4444", // blood-red eyes
    traits: [
      {
        name: "Bloodrage",
        description:
          "The more wounded it is, the harder and faster it strikes.",
      },
      {
        name: "Cleave",
        description: "Each swing also mauls every other enemy in reach.",
      },
      {
        name: "Last Stand",
        description:
          "Once per battle, a killing blow leaves it at 1 HP and unkillable for 5s.",
      },
    ],
  },
  // Apex Beast — the rare Wilds catalyst (the fusion quest's spawn). A colossal
  // bear that slams and refuses to fall (reuses the Ogre kit). Fell it with an
  // Archer fielded to earn the Hunter.
  apex_beast: {
    id: "apex_beast",
    name: "Apex Beast",
    rarity: "legendary",
    role: "Great Predator",
    hp: 320,
    damage: 20,
    attackSpeed: 1.7,
    moveSpeed: 66,
    range: MELEE,
    ability: "crushing_slam",
    wardedAgainst: ["polymorph"],
    color: "#6b4a2a", // great brown bear
    accent: "#f5e0b8",
    traits: [
      {
        name: "Crushing Slam",
        description: "Periodically caves in its prey for heavy damage and a stun.",
      },
      {
        name: "Apex",
        description:
          "Once per battle, a blow that would fell it instead heaves it back to full.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Sealed Vault — arcane tier (the Aegis Knight's dungeon; see data/dungeons).
  // Gated behind Depths floor 5; its whole horde is `school: "magic"`, so the
  // Aegis Knight's magic soak is the answer. Boss floor hosts the rare Archmage
  // fusion quest (Knight + Archmage → Aegis Knight). Casters reuse the mage
  // draws; the Archmage reuses the Arcane Mage kit; the Rune Golem gets a small
  // damage-reduction kit; the Wisp gets a new orb sprite.
  // -------------------------------------------------------------------------
  arcane_wisp: {
    id: "arcane_wisp",
    name: "Arcane Wisp",
    rarity: "rare",
    role: "Loosed Magic",
    hp: 30,
    damage: 10,
    attackSpeed: 1.2,
    moveSpeed: 82, // drifts fast
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#7c5cff", // violet mote
    accent: "#c4b5fd",
  },
  imp: {
    id: "imp",
    name: "Imp",
    rarity: "rare",
    role: "Arcane Vermin",
    hp: 48,
    damage: 11,
    attackSpeed: 1.1,
    moveSpeed: 76,
    range: FIELD_WIDTH * 0.28,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#b91c1c", // red imp
    accent: "#fb923c", // ember
  },
  cultist: {
    id: "cultist",
    name: "Vault Cultist",
    rarity: "rare",
    role: "Arcane Caster",
    hp: 75,
    damage: 9,
    attackSpeed: 1.6,
    moveSpeed: 55,
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#3b2a52", // dark robe
    accent: "#a78bfa",
  },
  // Rune Golem — the Sealed Vault boss. A warded construct that halves ALL
  // incoming damage (its own damage-reduction kit) — a slow, grinding wall.
  rune_golem: {
    id: "rune_golem",
    name: "Rune Golem",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Warded Construct",
    hp: 750,
    damage: 24,
    attackSpeed: 1.8,
    moveSpeed: 34, // lumbering
    range: MELEE,
    ability: "lifesteal", // no active — damage reduction is the mechanic (kit)
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#4a5568", // rune-carved stone
    accent: "#38bdf8", // glowing glyphs
    traits: [
      {
        name: "Warded Hide",
        description:
          "Ancient runes halve every hit it takes — physical or magical alike.",
      },
      {
        name: "Too Big to Baa",
        description: "Far too massive to polymorph — no sheep holds this much.",
      },
    ],
  },
  // Archmage — the rare Sealed Vault catalyst (the fusion quest's spawn). A
  // slippery burst caster that blinks from melee and looses arcane volleys
  // (reuses the Arcane Mage kit). Fell it with a Knight fielded to earn the
  // Aegis Knight.
  archmage: {
    id: "archmage",
    name: "Archmage",
    rarity: "legendary",
    role: "Master of the Arcane",
    hp: 280,
    damage: 16,
    attackSpeed: 2.0,
    moveSpeed: 52,
    range: FIELD_WIDTH * 0.34,
    ability: "arcane_barrage",
    school: "magic",
    wardedAgainst: ["polymorph"],
    color: "#1e3a8a", // deep arcane blue
    accent: "#fcd34d", // gold filigree
    traits: [
      {
        name: "Arcane Barrage",
        description: "Looses a volley of three homing arcane missiles.",
      },
      {
        name: "Blink",
        description: "Teleports away the instant a melee attacker closes in.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Overgrowth — nature tier (the Druid's dungeon; see data/dungeons).
  // Gated behind Depths floor 5; boss floor hosts the rare Wildheart fusion quest
  // (Cleric + Wildheart → Druid). Dryads reuse the Cleric kit (Mend); the Elder
  // Treant reuses the Ogre kit and the Wildheart the Berserker kit; new plant
  // sprites (drawTreant / drawSporePod) + a mossy-boar reskin.
  // -------------------------------------------------------------------------
  thornbeast: {
    id: "thornbeast",
    name: "Thornbeast",
    rarity: "rare",
    role: "Bramble Charger",
    hp: 90,
    damage: 13,
    attackSpeed: 1.4,
    moveSpeed: 65,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#3f6b2f", // mossy green hide
    accent: "#8fae52", // thorns
  },
  spore_pod: {
    id: "spore_pod",
    name: "Spore Pod",
    rarity: "rare",
    role: "Rooted Bloom",
    hp: 130,
    damage: 9,
    attackSpeed: 2.0,
    moveSpeed: 24, // barely creeps
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#6b7f3a", // fungal cap
    accent: "#d9f99d", // spores
    traits: [
      {
        name: "Rooted",
        description: "A slow, swollen bloom that soaks hits at the front of the grove.",
      },
    ],
  },
  dryad: {
    id: "dryad",
    name: "Dryad",
    rarity: "epic",
    role: "Grove Healer",
    hp: 85,
    damage: 8,
    attackSpeed: 1.8,
    moveSpeed: 55,
    range: FIELD_WIDTH * 0.3,
    ability: "mend", // Cleric kit — heals the most-wounded ally in range
    color: "#2f6b4a", // deep leaf-green
    accent: "#bbf7d0",
    traits: [
      {
        name: "Mend",
        description: "Channels nature's vigor to heal the most-wounded creature nearby.",
      },
    ],
  },
  // Elder Treant — the Overgrowth boss. An ancient walking tree: colossal HP, a
  // crushing slam, and one regrowth from the brink (reuses the Ogre kit).
  elder_treant: {
    id: "elder_treant",
    name: "Elder Treant",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Ancient Guardian",
    hp: 1000,
    damage: 26,
    attackSpeed: 2.0,
    moveSpeed: 28, // ponderous
    range: MELEE,
    ability: "crushing_slam",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#5b4327", // bark brown
    accent: "#4d7c0f", // canopy green
    traits: [
      {
        name: "Crushing Slam",
        description: "Periodically brings a massive limb down for heavy damage and a stun.",
      },
      {
        name: "Regrowth",
        description:
          "Once per battle, a blow that would fell it instead surges it back to full.",
      },
      {
        name: "Too Big to Baa",
        description: "Far too massive to polymorph — no sheep holds this much.",
      },
    ],
  },
  // Wildheart — the rare Overgrowth catalyst (the fusion quest's spawn). The
  // grove's beating heart, a treant-spirit that rages harder as it's wounded and
  // cleaves the line (reuses the Berserker kit). Fell it with a Cleric fielded to
  // earn the Druid.
  wildheart: {
    id: "wildheart",
    name: "Wildheart",
    rarity: "legendary",
    role: "Heart of the Grove",
    hp: 300,
    damage: 18,
    attackSpeed: 1.7,
    moveSpeed: 40,
    range: MELEE,
    ability: "bloodrage",
    wardedAgainst: ["polymorph"],
    color: "#6b5327", // radiant heartwood
    accent: "#facc15", // golden sap-glow
    traits: [
      {
        name: "Wild Fury",
        description: "The more wounded it is, the harder and faster it lashes out.",
      },
      {
        name: "Thrash",
        description: "Each swing also rends every other enemy in reach.",
      },
      {
        name: "Ever-Green",
        description:
          "Once per battle, a killing blow leaves it at 1 HP and unkillable for 5s.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Eclipse Spire — celestial light/dark tier (the Mystic Archer's dungeon;
  // see data/dungeons). Gated behind Depths floor 5; boss floor hosts the rare
  // Eclipse Herald fusion quest (Mage + Herald → Mystic Archer). All school
  // magic. Sprites reuse the wisp / assassin / mage / mystic-archer draws (light
  // & dark tints); the Warden reuses the Mystic Archer kit and the Herald the
  // Arcane Mage kit — no new sprites or kits.
  // -------------------------------------------------------------------------
  light_wisp: {
    id: "light_wisp",
    name: "Light Wisp",
    rarity: "rare",
    role: "Radiant Mote",
    hp: 32,
    damage: 11,
    attackSpeed: 1.1,
    moveSpeed: 82,
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#fcd34d", // radiant gold
    accent: "#fffbeb",
  },
  shadow_wraith: {
    id: "shadow_wraith",
    name: "Shadow Wraith",
    rarity: "rare",
    role: "Creeping Dark",
    hp: 55,
    damage: 13,
    attackSpeed: 1.0,
    moveSpeed: 92, // slips across the field
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#2a2140", // umbral shade
    accent: "#7c3aed",
  },
  eclipse_acolyte: {
    id: "eclipse_acolyte",
    name: "Eclipse Acolyte",
    rarity: "rare",
    role: "Twilight Caster",
    hp: 75,
    damage: 9,
    attackSpeed: 1.6,
    moveSpeed: 55,
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    color: "#4c1d95", // twilight violet
    accent: "#c4b5fd",
  },
  // Eclipse Warden — the Spire boss. A celestial archer that shifts between Light
  // and Dark, marking and detonating its targets and ramping ever faster (reuses
  // the Mystic Archer kit).
  eclipse_warden: {
    id: "eclipse_warden",
    name: "Eclipse Warden",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Warden of Dusk",
    hp: 680,
    damage: 20,
    attackSpeed: 1.2,
    moveSpeed: 55,
    range: FIELD_WIDTH * 0.34,
    ability: "momentum",
    school: "magic",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#3730a3", // deep indigo
    accent: "#fcd34d",
    traits: [
      {
        name: "Light & Dark",
        description:
          "Its shots mark foes; at three marks they detonate and it flips form — Light single-target, Dark chaining wide.",
      },
      {
        name: "Momentum",
        description: "Every form shift makes it permanently faster.",
      },
    ],
  },
  // Eclipse Herald — the rare Spire catalyst (the fusion quest's spawn). A herald
  // of twin light that looses arcane volleys and blinks from melee (reuses the
  // Arcane Mage kit). Fell it with a Mage fielded to earn the Mystic Archer.
  eclipse_herald: {
    id: "eclipse_herald",
    name: "Eclipse Herald",
    rarity: "legendary",
    role: "Herald of Twin Light",
    hp: 280,
    damage: 16,
    attackSpeed: 2.0,
    moveSpeed: 52,
    range: FIELD_WIDTH * 0.34,
    ability: "arcane_barrage",
    school: "magic",
    wardedAgainst: ["polymorph"],
    color: "#0ea5e9", // dawn-blue
    accent: "#fde68a",
    traits: [
      {
        name: "Arcane Barrage",
        description: "Looses a volley of three homing missiles of light.",
      },
      {
        name: "Blink",
        description: "Steps through shadow the instant a melee attacker closes in.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Deep Forge — construct tier (the Engineer's dungeon; see data/dungeons).
  // Gated behind Depths floor 5; boss floor hosts the rare Ancient Automaton
  // fusion quest (Ogre + Automaton → Engineer). Sprites reuse the turret / rat /
  // knight / brute draws (metal tints); the Forge Golem reuses the Ogre kit and
  // the Ancient Automaton the Rune Golem kit — no new sprites or kits.
  // -------------------------------------------------------------------------
  clockwork_spider: {
    id: "clockwork_spider",
    name: "Clockwork Spider",
    rarity: "rare",
    role: "Skittering Construct",
    hp: 40,
    damage: 10,
    attackSpeed: 0.9,
    moveSpeed: 100, // scuttles fast
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#71717a", // gunmetal
    accent: "#fcd34d", // brass joints
  },
  sentry: {
    id: "sentry",
    name: "Forge Sentry",
    rarity: "rare",
    role: "Ranged Construct",
    hp: 60,
    damage: 12,
    attackSpeed: 1.4,
    moveSpeed: 45, // trundles slowly
    range: FIELD_WIDTH * 0.32,
    ability: "lifesteal", // passive filler — never casts
    color: "#8a6a3d", // dwarven brass
    accent: "#f59e0b", // amber spark
  },
  animated_armor: {
    id: "animated_armor",
    name: "Animated Armor",
    rarity: "rare",
    role: "Empty Suit",
    hp: 130,
    damage: 15,
    attackSpeed: 1.6,
    moveSpeed: 55,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#52525b", // dark steel
    accent: "#a1a1aa",
  },
  // Forge Golem — the Deep Forge boss. A colossal molten construct: huge HP, a
  // crushing slam, and one reforge from the brink (reuses the Ogre kit).
  forge_golem: {
    id: "forge_golem",
    name: "Forge Golem",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Molten Colossus",
    hp: 900,
    damage: 28,
    attackSpeed: 2.0,
    moveSpeed: 30, // lumbering
    range: MELEE,
    ability: "crushing_slam",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#7c2d12", // fire-blackened iron
    accent: "#f97316", // molten glow
    traits: [
      {
        name: "Crushing Slam",
        description: "Periodically brings a molten fist down for heavy damage and a stun.",
      },
      {
        name: "Reforge",
        description:
          "Once per battle, a blow that would break it instead reforges it to full.",
      },
      {
        name: "Too Big to Baa",
        description: "Far too massive to polymorph — no sheep holds this much.",
      },
    ],
  },
  // Ancient Automaton — the rare Deep Forge catalyst (the fusion quest's spawn).
  // A relic construct sheathed in warded plating that halves every hit (reuses
  // the Rune Golem kit). Wreck it with an Ogre fielded to earn the Engineer.
  ancient_automaton: {
    id: "ancient_automaton",
    name: "Ancient Automaton",
    rarity: "legendary",
    role: "Relic Construct",
    hp: 320,
    damage: 18,
    attackSpeed: 1.8,
    moveSpeed: 40,
    range: MELEE,
    ability: "lifesteal", // no active — warded plating is the mechanic (kit)
    wardedAgainst: ["polymorph"],
    color: "#78350f", // ancient bronze
    accent: "#fde68a", // gold filigree
    traits: [
      {
        name: "Warded Plating",
        description: "Age-old wards halve every hit it takes — physical or magical alike.",
      },
      {
        name: "Relic",
        description: "A construct from a forgotten age, built to outlast armies.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Fallen Cathedral — desecrated-sanctum tier (the Seraph's dungeon; see
  // data/dungeons). Gated behind Eclipse Spire floor 5; boss floor hosts the
  // rare Penitent fusion quest (Priest + Penitent → Seraph). The Penitent
  // reuses the Priest kit — the first SUPPORT rare, it heals its own wave —
  // and Seraphiel the boss reuses the Seraph kit (a dark mirror of the prize).
  // -------------------------------------------------------------------------
  heretic_zealot: {
    id: "heretic_zealot",
    name: "Heretic Zealot",
    rarity: "rare",
    role: "Frenzied Faithful",
    hp: 60,
    damage: 12,
    attackSpeed: 0.9, // fast, frothing swings
    moveSpeed: 88,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#4c1d24", // wine-dark vestments
    accent: "#f6c453", // guttering candle gold
  },
  gargoyle: {
    id: "gargoyle",
    name: "Gargoyle",
    rarity: "rare",
    role: "Waking Stone",
    hp: 130,
    damage: 10,
    attackSpeed: 1.8,
    moveSpeed: 45, // grinding stone gait
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#57534e", // weathered granite
    accent: "#a8a29e",
  },
  grave_chorister: {
    id: "grave_chorister",
    name: "Grave Chorister",
    rarity: "rare",
    role: "Wailing Spirit",
    hp: 45,
    damage: 12,
    attackSpeed: 1.4,
    moveSpeed: 60,
    range: FIELD_WIDTH * 0.3,
    ability: "lifesteal", // passive filler — never casts
    school: "magic",
    tags: ["undead"],
    color: "#8b93a7", // faded shroud grey
    accent: "#dbe4ff", // spectral glow
  },
  // Seraphiel the Forsworn — the Cathedral boss. A fallen mirror of the Seraph
  // itself: it bubbles and mends itself with the same raid-healer kit while its
  // burning blade does the arguing (reuses the Seraph kit).
  fallen_seraph: {
    id: "fallen_seraph",
    name: "Seraphiel the Forsworn",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Fallen Radiance",
    hp: 640,
    damage: 22,
    attackSpeed: 1.2,
    moveSpeed: 50,
    range: FIELD_WIDTH * 0.3,
    ability: "divine_light",
    abilities: ["sanctuary", "renewal"],
    school: "magic",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#3f3348", // ash-stained ivory gone dusk
    accent: "#e8b04b", // tarnished halo gold
    traits: [
      {
        name: "Sanctuary",
        description:
          "Wraps itself in absorb bubbles and mends its wounds with Divine Light — outlast the halo or be outlasted.",
      },
      {
        name: "Burned Wings",
        description:
          "What it once shielded armies with, it now spends only on itself.",
      },
    ],
  },
  // The Penitent — the rare Cathedral catalyst (the fusion quest's spawn). A
  // fallen angel that KEEPS HEALING its own wave (reuses the Priest kit — the
  // first support rare). Grant it rest with a Priest fielded to earn the Seraph.
  penitent: {
    id: "penitent",
    name: "The Penitent",
    rarity: "legendary",
    role: "Fallen Angel",
    hp: 260,
    damage: 10,
    attackSpeed: 1.6,
    moveSpeed: 56,
    range: FIELD_WIDTH * 0.3,
    ability: "flash_heal",
    abilities: ["renew"],
    school: "magic",
    wardedAgainst: ["polymorph"],
    color: "#cfc6b8", // ash-dusted alabaster
    accent: "#9db8ff", // cold votive light
    traits: [
      {
        name: "Unending Vigil",
        description:
          "It cannot stop tending the fallen — Flash Heal and Renew keep its wave standing long past its welcome.",
      },
      {
        name: "Seeking Rest",
        description: "It does not flee the blade. It is waiting for the right one.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Rogue's Den — thieves'-guild tier (the Outlaw's dungeon; see
  // data/dungeons). Gated behind Eclipse Spire floor 5; boss floor hosts the
  // rare Silencer fusion quest (any stealth unit + Silencer → Outlaw). The
  // Silencer reuses the Outlaw kit (a taste of dodge + Killing Spree before you
  // own it) and the Bandit King the Berserker kit.
  // -------------------------------------------------------------------------
  cutpurse: {
    id: "cutpurse",
    name: "Cutpurse",
    rarity: "rare",
    role: "Gutter Blade",
    hp: 42,
    damage: 10,
    attackSpeed: 0.75, // flurry of quick dagger jabs
    moveSpeed: 100, // darts across the field
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#3b3347", // patched dusk-grey hood
    accent: "#d4a017", // stolen-coin glint
  },
  knife_thrower: {
    id: "knife_thrower",
    name: "Knife Thrower",
    rarity: "rare",
    role: "Poisoned Steel",
    hp: 50,
    damage: 11,
    attackSpeed: 1.1,
    moveSpeed: 70,
    range: FIELD_WIDTH * 0.28,
    ability: "lifesteal", // passive filler — never casts
    basicShotRider: {
      everyNthAttack: 3,
      rider: {
        effectType: "poison",
        durationSec: 3,
        damagePerTick: 5,
        tickIntervalSec: 1,
        vfxKind: "burn_burst", // reused burst, tinted venom-lime
        color: "#84cc16", // venom-slick blade
      },
    },
    color: "#2c333d", // oiled leather
    accent: "#84cc16", // venom lime
  },
  den_bruiser: {
    id: "den_bruiser",
    name: "Den Bruiser",
    rarity: "rare",
    role: "Guild Muscle",
    hp: 125,
    damage: 14,
    attackSpeed: 1.7,
    moveSpeed: 50,
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#5b4632", // scarred hide vest
    accent: "#c98a3d", // brass knuckles
  },
  // The Bandit King — the Den boss. A roaring crowned brute whose rage only
  // builds: cleaving sabers, ramping bloodrage, and one spiteful refusal to die
  // (reuses the Berserker kit).
  bandit_king: {
    id: "bandit_king",
    name: "The Bandit King",
    battleScale: 2.1, // boss — towers over rank-and-file on the battlefield
    rarity: "epic",
    role: "Crowned Cutthroat",
    hp: 780,
    damage: 22,
    attackSpeed: 1.4,
    moveSpeed: 62,
    range: MELEE,
    ability: "bloodrage",
    tendency: "executioner",
    wardedAgainst: ["polymorph"], // bosses don't fit in a sheep
    color: "#4a2c3a", // wine-stained leathers
    accent: "#e8b04b", // stolen crown gold
    traits: [
      {
        name: "Twin Sabers",
        description:
          "Each swing cleaves every enemy in reach — the King doesn't pick favorites.",
      },
      {
        name: "King's Ransom",
        description:
          "Once per battle, a killing blow leaves him at 1 HP and unkillable — long enough to rage back.",
      },
    ],
  },
  // The Silencer — the rare Den catalyst (the fusion quest's spawn). The
  // guild's masked executioner (reuses the Outlaw kit: stealth deploy, 50%
  // dodge, Killing Spree). Cut it down with a stealth unit fielded — Assassin,
  // Rogue, or Trickster — to earn the Outlaw.
  silencer: {
    id: "silencer",
    name: "The Silencer",
    rarity: "legendary",
    role: "Guild Executioner",
    hp: 300,
    damage: 16,
    attackSpeed: 0.85,
    moveSpeed: 100,
    range: MELEE,
    ability: "killing_spree",
    tendency: "backline_stalker",
    wardedAgainst: ["polymorph"],
    color: "#1c1a22", // featureless black mask
    accent: "#b91c1c", // a single red thread
    traits: [
      {
        name: "Slippery",
        description:
          "Half of all blows simply never find it — a 50% chance to dodge any hit.",
      },
      {
        name: "Killing Spree",
        description:
          "Builds toward an untouchable rampage, teleporting blade-first between victims.",
      },
    ],
  },
  // Slime clone — spawned when the original splits. Never in a deck. Doesn't
  // split further (terminal), but still bursts on death.
  slime_clone: {
    id: "slime_clone",
    name: "Slimeling",
    rarity: "rare",
    role: "Summoned",
    hp: 55, // ~50% of a quartered original; set explicitly at spawn anyway
    damage: 7,
    attackSpeed: 1.5,
    moveSpeed: 60,
    range: MELEE,
    ability: "slime_split", // for the death-burst; splitting is gated to originals
    color: "#22c55e",
    accent: "#bbf7d0",
  },
  // Slime Blob — flung from a dying Slime Knight. Never in a deck; carries a
  // homeAnchor and races back to the corpse (never fighting) to reincarnate the
  // knight, bursting weakly if killed en route. Damage 0: it's a pure runner.
  slime_squire: {
    id: "slime_squire",
    name: "Slime Blob",
    rarity: "rare",
    role: "Summoned",
    hp: 20, // fragile — dies in a hit or two, so splitting is a real gamble
    damage: 0,
    attackSpeed: 2,
    moveSpeed: 34, // a slow, gooey crawl back to the corpse — easy to intercept
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts, never attacks
    color: "#3ec46f",
    accent: "#c9f9d8",
  },
};

export const UNIT_IDS = Object.keys(UNITS);

/** Units that only ever enter play as another unit's summon (Druid wolf,
 *  Necromancer skeletons, slime splits, Engineer turret, Hunter boar).
 *  This is the POLYMORPH-IMMUNITY set — sheep the master, not the minion.
 *  Depths monsters are NOT summons: they're real enemies and fair game.
 *  Adding a summon: put it here AND in NON_DECK_UNITS below. */
export const SUMMONED_UNIT_IDS = new Set<string>([
  "wolf",
  "skeleton",
  "slime_clone",
  "slime_squire",
  "turret",
  "boar",
  "bloatling",
]);

/** Unit ids that are NOT selectable cards (summoned at runtime only, or
 *  Depths monsters spawned by the WaveController). Deck/hub filtering ONLY —
 *  for "is this a summon?" semantics use SUMMONED_UNIT_IDS. */
export const NON_DECK_UNITS = new Set<string>([
  ...SUMMONED_UNIT_IDS,
  // Retired from decks 2026-07-12 (was a purchasable legendary): the Slime
  // now exists only as The Depths' floor-5 rare spawn — the Slime Knight
  // quest catalyst (RARE_SPAWN_QUESTS in data/depths.ts).
  "slime",
  "giant_rat",
  "zombie_shambler",
  "bloater",
  // The Bonefields (undead) tier.
  "skeleton_archer",
  "ghoul",
  "bonecaller",
  "abomination",
  "lich",
  // The Wilds (feral beast) tier.
  "dire_wolf",
  "razorback",
  "grizzly",
  "dire_alpha",
  "apex_beast",
  // The Sealed Vault (arcane) tier.
  "arcane_wisp",
  "imp",
  "cultist",
  "rune_golem",
  "archmage",
  // The Overgrowth (nature) tier.
  "thornbeast",
  "spore_pod",
  "dryad",
  "elder_treant",
  "wildheart",
  // The Eclipse Spire (celestial) tier.
  "light_wisp",
  "shadow_wraith",
  "eclipse_acolyte",
  "eclipse_warden",
  "eclipse_herald",
  // The Deep Forge (construct) tier.
  "clockwork_spider",
  "sentry",
  "animated_armor",
  "forge_golem",
  "ancient_automaton",
  // The Fallen Cathedral (desecrated sanctum) tier.
  "heretic_zealot",
  "gargoyle",
  "grave_chorister",
  "fallen_seraph",
  "penitent",
  // The Rogue's Den (thieves' guild) tier.
  "cutpurse",
  "knife_thrower",
  "den_bruiser",
  "bandit_king",
  "silencer",
]);

/** Units that can appear in a player/AI deck or the hub card grid. */
export const DECKABLE_UNIT_IDS = UNIT_IDS.filter(
  (id) => !NON_DECK_UNITS.has(id)
);

export function getUnitDef(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unknown unit def: ${id}`);
  return def;
}

/** A unit is "melee" if its range is short. Used by AI / kiting logic. */
export function isMelee(def: UnitDef): boolean {
  return def.range <= MELEE + 1;
}
