// ============================================================================
// GameStateContext
// React Context wrapping the persistent player save. This is the ONLY place
// React holds long-lived game data; the combat simulation deliberately lives
// outside React (see useBattleEngine) so re-renders never touch the sim.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SAVE,
  loadSave,
  writeSave,
  type PlayerSave,
} from "./persistence";

interface GameStateValue {
  save: PlayerSave;
  setDeck: (deck: string[]) => void;
  setUsername: (name: string) => void;
  recordResult: (won: boolean) => void;
  /** Fold a battle's enemy roster into the Compendium: everything fielded
   *  against you counts as encountered; everything that died counts as
   *  defeated. Reveals only ever go forward (no un-discovering). */
  recordBestiary: (seen: string[], slain: string[]) => void;
}

const GameStateContext = createContext<GameStateValue | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<PlayerSave>(() => loadSave());

  useEffect(() => {
    writeSave(save);
  }, [save]);

  const setDeck = (deck: string[]) =>
    setSave((s) => ({ ...s, deck }));
  const setUsername = (username: string) =>
    setSave((s) => ({ ...s, username }));
  const recordResult = (won: boolean) =>
    setSave((s) => ({
      ...s,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
    }));
  const recordBestiary = (seen: string[], slain: string[]) =>
    setSave((s) => {
      const bestiary = { ...s.bestiary };
      for (const id of seen) {
        bestiary[id] = {
          encountered: true,
          defeated: bestiary[id]?.defeated ?? false,
        };
      }
      for (const id of slain) {
        bestiary[id] = { encountered: true, defeated: true };
      }
      return { ...s, bestiary };
    });

  return (
    <GameStateContext.Provider
      value={{ save, setDeck, setUsername, recordResult, recordBestiary }}
    >
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState(): GameStateValue {
  const ctx = useContext(GameStateContext);
  if (!ctx)
    throw new Error("useGameState must be used within GameStateProvider");
  return ctx;
}

export { DEFAULT_SAVE };
