// ============================================================================
// Persistence layer
// A thin wrapper around localStorage. Isolated behind an interface so that when
// multiplayer arrives, this can be swapped for a server-backed store WITHOUT
// touching the rest of the app. Migration is a pure function (migrateSave) so
// Vitest can exercise it headlessly — loadSave only does the storage I/O.
// ============================================================================

import type { ItemLoadouts } from "@/types";
import { DECKABLE_UNIT_IDS, SLAYER_MONSTER_IDS, UNITS } from "@/data/units";
import { STARTER_UNIT_IDS } from "@/meta/economy";
import { TOTAL_XP_CAP } from "@/meta/leveling";
import { sanitizeItems, sanitizeLoadouts } from "@/meta/inventory";
import { sanitizeShop, type ShopState } from "@/meta/shop";
import { sanitizeQuests, type QuestSaveState } from "@/meta/quests";
import { DEFAULT_AVATAR_ID, isAvatarUnlocked } from "@/meta/avatars";
import {
  computeRetroBestiaryRewards,
  earnedTitleIds,
} from "@/meta/bestiaryRewards";
import {
  addCommanderXp,
  commanderLevelFromXp,
  sanitizeEquippedSpell,
  sanitizeTalentAllocation,
  talentPointsForLevel,
  type SpellId,
  type TalentAllocation,
} from "@/meta/commander";
import {
  DUNGEON_IDS,
  DUNGEONS,
  milestoneUnlocksFor,
  QUEST_LOCKED_UNITS,
} from "@/data/dungeons";
import { isTierUnlocked, TIER_IDS, type TierId } from "@/data/tiers";

/** Compendium knowledge of one unit/monster. Encountered = faced it in battle
 *  (silhouette + name); defeated = it died to you at least once (full page). */
export interface BestiaryEntry {
  encountered: boolean;
  defeated: boolean;
}

/** Per-dungeon PvE progress. Floors are linear within a dungeon, so one
 *  high-water mark each: floor N is a "first clear" iff N > highestClearedFloor. */
export interface DungeonProgress {
  /** Highest floor with a recorded victory in this dungeon; 0 = none yet. */
  highestClearedFloor: number;
  /** Difficulty tiers whose boss has been beaten HERE — monotonic one-way
   *  flags, absent = neither. Normal's cleared signal stays
   *  highestClearedFloor (the gate chain / world map read it). (Save v14.) */
  clearedTiers?: { hard?: boolean; elite?: boolean };
}

/** A fresh progress map: every known dungeon at floor 0. */
function freshDungeonProgress(): Record<string, DungeonProgress> {
  const out: Record<string, DungeonProgress> = {};
  for (const id of DUNGEON_IDS) out[id] = { highestClearedFloor: 0 };
  return out;
}

/** A dungeon's cleared-floor high-water mark (0 if never played). */
export function highestClearedFloorOf(
  save: PlayerSave,
  dungeonId: string
): number {
  return save.dungeons[dungeonId]?.highestClearedFloor ?? 0;
}

/** Whether a dungeon's boss has been defeated (the dungeon is cleared). In the
 *  RNG "hunt for the boss" descent, clearing a dungeon writes its floor count
 *  as the high-water mark, so completion is `highestClearedFloor >= floors` —
 *  the same signal the gate chain and world-map "completed" state already read.
 *  (Legacy per-floor saves that reached the last floor read as cleared too.) */
export function isDungeonCleared(save: PlayerSave, dungeonId: string): boolean {
  const d = DUNGEONS[dungeonId];
  return d != null && highestClearedFloorOf(save, dungeonId) >= d.floors;
}

/** Whether `dungeonId` is cleared AT `tier`: Normal reads the existing
 *  highestClearedFloor signal (untouched by the tier system); Hard/Elite read
 *  the v14 clearedTiers flags. */
export function isTierCleared(
  save: PlayerSave,
  dungeonId: string,
  tier: TierId
): boolean {
  if (tier === "normal") return isDungeonCleared(save, dungeonId);
  return save.dungeons[dungeonId]?.clearedTiers?.[tier] === true;
}

