// ============================================================================
// Quest board (the bulletin board) — daily notices, pure meta logic.
// The OFFERS are always derived from (dayIndex, refreshes) — never persisted —
// exactly like Grubbins' shop stock, so StrictMode double-runs can't double-
// grant and a future server can re-derive any board. Only the tiny board
// bookkeeping and the ACCEPTED quests (self-contained snapshots, so they
// survive daily rollover) live in the save. Tunables in meta/economy.ts;
// meta/ never imports state/, engine/, or React.
// ============================================================================

import type { BattleMode } from "@/hooks/useBattleEngine"; // type-only: erased at runtime
import { getUnitDef, UNITS } from "@/data/units";
import { RNG } from "@/utils/rng";
import {
  foldChestContents,
  nextItemPity,
  type ChestContent,
  type ChestGrantSlice,
} from "./rewards";
import {
  QUEST_ACTIVE_MAX,
  QUEST_BOARD_SIZE,
  QUEST_CHEST_TIER,
  QUEST_DIFFICULTY_WEIGHTS,
  QUEST_FREE_REFRESHES,
  QUEST_GOLD_RANGE,
  QUEST_REFRESH_COST,
  type ChestTier,
  type QuestDifficulty,
} from "./economy";

/** What a notice asks the player to do. All v1 kinds tick from post-battle
 *  data alone (outcome, mode, deck, slain, waves) — no hooks anywhere else. */
export type QuestKind =
  | "arena_wins"
  | "unit_wins"
  | "slay"
  | "depths_clears"
  | "endless_wave";

const QUEST_KINDS: readonly QuestKind[] = [
  "arena_wins",
  "unit_wins",
  "slay",
  "depths_clears",
  "endless_wave",
];

/** One pinned notice. Fully self-contained (goal/reward baked in at roll
 *  time), so an accepted copy stays valid after the board rolls over. */
export interface QuestNotice {
  /** Deterministic: "q:<day>:<refreshes>:<slot>". */
  id: string;
  kind: QuestKind;
  /** unit defId for unit_wins; enemy defId for slay; absent otherwise. */
  targetId?: string;
  goal: number;
  difficulty: QuestDifficulty;
  /** Flat gold paid on claim (the chest pays its own bonus gold on top). */
  gold: number;
  chestTier: ChestTier;
}

/** An accepted notice with live progress. */
export interface ActiveQuest extends QuestNotice {
  progress: number;
}

/** Per-day board bookkeeping + the accepted-quest log inside the save. The
 *  OFFERS are not here on purpose — re-derived from (day, refreshes). */
export interface QuestSaveState {
  /** dayIndexLocal() value the board bookkeeping refers to. -1 = never seen. */
  day: number;
  /** Manual refreshes used today (first QUEST_FREE_REFRESHES are free). */
  refreshes: number;
  /** Notice ids accepted from the CURRENT board — hidden from the offer list.
   *  Stale generations' ids are harmless (they never match derived offers). */
  taken: string[];
  /** Accepted quests. Persist until claimed or abandoned — never expire. */
  active: ActiveQuest[];
}

/** Goals per kind × difficulty. Fixed (not rolled) so a notice's ask is
 *  always a round, comparable number; only the gold rolls in a range. */
const QUEST_GOALS: Record<QuestKind, Record<QuestDifficulty, number>> = {
  arena_wins: { easy: 2, medium: 4, hard: 7 },
  unit_wins: { easy: 2, medium: 4, hard: 6 },
  slay: { easy: 8, medium: 18, hard: 30 },
  depths_clears: { easy: 2, medium: 4, hard: 7 },
  endless_wave: { easy: 5, medium: 8, hard: 12 },
};

/** Common dungeon/endless fodder eligible for slay bounties — deliberately no
 *  bosses or rare spawns (a "slay 3 Liches" notice would be a boss-floor
 *  treadmill, not a grind). Filtered to bestiary-ENCOUNTERED at roll time so
 *  a bounty never names something the player has no idea how to find. */
const SLAY_CANDIDATES: readonly string[] = [
  "giant_rat",
  "zombie_shambler",
  "skeleton_archer",
  "ghoul",
  "bonecaller",
  "dire_wolf",
  "razorback",
  "grizzly",
  "arcane_wisp",
  "imp",
  "cultist",
  "thornbeast",
  "spore_pod",
  "dryad",
  "light_wisp",
  "shadow_wraith",
  "eclipse_acolyte",
  "clockwork_spider",
  "sentry",
  "animated_armor",
];

