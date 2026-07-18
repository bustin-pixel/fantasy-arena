// ============================================================================
// Dungeons — the PvE dungeon registry.
// A Dungeon generalizes what used to be global to "The Depths": its monster
// tier table(s), boss cadence, stat-scaling curve, wave budget, backdrop theme,
// floor count, and (optionally) its one rare-spawn "fusion" quest. The Depths
// is now simply DUNGEONS.depths; the themed legendary dungeons are its siblings
// (each unlocks a legendary via its quest — see RareSpawnQuest in depths.ts).
//
// Pure data + pure helpers (no engine / React / DOM). The WaveController, the
// reward fold, the floor picker, and the dungeon-select map all read from here.
// ============================================================================

import type { ArenaThemeId } from "@/assets/arenaThemes";
import type { ChestTier } from "@/meta/economy"; // leaf constants module — no cycle
import { TIER_BANDS, tierMonsterLevel, type TierId } from "./tiers";
import {
  BOSS_FLOOR_FODDER_SHARE,
  BOSS_FLOOR_INTERVAL,
  DEPTHS_DMG_PER_FLOOR,
  DEPTHS_HP_PER_FLOOR,
  DEPTHS_TIERS,
  RARE_SPAWN_QUESTS,
  questUnlockIds,
  type DepthsTier,
  type RareSpawnQuest,
} from "./depths";

export interface Dungeon {
  id: string;
  name: string;
  /** Backdrop theme (assets/arenaThemes). */
  theme: ArenaThemeId;
  /** Deepest selectable floor (the floor picker caps here). */
  floors: number;
  /** Monster tables, in floor-range bands (same shape as DEPTHS_TIERS). */
  tiers: DepthsTier[];
  /** A boss is appended on every Nth floor. Short dungeons set this equal to
   *  `floors` so the boss appears only on the last floor. */
  bossFloorInterval: number;
  /** Fraction of a boss floor's budget spent on fodder (rest is the boss). */
  bossFloorFodderShare: number;
  /** Wave budget = base + perFloor × floor (the length dial). */
  budgetBase: number;
  budgetPerFloor: number;
  /** Linear per-floor stat scaling past floor 1 (the difficulty dial). */
  hpPerFloor: number;
  dmgPerFloor: number;
  /** NORMAL-tier fodder level (the same +5% HP / +3% dmg per-level curve
   *  players get — see meta/leveling), spanning 1..NORMAL_BAND_TOP across the
   *  gate chain. Hard/Elite map this chain position into their own bands
   *  (tierMonsterLevel, data/tiers.ts). Bosses and rare quest spawns come in
   *  at +ELITE_LEVEL_BONUS. */
  monsterLevel: number;
  /** The rare-spawn fusion quest hosted here (its `floor` = this dungeon's boss
   *  floor). Absent = no quest. */
  quest?: RareSpawnQuest;
  /** RNG boss-depth tuning (all optional — dungeonRun.ts supplies the defaults).
   *  In the "hunt for the boss" descent the boss lair sits at a run-seeded random
   *  floor: always safe below `bossMinFloor`, then a chance that ramps each floor
   *  deeper, GUARANTEED by `bossMaxFloor`. Leave unset for the standard curve. */
  bossMinFloor?: number;
  bossMaxFloor?: number;
  bossBaseChance?: number;
  bossChanceStep?: number;
  /** Availability gate: locked until `floor` of dungeon `dungeonId` is cleared.
   *  Absent = always available (The Depths itself). The gates form a chain
   *  through the Eclipse Spire, then FORK: the Fallen Cathedral and the
   *  Rogue's Den both open off the Spire's last floor. A dungeon with any
   *  cleared progress of its own never re-locks — see isDungeonUnlocked. */
  gate?: { dungeonId: string; floor: number };
  /** Lore blurb shown on the dungeon-select card. */
  entryHint: string;
  /** Chest tier this dungeon's boss pays on its first kill. Absent = "gold"
   *  (an ordinary deep boss); the chain's capstones pay the top tiers, the only
   *  place arcane/dragon chests drop. Read via bossChestTierFor. */
  bossChestTier?: ChestTier;
  /** A chain capstone: its boss first-kill pays the top shard grant. */
  capstone?: boolean;
  /** Units gifted on clearing this dungeon, keyed by the floor they're themed
   *  around (the grant hands over ALL of them at once — see meta/battleGrant).
   *  Read via milestoneUnlocksFor. */
  milestoneUnlocks?: Record<number, string>;
}

