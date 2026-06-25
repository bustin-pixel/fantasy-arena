import { useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { HubScreen } from "@/screens/HubScreen";
import { BattleScreen } from "@/screens/BattleScreen";

type Screen = "hub" | "battle";

function Shell() {
  const [screen, setScreen] = useState<Screen>("hub");
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  if (screen === "battle") {
    return (
      <BattleScreen deck={activeDeck} onExit={() => setScreen("hub")} />
    );
  }
  return (
    <HubScreen
      onBattle={() => {
        setActiveDeck(save.deck.slice(0, 4));
        setScreen("battle");
      }}
    />
  );
}

export default function App() {
  return (
    <GameStateProvider>
      <div className="app-root">
        <Shell />
      </div>
    </GameStateProvider>
  );
}
