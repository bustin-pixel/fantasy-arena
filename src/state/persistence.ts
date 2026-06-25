// ============================================================================
// Persistence layer
// A thin wrapper around localStorage. Isolated behind an interface so that when
// multiplayer arrives, this can be swapped for a server-backed store WITHOUT
// touching the rest of the app. Today it only persists the selected deck and a
// username placeholder — progression/currencies are intentionally out of scope
// for the combat slice but the shape is here to grow into.
// ============================================================================

import { UNITS } from "@/data/units";

/** How the hub's unit roster is ordered. Persisted as a player preference. */
export type SortMode = "default" | "rarity";

export interface PlayerSave {
  version: number;
  username: string;
  /** Selected active deck (unit ids). Combat slice uses up to 4. */
  deck: string[];
  /** Local battle stats (wins/losses) — display only for now. */
  wins: number;
  losses: number;
  /** Hub roster sort preference. */
  sortMode: SortMode;
}

const KEY = "fantasy-arena/save/v1";

export const DEFAULT_SAVE: PlayerSave = {
  version: 1,
  username: "Champion",
  deck: ["ogre", "archer", "knight", "fire_mage"],
  wins: 0,
  losses: 0,
  sortMode: "default",
};

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<PlayerSave>;
    const merged = { ...DEFAULT_SAVE, ...parsed };
    merged.deck = sanitizeDeck(merged.deck);
    // Coerce any unknown/corrupt stored value back to a valid mode.
    merged.sortMode = merged.sortMode === "rarity" ? "rarity" : "default";
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
