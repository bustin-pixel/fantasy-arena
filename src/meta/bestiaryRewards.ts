// ============================================================================
// Bestiary rewards — the pure transition math that turns Compendium progress
// into one-time payouts + earned titles. Import-light (data/ + sibling meta
// leaves only, never state/ or engine/), so persistence, the reward fold, and
// the UI can all read it without cycles — the meta/slayer.ts pattern.
//
// Three one-time streams, each keyed off a monotonic false→true signal so the
// fold never double-pays:
//   • discovery  — first ENCOUNTER + first DEFEAT of each monster (bosses pay
//                  a premium + a Soul Shard); monsters only (SLAYER_MONSTER_IDS).
//   • milestones — crossing a slayer level (10/25/50/100/200 kills); +1 shard
//                  at the cap. Kills only accrue in PvE, so these do too.
//   • books      — defeating every monster in one dungeon's Compendium book.
//
// The core `computeBestiaryRewards` diffs a prior→next pair of maps, so the
// SAME function serves both the per-battle fold (next = prior + this battle's
// seen/slain) and the one-time save migration retro-grant (prior = empty, next
// = the whole recorded save). Titles are DERIVED from the same maps — never
// stored; only the equipped title id lives in the save.
//
// Accepted edge: an arena Necromancer's raised skeletons land in the enemy
// ledger, so the SKELETON's one-time discovery gold can first pay from an arena
// fight (its slayer KILLS still never count in arena — that gate lives in the
// grant fold). One-time and harmless; not special-cased.
// ============================================================================

import { BOSS_IDS, DUNGEONS, dungeonBestiaryIds } from "@/data/dungeons";
import { SLAYER_MONSTER_IDS, getUnitDef } from "@/data/units";
import {
  BESTIARY_REWARDS,
  SLAYER_MASTERY_SHARDS,
  SLAYER_MILESTONE_GOLD,
} from "./economy";
import { SLAYER_LEVEL_CAP, slayerLevelFromKills } from "./slayer";

/** Structural mirror of persistence.BestiaryEntry — defined locally so this
 *  module stays free of a state/ import (persistence imports US, for retro). */
export interface BestiaryLike {
  encountered: boolean;
  defeated: boolean;
}
export type BestiaryMap = Record<string, BestiaryLike | undefined>;

// ---------------------------------------------------------------------------
// Transition helpers — the ONE place seen/slain become bestiary flips and kill
// increments. Both the reward preview (computeBattleRewards) and the save
// write (applyBattleGrant) call these, so the bundle and the persisted save
// always describe the same prior→next step (the XP preview ≡ persisted rule).
// ---------------------------------------------------------------------------

/** Fold a battle's `seen`/`slain` ledgers into a fresh bestiary map: everything
 *  seen is encountered, everything slain is encountered + defeated. Reveals only
 *  ever go forward (a prior defeat is never un-set by a later mere sighting). */
export function foldBestiarySeen(
  prior: BestiaryMap,
  seen: readonly string[],
  slain: readonly string[]
): BestiaryMap {
  const next: BestiaryMap = { ...prior };
  for (const id of seen) {
    next[id] = { encountered: true, defeated: next[id]?.defeated ?? false };
  }
  for (const id of slain) {
    next[id] = { encountered: true, defeated: true };
  }
  return next;
}

/** Fold a battle's `slain` ledger into fresh lifetime kill counts. `countKills`
 *  is the PvE gate (arena grants nothing) — false returns the map unchanged.
 *  Only SLAYER_MONSTER_IDS accrue; other slain ids (heroes, summon-only defs)
 *  are ignored, matching what the save persists. */
export function foldMonsterKills(
  prior: Record<string, number>,
  slain: readonly string[],
  countKills: boolean
): Record<string, number> {
  if (!countKills) return prior;
  const countable = slain.filter((id) => SLAYER_MONSTER_IDS.has(id));
  if (countable.length === 0) return prior;
  const next = { ...prior };
  for (const id of countable) next[id] = (next[id] ?? 0) + 1;
  return next;
}

// ---------------------------------------------------------------------------
// The reward result
// ---------------------------------------------------------------------------