/** The highest tier this dungeon's ladder has unlocked (Normal → Hard on a
 *  Normal clear → Elite on a Hard clear). The atlas sheet's default pill —
 *  it's also the frontier, the deepest tier worth fighting. */
export function highestUnlockedTier(
  save: PlayerSave,
  dungeonId: string
): TierId {
  let best: TierId = "normal";
  for (const tier of TIER_IDS) {
    if (isTierUnlocked(tier, (t) => isTierCleared(save, dungeonId, t))) {
      best = tier;
    }
  }
  return best;
}

/** Endless survival progress. Just the deepest wave ever reached, for now. */
export interface EndlessProgress {
  bestWave: number;
}

/** The player's best endless wave (0 if never played). */
export function endlessBestWave(save: PlayerSave): number {
  return save.endless?.bestWave ?? 0;
}

export interface PlayerSave {
  version: number;
  username: string;
  /** Profile icon — resolved via meta/avatars.getAvatar. Currently always a
   *  unit defId gated on unlockedUnits (avatar ⊆ unlocked, enforced in
   *  migrateSave like the deck). (Save v4.) */
  avatarId: string;
  /** Selected active deck (unit ids). Combat slice uses up to 4. */
  deck: string[];
  /** Local battle stats (wins/losses) — display only for now. */
  wins: number;
  losses: number;
  /** Compendium reveal state, keyed by defId. Recorded by the meta layer on
   *  battle end — the sim never learns about it. (Save v2.) */
  bestiary: Record<string, BestiaryEntry>;
  /** Spendable currency, earned from battles and chests. (Save v3.) */
  gold: number;
  /** Deckable unit ids the player owns. New saves start with the starter
   *  four; units added to the game AFTER a save reaches v3 arrive locked —
   *  they're drops/purchases, only the v2→v3 boundary grandfathers. */
  unlockedUnits: string[];
  /** Per-dungeon PvE progress, keyed by dungeonId (includes "depths"). Replaces
   *  the single `depths` high-water mark once multiple dungeons exist. (Save v6.) */
  dungeons: Record<string, DungeonProgress>;
  /** Units whose rare-spawn quest is complete → their (discounted) purchase is
   *  unlocked in the Collection. Distinct from unlockedUnits (owned): a quest
   *  makes a unit BUYABLE; gold still completes the recruit. (Save v5.) */
  questUnlocks: string[];
  /** Endless survival high-water mark. (Save v7.) */
  endless: EndlessProgress;
  /** Total battle XP per deckable unit id. LEVEL IS ALWAYS DERIVED from this
   *  via meta/leveling.levelFromXp — never store a level, so the two can't
   *  desync. Missing id = 0 XP = level 1. Clamped to TOTAL_XP_CAP. (Save v8.) */
  unitXp: Record<string, number>;
  /** Soul Shards — the premium currency. Earned from one-time first clears
   *  and a rare top-chest drip; spent on legendary-tier item merges. (Save v9.) */
  soulShards: number;
  /** Item inventory: STACK COUNTS keyed by ItemKey "lineId:quality:star"
   *  (equipped copies included — loadouts REFERENCE these stacks). The
   *  invariant references ≤ count is enforced by meta/inventory folds and
   *  re-enforced in migrateSave. (Save v9.) */
  items: Record<string, number>;
  /** Equipped item keys per unit defId (weapon/armor/trinket). (Save v9.) */
  loadouts: ItemLoadouts;
  /** Grubbins' shop bookkeeping — which local day the counters refer to, paid
   *  rerolls used, and shelf slots bought. The STOCK itself is never stored:
   *  it's re-derived from (day, rerolls) in meta/shop. (Save v10.) */
  shop: ShopState;
  /** Quest-board bookkeeping + accepted quests. Offers are never stored —
   *  re-derived from (day, refreshes) in meta/quests. (Save v11.) */
  quests: QuestSaveState;
  /** Consecutive chests opened without an item drop — at ITEM_PITY_THRESHOLD
   *  the next chest is forced to contain one. (Save v11.) */
  itemPity: number;
  /** Lifetime kills per monster defId (SLAYER_MONSTER_IDS only — heroes and
   *  summon-only defs never appear; PvE kills only, arena grants nothing).
   *  SLAYER LEVEL IS ALWAYS DERIVED from this via
   *  meta/slayer.slayerLevelFromKills — never store a level, the unitXp rule.
   *  Missing id = 0 kills. (Save v15.) */
  monsterKills: Record<string, number>;
  /** The EQUIPPED cosmetic title id, or null for none. The earned SET is always
   *  derived from bestiary + monsterKills (meta/bestiaryRewards.earnedTitleIds)
   *  — never stored, the unitXp rule; only the player's choice lives here, and
   *  it's cleared on load if no longer earned. (Save v16.) */
  title: string | null;
  /** Commander XP — the account-wide pool every battle feeds. LEVEL AND TALENT
   *  POINTS ARE ALWAYS DERIVED via meta/commander (the unitXp rule). (Save v17.) */
  commanderXp: number;
  /** Talent ranks bought, keyed by talent id. Sanitized on load by replaying
   *  the tree's gate rules, so it can never hold an unreachable build. (v17.) */
  talents: TalentAllocation;
  /** The EQUIPPED commander spell, or null. The UNLOCKED set is always derived
   *  from branch investment (the title rule); cleared on load if the pick is
   *  no longer unlocked. (Save v17.) */
  equippedSpell: SpellId | null;
}

