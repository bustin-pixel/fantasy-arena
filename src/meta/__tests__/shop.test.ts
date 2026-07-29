// Grubbins' shop specs — the stock roll is pure/seeded and the purchase and
// reroll folds are pure, so everything runs headlessly (the first meta-layer
// spec; the engine invariants suite is untouched by the shop).
import { describe, expect, it } from "vitest";
import {
  applyShopPurchase,
  applyShopReroll,
  dayIndexLocal,
  monthIndexLocal,
  weekIndexLocal,
  normalizeShopDay,
  rollDailyStock,
  SHOP_SLOT_COUNT,
  type ShopSaveSlice,
} from "@/meta/shop";
import {
  BASE_LINES_BY_SLOT,
  ITEM_LINES,
  ITEM_SLOTS,
  makeItemKey,
} from "@/data/items";
import {
  SHOP_PRICES,
  SHOP_REROLL_COST,
  SHOP_REROLLS_PER_DAY,
} from "@/meta/economy";

/** Arbitrary but FIXED day index — these specs are deterministic, never flaky. */
const DAY = 1_037_543;

const slice = (over: Partial<ShopSaveSlice> = {}): ShopSaveSlice => ({
  gold: 10_000,
  items: {},
  shop: { day: DAY, rerolls: 0, bought: [] },
  ...over,
});

describe("rollDailyStock", () => {
  it("is deterministic: same (day, rerolls) → identical offers", () => {
    expect(rollDailyStock(DAY, 0)).toEqual(rollDailyStock(DAY, 0));
    expect(rollDailyStock(DAY, 1)).toEqual(rollDailyStock(DAY, 1));
  });

  it("changes with the day and with a reroll", () => {
    expect(rollDailyStock(DAY, 0)).not.toEqual(rollDailyStock(DAY + 1, 0));
    expect(rollDailyStock(DAY, 0)).not.toEqual(rollDailyStock(DAY, 1));
  });

  it("guarantees one weapon/armor/trinket, plus a wildcard", () => {
    const offers = rollDailyStock(DAY, 0);
    expect(offers).toHaveLength(SHOP_SLOT_COUNT);
    expect(offers[0].slot).toBe("weapon");
    expect(offers[1].slot).toBe("armor");
    expect(offers[2].slot).toBe("trinket");
    expect(ITEM_SLOTS).toContain(offers[3].slot);
    offers.forEach((o, i) => expect(o.slotIdx).toBe(i));
  });

  it("only ever sells base-pool lines at rare/epic, priced from SHOP_PRICES", () => {
    // 200 consecutive days × both reroll streams: never a dungeon-signature
    // line, never legendary quality, price always matches the table.
    for (let d = DAY; d < DAY + 200; d++) {
      for (const rerolls of [0, 1]) {
        for (const o of rollDailyStock(d, rerolls)) {
          expect(BASE_LINES_BY_SLOT[o.slot]).toContain(o.lineId);
          expect(ITEM_LINES[o.lineId].dungeonId).toBeUndefined();
          expect(["rare", "epic"]).toContain(o.quality);
          expect(o.price).toBe(SHOP_PRICES[o.quality]);
          expect(ITEM_LINES[o.lineId].slot).toBe(o.slot);
        }
      }
    }
  });
});

describe("normalizeShopDay", () => {
  it("is identity on the same day (the 'nothing changed' signal)", () => {
    const shop = { day: DAY, rerolls: 1, bought: [2] };
    expect(normalizeShopDay(shop, DAY)).toBe(shop);
  });

  it("resets bookkeeping on a new day", () => {
    expect(
      normalizeShopDay({ day: DAY, rerolls: 1, bought: [0, 3] }, DAY + 1)
    ).toEqual({ day: DAY + 1, rerolls: 0, bought: [] });
  });
});

describe("applyShopPurchase", () => {
  it("deducts the exact price, grants the offer at 1★, and marks the slot", () => {
    const offer = rollDailyStock(DAY, 0)[0];
    const after = applyShopPurchase(slice(), DAY, 0);
    expect(after.gold).toBe(10_000 - offer.price);
    const key = makeItemKey(offer.lineId, offer.quality, 1);
    expect(after.items[key]).toBe(1);
    expect(after.shop).toEqual({ day: DAY, rerolls: 0, bought: [0] });
  });

  it("stacks onto an existing count", () => {
    const offer = rollDailyStock(DAY, 0)[1];
    const key = makeItemKey(offer.lineId, offer.quality, 1);
    const after = applyShopPurchase(slice({ items: { [key]: 2 } }), DAY, 1);
    expect(after.items[key]).toBe(3);
  });

  it("no-ops (identity) on a re-buy of the same slot", () => {
    const once = applyShopPurchase(slice(), DAY, 2);
    expect(applyShopPurchase(once, DAY, 2)).toBe(once);
  });

  it("no-ops when the player can't afford the offer", () => {
    const s = slice({ gold: 0 });
    expect(applyShopPurchase(s, DAY, 0)).toBe(s);
  });

  it("no-ops on junk slot indices", () => {
    const s = slice();
    for (const bad of [-1, SHOP_SLOT_COUNT, 1.5, Number.NaN]) {
      expect(applyShopPurchase(s, DAY, bad)).toBe(s);
    }
  });

  it("rolls a stale day forward: yesterday's 'sold' doesn't block today", () => {
    const s = slice({ shop: { day: DAY - 1, rerolls: 1, bought: [0, 1, 2, 3] } });
    const after = applyShopPurchase(s, DAY, 1);
    expect(after.shop.day).toBe(DAY);
    expect(after.shop.rerolls).toBe(0);
    expect(after.shop.bought).toEqual([1]);
  });

  it("buys from the CURRENT reroll stream, not the original", () => {
    const rerolled = applyShopReroll(slice(), DAY);
    const offer = rollDailyStock(DAY, 1)[0];
    const after = applyShopPurchase(rerolled, DAY, 0);
    expect(after.items[makeItemKey(offer.lineId, offer.quality, 1)]).toBe(1);
    expect(after.gold).toBe(10_000 - SHOP_REROLL_COST - offer.price);
  });
});

