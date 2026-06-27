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
    color: "#5c4326",
    accent: "#a3e635",
    traits: [
      {
        name: "Bear Form",
        description:
          "At 30% HP it transforms into a bear: a melee bruiser that takes 80% less damage. One-way, and it stops summoning.",
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
    ability: "raise_dead", // primary; fear is a second ability handled in logic
    school: "magic",
    color: "#3b2a52",
    accent: "#a78bfa",
    traits: [
      {
        name: "Terrify",
        description:
          "When no corpse is available to raise, nearby enemies flee in terror for 2s instead.",
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
    name: "Dwarven Engineer",
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
  // Turret — built by the Dwarven Engineer, never in a deck. Stationary
  // (moveSpeed 0) ranged emplacement; destructible, leaves no raisable corpse.
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

/** Unit ids that are NOT selectable cards (summoned at runtime only). */
export const NON_DECK_UNITS = new Set<string>(["wolf", "skeleton", "slime_clone", "turret"]);

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
