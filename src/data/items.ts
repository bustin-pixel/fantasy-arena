// ============================================================================
// Items — every equippable item line and all of its POWER numbers.
// Pure data + pure resolution (no engine / React / DOM imports), mirroring
// units.ts: the engine bakes/reads resolved ItemMods, the meta layer rolls
// drops (acquisition numbers live in meta/economy.ts — power lives HERE).
//
// Model: an item is a (line, quality, star) triple packed into an ItemKey
// string "lineId:quality:star". A LINE keeps its name/icon across all three
// qualities (rare → epic → legendary, palette-swapped); stars run 1–3 within
// a quality. Two identical items merge into +1 star; two 3★ merge into the
// next quality at 1★; legendary 3★ is the cap (see meta/inventory.ts).
// Each line's SIGNATURE effect switches on only at legendary quality.
// ============================================================================

import type {
  ItemEffect,
  ItemLoadout,
  ItemLoadouts,
  ItemMods,
  ItemSlot,
  Rarity,
  ShotRider,
} from "@/types";

export type ItemQuality = Rarity;
export const ITEM_QUALITIES: readonly ItemQuality[] = [
  "rare",
  "epic",
  "legendary",
];
export const MAX_STARS = 3;
export const ITEM_SLOTS: readonly ItemSlot[] = ["weapon", "armor", "trinket"];

/** Procedural icon shapes drawn by components/ItemIcon. */
export type ItemIconKind =
  | "sword"
  | "axe"
  | "spear"
  | "jagged"
  | "daggers"
  | "saber"
  | "scythe"
  | "hammer"
  | "plate"
  | "shield"
  | "cloak"
  | "core"
  | "shroud"
  | "pelt"
  | "bark"
  | "flame"
  | "snowflake"
  | "fang"
  | "ring"
  | "hourglass"
  | "idol"
  | "sigil"
  | "coin"
  | "rune"
  | "eclipse";

export interface ItemLineDef {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Set on the eight dungeon-signature lines: excluded from the base chest
   *  pool, dropped only by this dungeon's boss chest. */
  dungeonId?: string;
  /** One-line flavor for the Bag / detail panel. */
  desc: string;
  icon: ItemIconKind;
  /** Accent color for the icon's identifying detail (quality drives the rest
   *  of the palette). */
  color: string;
  /** This line's modifiers at (qualityIndex 0–2, starIndex 0–2). Partial —
   *  resolveItemMods merges it onto identityItemMods(). */
  mods: (q: number, s: number) => Partial<ItemMods>;
}

// ---------------------------------------------------------------------------
// Power ladders — ALL tunable numbers, indexed [qualityIndex][starIndex].
// Budget: a full legendary 3★ loadout ≈ doubles a unit (weapon +40% dmg,
// armor +40% HP, plus the trinket's effect).
// ---------------------------------------------------------------------------

/** Weapon +damage% / armor +health% (the slot-standard primaries). */
const PRIMARY_PCT = [
  [6, 8, 10],
  [14, 17, 20],
  [28, 34, 40],
];
/** Twinfang runs a slightly lower damage ladder (its legendary hits twice). */
const TWINFANG_PCT = [
  [5, 6, 8],
  [11, 14, 16],
  [22, 27, 32],
];
/** Windlash Saber: +attack speed% instead of damage (the flat AS weapon). */
const WINDLASH_AS_PCT = [
  [5, 6, 7],
  [10, 12, 14],
  [18, 21, 24],
];
/** Quicksilver Band: trinket attack speed, a notch under the Windlash. */
const QUICKSILVER_AS_PCT = [
  [4, 5, 6],
  [8, 10, 12],
  [14, 17, 20],
];
/** Chrono Amulet cooldown reduction %. */
const CHRONO_CDR_PCT = [
  [8, 10, 12],
  [12, 14, 16],
  [20, 22, 24],
];
/** Giant Slayer / Summoner's Sigil bonus fractions. */
const SLAYER_FRAC = [
  [0.1, 0.12, 0.15],
  [0.15, 0.18, 0.2],
  [0.25, 0.3, 0.35],
];
/** Runeward magic-damage reduction %. */
const RUNEWARD_PCT = [
  [6, 8, 10],
  [12, 15, 18],
  [20, 22, 25],
];
/** Elemental trinket rider magnitudes. */
const EMBER_DPT = [
  [3, 4, 5],
  [6, 7, 8],
  [8, 9, 10],
];
const FROST_SLOW = [
  [0.2, 0.22, 0.25],
  [0.28, 0.3, 0.32],
  [0.35, 0.38, 0.4],
];
const VENOM_DPT = [
  [2, 3, 3],
  [4, 5, 5],
  [6, 7, 8],
];
/** Heartwood regen (% max HP per second). */
const HEARTWOOD_REGEN = [
  [0.4, 0.5, 0.6],
  [0.7, 0.8, 0.9],
  [1.2, 1.4, 1.6],
];
/** Eclipse Pendant every-4th-hit bonus shadow damage. */
const ECLIPSE_BONUS = [
  [8, 10, 12],
  [16, 20, 24],
  [30, 36, 42],
];
/** Lucky Coin battle-gold bonus % (meta-layer only). */
const LUCKY_GOLD_PCT = [
  [5, 6, 7],
  [8, 10, 12],
  [15, 18, 21],
];
/** Lucky Coin legendary: chance the reward chest upgrades one tier. */
const LUCKY_UPGRADE_CHANCE = [0.1, 0.15, 0.2];
/** Arena-mirror allowance for an equipped trinket (% on both hp and dmg) —
 *  trinket effects don't reduce to a stat, so the enemy bump approximates. */
