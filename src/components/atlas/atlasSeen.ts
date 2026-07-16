// ============================================================================
// Atlas "seen progress" store — which clears the Dungeon Atlas has already
// CELEBRATED with its unlock ceremony (path draws in, marker slides).
//
// Deliberately a localStorage SIDE-KEY, not part of PlayerSave: this is pure
// presentation state (skipping it can never lose progress), so it doesn't rate
// a save-version bump — but it must survive a reload (win a floor, come back
// tomorrow, the ceremony still plays), so it can't be session-only either.
//
// The diff (`pendingUnlocks`) is what drives the ceremony, identically whether
// the atlas was opened manually or auto-opened by the post-victory flow.
// ============================================================================

import {
  DUNGEONS,
  DUNGEON_IDS,
  isDungeonUnlocked,
} from "@/data/dungeons";
import { highestClearedFloorOf, type PlayerSave } from "@/state/persistence";

const KEY = "fantasy-arena:atlas-seen:v1";

/** dungeonId → highestClearedFloor the atlas has already celebrated. */
export type AtlasSeen = Record<string, number>;

/** The celebrated-progress map, or null when the store has never been written
 *  (or is unreadable). Null matters: an EXISTING save meeting the atlas for
 *  the first time must be seeded via markAllSeen — not celebrated for every
 *  clear it ever made — so callers treat null as "seed silently, no ceremony". */
export function readAtlasSeen(): AtlasSeen | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const out: AtlasSeen = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function writeAtlasSeen(seen: AtlasSeen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Storage unavailable → the ceremony just replays next open. Harmless.
  }
}

/** Mark the save's entire current progress as celebrated. */
export function markAllSeen(save: PlayerSave): void {
  const seen: AtlasSeen = {};
  for (const id of DUNGEON_IDS) seen[id] = highestClearedFloorOf(save, id);
  writeAtlasSeen(seen);
}

/** One owed unlock ceremony. */
export interface PendingUnlock {
  dungeonId: string;
  /** The floor node the ceremony reveals (the NEXT floor after the new clear),
   *  capped at the dungeon's deepest floor. */
  toFloor: number;
  /** The dungeon's own last clear (what earned the ceremony). */
  clearedFloor: number;
  /** True when this clear also flipped other dungeons' world-gate open (the
   *  world view owes a branch draw-in — both fork children after the spire). */
  unlockedDungeonIds: string[];
}

/** Ceremonies owed: every dungeon whose save progress is ahead of what the
 *  atlas has celebrated. Fresh installs celebrate nothing (no seen entry AND
 *  no progress = the baseline "depths floor 1 awaits" state, not an unlock). */
export function pendingUnlocks(
  save: PlayerSave,
  seen: AtlasSeen
): PendingUnlock[] {
  const savedOf = (id: string) => highestClearedFloorOf(save, id);
  const seenOf = (id: string) => seen[id] ?? 0;
  const out: PendingUnlock[] = [];
  for (const id of DUNGEON_IDS) {
    const cleared = savedOf(id);
    if (cleared <= seenOf(id)) continue;
    const d = DUNGEONS[id];
    // World-gate flips caused by this dungeon's new progress: children locked
    // under the seen map but unlocked under the save.
    const unlockedDungeonIds = DUNGEON_IDS.filter((childId) => {
      const child = DUNGEONS[childId];
      if (child.gate?.dungeonId !== id) return false;
      return (
        !isDungeonUnlocked(child, seenOf) && isDungeonUnlocked(child, savedOf)
      );
    });
    out.push({
      dungeonId: id,
      toFloor: Math.min(cleared + 1, d.floors),
      clearedFloor: cleared,
      unlockedDungeonIds,
    });
  }
  return out;
}
