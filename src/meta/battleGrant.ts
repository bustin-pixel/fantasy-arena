// ============================================================================
// Battle grant — the one atomic fold that turns a resolved match into save
// deltas. Gold + chest contents + unlock drops + deck XP + quest progress +
// dungeon clears + Compendium reveals all land together, so a crash can never
// persist half a grant (the bestiary reveal and the gold it pays are the same
// write — that's why recording moved in here from its own setSave pass).
// Pure: every random roll already happened in computeBattleRewards (RNG before
// fold, like the quest-claim path), which is what lets a StrictMode double-run
// — and a spec — call it twice with the same result.
// Lives here rather than in rewards.ts because it composes rewards + quests,
// and rewards.ts is what quests.ts imports (folding it in would cycle).
// ============================================================================

import type { BattleMode } from "@/hooks/useBattleEngine"; // type-only: erased at runtime
import { getDungeon, milestoneUnlocksFor } from "@/data/dungeons";
import type { TierId } from "@/data/tiers";
import { addXp } from "@/meta/leveling";
import {
  foldBestiarySeen,
  foldMonsterKills,
  type BestiaryMap,
} from "@/meta/bestiaryRewards";
import { tickQuestProgress, type QuestSaveState } from "@/meta/quests";
import {
  foldChestContents,
  nextItemPity,
  type BattleRewards,
  type ChestGrantSlice,
} from "@/meta/rewards";

/** The save slice a battle grant folds into — PlayerSave satisfies it. */
export interface BattleGrantSlice extends ChestGrantSlice {
  unitXp: Record<string, number>;
  monsterKills: Record<string, number>;
  bestiary: BestiaryMap;
  dungeons: Record<
    string,
    {
      highestClearedFloor: number;
      clearedTiers?: { hard?: boolean; elite?: boolean };
    }
  >;
  questUnlocks: string[];
  endless: { bestWave: number };
  quests: QuestSaveState;
  itemPity: number;
}

/** What the fold needs to know about the match that just ended. */
export interface BattleGrantCtx {
  mode: BattleMode;
  floor: number;
  dungeonId: string;
  wavesSurvived?: number;
  deck?: readonly string[];
  outcome?: "victory" | "defeat" | "draw";
  slain?: readonly string[];
  /** Enemy defIds FIELDED against the player this battle (the ledger's `seen`).
   *  Folded into the Compendium here — reveals ride the same atomic write as
   *  the rewards they pay out, so a crash can't record a discovery unpaid. */
  seen?: readonly string[];
  /** Difficulty tier the dungeon run was fought at (default normal) — routes
   *  the first-clear fold: Normal marks highestClearedFloor + gifts; Hard/
   *  Elite flip their clearedTiers flag. */
  tier?: TierId;
}

