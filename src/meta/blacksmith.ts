// ============================================================================
// The Blacksmith — smith services as pure meta folds over the inventory
// algebra. STATELESS by design: everything here reads/writes only existing
// save fields (gold / soulShards / items / loadouts), so there is no
// BlacksmithState, no save-version bump, and nothing for migrateSave to do.
// Services: SALVAGE (melt one free copy into gold), COMMISSION (buy a chosen
// base line at rare 1★, no RNG), and FORGE ALL (chain every GOLD-only merge
// to fixpoint — shard fees are never auto-spent; legendary-tier merges stay
// a deliberate manual act). Acquisition numbers live in meta/economy.ts.
// meta/ never imports state/, engine/, or React (the shop.ts discipline);
// folds take a structural slice and are StrictMode-safe (no-op → same ref).
// ============================================================================

import {
  ITEM_LINES,
  ITEM_QUALITIES,
  makeItemKey,
  nextItemKey,
  parseItemKey,
  type ItemKey,
  type ItemQuality,
} from "@/data/items";
import {
  availableCount,
  canCombine,
  combineFold,
  mergeCost,
  unitsLosingFuel,
  type InventorySlice,
} from "./inventory";
import { COMMISSION_PRICE, SALVAGE_GOLD } from "./economy";

// ---------------------------------------------------------------------------
// Salvage — melt ONE free (unequipped) copy into gold.
// ---------------------------------------------------------------------------

export type SalvageBlock = "invalid" | "none" | "equipped";

/** Gold returned for melting one copy of `key`; null for malformed keys. */
export function salvageValue(key: ItemKey): number | null {
  const p = parseItemKey(key);
  if (!p) return null;
  return SALVAGE_GOLD[p.quality][p.star - 1];
}

/** Whether one copy of `key` can be melted right now. `equipped` means every
 *  owned copy is worn — the smith never rips gear off a unit's back. */
export function canSalvage(
  slice: InventorySlice,
  key: ItemKey
): { ok: true } | { ok: false; reason: SalvageBlock } {
  if (!parseItemKey(key)) return { ok: false, reason: "invalid" };
  if ((slice.items[key] ?? 0) < 1) return { ok: false, reason: "none" };
  if (availableCount(slice.items, slice.loadouts, key) < 1) {
    return { ok: false, reason: "equipped" };
  }
  return { ok: true };
}

/** The salvage fold: remove one copy (delete the stack at 0), add the gold.
 *  Loadouts are untouched — the free-copy gate preserves references ≤ counts
 *  by construction. Returns `save` unchanged when blocked. */
export function salvageFold<S extends InventorySlice>(save: S, key: ItemKey): S {
  if (!canSalvage(save, key).ok) return save;
  const items = { ...save.items };
  items[key] = (items[key] ?? 0) - 1;
  if (items[key] <= 0) delete items[key];
  return { ...save, items, gold: save.gold + salvageValue(key)! };
}

// ---------------------------------------------------------------------------
// Commission — pay gold, receive a CHOSEN base-pool line at rare 1★. No RNG,
// so there is nothing to roll-before-fold; dungeon-signature lines stay a
// dungeon achievement (excluded exactly like the shop's pool).
// ---------------------------------------------------------------------------

export const COMMISSION_QUALITY: ItemQuality = "rare";
export const COMMISSION_STAR = 1;

export type CommissionBlock = "invalid" | "gold";

/** Whether `lineId` can be commissioned right now. `invalid` covers unknown
 *  lines AND dungeon-signature lines (never craftable). */
export function canCommission(
  slice: InventorySlice,
  lineId: string
): { ok: true } | { ok: false; reason: CommissionBlock } {
  const line = ITEM_LINES[lineId];
  if (!line || line.dungeonId) return { ok: false, reason: "invalid" };
  if (slice.gold < COMMISSION_PRICE) return { ok: false, reason: "gold" };
  return { ok: true };
}

/** The commission fold: deduct the flat price, grant one rare 1★ of the line.
 *  Returns `save` unchanged when blocked. */
export function commissionFold<S extends InventorySlice>(
  save: S,
  lineId: string
): S {
  if (!canCommission(save, lineId).ok) return save;
  const key = makeItemKey(lineId, COMMISSION_QUALITY, COMMISSION_STAR);
  return {
    ...save,
    gold: save.gold - COMMISSION_PRICE,
    items: { ...save.items, [key]: (save.items[key] ?? 0) + 1 },
  };
}

/** How many commissions the current gold affords right now (0..). Drives the
 *  bulk stepper's ceiling and its "Max" button. */
export function maxCommission(slice: InventorySlice): number {
  return Math.floor(slice.gold / COMMISSION_PRICE);
}

/** Bulk commission: grant `qty` copies of `lineId` at rare 1★ in one atomic
 *  fold, deducting `qty × price`. `qty` is clamped to what gold affords (and to
 *  ≥0), so the fold can never overdraw. Returns `save` unchanged when the line
 *  is invalid/dungeon-signature or the clamped quantity is 0. */
