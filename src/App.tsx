import { useEffect, useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { pickDepthsTrack, setMusicTrack } from "@/audio/music";
import type { BattleMode } from "@/hooks/useBattleEngine";

function Shell() {
  const [view, setView] = useState<"shell" | "battle">("shell");
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  const [battleFloor, setBattleFloor] = useState(1);
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  // Soundtrack follows the view: hub theme in the shell; battles get the
  // Arena groove or a Depths ambience (boss floors get The Warden).
  useEffect(() => {
    if (view === "battle") {
      setMusicTrack(
        battleMode === "depths" ? pickDepthsTrack(battleFloor) : "blackblade"
      );
    } else {
      setMusicTrack("emberfall");
    }
  }, [view, battleMode, battleFloor]);

  return (
    <>
      {view === "battle" ? (
        <BattleScreen
          deck={activeDeck}
          mode={battleMode}
          floor={battleFloor}
          onExit={() => setView("shell")}
        />
      ) : (
        <AppShell
          onBattle={(mode, floor = 1) => {
            setActiveDeck(save.deck.slice(0, 4));
            setBattleMode(mode);
            setBattleFloor(floor);
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