export interface DiscoveryReward {
  id: string;
  kind: "encounter" | "defeat";
  boss: boolean;
  gold: number;
  shards: number;
}
export interface MilestoneReward {
  id: string;
  level: number;
  gold: number;
  shards: number;
}
export interface BookCompletionReward {
  dungeonId: string;
  gold: number;
  shards: number;
}
export interface BestiaryRewardResult {
  discoveries: DiscoveryReward[];
  milestones: MilestoneReward[];
  completedBooks: BookCompletionReward[];
  /** Sum of every stream — what the grant fold adds to gold/soulShards. */
  gold: number;
  shards: number;
}

const EMPTY_RESULT: BestiaryRewardResult = {
  discoveries: [],
  milestones: [],
  completedBooks: [],
  gold: 0,
  shards: 0,
};

/** True when every id in this dungeon's book is defeated in `map`. Uses the
 *  shared dungeonBestiaryIds walk, so it matches the Compendium plaque exactly. */
function bookComplete(map: BestiaryMap, dungeonId: string): boolean {
  const ids = dungeonBestiaryIds(DUNGEONS[dungeonId]);
  return ids.length > 0 && ids.every((id) => map[id]?.defeated === true);
}

/** The reward for a prior→next Compendium step. Pure: diffs the two map pairs
 *  and pays every freshly-crossed one-time signal. Empty (identity) when nothing
 *  new crossed — so an arena win with no new monsters is a no-op. */
export function computeBestiaryRewards(input: {
  priorBestiary: BestiaryMap;
  nextBestiary: BestiaryMap;
  priorKills: Record<string, number>;
  nextKills: Record<string, number>;
}): BestiaryRewardResult {
  const { priorBestiary, nextBestiary, priorKills, nextKills } = input;
  const discoveries: DiscoveryReward[] = [];
  const milestones: MilestoneReward[] = [];
  const completedBooks: BookCompletionReward[] = [];
  let gold = 0;
  let shards = 0;

  // Discovery: pay each false→true reveal flip, monsters only. A boss pays the
  // premium band + a shard on defeat; both flips can fire in one battle (first
  // sighting AND first kill), paying encounter then defeat.
  for (const id of Object.keys(nextBestiary)) {
    if (!SLAYER_MONSTER_IDS.has(id)) continue;
    const before = priorBestiary[id];
    const after = nextBestiary[id];
    if (!after) continue;
    const boss = BOSS_IDS.has(id);
    if (after.encountered && !before?.encountered) {
      const g = boss
        ? BESTIARY_REWARDS.bossEncounterGold
        : BESTIARY_REWARDS.encounterGold;
      discoveries.push({ id, kind: "encounter", boss, gold: g, shards: 0 });
      gold += g;
    }
    if (after.defeated && !before?.defeated) {
      const g = boss
        ? BESTIARY_REWARDS.bossDefeatGold
        : BESTIARY_REWARDS.defeatGold;
      const s = boss ? BESTIARY_REWARDS.bossDefeatShards : 0;
      discoveries.push({ id, kind: "defeat", boss, gold: g, shards: s });
      gold += g;
      shards += s;
    }
  }

  // Slayer milestones: pay every level newly crossed (a big multi-kill or the
  // retro-grant can cross several at once). Cap level also pays mastery shards.
  for (const id of Object.keys(nextKills)) {
    if (!SLAYER_MONSTER_IDS.has(id)) continue;
    const oldLvl = slayerLevelFromKills(priorKills[id] ?? 0);
    const newLvl = slayerLevelFromKills(nextKills[id] ?? 0);
    for (let lvl = oldLvl + 1; lvl <= newLvl; lvl++) {
      const g = SLAYER_MILESTONE_GOLD[lvl - 1] ?? 0;
      const s = lvl >= SLAYER_LEVEL_CAP ? SLAYER_MASTERY_SHARDS : 0;
      milestones.push({ id, level: lvl, gold: g, shards: s });
      gold += g;
      shards += s;
    }
  }

  // Book completion: pay a dungeon book the first time its last monster falls.
  for (const dungeonId of Object.keys(DUNGEONS)) {
    if (bookComplete(nextBestiary, dungeonId) && !bookComplete(priorBestiary, dungeonId)) {
      completedBooks.push({
        dungeonId,
        gold: BESTIARY_REWARDS.bookCompletionGold,
        shards: BESTIARY_REWARDS.bookCompletionShards,
      });
      gold += BESTIARY_REWARDS.bookCompletionGold;
      shards += BESTIARY_REWARDS.bookCompletionShards;
    }
  }

  if (discoveries.length === 0 && milestones.length === 0 && completedBooks.length === 0) {
    return EMPTY_RESULT;
  }
  return { discoveries, milestones, completedBooks, gold, shards };
}