// The key names the storage SLOT, not the schema — the version lives inside
// the payload, so bumping the schema must not change the key.
const KEY = "fantasy-arena/save/v1";

export const DEFAULT_SAVE: PlayerSave = {
  version: 17,
  username: "Champion",
  avatarId: DEFAULT_AVATAR_ID,
  deck: [...STARTER_UNIT_IDS],
  wins: 0,
  losses: 0,
  bestiary: {},
  gold: 0,
  unlockedUnits: [...STARTER_UNIT_IDS],
  dungeons: freshDungeonProgress(),
  questUnlocks: [],
  endless: { bestWave: 0 },
  unitXp: {},
  soulShards: 0,
  items: {},
  loadouts: {},
  shop: { day: -1, rerolls: 0, bought: [] },
  quests: { day: -1, refreshes: 0, taken: [], active: [] },
  itemPity: 0,
  monsterKills: {},
  title: null,
  commanderXp: 0,
  talents: {},
  equippedSpell: null,
};

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY);
    return migrateSave(raw ? (JSON.parse(raw) as Partial<PlayerSave>) : null);
  } catch {
    return migrateSave(null);
  }
}

/** Pure migration: raw parsed JSON of ANY version (or null for a brand-new
 *  player) → a valid current-version save. Versioned merge: defaults fill any
 *  fields an older save lacks, then version-specific rules apply on top. */
