// ============================================================================
// Grubbins' Shop — daily stock, pure meta logic.
// The stock is ALWAYS derived from (dayIndex, rerolls) — never persisted — so
// the purchase fold can re-derive it and StrictMode double-runs can't double-
// grant (the same "roll first, fold pure" discipline as battle rewards).
// Acquisition numbers (prices, odds) live in meta/economy.ts; item POWER stays
// in data/items.ts. meta/ never imports state/, engine/, or React — the save
// folds here take a structural slice, and persistence imports US (like
// meta/inventory) for the sanitizer.
// ============================================================================

import type { ItemSlot } from "@/types";
import {
  BASE_LINES_BY_SLOT,
  ITEM_SLOTS,
  makeItemKey,
} from "@/data/items";
import { RNG } from "@/utils/rng";
import {
  SHOP_EPIC_CHANCE,
  SHOP_PRICES,
  SHOP_REROLL_COST,
  SHOP_REROLLS_PER_DAY,
} from "./economy";

/** The shop only ever sells rare/epic quality — legendary stays a merge /
 *  dungeon achievement (locked design decision, don't widen casually). */
export type ShopQuality = "rare" | "epic";

/** Per-day shop bookkeeping inside the save. The STOCK is not here on
 *  purpose — it's re-derived from (day, rerolls) wherever it's needed. */
export interface ShopState {
  /** dayIndexLocal() value this bookkeeping refers to. -1 = never visited. */
  day: number;
  /** Paid stock rerolls used today (0..SHOP_REROLLS_PER_DAY). */
  rerolls: number;
  /** Slot indices (0..SHOP_SLOT_COUNT-1) already purchased today. */
  bought: number[];
}

export const SHOP_SLOT_COUNT = 4;

/** One shelf offer. `slotIdx` 0–2 are weapon/armor/trinket; 3 is a wildcard. */
export interface ShopSlotOffer {
  slotIdx: number;
  lineId: string;
  slot: ItemSlot;
  quality: ShopQuality;
  price: number;
}

/** Local-calendar day as a comparable integer (y*512 + m*32 + d). Impure edge
 *  like generateSeed(): callers compute it and pass it into the pure rolls /
 *  folds, so those stay testable. Clock changes re-roll the shop — acceptable
 *  for a local solo game whose save is hand-editable anyway. */
export function dayIndexLocal(d: Date = new Date()): number {
  return d.getFullYear() * 512 + d.getMonth() * 32 + d.getDate();
}

/** Disperse (dayIndex, rerolls) into one 32-bit seed. Knuth multiplicative
 *  hash so consecutive days don't produce correlated Mulberry32 streams. */
function stockSeed(dayIndex: number, rerolls: number): number {
  return (Math.imul(dayIndex, 2654435761) ^ Math.imul(rerolls + 1, 0x9e3779b9)) >>> 0;
}

/** The day's shelf. Pure: same (dayIndex, rerolls) → identical offers. Slots
 *  0–2 guarantee one of each equipment slot; slot 3 rolls a wildcard slot
 *  first (like the chest roll, so weapons aren't drowned by 8 trinkets).
 *  Everything comes from BASE_LINES_BY_SLOT — dungeon-signature lines are
 *  excluded by that pool's construction, never by a filter here. */
export function rollDailyStock(
  dayIndex: number,
  rerolls: number
): ShopSlotOffer[] {
  const rng = new RNG(stockSeed(dayIndex, rerolls));
  const offers: ShopSlotOffer[] = [];
  for (let i = 0; i < SHOP_SLOT_COUNT; i++) {
    const slot =
      i < ITEM_SLOTS.length
        ? ITEM_SLOTS[i]
        : ITEM_SLOTS[rng.int(0, ITEM_SLOTS.length - 1)];
    const lineId = rng.pick(BASE_LINES_BY_SLOT[slot]);
    const quality: ShopQuality =
      rng.next() < SHOP_EPIC_CHANCE ? "epic" : "rare";
    offers.push({ slotIdx: i, lineId, slot, quality, price: SHOP_PRICES[quality] });
  }
  return offers;
}

/** Day rollover as a pure step: same day → the same object (identity is the
 *  "nothing changed" signal), new day → fresh bookkeeping. */
export function normalizeShopDay(shop: ShopState, todayIdx: number): ShopState {
  return shop.day === todayIdx
    ? shop
    : { day: todayIdx, rerolls: 0, bought: [] };
}

/** The structural slice the folds operate on — PlayerSave satisfies it. */
export interface ShopSaveSlice {
  gold: number;
  items: Record<string, number>;
  shop: ShopState;
}

/** Buy one shelf slot: normalize day → re-derive stock → gate (valid slot,
 *  unbought, affordable) → deduct gold, grant the item at 1★, mark bought.
 *  Pure and idempotent-per-state: a StrictMode re-run starts from the already-
 *  bought state and no-ops on the gate. Returns `save` unchanged when blocked. */
export function applyShopPurchase<S extends ShopSaveSlice>(
  save: S,
  todayIdx: number,
  slotIdx: number
): S {
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= SHOP_SLOT_COUNT) {
    return save;
  }
  const shop = normalizeShopDay(save.shop, todayIdx);
  if (shop.bought.includes(slotIdx)) return save;
  const offer = rollDailyStock(todayIdx, shop.rerolls)[slotIdx];
  if (save.gold < offer.price) return save;
  const key = makeItemKey(offer.lineId, offer.quality, 1);
  return {
    ...save,
    gold: save.gold - offer.price,
    items: { ...save.items, [key]: (save.items[key] ?? 0) + 1 },
    shop: { ...shop, bought: [...shop.bought, slotIdx] },
  };
}

/** Pay to re-roll the whole shelf. Only before the day's first purchase (a
 *  bought[] entry indexes into the CURRENT stock, so rerolling after a buy
 *  would relabel what "sold" points at), and only SHOP_REROLLS_PER_DAY times. */
export function applyShopReroll<S extends ShopSaveSlice>(
  save: S,
  todayIdx: number
): S {
  const shop = normalizeShopDay(save.shop, todayIdx);
  if (shop.rerolls >= SHOP_REROLLS_PER_DAY) return save;
  if (shop.bought.length > 0) return save;
  if (save.gold < SHOP_REROLL_COST) return save;
  return {
    ...save,
    gold: save.gold - SHOP_REROLL_COST,
    shop: { ...shop, rerolls: shop.rerolls + 1 },
  };
}

/** Defensive rebuild for migrateSave (the sanitizeItems twin): any junk →
 *  a valid ShopState. Unknown days are kept as-is (they just read as stale
 *  and normalize away on the next visit). */
export function sanitizeShop(raw: unknown): ShopState {
  const r = (raw ?? {}) as Partial<ShopState>;
  const day = Number.isInteger(r.day) ? (r.day as number) : -1;
  const rerollsRaw = Number(r.rerolls ?? 0);
  const rerolls = Number.isFinite(rerollsRaw)
    ? Math.min(SHOP_REROLLS_PER_DAY, Math.max(0, Math.floor(rerollsRaw)))
    : 0;
  const bought = Array.isArray(r.bought)
    ? [
        ...new Set(
          r.bought.filter(
            (n): n is number =>
              Number.isInteger(n) && n >= 0 && n < SHOP_SLOT_COUNT
          )
        ),
      ]
    : [];
  return { day, rerolls, bought };
}