export function commissionManyFold<S extends InventorySlice>(
  save: S,
  lineId: string,
  qty: number
): S {
  const line = ITEM_LINES[lineId];
  if (!line || line.dungeonId) return save;
  const n = Math.min(Math.max(0, Math.floor(qty)), maxCommission(save));
  if (n <= 0) return save;
  const key = makeItemKey(lineId, COMMISSION_QUALITY, COMMISSION_STAR);
  return {
    ...save,
    gold: save.gold - COMMISSION_PRICE * n,
    items: { ...save.items, [key]: (save.items[key] ?? 0) + n },
  };
}

// ---------------------------------------------------------------------------
// Forge All — every gold-only merge, chained to fixpoint. One private walk
// powers both the dry-run plan (button label / confirm panel) and the fold,
// so what the preview shows is exactly what the commit does.
// ---------------------------------------------------------------------------

export interface ForgeStep {
  from: ItemKey;
  to: ItemKey;
  gold: number;
}

export interface ForgeAllPlan {
  steps: ForgeStep[];
  totalGold: number;
  /** True when some step consumes a copy a unit is wearing (the repair pass
   *  keeps upgrades equipped where possible — same rules as a single Forge). */
  touchesEquipped: boolean;
}

/** Declaration index per line id — the canonical tiebreak, matching the order
 *  lines are defined in data/items.ts (and thus the UI's grouping order). */
const LINE_IDX: Record<string, number> = {};
Object.keys(ITEM_LINES).forEach((id, i) => (LINE_IDX[id] = i));

/** The stack keys in canonical walk order: quality asc → star asc → line
 *  declaration order. Explicitly sorted — never Object.keys insertion order,
 *  which save round-trips reshuffle. */
function canonicalKeys(items: Record<string, number>): ItemKey[] {
  return Object.keys(items)
    .map((k) => ({ k, p: parseItemKey(k) }))
    .filter((x): x is { k: ItemKey; p: NonNullable<ReturnType<typeof parseItemKey>> } => x.p != null)
    .sort(
      (a, b) =>
        ITEM_QUALITIES.indexOf(a.p.quality) - ITEM_QUALITIES.indexOf(b.p.quality) ||
        a.p.star - b.p.star ||
        LINE_IDX[a.p.lineId] - LINE_IDX[b.p.lineId]
    )
    .map((x) => x.k);
}

/** The walk: repeat canonical passes, merging each key while its fee is
 *  gold-only and canCombine allows it, until a full pass applies nothing.
 *  Terminates because every merge strictly shrinks the total copy count;
 *  deterministic because the order is canonical and gold gates re-check the
 *  working balance (running dry stops later merges the same way every time). */
function walkForgeAll(slice: InventorySlice): {
  end: InventorySlice;
  plan: ForgeAllPlan;
} {
  let work: InventorySlice = {
    items: slice.items,
    loadouts: slice.loadouts,
    gold: slice.gold,
    soulShards: slice.soulShards,
  };
  const steps: ForgeStep[] = [];
  let touchesEquipped = false;
  let applied = true;
  while (applied) {
    applied = false;
    for (const key of canonicalKeys(work.items)) {
      for (;;) {
        const cost = mergeCost(key);
        if (!cost || cost.shards > 0) break; // never auto-spend shards
        if (!canCombine(work, key).ok) break;
        if (!touchesEquipped && unitsLosingFuel(work, key).length > 0) {
          touchesEquipped = true;
        }
        work = combineFold(work, key);
        steps.push({ from: key, to: nextItemKey(key)!, gold: cost.gold });
        applied = true;
      }
    }
  }
  return {
    end: work,
    plan: {
      steps,
      totalGold: steps.reduce((sum, s) => sum + s.gold, 0),
      touchesEquipped,
    },
  };
}

/** Dry-run: what Forge All would do right now. Pure — drives the button label
 *  ("×N — cost") and the confirm panel; identical to the fold by construction. */
export function planForgeAll(slice: InventorySlice): ForgeAllPlan {
  return walkForgeAll(slice).plan;
}

/** The Forge All fold. Returns `save` unchanged when nothing is forgeable. */
export function forgeAllFold<S extends InventorySlice>(save: S): S {
  const { end, plan } = walkForgeAll(save);
  if (plan.steps.length === 0) return save;
  return {
    ...save,
    items: end.items,
    loadouts: end.loadouts,
    gold: end.gold,
    soulShards: end.soulShards,
  };
}

// ---------------------------------------------------------------------------
// FAB pip — how many stacks have an OK merge right now (any currency).
// ---------------------------------------------------------------------------

/** Distinct stacks whose merge can proceed this instant. Cheap (O(#stacks));
 *  self-clears as merges complete or stop being affordable. */
export function forgeableStackCount(slice: InventorySlice): number {
  return Object.keys(slice.items).filter((k) => canCombine(slice, k).ok).length;
}