export function migrateSave(parsed: Partial<PlayerSave> | null): PlayerSave {
  if (!parsed || typeof parsed !== "object") {
    return structuredCloneSave(DEFAULT_SAVE);
  }
  const merged: PlayerSave = { ...structuredCloneSave(DEFAULT_SAVE), ...parsed };
  merged.bestiary = { ...(parsed.bestiary ?? {}) };
  // v6: per-dungeon progress map. Migrate the legacy single Depths high-water
  // mark (parsed.depths, pre-v6) into dungeons.depths; drop unknown ids.
  const dungeons = freshDungeonProgress();
  const legacyDepths = (parsed as { depths?: { highestClearedFloor?: number } })
    .depths?.highestClearedFloor;
  if (typeof legacyDepths === "number") {
    dungeons.depths.highestClearedFloor = Math.max(0, legacyDepths);
  }
  for (const [id, prog] of Object.entries(parsed.dungeons ?? {})) {
    if (id in DUNGEONS) {
      dungeons[id] = {
        highestClearedFloor: Math.max(0, prog?.highestClearedFloor ?? 0),
      };
      // v14: per-tier clear flags — strict `=== true` booleans only, ladder
      // invariant enforced generously (elite implies hard, like the v12/v13
      // retro-grants); junk shapes and empty objects drop the field entirely.
      const rawTiers = prog?.clearedTiers;
      if (rawTiers && typeof rawTiers === "object") {
        const elite = rawTiers.elite === true;
        const hard = rawTiers.hard === true || elite;
        if (hard) {
          dungeons[id].clearedTiers = elite
            ? { hard: true, elite: true }
            : { hard: true };
        }
      }
    }
  }
  merged.dungeons = dungeons;
  delete (merged as unknown as { depths?: unknown }).depths; // drop legacy field
  merged.gold = Math.max(0, parsed.gold ?? 0);
  // Quest-unlock progress — keep only ids that are still quest-locked units
  // (defensive against removed units / hand-edited saves).
  merged.questUnlocks = [...(parsed.questUnlocks ?? [])].filter((id) =>
    QUEST_LOCKED_UNITS.has(id)
  );
  // v13: the Sealed Vault quest now ALSO unlocks the Archmage himself. A save
  // that already completed it (Aegis Knight buyable or bought) gets the
  // Archmage's purchase retroactively. Idempotent + monotonic, like the v12
  // gift retro-grant — safe on every load.
  if (
    (merged.questUnlocks.includes("aegis_knight") ||
      (parsed.unlockedUnits ?? []).includes("aegis_knight")) &&
    !merged.questUnlocks.includes("archmage")
  ) {
    merged.questUnlocks.push("archmage");
  }
  // v7: endless survival high-water mark (defaults to 0 for older saves).
  merged.endless = { bestWave: Math.max(0, parsed.endless?.bestWave ?? 0) };
  // v8: per-unit XP — keep only deckable ids with finite values, floored and
  // clamped to [0, TOTAL_XP_CAP] (defensive against hand-edited saves).
  const unitXp: Record<string, number> = {};
  for (const [id, xp] of Object.entries(parsed.unitXp ?? {})) {
    if (!DECKABLE_UNIT_IDS.includes(id)) continue;
    if (typeof xp !== "number" || !Number.isFinite(xp)) continue;
    unitXp[id] = Math.min(TOTAL_XP_CAP, Math.max(0, Math.floor(xp)));
  }
  merged.unitXp = unitXp;
  // v9: Soul Shards + item inventory + per-unit loadouts. The sanitizers
  // rebuild both maps defensively (parseable keys, slot-type match, and the
  // references ≤ count invariant) — see meta/inventory.
  const rawShards = Number(parsed.soulShards ?? 0);
  merged.soulShards = Number.isFinite(rawShards)
    ? Math.max(0, Math.floor(rawShards))
    : 0;
  merged.items = sanitizeItems(parsed.items);
  merged.loadouts = sanitizeLoadouts(
    parsed.loadouts,
    merged.items,
    DECKABLE_UNIT_IDS
  );
  // v10: shop bookkeeping — rebuilt defensively; older saves get the fresh
  // "never visited" state (day -1), which normalizes on first shop open.
  merged.shop = sanitizeShop(parsed.shop);
  // v11: quest-board bookkeeping + accepted quests, and the item-pity counter.
  merged.quests = sanitizeQuests(parsed.quests);
  const rawPity = Number(parsed.itemPity ?? 0);
  merged.itemPity = Number.isFinite(rawPity)
    ? Math.max(0, Math.floor(rawPity))
    : 0;
  // v15: lifetime monster kills — keep only slayer-trackable ids with finite
  // values, floored and clamped ≥ 0 (defensive against hand-edited saves).
  const monsterKills: Record<string, number> = {};
  for (const [id, n] of Object.entries(parsed.monsterKills ?? {})) {
    if (!SLAYER_MONSTER_IDS.has(id)) continue;
    if (typeof n !== "number" || !Number.isFinite(n)) continue;
    monsterKills[id] = Math.max(0, Math.floor(n));
  }
  merged.monsterKills = monsterKills;
  // v16: the equipped title — kept only while it's still in the DERIVED earned
  // set (a title can't be un-earned today, but this stays honest if a boss or
  // dungeon is ever removed). Runs after bestiary + monsterKills are final.
  merged.title =
    typeof parsed.title === "string" &&
    earnedTitleIds(merged.bestiary, merged.monsterKills).includes(parsed.title)
      ? parsed.title
      : null;
  // v16: one-time bestiary retro-grant. Everything this save already
  // discovered, every slayer threshold already crossed, and every already-
  // complete Compendium book pays its reward ONCE, so the feature doesn't
  // silently skip a veteran's whole back catalog. Version-gated (not
  // idempotent-by-nature like the v12 gift grant — this one MOVES currency),
  // so it fires exactly once per save and never on a brand-new account.
  if ((parsed.version ?? 1) < 16) {
    const retro = computeRetroBestiaryRewards(merged.bestiary, merged.monsterKills);
    merged.gold += retro.gold;
    merged.soulShards += retro.shards;
  }
  // v17: the Commander — XP pool clamped, talents replayed through the tree's
  // gate rules against the points the CLAMPED level actually grants, and the
  // equipped spell kept only while still unlocked. Older saves start at the
  // zero state (no retro-grant — XP simply starts accruing).
  const rawCommanderXp = Number(parsed.commanderXp ?? 0);
  merged.commanderXp = Number.isFinite(rawCommanderXp)
    ? addCommanderXp(0, Math.floor(rawCommanderXp))
    : 0;
  merged.talents = sanitizeTalentAllocation(
    parsed.talents,
    talentPointsForLevel(commanderLevelFromXp(merged.commanderXp))
  );
  merged.equippedSpell = sanitizeEquippedSpell(
    parsed.equippedSpell,
    merged.talents
  );

  // Grandfathering: saves from before the unlock system keep every unit that
  // exists today — EXCEPT quest-locked ones, whose purchase must always be
  // earned via the quest. Only this one-time boundary is generous; post-v3
  // saves meet new units as locked drops/purchases.
  if ((parsed.version ?? 1) < 3) {
    merged.unlockedUnits = DECKABLE_UNIT_IDS.filter(
      (id) => !QUEST_LOCKED_UNITS.has(id)
    );
  } else {
    // Defensive: drop unknown/non-deckable ids, and starters are always owned.
    const owned = new Set(
      (parsed.unlockedUnits ?? []).filter((id) =>
        DECKABLE_UNIT_IDS.includes(id)
      )
    );
    for (const id of STARTER_UNIT_IDS) owned.add(id);
    // v12: retro-grant per-dungeon gifts the player has already earned — any
    // gift whose floor is at/below that dungeon's cleared high-water mark.
    // Idempotent + monotonic (only ever adds), so it's safe on every load and
    // covers saves made before a dungeon's gift existed.
    for (const dungeonId of DUNGEON_IDS) {
      const cleared = merged.dungeons[dungeonId]?.highestClearedFloor ?? 0;
      for (const [floorStr, unitId] of Object.entries(
        milestoneUnlocksFor(dungeonId)
      )) {
        if (Number(floorStr) <= cleared) owned.add(unitId);
      }
    }
    merged.unlockedUnits = [...owned];
  }

  merged.username = sanitizeUsername(
    typeof parsed.username === "string" ? parsed.username : "",
    DEFAULT_SAVE.username
  );
  merged.avatarId = sanitizeAvatarId(parsed.avatarId, merged.unlockedUnits);

  merged.version = DEFAULT_SAVE.version;
  merged.deck = sanitizeDeck(merged.deck, merged.unlockedUnits);
  // Load-time only: never boot into an empty warband — refill with whatever
  // of the default deck the player owns (starters are always unlocked).
  // Interactive setDeck deliberately skips this so Clear actually clears.
  if (merged.deck.length === 0) {
    merged.deck = DEFAULT_SAVE.deck.filter((id) =>
      merged.unlockedUnits.includes(id)
    );
  }
  return merged;
}

