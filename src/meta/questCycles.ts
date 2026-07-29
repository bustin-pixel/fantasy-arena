// ============================================================================
// Weekly contracts + the monthly saga — the long-cadence quest layer.
//
// The daily board (meta/quests.ts) is the workhorse loop; this is what gives a
// week and a month a shape. Same discipline throughout:
//   - Offers are DERIVED from the period index, never invented twice.
//   - Rollover is a pure normalize step, and same-period returns the SAME
//     object so callers can use identity as the "nothing changed" signal.
//   - Every fold re-derives its gate from the NORMALIZED state, so a stale
//     click (a board left open across midnight Monday) is a no-op rather than
//     a payout. That no-op IS the expiry rule.
//   - RNG is drawn by the caller before the fold (roll-first, fold-pure), so
//     a React StrictMode double-invoke can't double-grant.
//
// Unlike daily notices, weekly contracts are PERSISTED snapshots rather than
// re-derived offers: they carry progress, and deriving them on read would let
// a mid-week change (a newly unlocked unit, a newly seen enemy) silently
// re-target a contract the player was already part-way through.
//
// meta/ never imports state/, engine/, or React.
// ============================================================================

import { getUnitDef, UNITS } from "@/data/units";
import { ITEM_LINES } from "@/data/items";
import type { TierId } from "@/data/tiers";
import { RNG } from "@/utils/rng";
import {
  foldChestContents,
  nextItemPity,
  type ChestContent,
  type ChestGrantSlice,
} from "./rewards";
import {
  applyClaimQuest,
  boardCtx,
  SLAY_CANDIDATES,
  SLAY_FALLBACK,
  type BattleFacts,
  type QuestBoardCtx,
  type QuestClaimSlice,
  type QuestSaveSlice,
} from "./quests";
import {
  WEEKLY_CHEST_TIER,
  WEEKLY_GOLD_RANGE,
  WEEKLY_QUEST_COUNT,
  WEEKLY_SWEEP_CHEST_TIER,
  type ChestTier,
} from "./economy";

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** What a contract or saga stage asks for.
 *
 *  Most tick from post-battle facts. The two `*_clears` kinds are CLAIM events
 *  — they're fed by the claim folds below, never by a battle, because "finish
 *  a quest" isn't something a match can observe. */
export type CycleKind =
  | "arena_wins"
  | "depths_clears"
  | "slay_any"
  | "endless_waves"
  | "tier_wins"
  | "gold_earned"
  | "daily_clears"
  | "weekly_clears";

/** Kinds a weekly contract can roll. `weekly_clears` is saga-only (a contract
 *  asking you to finish contracts is a snake eating its tail). */
const WEEKLY_KIND_POOL: readonly CycleKind[] = [
  "arena_wins",
  "depths_clears",
  "slay_any",
  "endless_waves",
  "tier_wins",
  "gold_earned",
  "daily_clears",
];

/** One week of work each — roughly 4-6× the matching hard daily. */
const WEEKLY_GOALS: Record<CycleKind, number> = {
  arena_wins: 20,
  depths_clears: 18,
  slay_any: 60,
  endless_waves: 40,
  tier_wins: 8,
  gold_earned: 2500,
  daily_clears: 10,
  weekly_clears: WEEKLY_QUEST_COUNT, // unused by the weekly roll; saga-only
};

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** Everything the cycle ticks read. A superset of the daily board's
 *  BattleFacts: `tier` and `goldEarned` were already sitting unused in the
 *  grant context. */
export interface CycleFacts extends BattleFacts {
  /** Difficulty the battle was fought at ("normal" outside the Depths). */
  tier: TierId;
  /** The grant's TOTAL gold delta — flat battle gold, chest gold, duplicate
   *  conversions and bestiary payouts together. Measured as a delta at the
   *  single grant seam so there is exactly one place it can drift. */
  goldEarned: number;
}

