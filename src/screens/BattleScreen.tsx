import { useEffect, useRef, useState } from "react";
import { useBattleEngine, type BattleMode } from "@/hooks/useBattleEngine";
import { BattleHud } from "@/components/BattleHud";
import { CardTray } from "@/components/CardTray";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PLAYER_ZONE,
} from "@/utils/constants";
import { useGameState } from "@/state/GameStateContext";

interface Props {
  deck: string[];
  onExit: () => void;
  /** Solo allows fast-forward; PVP hides it and locks the sim to 1×. */
  mode?: BattleMode;
}

export function BattleScreen({ deck, onExit, mode = "solo" }: Props) {
  const { canvasRef, ui, deployAt, selectCard, speed, setSpeed } =
    useBattleEngine(deck, mode);
  const { recordResult } = useGameState();
  const wrapRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  const [showResult, setShowResult] = useState(false);

  // Record win/loss once when the match resolves.
  useEffect(() => {
    const over =
      ui.phase === "victory" || ui.phase === "defeat" || ui.phase === "draw";
    if (over && !recordedRef.current) {
      recordedRef.current = true;
      if (ui.phase === "victory") recordResult(true);
      else if (ui.phase === "defeat") recordResult(false);
      setTimeout(() => setShowResult(true), 700);
    }
  }, [ui.phase, recordResult]);

  // Map a screen tap to field coordinates and deploy in the player zone.
  const handleTap = (clientX: number, clientY: number) => {
    if (!ui.canDeploy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;
    const fx = sx * FIELD_WIDTH;
    const fy = sy * FIELD_HEIGHT;
    // Only allow deployment in the player's bottom half.
    if (fy < PLAYER_ZONE.top) return;
    deployAt({ x: fx, y: fy });
  };

  return (
    <div className="screen battle">
      <button className="exit-btn" onClick={onExit} aria-label="Leave battle">
        ✕
      </button>

      <div className="field-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          className="field-canvas"
          onClick={(e) => handleTap(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) handleTap(t.clientX, t.clientY);
          }}
        />
        <BattleHud ui={ui} speed={speed} onSpeed={setSpeed} mode={mode} />
      </div>

      <CardTray
        hand={ui.hand}
        canDeploy={ui.canDeploy}
        onSelect={selectCard}
      />

      {showResult && (
        <div className="result-overlay">
          <div className={`result-card ${ui.phase}`}>
            <h2>
              {ui.phase === "victory"
                ? "Victory"
                : ui.phase === "defeat"
                ? "Defeat"
                : "Draw"}
            </h2>
            <p>
              {ui.phase === "victory"
                ? "Your warband stands triumphant."
                : ui.phase === "defeat"
                ? "Your warband has fallen."
                : "Neither side could break the other."}
            </p>
            <button className="btn btn-gold" onClick={onExit}>
              Return to Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
