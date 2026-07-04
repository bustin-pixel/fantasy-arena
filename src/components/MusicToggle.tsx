import { useState } from "react";
import { isMusicMuted, toggleMusicMuted } from "@/audio/music";

/** Floating speaker button — top-left corner, shifted right of the ✕ during
 *  battle. Mute state persists (its own localStorage key, not the save). */
export function MusicToggle({ inBattle = false }: { inBattle?: boolean }) {
  const [muted, setMuted] = useState(isMusicMuted());
  return (
    <button
      type="button"
      className={`music-toggle${inBattle ? " in-battle" : ""}`}
      aria-label={muted ? "Unmute music" : "Mute music"}
      aria-pressed={muted}
      onClick={() => setMuted(toggleMusicMuted())}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