// ---------------------------------------------------------------------------
// The registry, in gate-chain order (each dungeon requires the previous one's
// floor 5): Depths → Bonefields → Wilds → Overgrowth → Sealed Vault →
// Deep Forge → Eclipse Spire, where the chain FORKS: the Fallen Cathedral and
// the Rogue's Den both open off Eclipse Spire floor 5 (both Lv 20 — the
// player picks their path). The Depths wraps the legacy tuning from depths.ts
// unchanged. The themed dungeons are shorter self-contained trials whose boss
// floor hosts the legendary rare-spawn quest; their monsterLevel ladder
// (1/4/7/9/11/14/17, then 20/20 past the fork) IS the Normal band — it tracks
// the player's expected warband level walking the chain toward the Lv-30 cap.
// Hard/Elite re-band the same chain to 25–30 / 30–40 (data/tiers.ts).
// ---------------------------------------------------------------------------

/** Fire Mage + Lich = Necromancer: end the rare Lich in The Bonefields with a
 *  Fire Mage fielded to unlock buying the Necromancer at a discount. */
const BONEFIELDS_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "lich",
  chance: 0.15,
  requires: "fire_mage",
  unlocks: "necromancer",
  price: 2500,
  hint: "In the bonefields, they whisper that a mage who ends a deathless lord may inherit its dominion over the dead.",
};

/** Archer + Apex Beast = Hunter: bring down the rare apex predator in The Wilds
 *  with an Archer fielded to unlock buying the Hunter at a discount. */
const WILDS_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "apex_beast",
  chance: 0.15,
  requires: "archer",
  unlocks: "hunter",
  price: 2500,
  hint: "The wilds test the bow; whoever brings down the pack's apex is said to earn the beasts' loyalty.",
};

/** Knight + Archmage = Aegis Knight AND the Archmage himself: fell the rare
 *  Archmage in The Sealed Vault with a Knight fielded and BOTH become buyable —
 *  the knight learns to turn magic aside, and the humbled Archmage offers his
 *  grimoire to the victor. (Each is bought separately at the quest price.) */
const SEALED_VAULT_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "archmage",
  chance: 0.15,
  requires: "knight",
  unlocks: ["aegis_knight", "archmage"],
  price: 2500,
  hint: "A knight who shatters a rogue archmage in the sealed vault may learn to turn magic aside — and a defeated master owes his victor a debt.",
};

/** Cleric + Wildheart = Druid: tend the wounded and fell the grove's ancient
 *  heart in The Overgrowth with a Cleric fielded to unlock buying the Druid. */
const OVERGROWTH_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "wildheart",
  chance: 0.15,
  requires: "healer", // the Cleric
  unlocks: "summoner", // the Druid
  price: 2500,
  hint: "Among the overgrowth, one who tends the wounded and fells the wild's ancient heart might be reborn as its keeper.",
};

/** Mage + Eclipse Herald = Mystic Archer: down the rare Herald of twin light in
 *  The Eclipse Spire with a Mage fielded to unlock buying the Mystic Archer. */
const ECLIPSE_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "eclipse_herald",
  chance: 0.15,
  requires: "mage",
  unlocks: "mystic_archer",
  price: 2500,
  hint: "High in the eclipse spire, a mage who downs a herald of twin light could take up light and dark alike.",
};

/** Ogre + Ancient Automaton = Engineer: wreck the rare Ancient Automaton in The
 *  Deep Forge with an Ogre fielded to unlock buying the Engineer at a discount. */