/** Floor-1/2 Depths fodder — the slay fallback for a fresh bestiary, so even
 *  a brand-new player's bounty is reachable. */
const SLAY_FALLBACK: readonly string[] = ["giant_rat", "zombie_shambler"];

/** Endless quests only roll once the mode itself is unlocked (clear Depths
 *  floor 5 — HomeScreen's ENDLESS_GATE_FLOOR twin; keep in sync). */
const ENDLESS_GATE_FLOOR = 5;

/** What the board roll needs to know about the player, so every notice is
 *  achievable. Derive via boardCtx() from a save slice. */
export interface QuestBoardCtx {
  unlockedUnits: readonly string[];
  /** defIds the player has ENCOUNTERED (bestiary keys with encountered). */
  seenEnemies: readonly string[];
  endlessUnlocked: boolean;
}

/** The structural save slice the quest folds operate on — PlayerSave
 *  satisfies it. Bestiary/dungeons are read only to derive the board ctx. */
export interface QuestSaveSlice {
  gold: number;
  quests: QuestSaveState;
  unlockedUnits: string[];
  bestiary: Record<string, { encountered: boolean }>;
  dungeons: Record<string, { highestClearedFloor: number }>;
}

/** Board-roll context from a save slice (the one impure-ish edge — reads the
 *  live save shape — kept out of rollDailyBoard so that stays fully pure). */
export function boardCtx(save: QuestSaveSlice): QuestBoardCtx {
  return {
    unlockedUnits: save.unlockedUnits,
    seenEnemies: Object.keys(save.bestiary).filter(
      (id) => save.bestiary[id]?.encountered && id in UNITS
    ),
    endlessUnlocked:
      (save.dungeons["depths"]?.highestClearedFloor ?? 0) >= ENDLESS_GATE_FLOOR,
  };
}

/** Disperse (dayIndex, refreshes) into one 32-bit seed — the shop's Knuth
 *  hash with different salts, so the board and the shelf never correlate. */
function boardSeed(dayIndex: number, refreshes: number): number {
  return (
    (Math.imul(dayIndex, 2654435761) ^
      Math.imul(refreshes + 1, 0x85ebca6b) ^
      0x9e3779b9) >>>
    0
  );
}

/** Weighted difficulty pick (normalized walk, stable easy→medium→hard). */
function pickDifficulty(rng: RNG): QuestDifficulty {
  const order: QuestDifficulty[] = ["easy", "medium", "hard"];
  const total = order.reduce((s, d) => s + QUEST_DIFFICULTY_WEIGHTS[d], 0);
  let roll = rng.next() * total;
  for (const d of order) {
    roll -= QUEST_DIFFICULTY_WEIGHTS[d];
    if (roll < 0) return d;
  }
  return "easy";
}

/** The day's notices. Pure: same (dayIndex, refreshes, ctx) → identical
 *  board. Kinds are drawn WITHOUT replacement (a shuffled deal), so a board
 *  never pins two copies of the same ask. */
export function rollDailyBoard(
  dayIndex: number,
  refreshes: number,
  ctx: QuestBoardCtx
): QuestNotice[] {
  const rng = new RNG(boardSeed(dayIndex, refreshes));
  const kinds = rng
    .shuffle(QUEST_KINDS.filter((k) => k !== "endless_wave" || ctx.endlessUnlocked))
    .slice(0, QUEST_BOARD_SIZE);
  const seenSlayable = SLAY_CANDIDATES.filter((id) =>
    ctx.seenEnemies.includes(id)
  );
  const slayPool = seenSlayable.length > 0 ? seenSlayable : SLAY_FALLBACK;

  return kinds.map((kind, slot) => {
    const difficulty = pickDifficulty(rng);
    const [gMin, gMax] = QUEST_GOLD_RANGE[difficulty];
    const targetId =
      kind === "unit_wins"
        ? rng.pick(ctx.unlockedUnits)
        : kind === "slay"
        ? rng.pick(slayPool)
        : undefined;
    return {
      id: `q:${dayIndex}:${refreshes}:${slot}`,
      kind,
      ...(targetId !== undefined ? { targetId } : {}),
      goal: QUEST_GOALS[kind][difficulty],
      difficulty,
      gold: rng.int(gMin, gMax),
      chestTier: QUEST_CHEST_TIER[difficulty],
    };
  });
}

/** Day rollover as a pure step: same day → the same object (identity is the
 *  "nothing changed" signal). Accepted quests always carry across. */
