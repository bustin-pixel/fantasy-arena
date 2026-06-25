// ============================================================================
// AIDeck
// Generates an enemy deck deterministically from the match seed using rarity
// weights. Kept separate from MatchController so the future progression layer
// can swap in trophy-scaled generation without touching combat.
// ============================================================================

import { RNG } from "@/utils/rng";
import { UNITS, DECKABLE_UNIT_IDS } from "@/data/units";
import { RARITIES } from "@/data/rarities";

/** Build a deterministic enemy deck: weighted by rarity, no duplicate units,
 *  and at most one Legendary (mirrors the player's deckbuilding rule). */
export function generateEnemyDeck(seed: number, count = 4): string[] {
  const rng = new RNG(seed ^ 0x9e3779b9);
  // Weighted pool of candidate ids.
  const weighted: string[] = [];
  for (const id of DECKABLE_UNIT_IDS) {
    const w = RARITIES[UNITS[id].rarity].deckWeight;
    for (let i = 0; i < w; i++) weighted.push(id);
  }

  const deck: string[] = [];
  let hasLegendary = false;
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