const DEEP_FORGE_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "ancient_automaton",
  chance: 0.15,
  requires: "ogre",
  unlocks: "engineer",
  price: 2500,
  hint: "Deep in the forge, a giant who wrecks an ancient automaton may salvage the secrets of its making.",
};

/** Priest + Penitent = Seraph: grant the rare fallen angel its final rest in
 *  The Fallen Cathedral with a Priest fielded to unlock buying the Seraph. */
const FALLEN_CATHEDRAL_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "penitent",
  chance: 0.15,
  requires: "priest",
  unlocks: "seraph",
  price: 2500,
  hint: "Within the fallen cathedral, a priest who grants a penitent angel its final rest may rise on burned wings.",
};

/** Any stealth unit + The Silencer = Outlaw: cut down the guild's masked
 *  executioner in The Rogue's Den with an Assassin, Rogue, or Trickster
 *  fielded to unlock buying the Outlaw. */
const ROGUES_DEN_QUEST: RareSpawnQuest = {
  floor: 5,
  spawnId: "silencer",
  chance: 0.15,
  requires: ["assassin", "rogue", "trickster"],
  unlocks: "outlaw",
  price: 2500,
  hint: "Beneath the city they whisper that one who strikes from the shadows and silences the Silencer may claim the Outlaw's price.",
};