// ---------------------------------------------------------------------------
// Weekly contracts
// ---------------------------------------------------------------------------

export interface WeeklyQuest {
  /** Deterministic: "w:<weekIndex>:<slot>" — its own namespace, so a contract
   *  id can never collide with a daily notice's "q:…" id. */
  id: string;
  kind: CycleKind;
  /** Enemy defId for slay_any when it names a quarry; absent otherwise. */
  targetId?: string;
  goal: number;
  /** Flat gold on claim (the chest pays its own gold on top). */
  gold: number;
  chestTier: ChestTier;
  progress: number;
}

export interface WeeklyQuestState {
  /** weekIndexLocal() value these contracts belong to. -1 = never seen. */
  week: number;
  quests: WeeklyQuest[];
  /** Ids already claimed this week. Contracts stay VISIBLE once claimed (a
   *  board that empties as you finish it reads as a bug), so this ledger is
   *  both the display state and the double-claim gate. */
  claimed: string[];
  /** The all-three sweep bonus has been collected this week. */
  sweepClaimed: boolean;
}

/** What the weekly roll needs on top of the daily board's context. */
export interface WeeklyBoardCtx extends QuestBoardCtx {
  /** Any dungeon fully cleared on Normal — the signal that Hard/Elite exist. */
  tiersUnlocked: boolean;
}

/** Weekly roll context from a save slice. Reuses the daily board's ctx wholesale
 *  so the Endless gate has exactly one definition (never a third copy of
 *  ENDLESS_GATE_FLOOR). */
export function weeklyCtx(save: QuestSaveSlice): WeeklyBoardCtx {
  const base = boardCtx(save);
  return {
    ...base,
    tiersUnlocked: Object.values(save.dungeons).some(
      (d) => (d?.highestClearedFloor ?? 0) > 0
    ),
  };
}

/** Disperse the week index into one 32-bit seed. Knuth hash like the shop and
 *  the daily board, with its own salt so the three never correlate. */
function weeklySeed(weekIndex: number): number {
  return (Math.imul(weekIndex, 2654435761) ^ 0x51ab7e40) >>> 0;
}

/** The week's contracts. Pure: same (weekIndex, ctx) → identical board. Kinds
 *  are dealt WITHOUT replacement so no week pins the same ask twice. */
export function rollWeeklyBoard(
  weekIndex: number,
  ctx: WeeklyBoardCtx
): WeeklyQuest[] {
  const rng = new RNG(weeklySeed(weekIndex));
  const eligible = WEEKLY_KIND_POOL.filter((k) => {
    if (k === "endless_waves") return ctx.endlessUnlocked;
    if (k === "tier_wins") return ctx.tiersUnlocked;
    return true;
  });
  const kinds = rng.shuffle(eligible).slice(0, WEEKLY_QUEST_COUNT);
  const seenSlayable = SLAY_CANDIDATES.filter((id) =>
    ctx.seenEnemies.includes(id)
  );
  const slayPool = seenSlayable.length > 0 ? seenSlayable : SLAY_FALLBACK;

  return kinds.map((kind, slot) => {
    // slay_any names a quarry when we know the player has met one, so the
    // contract can say WHERE to hunt; otherwise it counts every kill.
    const targetId = kind === "slay_any" ? rng.pick(slayPool) : undefined;
    return {
      id: `w:${weekIndex}:${slot}`,
      kind,
      ...(targetId !== undefined ? { targetId } : {}),
      goal: WEEKLY_GOALS[kind],
      gold: rng.int(WEEKLY_GOLD_RANGE[0], WEEKLY_GOLD_RANGE[1]),
      chestTier: WEEKLY_CHEST_TIER,
      progress: 0,
    };
  });
}

/** Week rollover as a pure step: same week → the SAME object. A new week
 *  discards everything, including unclaimed rewards — contracts are ambient
 *  board state, not something the player accepted, and auto-claiming is
 *  impossible under roll-first-fold-pure (a normalize step can't roll a
 *  chest). The board pip nags all week. */
