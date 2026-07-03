import { useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { BattleMode } from "@/hooks/useBattleEngine";

function Shell() {
  const [view, setView] = useState<"shell" | "battle">("shell");
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  if (view === "battle") {
    return (
      <BattleScreen
        deck={activeDeck}
        mode={battleMode}
        onExit={() => setView("shell")}
      />
    );
  }
  return (
    <AppShell
      onBattle={(mode) => {
        setActiveDeck(save.deck.slice(0, 4));
        setBattleMode(mode);
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
