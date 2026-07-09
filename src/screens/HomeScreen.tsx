import { useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { ArenaIcon, EndlessIcon, SwarmIcon } from "@/components/ModeIcons";
import { FloorPickerSheet } from "@/components/FloorPickerSheet";
import { DungeonMapSheet } from "@/components/DungeonMapSheet";
import { ProfilePlate } from "@/components/ProfilePlate";
import { ProfileSheet } from "@/components/ProfileSheet";
import { getDungeon } from "@/data/dungeons";
import { endlessBestWave, highestClearedFloorOf } from "@/state/persistence";
import type { BattleMode } from "@/hooks/useBattleEngine";

/** Endless unlocks once the player has cleared the fifth Depths floor — the same
 *  gate the themed legendary dungeons use. */
const ENDLESS_GATE_FLOOR = 5;

interface Props {
  onBattle: (mode: BattleMode, floor?: number, dungeonId?: string) => void;
  /** Open the equipment Bag (rendered by AppShell so it overlays everything). */
  onOpenBag: () => void;
}

/**
 * The landing page — pick a game mode. Arena battles an AI-generated warband
 * (mode "solo"); the Dungeons card opens the dungeon-select map (The Depths +
 * the themed legendary dungeons), then a floor picker for the chosen dungeon.
 */
export function HomeScreen({ onBattle, onOpenBag }: Props) {
  const { save } = useGameState();
  // Total items owned (across all stacks) for the Bag button's count badge.
  const bagCount = Object.values(save.items).reduce((n, c) => n + c, 0);
  // A single unit is enough to battle — the engine fields whatever you bring
  // (readiness is min(deckSize, activeCap)); an empty deck is the only block.
  const ready = save.deck.length >= 1;
  const endlessUnlocked =
    highestClearedFloorOf(save, "depths") >= ENDLESS_GATE_FLOOR;
  const bestWave = endlessBestWave(save);
  const [mapOpen, setMapOpen] = useState(false);
  const [pickDungeonId, setPickDungeonId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const pickDungeon = pickDungeonId ? getDungeon(pickDungeonId) : null;

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
        onEdit={() => setEditingProfile(true)}
      />

      <div className="mode-cards">
        <button
          type="button"
          className="mode-card arena"
          disabled={!ready}
          onClick={() => onBattle("solo")}
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
          onClick={() => setMapOpen(true)}
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
          onClick={() => onBattle("endless")}
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

      {/* Floating Bag button — bottom-right, above the Compendium tab. */}
      <button
        type="button"
        className="home-bag-fab"
        aria-label="Open Bag"
        onClick={onOpenBag}
      >
        <span className="home-bag-emoji" aria-hidden>
          🎒
        </span>
        <span className="home-bag-text">Bag</span>
        {bagCount > 0 && <span className="home-bag-count">{bagCount}</span>}
      </button>

      {editingProfile && (
        <ProfileSheet onClose={() => setEditingProfile(false)} />
      )}

      {mapOpen && (
        <DungeonMapSheet
          save={save}
          onPick={(id) => {
            setMapOpen(false);
            setPickDungeonId(id);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}

      {pickDungeon && (
        <FloorPickerSheet
          dungeon={pickDungeon}
          highestClearedFloor={highestClearedFloorOf(save, pickDungeon.id)}
          onDescend={(floor) => {
            setPickDungeonId(null);
            onBattle("depths", floor, pickDungeon.id);
          }}
          onClose={() => setPickDungeonId(null)}
        />
      )}
    </div>
  );
}