export function normalizeWeekly(
  weekly: WeeklyQuestState,
  weekIdx: number,
  ctx: WeeklyBoardCtx
): WeeklyQuestState {
  return weekly.week === weekIdx
    ? weekly
    : {
        week: weekIdx,
        quests: rollWeeklyBoard(weekIdx, ctx),
        claimed: [],
        sweepClaimed: false,
      };
}

// ---------------------------------------------------------------------------
// Monthly saga
// ---------------------------------------------------------------------------

export interface SagaStageDef {
  kind: CycleKind;
  goal: number;
  /** The ask, written out — stage copy is authored, not generated, because a
   *  saga stage is a story beat. */
  desc: string;
  gold: number;
  shards: number;
}

export interface SagaTheme {
  id: string;
  title: string;
  flavor: string;
  stages: SagaStageDef[];
}

export interface MonthlySagaState {
  /** monthIndexLocal() value this run belongs to. -1 = never seen. */
  month: number;
  /** Current stage index. Equal to stages.length once the saga is complete;
   *  every stage below it is claimed by definition. */
  stage: number;
  progress: number;
}

/** The final stage of every theme pays the Reliquary; the rest pay fixed gold
 *  and shards (no RNG, so those claims need nothing rolled up front).
 *
 *  The `weekly_clears` stage is capped at 6 — two full weeks of contracts —
 *  so a saga picked up mid-month is still finishable. Raising it past the
 *  weeks remaining in a month would strand players who start late. */
export const SAGA_THEMES: readonly SagaTheme[] = [
  {
    id: "long_campaign",
    title: "The Long Campaign",
    flavor: "A season of war, fought one field at a time.",
    stages: [
      {
        kind: "arena_wins",
        goal: 20,
        desc: "Win 20 Arena battles",
        gold: 300,
        shards: 0,
      },
      {
        kind: "weekly_clears",
        goal: 6,
        desc: "Complete 6 weekly contracts",
        gold: 400,
        shards: 10,
      },
      {
        kind: "depths_clears",
        goal: 25,
        desc: "Clear 25 dungeon floors",
        gold: 500,
        shards: 15,
      },
      {
        kind: "tier_wins",
        goal: 12,
        desc: "Win 12 battles on Hard or Elite",
        gold: 0,
        shards: 0,
      },
    ],
  },
  {
    id: "great_hunt",
    title: "The Great Hunt",
    flavor: "The Compendium fills for those who go looking.",
    stages: [
      {
        kind: "slay_any",
        goal: 150,
        desc: "Slay 150 monsters",
        gold: 300,
        shards: 0,
      },
      {
        kind: "weekly_clears",
        goal: 6,
        desc: "Complete 6 weekly contracts",
        gold: 400,
        shards: 10,
      },
      {
        kind: "endless_waves",
        goal: 60,
        desc: "Survive 60 Endless waves in total",
        gold: 500,
        shards: 15,
      },
      {
        kind: "slay_any",
        goal: 250,
        desc: "Slay 250 more monsters",
        gold: 0,
        shards: 0,
      },
    ],
  },
  {
    id: "deep_delve",
    title: "The Deep Delve",
    flavor: "Down, and then further down.",
    stages: [
      {
        kind: "depths_clears",
        goal: 15,
        desc: "Clear 15 dungeon floors",
        gold: 300,
        shards: 0,
      },
      {
        kind: "weekly_clears",
        goal: 6,
        desc: "Complete 6 weekly contracts",
        gold: 400,
        shards: 10,
      },
      {
        kind: "gold_earned",
        goal: 4000,
        desc: "Earn 4,000 gold from battles",
        gold: 500,
        shards: 15,
      },
      {
        kind: "tier_wins",
        goal: 15,
        desc: "Win 15 battles on Hard or Elite",
        gold: 0,
        shards: 0,
      },
    ],
  },
];

