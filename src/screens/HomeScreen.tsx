import { useMemo, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { ArenaIcon, SwarmIcon } from "@/components/ModeIcons";
import {
  FloorPickerSheet,
  MAX_FLOOR_WITH_DATA,
} from "@/components/FloorPickerSheet";
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
  const nextFloor = Math.min(
    save.depths.highestClearedFloor + 1,
    MAX_FLOOR_WITH_DATA
  );

  const winRate = useMemo(() => {
    const total = save.wins + save.losses;
    return total === 0 ? 0 : Math.round((save.wins / total) * 100);
  }, [save.wins, save.losses]);

  return (
    <div className="screen home">
      <header className="home-header">
        <h1 className="title home-title">Fantasy Arena</h1>
        <p className="subtitle">Deploy &amp; Conquer.</p>
      </header>

      <div className="stat-block home-stats">
        <div className="stat">
          <span className="stat-val">{save.wins}</span>
          <span className="stat-lbl">Wins</span>
        </div>
        <div className="stat">
          <span className="stat-val">{save.losses}</span>
          <span className="stat-lbl">Losses</span>
        </div>
        <div className="stat">
          <span className="stat-val">{winRate}%</span>
          <span className="stat-lbl">Win Rate</span>
        </div>
      </div>

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
