// ============================================================================
// Inventory algebra — pure functions over the items/loadouts save slices.
// The inventory is STACK COUNTS keyed by ItemKey ("lineId:quality:star");
// loadouts REFERENCE keys. The one invariant everything preserves:
//
//     references(loadouts, K) ≤ items[K]   for every key K
//
// (equipped copies are counted inside items — they are not moved out).
// GameStateContext wraps these in setSave folds; Vitest exercises them
// headlessly. No React, no engine, no persistence imports (NOTES §7).
// ============================================================================

import type { ItemLoadouts, ItemSlot } from "@/types";
import {
  ITEM_QUALITIES,
  MAX_STARS,
  nextItemKey,
  parseItemKey,
  type ItemKey,
} from "@/data/items";
import { MERGE_COSTS } from "./economy";

/** The save fields the algebra reads/writes (a structural subset of
 *  PlayerSave, so folds can pass the whole save). */
export interface InventorySlice {
  items: Record<string, number>;
  loadouts: ItemLoadouts;
  gold: number;
  soulShards: number;
}

/** How many loadout slots reference `key` across all units. */
export function countReferences(loadouts: ItemLoadouts, key: ItemKey): number {
  let n = 0;
  for (const defId of Object.keys(loadouts)) {
    const l = loadouts[defId];
    if (l.weapon === key) n++;
    if (l.armor === key) n++;
    if (l.trinket === key) n++;
  }
  return n;
}

/** Copies of `key` NOT currently equipped anywhere. */
export function availableCount(
  items: Record<string, number>,
  loadouts: ItemLoadouts,
  key: ItemKey
): number {
  return Math.max(0, (items[key] ?? 0) - countReferences(loadouts, key));
}

/** The fee to merge two `key` copies, or null when unmergeable (invalid key
 *  or the legendary 3★ cap). */
export function mergeCost(
  key: ItemKey
): { gold: number; shards: number } | null {
  const p = parseItemKey(key);
  if (!p || nextItemKey(key) == null) return null;
  const fees = MERGE_COSTS[p.quality];
  return { gold: fees.gold[p.star - 1], shards: fees.shards[p.star - 1] };
}

export type CombineBlock = "invalid" | "capped" | "copies" | "gold" | "shards";

/** Whether a merge of two `key` copies can proceed right now. */
export function canCombine(
  slice: InventorySlice,
  key: ItemKey
): { ok: true } | { ok: false; reason: CombineBlock } {
  const p = parseItemKey(key);
  if (!p) return { ok: false, reason: "invalid" };
  if (nextItemKey(key) == null) return { ok: false, reason: "capped" };
  if ((slice.items[key] ?? 0) < 2) return { ok: false, reason: "copies" };
  const cost = mergeCost(key)!;
  if (slice.gold < cost.gold) return { ok: false, reason: "gold" };
  if (slice.soulShards < cost.shards) return { ok: false, reason: "shards" };
  return { ok: true };
}

/** The unit defIds (sorted) whose equipped copy of `key` a merge would
 *  consume — non-empty means the Bag shows the "fuel is equipped" warning.
 *  The FIRST listed unit keeps gear: it receives the merged result. */
export function unitsLosingFuel(
  slice: InventorySlice,
  key: ItemKey
): string[] {
  const owned = slice.items[key] ?? 0;
  const keepCount = Math.max(0, owned - 2);
  const holders = Object.keys(slice.loadouts)
    .filter((defId) => {
      const l = slice.loadouts[defId];
      return l.weapon === key || l.armor === key || l.trinket === key;
    })
    .sort();
  return holders.length > keepCount ? holders.slice(keepCount) : [];
}

const slotOf = (key: ItemKey): ItemSlot | null =>
  parseItemKey(key)?.line.slot ?? null;

/** The merge fold: consume two copies of `key`, add one `nextItemKey(key)`,
 *  deduct the fee, then repair any orphaned loadout references — the first
 *  orphaned unit (sorted defId) gets the RESULT in the same slot ("the merged
 *  result stays equipped"), further orphans have the slot cleared. Pure:
 *  returns a NEW slice, or the input slice unchanged when the merge can't
 *  proceed (the purchaseUnit no-op pattern). */
