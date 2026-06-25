import type { BattleMode, BattleUiState } from "@/hooks/useBattleEngine";
import { getUnitDef } from "@/data/units";

interface Props {
  ui: BattleUiState;
  speed: number;
  onSpeed: (s: number) => void;
  mode: BattleMode;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BattleHud({ ui, speed, onSpeed, mode }: Props) {
  const next = ui.playerNext ? getUnitDef(ui.playerNext) : null;
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-pill enemy">Enemy · {ui.enemyActive}</div>
        <div className="hud-clock">{fmtClock(ui.clockSec)}</div>
        <div className="hud-pill player">You · {ui.playerActive}</div>
      </div>

      {/* Pre-battle countdown once both sides have their 2 units down. */}
      {ui.phase === "deployment" && ui.startCountdownSec != null && (
        <div className="countdown-overlay">
          <div className="countdown-num">
            {ui.startCountdownSec > 0 ? ui.startCountdownSec : "Fight!"}
          </div>
          <div className="countdown-label">Battle starts</div>
        </div>
      )}

      <div className="hud-bottom">
        {ui.phase === "deployment" && ui.canDeploy && next && (
          <div className="deploy-bar">
            <div className="deploy-hint">
              Tap your zone to deploy{" "}
              <strong style={{ color: next.accent }}>{next.name}</strong>
            </div>
            {ui.deploySecLeft != null && (
              <div
                className={`deploy-timer${ui.deploySecLeft <= 5 ? " urgent" : ""}`}
              >
                {ui.deploySecLeft}s
              </div>
            )}
          </div>
        )}
        {ui.phase === "battle" && (
          <>
            {/* Mid-battle "Slot open — tap to deploy" hint intentionally omitted
                for now. Planned to return as part of a first-time-player tutorial
                / onboarding flow rather than always-on chrome. */}
            {/* Fast-forward is solo-only; PVP is server-paced at 1×. */}
            {mode === "solo" && (
              <div className="speed-controls">
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    className={`btn btn-speed ${speed === s ? "active" : ""}`}
                    onClick={() => onSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