export function applyBattleGrant<S extends BattleGrantSlice>(
  save: S,
  rewards: BattleRewards,
  ctx: BattleGrantCtx
): S {
  // Whole-deck XP: every fielded unit earns the full amount (addXp is the
  // same clamp the RewardPanel preview uses, so preview ≡ persisted).
  const unitXp = { ...save.unitXp };
  if (rewards.xp > 0) {
    for (const id of new Set(ctx.deck ?? [])) {
      unitXp[id] = addXp(unitXp[id] ?? 0, rewards.xp);
    }
  }
  // Slayer kills: every trackable monster in the slain multiset adds one
  // lifetime kill, PvE ONLY — arena (solo/pvp) grants nothing, which is what
  // lets the skeleton be trackable without arena Necromancer-summon farming.
  // Any PvE outcome counts (pre-wipe kills, like slay bounties).
  const slayerCounts = ctx.mode === "depths" || ctx.mode === "endless";
  const monsterKills = foldMonsterKills(
    save.monsterKills,
    ctx.slain ?? [],
    slayerCounts
  );
  // Compendium reveals ride this same atomic write (rather than a separate
  // recordBestiary pass): everything fielded counts as encountered, everything
  // slain as defeated. The bundle's bestiary payouts were computed from the
  // SAME prior maps + ledgers via the same helpers, so preview ≡ persisted.
  const bestiary = foldBestiarySeen(
    save.bestiary,
    ctx.seen ?? [],
    ctx.slain ?? []
  );
  // Chest contents → currency/unlocks/stacks (the fold shared with quest
  // claims), on top of the flat battle gold/shards and the one-time bestiary
  // payouts (discoveries + slayer milestones + book completions).
  const folded = foldChestContents(
    {
      gold: save.gold + rewards.gold + (rewards.bestiary?.gold ?? 0),
      soulShards:
        save.soulShards + rewards.shards + (rewards.bestiary?.shards ?? 0),
      items: save.items,
      unlockedUnits: save.unlockedUnits,
    },
    rewards.chest?.contents ?? []
  );
  const unlocked = new Set(folded.unlockedUnits);
  // Quest progress: fold this battle's facts into the accepted quests.
  const activeQuests = tickQuestProgress(save.quests.active, {
    mode: ctx.mode,
    outcome: ctx.outcome ?? "draw",
    deck: ctx.deck ?? [],
    slain: ctx.slain ?? [],
    wavesSurvived: ctx.wavesSurvived ?? 0,
  });
  const quests =
    activeQuests === save.quests.active
      ? save.quests
      : { ...save.quests, active: activeQuests };
  // Endless: fold the run's depth into the best-wave high-water mark.
  const endless =
    ctx.mode === "endless"
      ? { bestWave: Math.max(save.endless.bestWave, ctx.wavesSurvived ?? 0) }
      : save.endless;
  let dungeons = save.dungeons;
  const tier = ctx.tier ?? "normal";
  if (ctx.mode === "depths" && rewards.firstClear) {
    const prev = save.dungeons[ctx.dungeonId] ?? { highestClearedFloor: 0 };
    if (tier === "normal") {
      // First boss kill CLEARS the dungeon (the RNG "hunt for the boss" model:
      // firstClear fires only on the first boss defeat). Write the dungeon's
      // floor count as the completion high-water mark — the same >= floors
      // signal the gate chain and world map already read as "cleared".
      const floors = getDungeon(ctx.dungeonId).floors;
      dungeons = {
        ...save.dungeons,
        [ctx.dungeonId]: {
          ...prev,
          highestClearedFloor: Math.max(prev.highestClearedFloor, floors),
        },
      };
      // Clearing a dungeon hands over ALL of its milestone gifts at once.
      for (const unitId of Object.values(milestoneUnlocksFor(ctx.dungeonId))) {
        unlocked.add(unitId);
      }
    } else {
      // Hard/Elite first boss kill: flip that tier's monotonic cleared flag
      // (idempotent — a StrictMode double-fold lands the same save). Normal's
      // floor mark and the milestone gifts stay untouched: the per-dungeon
      // ladder means Hard/Elite always follow a Normal clear.
      dungeons = {
        ...save.dungeons,
        [ctx.dungeonId]: {
          ...prev,
          clearedTiers: { ...prev.clearedTiers, [tier]: true },
        },
      };
    }
  }
  // Rare-spawn quest completion → the reward unit(s) become purchasable
  // (the Sealed Vault quest pays out two from the one kill).
  const questUnlocks = new Set(save.questUnlocks);
  for (const id of rewards.questUnlocks ?? []) questUnlocks.add(id);
  return {
    ...save,
    gold: folded.gold,
    soulShards: folded.soulShards,
    items: folded.items,
    unitXp,
    monsterKills,
    bestiary,
    unlockedUnits: [...unlocked],
    dungeons,
    questUnlocks: [...questUnlocks],
    endless,
    quests,
    itemPity: nextItemPity(save.itemPity, rewards.chest?.contents ?? null),
  };
}
