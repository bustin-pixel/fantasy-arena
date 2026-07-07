import { useEffect, useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { pickDungeonTrack, setMusicTrack } from "@/audio/music";
import type { BattleMode } from "@/hooks/useBattleEngine";

function Shell() {
  const [view, setView] = useState<"shell" | "battle">("shell");
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  const [battleFloor, setBattleFloor] = useState(1);
  const [battleDungeonId, setBattleDungeonId] = useState("depths");
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  // Soundtrack follows the view: hub theme in the shell; battles get the
  // Arena groove or the dungeon's own floor/boss tracks.
  useEffect(() => {
    if (view === "battle") {
      setMusicTrack(
        battleMode === "depths"
          ? pickDungeonTrack(battleDungeonId, battleFloor)
          : "blackblade"
      );
    } else {
      setMusicTrack("emberfall");
    }
  }, [view, battleMode, battleFloor, battleDungeonId]);

  return (
    <>
      {view === "battle" ? (
        <BattleScreen
          deck={activeDeck}
          mode={battleMode}
          floor={battleFloor}
          dungeonId={battleDungeonId}
          onExit={() => setView("shell")}
        />
      ) : (
        <AppShell
          onBattle={(mode, floor = 1, dungeonId = "depths") => {
            setActiveDeck(save.deck.slice(0, 4));
            setBattleMode(mode);
            setBattleFloor(floor);
            setBattleDungeonId(dungeonId);
            setView("battle");
          }}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameStateProvider>
        <div className="app-root">
          <Shell />
        </div>
      </GameStateProvider>
    </ErrorBoundary>
  );
}