/** The saga running in a given month. Rotates so a returning player doesn't
 *  see the same chain twice running; the modulo is written to survive a
 *  negative month index (a hand-edited save). */
export function themeForMonth(monthIdx: number): SagaTheme {
  const n = SAGA_THEMES.length;
  return SAGA_THEMES[((monthIdx % n) + n) % n];
}

/** Month rollover: same month → the SAME object; a new month restarts the
 *  chain at stage 0. An unfinished saga does not carry over. */
export function normalizeSaga(
  saga: MonthlySagaState,
  monthIdx: number
): MonthlySagaState {
  return saga.month === monthIdx
    ? saga
    : { month: monthIdx, stage: 0, progress: 0 };
}

/** The stage a saga is currently on, or null when the chain is complete. */
export function currentStage(saga: MonthlySagaState): SagaStageDef | null {
  const stages = themeForMonth(saga.month).stages;
  return saga.stage < stages.length ? stages[saga.stage] : null;
}

/** The final stage pays the Reliquary rather than fixed gold/shards. */
export function isFinalStage(saga: MonthlySagaState): boolean {
  return saga.stage === themeForMonth(saga.month).stages.length - 1;
}

// ---------------------------------------------------------------------------
// Progress ticks
// ---------------------------------------------------------------------------

/** How much one battle advances a given ask. The `*_clears` kinds return 0
 *  here on purpose — they're claim events, fed by the folds below. */
function battleDelta(
  kind: CycleKind,
  targetId: string | undefined,
  facts: CycleFacts
): number {
  switch (kind) {
    case "arena_wins":
      return facts.mode === "solo" && facts.outcome === "victory" ? 1 : 0;
    case "depths_clears":
      return facts.mode === "depths" && facts.outcome === "victory" ? 1 : 0;
    case "slay_any":
      return targetId === undefined
        ? facts.slain.length
        : facts.slain.filter((id) => id === targetId).length;
    case "endless_waves":
      // CUMULATIVE across runs — deliberately NOT the daily endless_wave kind's
      // single-run high-water. "Survive 40 waves this week" is a grind; "reach
      // wave 40 in one run" would be a different (and much harder) ask.
      return facts.mode === "endless" ? facts.wavesSurvived : 0;
    case "tier_wins":
      return facts.mode === "depths" &&
        facts.outcome === "victory" &&
        facts.tier !== "normal"
        ? 1
        : 0;
    case "gold_earned":
      return Math.max(0, facts.goldEarned);
    case "daily_clears":
    case "weekly_clears":
      return 0;
  }
}

/** Fold one battle into the week's contracts. Returns the SAME object when
 *  nothing moved. Claimed contracts stop counting. */
export function tickWeeklyProgress(
  weekly: WeeklyQuestState,
  facts: CycleFacts
): WeeklyQuestState {
  let changed = false;
  const quests = weekly.quests.map((q) => {
    if (weekly.claimed.includes(q.id)) return q;
    const delta = battleDelta(q.kind, q.targetId, facts);
    if (delta === 0) return q;
    changed = true;
    return { ...q, progress: q.progress + delta };
  });
  return changed ? { ...weekly, quests } : weekly;
}

/** Fold one battle into the saga's current stage. No-op once complete. */
export function tickSagaProgress(
  saga: MonthlySagaState,
  facts: CycleFacts
): MonthlySagaState {
  const stage = currentStage(saga);
  if (!stage) return saga;
  const delta = battleDelta(stage.kind, undefined, facts);
  return delta === 0 ? saga : { ...saga, progress: saga.progress + delta };
}

/** Credit a CLAIM event (a daily or weekly quest finished) to whichever cycle
 *  asks for it. Separate from battleDelta because no match can observe it. */
