// ============================================================================
// Library Compendium — the book manifest. Pure data assembly (no React, no
// engine): turns the dungeon registry, the hero roster, and the item catalog
// into an ordered shelf of BookDefs, each pre-paginated into two-page spreads
// for the BookOverlay. The "Grand Athenaeum" spine palette lives here too —
// hand-picked hexes per dungeon (mockup-auditioned 2026-07-11), deliberately
// NOT derived from assets/arenaThemes so the 2400-line backdrop builder stays
// out of the hub bundle.
// ============================================================================

import {
  DUNGEONS,
  getDungeon,
  isDungeonUnlocked,
  type Dungeon,
} from "@/data/dungeons";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { rarityRank } from "@/data/rarities";
import { ITEM_LINES, ITEM_SLOTS } from "@/data/items";
import type { ItemSlot } from "@/types";
import {
  highestClearedFloorOf,
  type PlayerSave,
} from "@/state/persistence";

// ---------------------------------------------------------------------------
// Page / book shapes
// ---------------------------------------------------------------------------

export interface MonsterEntry {
  kind: "monster";
  defId: string;
}
export interface ItemEntry {
  kind: "item";
  lineId: string;
}
export type PageEntry = MonsterEntry | ItemEntry;

export interface BookPage {
  heading: string;
  entries: PageEntry[];
  /** Title page: renders just the book's name on plain parchment (the opening
   *  leaf). The painted cover already carries the art — this page mustn't
   *  repeat it. */
  title?: boolean;
  /** Splash-painting plate (lore pages): the book id whose vignette
   *  components/compendium/splashArt draws. */
  art?: string;
  /** Italic flavor line under the entries (lore page, rare-quest hint). */
  note?: string;
  /** Boss showcase page: one big framed portrait instead of the card grid. */
  boss?: { defId: string };
  /** The rare-spawn page tags its entry with the legendary it unlocks. */
  rareTag?: string;
}

export interface BookSpread {
  left: BookPage;
  right: BookPage;
}

export interface BookDef {
  id: string;
  title: string;
  /** Spine motif glyph. */
  glyph: string;
  /** Leather base + embossing accent (Grand Athenaeum palette). */
  leather: string;
  accent: string;
  /** Chained shut (dungeon gate not met). */
  locked: boolean;
  gateHint?: string;
  spreads: BookSpread[];
  /** Progress plaque: defeated/total (bestiary books) or owned/total lines
   *  (items book). Absent on locked books (the plaque is hidden anyway). */
  progress?: { done: number; total: number };
  kind: "bestiary" | "items";
}

// ---------------------------------------------------------------------------
// Spine palette + motifs (mockup variant 1 — Grand Athenaeum)
// ---------------------------------------------------------------------------

const SPINES: Record<string, { leather: string; accent: string; glyph: string }> = {
  depths: { leather: "#2e4239", accent: "#9fd4bb", glyph: "🐀" },
  bonefields: { leather: "#4a4438", accent: "#e3d9b8", glyph: "💀" },
  wilds: { leather: "#4d3a22", accent: "#e0b573", glyph: "🐾" },
  overgrowth: { leather: "#2f4a26", accent: "#a8e07f", glyph: "🍃" },
  sealed_vault: { leather: "#2b3350", accent: "#ffd873", glyph: "✦" },
  deep_forge: { leather: "#402420", accent: "#ff9d4d", glyph: "⚙" },
  eclipse_spire: { leather: "#241a38", accent: "#c4aeff", glyph: "◐" },
  fallen_cathedral: { leather: "#3d3244", accent: "#ffd76a", glyph: "⚜" },
  rogues_den: { leather: "#33261a", accent: "#e8b04b", glyph: "🗡" },
  heroes: { leather: "#243a5e", accent: "#f5b301", glyph: "⚔" },
  items: { leather: "#571f1f", accent: "#e8c06a", glyph: "◆" },
};

/** Shade a #rrggbb hex by `amt` (matches assets/sprites' shade helper). */
export function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (x: number) => Math.max(0, Math.min(255, x));
  return `rgb(${c((n >> 16) + amt)},${c(((n >> 8) & 255) + amt)},${c((n & 255) + amt)})`;
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

/** Cards per page — 4 keeps a 2×2 grid roomy on a phone-width spread. */
const PER_PAGE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII"];
function headed(base: string, pages: PageEntry[][]): BookPage[] {
  return pages.map((entries, i) => ({ heading: base + (ROMAN[i] ?? ` ${i + 1}`), entries }));
}

/** Pair a flat page list into spreads, padding with a blank parchment page
 *  when odd so showcase pages always land face-right. */
function toSpreads(pages: BookPage[]): BookSpread[] {
  if (pages.length % 2 === 1) pages.push({ heading: "", entries: [] });
  const out: BookSpread[] = [];
  for (let i = 0; i < pages.length; i += 2) out.push({ left: pages[i], right: pages[i + 1] });
  return out;
}

// ---------------------------------------------------------------------------
// Per-book builders
// ---------------------------------------------------------------------------

