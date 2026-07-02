import type { Rarity } from "@/types";

export interface RarityDef {
  id: Rarity;
  label: string;
  /** Border / UI color. */
  color: string;
  /** Relative weight when an AI deck is generated. */
  deckWeight: number;
  /** Power cost for budgeted AI-deck generation (see engine/AIDeck.ts). The
   *  starter deck (2 epics + 2 rares) costs 6 — the reference power level. */
  cost: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  rare: { id: "rare", label: "Rare", color: "#3b82f6", deckWeight: 6, cost: 1 },
  epic: { id: "epic", label: "Epic", color: "#a855f7", deckWeight: 3, cost: 2 },
  legendary: { id: "legendary", label: "Legendary", color: "#f5b301", deckWeight: 1, cost: 4 },
};

export const RARITY_ORDER: Rarity[] = ["rare", "epic", "legendary"];

/** Power rank for sorting: higher = rarer (legendary > epic > rare). */
export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}