function tickClaimEvent(
  weekly: WeeklyQuestState,
  saga: MonthlySagaState,
  kind: "daily_clears" | "weekly_clears"
): { weekly: WeeklyQuestState; saga: MonthlySagaState } {
  let changed = false;
  const quests = weekly.quests.map((q) => {
    if (q.kind !== kind || weekly.claimed.includes(q.id)) return q;
    changed = true;
    return { ...q, progress: q.progress + 1 };
  });
  const stage = currentStage(saga);
  const nextSaga =
    stage && stage.kind === kind ? { ...saga, progress: saga.progress + 1 } : saga;
  return {
    weekly: changed ? { ...weekly, quests } : weekly,
    saga: nextSaga,
  };
}

// ---------------------------------------------------------------------------
// Save folds
// ---------------------------------------------------------------------------

/** The period indices a fold needs. Computed at the impure UI edge (like
 *  dayIndexLocal) and passed in, so every fold here stays pure. */
export interface CycleIdx {
  week: number;
  month: number;
}

/** The structural slice the cycle folds operate on — PlayerSave satisfies it. */
export interface CycleSlice extends QuestClaimSlice {
  weeklyQuests: WeeklyQuestState;
  monthlySaga: MonthlySagaState;
  unlockedUnits: string[];
  bestiary: Record<string, { encountered: boolean } | undefined>;
  dungeons: Record<string, { highestClearedFloor: number } | undefined>;
}

/** Claim a completed DAILY notice, and credit it to any `daily_clears` ask.
 *  Wraps the daily fold rather than duplicating it: if that one blocked (not
 *  finished, already claimed, StrictMode re-run) it returns the same object and
 *  nothing here fires either. */
export function applyClaimDaily<S extends CycleSlice>(
  save: S,
  questId: string,
  chestContents: readonly ChestContent[],
  cycles: CycleIdx
): S {
  const claimed = applyClaimQuest(save, questId, chestContents);
  if (claimed === save) return save;
  const ticked = tickClaimEvent(
    normalizeWeekly(claimed.weeklyQuests, cycles.week, weeklyCtx(claimed)),
    normalizeSaga(claimed.monthlySaga, cycles.month),
    "daily_clears"
  );
  return {
    ...claimed,
    weeklyQuests: ticked.weekly,
    monthlySaga: ticked.saga,
  };
}

/** Claim a completed weekly contract: pay its gold, fold the pre-rolled chest,
 *  step item pity, mark it claimed, and credit the saga's `weekly_clears`.
 *
 *  The gate is re-derived from the NORMALIZED state, so a claim clicked on a
 *  board that has since rolled over finds no such contract and no-ops. */
export function applyClaimWeekly<S extends CycleSlice>(
  save: S,
  questId: string,
  chestContents: readonly ChestContent[],
  cycles: CycleIdx
): S {
  const weekly = normalizeWeekly(
    save.weeklyQuests,
    cycles.week,
    weeklyCtx(save)
  );
  const quest = weekly.quests.find((q) => q.id === questId);
  if (!quest) return save;
  if (quest.progress < quest.goal) return save;
  if (weekly.claimed.includes(questId)) return save;

  const folded = foldChestContents(
    { ...save, gold: save.gold + quest.gold },
    chestContents
  );
  const ticked = tickClaimEvent(
    { ...weekly, claimed: [...weekly.claimed, questId] },
    normalizeSaga(save.monthlySaga, cycles.month),
    "weekly_clears"
  );
  return {
    ...folded,
    itemPity: nextItemPity(save.itemPity, chestContents),
    weeklyQuests: ticked.weekly,
    monthlySaga: ticked.saga,
  };
}

/** True when every contract this week is claimed and the sweep is still owed. */
export function sweepEarned(weekly: WeeklyQuestState): boolean {
  return (
    weekly.quests.length > 0 &&
    weekly.quests.every((q) => weekly.claimed.includes(q.id)) &&
    !weekly.sweepClaimed
  );
}

