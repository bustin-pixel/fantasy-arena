// ============================================================================
// GameStateContext
// React Context wrapping the persistent player save. This is the ONLY place
// React holds long-lived game data; the combat simulation deliberately lives
// outside React (see useBattleEngine) so re-renders never touch the sim.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SAVE,
  loadSave,
  sanitizeDeck,
  sanitizeUsername,
  writeSave,
  type PlayerSave,
} from "./persistence";
import { isAvatarUnlocked } from "@/meta/avatars";
import { MILESTONE_UNLOCKS, UNLOCK_PRICES } from "@/meta/economy";
import { addXp } from "@/meta/leveling";
import { canEquip, combineFold } from "@/meta/inventory";
import {
  commissionFold,
  commissionManyFold,
  forgeAllFold,
  salvageFold,
} from "@/meta/blacksmith";
import {
  applyShopPurchase,
  applyShopReroll,
  normalizeShopDay,
} from "@/meta/shop";
import {
  applyAbandonQuest,
  applyAcceptQuest,
  applyBoardRefresh,
  applyClaimQuest,
  normalizeQuestBoard,
  tickQuestProgress,
} from "@/meta/quests";
import {
  getDungeon,
  questForUnlock,
  QUEST_LOCKED_UNITS,
  DUNGEON_IDS,
} from "@/data/dungeons";
import {
  ITEM_LINES,
  ITEM_QUALITIES,
  MAX_STARS,
  makeItemKey,
  parseItemKey,
  type ItemKey,
} from "@/data/items";
import type { ItemSlot } from "@/types";
import {
  foldChestContents,
  nextItemPity,
  type BattleRewards,
  type ChestContent,
} from "@/meta/rewards";
import type { BattleMode } from "@/hooks/useBattleEngine";
import { UNITS, DECKABLE_UNIT_IDS } from "@/data/units";

/** Local-only playtest cheats, exposed on the context as `dev`. This whole object
 *  is `undefined` in production builds (see the provider — the `import.meta.env.DEV`
 *  gate compiles to `false`, so Vite drops the body and DevPanel tree-shakes out),
 *  so the deployed site never carries a usable cheat. */
export interface DevCheats {
  /** Own every deckable unit and mark every quest-locked one buyable. */
  unlockAllUnits: () => void;
  addGold: (amount: number) => void;
  addShards: (amount: number) => void;
  /** Mark every dungeon fully cleared (unlocks themed dungeons + Endless). */
  unlockAllDungeons: () => void;
  /** Mark every unit/monster defeated in the Compendium (full bestiary pages). */
  revealBestiary: () => void;
  /** Fill the Bag with a stack of every item (each line at every quality+star). */
  grantAllItems: () => void;
  /** Wipe back to a brand-new account (to retest the first-run flow). */
  resetSave: () => void;
}

