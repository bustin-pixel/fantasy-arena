// ============================================================================
// Battle grant — the one atomic fold that turns a resolved match into save
// deltas. Gold + chest contents + unlock drops + deck XP + quest progress +
// dungeon clears all land together, so a crash can never persist half a grant.
// Pure: every random roll already happened in computeBattleRewards (RNG before
// fold, like the quest-claim path), which is what lets a StrictMode double-run
// — and a spec — call it twice with the same result.
// Lives here rather than in rewards.ts because it composes rewards + quests,
// and rewards.ts is what quests.ts imports (folding it in would cycle).
// ============================================================================

import type { BattleMode } from "@/hooks/useBattleEngine"; // type-only: erased at runtime
import { getDungeon, milestoneUnlocksFor } from "@/data/dungeons";
import { addXp } from "@/meta/leveling";
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
  dungeons: Record<string, { highestClearedFloor: number }>;
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
  // Chest contents → currency/unlocks/stacks (the fold shared with quest
  // claims), on top of the flat battle gold/shards.
  const folded = foldChestContents(
    {
      gold: save.gold + rewards.gold,
      soulShards: save.soulShards + rewards.shards,
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
  if (ctx.mode === "depths" && rewards.firstClear) {
    // First boss kill CLEARS the dungeon (the RNG "hunt for the boss" model:
    // firstClear fires only on the first boss defeat). Write the dungeon's
    // floor count as the completion high-water mark — the same >= floors
    // signal the gate chain and world map already read as "cleared".
    const floors = getDungeon(ctx.dungeonId).floors;
    const prev = save.dungeons[ctx.dungeonId]?.highestClearedFloor ?? 0;
    dungeons = {
      ...save.dungeons,
      [ctx.dungeonId]: { highestClearedFloor: Math.max(prev, floors) },
    };
    // Clearing a dungeon hands over ALL of its milestone gifts at once.
    for (const unitId of Object.values(milestoneUnlocksFor(ctx.dungeonId))) {
      unlocked.add(unitId);
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
    unlockedUnits: [...unlocked],
    dungeons,
    questUnlocks: [...questUnlocks],
    endless,
    quests,
    itemPity: nextItemPity(save.itemPity, rewards.chest?.contents ?? null),
  };
}
