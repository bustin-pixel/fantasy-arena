// Inventory algebra specs — pure math, so assertions are exact. The invariant
// under test everywhere: references(loadouts, K) ≤ items[K].
import { describe, expect, it } from "vitest";
import {
  availableCount,
  canCombine,
  canEquip,
  combineFold,
  countReferences,
  mergeCost,
  sanitizeItems,
  sanitizeLoadouts,
  unitsLosingFuel,
  type InventorySlice,
} from "@/meta/inventory";
import { MERGE_COSTS } from "@/meta/economy";
import { makeItemKey, nextItemKey, parseItemKey } from "@/data/items";

const RARE1 = makeItemKey("soldiers_blade", "rare", 1);
const RARE3 = makeItemKey("soldiers_blade", "rare", 3);
const EPIC3 = makeItemKey("soldiers_blade", "epic", 3);
const LEG1 = makeItemKey("soldiers_blade", "legendary", 1);
const LEG3 = makeItemKey("soldiers_blade", "legendary", 3);
const ARMOR1 = makeItemKey("squires_plate", "rare", 1);

function slice(over: Partial<InventorySlice> = {}): InventorySlice {
  return { items: {}, loadouts: {}, gold: 100000, soulShards: 1000, ...over };
}

describe("item keys", () => {
  it("parse round-trips and rejects garbage", () => {
    expect(parseItemKey(RARE1)?.line.id).toBe("soldiers_blade");
    expect(parseItemKey(RARE1)?.quality).toBe("rare");
    expect(parseItemKey(RARE1)?.star).toBe(1);
    for (const bad of [
      "",
      "soldiers_blade",
      "soldiers_blade:rare",
      "soldiers_blade:rare:0",
      "soldiers_blade:rare:4",
      "soldiers_blade:common:1",
      "not_a_line:rare:1",
      "soldiers_blade:rare:1:extra",
    ]) {
      expect(parseItemKey(bad)).toBeNull();
    }
  });

  it("nextItemKey walks the full ladder: stars, then quality, capping at legendary 3★", () => {
    expect(nextItemKey(RARE1)).toBe(makeItemKey("soldiers_blade", "rare", 2));
    expect(nextItemKey(RARE3)).toBe(makeItemKey("soldiers_blade", "epic", 1));
    expect(nextItemKey(EPIC3)).toBe(LEG1);
    expect(nextItemKey(LEG3)).toBeNull();
  });
});

describe("mergeCost", () => {
  it("charges gold for rare/epic star-ups and the rare→epic quality-up", () => {
    expect(mergeCost(RARE1)).toEqual({ gold: MERGE_COSTS.rare.gold[0], shards: 0 });
    expect(mergeCost(RARE3)).toEqual({ gold: MERGE_COSTS.rare.gold[2], shards: 0 });
    expect(mergeCost(makeItemKey("soldiers_blade", "epic", 1))).toEqual({
      gold: MERGE_COSTS.epic.gold[0],
      shards: 0,
    });
  });

  it("charges Soul Shards for everything legendary-tier", () => {
    // epic 3★ → legendary is the shard gate…
    expect(mergeCost(EPIC3)).toEqual({ gold: 0, shards: MERGE_COSTS.epic.shards[2] });
    // …and legendary star-ups stay premium.
    expect(mergeCost(LEG1)).toEqual({ gold: 0, shards: MERGE_COSTS.legendary.shards[0] });
  });

  it("returns null at the legendary 3★ cap and for invalid keys", () => {
    expect(mergeCost(LEG3)).toBeNull();
    expect(mergeCost("nonsense:rare:1")).toBeNull();
  });
});