interface GameStateValue {
  save: PlayerSave;
  setDeck: (deck: string[]) => void;
  setUsername: (name: string) => void;
  /** Change the profile icon. No-op unless the avatar is unlocked. */
  setAvatar: (avatarId: string) => void;
  recordResult: (won: boolean) => void;
  /** Fold a battle's enemy roster into the Compendium: everything fielded
   *  against you counts as encountered; everything that died counts as
   *  defeated. Reveals only ever go forward (no un-discovering). */
  recordBestiary: (seen: string[], slain: string[]) => void;
  /** Apply an already-computed reward bundle (gold, chest contents, Depths
   *  progress + milestone unlock on a first clear) in ONE atomic save write.
   *  Idempotence is the caller's job (BattleScreen's recordedRef); rolling
   *  happens before this call so the updater stays pure under StrictMode. */
  grantBattleRewards: (
    rewards: BattleRewards,
    ctx: {
      mode: BattleMode;
      floor: number;
      dungeonId: string;
      /** Endless: waves cleared this run, folded into the best-wave record. */
      wavesSurvived?: number;
      /** The warband fielded this battle — every unit in it earns rewards.xp. */
      deck?: readonly string[];
      /** How the battle ended + what died — the quest-progress facts. */
      outcome?: "victory" | "defeat" | "draw";
      slain?: readonly string[];
    }
  ) => void;
  /** Buy a locked unit with gold. No-op unless locked and affordable. */
  purchaseUnit: (unitId: string) => void;
  /** Equip an item on a unit (the key's slot type picks the slot; a same-slot
   *  swap frees its own reference first). No-op unless a copy is free. */
  equipItem: (defId: string, key: ItemKey) => void;
  /** Clear one of a unit's item slots. */
  unequipItem: (defId: string, slot: ItemSlot) => void;
  /** Merge two copies of `key` into the next star/quality, paying the
   *  gold/shard fee. No-op when blocked (copies/fee/cap) — the Forge disables
   *  the button with the reason, this is belt-and-braces. */
  combineItems: (key: ItemKey) => void;
  /** Melt one FREE (unequipped) copy of `key` into gold. No-op when blocked
   *  (invalid/none/equipped) — meta/blacksmith.salvageFold. */
  salvageItem: (key: ItemKey) => void;
  /** Pay gold to forge a chosen BASE-pool line at rare 1★ (no RNG; signature
   *  lines refused). No-op when blocked — meta/blacksmith.commissionFold. */
  commissionItem: (lineId: string) => void;
  /** Bulk-commission `qty` copies of a base line at once (qty clamped to what
   *  gold affords, atomic) — meta/blacksmith.commissionManyFold. */
  commissionItems: (lineId: string, qty: number) => void;
  /** Chain every GOLD-only merge to fixpoint (shards never auto-spent). The
   *  Forge previews via planForgeAll first — meta/blacksmith.forgeAllFold. */
  forgeAll: () => void;
  /** Roll the shop's day forward (clears the Home FAB's "new stock" dot).
   *  Callers pass dayIndexLocal() — the impure edge stays outside the fold. */
  visitShop: (todayIdx: number) => void;
  /** Buy one shelf slot: gate → deduct gold → grant the item at 1★ → mark the
   *  slot sold. No-op when blocked (bought/broke) — meta/shop.applyShopPurchase. */
  purchaseShopItem: (todayIdx: number, slotIdx: number) => void;
  /** Pay to re-roll today's shelf (once, and only before the first buy). */
  rerollShop: (todayIdx: number) => void;
  /** Roll the quest board's day forward (clears the Home FAB's "new day" pip).
   *  Accepted quests always carry across the rollover. */
  visitQuestBoard: (todayIdx: number) => void;
  /** Accept a pinned notice into an active slot (max QUEST_ACTIVE_MAX). */
  acceptQuest: (todayIdx: number, noticeId: string) => void;
  /** Drop an accepted quest — no refund (the sheet confirms first). */
  abandonQuest: (questId: string) => void;
  /** Re-pin the un-accepted notices: first refresh of the day free, then
   *  QUEST_REFRESH_COST gold each. */
  refreshQuestBoard: (todayIdx: number) => void;
  /** Claim a completed quest: pays its gold + the pre-rolled chest contents
   *  (rolled in the sheet, RNG-before-fold like battle rewards) in one atomic
   *  write, steps the item-pity counter, and retires the quest. */
  claimQuest: (questId: string, chestContents: ChestContent[]) => void;
  /** Local-only playtest cheats — `undefined` in production builds, so the live
   *  site never exposes them (see DevCheats + the DevPanel mount gate). */
  dev?: DevCheats;
}

