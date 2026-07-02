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
    color: "#3b82f6",
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
    color: "#5b6b8a",
    accent: "#7dd3fc",
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
    rarity: "epic",
    role: "Bloated Horror",
    hp: 380,
    damage: 16,
    attackSpeed: 2.2,
    moveSpeed: 30, // lumbering
    range: MELEE,
    ability: "lifesteal", // passive filler — never casts
    color: "#8a9a3b", // pus green
    accent: "#d4e157",
    traits: [
      {
        name: "Putrid Burst",
        description:
          "When it dies it ruptures — dealing 30 damage and poisoning every enemy nearby. Back away when it swells low.",
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
};

export const UNIT_IDS = Object.keys(UNITS);

/** Unit ids that are NOT selectable cards (summoned at runtime only, or
 *  Depths monsters spawned by the WaveController). */
export const NON_DECK_UNITS = new Set<string>([
  "wolf",
  "skeleton",
  "slime_clone",
  "turret",
  "boar",
  "giant_rat",
  "zombie_shambler",
  "bloater",
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