export const DUNGEONS: Record<string, Dungeon> = {
  depths: {
    id: "depths",
    name: "The Depths",
    theme: "dungeon",
    floors: DEPTHS_TIERS[DEPTHS_TIERS.length - 1].floors[1],
    tiers: DEPTHS_TIERS,
    bossFloorInterval: BOSS_FLOOR_INTERVAL,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 1,
    quest: RARE_SPAWN_QUESTS[0], // Slime Knight
    entryHint:
      "The endless descent beneath the arena — a rising horde, floor after floor.",
    bossChestTier: "silver", // the starter dungeon: a rung below the themed bosses
    milestoneUnlocks: {
      2: "healer", // Cleric — sustain; the Overgrowth quest needs it
      3: "fire_mage", // burn — the Bonefields quest needs it
      5: "berserker", // epic capstone for downing the Bloater
    },
  },
  bonefields: {
    id: "bonefields",
    name: "The Bonefields",
    theme: "bonefields",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        // skeleton_archer + bonecaller thinned (2→3, 4→5) in the retune: their
        // cheap ranged + raise-dead density made Bonefields a self-replenishing
        // kiting swarm — a huge difficulty spike vs the all-melee Wilds after it.
        monsters: { skeleton: 1, skeleton_archer: 3, ghoul: 2, bonecaller: 5 },
        boss: "abomination",
      },
    ],
    bossFloorInterval: 5, // boss on the last floor
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 4,
    quest: BONEFIELDS_QUEST,
    gate: { dungeonId: "depths", floor: 5 },
    entryHint:
      "A haunted barrow of the restless dead — and something older still commanding them.",
    milestoneUnlocks: { 5: "holy_knight" }, // light vs undead
  },
  wilds: {
    id: "wilds",
    name: "The Wilds",
    theme: "huntingGrounds",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { dire_wolf: 1, grizzly: 2, razorback: 3 },
        boss: "dire_alpha",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 7,
    quest: WILDS_QUEST,
    gate: { dungeonId: "bonefields", floor: 5 },
    entryHint:
      "Untamed hunting grounds where the whole pack answers to one apex beast.",
    // The Deep Forge quest needs the Ogre (arrives a few dungeons early).
    milestoneUnlocks: { 5: "ogre" },
  },
  overgrowth: {
    id: "overgrowth",
    name: "The Overgrowth",
    theme: "overgrowth",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { thornbeast: 1, spore_pod: 2, dryad: 3 },
        boss: "elder_treant",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 9,
    quest: OVERGROWTH_QUEST,
    gate: { dungeonId: "wilds", floor: 5 },
    entryHint:
      "A blighted grove run wild — brambles, spores, and an ancient heart beating at its center.",
    milestoneUnlocks: { 5: "ranger" }, // woodland archer
  },
  sealed_vault: {
    id: "sealed_vault",
    name: "The Sealed Vault",
    theme: "sealedVault",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { arcane_wisp: 1, imp: 2, cultist: 3 },
        boss: "rune_golem",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 11,
    quest: SEALED_VAULT_QUEST,
    gate: { dungeonId: "overgrowth", floor: 5 },
    entryHint:
      "A quarantined hall of loosed magic — its wards strain against the arcana within.",
    milestoneUnlocks: { 5: "arcane_mage" }, // the vault of arcana
  },
  deep_forge: {
    id: "deep_forge",
    name: "The Deep Forge",
    theme: "deepForge",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { clockwork_spider: 1, sentry: 2, animated_armor: 3 },
        boss: "forge_golem",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 14,
    quest: DEEP_FORGE_QUEST,
    gate: { dungeonId: "sealed_vault", floor: 5 },
    entryHint:
      "A dwarven foundry gone silent — its constructs still clank the halls, tended by one great engine.",
    bossChestTier: "arcane",
    capstone: true,
    milestoneUnlocks: { 5: "electric_mage" }, // lightning + machinery
  },
  eclipse_spire: {
    id: "eclipse_spire",
    name: "The Eclipse Spire",
    theme: "eclipseSpire",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { light_wisp: 1, shadow_wraith: 2, eclipse_acolyte: 3 },
        boss: "eclipse_warden",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 17,
    quest: ECLIPSE_QUEST,
    gate: { dungeonId: "deep_forge", floor: 5 },
    entryHint:
      "A tower where light and dark war without end — motes, shades, and the Warden between them.",
    bossChestTier: "dragon",
    capstone: true,
    milestoneUnlocks: { 5: "trickster" }, // satisfies the Den's any-of quest
  },
  fallen_cathedral: {
    id: "fallen_cathedral",
    name: "The Fallen Cathedral",
    theme: "fallenCathedral",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { heretic_zealot: 1, grave_chorister: 2, gargoyle: 3 },
        boss: "fallen_seraph",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    // Endgame fork — a true long-term project that expects a leveled,
    // legendary-geared warband. monsterLevel 20 caps the Normal band; at every
    // tier its bosses/rares ride the +1 elite bump one notch over the band top
    // (Normal 21, Hard 31, Elite 41 — past the Lv-30 player cap on purpose).
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 20,
    quest: FALLEN_CATHEDRAL_QUEST,
    gate: { dungeonId: "eclipse_spire", floor: 5 },
    entryHint:
      "A desecrated sanctum where hymns curdled into heresy — something holy fell here.",
    // A fork boss pays an arcane first-clear, so its replay chest (one tier
    // below) is gold — a worthwhile late-game farm. Not a chain capstone.
    bossChestTier: "arcane",
    milestoneUnlocks: { 2: "priest" }, // the Cathedral's own F5 quest needs it
  },
  rogues_den: {
    id: "rogues_den",
    name: "The Rogue's Den",
    theme: "shadowPit",
    floors: 5,
    tiers: [
      {
        floors: [1, 5],
        monsters: { cutpurse: 1, knife_thrower: 2, den_bruiser: 3 },
        boss: "bandit_king",
      },
    ],
    bossFloorInterval: 5,
    bossFloorFodderShare: BOSS_FLOOR_FODDER_SHARE,
    // Endgame fork (twin of the Cathedral). monsterLevel 20 caps the Normal
    // band; bosses/rares ride the +1 elite bump one notch over each band's top.
    budgetBase: 20,
    budgetPerFloor: 2,
    hpPerFloor: DEPTHS_HP_PER_FLOOR,
    dmgPerFloor: DEPTHS_DMG_PER_FLOOR,
    monsterLevel: 20,
    quest: ROGUES_DEN_QUEST,
    gate: { dungeonId: "eclipse_spire", floor: 5 },
    entryHint:
      "A lantern-lit warren of cutthroats and coin — the guild does not welcome guests.",
    bossChestTier: "arcane", // fork boss, like the Cathedral
    milestoneUnlocks: { 2: "rogue" }, // the Den's own F5 quest needs it
  },
};