export function combineFold(
  slice: InventorySlice,
  key: ItemKey
): InventorySlice {
  if (!canCombine(slice, key).ok) return slice;
  const result = nextItemKey(key)!;
  const cost = mergeCost(key)!;

  const items = { ...slice.items };
  items[key] = (items[key] ?? 0) - 2;
  if (items[key] <= 0) delete items[key];
  items[result] = (items[result] ?? 0) + 1;

  // Repair pass: keep the first `items[key]` references, upgrade the next
  // orphan to the result (if a result copy is free), clear the rest.
  const loadouts: ItemLoadouts = {};
  for (const defId of Object.keys(slice.loadouts)) {
    loadouts[defId] = { ...slice.loadouts[defId] };
  }
  const slot = slotOf(key);
  let keepLeft = items[key] ?? 0;
  let resultFree =
    (items[result] ?? 0) - countReferences(loadouts, result);
  if (slot) {
    for (const defId of Object.keys(loadouts).sort()) {
      if (loadouts[defId][slot] !== key) continue;
      if (keepLeft > 0) {
        keepLeft--;
      } else if (resultFree > 0) {
        loadouts[defId][slot] = result;
        resultFree--;
      } else {
        delete loadouts[defId][slot];
      }
    }
  }

  return {
    items,
    loadouts,
    gold: slice.gold - cost.gold,
    soulShards: slice.soulShards - cost.shards,
  };
}

/** Whether `defId` may equip `key` right now (valid key, a free copy — or the
 *  unit already wears it in that slot, which a re-equip no-ops). */
export function canEquip(
  slice: InventorySlice,
  defId: string,
  key: ItemKey
): boolean {
  const p = parseItemKey(key);
  if (!p) return false;
  if (slice.loadouts[defId]?.[p.line.slot] === key) return true;
  return availableCount(slice.items, slice.loadouts, key) >= 1;
}

// ---------------------------------------------------------------------------
// Save sanitizers — defensive rebuilds for migrateSave (hand-edited or
// corrupted payloads must never violate the invariant).
// ---------------------------------------------------------------------------

const MAX_STACK = 9999;

/** Rebuild an items map from untrusted data: parseable keys only, positive
 *  integer counts (clamped). */
export function sanitizeItems(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw == null || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!parseItemKey(key)) continue;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[key] = Math.min(MAX_STACK, n);
  }
  return out;
}

/** Rebuild loadouts from untrusted data: known unit ids only, keys must parse
 *  and match their slot's type, and references are trimmed (sorted defId
 *  order) so they never exceed the sanitized item counts. */
export function sanitizeLoadouts(
  raw: unknown,
  items: Record<string, number>,
  validUnitIds: readonly string[]
): ItemLoadouts {
  const out: ItemLoadouts = {};
  if (raw == null || typeof raw !== "object") return out;
  const valid = new Set(validUnitIds);
  const used: Record<string, number> = {};
  for (const defId of Object.keys(raw as Record<string, unknown>).sort()) {
    if (!valid.has(defId)) continue;
    const entry = (raw as Record<string, unknown>)[defId];
    if (entry == null || typeof entry !== "object") continue;
    const loadout: ItemLoadouts[string] = {};
    for (const slot of ["weapon", "armor", "trinket"] as const) {
      const key = (entry as Record<string, unknown>)[slot];
      if (typeof key !== "string") continue;
      const p = parseItemKey(key);
      if (!p || p.line.slot !== slot) continue;
      if ((used[key] ?? 0) >= (items[key] ?? 0)) continue; // over-referenced
      loadout[slot] = key;
      used[key] = (used[key] ?? 0) + 1;
    }
    if (loadout.weapon || loadout.armor || loadout.trinket) out[defId] = loadout;
  }
  return out;
}

// Re-exported so state/UI code can reach the ladder shape without importing
// data/items everywhere.
export { ITEM_QUALITIES, MAX_STARS };