const GameStateContext = createContext<GameStateValue | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<PlayerSave>(() => loadSave());

  useEffect(() => {
    writeSave(save);
  }, [save]);

  // Belt-and-braces: the deck ⊆ unlocked invariant is enforced at the state
  // boundary, not just in the UI.
  const setDeck = (deck: string[]) =>
    setSave((s) => ({ ...s, deck: sanitizeDeck(deck, s.unlockedUnits) }));
  // Commit point for name edits: the sheet passes raw input; sanitize lives
  // here (and in migrateSave) so no unclean name can reach the save file.
  // Empty/whitespace input keeps the current name.
  const setUsername = (username: string) =>
    setSave((s) => ({ ...s, username: sanitizeUsername(username, s.username) }));
  const setAvatar = (avatarId: string) =>
    setSave((s) =>
      isAvatarUnlocked(avatarId, s.unlockedUnits) ? { ...s, avatarId } : s
    );
  const recordResult = (won: boolean) =>
    setSave((s) => ({
      ...s,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
    }));
  const recordBestiary = (seen: string[], slain: string[]) =>
    setSave((s) => {
      const bestiary = { ...s.bestiary };
      for (const id of seen) {
        bestiary[id] = {
          encountered: true,
          defeated: bestiary[id]?.defeated ?? false,
        };
      }
      for (const id of slain) {
        bestiary[id] = { encountered: true, defeated: true };
      }
      return { ...s, bestiary };
    });

  // One atomic fold per battle: gold + chest gold + unlock drops + Depths
  // progress + milestone all land in a single setSave, so a crash can never
  // persist half a grant. The updater is pure (StrictMode runs it twice in
  // dev) — every random roll already happened in computeBattleRewards.
  const grantBattleRewards = (
    rewards: BattleRewards,
    ctx: {
      mode: BattleMode;
      floor: number;
      dungeonId: string;
      wavesSurvived?: number;
      deck?: readonly string[];
      outcome?: "victory" | "defeat" | "draw";
      slain?: readonly string[];
    }
  ) =>
    setSave((s) => {
      // Whole-deck XP: every fielded unit earns the full amount (addXp is the
      // same clamp the RewardPanel preview uses, so preview ≡ persisted).
      const unitXp = { ...s.unitXp };
      if (rewards.xp > 0) {
        for (const id of new Set(ctx.deck ?? [])) {
          unitXp[id] = addXp(unitXp[id] ?? 0, rewards.xp);
        }
      }
      // Chest contents → currency/unlocks/stacks (the fold shared with quest
      // claims), on top of the flat battle gold/shards.
      const folded = foldChestContents(
        {
          gold: s.gold + rewards.gold,
          soulShards: s.soulShards + rewards.shards,
          items: s.items,
          unlockedUnits: s.unlockedUnits,
        },
        rewards.chest?.contents ?? []
      );
      const gold = folded.gold;
      const soulShards = folded.soulShards;
      const items = folded.items;
      const unlocked = new Set(folded.unlockedUnits);
      // Quest progress: fold this battle's facts into the accepted quests.
      const activeQuests = tickQuestProgress(s.quests.active, {
        mode: ctx.mode,
        outcome: ctx.outcome ?? "draw",
        deck: ctx.deck ?? [],
        slain: ctx.slain ?? [],
        wavesSurvived: ctx.wavesSurvived ?? 0,
      });
      const quests =
        activeQuests === s.quests.active
          ? s.quests
          : { ...s.quests, active: activeQuests };
      // Endless: fold the run's depth into the best-wave high-water mark.
      const endless =
        ctx.mode === "endless"
          ? { bestWave: Math.max(s.endless.bestWave, ctx.wavesSurvived ?? 0) }
          : s.endless;
      let dungeons = s.dungeons;
      if (ctx.mode === "depths" && rewards.firstClear) {
        // First boss kill CLEARS the dungeon (the RNG "hunt for the boss" model:
        // firstClear fires only on the first boss defeat). Write the dungeon's
        // floor count as the completion high-water mark — the same >= floors
        // signal the gate chain and world map already read as "cleared".
        const floors = getDungeon(ctx.dungeonId).floors;
        const prev = s.dungeons[ctx.dungeonId]?.highestClearedFloor ?? 0;
        dungeons = {
          ...s.dungeons,
          [ctx.dungeonId]: { highestClearedFloor: Math.max(prev, floors) },
        };
        // Clearing a dungeon hands over ALL of its milestone gifts at once
        // (MILESTONE_UNLOCKS is dungeonId → floor → unit id).
        const gifts = MILESTONE_UNLOCKS[ctx.dungeonId];
        if (gifts) for (const unitId of Object.values(gifts)) unlocked.add(unitId);
      }
      // Rare-spawn quest completion → the reward unit(s) become purchasable
      // (the Sealed Vault quest pays out two from the one kill).
      const questUnlocks = new Set(s.questUnlocks);
      for (const id of rewards.questUnlocks ?? []) questUnlocks.add(id);
      return {
        ...s,
        gold,
        soulShards,
        items,
        unitXp,
        unlockedUnits: [...unlocked],
        dungeons,
        questUnlocks: [...questUnlocks],
        endless,
        quests,
        itemPity: nextItemPity(s.itemPity, rewards.chest?.contents ?? null),
      };
    });

  const purchaseUnit = (unitId: string) =>
    setSave((s) => {
      const def = UNITS[unitId];
      if (!def || s.unlockedUnits.includes(unitId)) return s;
      // Quest-locked units can't be bought until their rare-spawn quest is done,
      // and then only at the quest's discounted price. Everything else uses the
      // standard rarity price.
      const quest = questForUnlock(unitId);
      if (quest && !s.questUnlocks.includes(unitId)) return s;
      const price = quest ? quest.price : UNLOCK_PRICES[def.rarity];
      if (s.gold < price) return s;
      return {
        ...s,
        gold: s.gold - price,
        unlockedUnits: [...s.unlockedUnits, unitId],
      };
    });

  // ---- items — every fold is pure (StrictMode-safe) and preserves the
  // references ≤ counts invariant via meta/inventory. ------------------------
  const equipItem = (defId: string, key: ItemKey) =>
    setSave((s) => {
      const p = parseItemKey(key);
      if (!p || !UNITS[defId]) return s;
      if (!s.unlockedUnits.includes(defId)) return s;
      if (!canEquip(s, defId, key)) return s;
      return {
        ...s,
        loadouts: {
          ...s.loadouts,
          [defId]: { ...s.loadouts[defId], [p.line.slot]: key },
        },
      };
    });

  const unequipItem = (defId: string, slot: ItemSlot) =>
    setSave((s) => {
      const current = s.loadouts[defId];
      if (!current?.[slot]) return s;
      const next = { ...current };
      delete next[slot];
      const loadouts = { ...s.loadouts };
      if (next.weapon || next.armor || next.trinket) loadouts[defId] = next;
      else delete loadouts[defId];
      return { ...s, loadouts };
    });

  const combineItems = (key: ItemKey) =>
    setSave((s) => {
      const folded = combineFold(s, key);
      if (folded === (s as typeof folded)) return s;
      return {
        ...s,
        items: folded.items,
        loadouts: folded.loadouts,
        gold: folded.gold,
        soulShards: folded.soulShards,
      };
    });

  // ---- blacksmith — folds live in meta/blacksmith (pure, StrictMode-safe,
  // no RNG anywhere); these wrappers only bind them to setSave. -------------
  const salvageItem = (key: ItemKey) => setSave((s) => salvageFold(s, key));
  const commissionItem = (lineId: string) =>
    setSave((s) => commissionFold(s, lineId));
  const commissionItems = (lineId: string, qty: number) =>
    setSave((s) => commissionManyFold(s, lineId, qty));
  const forgeAll = () => setSave((s) => forgeAllFold(s));

  // ---- shop — the folds live in meta/shop (pure, StrictMode-safe); these
  // wrappers only bind them to setSave. ------------------------------------
  const visitShop = (todayIdx: number) =>
    setSave((s) => {
      const shop = normalizeShopDay(s.shop, todayIdx);
      return shop === s.shop ? s : { ...s, shop };
    });
  const purchaseShopItem = (todayIdx: number, slotIdx: number) =>
    setSave((s) => applyShopPurchase(s, todayIdx, slotIdx));
  const rerollShop = (todayIdx: number) =>
    setSave((s) => applyShopReroll(s, todayIdx));

  // ---- quest board — folds live in meta/quests (pure, StrictMode-safe);
  // these wrappers only bind them to setSave. ------------------------------
  const visitQuestBoard = (todayIdx: number) =>
    setSave((s) => {
      const quests = normalizeQuestBoard(s.quests, todayIdx);
      return quests === s.quests ? s : { ...s, quests };
    });
  const acceptQuest = (todayIdx: number, noticeId: string) =>
    setSave((s) => applyAcceptQuest(s, todayIdx, noticeId));
  const abandonQuest = (questId: string) =>
    setSave((s) => applyAbandonQuest(s, questId));
  const refreshQuestBoard = (todayIdx: number) =>
    setSave((s) => applyBoardRefresh(s, todayIdx));
  // The chest was rolled in the sheet BEFORE this fold (grant-then-reveal),
  // so the updater stays pure; the active-quest gate makes re-runs no-op.
  const claimQuest = (questId: string, chestContents: ChestContent[]) =>
    setSave((s) => applyClaimQuest(s, questId, chestContents));

  // ---- dev cheats (LOCAL ONLY) — the entire object is undefined in production.
  // `import.meta.env.DEV` is statically `false` in `vite build`, so this ternary
  // folds to `undefined`, the closures below are dropped, and DevPanel (mounted
  // behind the same gate) tree-shakes out. Nothing here reaches the live site.
  const dev: DevCheats | undefined = import.meta.env.DEV
    ? {
        unlockAllUnits: () =>
          setSave((s) => ({
            ...s,
            unlockedUnits: [...new Set([...s.unlockedUnits, ...DECKABLE_UNIT_IDS])],
            questUnlocks: [...new Set([...s.questUnlocks, ...QUEST_LOCKED_UNITS])],
          })),
        addGold: (amount) =>
          setSave((s) => ({ ...s, gold: Math.max(0, s.gold + amount) })),
        addShards: (amount) =>
          setSave((s) => ({ ...s, soulShards: Math.max(0, s.soulShards + amount) })),
        unlockAllDungeons: () =>
          setSave((s) => {
            const dungeons = { ...s.dungeons };
            for (const id of DUNGEON_IDS) dungeons[id] = { highestClearedFloor: 99 };
            return { ...s, dungeons };
          }),
        revealBestiary: () =>
          setSave((s) => ({
            ...s,
            bestiary: Object.fromEntries(
              Object.keys(UNITS).map((id) => [
                id,
                { encountered: true, defeated: true },
              ])
            ),
          })),
        grantAllItems: () =>
          setSave((s) => {
            // A stack of every (line, quality, star) triple. `max` keeps it
            // idempotent (re-clicking never shrinks a stack you built by play)
            // and can't break the references-<=-count invariant, since it only
            // ever raises counts. 9 is plenty to equip across a deck + merge.
            const COPIES = 9;
            const items = { ...s.items };
            for (const lineId of Object.keys(ITEM_LINES)) {
              for (const quality of ITEM_QUALITIES) {
                for (let star = 1; star <= MAX_STARS; star++) {
                  const key = makeItemKey(lineId, quality, star);
                  items[key] = Math.max(items[key] ?? 0, COPIES);
                }
              }
            }
            return { ...s, items };
          }),
        resetSave: () => setSave(() => structuredClone(DEFAULT_SAVE)),
      }
    : undefined;

  return (
    <GameStateContext.Provider
      value={{
        save,
        setDeck,
        setUsername,
        setAvatar,
        recordResult,
        recordBestiary,
        grantBattleRewards,
        purchaseUnit,
        equipItem,
        unequipItem,
        combineItems,
        salvageItem,
        commissionItem,
        commissionItems,
        forgeAll,
        visitShop,
        purchaseShopItem,
        rerollShop,
        visitQuestBoard,
        acceptQuest,
        abandonQuest,
        refreshQuestBoard,
        claimQuest,
        dev,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState(): GameStateValue {
  const ctx = useContext(GameStateContext);
  if (!ctx)
    throw new Error("useGameState must be used within GameStateProvider");
  return ctx;
}

export { DEFAULT_SAVE };
