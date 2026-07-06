import { useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { ArenaIcon, SwarmIcon } from "@/components/ModeIcons";
import { FloorPickerSheet } from "@/components/FloorPickerSheet";
import { DungeonMapSheet } from "@/components/DungeonMapSheet";
import { ProfilePlate } from "@/components/ProfilePlate";
import { ProfileSheet } from "@/components/ProfileSheet";
import { getDungeon } from "@/data/dungeons";
import { highestClearedFloorOf } from "@/state/persistence";
import type { BattleMode } from "@/hooks/useBattleEngine";

interface Props {
  onBattle: (mode: BattleMode, floor?: number, dungeonId?: string) => void;
}

/**
 * The landing page — pick a game mode. Arena battles an AI-generated warband
 * (mode "solo"); the Dungeons card opens the dungeon-select map (The Depths +
 * the themed legendary dungeons), then a floor picker for the chosen dungeon.
 */
export function HomeScreen({ onBattle }: Props) {
  const { save } = useGameState();
  // A single unit is enough to battle — the engine fields whatever you bring
  // (readiness is min(deckSize, activeCap)); an empty deck is the only block.
  const ready = save.deck.length >= 1;
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
      </div>

      {!ready && (
        <p className="home-hint">← Swipe to Collection to build your warband</p>
      )}

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