describe("canCombine", () => {
  it("needs two copies, the fee, and headroom on the ladder", () => {
    expect(canCombine(slice({ items: { [RARE1]: 2 } }), RARE1)).toEqual({ ok: true });
    expect(canCombine(slice({ items: { [RARE1]: 1 } }), RARE1)).toEqual({
      ok: false,
      reason: "copies",
    });
    expect(
      canCombine(slice({ items: { [RARE1]: 2 }, gold: 0 }), RARE1)
    ).toEqual({ ok: false, reason: "gold" });
    expect(
      canCombine(slice({ items: { [EPIC3]: 2 }, soulShards: 0 }), EPIC3)
    ).toEqual({ ok: false, reason: "shards" });
    expect(canCombine(slice({ items: { [LEG3]: 2 } }), LEG3)).toEqual({
      ok: false,
      reason: "capped",
    });
    expect(canCombine(slice(), "junk:key:1")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("combineFold", () => {
  it("star-up: consumes 2, adds 1 of the next star, deducts gold", () => {
    const before = slice({ items: { [RARE1]: 3 }, gold: 500 });
    const after = combineFold(before, RARE1);
    expect(after.items[RARE1]).toBe(1);
    expect(after.items[makeItemKey("soldiers_blade", "rare", 2)]).toBe(1);
    expect(after.gold).toBe(500 - MERGE_COSTS.rare.gold[0]);
    expect(after.soulShards).toBe(before.soulShards);
    // Pure: the input slice is untouched.
    expect(before.items[RARE1]).toBe(3);
  });

  it("quality-up: two 3★ become the next quality at 1★ (and shards gate legendary)", () => {
    const after = combineFold(slice({ items: { [EPIC3]: 2 }, soulShards: 100 }), EPIC3);
    expect(after.items[EPIC3]).toBeUndefined(); // stack emptied and pruned
    expect(after.items[LEG1]).toBe(1);
    expect(after.soulShards).toBe(100 - MERGE_COSTS.epic.shards[2]);
  });

  it("no-ops (returns the same slice) when blocked", () => {
    const s = slice({ items: { [RARE1]: 1 } });
    expect(combineFold(s, RARE1)).toBe(s);
    const capped = slice({ items: { [LEG3]: 2 } });
    expect(combineFold(capped, LEG3)).toBe(capped);
  });

  it("equipped fuel: the merged result stays equipped on the (first) unit", () => {
    const before = slice({
      items: { [RARE1]: 2 },
      loadouts: { knight: { weapon: RARE1 } },
    });
    expect(unitsLosingFuel(before, RARE1)).toEqual(["knight"]);
    const after = combineFold(before, RARE1);
    const rare2 = makeItemKey("soldiers_blade", "rare", 2);
    expect(after.loadouts.knight.weapon).toBe(rare2);
    expect(after.items[rare2]).toBe(1);
    expect(after.items[RARE1]).toBeUndefined();
    expect(countReferences(after.loadouts, rare2)).toBeLessThanOrEqual(
      after.items[rare2]
    );
  });

  it("double-orphan: both fuel copies equipped → first unit upgraded, second cleared", () => {
    const before = slice({
      items: { [RARE1]: 2 },
      loadouts: {
        ogre: { weapon: RARE1 },
        archer: { weapon: RARE1 },
      },
    });
    expect(unitsLosingFuel(before, RARE1)).toEqual(["archer", "ogre"]);
    const after = combineFold(before, RARE1);
    const rare2 = makeItemKey("soldiers_blade", "rare", 2);
    // Sorted defId order: "archer" < "ogre" — archer keeps gear (upgraded).
    expect(after.loadouts.archer.weapon).toBe(rare2);
    expect(after.loadouts.ogre.weapon).toBeUndefined();
  });

  it("spare copies protect equipped gear (no warning, no repair)", () => {
    const before = slice({
      items: { [RARE1]: 3 },
      loadouts: { knight: { weapon: RARE1 } },
    });
    expect(unitsLosingFuel(before, RARE1)).toEqual([]);
    const after = combineFold(before, RARE1);
    expect(after.loadouts.knight.weapon).toBe(RARE1);
    expect(after.items[RARE1]).toBe(1);
  });
});

describe("equip helpers", () => {
  it("availableCount subtracts equipped references", () => {
    const items = { [RARE1]: 2 };
    const loadouts = { knight: { weapon: RARE1 } };
    expect(availableCount(items, loadouts, RARE1)).toBe(1);
    expect(
      availableCount(items, { ...loadouts, ogre: { weapon: RARE1 } }, RARE1)
    ).toBe(0);
  });

  it("canEquip: needs a free copy, but re-equipping your own item is fine", () => {
    const s = slice({
      items: { [RARE1]: 1 },
      loadouts: { knight: { weapon: RARE1 } },
    });
    expect(canEquip(s, "ogre", RARE1)).toBe(false); // knight holds the only copy
    expect(canEquip(s, "knight", RARE1)).toBe(true); // no-op re-equip
    expect(canEquip(slice({ items: { [ARMOR1]: 1 } }), "ogre", ARMOR1)).toBe(true);
    expect(canEquip(slice(), "ogre", "junk:rare:1")).toBe(false);
  });
});

describe("sanitizers", () => {
  it("sanitizeItems keeps only parseable keys with positive integer counts", () => {
    expect(
      sanitizeItems({
        [RARE1]: 3,
        [LEG3]: 1.9, // floors to 1
        "bad:key:1": 5,
        [ARMOR1]: -2,
        [EPIC3]: "12",
      })
    ).toEqual({ [RARE1]: 3, [LEG3]: 1, [EPIC3]: 12 });
    expect(sanitizeItems(null)).toEqual({});
    expect(sanitizeItems("garbage")).toEqual({});
  });

  it("sanitizeLoadouts enforces unit ids, slot types, and the reference invariant", () => {
    const items = { [RARE1]: 1, [ARMOR1]: 1 };
    const raw = {
      knight: { weapon: RARE1, armor: ARMOR1 },
      ogre: { weapon: RARE1 }, // over-referenced: only 1 copy exists
      ghost_unit: { weapon: RARE1 },
      archer: { weapon: ARMOR1 }, // armor in a weapon slot → dropped
    };
    const out = sanitizeLoadouts(raw, items, ["knight", "ogre", "archer"]);
    expect(out.knight).toEqual({ weapon: RARE1, armor: ARMOR1 });
    expect(out.ogre).toBeUndefined();
    expect(out.ghost_unit).toBeUndefined();
    expect(out.archer).toBeUndefined();
    expect(countReferences(out, RARE1)).toBeLessThanOrEqual(items[RARE1]);
  });
});
