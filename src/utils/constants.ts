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

/** Contain-fit transform that places the fixed FIELD_WIDTH×FIELD_HEIGHT world,
 *  centered and uniformly scaled (never distorted), inside a render buffer of
 *  arbitrary size. The battle canvas buffer is sized to the display box's
 *  aspect (see BattleScreen's ResizeObserver) so the arena background + zone
 *  bands can fill it edge-to-edge; the world is re-centered inside it via this
 *  transform, and the leftover margin is where the art bleeds to the screen
 *  edge. A 480×720 buffer yields the identity transform (scale 1, no offset),
 *  so any code path that reads it before the buffer is measured behaves exactly
 *  as it did before. Shared by the Renderer (draw), BattleScreen (tap→world),
 *  and BattleUnitTip (world→screen) so the three can never drift. */
export function fieldTransform(
  bufW: number,
  bufH: number
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(bufW / FIELD_WIDTH, bufH / FIELD_HEIGHT);
  return {
    scale,
    offsetX: (bufW - FIELD_WIDTH * scale) / 2,
    offsetY: (bufH - FIELD_HEIGHT * scale) / 2,
  };
}

// Match rules.
export const MATCH_TIME_SEC = 120; // 2:00
/** The Depths run on a longer clock — floors are hordes, not duels, and on
 *  timeout the outnumbered player loses, so this is a stalemate backstop. */
export const DEPTHS_MATCH_TIME_SEC = 300; // 5:00
export const MAX_ACTIVE_UNITS_PER_SIDE = 2;
/** The Depths (PvE): the player fields the whole warband at once; the horde
 *  cap sits above the proven ~8-unit/60fps-mobile ceiling — profiled OK in
 *  preview, drop back toward 10 if low-end mobile stutters. */
export const DEPTHS_PLAYER_ACTIVE = 4;
export const DEPTHS_ENEMY_ACTIVE = 12;
export const MAX_DECK = 4;
export const DEPLOY_TIME_SEC = 20; // placement timer before units auto-deploy
/** Mid-battle pause before EITHER side's next reinforcement deploys. One shared
 *  value keeps the pacing symmetric — the balance audit showed the old split
 *  (player 2.5s vs AI 0.7s) gave the enemy a ~15-point edge in mirror matches. */
export const REINFORCE_GRACE_SEC = 1.2;
/** Opening ability grace: once the battle phase begins, every unit holds its
 *  active ability casts for this long so the opening reads clearly (units still
 *  move and basic-attack — only casts wait). MatchController arms it at battle
 *  start; it lapses once, so mid-battle reinforcements cast immediately. */
export const OPENING_CAST_GRACE_SEC = 3;

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
