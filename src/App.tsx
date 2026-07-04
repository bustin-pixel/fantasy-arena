import { useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { BattleMode } from "@/hooks/useBattleEngine";

function Shell() {
  const [view, setView] = useState<"shell" | "battle">("shell");
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  const [battleFloor, setBattleFloor] = useState(1);
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  if (view === "battle") {
    return (
      <BattleScreen
        deck={activeDeck}
        mode={battleMode}
        floor={battleFloor}
        onExit={() => setView("shell")}
      />
    );
  }
  return (
    <AppShell
      onBattle={(mode, floor = 1) => {
        setActiveDeck(save.deck.slice(0, 4));
        setBattleMode(mode);
        setBattleFloor(floor);
        setView("battle");
      }}
    />
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
