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

/** Per-unit cost overrides on top of the rarity cost. The Druid is priced out
 *  of standard AI budgets deliberately — it's the intentional balance outlier
 *  (~100% 1v1 win rate, see NOTES.md), so players shouldn't face it until a
 *  difficulty/progression layer can gate it. */
const UNIT_COST_OVERRIDES: Record<string, number> = { summoner: 5 };

/** A unit's power cost for deck budgeting. */
export function unitCost(id: string): number {
  return UNIT_COST_OVERRIDES[id] ?? RARITIES[UNITS[id].rarity].cost;
}

/** Can `slots` more distinct units sum to exactly `remaining`? Future slots hold
 *  1s (rares) and 2s (epics) — every integer in [slots, 2*slots] is reachable —
 *  plus AT MOST one 4 (legendary) or 5 (the Druid override) if the one-legendary
 *  rule still allows it. Exact check: naive interval math has a hole (e.g. a
 *  remainder of 3 with one slot left is unreachable — no 3-cost unit exists). */
function canFill(remaining: number, slots: number, legendaryAllowed: boolean): boolean {
  if (slots === 0) return remaining === 0;
  if (remaining >= slots && remaining <= slots * 2) return true; // rares + epics
  if (!legendaryAllowed) return false;
  // One slot spent on a legendary (4) or the Druid (5), rest rares/epics.
  for (const legCost of [4, 5]) {
    const rest = remaining - legCost;
    if (slots === 1 ? rest === 0 : rest >= slots - 1 && rest <= (slots - 1) * 2)
      return true;
  }
  return false;
}

/**
 * Build a deterministic enemy deck from the match seed, constrained to a power
 * budget so every opponent lands near the starter deck's level (cost 6) instead
 * of the old unbounded rarity lottery (a third of decks packed a legendary and
 * played like boss fights; the audit measured a 43-point win-rate swing).
 *
 * Budget band: 5 / 6 / 7 (weighted toward 6). With rare=1 / epic=2 / legendary=4,
 * a legendary only fits at budget 7 — and arrives escorted by three rares.
 * A future progression layer can pass an explicit (trophy-scaled) budget.
 */
export function generateEnemyDeck(
  seed: number,
  count = MAX_DECK,
  budget?: number
): string[] {
  const rng = new RNG(seed ^ 0x51ed270b);
  const target = budget ?? [5, 6, 6, 7][rng.int(0, 3)];

  const deck: string[] = [];
  let spent = 0;
  let hasLegendary = false;
  let guard = 0;
  while (deck.length < count && guard < 500) {
    guard++;
    const slotsAfter = count - deck.length - 1;
    // Candidates that keep the remaining budget exactly fillable by the
    // remaining slots (see canFill).
    const candidates = DECKABLE_UNIT_IDS.filter((id) => {
      if (deck.includes(id)) return false;
      const isLegendary = UNITS[id].rarity === "legendary";
      if (isLegendary && hasLegendary) return false;
      return canFill(
        target - spent - unitCost(id),
        slotsAfter,
        !hasLegendary && !isLegendary
      );
    });
    if (candidates.length === 0) break; // unreachable for budgets in [count, 2*count+2]
    // Rarity-weighted pick within the feasible set, for variety inside the band.
    const weighted: string[] = [];
    for (const id of candidates) {
      const w = RARITIES[UNITS[id].rarity].deckWeight;
      for (let i = 0; i < w; i++) weighted.push(id);
    }
    const pick = rng.pick(weighted);
    deck.push(pick);
    spent += unitCost(pick);
    if (UNITS[pick].rarity === "legendary") hasLegendary = true;
  }
  return deck;
}
