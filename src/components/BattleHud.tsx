import type { BattleUiState } from "@/hooks/useBattleEngine";
import { getUnitDef } from "@/data/units";

interface Props {
  ui: BattleUiState;
  speed: number;
  onSpeed: (s: number) => void;
  onBegin: () => void;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BattleHud({ ui, speed, onSpeed, onBegin }: Props) {
  const next = ui.playerNext ? getUnitDef(ui.playerNext) : null;
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-pill enemy">Enemy · {ui.enemyActive}</div>
        <div className="hud-clock">{fmtClock(ui.clockSec)}</div>
        <div className="hud-pill player">You · {ui.playerActive}</div>
      </div>

      <div className="hud-bottom">
        {ui.phase === "deployment" && (
          <div className="deploy-bar">
            <div className="deploy-hint">
              {next ? (
                <>
                  Tap your zone to deploy{" "}
                  <strong style={{ color: next.accent }}>{next.name}</strong>
                </>
              ) : (
                <>No cards left to deploy</>
              )}
            </div>
            <button className="btn btn-gold" onClick={onBegin}>
              Begin Battle
            </button>
          </div>
        )}
        {ui.phase === "battle" && (
          <div className="deploy-bar">
            <div className="deploy-hint">
              {ui.canDeploy && next ? (
                <>
                  Slot open — tap to deploy{" "}
                  <strong style={{ color: next.accent }}>{next.name}</strong>
                </>
              ) : (
                <>Battle underway</>
              )}
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