function dungeonBook(dungeon: Dungeon, save: PlayerSave): BookDef {
  const spine = SPINES[dungeon.id];
  const locked = !isDungeonUnlocked(dungeon, (id) => highestClearedFloorOf(save, id));

  // Roster in tier order: fodder, then the rare quest spawn, then the boss —
  // the same walk CompendiumScreen's old MONSTER_IDS flatten did, kept per
  // dungeon. The quest spawn is included even when deckable (the Slime): it IS
  // this dungeon's rare, so its page belongs here.
  const fodder: string[] = [];
  const bosses: string[] = [];
  for (const tier of dungeon.tiers) {
    for (const id of Object.keys(tier.monsters)) if (!fodder.includes(id)) fodder.push(id);
    if (!bosses.includes(tier.boss)) bosses.push(tier.boss);
  }

  // Front page: the dungeon's lore plate. Then fodder chunks. The final spread
  // is always rare (left) + boss (right); extra bosses of multi-tier dungeons
  // (the Depths' per-tier Bloaters are one id today) ride the rare page.
  const pages: BookPage[] = [
    { heading: dungeon.name, entries: [], title: true },
    { heading: "", entries: [] },
    { heading: dungeon.name, entries: [], art: dungeon.id, note: dungeon.entryHint },
    ...headed("Denizens", chunk(fodder.map((defId) => ({ kind: "monster", defId }) as PageEntry), PER_PAGE)),
  ];
  const quest = dungeon.quest;
  // The rare gets the same big showcase frame as the boss facing it.
  const rarePage: BookPage = quest
    ? {
        heading: "Rare Sighting",
        entries: [],
        boss: { defId: quest.spawnId },
        rareTag: `Unlocks ${getUnitDef(quest.unlocks).name}`,
        note: quest.hint,
      }
    : { heading: "", entries: [] };
  const bossPage: BookPage = {
    heading: "Dungeon Boss",
    entries: [],
    boss: { defId: bosses[bosses.length - 1] },
  };
  // Pad so the rare+boss pair starts a fresh spread.
  if (pages.length % 2 === 1) pages.push({ heading: "", entries: [] });
  pages.push(rarePage, bossPage);

  const tracked = [...fodder, ...bosses];
  if (quest && !tracked.includes(quest.spawnId)) tracked.push(quest.spawnId);

  return {
    id: dungeon.id,
    title: dungeon.name,
    ...spine,
    locked,
    gateHint: locked
      ? `Clear ${getDungeon(dungeon.gate!.dungeonId).name} floor ${dungeon.gate!.floor} to unlock`
      : undefined,
    spreads: toSpreads(pages),
    progress: locked
      ? undefined
      : {
          done: tracked.filter((id) => save.bestiary[id]?.defeated).length,
          total: tracked.length,
        },
    kind: "bestiary",
  };
}

function heroesBook(save: PlayerSave): BookDef {
  // Rarity order (rare → legendary), stable within a rarity; grouped so page
  // headings stay honest.
  const byRarity = [...DECKABLE_UNIT_IDS].sort(
    (a, b) => rarityRank(getUnitDef(a).rarity) - rarityRank(getUnitDef(b).rarity)
  );
  const groups = new Map<string, string[]>();
  for (const id of byRarity) {
    const label = getUnitDef(id).rarity;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(id);
  }
  const pages: BookPage[] = [
    { heading: "Heroes of the Arena", entries: [], title: true },
    { heading: "", entries: [] },
    {
      heading: "Heroes of the Arena",
      entries: [],
      art: "heroes",
      note: "Rival champions of the sand. Defeat each in the Arena to complete their pages.",
    },
  ];
  for (const [rarity, ids] of groups) {
    const label = rarity === "rare" ? "Rare Champions" : rarity === "epic" ? "Epic Champions" : "Legends";
    pages.push(...headed(label, chunk(ids.map((defId) => ({ kind: "monster", defId }) as PageEntry), PER_PAGE)));
  }
  return {
    id: "heroes",
    title: "Heroes of the Arena",
    ...SPINES.heroes,
    locked: false,
    spreads: toSpreads(pages),
    progress: {
      done: DECKABLE_UNIT_IDS.filter((id) => save.bestiary[id]?.defeated).length,
      total: DECKABLE_UNIT_IDS.length,
    },
    kind: "bestiary",
  };
}

const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: "Weapons",
  armor: "Armor",
  trinket: "Trinkets",
};

/** Does the save own any copy of this line, at any quality/star? */
export function ownsLine(save: PlayerSave, lineId: string): boolean {
  return Object.keys(save.items).some(
    (key) => key.startsWith(lineId + ":") && save.items[key] > 0
  );
}

function itemsBook(save: PlayerSave): BookDef {
  const lineIds = Object.keys(ITEM_LINES);
  const pages: BookPage[] = [
    { heading: "Arms & Relics", entries: [], title: true },
    { heading: "", entries: [] },
    {
      heading: "Arms & Relics",
      entries: [],
      art: "items",
      note: "A full catalog of the armory — every weapon, armor, and trinket line, and the dungeon signatures beside them.",
    },
  ];
  // Chapters by slot, base lines first then that slot's dungeon signatures.
  for (const slot of ITEM_SLOTS) {
    const ids = lineIds.filter((id) => ITEM_LINES[id].slot === slot);
    ids.sort((a, b) => Number(!!ITEM_LINES[a].dungeonId) - Number(!!ITEM_LINES[b].dungeonId));
    pages.push(
      ...headed(SLOT_LABEL[slot], chunk(ids.map((lineId) => ({ kind: "item", lineId }) as PageEntry), PER_PAGE))
    );
  }
  return {
    id: "items",
    title: "Arms & Relics",
    ...SPINES.items,
    locked: false,
    spreads: toSpreads(pages),
    progress: {
      done: lineIds.filter((id) => ownsLine(save, id)).length,
      total: lineIds.length,
    },
    kind: "items",
  };
}

// ---------------------------------------------------------------------------
// The shelf
// ---------------------------------------------------------------------------

/** Every book on the shelf, in shelf order: the nine dungeons down the gate
 *  chain, then the Heroes tome and the item catalog. */
export function buildBooks(save: PlayerSave): BookDef[] {
  return [
    ...Object.values(DUNGEONS).map((d) => dungeonBook(d, save)),
    heroesBook(save),
    itemsBook(save),
  ];
}
