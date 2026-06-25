import type { Rarity } from "@/types";

export interface RarityDef {
  id: Rarity;
  label: string;
  /** Border / UI color. */
  color: string;
  /** Relative weight when an AI deck is generated. */
  deckWeight: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  rare: { id: "rare", label: "Rare", color: "#3b82f6", deckWeight: 6 },
  epic: { id: "epic", label: "Epic", color: "#a855f7", deckWeight: 3 },
  legendary: { id: "legendary", label: "Legendary", color: "#f5b301", deckWeight: 1 },
};

export const RARITY_ORDER: Rarity[] = ["rare", "epic", "legendary"];