export function getDungeon(id: string): Dungeon {
  const d = DUNGEONS[id];
  if (!d) throw new Error(`Unknown dungeon: ${id}`);
  return d;
}

/** Ordered dungeon ids for the select map (gate-chain order, Depths first). */
export const DUNGEON_IDS: string[] = Object.keys(DUNGEONS);

/** Chest tier a dungeon's boss pays on its first kill. Unlisted dungeons are
 *  "gold" deep bosses; the chain's capstones pay the top tiers (the only place
 *  arcane/dragon chests drop). The reward fold and the atlas preview read this
 *  one source, so a preview can't drift from what actually drops. */
export function bossChestTierFor(dungeonId: string): ChestTier {
  return DUNGEONS[dungeonId]?.bossChestTier ?? "gold";
}

/** Whether a dungeon's boss first-kill pays the capstone shard grant. */
export function isCapstoneDungeon(dungeonId: string): boolean {
  return DUNGEONS[dungeonId]?.capstone === true;
}

/** Units gifted on clearing a dungeon, keyed by the floor they're themed
 *  around. Gifted units pace acquisition across the whole chain.
 *  INVARIANT (spec-enforced in dungeons.test): a unit that a dungeon's fusion
 *  quest REQUIRES is a starter or gifted at/before that dungeon's quest floor —
 *  so you always own the key before the lock. Ids, not display names ("healer"
 *  shows as Cleric); every value stays deckable and outside STARTER_UNIT_IDS +
 *  QUEST_LOCKED_UNITS. */
export function milestoneUnlocksFor(dungeonId: string): Record<number, string> {
  return DUNGEONS[dungeonId]?.milestoneUnlocks ?? {};
}

/** Bosses and telegraphed rare quest catalysts spawn this many levels above the
 *  tier's fodder (uniform rule: the Depths Bloater is Lv 2 on Normal, the
 *  Eclipse Warden Lv 18). At every tier the fork bosses land one notch over
 *  the band's top — Normal 21, Hard 31, Elite 41, that last one 11 levels past
 *  a maxed Lv-30 warband, which is the point of Elite. */
export const ELITE_LEVEL_BONUS = 1;

/** Ceiling on a spawned monster's level = the Elite band's top plus the elite
 *  bonus (the fork Elite bosses at Lv 41). NO LONGER derived from the player's
 *  LEVEL_CAP — monsters run far past it on purpose (Elite is the over-cap
 *  challenge band), so a future player-cap change must retune TIER_BANDS, not
 *  this. levelStatMultipliers is pure math with no clamp: Lv 31–41 spawns
 *  scale linearly like everything else. */
export const MONSTER_LEVEL_CAP = TIER_BANDS.elite[1] + ELITE_LEVEL_BONUS;

export type MonsterSpawnKind = "fodder" | "rare" | "boss";

/** The unit level a monster of `kind` spawns at in this dungeon at `tier`
 *  (the dungeon's chain position mapped into the tier's band — data/tiers.ts).
 *  Defaults to Normal so tier-unaware callers keep their exact old levels. */
export function monsterLevelFor(
  dungeon: Dungeon,
  kind: MonsterSpawnKind,
  tier: TierId = "normal"
): number {
  return Math.min(
    MONSTER_LEVEL_CAP,
    tierMonsterLevel(dungeon.monsterLevel, tier) +
      (kind === "fodder" ? 0 : ELITE_LEVEL_BONUS)
  );
}

/** Gate check for the dungeon-select map. `clearedFloorOf` abstracts the save
 *  (this module stays persistence-free). A dungeon with any cleared progress of
 *  its own is always unlocked — saves from before the gate chain may hold
 *  out-of-order clears, and those must never re-lock. */
export function isDungeonUnlocked(
  dungeon: Dungeon,
  clearedFloorOf: (dungeonId: string) => number
): boolean {
  if (!dungeon.gate) return true;
  if (clearedFloorOf(dungeon.id) > 0) return true;
  return clearedFloorOf(dungeon.gate.dungeonId) >= dungeon.gate.floor;
}

