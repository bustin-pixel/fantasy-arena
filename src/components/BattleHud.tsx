import { useState } from "react";
import type { BattleMode, BattleUiState } from "@/hooks/useBattleEngine";
import { getUnitDef } from "@/data/units";
import { getSettings, updateSettings } from "@/state/settings";

interface Props {
  ui: BattleUiState;
  speed: number;
  onSpeed: (s: number) => void;
  mode: BattleMode;
  onExit: () => void;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Quick mute-all for mid-battle — same setting the panel's checkbox drives. */
function MuteButton() {
  const [muted, setMuted] = useState(getSettings().muted);
  return (
    <button
      type="button"
      className="hud-corner-btn"
      aria-label={muted ? "Unmute audio" : "Mute audio"}
      aria-pressed={muted}
      onClick={() => setMuted(updateSettings({ muted: !getSettings().muted }).muted)}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

export function BattleHud({ ui, speed, onSpeed, mode, onExit }: Props) {
  const next = ui.playerNext ? getUnitDef(ui.playerNext) : null;
  return (
    <div className="hud">
      {/* Exit and mute live INSIDE the bar so they can never cover the
          Enemy/You counters, whatever the screen width. */}
      <div className="hud-top">
        <button
          type="button"
          className="hud-corner-btn"
          onClick={onExit}
          aria-label="Leave battle"
        >
          ✕
        </button>
        <div className="hud-pill enemy">Enemy · {ui.enemyActive}</div>
        <div className="hud-clock">{fmtClock(ui.clockSec)}</div>
        <div className="hud-pill player">You · {ui.playerActive}</div>
        <MuteButton />
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

      {/* Boss-floor telegraph: the rare quest catalyst / the boss walking in. */}
      {ui.phase === "battle" && ui.banner && (
        <div className={`wave-banner wave-banner-${ui.banner.kind}`} role="alert">
          <div className="wave-banner-headline">
            {ui.banner.kind === "boss" ? "☠ Boss Incoming ☠" : ui.banner.name}
          </div>
          <div className="wave-banner-tag">
            {ui.banner.kind === "boss" ? ui.banner.name : "✦ A rare foe stirs ✦"}
          </div>
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
            {/* Fast-forward for client-side sims (solo + depths); PVP is
                server-paced at 1×. */}
            {mode !== "pvp" && (
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
