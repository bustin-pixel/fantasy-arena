// ============================================================================
// Persistence layer
// A thin wrapper around localStorage. Isolated behind an interface so that when
// multiplayer arrives, this can be swapped for a server-backed store WITHOUT
// touching the rest of the app. Migration is a pure function (migrateSave) so
// Vitest can exercise it headlessly — loadSave only does the storage I/O.
// ============================================================================

import { DECKABLE_UNIT_IDS, UNITS } from "@/data/units";
import { STARTER_UNIT_IDS } from "@/meta/economy";

/** Compendium knowledge of one unit/monster. Encountered = faced it in battle
 *  (silhouette + name); defeated = it died to you at least once (full page). */
export interface BestiaryEntry {
  encountered: boolean;
  defeated: boolean;
}

/** PvE campaign progress. Floors are linear, so one high-water mark is enough:
 *  floor N is a "first clear" iff N > highestClearedFloor. */
export interface DepthsProgress {
  /** Highest floor with a recorded victory; 0 = none yet. */
  highestClearedFloor: number;
}

export interface PlayerSave {
  version: number;
  username: string;
  /** Selected active deck (unit ids). Combat slice uses up to 4. */
  deck: string[];
  /** Local battle stats (wins/losses) — display only for now. */
  wins: number;
  losses: number;
  /** Compendium reveal state, keyed by defId. Recorded by the meta layer on
   *  battle end — the sim never learns about it. (Save v2.) */
  bestiary: Record<string, BestiaryEntry>;
  /** Spendable currency, earned from battles and chests. (Save v3.) */
  gold: number;
  /** Deckable unit ids the player owns. New saves start with the starter
   *  four; units added to the game AFTER a save reaches v3 arrive locked —
   *  they're drops/purchases, only the v2→v3 boundary grandfathers. */
  unlockedUnits: string[];
  depths: DepthsProgress;
  // Future slices (additive, versioned-merge handles them): soulShards,
  // items inventory, per-unit loadouts.
}

// The key names the storage SLOT, not the schema — the version lives inside
// the payload, so bumping the schema must not change the key.
const KEY = "fantasy-arena/save/v1";

export const DEFAULT_SAVE: PlayerSave = {
  version: 3,
  username: "Champion",
  deck: ["ogre", "archer", "knight", "fire_mage"],
  wins: 0,
  losses: 0,
  bestiary: {},
  gold: 0,
  unlockedUnits: [...STARTER_UNIT_IDS],
  depths: { highestClearedFloor: 0 },
};

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY);
    return migrateSave(raw ? (JSON.parse(raw) as Partial<PlayerSave>) : null);
  } catch {
    return migrateSave(null);
  }
}

/** Pure migration: raw parsed JSON of ANY version (or null for a brand-new
 *  player) → a valid current-version save. Versioned merge: defaults fill any
 *  fields an older save lacks, then version-specific rules apply on top. */
export function migrateSave(parsed: Partial<PlayerSave> | null): PlayerSave {
  if (!parsed || typeof parsed !== "object") {
    return structuredCloneSave(DEFAULT_SAVE);
  }
  const merged: PlayerSave = { ...structuredCloneSave(DEFAULT_SAVE), ...parsed };
  merged.bestiary = { ...(parsed.bestiary ?? {}) };
  merged.depths = {
    highestClearedFloor: Math.max(0, parsed.depths?.highestClearedFloor ?? 0),
  };
  merged.gold = Math.max(0, parsed.gold ?? 0);

  // Grandfathering: saves from before the unlock system keep every unit that
  // exists today. Only this one-time boundary is generous — post-v3 saves
  // meet new units as locked drops/purchases.
  if ((parsed.version ?? 1) < 3) {
    merged.unlockedUnits = [...DECKABLE_UNIT_IDS];
  } else {
    // Defensive: drop unknown/non-deckable ids, and starters are always owned.
    const owned = new Set(
      (parsed.unlockedUnits ?? []).filter((id) =>
        DECKABLE_UNIT_IDS.includes(id)
      )
    );
    for (const id of STARTER_UNIT_IDS) owned.add(id);
    merged.unlockedUnits = [...owned];
  }

  merged.version = DEFAULT_SAVE.version;
  merged.deck = sanitizeDeck(merged.deck, merged.unlockedUnits);
  // Load-time only: never boot into an empty warband — refill with whatever
  // of the default deck the player owns (starters are always unlocked).
  // Interactive setDeck deliberately skips this so Clear actually clears.
  if (merged.deck.length === 0) {
    merged.deck = DEFAULT_SAVE.deck.filter((id) =>
      merged.unlockedUnits.includes(id)
    );
  }
  return merged;
}

/** Deep-ish copy so callers can't mutate DEFAULT_SAVE through a returned save. */
function structuredCloneSave(save: PlayerSave): PlayerSave {
  return {
    ...save,
    deck: [...save.deck],
    bestiary: { ...save.bestiary },
    unlockedUnits: [...save.unlockedUnits],
    depths: { ...save.depths },
  };
}

/** Enforce deck rules: drop unknown ids, locked units, dupes, and keep at most
 *  one Legendary. The deck ⊆ unlocked invariant lives here — grandfathered
 *  saves unlock everything first, so their decks pass through untouched.
 *  May return [] (an empty warband is a valid interactive state — Clear);
 *  the never-boot-empty fallback lives in migrateSave, not here. */
export function sanitizeDeck(
  deck: string[],
  unlockedUnits: readonly string[]
): string[] {
  const out: string[] = [];
  let hasLegendary = false;
  for (const id of deck) {
    const def = UNITS[id];
    if (!def) continue; // unknown / removed unit
    if (!unlockedUnits.includes(id)) continue; // locked
    if (out.includes(id)) continue;
    if (def.rarity === "legendary") {
      if (hasLegendary) continue;
      hasLegendary = true;
    }
    out.push(id);
    if (out.length >= 4) break;
  }
  return out;
}

export function writeSave(save: PlayerSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable (private mode); fail soft.
  }
}

/** Wipe all progress (deck, gold, unlocks). Settings live under their own key
 *  and survive. Callers should reload the app so React state re-initializes. */
export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage may be unavailable — nothing to wipe.
  }
}