// ---------------------------------------------------------------------------
// Per-dungeon wave helpers — the dungeon-scoped twins of the Depths globals in
// depths.ts. They read the dungeon's own dials so every dungeon scales
// independently (the WaveController calls these; the Depths dungeon reproduces
// its legacy numbers exactly).
// ---------------------------------------------------------------------------

/** The tier covering `floor` in this dungeon (last tier for out-of-range). */
export function tierForFloorIn(dungeon: Dungeon, floor: number): DepthsTier {
  for (const tier of dungeon.tiers) {
    if (floor >= tier.floors[0] && floor <= tier.floors[1]) return tier;
  }
  return dungeon.tiers[dungeon.tiers.length - 1];
}

export function isBossFloorIn(dungeon: Dungeon, floor: number): boolean {
  return floor % dungeon.bossFloorInterval === 0;
}

export function waveBudgetIn(dungeon: Dungeon, floor: number): number {
  return dungeon.budgetBase + floor * dungeon.budgetPerFloor;
}

export function floorStatMultipliersIn(
  dungeon: Dungeon,
  floor: number
): { hp: number; dmg: number } {
  const depth = Math.max(0, floor - 1);
  return {
    hp: 1 + dungeon.hpPerFloor * depth,
    dmg: 1 + dungeon.dmgPerFloor * depth,
  };
}

/** The rare-spawn quest that appears on `floor` of this dungeon, if any. */
export function questForFloorIn(
  dungeon: Dungeon,
  floor: number
): RareSpawnQuest | undefined {
  return dungeon.quest && dungeon.quest.floor === floor
    ? dungeon.quest
    : undefined;
}

// ---------------------------------------------------------------------------
// Cross-dungeon quest derivations (single source of truth for the whole app).
// ---------------------------------------------------------------------------

/** Every rare-spawn quest across all dungeons. */
export const ALL_QUESTS: RareSpawnQuest[] = Object.values(DUNGEONS)
  .map((d) => d.quest)
  .filter((q): q is RareSpawnQuest => q != null);

/** Every dungeon-boss defId across all dungeons — the tier bosses (not the rare
 *  quest catalysts). Bestiary rewards read this to pay a boss's first defeat
 *  its fatter gold + shard grant and to award its slayer title. Derived from
 *  the same tier `boss` field the WaveController spawns, so it can't drift. */
export const BOSS_IDS = new Set<string>(
  Object.values(DUNGEONS).flatMap((d) => d.tiers.map((t) => t.boss))
);

/** Every monster/catalyst id whose Compendium page lives in this dungeon's book
 *  — its fodder, tier bosses, and rare-spawn catalyst, in that walk order. The
 *  bestiary progress plaque (components/compendium/books) and the book-completion
 *  reward (meta/bestiaryRewards) share this ONE set so "complete" means the same
 *  thing in both places. */
export function dungeonBestiaryIds(dungeon: Dungeon): string[] {
  const ids: string[] = [];
  for (const tier of dungeon.tiers) {
    for (const id of Object.keys(tier.monsters)) if (!ids.includes(id)) ids.push(id);
  }
  for (const tier of dungeon.tiers) if (!ids.includes(tier.boss)) ids.push(tier.boss);
  if (dungeon.quest && !ids.includes(dungeon.quest.spawnId)) {
    ids.push(dungeon.quest.spawnId);
  }
  return ids;
}

/** Units whose purchase is gated behind a rare-spawn quest (never chest-dropped,
 *  never granted by the grandfather clause, not buyable until the quest is
 *  done). Derived from every dungeon's quest. */
export const QUEST_LOCKED_UNITS = new Set<string>(
  ALL_QUESTS.flatMap(questUnlockIds)
);

/** The rare-spawn quest that unlocks `unitId`'s purchase, if any. */
export function questForUnlock(unitId: string): RareSpawnQuest | undefined {
  return ALL_QUESTS.find((q) => questUnlockIds(q).includes(unitId));
}