export function normalizeQuestBoard(
  quests: QuestSaveState,
  todayIdx: number
): QuestSaveState {
  return quests.day === todayIdx
    ? quests
    : { day: todayIdx, refreshes: 0, taken: [], active: quests.active };
}

/** The post-battle facts every quest kind ticks from — BattleScreen already
 *  has all of them at grant time; nothing new is measured. */
export interface BattleFacts {
  mode: BattleMode;
  outcome: "victory" | "defeat" | "draw";
  deck: readonly string[];
  slain: readonly string[];
  /** Endless: waves fully cleared this run. */
  wavesSurvived: number;
}

/** Fold one battle into the active quests. Pure; returns the SAME array when
 *  nothing moved (identity signal for the save fold). Progress never regresses
 *  and keeps counting past goal (harmless; claim checks >=). */
export function tickQuestProgress(
  active: readonly ActiveQuest[],
  facts: BattleFacts
): ActiveQuest[] {
  let changed = false;
  const next = active.map((q) => {
    let progress = q.progress;
    switch (q.kind) {
      case "arena_wins":
        if (facts.mode === "solo" && facts.outcome === "victory") progress += 1;
        break;
      case "unit_wins":
        if (
          facts.outcome === "victory" &&
          q.targetId !== undefined &&
          facts.deck.includes(q.targetId)
        )
          progress += 1;
        break;
      case "slay":
        progress += facts.slain.filter((id) => id === q.targetId).length;
        break;
      case "depths_clears":
        if (facts.mode === "depths" && facts.outcome === "victory")
          progress += 1;
        break;
      case "endless_wave":
        // Single-run high-water: the goal must be reached within ONE run.
        if (facts.mode === "endless")
          progress = Math.max(progress, facts.wavesSurvived);
        break;
    }
    if (progress === q.progress) return q;
    changed = true;
    return { ...q, progress };
  });
  return changed ? next : (active as ActiveQuest[]);
}

// ---------------------------------------------------------------------------
// Save folds — pure and idempotent-per-state (the shop discipline): a
// StrictMode re-run starts from the already-committed state and no-ops on
// the gate. Each returns `save` unchanged when blocked.
// ---------------------------------------------------------------------------

/** Accept a pinned notice: normalize day → re-derive offers → gate (exists,
 *  not already taken, active slots free) → snapshot into active. */
export function applyAcceptQuest<S extends QuestSaveSlice>(
  save: S,
  todayIdx: number,
  noticeId: string
): S {
  const quests = normalizeQuestBoard(save.quests, todayIdx);
  if (quests.taken.includes(noticeId)) return save;
  if (quests.active.length >= QUEST_ACTIVE_MAX) return save;
  const notice = rollDailyBoard(quests.day, quests.refreshes, boardCtx(save)).find(
    (n) => n.id === noticeId
  );
  if (!notice) return save;
  return {
    ...save,
    quests: {
      ...quests,
      taken: [...quests.taken, noticeId],
      active: [...quests.active, { ...notice, progress: 0 }],
    },
  };
}

/** Abandon an accepted quest. No refund, no gate beyond existence. */
export function applyAbandonQuest<S extends QuestSaveSlice>(
  save: S,
  questId: string
): S {
  if (!save.quests.active.some((q) => q.id === questId)) return save;
  return {
    ...save,
    quests: {
      ...save.quests,
      active: save.quests.active.filter((q) => q.id !== questId),
    },
  };
}

/** Gold price of the NEXT manual refresh given refreshes used today. */
export function refreshCost(refreshes: number): number {
  return refreshes < QUEST_FREE_REFRESHES ? 0 : QUEST_REFRESH_COST;
}

/** Re-pin the un-accepted notices (bumps the derive counter; accepted quests
 *  are untouched — they're snapshots). First one free daily, then gold. */
export function applyBoardRefresh<S extends QuestSaveSlice>(
  save: S,
  todayIdx: number
): S {
  const quests = normalizeQuestBoard(save.quests, todayIdx);
  const cost = refreshCost(quests.refreshes);
  if (save.gold < cost) return save;
  return {
    ...save,
    gold: save.gold - cost,
    quests: { ...quests, refreshes: quests.refreshes + 1 },
  };
}

/** What the claim fold additionally touches — PlayerSave satisfies it. */
export interface QuestClaimSlice extends ChestGrantSlice {
  quests: QuestSaveState;
  itemPity: number;
}

