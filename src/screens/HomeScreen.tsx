import { useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { ArenaIcon, SwarmIcon } from "@/components/ModeIcons";
import {
  FloorPickerSheet,
  MAX_FLOOR_WITH_DATA,
} from "@/components/FloorPickerSheet";
import { ProfilePlate } from "@/components/ProfilePlate";
import { ProfileSheet } from "@/components/ProfileSheet";
import type { BattleMode } from "@/hooks/useBattleEngine";

interface Props {
  onBattle: (mode: BattleMode, floor?: number) => void;
}

/**
 * The landing page — pick a game mode. Arena battles an AI-generated warband
 * (mode "solo"); The Depths is the PvE descent (mode "depths") — its card
 * opens the floor picker, defaulting to the next uncleared floor.
 */
export function HomeScreen({ onBattle }: Props) {
  const { save } = useGameState();
  const ready = save.deck.length >= 2;
  const [pickingFloor, setPickingFloor] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const nextFloor = Math.min(
    save.depths.highestClearedFloor + 1,
    MAX_FLOOR_WITH_DATA
  );

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
          onClick={() => setPickingFloor(true)}
        >
          <SwarmIcon />
          <span className="mode-card-title">The Depths</span>
          <span className="mode-card-sub">
            {ready ? `Descend — Floor ${nextFloor}` : "Build a warband to play"}
          </span>
        </button>
      </div>

      {!ready && (
        <p className="home-hint">← Swipe to Collection to build your warband</p>
      )}

      {editingProfile && (
        <ProfileSheet onClose={() => setEditingProfile(false)} />
      )}

      {pickingFloor && (
        <FloorPickerSheet
          highestClearedFloor={save.depths.highestClearedFloor}
          onDescend={(floor) => {
            setPickingFloor(false);
            onBattle("depths", floor);
          }}
          onClose={() => setPickingFloor(false)}
        />
      )}
    </div>
  );
}
