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
  /** Draw units from the generated PIXEL sprites, or from the ORIGINAL
   *  hand-coded procedural art (default while the pixel set is still landing).
   *
   *  ⚠ The procedural `draw*` functions in `assets/sprites.ts` are the game's
   *  original look and its permanent fallback — they are NOT dead code. This
   *  flag makes them reachable on demand so the pre-pixel art can always be
   *  seen and compared. Turning it off costs nothing: `drawUnitSprite` simply
   *  skips the pixel lookup and falls through to the same switch that any
   *  unconverted unit already uses. The shop's Grubbins follows the same flag
   *  (`ShopScreen` picks between GrubbinsPixelScene and GrubbinsScene). */
  pixelArt: boolean;
}

const DEFAULTS: GameSettings = {
  musicVol: 0.8,
  sfxVol: 0.8,
  muted: false,
  defaultSpeed: 1,
  ambientFx: true,
  pixelArt: false,
};

const KEY = "fantasy-arena/settings/v1";
/** Pre-settings-panel mute toggle key, migrated on first load. */
const LEGACY_MUTE_KEY = "fantasy-arena/music-muted";

/** One-time marker for the "pixel art ships OFF" migration below. */
const PIXEL_DEFAULT_OFF_KEY = "fantasy-arena/settings/pixel-default-off";

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

  // ⚠ ONE-TIME: force pixel art off, once, for players who already have
  // `pixelArt: true` on disk.
  //
  // Flipping the DEFAULT alone would not reach them. `updateSettings` persists
  // the WHOLE object, so anyone who ever changed a volume — or just hit mute on
  // the battle HUD — has the old `true` written into their storage, even though
  // the pixel set has never been live. Without this they would get the pixel
  // roster the moment it deploys, which is the opposite of shipping it off.
  //
  // The marker makes it fire exactly once, so a player who turns pixel art on
  // afterwards keeps it. Remove this block (and flip the default back) when the
  // pixel art is finished and ready to be the default look.
  try {
    if (localStorage.getItem(PIXEL_DEFAULT_OFF_KEY) !== "1") {
      settings.pixelArt = DEFAULTS.pixelArt;
      localStorage.setItem(PIXEL_DEFAULT_OFF_KEY, "1");
      localStorage.setItem(KEY, JSON.stringify(settings));
    }
  } catch {
    /* private mode — the default already applies for this session */
  }
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
