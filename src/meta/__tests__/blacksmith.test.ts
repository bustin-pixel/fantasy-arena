// ============================================================================
// Blacksmith specs — salvage / commission / forge-all folds, plus the economy
// guardrails as executable spec (the SALVAGE_GOLD table rules from economy.ts:
// monotone in power order, below every acquisition price, and the no-pump
// inequality so merge fees always evaporate). The Blacksmith is STATELESS —
// these folds touch only gold/soulShards/items/loadouts, so there is no
// migration case here and persistence.test.ts stays untouched.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  BASE_LINES_BY_SLOT,
  ITEM_LINES,
  ITEM_QUALITIES,
  MAX_STARS,
  makeItemKey,
  nextItemKey,
  parseItemKey,
} from "@/data/items";
import {
  COMMISSION_PRICE,
  MERGE_COSTS,
  SALVAGE_GOLD,
  SHOP_PRICES,
} from "@/meta/economy";
import type { InventorySlice } from "@/meta/inventory";
import { countReferences } from "@/meta/inventory";
import {
  COMMISSION_QUALITY,
  COMMISSION_STAR,
  canCommission,
  canSalvage,
  commissionFold,
  commissionManyFold,
  forgeAllFold,
  forgeableStackCount,
  maxCommission,
  planForgeAll,
  salvageFold,
  salvageValue,
} from "@/meta/blacksmith";

// Base-pool line ids, derived from data so renames can't rot the spec.
const W1 = BASE_LINES_BY_SLOT.weapon[0];
const W2 = BASE_LINES_BY_SLOT.weapon[1];
const A1 = BASE_LINES_BY_SLOT.armor[0];
const SIGNATURE = Object.values(ITEM_LINES).find((l) => l.dungeonId)!.id;

const R1 = makeItemKey(W1, "rare", 1);
const R2 = makeItemKey(W1, "rare", 2);
const R3 = makeItemKey(W1, "rare", 3);
const E3 = makeItemKey(W1, "epic", 3);
const L1 = makeItemKey(W1, "legendary", 1);

const slice = (over: Partial<InventorySlice> = {}): InventorySlice => ({
  items: {},
  loadouts: {},
  gold: 0,
  soulShards: 0,
  ...over,
});

describe("salvage", () => {
  it("pays exactly the SALVAGE_GOLD table for every quality/star", () => {
    for (const q of ITEM_QUALITIES) {
      for (let s = 1; s <= MAX_STARS; s++) {
        expect(salvageValue(makeItemKey(W1, q, s))).toBe(SALVAGE_GOLD[q][s - 1]);
      }
    }
    expect(salvageValue("garbage:key:9")).toBeNull();
  });

  it("removes one copy, deletes the stack at zero, grants the gold", () => {
    const s0 = slice({ items: { [R1]: 2 }, gold: 10 });
    const s1 = salvageFold(s0, R1);
    expect(s1.items[R1]).toBe(1);
    expect(s1.gold).toBe(10 + SALVAGE_GOLD.rare[0]);
    const s2 = salvageFold(s1, R1);
    expect(R1 in s2.items).toBe(false);
    expect(s2.gold).toBe(10 + 2 * SALVAGE_GOLD.rare[0]);
  });

  it("never touches loadouts (same reference through the fold)", () => {
    const loadouts = { knight: { weapon: R1 } };
    const s0 = slice({ items: { [R1]: 2 }, loadouts });
    const s1 = salvageFold(s0, R1);
    expect(s1.loadouts).toBe(loadouts);
  });

  it("no-ops (same reference) on invalid keys and missing stacks", () => {
    const s0 = slice({ items: { [R1]: 1 } });
    expect(salvageFold(s0, "not:a:key")).toBe(s0);
    expect(salvageFold(s0, R2)).toBe(s0);
  });

  it("refuses to melt a copy a unit is wearing", () => {
    const s0 = slice({ items: { [R1]: 1 }, loadouts: { knight: { weapon: R1 } } });
    expect(canSalvage(s0, R1)).toEqual({ ok: false, reason: "equipped" });
    expect(salvageFold(s0, R1)).toBe(s0);

    // A second (free) copy melts fine, and the invariant holds after.
    const s1 = slice({ items: { [R1]: 2 }, loadouts: { knight: { weapon: R1 } } });
    const s2 = salvageFold(s1, R1);
    expect(s2.items[R1]).toBe(1);
    expect(countReferences(s2.loadouts, R1)).toBeLessThanOrEqual(s2.items[R1]);
  });
});

