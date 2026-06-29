// ============================================================================
// AIDeck
// Generates a deck deterministically from a seed using rarity weights. Kept
// separate from MatchController so the future progression layer can swap in
// trophy-scaled generation without touching combat. The hub also reuses
// generateRandomDeck for its auto-fill / randomize buttons (with a fresh,
// non-sim seed — these are meta actions, outside the deterministic battle).
// ============================================================================

import { RNG } from "@/utils/rng";
import { UNITS, DECKABLE_UNIT_IDS } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { MAX_DECK } from "@/utils/constants";

/** Build a valid deck — rarity-weighted, no duplicate units, at most one
 *  Legendary (mirrors the player's deckbuilding rule). An `existing` partial
 *  deck is kept in order and topped up to `count` (used by hub auto-fill);
 *  pass nothing for a fresh deck. Deterministic in `seed`. */
export function generateRandomDeck(
  seed: number,
  count = MAX_DECK,
  existing: readonly string[] = []
): string[] {
  const rng = new RNG(seed ^ 0x9e3779b9);
  // Weighted pool of candidate ids.
  const weighted: string[] = [];
  for (const id of DECKABLE_UNIT_IDS) {
    const w = RARITIES[UNITS[id].rarity].deckWeight;
    for (let i = 0; i < w; i++) weighted.push(id);
  }

  const deck = existing.slice(0, count);
  let hasLegendary = deck.some((id) => UNITS[id].rarity === "legendary");
  let guard = 0;
  while (deck.length < count && guard < 500) {
    guard++;
    const pick = rng.pick(weighted);
    if (deck.includes(pick)) continue; // no duplicates
    const isLegendary = UNITS[pick].rarity === "legendary";
    if (isLegendary && hasLegendary) continue; // one-legendary rule
    deck.push(pick);
    if (isLegendary) hasLegendary = true;
  }
  return deck;
}

/** Build a deterministic enemy deck from the match seed. */
export function generateEnemyDeck(seed: number, count = MAX_DECK): string[] {
  return generateRandomDeck(seed, count);
}