describe("applyShopReroll", () => {
  it("deducts the fee and bumps the reroll counter", () => {
    const after = applyShopReroll(slice(), DAY);
    expect(after.gold).toBe(10_000 - SHOP_REROLL_COST);
    expect(after.shop.rerolls).toBe(1);
    expect(after.shop.bought).toEqual([]);
  });

  it("no-ops past the per-day cap", () => {
    const once = applyShopReroll(slice(), DAY);
    expect(once.shop.rerolls).toBe(SHOP_REROLLS_PER_DAY);
    expect(applyShopReroll(once, DAY)).toBe(once);
  });

  it("no-ops after the day's first purchase (sold slots keep their meaning)", () => {
    const bought = applyShopPurchase(slice(), DAY, 0);
    expect(applyShopReroll(bought, DAY)).toBe(bought);
  });

  it("no-ops when unaffordable, and a new day resets the allowance", () => {
    const broke = slice({ gold: SHOP_REROLL_COST - 1 });
    expect(applyShopReroll(broke, DAY)).toBe(broke);
    const spent = applyShopReroll(slice(), DAY);
    const nextDay = applyShopReroll(spent, DAY + 1);
    expect(nextDay.shop).toEqual({ day: DAY + 1, rerolls: 1, bought: [] });
  });
});

describe("dayIndexLocal", () => {
  it("is stable within a local day and distinct across boundaries", () => {
    const morning = new Date(2026, 6, 9, 0, 0, 1);
    const night = new Date(2026, 6, 9, 23, 59, 59);
    const tomorrow = new Date(2026, 6, 10, 0, 0, 1);
    const monthEdgeA = new Date(2026, 0, 31);
    const monthEdgeB = new Date(2026, 1, 1);
    expect(dayIndexLocal(morning)).toBe(dayIndexLocal(night));
    expect(dayIndexLocal(morning)).not.toBe(dayIndexLocal(tomorrow));
    expect(dayIndexLocal(monthEdgeA)).not.toBe(dayIndexLocal(monthEdgeB));
  });
});

describe("weekIndexLocal", () => {
  it("anchors the boundary on Monday", () => {
    // 2026-07-26 is a Sunday; the 27th is the Monday that starts a new week.
    const sunday = new Date(2026, 6, 26, 23, 59, 59);
    const monday = new Date(2026, 6, 27, 0, 0, 1);
    expect(weekIndexLocal(sunday)).not.toBe(weekIndexLocal(monday));
    expect(weekIndexLocal(monday)).toBe(weekIndexLocal(sunday) + 1);
  });

  it("holds steady from Monday through the following Sunday", () => {
    const monday = new Date(2026, 6, 27);
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 6, 27 + i);
      expect(weekIndexLocal(d)).toBe(weekIndexLocal(monday));
    }
    expect(weekIndexLocal(new Date(2026, 7, 3))).toBe(
      weekIndexLocal(monday) + 1
    );
  });

  it("consecutive Mondays differ by exactly 1, across a month edge", () => {
    // The packed dayIndexLocal jumps at month ends; a real week count must not.
    expect(weekIndexLocal(new Date(2026, 6, 27))).toBe(
      weekIndexLocal(new Date(2026, 7, 3)) - 1
    );
  });

  it("a DST transition can't split a week", () => {
    // US DST springs forward Sun 2026-03-08 — mid-week for a Monday anchor.
    const monday = new Date(2026, 2, 2);
    const acrossDst = new Date(2026, 2, 8);
    expect(weekIndexLocal(acrossDst)).toBe(weekIndexLocal(monday));
  });
});

describe("monthIndexLocal", () => {
  it("is stable within a month and increments across the 1st", () => {
    expect(monthIndexLocal(new Date(2026, 6, 1))).toBe(
      monthIndexLocal(new Date(2026, 6, 31))
    );
    expect(monthIndexLocal(new Date(2026, 7, 1))).toBe(
      monthIndexLocal(new Date(2026, 6, 31)) + 1
    );
    // Year rollover stays contiguous.
    expect(monthIndexLocal(new Date(2027, 0, 1))).toBe(
      monthIndexLocal(new Date(2026, 11, 31)) + 1
    );
  });
});