/** Collect the all-contracts-cleared sweep bonus.
 *
 *  Eligibility is recomputed from the normalized state — never trusted from the
 *  UI — because a board left open across Monday 00:00 would otherwise show a
 *  live Claim button for a week that has already rolled over and pay a Dragon's
 *  Hoard against a fresh, empty board. Membership is tested with `every` rather
 *  than a length comparison so duplicate or stale ids in `claimed` can't fake
 *  a sweep. Does NOT credit `weekly_clears`: the sweep is a bonus for the
 *  contracts, not a fourth contract. */
export function applyClaimWeeklySweep<S extends CycleSlice>(
  save: S,
  chestContents: readonly ChestContent[],
  cycles: CycleIdx
): S {
  const weekly = normalizeWeekly(
    save.weeklyQuests,
    cycles.week,
    weeklyCtx(save)
  );
  if (!sweepEarned(weekly)) return save;
  const folded = foldChestContents(save, chestContents);
  return {
    ...folded,
    itemPity: nextItemPity(save.itemPity, chestContents),
    weeklyQuests: { ...weekly, sweepClaimed: true },
  };
}

/** Claim the saga's current stage and advance the chain.
 *
 *  Non-final stages pay fixed gold/shards and ignore `chestContents` (nothing
 *  is rolled for them). The final stage folds the pre-rolled Reliquary, whose
 *  contents carry the whole prize — including the relic CHOICE, which lands as
 *  a pending pick rather than an item. */
export function applyClaimSagaStage<S extends CycleSlice>(
  save: S,
  cycles: CycleIdx,
  chestContents: readonly ChestContent[]
): S {
  const saga = normalizeSaga(save.monthlySaga, cycles.month);
  const stage = currentStage(saga);
  if (!stage || saga.progress < stage.goal) return save;
  const advanced: MonthlySagaState = {
    ...saga,
    stage: saga.stage + 1,
    progress: 0,
  };
  const final = saga.stage === themeForMonth(saga.month).stages.length - 1;

  if (!final) {
    return {
      ...save,
      gold: save.gold + stage.gold,
      soulShards: save.soulShards + stage.shards,
      monthlySaga: advanced,
    };
  }
  const folded = foldChestContents(save, chestContents);
  return {
    ...folded,
    itemPity: nextItemPity(save.itemPity, chestContents),
    monthlySaga: advanced,
  };
}

// ---------------------------------------------------------------------------
// Display + alert helpers
// ---------------------------------------------------------------------------

export function describeWeekly(q: WeeklyQuest): string {
  switch (q.kind) {
    case "arena_wins":
      return `Win ${q.goal} Arena battles`;
    case "depths_clears":
      return `Clear ${q.goal} dungeon floors`;
    case "slay_any":
      return q.targetId
        ? `Slay ${q.goal}× ${targetName(q.targetId)}`
        : `Slay ${q.goal} monsters`;
    case "endless_waves":
      return `Survive ${q.goal} Endless waves in total`;
    case "tier_wins":
      return `Win ${q.goal} battles on Hard or Elite`;
    case "gold_earned":
      return `Earn ${q.goal.toLocaleString()} gold from battles`;
    case "daily_clears":
      return `Complete ${q.goal} daily quests`;
    case "weekly_clears":
      return `Complete ${q.goal} weekly contracts`;
  }
}

function targetName(id: string): string {
  return id in UNITS ? getUnitDef(id).name : "???";
}

/** A contract is finished and still unclaimed. */
export function weeklyClaimable(weekly: WeeklyQuestState): boolean {
  return weekly.quests.some(
    (q) => q.progress >= q.goal && !weekly.claimed.includes(q.id)
  );
}

/** The saga's current stage is finished and still unclaimed. */
export function sagaStageClaimable(saga: MonthlySagaState): boolean {
  const stage = currentStage(saga);
  return stage != null && saga.progress >= stage.goal;
}

// ---------------------------------------------------------------------------
// Migration sanitizers (the sanitizeQuests twins): any junk → a valid state.
// ---------------------------------------------------------------------------