/** Claim a COMPLETED quest: pay its gold, fold the pre-rolled chest contents
 *  (rolled by the caller — RNG-before-fold, like battle rewards), step the
 *  item-pity counter, retire the quest. The active-quest gate makes a
 *  StrictMode re-run a no-op. */
export function applyClaimQuest<S extends QuestClaimSlice>(
  save: S,
  questId: string,
  chestContents: readonly ChestContent[]
): S {
  const quest = save.quests.active.find((q) => q.id === questId);
  if (!quest || quest.progress < quest.goal) return save;
  const folded = foldChestContents(
    { ...save, gold: save.gold + quest.gold },
    chestContents
  );
  return {
    ...folded,
    itemPity: nextItemPity(save.itemPity, chestContents),
    quests: {
      ...save.quests,
      active: save.quests.active.filter((q) => q.id !== questId),
    },
  };
}

// ---------------------------------------------------------------------------
// Display helpers (names come from unit defs — meta may import data/).
// ---------------------------------------------------------------------------

/** One-line ask for a notice/active card. The "N×" form dodges pluralizing
 *  monster names ("Grizzlys"…). */
export function describeQuest(q: QuestNotice): string {
  switch (q.kind) {
    case "arena_wins":
      return `Win ${q.goal} Arena battles`;
    case "unit_wins":
      return `Win ${q.goal} battles with ${targetName(q)} fielded`;
    case "slay":
      return `Slay ${q.goal}× ${targetName(q)}`;
    case "depths_clears":
      return `Clear ${q.goal} dungeon floors`;
    case "endless_wave":
      return `Reach wave ${q.goal} in one Endless run`;
  }
}

function targetName(q: QuestNotice): string {
  return q.targetId && UNITS[q.targetId] ? getUnitDef(q.targetId).name : "???";
}

// ---------------------------------------------------------------------------
// Migration sanitizer (the sanitizeShop twin): any junk → a valid state.
// ---------------------------------------------------------------------------

const VALID_TIERS: readonly ChestTier[] = [
  "wooden",
  "silver",
  "gold",
  "arcane",
  "dragon",
];
const VALID_DIFFICULTIES: readonly QuestDifficulty[] = [
  "easy",
  "medium",
  "hard",
];

export function sanitizeQuests(raw: unknown): QuestSaveState {
  const r = (raw ?? {}) as Partial<QuestSaveState>;
  const day = Number.isInteger(r.day) ? (r.day as number) : -1;
  const refreshesRaw = Number(r.refreshes ?? 0);
  const refreshes = Number.isFinite(refreshesRaw)
    ? Math.max(0, Math.floor(refreshesRaw))
    : 0;
  const taken = Array.isArray(r.taken)
    ? [...new Set(r.taken.filter((id): id is string => typeof id === "string"))]
    : [];
  const active: ActiveQuest[] = [];
  if (Array.isArray(r.active)) {
    for (const entry of r.active) {
      const q = sanitizeActiveQuest(entry);
      if (q) active.push(q);
      if (active.length >= QUEST_ACTIVE_MAX) break;
    }
  }
  return { day, refreshes, taken, active };
}

function sanitizeActiveQuest(raw: unknown): ActiveQuest | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Partial<ActiveQuest>;
  if (typeof q.id !== "string") return null;
  if (!QUEST_KINDS.includes(q.kind as QuestKind)) return null;
  const kind = q.kind as QuestKind;
  // Targeted kinds need a target that still exists (removed units void the
  // notice rather than leaving an unfinishable "Slay 18× ???").
  const needsTarget = kind === "unit_wins" || kind === "slay";
  if (needsTarget && (typeof q.targetId !== "string" || !(q.targetId in UNITS)))
    return null;
  if (!Number.isFinite(q.goal) || (q.goal as number) < 1) return null;
  if (!VALID_DIFFICULTIES.includes(q.difficulty as QuestDifficulty)) return null;
  if (!VALID_TIERS.includes(q.chestTier as ChestTier)) return null;
  const gold = Number(q.gold);
  const progressRaw = Number(q.progress ?? 0);
  return {
    id: q.id,
    kind,
    ...(needsTarget ? { targetId: q.targetId as string } : {}),
    goal: Math.floor(q.goal as number),
    difficulty: q.difficulty as QuestDifficulty,
    gold: Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0,
    chestTier: q.chestTier as ChestTier,
    progress: Number.isFinite(progressRaw)
      ? Math.max(0, Math.floor(progressRaw))
      : 0,
  };
}
