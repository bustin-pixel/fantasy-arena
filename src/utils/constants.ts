// ============================================================================
// CONSTANTS
// Single source of truth for tuning the simulation. Time-based values are
// expressed in seconds and converted to ticks via secToTicks so the design
// spec ("every 5 seconds", "2:00 limit") maps cleanly.
// ============================================================================

/** Combat simulation runs at a fixed rate, independent of render FPS. */
export const TICK_RATE = 20; // ticks per second
export const TICK_MS = 1000 / TICK_RATE; // 50ms
export const SEC_PER_TICK = 1 / TICK_RATE;

export function secToTicks(sec: number): number {
  return Math.round(sec * TICK_RATE);
}

// Battlefield dimensions (logical units == pixels at 1x).
export const FIELD_WIDTH = 480;
export const FIELD_HEIGHT = 720;

// Deployment zones (top = enemy, bottom = player).
export const ENEMY_ZONE = { top: 40, bottom: FIELD_HEIGHT * 0.4 };
export const PLAYER_ZONE = { top: FIELD_HEIGHT * 0.6, bottom: FIELD_HEIGHT - 40 };

// Match rules.
export const MATCH_TIME_SEC = 120; // 2:00
export const MAX_ACTIVE_UNITS_PER_SIDE = 2;
export const MIN_UNITS_TO_START = 2;

// Collision / melee.
export const UNIT_RADIUS = 32;
export const MAX_MELEE_SURROUND = 3;

// Performance ceilings (object pools sized to these).
export const MAX_PROJECTILES = 20;
export const MAX_EFFECTS = 30;

// Presentation.
export const HIT_FLASH_TICKS = 4;
export const FLOAT_TEXT_TICKS = secToTicks(0.9);
export const DEATH_FADE_TICKS = secToTicks(0.6);

// Derived field-relative ranges used by data.
export const FIELD_THIRD = FIELD_WIDTH / 3;
