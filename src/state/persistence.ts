// ============================================================================
// Persistence layer
// A thin wrapper around localStorage. Isolated behind an interface so that when
// multiplayer arrives, this can be swapped for a server-backed store WITHOUT
// touching the rest of the app. Today it only persists the selected deck and a
// username placeholder — progression/currencies are intentionally out of scope
// for the combat slice but the shape is here to grow into.
// ============================================================================

import { UNITS } from "@/data/units";

/** Compendium knowledge of one unit/monster. Encountered = faced it in battle
 *  (silhouette + name); defeated = it died to you at least once (full page). */
export interface BestiaryEntry {
  encountered: boolean;
  defeated: boolean;
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
}

const KEY = "fantasy-arena/save/v1";

export const DEFAULT_SAVE: PlayerSave = {
  version: 2,
  username: "Champion",
  deck: ["ogre", "archer", "knight", "fire_mage"],
  wins: 0,
  losses: 0,
  bestiary: {},
};

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<PlayerSave>;
    // Versioned merge: defaults fill any fields an older save lacks (a v1 save
    // simply gains an empty bestiary), then the version is stamped current.
    const merged = { ...DEFAULT_SAVE, ...parsed };
    merged.version = DEFAULT_SAVE.version;
    merged.bestiary = { ...(parsed.bestiary ?? {}) };
    merged.deck = sanitizeDeck(merged.deck);
    return merged;
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

/** Enforce deck rules on a loaded deck: drop unknown ids, dedupe, and keep at
 *  most one Legendary (handles old saves made before the rule existed). */
function sanitizeDeck(deck: string[]): string[] {
  const out: string[] = [];
  let hasLegendary = false;
  for (const id of deck) {
    const def = UNITS[id];
    if (!def) continue; // unknown / removed unit
    if (out.includes(id)) continue;
    if (def.rarity === "legendary") {
      if (hasLegendary) continue;
      hasLegendary = true;
    }
    out.push(id);
    if (out.length >= 4) break;
  }
  return out.length > 0 ? out : [...DEFAULT_SAVE.deck];
}

export function writeSave(save: PlayerSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable (private mode); fail soft.
  }
}