/** Deep-ish copy so callers can't mutate DEFAULT_SAVE through a returned save. */
function structuredCloneSave(save: PlayerSave): PlayerSave {
  return {
    ...save,
    deck: [...save.deck],
    bestiary: { ...save.bestiary },
    unlockedUnits: [...save.unlockedUnits],
    dungeons: Object.fromEntries(
      Object.entries(save.dungeons).map(([id, p]) => [
        id,
        {
          ...p,
          ...(p.clearedTiers ? { clearedTiers: { ...p.clearedTiers } } : {}),
        },
      ])
    ),
    questUnlocks: [...save.questUnlocks],
    endless: { ...save.endless },
    unitXp: { ...save.unitXp },
    items: { ...save.items },
    loadouts: Object.fromEntries(
      Object.entries(save.loadouts).map(([id, l]) => [id, { ...l }])
    ),
    shop: { ...save.shop, bought: [...save.shop.bought] },
    quests: {
      ...save.quests,
      taken: [...save.quests.taken],
      active: save.quests.active.map((q) => ({ ...q })),
    },
    monsterKills: { ...save.monsterKills },
    talents: { ...save.talents },
  };
}

/** Enforce deck rules: drop unknown ids, locked units, dupes, and keep at most
 *  one Legendary. The deck ⊆ unlocked invariant lives here — grandfathered
 *  saves unlock everything first, so their decks pass through untouched.
 *  May return [] (an empty warband is a valid interactive state — Clear);
 *  the never-boot-empty fallback lives in migrateSave, not here. */
