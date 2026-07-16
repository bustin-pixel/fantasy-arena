import { useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { ArenaIcon, EndlessIcon, SwarmIcon } from "@/components/ModeIcons";
import { ProfilePlate } from "@/components/ProfilePlate";
import { ProfileSheet } from "@/components/ProfileSheet";
import { endlessBestWave, highestClearedFloorOf } from "@/state/persistence";
import { dayIndexLocal } from "@/meta/shop";
import { forgeableStackCount } from "@/meta/blacksmith";
import type { BattleMode } from "@/hooks/useBattleEngine";
import { playSfx } from "@/audio/sfx";

/** Endless unlocks once the player has cleared the fifth Depths floor — the same
 *  gate the themed legendary dungeons use. */
const ENDLESS_GATE_FLOOR = 5;

interface Props {
  onBattle: (mode: BattleMode, floor?: number, dungeonId?: string) => void;
  /** Open the Blacksmith's forge — the items home (a full-screen App view). */
  onOpenBlacksmith: () => void;
  /** Open Grubbins' shop (a full-screen App view). */
  onOpenShop: () => void;
  /** Open the quest bulletin board (rendered by AppShell as an overlay). */
  onOpenQuests: () => void;
  /** Open the Dungeon Atlas (rendered by AppShell as an overlay). */
  onOpenAtlas: () => void;
}

/**
 * The landing page — pick a game mode. Arena battles an AI-generated warband
 * (mode "solo"); the Dungeons card opens the Dungeon Atlas (the winding-trail
 * map of The Depths + the themed legendary dungeons and their floors).
 */
export function HomeScreen({
  onBattle,
  onOpenBlacksmith,
  onOpenShop,
  onOpenQuests,
  onOpenAtlas,
}: Props) {
  const { save } = useGameState();
  // Forge pip: stacks with an affordable merge RIGHT NOW — self-clears as
  // merges complete or stop being affordable (unlike a raw item count).
  const forgeable = forgeableStackCount(save);
  // Shop pip: today's shelf hasn't been seen yet (opening the shop rolls
  // save.shop.day forward via visitShop, which clears this).
  const newStock = save.shop.day !== dayIndexLocal();
  // Quest pip: fresh notices today (board day is stale) OR an accepted quest
  // is ready to claim. Opening the board clears the day half.
  const questAlert =
    save.quests.day !== dayIndexLocal() ||
    save.quests.active.some((q) => q.progress >= q.goal);
  // A single unit is enough to battle — the engine fields whatever you bring
  // (readiness is min(deckSize, activeCap)); an empty deck is the only block.
  const ready = save.deck.length >= 1;
  const endlessUnlocked =
    highestClearedFloorOf(save, "depths") >= ENDLESS_GATE_FLOOR;
  const bestWave = endlessBestWave(save);
  const [editingProfile, setEditingProfile] = useState(false);

  return (
    <div className="screen home">
      <header className="home-header">
        <h1 className="title home-title">Fantasy Arena</h1>
        <p className="subtitle">Deploy &amp; Conquer.</p>
      </header>

      {/* The old stat block, promoted into the player's identity card. */}
      <ProfilePlate
        name={save.username}
        avatarId={save.avatarId}
        wins={save.wins}
        losses={save.losses}
        onEdit={() => { playSfx("uiOpen"); setEditingProfile(true); }}
      />

      <div className="mode-cards">
        <button
          type="button"
          className="mode-card arena"
          disabled={!ready}
          onClick={() => { playSfx("uiConfirm"); onBattle("solo"); }}
        >
          <ArenaIcon />
          <span className="mode-card-title">Arena</span>
          <span className="mode-card-sub">
            {ready ? "Battle a rival warband" : "Build a warband to play"}
          </span>
        </button>

        <button
          type="button"
          className="mode-card swarm"
          disabled={!ready}
          onClick={() => { playSfx("uiOpen"); onOpenAtlas(); }}
        >
          <SwarmIcon />
          <span className="mode-card-title">Dungeons</span>
          <span className="mode-card-sub">
            {ready ? "Descend for gold & legends" : "Build a warband to play"}
          </span>
        </button>

        <button
          type="button"
          className="mode-card endless"
          disabled={!ready || !endlessUnlocked}
          onClick={() => { playSfx("uiConfirm"); onBattle("endless"); }}
        >
          <EndlessIcon />
          <span className="mode-card-title">Endless</span>
          <span className="mode-card-sub">
            {!ready
              ? "Build a warband to play"
              : !endlessUnlocked
              ? "Clear Depths floor 5 to unlock"
              : bestWave > 0
              ? `Best: Wave ${bestWave}`
              : "Survive the endless horde"}
          </span>
        </button>
      </div>

      {!ready && (
        <p className="home-hint">← Swipe to Collection to build your warband</p>
      )}

      {/* Floating Forge button — bottom-right, above the Compendium tab. The
          badge counts stacks the smith can merge right now. */}
      <button
        type="button"
        className="home-forge-fab"
        aria-label="Open the Forge"
        onClick={() => { playSfx("uiOpen"); onOpenBlacksmith(); }}
      >
        <span className="home-forge-emoji" aria-hidden>
          ⚒️
        </span>
        <span className="home-forge-text">Forge</span>
        {forgeable > 0 && <span className="home-forge-count">{forgeable}</span>}
      </button>

      {/* Floating Shop button — bottom-left, the Bag's mirror twin. */}
      <button
        type="button"
        className="home-shop-fab"
        aria-label="Open Shop"
        onClick={() => { playSfx("uiOpen"); onOpenShop(); }}
      >
        <span className="home-shop-emoji" aria-hidden>
          💰
        </span>
        <span className="home-shop-text">Shop</span>
        {newStock && <span className="home-shop-dot" />}
      </button>

      {/* Floating Quests button — bottom-center between Shop and Bag. The
          gold "!" is a styled glyph (the classic quest-giver marker). */}
      <button
        type="button"
        className="home-quest-fab"
        aria-label="Open Quests"
        onClick={onOpenQuests}
      >
        <span className="home-quest-glyph" aria-hidden>
          !
        </span>
        <span className="home-quest-text">Quests</span>
        {questAlert && <span className="home-quest-dot" />}
      </button>

      {editingProfile && (
        <ProfileSheet onClose={() => setEditingProfile(false)} />
      )}
    </div>
  );
}