const TRINKET_MIRROR_PCT = [
  [2, 3, 4],
  [5, 6, 7],
  [9, 11, 13],
];

/** Fallen Halo absorb-bubble size, % of max HP (legendary re-forms it). */
const HALO_SHIELD_PCT = [
  [6, 8, 10],
  [12, 15, 18],
  [22, 26, 30],
];

const LEG = 2; // legendary quality index

const pct = (table: number[][], q: number, s: number) => table[q][s] / 100;
const dmgOf = (table: number[][]) => (q: number, s: number) => ({
  dmgMult: 1 + pct(table, q, s),
});
const hpOf = (table: number[][]) => (q: number, s: number) => ({
  hpMult: 1 + pct(table, q, s),
});
/** +X% attack rate → seconds-between-attacks multiplier. */
const asDelay = (table: number[][], q: number, s: number) =>
  100 / (100 + table[q][s]);

const burnRider = (q: number, s: number): ShotRider => ({
  effectType: "burn",
  durationSec: 3,
  damagePerTick: EMBER_DPT[q][s],
  tickIntervalSec: 1,
  vfxKind: "burn_burst",
  color: "#fb923c",
});
const slowRider = (q: number, s: number): ShotRider => ({
  effectType: "slow",
  durationSec: 2,
  magnitude: FROST_SLOW[q][s],
  vfxKind: "frost",
  color: "#7dd3fc",
});
const poisonRider = (q: number, s: number): ShotRider => ({
  effectType: "poison",
  durationSec: 4,
  damagePerTick: VENOM_DPT[q][s],
  tickIntervalSec: 1,
  vfxKind: "burn_burst",
  color: "#4ade80",
});
const silenceRider = (s: number): ShotRider => ({
  effectType: "silence",
  durationSec: [1.2, 1.5, 1.8][s],
  vfxKind: "shield_pop",
  color: "#c084fc",
});

// ---------------------------------------------------------------------------
// The 27 lines. Base pool: 6 weapons / 5 armors / 8 trinkets. Eight more carry
// a `dungeonId` — each themed dungeon's boss-chest signature drop.
// ---------------------------------------------------------------------------