describe("salvage economy guardrails (executable spec)", () => {
  const ladder = [
    ...SALVAGE_GOLD.rare,
    ...SALVAGE_GOLD.epic,
    ...SALVAGE_GOLD.legendary,
  ];

  it("is monotone in power order", () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it("sits strictly below every acquisition price", () => {
    expect(SALVAGE_GOLD.rare[0]).toBeLessThan(SHOP_PRICES.rare);
    expect(SALVAGE_GOLD.epic[0]).toBeLessThan(SHOP_PRICES.epic);
    expect(SALVAGE_GOLD.rare[0]).toBeLessThan(COMMISSION_PRICE);
  });

  it("never lets a merge mint melt value: salvage(next) ≤ 2·salvage(cur) + goldFee", () => {
    for (const q of ITEM_QUALITIES) {
      for (let s = 1; s <= MAX_STARS; s++) {
        const key = makeItemKey(W1, q, s);
        const next = nextItemKey(key);
        if (!next) continue; // legendary 3★ cap
        const p = parseItemKey(next)!;
        const cur = SALVAGE_GOLD[q][s - 1];
        const nextVal = SALVAGE_GOLD[p.quality][p.star - 1];
        const fee = {
          gold: MERGE_COSTS[q].gold[s - 1],
          shards: MERGE_COSTS[q].shards[s - 1],
        };
        expect(nextVal).toBeLessThanOrEqual(2 * cur + fee.gold);
        if (nextVal === 2 * cur + fee.gold) {
          // Gold-equality is only tolerable when shards burn on the rung.
          expect(fee.shards).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("commission", () => {
  it("deducts the flat price and grants exactly lineId:rare:1, stacking", () => {
    const key = makeItemKey(W1, COMMISSION_QUALITY, COMMISSION_STAR);
    const s0 = slice({ items: { [key]: 2 }, gold: COMMISSION_PRICE + 50 });
    const s1 = commissionFold(s0, W1);
    expect(s1.gold).toBe(50);
    expect(s1.items[key]).toBe(3);
  });

  it("no-ops when broke or the line is unknown", () => {
    const broke = slice({ gold: COMMISSION_PRICE - 1 });
    expect(canCommission(broke, W1)).toEqual({ ok: false, reason: "gold" });
    expect(commissionFold(broke, W1)).toBe(broke);
    const rich = slice({ gold: 99999 });
    expect(commissionFold(rich, "no_such_line")).toBe(rich);
  });

  it("refuses every dungeon-signature line", () => {
    const rich = slice({ gold: 99999 });
    for (const line of Object.values(ITEM_LINES)) {
      if (!line.dungeonId) continue;
      expect(canCommission(rich, line.id)).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(commissionFold(rich, line.id)).toBe(rich);
    }
    expect(ITEM_LINES[SIGNATURE].dungeonId).toBeTruthy(); // the loop ran
  });

  it("bulk-commissions N copies atomically, deducting N × price", () => {
    const key = makeItemKey(W1, COMMISSION_QUALITY, COMMISSION_STAR);
    const s0 = slice({ items: { [key]: 1 }, gold: COMMISSION_PRICE * 5 + 10 });
    const s1 = commissionManyFold(s0, W1, 3);
    expect(s1.items[key]).toBe(4); // 1 owned + 3 forged
    expect(s1.gold).toBe(COMMISSION_PRICE * 2 + 10);
  });

  it("clamps bulk qty to what gold affords — never overdraws", () => {
    const key = makeItemKey(W1, COMMISSION_QUALITY, COMMISSION_STAR);
    const s0 = slice({ gold: COMMISSION_PRICE * 2 });
    expect(maxCommission(s0)).toBe(2);
    const s1 = commissionManyFold(s0, W1, 99);
    expect(s1.items[key]).toBe(2);
    expect(s1.gold).toBe(0);
  });

  it("bulk no-ops (same ref) on qty ≤ 0, signature lines, and when broke", () => {
    const rich = slice({ gold: 99999 });
    expect(commissionManyFold(rich, W1, 0)).toBe(rich);
    expect(commissionManyFold(rich, W1, -3)).toBe(rich);
    expect(commissionManyFold(rich, SIGNATURE, 3)).toBe(rich);
    const broke = slice({ gold: COMMISSION_PRICE - 1 });
    expect(commissionManyFold(broke, W1, 5)).toBe(broke);
  });
});

describe("forge all", () => {
  it("chains gold-only merges to fixpoint (4× rare 1★ → one rare 3★)", () => {
    const s0 = slice({ items: { [R1]: 4 }, gold: 1000 });
    const plan = planForgeAll(s0);
    const s1 = forgeAllFold(s0);
    expect(s1.items).toEqual({ [R3]: 1 });
    // two 1★ merges (100g each) + one 2★ merge (200g)
    expect(s1.gold).toBe(600);
    expect(plan.steps.length).toBe(3);
    expect(plan.totalGold).toBe(400);
    expect(plan.totalGold).toBe(s0.gold - s1.gold);
  });

  it("never auto-spends shards: shard-fee stacks stay untouched", () => {
    const s0 = slice({
      items: { [R1]: 2, [E3]: 2, [L1]: 2 },
      gold: 100000,
      soulShards: 999,
    });
    const s1 = forgeAllFold(s0);
    expect(s1.items[E3]).toBe(2); // epic 3★ → legendary costs shards
    expect(s1.items[L1]).toBe(2); // legendary star-ups cost shards
    expect(s1.soulShards).toBe(999);
    expect(s1.items[R2]).toBe(1); // the gold merge still happened
  });

  it("stops deterministically when gold runs dry mid-walk", () => {
    const s0 = slice({ items: { [R1]: 4 }, gold: 100 });
    const s1 = forgeAllFold(s0);
    expect(s1.items).toEqual({ [R1]: 2, [R2]: 1 });
    expect(s1.gold).toBe(0);
    expect(planForgeAll(s0).steps.length).toBe(1);
  });

  it("is independent of items-key insertion order", () => {
    const k1 = makeItemKey(W1, "rare", 1);
    const k2 = makeItemKey(W2, "rare", 1);
    // Gold for exactly one merge — canonical order must pick the same winner.
    const a = slice({ items: { [k1]: 2, [k2]: 2 }, gold: 100 });
    const b = slice({ items: { [k2]: 2, [k1]: 2 }, gold: 100 });
    expect(forgeAllFold(a)).toEqual(forgeAllFold(b));
    expect(planForgeAll(a)).toEqual(planForgeAll(b));
    expect(forgeAllFold(a)).toEqual(forgeAllFold(a)); // and deterministic
  });

  it("flags equipped fuel and keeps the upgrade equipped (repair pass)", () => {
    const bare = slice({ items: { [R1]: 2 }, gold: 100 });
    expect(planForgeAll(bare).touchesEquipped).toBe(false);

    const worn = slice({
      items: { [R1]: 2 },
      loadouts: { knight: { weapon: R1 } },
      gold: 100,
    });
    expect(planForgeAll(worn).touchesEquipped).toBe(true);
    const s1 = forgeAllFold(worn);
    expect(s1.items).toEqual({ [R2]: 1 });
    expect(s1.loadouts.knight.weapon).toBe(R2);
    expect(countReferences(s1.loadouts, R2)).toBeLessThanOrEqual(s1.items[R2]);
  });

  it("no-ops (same reference) when nothing is forgeable", () => {
    const s0 = slice({ items: { [R1]: 1 }, gold: 99999 });
    expect(forgeAllFold(s0)).toBe(s0);
    expect(planForgeAll(s0).steps.length).toBe(0);
  });
});

describe("forgeableStackCount (the FAB pip)", () => {
  it("counts distinct stacks with an OK merge right now", () => {
    const a1 = makeItemKey(A1, "rare", 1);
    expect(
      forgeableStackCount(slice({ items: { [R1]: 2, [a1]: 2 }, gold: 100 }))
    ).toBe(2);
    expect(
      forgeableStackCount(slice({ items: { [R1]: 2, [a1]: 2 }, gold: 99 }))
    ).toBe(0);
    expect(forgeableStackCount(slice({ items: { [R1]: 1 }, gold: 999 }))).toBe(0);
  });
});
