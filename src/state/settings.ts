// ============================================================================
// Settings
// Player preferences, persisted separately from the save (wiping progress
// shouldn't reset your volume). Plain TS with a tiny subscribe mechanism so
// non-React consumers (the audio modules, the renderer) can react to changes
// live without a context.
// ============================================================================

export interface GameSettings {
  /** Music volume 0..1 (scales the track master gain). */
  musicVol: number;
  /** Sound-effects volume 0..1 (scales the SFX bus gain). */
  sfxVol: number;
  /** Mutes ALL audio (music + SFX). */
  muted: boolean;
  /** Battle speed each match starts at (PVP always runs 1×). */
  defaultSpeed: 1 | 2 | 3;
  /** Ambient battlefield animation (embers, fireflies, glyphs). */
  ambientFx: boolean;
  /** Draw units from the generated PIXEL sprites (default) or from the
   *  ORIGINAL hand-coded procedural art.
   *
   *  ⚠ The procedural `draw*` functions in `assets/sprites.ts` are the game's
   *  original look and its permanent fallback — they are NOT dead code. This
   *  flag makes them reachable on demand so the pre-pixel art can always be
   *  seen and compared. Turning it off costs nothing: `drawUnitSprite` simply
   *  skips the pixel lookup and falls through to the same switch that any
   *  unconverted unit already uses. */
  pixelArt: boolean;
}

const DEFAULTS: GameSettings = {
  musicVol: 0.8,
  sfxVol: 0.8,
  muted: false,
  defaultSpeed: 1,
  ambientFx: true,
  pixelArt: true,
};

const KEY = "fantasy-arena/settings/v1";
/** Pre-settings-panel mute toggle key, migrated on first load. */
const LEGACY_MUTE_KEY = "fantasy-arena/music-muted";

let settings: GameSettings | null = null;
const listeners: Array<(s: GameSettings) => void> = [];

function load(): GameSettings {
  if (settings) return settings;
  let loaded: Partial<GameSettings> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) loaded = JSON.parse(raw) as Partial<GameSettings>;
    else if (localStorage.getItem(LEGACY_MUTE_KEY) === "1") loaded = { muted: true };
  } catch {
    /* corrupt/unavailable storage — fall back to defaults */
  }
  const clamp01 = (v: unknown, dflt: number) =>
    typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
  settings = {
    musicVol: clamp01(loaded.musicVol, DEFAULTS.musicVol),
    sfxVol: clamp01(loaded.sfxVol, DEFAULTS.sfxVol),
    muted: typeof loaded.muted === "boolean" ? loaded.muted : DEFAULTS.muted,
    defaultSpeed: loaded.defaultSpeed === 2 || loaded.defaultSpeed === 3 ? loaded.defaultSpeed : 1,
    ambientFx: typeof loaded.ambientFx === "boolean" ? loaded.ambientFx : DEFAULTS.ambientFx,
    pixelArt: typeof loaded.pixelArt === "boolean" ? loaded.pixelArt : DEFAULTS.pixelArt,
  };
  return settings;
}

export function getSettings(): GameSettings {
  return load();
}

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  settings = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode — settings still apply for this session */
  }
  for (const cb of listeners) cb(settings);
  return settings;
}

/** Listen for changes (audio gains, renderer). Returns an unsubscribe. */
export function subscribeSettings(cb: (s: GameSettings) => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}