export const ITEM_LINES: Record<string, ItemLineDef> = {
  // ---- weapons (base) -----------------------------------------------------
  soldiers_blade: {
    id: "soldiers_blade",
    name: "Soldier's Blade",
    slot: "weapon",
    desc: "A dependable arena standard — it ends fights that are already ending.",
    icon: "sword",
    color: "#cbd5e1",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { executeBonus: [0.25, 0.3, 0.35][s] } : {}),
    }),
  },
  bloodletter_axe: {
    id: "bloodletter_axe",
    name: "Bloodletter Axe",
    slot: "weapon",
    desc: "Its edge drinks — a wound for the foe is a meal for the wielder.",
    icon: "axe",
    color: "#ef4444",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { lifesteal: [0.1, 0.15, 0.2][s] } : {}),
    }),
  },
  stormpiercer: {
    id: "stormpiercer",
    name: "Stormpiercer",
    slot: "weapon",
    desc: "A spear that remembers the lightning it was quenched in.",
    icon: "spear",
    color: "#38bdf8",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG
        ? {
            effects: [
              { kind: "chainNth", everyNth: 4, frac: [0.5, 0.6, 0.7][s] },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  hexblade: {
    id: "hexblade",
    name: "Hexblade",
    slot: "weapon",
    desc: "Forged to cut the word out of a caster's mouth.",
    icon: "jagged",
    color: "#a855f7",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG
        ? {
            effects: [
              { kind: "onHitRider", everyNth: 4, rider: silenceRider(s) },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  twinfang_daggers: {
    id: "twinfang_daggers",
    name: "Twinfang Daggers",
    slot: "weapon",
    desc: "Two blades, one intent — the second bite lands before the first is felt.",
    icon: "daggers",
    color: "#f97316",
    mods: (q, s) => ({
      ...dmgOf(TWINFANG_PCT)(q, s),
      ...(q === LEG
        ? { effects: [{ kind: "doubleStrikeNth", everyNth: 3 }] as ItemEffect[] }
        : {}),
    }),
  },
  windlash_saber: {
    id: "windlash_saber",
    name: "Windlash Saber",
    slot: "weapon",
    desc: "It weighs nothing and arrives early.",
    icon: "saber",
    color: "#5eead4",
    mods: (q, s) => ({
      atkDelayMult: asDelay(WINDLASH_AS_PCT, q, s),
      ...(q === LEG
        ? {
            effects: [
              {
                kind: "tempo",
                perStack: [0.04, 0.05, 0.06][s],
                maxStacks: 5,
              },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  // ---- weapons (dungeon signatures) ---------------------------------------
  gravewhisper_blade: {
    id: "gravewhisper_blade",
    name: "Gravewhisper Blade",
    slot: "weapon",
    dungeonId: "bonefields",
    desc: "It murmurs the names of the fallen — and grows kinder to its bearer with each.",
    icon: "scythe",
    color: "#86efac",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { killHeal: [15, 25, 35][s] } : {}),
    }),
  },
  forgemasters_hammer: {
    id: "forgemasters_hammer",
    name: "Forgemaster's Hammer",
    slot: "weapon",
    dungeonId: "deep_forge",
    desc: "Every fifth blow lands like the anvil strike that made it.",
    icon: "hammer",
    color: "#fbbf24",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { critEveryNth: 5 } : {}),
    }),
  },
  guildmasters_dirk: {
    id: "guildmasters_dirk",
    name: "Guildmaster's Dirk",
    slot: "weapon",
    dungeonId: "rogues_den",
    desc: "Guild arithmetic: every kill pays the next one forward.",
    icon: "daggers",
    color: "#e8b04b",
    mods: (q, s) => ({
      ...dmgOf(PRIMARY_PCT)(q, s),
      ...(q === LEG
        ? {
            effects: [
              {
                kind: "hasteOnKill",
                durationSec: [2, 2.5, 3][s],
                magnitude: 0.3,
              },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  // ---- armors (base) --------------------------------------------------------
  squires_plate: {
    id: "squires_plate",
    name: "Squire's Plate",
    slot: "armor",
    desc: "Honest steel. Strike it and learn why.",
    icon: "plate",
    color: "#cbd5e1",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { thornsFrac: [0.1, 0.13, 0.16][s] } : {}),
    }),
  },
  bulwark_shield: {
    id: "bulwark_shield",
    name: "Bulwark Shield",
    slot: "armor",
    desc: "A wall that walks.",
    icon: "shield",
    color: "#94a3b8",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { damageTakenMult: [0.95, 0.93, 0.9][s] } : {}),
    }),
  },
  wanderers_cloak: {
    id: "wanderers_cloak",
    name: "Wanderer's Cloak",
    slot: "armor",
    desc: "Roads shorten under it.",
    icon: "cloak",
    color: "#34d399",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      ...(q === LEG ? { moveSpeedMult: [1.08, 1.11, 1.15][s] } : {}),
    }),
  },
  golem_core: {
    id: "golem_core",
    name: "Golem Core",
    slot: "armor",
    desc: "A heart of stone lends you its first heartbeat.",
    icon: "core",
    color: "#f59e0b",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      ...(q === LEG
        ? {
            effects: [
              { kind: "startShield", frac: [0.15, 0.2, 0.25][s] },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  phasecloak: {
    id: "phasecloak",
    name: "Phasecloak",
    slot: "armor",
    desc: "When the blow that should end you falls, you are briefly somewhere else.",
    icon: "shroud",
    color: "#818cf8",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      ...(q === LEG
        ? {
            effects: [
              { kind: "stealthBelowHalf", durationSec: [1.5, 2, 2.5][s] },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  // ---- armors (dungeon signatures) ----------------------------------------
  alphas_pelt: {
    id: "alphas_pelt",
    name: "Alpha's Pelt",
    slot: "armor",
    dungeonId: "wilds",
    desc: "The pack fights harder around whoever wears the alpha's mantle.",
    icon: "pelt",
    color: "#d6a75c",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      moveSpeedMult: [1.04, 1.05, 1.06][q],
      ...(q === LEG
        ? {
            effects: [
              { kind: "packTactics", perAlly: [0.03, 0.04, 0.05][s] },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  heartwood_bark: {
    id: "heartwood_bark",
    name: "Heartwood Bark",
    slot: "armor",
    dungeonId: "overgrowth",
    desc: "Living wood — cut it and it simply grows back.",
    icon: "bark",
    color: "#4ade80",
    mods: (q, s) => ({
      ...hpOf(PRIMARY_PCT)(q, s),
      effects: [
        {
          kind: "regen",
          pctPerSec: HEARTWOOD_REGEN[q][s],
          ...(q === LEG ? { doubledBelowHalf: true } : {}),
        },
      ] as ItemEffect[],
    }),
  },
  // ---- trinkets (base) ------------------------------------------------------
  ember_charm: {
    id: "ember_charm",
    name: "Ember Charm",
    slot: "trinket",
    desc: "A coal that never went out. It wants everything else to burn too.",
    icon: "flame",
    color: "#fb923c",
    mods: (q, s) => ({
      effects: [
        {
          kind: "onHitRider",
          everyNth: q === LEG ? 3 : 4,
          rider: burnRider(q, s),
        },
        ...(q === LEG
          ? [
              {
                kind: "detonateOnDeath",
                element: "burn",
                damage: [20, 26, 32][s],
                // Units are 32px-radius bodies parked ~64px apart — nova radii
                // must clear two touching bodies or they can never connect.
                radius: 100,
                rider: burnRider(q, s),
                vfxColor: "#fb923c",
              } as ItemEffect,
            ]
          : []),
      ] as ItemEffect[],
    }),
  },
  frostbite_locket: {
    id: "frostbite_locket",
    name: "Frostbite Locket",
    slot: "trinket",
    desc: "Winter, kept small and furious.",
    icon: "snowflake",
    color: "#7dd3fc",
    mods: (q, s) => ({
      effects: [
        {
          kind: "onHitRider",
          everyNth: q === LEG ? 3 : 4,
          rider: slowRider(q, s),
        },
        ...(q === LEG
          ? [
              {
                kind: "detonateOnDeath",
                element: "slow",
                damage: 0,
                radius: 100,
                rider: slowRider(q, s),
                vfxColor: "#7dd3fc",
              } as ItemEffect,
            ]
          : []),
      ] as ItemEffect[],
    }),
  },
  venom_fang: {
    id: "venom_fang",
    name: "Venom Fang",
    slot: "trinket",
    desc: "One bite is never one bite.",
    icon: "fang",
    color: "#4ade80",
    mods: (q, s) => ({
      effects: [
        {
          kind: "onHitRider",
          everyNth: q === LEG ? 3 : 4,
          rider: poisonRider(q, s),
        },
        ...(q === LEG
          ? [
              {
                kind: "spreadPoisonOnAttack",
                radius: 90,
                rider: poisonRider(q, s),
              } as ItemEffect,
              {
                kind: "detonateOnDeath",
                element: "poison",
                damage: [14, 18, 22][s],
                radius: 100,
                rider: poisonRider(q, s),
                vfxColor: "#4ade80",
              } as ItemEffect,
            ]
          : []),
      ] as ItemEffect[],
    }),
  },
  quicksilver_band: {
    id: "quicksilver_band",
    name: "Quicksilver Band",
    slot: "trinket",
    desc: "The hand wearing it finishes thoughts the mind hasn't had yet.",
    icon: "ring",
    color: "#e2e8f0",
    mods: (q, s) => ({
      atkDelayMult: asDelay(QUICKSILVER_AS_PCT, q, s),
      ...(q === LEG
        ? {
            effects: [
              {
                kind: "hasteOnKill",
                durationSec: [2, 2.5, 3][s],
                magnitude: 0.3,
              },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  chrono_amulet: {
    id: "chrono_amulet",
    name: "Chrono Amulet",
    slot: "trinket",
    desc: "It doesn't make you faster. It makes 'soon' arrive sooner.",
    icon: "hourglass",
    color: "#c084fc",
    mods: (q, s) => ({
      cooldownMult: 1 - CHRONO_CDR_PCT[q][s] / 100,
      ...(q === LEG
        ? { effects: [{ kind: "abilityStartsReady" }] as ItemEffect[] }
        : {}),
    }),
  },
  giant_slayer_idol: {
    id: "giant_slayer_idol",
    name: "Giant Slayer Idol",
    slot: "trinket",
    desc: "Carved by something small that won.",
    icon: "idol",
    color: "#f87171",
    mods: (q, s) => ({ giantSlayerPct: SLAYER_FRAC[q][s] }),
  },
  summoners_sigil: {
    id: "summoners_sigil",
    name: "Summoner's Sigil",
    slot: "trinket",
    desc: "Whatever you call forth arrives better fed.",
    icon: "sigil",
    color: "#a78bfa",
    mods: (q, s) => ({ summonStatPct: SLAYER_FRAC[q][s] }),
  },
  lucky_coin: {
    id: "lucky_coin",
    name: "Lucky Coin",
    slot: "trinket",
    desc: "It always lands edge-up, pointing at money.",
    icon: "coin",
    color: "#fde047",
    // Meta-only: read by meta/rewards via luckyCoinBonus, never enters combat.
    mods: () => ({}),
  },
  // ---- trinkets (dungeon signatures) ---------------------------------------
  runeward_talisman: {
    id: "runeward_talisman",
    name: "Runeward Talisman",
    slot: "trinket",
    dungeonId: "sealed_vault",
    desc: "Vault-script that argues with incoming spells — and wins.",
    icon: "rune",
    color: "#60a5fa",
    mods: (q, s) => ({
      magicTakenMult: 1 - RUNEWARD_PCT[q][s] / 100,
      ...(q === LEG
        ? {
            effects: [
              { kind: "spellFeedback", frac: [0.25, 0.3, 0.35][s] },
              {
                kind: "runicBarrier",
                frac: [0.12, 0.15, 0.18][s],
                intervalSec: 12,
              },
            ] as ItemEffect[],
          }
        : {}),
    }),
  },
  eclipse_pendant: {
    id: "eclipse_pendant",
    name: "Eclipse Pendant",
    slot: "trinket",
    dungeonId: "eclipse_spire",
    desc: "Every fourth strike falls under a black sun.",
    icon: "eclipse",
    color: "#facc15",
    mods: (q, s) => ({
      effects: [
        {
          kind: "nthBonusDamage",
          everyNth: 4,
          bonus: ECLIPSE_BONUS[q][s],
          ...(q === LEG ? { stunSec: 0.4 } : {}),
        },
      ] as ItemEffect[],
    }),
  },
  fallen_halo: {
    id: "fallen_halo",
    name: "Fallen Halo",
    slot: "trinket",
    dungeonId: "fallen_cathedral",
    desc: "Tarnished and tilted, it still keeps one last sanctuary lit.",
    icon: "ring",
    color: "#ffd76a",
    // A Sanctuary bubble of its own: an absorb shield at deploy; the legendary
    // halo relights it every 14s instead of granting it once.
    mods: (q, s) => ({
      effects: [
        q === LEG
          ? { kind: "runicBarrier", frac: HALO_SHIELD_PCT[q][s] / 100, intervalSec: 14 }
          : { kind: "startShield", frac: HALO_SHIELD_PCT[q][s] / 100 },
      ] as ItemEffect[],
    }),
  },
};

/** Base-pool line ids by slot (dungeon signatures excluded) — the chest roll
 *  picks a slot first, then a line, so 6 weapons aren't drowned by 8 trinkets. */
export const BASE_LINES_BY_SLOT: Record<ItemSlot, string[]> = {
  weapon: [],
  armor: [],
  trinket: [],
};
for (const line of Object.values(ITEM_LINES)) {
  if (!line.dungeonId) BASE_LINES_BY_SLOT[line.slot].push(line.id);
}

/** The dungeon-signature line for a dungeon, if it has one. */
export function signatureLineFor(dungeonId: string): ItemLineDef | undefined {
  return Object.values(ITEM_LINES).find((l) => l.dungeonId === dungeonId);
}

// ---------------------------------------------------------------------------
// Item keys — "lineId:quality:star" (star 1–3). The inventory stores COUNTS
// keyed by these; loadouts reference them.
// ---------------------------------------------------------------------------

export type ItemKey = string;

export function makeItemKey(
  lineId: string,
  quality: ItemQuality,
  star: number
): ItemKey {
  return `${lineId}:${quality}:${star}`;
}

export interface ParsedItemKey {
  lineId: string;
  quality: ItemQuality;
  star: number;
  line: ItemLineDef;
}

/** Parse + validate a key. Null for anything malformed or unknown (the save
 *  sanitizer drops those). */
export function parseItemKey(key: string): ParsedItemKey | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const [lineId, quality, starStr] = parts;
  const line = ITEM_LINES[lineId];
  if (!line) return null;
  if (!ITEM_QUALITIES.includes(quality as ItemQuality)) return null;
  const star = Number(starStr);
  if (!Number.isInteger(star) || star < 1 || star > MAX_STARS) return null;
  return { lineId, quality: quality as ItemQuality, star, line };
}

/** The merge result of two `key` items: +1 star, or next quality at 1★ past
 *  3★. Null at the legendary 3★ cap (and for invalid keys). */
export function nextItemKey(key: ItemKey): ItemKey | null {
  const p = parseItemKey(key);
  if (!p) return null;
  if (p.star < MAX_STARS) return makeItemKey(p.lineId, p.quality, p.star + 1);
  const qi = ITEM_QUALITIES.indexOf(p.quality);
  if (qi >= ITEM_QUALITIES.length - 1) return null;
  return makeItemKey(p.lineId, ITEM_QUALITIES[qi + 1], 1);
}

// ---------------------------------------------------------------------------
// Resolution — (line, quality, star) → ItemMods, and a unit's three slots
// merged into one. The engine only ever sees resolved ItemMods.
// ---------------------------------------------------------------------------

export function identityItemMods(): ItemMods {
  return {
    dmgMult: 1,
    hpMult: 1,
    atkDelayMult: 1,
    moveSpeedMult: 1,
    damageTakenMult: 1,
    magicTakenMult: 1,
    lifesteal: 0,
    thornsFrac: 0,
    executeBonus: 0,
    killHeal: 0,
    critEveryNth: 0,
    cooldownMult: 1,
    giantSlayerPct: 0,
    summonStatPct: 0,
    effects: [],
  };
}

const MULT_FIELDS = [
  "dmgMult",
  "hpMult",
  "atkDelayMult",
  "moveSpeedMult",
  "damageTakenMult",
  "magicTakenMult",
  "cooldownMult",
] as const;
const ADD_FIELDS = [
  "lifesteal",
  "thornsFrac",
  "executeBonus",
  "killHeal",
  "giantSlayerPct",
  "summonStatPct",
] as const;

function foldMods(into: ItemMods, patch: Partial<ItemMods>): void {
  for (const f of MULT_FIELDS) {
    if (patch[f] != null) into[f] *= patch[f]!;
  }
  for (const f of ADD_FIELDS) {
    if (patch[f] != null) into[f] += patch[f]!;
  }
  if (patch.critEveryNth) {
    // Two crit sources: the more frequent one wins (smaller N).
    into.critEveryNth =
      into.critEveryNth === 0
        ? patch.critEveryNth
        : Math.min(into.critEveryNth, patch.critEveryNth);
  }
  if (patch.effects) into.effects.push(...patch.effects);
}

/** Resolve one item to its full ItemMods. Invalid keys resolve to identity. */
export function resolveItemMods(key: ItemKey): ItemMods {
  const mods = identityItemMods();
  const p = parseItemKey(key);
  if (!p) return mods;
  const q = ITEM_QUALITIES.indexOf(p.quality);
  foldMods(mods, p.line.mods(q, p.star - 1));
  return mods;
}

/** Merge a unit's whole loadout (up to three slots). Returns undefined for an
 *  empty/absent loadout so unequipped units carry NO item state at all —
 *  keeping their sim byte-identical to pre-items builds. */
export function resolveLoadoutMods(
  loadout: ItemLoadout | undefined
): ItemMods | undefined {
  if (!loadout) return undefined;
  const keys = [loadout.weapon, loadout.armor, loadout.trinket].filter(
    (k): k is string => k != null && parseItemKey(k) != null
  );
  if (keys.length === 0) return undefined;
  const mods = identityItemMods();
  for (const key of keys) {
    const p = parseItemKey(key)!;
    const q = ITEM_QUALITIES.indexOf(p.quality);
    foldMods(mods, p.line.mods(q, p.star - 1));
  }
  return mods;
}

// ---------------------------------------------------------------------------
// Descriptions — one generic formatter for every item line, so panel text always
// matches the resolved numbers (no hand-written strings to drift).
// ---------------------------------------------------------------------------

const asPct = (m: number) => Math.round((1 / m - 1) * 100);
const p100 = (f: number) => Math.round(f * 100);
const nth = (n: number) =>
  `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function describeRider(r: ShotRider): string {
  switch (r.effectType) {
    case "burn":
      return `burn (${r.damagePerTick} dmg/s for ${r.durationSec}s)`;
    case "poison":
      return `poison (${r.damagePerTick} dmg/s for ${r.durationSec}s)`;
    case "slow":
      return `slow (${p100(r.magnitude ?? 0)}% for ${r.durationSec}s)`;
    case "silence":
      return `silence (${r.durationSec}s)`;
    default:
      return r.effectType;
  }
}

/** Human-readable lines for a resolved ItemMods (Bag + detail panel). */
export function describeItemMods(mods: ItemMods): string[] {
  const out: string[] = [];
  if (mods.dmgMult !== 1) out.push(`+${p100(mods.dmgMult - 1)}% damage`);
  if (mods.hpMult !== 1) out.push(`+${p100(mods.hpMult - 1)}% health`);
  if (mods.atkDelayMult !== 1)
    out.push(`+${asPct(mods.atkDelayMult)}% attack speed`);
  if (mods.moveSpeedMult !== 1)
    out.push(`+${p100(mods.moveSpeedMult - 1)}% move speed`);
  if (mods.damageTakenMult !== 1)
    out.push(`Takes ${p100(1 - mods.damageTakenMult)}% less damage`);
  if (mods.magicTakenMult !== 1)
    out.push(`Takes ${p100(1 - mods.magicTakenMult)}% less magic damage`);
  if (mods.lifesteal > 0)
    out.push(`Heals ${p100(mods.lifesteal)}% of attack damage dealt`);
  if (mods.thornsFrac > 0)
    out.push(`Reflects ${p100(mods.thornsFrac)}% of damage taken`);
  if (mods.executeBonus > 0)
    out.push(`+${p100(mods.executeBonus)}% damage vs enemies below 25% HP`);
  if (mods.killHeal > 0) out.push(`Kills heal the wearer ${mods.killHeal} HP`);
  if (mods.critEveryNth > 0)
    out.push(`Every ${nth(mods.critEveryNth)} attack crits for double damage`);
  if (mods.cooldownMult !== 1)
    out.push(`Ability cooldown reduced ${p100(1 - mods.cooldownMult)}%`);
  if (mods.giantSlayerPct > 0)
    out.push(`+${p100(mods.giantSlayerPct)}% damage vs larger foes (higher max HP)`);
  if (mods.summonStatPct > 0)
    out.push(`Summons spawn with +${p100(mods.summonStatPct)}% stats`);
  for (const e of mods.effects) {
    switch (e.kind) {
      case "onHitRider":
        out.push(`Every ${nth(e.everyNth)} hit applies ${describeRider(e.rider)}`);
        break;
      case "detonateOnDeath":
        out.push(
          e.element === "slow"
            ? `Slowed victims detonate on death, chilling nearby enemies`
            : `${e.element === "burn" ? "Burning" : "Poisoned"} victims detonate on death (${e.damage} dmg nova)`
        );
        break;
      case "spreadPoisonOnAttack":
        out.push(`Hits on poisoned enemies spread the poison nearby`);
        break;
      case "chainNth":
        out.push(
          `Every ${nth(e.everyNth)} attack chains to a second enemy for ${p100(e.frac)}% damage`
        );
        break;
      case "doubleStrikeNth":
        out.push(`Every ${nth(e.everyNth)} attack strikes twice`);
        break;
      case "nthBonusDamage":
        out.push(
          `Every ${nth(e.everyNth)} hit deals +${e.bonus} shadow damage${e.stunSec ? ` and stuns ${e.stunSec}s` : ""}`
        );
        break;
      case "hasteOnKill":
        out.push(
          `Kills grant +${p100(e.magnitude)}% speed for ${e.durationSec}s`
        );
        break;
      case "tempo":
        out.push(
          `Consecutive hits on a target grant +${p100(e.perStack)}% attack speed (max ${e.maxStacks} stacks)`
        );
        break;
      case "packTactics":
        out.push(
          `+${p100(e.perAlly)}% damage dealt and reduced taken per living ally`
        );
        break;
      case "startShield":
        out.push(`Starts battle with a shield (${p100(e.frac)}% of max HP)`);
        break;
      case "stealthBelowHalf":
        out.push(
          `First time below 50% HP: stealth for ${e.durationSec}s`
        );
        break;
      case "regen":
        out.push(
          `Regenerates ${e.pctPerSec}% max HP per second${e.doubledBelowHalf ? ", doubled below half HP" : ""}`
        );
        break;
      case "spellFeedback":
        out.push(`Reflects ${p100(e.frac)}% of magic damage at the caster`);
        break;
      case "runicBarrier":
        out.push(
          `Shield worth ${p100(e.frac)}% max HP, re-forms every ${e.intervalSec}s`
        );
        break;
      case "abilityStartsReady":
        out.push(`Ability starts the battle ready`);
        break;
    }
  }
  // Lucky Coin (meta-only) has no combat mods — describe from its ladders.
  return out;
}

/** Lucky Coin is meta-only; the panels describe it via this helper. */
export function describeLuckyCoin(quality: ItemQuality, star: number): string[] {
  const q = ITEM_QUALITIES.indexOf(quality);
  const out = [`+${LUCKY_GOLD_PCT[q][star - 1]}% gold from battles`];
  if (q === LEG)
    out.push(
      `${p100(LUCKY_UPGRADE_CHANCE[star - 1])}% chance to upgrade the reward chest a tier`
    );
  return out;
}

/** Effect lines for an item KEY — the one panel-text entry point (Shop /
 *  Forge / unit detail), so the Lucky Coin special case lives in one place. */
export function describeItemKey(key: ItemKey): string[] {
  const p = parseItemKey(key);
  if (!p) return [];
  if (p.lineId === "lucky_coin") return describeLuckyCoin(p.quality, p.star);
  return describeItemMods(resolveItemMods(key));
}

// ---------------------------------------------------------------------------
// Meta hooks — Lucky Coin and the Arena mirror. Pure math over loadouts.
// ---------------------------------------------------------------------------

/** The best Lucky Coin equipped on a FIELDED deck unit (only the best coin
 *  counts — four coins don't stack). Zeroes when none is worn. */
export function luckyCoinBonus(
  deck: readonly string[],
  loadouts: ItemLoadouts | undefined
): { goldPct: number; chestUpgradeChance: number } {
  let goldPct = 0;
  let chestUpgradeChance = 0;
  if (!loadouts) return { goldPct, chestUpgradeChance };
  for (const defId of deck) {
    const key = loadouts[defId]?.trinket;
    const p = key ? parseItemKey(key) : null;
    if (!p || p.lineId !== "lucky_coin") continue;
    const q = ITEM_QUALITIES.indexOf(p.quality);
    const pctVal = LUCKY_GOLD_PCT[q][p.star - 1];
    if (pctVal > goldPct) {
      goldPct = pctVal;
      chestUpgradeChance = q === LEG ? LUCKY_UPGRADE_CHANCE[p.star - 1] : 0;
    }
  }
  return { goldPct, chestUpgradeChance };
}

/** Arena mirror: the flat hp/dmg bump the generated enemy deck fights with,
 *  approximating the player's average equipped power (the item twin of
 *  leveling's averageDeckLevel). Deterministic pure math — a match input. */
export function arenaMirrorMultipliers(
  deck: readonly string[],
  loadouts: ItemLoadouts | undefined
): { hp: number; dmg: number } {
  if (!loadouts || deck.length === 0) return { hp: 1, dmg: 1 };
  let hpSum = 0;
  let dmgSum = 0;
  for (const defId of deck) {
    const mods = resolveLoadoutMods(loadouts[defId]);
    let hp = 1;
    let dmg = 1;
    if (mods) {
      // Fold stat-equivalents: attack speed counts as damage throughput,
      // damage reduction counts as effective HP.
      hp = mods.hpMult / mods.damageTakenMult;
      dmg = mods.dmgMult / mods.atkDelayMult;
      const trinket = loadouts[defId]?.trinket;
      const p = trinket ? parseItemKey(trinket) : null;
      if (p) {
        const allowance =
          TRINKET_MIRROR_PCT[ITEM_QUALITIES.indexOf(p.quality)][p.star - 1] /
          100;
        hp += allowance;
        dmg += allowance;
      }
    }
    hpSum += hp;
    dmgSum += dmg;
  }
  return { hp: hpSum / deck.length, dmg: dmgSum / deck.length };
}
