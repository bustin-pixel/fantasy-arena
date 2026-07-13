import { useEffect, useRef, useState } from "react";
import type { BattleMode, BattleUiState } from "@/hooks/useBattleEngine";
import { getUnitDef } from "@/data/units";
import { getSettings, updateSettings } from "@/state/settings";
import { playSfx } from "@/audio/sfx";

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
      onClick={() => {
        const m = updateSettings({ muted: !getSettings().muted }).muted;
        setMuted(m);
        // Only the unmute direction is audible — the click confirming audio
        // is back is the affordance (playSfx bails while muted anyway).
        playSfx("uiSelect");
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

/** The timer/counter bar. Lives in normal flow ABOVE the field (not overlaid
 *  on the canvas) so units walking along the top edge are never covered. */
export function BattleTopBar({
  ui,
  mode,
  onExit,
}: Pick<Props, "ui" | "mode" | "onExit">) {
  return (
    <div className="hud-topbar">
      {/* Exit and mute live INSIDE the bar so they can never cover the
          Enemy/You counters, whatever the screen width. */}
      <button
        type="button"
        className="hud-corner-btn"
        onClick={onExit}
        aria-label="Leave battle"
      >
        ✕
      </button>
      <div className="hud-pill enemy">Enemy · {ui.enemyActive}</div>
      {/* Endless shows the wave number (its clock is just a per-wave stalemate
          backstop, not a player-facing countdown). */}
      {mode === "endless" && ui.waveNumber != null ? (
        <div className="hud-clock hud-wave">Wave {ui.waveNumber}</div>
      ) : (
        <div className="hud-clock">{fmtClock(ui.clockSec)}</div>
      )}
      <div className="hud-pill player">You · {ui.playerActive}</div>
      <MuteButton />
    </div>
  );
}

export function BattleHud({ ui, speed, onSpeed, mode }: Omit<Props, "onExit">) {
  const next = ui.playerNext ? getUnitDef(ui.playerNext) : null;

  // Countdown ticks: the throttled ui snapshot (~6/s) is plenty for a 1s
  // cadence. Guard the mount so loading mid-countdown doesn't tick, and only
  // voice "go" on a seen 1→0 transition (not on entering battle some other way).
  const prevCount = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const cur = ui.startCountdownSec;
    const prev = prevCount.current;
    prevCount.current = cur;
    if (prev === undefined || cur === prev) return;
    if (cur != null && cur > 0) playSfx("countTick", 1 + (3 - Math.min(cur, 3)) * 0.06);
    // "Fight!": the 0 frame, or straight to null if the throttled sync skipped it.
    else if (prev != null && prev > 0) playSfx("countGo");
  }, [ui.startCountdownSec]);

  return (
    <div className="hud">
      {/* Pre-battle countdown once both sides have their 2 units down. */}
      {ui.phase === "deployment" && ui.startCountdownSec != null && (
        <div className="countdown-overlay">
          <div className="countdown-num">
            {ui.startCountdownSec > 0 ? ui.startCountdownSec : "Fight!"}
          </div>
          <div className="countdown-label">Battle starts</div>
        </div>
      )}

      {/* Endless: the epic engine boons get live chips so their ramp is visible —
          Momentum's banked stacks and Rhythm's climbing attack-speed bonus. */}
      {mode === "endless" &&
        ui.phase === "battle" &&
        (ui.momentumStacks != null || ui.rhythmBonus != null) && (
          <div className="hud-boon-strip">
            {ui.momentumStacks != null && (
              <span className="hud-boon-chip momentum">
                Momentum ×{ui.momentumStacks}
              </span>
            )}
            {ui.rhythmBonus != null && (
              <span className="hud-boon-chip rhythm">
                Rhythm +{Math.round(ui.rhythmBonus * 100)}%
              </span>
            )}
          </div>
        )}

      {/* Telegraph banners: a boss/rare walking in, or (Endless) a new wave. */}
      {ui.phase === "battle" && ui.banner && (
        <div className={`wave-banner wave-banner-${ui.banner.kind}`} role="alert">
          <div className="wave-banner-headline">
            {ui.banner.kind === "boss" ? "☠ Boss Incoming ☠" : ui.banner.name}
          </div>
          <div className="wave-banner-tag">
            {ui.banner.kind === "boss"
              ? ui.banner.name
              : ui.banner.kind === "wave"
              ? "The horde advances"
              : "✦ A rare foe stirs ✦"}
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
                    onClick={() => { playSfx("uiSelect", 1 + (s - 1) * 0.1); onSpeed(s); }}
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