/** The per-battle payout: derives the next maps from this battle's ledgers via
 *  the shared fold helpers, then diffs. `countKills` is the PvE gate (so arena
 *  pays discovery but never milestones). The grant fold applies the SAME
 *  helpers to the save, so bundle and save agree. */
export function computeBattleBestiaryRewards(input: {
  priorBestiary: BestiaryMap;
  priorKills: Record<string, number>;
  seen: readonly string[];
  slain: readonly string[];
  countKills: boolean;
}): BestiaryRewardResult {
  return computeBestiaryRewards({
    priorBestiary: input.priorBestiary,
    nextBestiary: foldBestiarySeen(input.priorBestiary, input.seen, input.slain),
    priorKills: input.priorKills,
    nextKills: foldMonsterKills(input.priorKills, input.slain, input.countKills),
  });
}

/** The one-time save-migration payout: everything already discovered, every
 *  threshold already crossed, every already-complete book pays once (prior =
 *  the fresh account's empty maps, next = the whole recorded save). Version-
 *  gated in migrateSave, so it fires exactly once per save. */
export function computeRetroBestiaryRewards(
  bestiary: BestiaryMap,
  kills: Record<string, number>
): BestiaryRewardResult {
  return computeBestiaryRewards({
    priorBestiary: {},
    nextBestiary: bestiary,
    priorKills: {},
    nextKills: kills,
  });
}

// ---------------------------------------------------------------------------
// Titles — cosmetic, DERIVED from bestiary + kills (never stored; only the
// equipped id lives in the save). A boss's first defeat earns its slayer
// epithet; completing every dungeon book earns Loremaster.
// ---------------------------------------------------------------------------

/** Hand-authored boss epithets. A boss with no entry falls back to a "<Name>
 *  Slayer" title, so a newly-added dungeon boss always gets one. */
const BOSS_TITLE_LABEL: Record<string, string> = {
  bloater: "Bloaterbane",
  abomination: "Fleshbane",
  dire_alpha: "Packbreaker",
  elder_treant: "Grovefeller",
  rune_golem: "Runebreaker",
  forge_golem: "Forgebreaker",
  eclipse_warden: "Wardenslayer",
  fallen_seraph: "Seraph's Bane",
  bandit_king: "Kingslayer",
};

export const LOREMASTER_TITLE_ID = "loremaster";

export interface TitleDef {
  id: string;
  label: string;
  /** Whether the save has earned this title. */
  earned: (bestiary: BestiaryMap, kills: Record<string, number>) => boolean;
}

/** The full title registry, keyed by title id: one slayer epithet per dungeon
 *  boss, plus Loremaster for a complete monster bestiary. */
export const TITLES: Record<string, TitleDef> = (() => {
  const out: Record<string, TitleDef> = {};
  for (const bossId of BOSS_IDS) {
    const id = `slayer:${bossId}`;
    out[id] = {
      id,
      label: BOSS_TITLE_LABEL[bossId] ?? `${getUnitDef(bossId).name} Slayer`,
      earned: (bestiary) => bestiary[bossId]?.defeated === true,
    };
  }
  out[LOREMASTER_TITLE_ID] = {
    id: LOREMASTER_TITLE_ID,
    label: "Loremaster",
    earned: (bestiary) =>
      Object.keys(DUNGEONS).every((dungeonId) => bookComplete(bestiary, dungeonId)),
  };
  return out;
})();

/** Every title id the save has earned (stable registry order). */
export function earnedTitleIds(
  bestiary: BestiaryMap,
  kills: Record<string, number>
): string[] {
  return Object.values(TITLES)
    .filter((t) => t.earned(bestiary, kills))
    .map((t) => t.id);
}

/** The display label for a title id, or null if unknown/none. */
export function titleLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return TITLES[id]?.label ?? null;
}