export function sanitizeDeck(
  deck: string[],
  unlockedUnits: readonly string[]
): string[] {
  const out: string[] = [];
  let hasLegendary = false;
  for (const id of deck) {
    const def = UNITS[id];
    if (!def) continue; // unknown / removed unit
    if (!unlockedUnits.includes(id)) continue; // locked
    if (out.includes(id)) continue;
    if (def.rarity === "legendary") {
      if (hasLegendary) continue;
      hasLegendary = true;
    }
    out.push(id);
    if (out.length >= 4) break;
  }
  return out;
}

export const MAX_USERNAME_LENGTH = 16;

/** Normalize a profile name: strip control/format characters, collapse
 *  whitespace runs, trim, and cap the length (by code point, so a trailing
 *  emoji is dropped whole rather than split into a lone surrogate). An input
 *  that sanitizes to nothing yields the fallback — "clear the field and hit
 *  Done" reverts rather than resets. Permissive otherwise (unicode is fine):
 *  this is a local solo game; a future PvP server re-validates its own rules. */
export function sanitizeUsername(raw: string, fallback: string): string {
  // Whitespace collapses FIRST so a newline becomes a word break ("a\nb" →
  // "a b") instead of silently gluing words together; remaining Cc/Cf
  // (bells, zero-widths, bidi controls) then strip outright.
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  const capped = [...cleaned].slice(0, MAX_USERNAME_LENGTH).join("").trim();
  return capped.length > 0 ? capped : fallback;
}

/** Avatar ⊆ unlocked, the profile twin of the deck invariant. Unknown ids
 *  (removed units, hand-edited saves) and locked units fall back to the
 *  default — which is a starter, so it's always owned. */
export function sanitizeAvatarId(
  id: unknown,
  unlockedUnits: readonly string[]
): string {
  return typeof id === "string" && isAvatarUnlocked(id, unlockedUnits)
    ? id
    : DEFAULT_AVATAR_ID;
}

export function writeSave(save: PlayerSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable (private mode); fail soft.
  }
}

/** Wipe all progress (deck, gold, unlocks). Settings live under their own key
 *  and survive. Callers should reload the app so React state re-initializes. */
export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage may be unavailable — nothing to wipe.
  }
}
