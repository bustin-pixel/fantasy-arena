import { useEffect, useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ShopScreen } from "@/screens/ShopScreen";
import { DevPanel } from "@/components/DevPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { pickDungeonTrack, setMusicTrack } from "@/audio/music";
import type { BattleMode } from "@/hooks/useBattleEngine";

function Shell() {
  const [view, setView] = useState<"shell" | "battle" | "shop">("shell");
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  const [battleFloor, setBattleFloor] = useState(1);
  const [battleDungeonId, setBattleDungeonId] = useState("depths");
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);

  // Soundtrack follows the view: hub theme in the shell; battles get the
  // Arena groove or the dungeon's own floor/boss tracks; Grubbins gets his den.
  useEffect(() => {
    if (view === "battle") {
      setMusicTrack(
        battleMode === "depths"
          ? pickDungeonTrack(battleDungeonId, battleFloor)
          : // Endless borrows the Depths soundtrack for now (per-cycle track
            // rotation is a later polish pass); Arena keeps its groove.
            battleMode === "endless"
            ? pickDungeonTrack("depths", 1)
            : "blackblade"
      );
    } else if (view === "shop") {
      setMusicTrack("shopTheme");
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
      ) : view === "shop" ? (
        <ShopScreen onExit={() => setView("shell")} />
      ) : (
        <AppShell
          onBattle={(mode, floor = 1, dungeonId = "depths") => {
            setActiveDeck(save.deck.slice(0, 4));
            setBattleMode(mode);
            setBattleFloor(floor);
            setBattleDungeonId(dungeonId);
            setView("battle");
          }}
          onOpenShop={() => setView("shop")}
        />
      )}
      {/* Local-only cheats. `import.meta.env.DEV` is a literal `false` in the
          production build, so this branch (and DevPanel) is dropped from the
          deployed bundle — it exists only while running `npm run dev`. */}
      {import.meta.env.DEV && <DevPanel />}
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
