import { useState } from "react";
import { isMusicMuted, toggleMusicMuted } from "@/audio/music";

/** Floating speaker button — top-left corner, shifted right of the ✕ during
 *  battle. Mutes ALL audio (music + sound effects); the state persists under
 *  its own localStorage key, not the save. */
export function MusicToggle({ inBattle = false }: { inBattle?: boolean }) {
  const [muted, setMuted] = useState(isMusicMuted());
  return (
    <button
      type="button"
      className={`music-toggle${inBattle ? " in-battle" : ""}`}
      aria-label={muted ? "Unmute audio" : "Mute audio"}
      aria-pressed={muted}
      onClick={() => setMuted(toggleMusicMuted())}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
