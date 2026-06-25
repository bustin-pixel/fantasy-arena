// ============================================================================
// useBattleEngine
// Bridges the framework-free engine to React WITHOUT putting the simulation in
// React state. The MatchController and the render loop live in refs; the only
// React state we expose is a lightweight "uiState" (phase + clock + counts)
// that updates a few times per second so HUD text stays current. The canvas is
// painted every animation frame directly from the snapshot — zero re-renders
// in the hot path.
//
// Two independent loops:
//   • Simulation: a fixed-timestep accumulator advancing at TICK_RATE (20/s).
//   • Render: requestAnimationFrame, painting the latest snapshot.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchPhase, Team, Vec2 } from "@/types";
import { MatchController } from "@/engine/MatchController";
import { renderBattle } from "@/engine/Renderer";
import { generateEnemyDeck } from "@/engine/AIDeck";
import { TICK_MS, TICK_RATE } from "@/utils/constants";
import { generateSeed } from "@/utils/rng";

/** Battle mode. Solo allows client-side fast-forward; PVP is server-paced at 1×
 *  (a real-time match can't let one client run the sim faster than the other). */
export type BattleMode = "solo" | "pvp";

export interface HandCard {
  index: number;
  defId: string;
  selected: boolean;
}

export interface BattleUiState {
  phase: MatchPhase;
  tick: number;
  clockSec: number;
  playerActive: number;
  enemyActive: number;
  playerNext: string | null;
  canDeploy: boolean;
  /** Remaining undeployed player cards, for the bottom tray. */
  hand: HandCard[];
  /** Seconds left on the pre-battle countdown, or null when not counting. */
  startCountdownSec: number | null;
}

export interface UseBattleEngine {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ui: BattleUiState;
  deployAt: (pos: Vec2) => void;
  selectCard: (index: number) => void;
  speed: number;
  setSpeed: (s: number) => void;
}

export function useBattleEngine(
  playerDeck: string[],
  mode: BattleMode = "solo",
  seedOverride?: number
): UseBattleEngine {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<MatchController | null>(null);
  const rafRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const speedRef = useRef<number>(1);

  const [ui, setUi] = useState<BattleUiState>({
    phase: "deployment",
    tick: 0,
    clockSec: 120,
    playerActive: 0,
    enemyActive: 0,
    playerNext: playerDeck[0] ?? null,
    canDeploy: true,
    hand: playerDeck.slice(0, 4).map((defId, index) => ({
      index,
      defId,
      selected: index === 0,
    })),
    startCountdownSec: null,
  });
  const [speed, setSpeedState] = useState(1);

  const setSpeed = useCallback(
    (s: number) => {
      // In PVP the sim is server-paced; ignore client speed changes and stay 1×.
      if (mode === "pvp") return;
      speedRef.current = s;
      setSpeedState(s);
    },
    [mode]
  );

  // (Re)initialize a match whenever the deck or seed changes.
  useEffect(() => {
    const seed = seedOverride ?? generateSeed();
    const enemyDeck = generateEnemyDeck(seed);
    controllerRef.current = new MatchController(seed, playerDeck.slice(0, 4), enemyDeck);
    accRef.current = 0;
    lastRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerDeck.join(","), seedOverride]);

  // The combined loop.
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    let uiThrottle = 0;

    const loop = (now: number) => {
      const c = controllerRef.current;
      if (!c) return;
      const dt = Math.min(250, now - lastRef.current);
      lastRef.current = now;
      accRef.current += dt * speedRef.current;

      // Fixed-timestep simulation.
      let steps = 0;
      while (accRef.current >= TICK_MS && steps < 8) {
        c.tick();
        accRef.current -= TICK_MS;
        steps++;
      }

      // Render.
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) renderBattle(ctx, c.snapshot());
      }

      // Throttled UI sync (~6/s).
      uiThrottle += dt;
      if (uiThrottle >= 160) {
        uiThrottle = 0;
        const snap = c.snapshot();
        setUi({
          phase: snap.phase,
          tick: snap.tick,
          clockSec: Math.ceil(snap.clockTicks / TICK_RATE),
          playerActive: c.countActive("player"),
          enemyActive: c.countActive("enemy"),
          playerNext: c.nextCard("player"),
          canDeploy: c.canDeploy("player"),
          hand: c.playerHand(),
          startCountdownSec: c.startCountdownSec(),
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerDeck.join(","), seedOverride]);

  const deployAt = useCallback((pos: Vec2) => {
    const c = controllerRef.current;
    if (!c) return;
    const card = c.nextCard("player");
    if (!card) return;
    c.deploy("player", card, pos);
  }, []);

  const selectCard = useCallback((index: number) => {
    const c = controllerRef.current;
    if (!c) return;
    c.selectCard(index);
    // Reflect the new selection immediately rather than waiting for the throttle.
    setUi((prev) => ({
      ...prev,
      playerNext: c.nextCard("player"),
      hand: c.playerHand(),
    }));
  }, []);

  return { canvasRef, ui, deployAt, selectCard, speed, setSpeed };
}

export { type Team };
