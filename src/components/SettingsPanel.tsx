import { useEffect, useRef, useState } from "react";
import { getSettings, updateSettings, type GameSettings } from "@/state/settings";
import { resetSave } from "@/state/persistence";
import { playSfx } from "@/audio/sfx";

/** The settings modal — same ironwork frame as the unit detail panel. Opened
 *  from the gear button beside the gold pill (shell only). */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<GameSettings>(getSettings());
  const close = () => { playSfx("uiClose"); onClose(); };
  // Two-step reset guard; arms for 3 seconds, then relaxes.
  const [resetArmed, setResetArmed] = useState(false);
  const disarmTimer = useRef<number>(0);
  useEffect(() => () => clearTimeout(disarmTimer.current), []);

  const set = (patch: Partial<GameSettings>) => setS(updateSettings(patch));

  return (
    <div className="detail-overlay" onClick={close}>
      <div
        className="detail-modal settings-modal"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={close} aria-label="Close settings">
          ✕
        </button>
        <div className="settings-body">
          <h2 className="settings-title">⚙ Settings</h2>

          <div className="settings-section">Audio</div>
          <label className="settings-row">
            <span className="settings-label">Mute all</span>
            <input
              type="checkbox"
              checked={s.muted}
              onChange={(e) => { set({ muted: e.target.checked }); playSfx("uiSelect"); }}
            />
          </label>
          <label className="settings-row">
            <span className="settings-label">Music</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(s.musicVol * 100)}
              disabled={s.muted}
              onChange={(e) => set({ musicVol: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="settings-row">
            <span className="settings-label">Effects</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(s.sfxVol * 100)}
              disabled={s.muted}
              onChange={(e) => set({ sfxVol: Number(e.target.value) / 100 })}
              onPointerUp={() => playSfx("sword")}
            />
          </label>

          <div className="settings-section">Battle</div>
          <div className="settings-row">
            <span className="settings-label">Default speed</span>
            <div className="settings-seg" role="group" aria-label="Default battle speed">
              {([1, 2, 3] as const).map((v) => (
                <button
                  key={v}
                  className={`settings-seg-btn${s.defaultSpeed === v ? " active" : ""}`}
                  onClick={() => { playSfx("uiSelect", 1 + (v - 1) * 0.1); set({ defaultSpeed: v }); }}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">Visuals</div>
          <label className="settings-row">
            <span className="settings-label">
              Ambient effects <small>(embers, fireflies)</small>
            </span>
            <input
              type="checkbox"
              checked={s.ambientFx}
              onChange={(e) => { playSfx("uiSelect"); set({ ambientFx: e.target.checked }); }}
            />
          </label>

          <div className="settings-section danger">Danger</div>
          <button
            className={`settings-reset${resetArmed ? " armed" : ""}`}
            onClick={() => {
              if (!resetArmed) {
                playSfx("uiTap");
                setResetArmed(true);
                clearTimeout(disarmTimer.current);
                disarmTimer.current = window.setTimeout(() => setResetArmed(false), 3000);
                return;
              }
              resetSave();
              window.location.reload();
            }}
          >
            {resetArmed ? "Tap again to confirm — wipes everything" : "Reset all progress"}
          </button>

          <div className="settings-version">Fantasy Arena v0.1.0</div>
        </div>
      </div>
    </div>
  );
}
