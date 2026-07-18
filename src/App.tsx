import { useEffect, useState } from "react";
import { GameStateProvider, useGameState } from "@/state/GameStateContext";
import { AppShell } from "@/screens/AppShell";
import { BattleScreen } from "@/screens/BattleScreen";
import { ShopScreen } from "@/screens/ShopScreen";
import { BlacksmithScreen } from "@/screens/BlacksmithScreen";
import { DevPanel } from "@/components/DevPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { pickDungeonTrack, setMusicTrack } from "@/audio/music";
import type { BattleMode } from "@/hooks/useBattleEngine";
import { getDungeon } from "@/data/dungeons";
import { isBossDepth, makeRun, type DungeonRun } from "@/data/dungeonRun";
import type { TierId } from "@/data/tiers";
import { generateSeed } from "@/utils/rng";

function Shell() {
  const [view, setView] = useState<"shell" | "battle" | "shop" | "blacksmith">(
    "shell"
  );
  const [battleMode, setBattleMode] = useState<BattleMode>("solo");
  // The active dungeon dive (the RNG "hunt for the boss" descent): floor number
  // + run seed + the rolled boss depth, carried seamlessly across floors WITHOUT
  // bouncing back to the atlas. Null outside a dungeon (arena/endless). The floor
  // number is hidden from the player; it only drives scaling.
  const [run, setRun] = useState<DungeonRun | null>(null);
  const { save } = useGameState();
  // Snapshot the deck at battle start so mid-battle edits can't mutate it.
  const [activeDeck, setActiveDeck] = useState<string[]>([]);
  // After a dungeon is CLEARED (boss defeated), open the atlas world map on
  // return so its unlock ceremony (a newly-revealed dungeon) plays.
  const [openAtlasWorld, setOpenAtlasWorld] = useState(false);

  const inDungeon = view === "battle" && battleMode === "depths" && run != null;
  const floor = inDungeon ? run.depth : 1;

  // Soundtrack follows the view: hub theme in the shell; battles get the
  // Arena groove or the dungeon's own floor/boss tracks; Grubbins gets his
  // den; the smith gets his forge.
  useEffect(() => {
    if (view === "battle") {
      setMusicTrack(
        battleMode === "depths"
          ? pickDungeonTrack(run?.dungeonId ?? "depths", floor)
          : // Endless borrows the Depths soundtrack for now (per-cycle track
            // rotation is a later polish pass); Arena keeps its groove.
            battleMode === "endless"
            ? pickDungeonTrack("depths", 1)
            : "blackblade"
      );
    } else if (view === "shop") {
      setMusicTrack("shopTheme");
    } else if (view === "blacksmith") {
      setMusicTrack("blacksmithTheme");
    } else {
      setMusicTrack("emberfall");
    }
  }, [view, battleMode, floor, run?.dungeonId]);

  // Start a fresh dungeon run at floor 1, at the picked difficulty tier (the
  // atlas "Enter Dungeon" button). The tier is frozen into the run.
  const enterDungeon = (dungeonId: string, tier: TierId) => {
    setActiveDeck(save.deck.slice(0, 4));
    setBattleMode("depths");
    setRun(makeRun(dungeonId, getDungeon(dungeonId), generateSeed(), tier));
    setView("battle");
  };

  const leaveBattle = () => {
    setRun(null);
    setView("shell");
  };

  return (
    <>
      {view === "battle" ? (
        battleMode === "depths" && run ? (
          <BattleScreen
            // Re-key per floor (and tier, belt-and-braces) so React mounts a
            // FRESH sim each descent — the seamless walk-off → next-arena
            // hand-off, with no atlas in between.
            key={`${run.dungeonId}:${run.tier}:${run.depth}`}
            deck={activeDeck}
            mode="depths"
            floor={run.depth}
            dungeonId={run.dungeonId}
            encounter={run.encounter}
            tier={run.tier}
            isBoss={isBossDepth(run)}
            nextIsBoss={isBossDepth(run, run.depth + 1)}
            // On the boss floor, skip the fusion-quest rare if the run already
            // met it on a rare-quarry encounter (mutual exclusivity).
            suppressQuestRare={run.rareSpawned}
            // The previous floor's deploy marks — fields this floor's warband
            // automatically (the march-in). Undefined on floor 1 (manual).
            formation={run.formation}
            onExit={leaveBattle}
            onContinueDeeper={(_dungeonId, encounter, formation) =>
              // Advance in place — bump the depth + carry the chosen omen and the
              // deploy marks; the key change above remounts the battle on the next
              // floor. Entering a rare-quarry floor marks the run's rare as met.
              setRun((r) =>
                r
                  ? {
                      ...r,
                      depth: r.depth + 1,
                      encounter,
                      formation: formation ?? undefined,
                      rareSpawned: r.rareSpawned || encounter === "rare_spawn",
                    }
                  : r
              )
            }
            onDungeonCleared={() => {
              setRun(null);
              setOpenAtlasWorld(true);
              setView("shell");
            }}
          />
        ) : (
          <BattleScreen
            deck={activeDeck}
            mode={battleMode}
            onExit={leaveBattle}
          />
        )
      ) : view === "shop" ? (
        <ShopScreen onExit={() => setView("shell")} />
      ) : view === "blacksmith" ? (
        <BlacksmithScreen onExit={() => setView("shell")} />
      ) : (
        <AppShell
          onBattle={(mode) => {
            setActiveDeck(save.deck.slice(0, 4));
            setBattleMode(mode);
            setRun(null);
            setView("battle");
          }}
          onEnterDungeon={enterDungeon}
          onOpenShop={() => setView("shop")}
          onOpenBlacksmith={() => setView("blacksmith")}
          openAtlasWorld={openAtlasWorld}
          onAtlasConsumed={() => setOpenAtlasWorld(false)}
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
