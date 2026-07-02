import { useEffect, useRef, useState } from "react";
import { useBattleEngine, type BattleMode } from "@/hooks/useBattleEngine";
import { BattleHud } from "@/components/BattleHud";
import { BattleUnitTip } from "@/components/BattleUnitTip";
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
  const { canvasRef, ui, deployAt, selectCard, speed, setSpeed, pickUnitAt, inspectUnit, enemyLedger } =
    useBattleEngine(deck, mode);
  const { recordResult, recordBestiary } = useGameState();
  const wrapRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  // Timestamp of the last touch, to suppress the synthetic click a touchscreen
  // fires right after a tap (which would otherwise deploy a second unit).
  const lastTouchRef = useRef(0);
  const [showResult, setShowResult] = useState(false);
  // uid of the unit whose stat tooltip is open (tap a combatant to inspect).
  const [inspectedUid, setInspectedUid] = useState<string | null>(null);

  // Re-read live every render (~6/s on the throttled ui sync) so HP/effects and
  // the unit's position stay current; clears itself when the unit dies.
  const inspected = inspectedUid ? inspectUnit(inspectedUid) : null;

  // Record win/loss + Compendium reveals once when the match resolves. The
  // bestiary reads the final field from the meta layer — the sim never knows.
  useEffect(() => {
    const over =
      ui.phase === "victory" || ui.phase === "defeat" || ui.phase === "draw";
    if (over && !recordedRef.current) {
      recordedRef.current = true;
      if (ui.phase === "victory") recordResult(true);
      else if (ui.phase === "defeat") recordResult(false);
      const { seen, slain } = enemyLedger();
      recordBestiary(seen, slain);
      setTimeout(() => setShowResult(true), 700);
    }
  }, [ui.phase, recordResult, recordBestiary, enemyLedger]);

  // A tap inspects a tapped unit (either team); on empty space it dismisses any
  // tooltip and deploys a reinforcement if a slot is open in the player zone.
  const handleTap = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fx = ((clientX - rect.left) / rect.width) * FIELD_WIDTH;
    const fy = ((clientY - rect.top) / rect.height) * FIELD_HEIGHT;

    const hitUid = pickUnitAt({ x: fx, y: fy });
    if (hitUid) {
      // Tapping the same unit again closes its tooltip; a different unit switches.
      setInspectedUid((prev) => (prev === hitUid ? null : hitUid));
      return;
    }
    setInspectedUid(null);
    if (ui.canDeploy && fy >= PLAYER_ZONE.top) {
      deployAt({ x: fx, y: fy });
    }
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
          onClick={(e) => {
            // Skip the synthetic click a touchscreen fires ~300ms after a tap,
            // so one tap deploys one unit (not two on the same spot).
            if (Date.now() - lastTouchRef.current < 600) return;
            handleTap(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            lastTouchRef.current = Date.now();
            const t = e.touches[0];
            if (t) handleTap(t.clientX, t.clientY);
          }}
        />
        <BattleHud ui={ui} speed={speed} onSpeed={setSpeed} mode={mode} />
        {inspected && (
          <BattleUnitTip unit={inspected} onClose={() => setInspectedUid(null)} />
        )}
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