const CYCLE_KINDS: readonly CycleKind[] = [
  "arena_wins",
  "depths_clears",
  "slay_any",
  "endless_waves",
  "tier_wins",
  "gold_earned",
  "daily_clears",
  "weekly_clears",
];

const VALID_CHEST_TIERS: readonly ChestTier[] = [
  "wooden",
  "silver",
  "gold",
  "arcane",
  "dragon",
  "legendary",
];

function intAtLeast(raw: unknown, min: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
}

export function sanitizeWeeklyQuests(raw: unknown): WeeklyQuestState {
  const r = (raw ?? {}) as Partial<WeeklyQuestState>;
  const week = Number.isInteger(r.week) ? (r.week as number) : -1;
  const quests: WeeklyQuest[] = [];
  if (Array.isArray(r.quests)) {
    for (const entry of r.quests) {
      const q = sanitizeWeeklyQuest(entry);
      if (q) quests.push(q);
      if (quests.length >= WEEKLY_QUEST_COUNT) break;
    }
  }
  // Dedupe, then drop ids no surviving contract owns — otherwise a stale id
  // could stand in for a real claim when the sweep checks membership.
  const ids = new Set(quests.map((q) => q.id));
  const claimed = Array.isArray(r.claimed)
    ? [
        ...new Set(
          r.claimed.filter(
            (id): id is string => typeof id === "string" && ids.has(id)
          )
        ),
      ]
    : [];
  return { week, quests, claimed, sweepClaimed: r.sweepClaimed === true };
}

function sanitizeWeeklyQuest(raw: unknown): WeeklyQuest | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Partial<WeeklyQuest>;
  if (typeof q.id !== "string") return null;
  if (!CYCLE_KINDS.includes(q.kind as CycleKind)) return null;
  if (!Number.isFinite(q.goal) || (q.goal as number) < 1) return null;
  if (!VALID_CHEST_TIERS.includes(q.chestTier as ChestTier)) return null;
  // A named quarry that no longer exists voids the contract rather than
  // leaving an unfinishable "Slay 60× ???".
  const hasTarget = typeof q.targetId === "string";
  if (hasTarget && !(q.targetId as string in UNITS)) return null;
  return {
    id: q.id,
    kind: q.kind as CycleKind,
    ...(hasTarget ? { targetId: q.targetId as string } : {}),
    goal: Math.floor(q.goal as number),
    gold: intAtLeast(q.gold, 0, 0),
    chestTier: q.chestTier as ChestTier,
    progress: intAtLeast(q.progress, 0, 0),
  };
}

export function sanitizeMonthlySaga(raw: unknown): MonthlySagaState {
  const r = (raw ?? {}) as Partial<MonthlySagaState>;
  const month = Number.isInteger(r.month) ? (r.month as number) : -1;
  const stages = themeForMonth(month).stages.length;
  return {
    month,
    stage: Math.min(stages, intAtLeast(r.stage, 0, 0)),
    progress: intAtLeast(r.progress, 0, 0),
  };
}

/** Pending relic choices. Options are filtered to lines that still exist; a
 *  pick with NO surviving options is dropped (there'd be nothing to choose),
 *  but one or two survivors keep the entitlement — it was paid for. */
export function sanitizePendingPicks(raw: unknown): ChestGrantSlice["pendingPicks"] {
  if (!Array.isArray(raw)) return [];
  const out: ChestGrantSlice["pendingPicks"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as { options?: unknown; quality?: unknown };
    if (!Array.isArray(p.options)) continue;
    const options = [
      ...new Set(
        p.options.filter(
          (id): id is string => typeof id === "string" && id in ITEM_LINES
        )
      ),
    ];
    if (options.length === 0) continue;
    const quality =
      p.quality === "rare" || p.quality === "epic" || p.quality === "legendary"
        ? p.quality
        : "legendary";
    out.push({ options, quality });
  }
  return out;
}
