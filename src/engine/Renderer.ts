// ============================================================================
// Renderer
// Pure presentation. It reads a BattleSnapshot and paints it. It contains NO
// game logic and never mutates simulation state — it only consumes it. This is
// the boundary the spec requires: "Canvas rendering should only display the
// current game state."
// ============================================================================

import type { BattleSnapshot, Unit, Vec2 } from "@/types";
import {
  ENEMY_ZONE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PLAYER_ZONE,
  fieldTransform,
} from "@/utils/constants";
import { drawUnitSprite, uidPhase01 } from "@/assets/sprites";
import { dir8Index } from "@/assets/imageSprites";
import { drawStatusIcon, hasStatusIcon } from "@/assets/statusIcons";
import { getUnitDef } from "@/data/units";
import {
  ARENA_THEMES,
  type ArenaTheme,
  type ArenaThemeId,
} from "@/assets/arenaThemes";
import { drawChest, VIEW_W, type Sparkle } from "@/assets/chestArt";
import {
  drawCorpse,
  CORPSE_KIND_BY_ID,
  CORPSE_SIZE_BY_ID,
} from "@/assets/corpseArt";
import type { ChestTier } from "@/meta/economy";
import { getSettings } from "@/state/settings";

type Ctx = CanvasRenderingContext2D;

// Sprite geometry in normalized sprite space (see assets/sprites.ts): a body
// spans roughly head y≈-27 to feet y≈+26 around the draw origin. Bosses are
// drawn enlarged and anchored at their feet, so the extra height rises upward;
// the HP bar / status icons follow the top of the enlarged sprite.
const SPRITE_HEAD = 27;
const SPRITE_FEET = 26;

/** A unit's battlefield sprite enlargement (bosses only). 1 for normal units. */
function bossScaleOf(u: Unit): number {
  return getUnitDef(u.defId).battleScale ?? 1;
}
/** Screen-y of the top of a unit's drawn sprite. For an enlarged boss the sprite
 *  grows up from its feet, so the head sits higher than the collision radius. */
function spriteTopY(u: Unit): number {
  const bs = bossScaleOf(u);
  return u.pos.y - SPRITE_FEET * (bs - 1) - SPRITE_HEAD * bs;
}

// Static theme backdrops, pre-rendered once per theme to offscreen canvases.
const bgCache = new Map<ArenaThemeId, HTMLCanvasElement>();

function getBackground(theme: ArenaTheme): HTMLCanvasElement {
  let bg = bgCache.get(theme.id);
  if (!bg) {
    bg = document.createElement("canvas");
    bg.width = FIELD_WIDTH;
    bg.height = FIELD_HEIGHT;
    theme.build(bg.getContext("2d")!);
    bgCache.set(theme.id, bg);
  }
  return bg;
}

/** Deployment bands + midline. Drawn in BUFFER space so they span the full
 *  width (edge-to-edge), with world-Y mapped through the fit transform so they
 *  still line up with the centered world layer. */
function drawZones(
  ctx: Ctx,
  theme: ArenaTheme,
  bufW: number,
  scale: number,
  offsetY: number
): void {
  const y = (worldY: number): number => offsetY + worldY * scale;
  ctx.save();
  ctx.fillStyle = theme.zoneTop;
  ctx.fillRect(0, y(ENEMY_ZONE.top), bufW, (ENEMY_ZONE.bottom - ENEMY_ZONE.top) * scale);
  ctx.fillStyle = theme.zoneBottom;
  ctx.fillRect(0, y(PLAYER_ZONE.top), bufW, (PLAYER_ZONE.bottom - PLAYER_ZONE.top) * scale);
  // midline
  ctx.strokeStyle = theme.midline;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(0, y(FIELD_HEIGHT / 2));
  ctx.lineTo(bufW, y(FIELD_HEIGHT / 2));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHealthBar(ctx: Ctx, u: Unit): void {
  const bs = bossScaleOf(u);
  const h = 4;
  // Bosses get a wider bar sitting above their enlarged sprite; normal units
  // keep the exact original bar (radius-relative), byte-for-byte unchanged.
  const w = bs > 1 ? 34 * bs : 34;
  const x = u.pos.x - w / 2;
  const y = bs > 1 ? spriteTopY(u) - 10 : u.pos.y - u.radius - 14;
  const pct = Math.max(0, u.hp / u.maxHp);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = u.team === "player" ? "#4ade80" : "#f87171";
  ctx.fillRect(x, y, w * pct, h);

  // Absorb shield (overhealth): a silver segment after the HP fill. Sized
  // relative to max HP and clamped so a big bubble fills toward the bar end.
  if (u.shieldHp > 0) {
    const shieldPct = Math.min(1, u.shieldHp / u.maxHp);
    const startX = x + w * pct;
    const drawW = Math.min(w * shieldPct, w - w * pct);
    if (drawW > 0) {
      ctx.fillStyle = "#cbd5e1"; // silver
      ctx.fillRect(startX, y, drawW, h);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(startX, y, drawW, 1);
    }
  }

  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, w, h);

  // Level badge: a tiny gold number left of the bar for any unit above level 1
  // (player deck levels, arena AI mirror, inherited summons). Reads only the
  // snapshot's Unit.level — level-1 fields render exactly as before.
  if (u.level > 1) {
    const bx = x - 12;
    const by = y - 3;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(bx, by, 10, 9.5);
    ctx.fillStyle = "#ffd75e";
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(u.level), bx + 5, by + 5.2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Cast bar (Electric Mage's Chain Lightning wind-up): a thin yellow bar just
  // below the HP bar that fills as the cast completes.
  if (u.castTicks > 0 && u.castTicksMax > 0) {
    const cy = y + h + 2;
    const ch = 3;
    const progress = 1 - u.castTicks / u.castTicksMax;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, cy - 1, w + 2, ch + 2);
    ctx.fillStyle = "#fde047";
    ctx.fillRect(x, cy, w * progress, ch);
  }

  // Ultimate charge bar (Outlaw's Killing Spree): a gold meter under the HP bar,
  // filling as the ult charges (and refilling through its cooldown). It glows
  // red-hot and full while a spree is active. ultChargeMax is 0 for every other
  // unit, so this draws only for the Outlaw. (No overlap with the cast bar — the
  // Outlaw never uses the engine's cast pipeline.)
  if ((u.ultChargeMax ?? 0) > 0) {
    const cy = y + h + 2;
    const ch = 3;
    const spreeing = (u.spreeTicks ?? 0) > 0;
    const progress = spreeing ? 1 : Math.min(1, u.ultCharge / u.ultChargeMax);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, cy - 1, w + 2, ch + 2);
    ctx.fillStyle = spreeing ? "#f87171" : "#fbbf24";
    ctx.fillRect(x, cy, w * progress, ch);
  }
}

/** Status pips above a unit's head. Drawn icons (assets/statusIcons), not
 *  glyphs — see that module for why they stay this coarse. */
const STATUS_ICON_PX = 13;
const STATUS_ICON_GAP = 14;

function drawStatusIcons(ctx: Ctx, u: Unit): void {
  if (u.effects.length === 0) return;
  const bs = bossScaleOf(u);
  const iconY = bs > 1 ? spriteTopY(u) - 22 : u.pos.y - u.radius - 20;
  const shown = u.effects.filter((e) => hasStatusIcon(e.type));
  // Centre the row on the unit rather than growing rightward off its shoulder.
  const startX = u.pos.x - ((shown.length - 1) * STATUS_ICON_GAP) / 2;
  shown.forEach((e, i) => {
    drawStatusIcon(ctx, e.type, startX + i * STATUS_ICON_GAP, iconY, STATUS_ICON_PX);
  });
}

/** Seconds for one full walk cycle at BASE_MOVE_SPEED. Tuned by eye against the
 *  8-frame strips: much faster and the ogre skitters, much slower and it slides. */
const WALK_STRIDE_SEC = 0.9;
const BASE_MOVE_SPEED = 40;
/** Seconds for one full idle breath. Slow on purpose — the generated clip is a
 *  shallow chest rise, and running it fast reads as panting. */
const IDLE_BREATH_SEC = 3.2;

/** Index into `DIRS` for the two down-field/up-field defaults. */
const DIR_S = 0;
const DIR_N = 4;

/**
 * Which way a unit is looking, as one of the 8 pixel-sprite facings.
 *
 * Derived here rather than stored on the unit: `Unit.facing` is 1-bit sim
 * state, read by several kits and covered by the determinism digest, so
 * widening it to 8 directions would change match fingerprints for a purely
 * cosmetic reason.
 *
 * A unit faces whatever it is targeting — which also reads correctly while
 * closing distance, since units move toward their target.
 *
 * With NO target it faces the enemy side rather than the camera. That covers
 * the moment a unit is deployed, before it has acquired anything: the player's
 * zone is down-field (PLAYER_ZONE is the high-y band) so its units look N, and
 * the enemy's look S. Defaulting everything to S made freshly placed units
 * stand with their backs to the fight.
 */
function facingOf(u: Unit, posByUid: Map<string, Vec2>): number {
  const t = u.targetUid ? posByUid.get(u.targetUid) : undefined;
  if (!t) return u.team === "player" ? DIR_N : DIR_S;
  return dir8Index(t.x - u.pos.x, t.y - u.pos.y);
}

/**
 * Per-unit swing length, in ticks, learned by watching `attackCooldown`.
 *
 * ⚠ `Unit.attackSpeed` is the DELAY IN SECONDS between attacks, not a rate —
 * CombatSystem uses it as `attackCooldown = secToTicks(attackSpeed * …)`. It is
 * also only the BASE: haste/slow, item attack-delay, Tempo stacks and the
 * commander's rhythm bonus all multiply into the real interval, and none of
 * those are recoverable from the snapshot.
 *
 * So rather than recomputing it, watch the cooldown. It is reset to its full
 * value the tick an attack fires and counts down to zero, so a RISE means a new
 * swing began and the value at that moment is the true interval. Presentation
 * only — nothing here feeds the sim.
 */
const swingTicks = new Map<string, { max: number; last: number }>();

function swingPeriodTicks(u: Unit): number {
  const seen = swingTicks.get(u.uid);
  if (!seen) {
    swingTicks.set(u.uid, { max: u.attackCooldown, last: u.attackCooldown });
    return u.attackCooldown;
  }
  // A rise can only mean the cooldown was just re-armed by a fresh attack.
  if (u.attackCooldown > seen.last) seen.max = u.attackCooldown;
  seen.last = u.attackCooldown;
  return seen.max;
}

/** Drop learned swing timings for units no longer on the field, so the map does
 *  not grow across matches. Called once per frame with the live roster. */
function pruneSwingTicks(live: Set<string>): void {
  for (const uid of swingTicks.keys()) {
    if (!live.has(uid)) swingTicks.delete(uid);
  }
  for (const uid of lastPos.keys()) {
    if (!live.has(uid)) lastPos.delete(uid);
  }
}

/**
 * Is this unit physically sliding right now? Presentation-only, derived by
 * watching snapshot positions frame to frame (same pattern as swingTicks —
 * the sim's single-state machine can't say "attacking AND moving", but a
 * kiting or advancing ranged unit is exactly that, and it should draw the
 * walk_attack strip rather than planting its feet).
 *
 * ⚠ STICKY window, not a per-frame compare: the canvas paints at rAF rate
 * while positions only change on 20/s sim ticks, so a raw "moved since last
 * frame" flickers false on the repeated frames between ticks. Movement seen
 * within the last DISPLACE_HOLD_SEC counts as still moving.
 */
const lastPos = new Map<string, { x: number; y: number; t: number }>();
const DISPLACE_HOLD_SEC = 0.15; // ~3 sim ticks

function isDisplacing(u: Unit): boolean {
  const now = performance.now() / 1000;
  const seen = lastPos.get(u.uid);
  if (!seen) {
    lastPos.set(u.uid, { x: u.pos.x, y: u.pos.y, t: -Infinity });
    return false;
  }
  const moved = Math.abs(u.pos.x - seen.x) + Math.abs(u.pos.y - seen.y) > 0.01;
  if (moved) {
    seen.x = u.pos.x;
    seen.y = u.pos.y;
    seen.t = now;
  }
  return now - seen.t < DISPLACE_HOLD_SEC;
}

/**
 * How far through its current pixel animation a unit is, 0..1.
 *
 * Death is driven by `deathFade` so the clip finishes exactly as the unit
 * disappears; the last frame IS the corpse pose. An attack runs off the
 * measured swing interval, so a hasted or Tempo-stacked unit's animation speeds
 * up exactly in step with how often it actually hits.
 */
function animPhaseOf(u: Unit): number {
  if (u.state === "dead") return Math.min(1, u.deathFade);
  if (u.animState === "attacking" || u.animState === "casting") {
    const max = swingPeriodTicks(u);
    if (max <= 0) return 0;
    // Cooldown counts DOWN from max after each swing, so phase runs 0->1
    // across the interval with the blow at the start.
    return Math.min(1, Math.max(0, 1 - u.attackCooldown / max));
  }
  if (u.animState === "moving") {
    // A walk cycle is a LOOP with no natural end, so it runs on a fixed stride
    // period rather than an ability timer. Faster units cover ground quicker,
    // so scale the cadence with moveSpeed to stop the feet sliding.
    const stride = WALK_STRIDE_SEC * (u.moveSpeed > 0 ? BASE_MOVE_SPEED / u.moveSpeed : 1);
    return (u.animTime % stride) / stride;
  }
  // Idle breath. A LOOP like the walk, but nothing in the sim sets its cadence,
  // so it runs on a fixed period. Offset per uid because `animTime` resets on a
  // state change: without it a rank that stops moving on the same tick would
  // breathe in perfect lockstep, which reads as clockwork rather than life.
  return (u.animTime / IDLE_BREATH_SEC + uidPhase01(u.uid)) % 1;
}

/**
 * Legendary aura for the Necromancer: violet soul-wisps curling up around
 * the sprite (round-2 user request — "he's supposed to be legendary").
 *
 * Presentation-only and defId-keyed, the corpseArt precedent: the sim never
 * reads any of this, timing runs on the wall clock, and per-uid phase keeps
 * two necromancers from pulsing in lockstep. Drawn in two passes from
 * drawUnit — most wisps behind the body, one faint one in front — so the
 * sprite reads as standing INSIDE the haunt rather than under a sticker.
 */
type AuraKind =
  | "wisps"
  | "ward"
  | "glyphs"
  | "sparks"
  | "leaves"
  | "fletching"
  | "smoke"
  | "ooze"
  | "grove";

const AURA_BY_ID: Record<string, { kind: AuraKind; colors: string[] }> = {
  necromancer: { kind: "wisps", colors: ["#a06bff", "#7a3cff", "#c89bff"] },
  // The eight legendaries, themed to each kit (2026-07-23). Colours are pulled
  // from each UnitDef's own color/accent so the aura reads as that unit's magic
  // rather than a generic glow.
  aegis_knight: { kind: "ward", colors: ["#7dd3fc", "#bae6fd"] },
  archmage: { kind: "glyphs", colors: ["#93c5fd", "#f0abfc", "#fca5a5", "#fde68a"] },
  engineer: { kind: "sparks", colors: ["#f59e0b", "#fde68a", "#cbd5e1"] },
  hunter: { kind: "leaves", colors: ["#84cc16", "#4d7c0f", "#bef264"] },
  mystic_archer: { kind: "fletching", colors: ["#c084fc", "#fcd34d"] },
  outlaw: { kind: "smoke", colors: ["#8b8f98", "#e8b04b"] },
  slime_knight: { kind: "ooze", colors: ["#2b9d54", "#a7f3c0"] },
  summoner: { kind: "grove", colors: ["#a3e635", "#fde68a", "#b98a52"] },
};

/** `#rrggbb` -> `rgba(r,g,b,a)`. Gradients need a *matching* transparent stop. */
function auraRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A soft round mote — the shared vocabulary of every aura. */
function auraDot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, auraRgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Legendary auras. Presentation-only and defId-keyed, the corpseArt precedent:
 * the sim never reads any of this, timing runs on the wall clock, and per-uid
 * phase keeps two copies of a unit from pulsing in lockstep. Drawn in two
 * passes from drawUnit — most of the effect behind the body, one faint element
 * in front — so the sprite reads as standing INSIDE the effect rather than
 * under a sticker.
 *
 * House rules for anything added here: alpha <= 0.3 behind and <= 0.16 in
 * front, nothing wider than the sprite, and no reads of sim state that the sim
 * could then read back. Two auras DO read the snapshot (the outlaw's spree
 * ticks, the Druid's bear flag) — that direction is fine and is what makes
 * them feel attached to the kit.
 */
function drawAura(ctx: Ctx, u: Unit, front: boolean): void {
  const aura = AURA_BY_ID[u.defId];
  if (!aura || u.state === "dead") return;
  const t = performance.now() / 1000 + uidPhase01(u.uid) * 10;
  const x0 = u.pos.x;
  const y0 = u.pos.y;
  const c = aura.colors;
  ctx.save();
  switch (aura.kind) {
    case "wisps": {
      const wisps = front ? [3] : [0, 1, 2];
      for (const k of wisps) {
        // Each wisp loops its own rise; phases interleave so one is always live.
        const phase = (t * 0.45 + k * 0.27) % 1;
        const rise = phase * 30;
        const sway = Math.sin(t * 1.7 + k * 2.4) * (9 - k);
        const x = x0 + sway + (k - 1.5) * 7;
        const y = y0 - 4 - rise;
        const r = 2.2 + 1.2 * Math.sin(t * 3 + k);
        const fade = phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85;
        ctx.globalAlpha = (front ? 0.16 : 0.3) * Math.max(0, fade);
        auraDot(ctx, x, y, r * 2.4, c[k % c.length]);
      }
      break;
    }
    // Aegis Knight — two counter-rotating ward hexagons, the magic soak made
    // visible. Stroked (not filled) so the body stays legible through them.
    case "ward": {
      const rings = front ? [1] : [0];
      for (const k of rings) {
        const spin = t * (k === 0 ? 0.22 : -0.15) + k * 0.5;
        const rad = (k === 0 ? 21 : 14) + Math.sin(t * 0.9 + k) * 1.2;
        ctx.globalAlpha = front ? 0.14 : 0.26;
        ctx.strokeStyle = c[k % c.length];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = spin + (i / 6) * Math.PI * 2;
          // Squashed vertically: the arena reads as a ground plane, so a flat
          // ring sells "ward around the knight" better than a true circle.
          const px = x0 + Math.cos(a) * rad;
          const py = y0 - 6 + Math.sin(a) * rad * 0.55;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }
    // Archmage — rune glyphs orbiting the body. Depth is real: a glyph on the
    // near half of the orbit is drawn in the FRONT pass, so the archmage stands
    // inside the ring. The colour walks the grimoire's schools on a slow timer.
    case "glyphs": {
      for (let k = 0; k < 3; k++) {
        const a = t * 0.6 + (k / 3) * Math.PI * 2;
        const near = Math.sin(a) > 0;
        if (near !== front) continue;
        const x = x0 + Math.cos(a) * 20;
        const y = y0 - 10 + Math.sin(a) * 6;
        // Each glyph drifts through the palette at its own offset, so the ring
        // is never one flat colour — the "changes colour per spell" read.
        const col = c[Math.floor(t * 0.5 + k * 1.7) % c.length];
        // ⚠ The tick strokes ON TOP of the glow, so the two alphas COMPOSITE —
        // 0.3 + 0.26 measured a 0.58 peak against the harness's <= 0.3 rule.
        // Both are budgeted for the sum, not read individually.
        ctx.globalAlpha = front ? 0.09 : 0.17;
        auraDot(ctx, x, y, 4.5, col);
        // A tiny rune tick inside the glow gives it a drawn, deliberate feel.
        // It is an X, so its two strokes cross ONE more time at the centre —
        // three alphas stack on that pixel, not two.
        ctx.globalAlpha = front ? 0.05 : 0.09;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 1.6, y - 1.6);
        ctx.lineTo(x + 1.6, y + 1.6);
        ctx.moveTo(x + 1.6, y - 1.6);
        ctx.lineTo(x - 1.6, y + 1.6);
        ctx.stroke();
      }
      break;
    }
    // Engineer — the workshop that follows him: steam venting up behind, the
    // odd amber spark popping in front.
    case "sparks": {
      if (front) {
        // One spark, arcing up and falling back under gravity.
        const phase = (t * 1.3) % 1;
        const x = x0 + 8 + Math.sin(t * 0.7) * 3;
        const y = y0 - 6 - (phase * 26 - phase * phase * 22);
        ctx.globalAlpha = 0.16 * (1 - phase);
        auraDot(ctx, x, y, 2.4, c[1]);
      } else {
        for (let k = 0; k < 2; k++) {
          const phase = (t * 0.4 + k * 0.5) % 1;
          const x = x0 - 9 + k * 4 + Math.sin(t * 0.8 + k * 2) * 3;
          const y = y0 - 8 - phase * 26;
          // Steam expands as it rises and thins out with it.
          ctx.globalAlpha = 0.24 * (1 - phase);
          auraDot(ctx, x, y, 3 + phase * 5, c[2]);
        }
        const sp = (t * 1.3 + 0.4) % 1;
        ctx.globalAlpha = 0.3 * (1 - sp);
        auraDot(ctx, x0 - 4 + Math.sin(t * 2) * 5, y0 - 4 - sp * 18, 2, c[0]);
      }
      break;
    }
    // Hunter — leaf motes drifting down past him, the beastmaster's woodland
    // trailing along. They fall (not rise) so he reads as moving through it.
    case "leaves": {
      const motes = front ? [2] : [0, 1];
      for (const k of motes) {
        const phase = (t * 0.3 + k * 0.37) % 1;
        const x = x0 + Math.sin(t * 0.9 + k * 2.1) * 12 + (k - 1) * 5;
        const y = y0 - 26 + phase * 32;
        ctx.globalAlpha = (front ? 0.15 : 0.28) * Math.sin(phase * Math.PI);
        // Leaves tumble as they fall — an ellipse whose rotation is the tumble.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.4 + k);
        ctx.fillStyle = c[k % c.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.6, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    // Mystic Archer — a trailing arc of arcane fletchings, light and dark
    // alternating along it, sweeping around the body like a nocked shot's echo.
    case "fletching": {
      const n = front ? 1 : 4;
      for (let k = 0; k < n; k++) {
        const idx = front ? 0 : k;
        const a = t * 0.8 - idx * 0.35;
        const x = x0 + Math.cos(a) * 17;
        const y = y0 - 12 + Math.sin(a) * 9;
        // The trail fades along its length: the head is brightest.
        const fall = 1 - idx / 5;
        // ⚠ A chevron is one path with a corner, and the two segments overlap
        // AT the corner — stroking at 0.3 measured a 0.40 peak there. Budget
        // for the doubled pixel, not the nominal one.
        ctx.globalAlpha = (front ? 0.1 : 0.2) * fall;
        ctx.strokeStyle = c[idx % c.length];
        ctx.lineWidth = 1.3;
        // A chevron pointing along the arc — reads as fletching, not a dot.
        const dx = -Math.sin(a) * 3;
        const dy = Math.cos(a) * 3 * 0.55;
        ctx.beginPath();
        ctx.moveTo(x - dx - dy * 0.8, y - dy + dx * 0.8);
        ctx.lineTo(x + dx, y + dy);
        ctx.lineTo(x - dx + dy * 0.8, y - dy - dx * 0.8);
        ctx.stroke();
      }
      break;
    }
    // Outlaw — gunsmoke curling off him, THICKENING while Killing Spree runs.
    // The one aura that reads live kit state (`spreeTicks`), so the ultimate
    // announces itself without a HUD element.
    case "smoke": {
      const spree = (u.spreeTicks ?? 0) > 0;
      const heat = spree ? 1 : 0.45;
      const curls = front ? [2] : [0, 1];
      for (const k of curls) {
        const phase = (t * (spree ? 0.55 : 0.32) + k * 0.4) % 1;
        const x = x0 + (k - 1) * 6 + Math.sin(t * 1.1 + k * 2.3) * (4 + phase * 5);
        const y = y0 - 2 - phase * 24;
        ctx.globalAlpha = (front ? 0.16 : 0.3) * heat * (1 - phase);
        auraDot(ctx, x, y, 3 + phase * 6, spree ? c[1] : c[0]);
      }
      break;
    }
    // Slime Knight — ooze beading on the armour and dripping to the ground,
    // with a faint slick pooling at his feet. The undying gimmick, leaking.
    case "ooze": {
      if (front) {
        const phase = (t * 0.7 + 0.3) % 1;
        ctx.globalAlpha = 0.15 * (1 - phase * 0.6);
        auraDot(ctx, x0 + 5, y0 - 6 + phase * 26, 1.8, c[1]);
      } else {
        for (let k = 0; k < 2; k++) {
          const phase = (t * 0.55 + k * 0.5) % 1;
          const x = x0 - 7 + k * 13;
          // Accelerating fall: beads slowly, then drops.
          const y = y0 - 10 + phase * phase * 32;
          ctx.globalAlpha = 0.28 * (1 - phase * 0.5);
          auraDot(ctx, x, y, 2.2, c[k % c.length]);
        }
        // The slick underfoot, breathing slightly.
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = c[0];
        ctx.beginPath();
        ctx.ellipse(x0, y0 + 22, 13 + Math.sin(t * 1.2) * 1.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    // Druid — pollen and fireflies blinking around him in caster form, turning
    // to drifting FUR MOTES once Bear Form triggers. Reads `transformed`, the
    // same flag the sprite switches bodies on, so the aura shifts with the kit.
    case "grove": {
      const bear = !!u.transformed;
      const motes = front ? [3] : [0, 1, 2];
      for (const k of motes) {
        const phase = (t * (bear ? 0.34 : 0.22) + k * 0.29) % 1;
        if (bear) {
          // Fur: shed outward and downward, no blink, earthy.
          const x = x0 + (k - 1.5) * 9 + Math.sin(t * 0.6 + k) * 4;
          const y = y0 - 16 + phase * 30;
          ctx.globalAlpha = (front ? 0.14 : 0.26) * Math.sin(phase * Math.PI);
          ctx.fillStyle = c[2];
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.8 + k);
          ctx.fillRect(-1.8, -0.6, 3.6, 1.2);
          ctx.restore();
        } else {
          // Fireflies: rise, drift, and BLINK — the blink is what sells them.
          const blink = 0.45 + 0.55 * Math.sin(t * 3.1 + k * 1.9);
          const x = x0 + Math.sin(t * 0.8 + k * 1.6) * 14;
          const y = y0 - 4 - phase * 28;
          ctx.globalAlpha =
            (front ? 0.16 : 0.3) * Math.max(0, blink) * Math.sin(phase * Math.PI);
          auraDot(ctx, x, y, 2.6, c[k % 2]);
        }
      }
      break;
    }
  }
  ctx.restore();
}

/**
 * Aura internals, exposed for the browser harness (`/mockups/aura-verify.html`).
 *
 * Auras cannot be probed through `renderBattle`: the procedural sprites animate
 * off the same wall clock, so "diff a band around the unit" measures the sprite
 * as much as the aura, and a control unit does NOT read zero. Pulling the two
 * draw passes out lets the harness render an aura alone on a blank canvas,
 * where "no pixels" and "pixels that change" are unambiguous.
 */
export const __auraTest = { AURA_BY_ID, drawAura };

function drawUnit(ctx: Ctx, u: Unit, dir8: number): void {
  // Fully faded dead units draw NOTHING — their corpse decal (ground pass)
  // owns the spot. Without this, sprites that set globalAlpha internally
  // (slime jelly, zombie rot, wisp glows) stomp the fade and linger forever.
  if (u.state === "dead" && u.deathFade >= 1) return;
  ctx.save();
  const stealthed = u.effects.some((e) => e.type === "stealth");
  if (u.state === "dead") {
    ctx.globalAlpha = Math.max(0, 1 - u.deathFade);
    ctx.translate(0, u.deathFade * 4);
  } else if (stealthed) {
    // Ghostly while vanished — faintly visible to the player, untargetable to foes.
    ctx.globalAlpha = 0.3;
  }

  drawAura(ctx, u, false); // wisps behind the body
  drawUnitSprite(ctx, u, u.pos.x, u.pos.y, {
    battle: true,
    dir8,
    animPhase: animPhaseOf(u),
    displacing: isDisplacing(u),
  });
  drawAura(ctx, u, true); // one faint wisp drifting in front

  // Boss VFX overlays scale with the enlarged sprite and ride its raised body
  // centre; normal units (bs === 1) keep the original radius-relative circles.
  const bs = bossScaleOf(u);
  const bodyY = u.pos.y - SPRITE_FEET * (bs - 1);

  // Red damage flash overlay (not while stealthed).
  if (u.hitFlash > 0 && u.state !== "dead" && !stealthed) {
    ctx.globalAlpha = (u.hitFlash / 4) * 0.5;
    ctx.fillStyle = "#ff3030";
    ctx.beginPath();
    ctx.arc(u.pos.x, bodyY - 4, u.radius * 0.7 * bs, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = stealthed ? 0.3 : 1;
  }

  // Shield ring.
  if (u.effects.some((e) => e.type === "shield")) {
    ctx.strokeStyle = "rgba(226,232,240,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.pos.x, bodyY - 2, u.radius * 0.9 * bs, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (u.state !== "dead") {
    drawHealthBar(ctx, u);
    drawStatusIcons(ctx, u);
  }
}

// The post-victory campfire is drawn in TWO passes so it composites correctly
// with the walking warband:
//   • drawCampfireGround — the ground glow + logs + embers. These lie flat on
//     the floor, so they draw with the ground decals (traps), UNDER every unit
//     — a hero walking across the fire steps over the logs, never behind them.
//   • drawCampfireFlame — the flame (lit) or the rising smoke (doused). These
//     stand up off the ground, so they slot into the unit y-sort: a hero in
//     front of the fire occludes it, one behind is occluded by it.
// Presentation-only — the outro passes the position; the sim knows nothing.

/** Ground-decal pass: glow + logs + embers (always beneath the units). */
function drawCampfireGround(
  ctx: Ctx,
  x: number,
  y: number,
  t: number,
  doused: boolean
): void {
  ctx.save();
  ctx.translate(x, y);

  if (doused) {
    // Faint dying-ember glow.
    const eg = ctx.createRadialGradient(0, 2, 1, 0, 2, 20);
    eg.addColorStop(0, "rgba(200, 80, 25, 0.14)");
    eg.addColorStop(1, "rgba(200, 80, 25, 0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Charred logs (near-black with a cool ashen edge).
    for (const rot of [0.42, -0.4]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.fillStyle = "#171310";
      ctx.beginPath();
      ctx.roundRect(-14, 3, 28, 6, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(150, 140, 128, 0.28)";
      ctx.beginPath();
      ctx.roundRect(-13, 3, 26, 1.6, 1);
      ctx.fill();
      ctx.restore();
    }
    // A last ember pulsing in the ash.
    const ember = 0.4 + Math.sin(t * 3) * 0.25;
    ctx.fillStyle = `rgba(200, 70, 20, ${Math.max(0, ember)})`;
    ctx.beginPath();
    ctx.arc(0, 5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const flick = 0.85 + Math.sin(t * 9) * 0.1 + Math.sin(t * 21) * 0.05;
  // Ground glow.
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 46 * flick);
  glow.addColorStop(0, "rgba(255, 170, 70, 0.42)");
  glow.addColorStop(1, "rgba(255, 170, 70, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 2, 46 * flick, 22 * flick, 0, 0, Math.PI * 2);
  ctx.fill();

  // Crossed logs.
  ctx.fillStyle = "#4a3320";
  for (const rot of [0.42, -0.4]) {
    ctx.save();
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.roundRect(-14, 3, 28, 6, 3);
    ctx.fill();
    ctx.restore();
  }
  // Log end-grain embers.
  ctx.fillStyle = "#ff7a1e";
  ctx.beginPath();
  ctx.arc(0, 5, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Upright pass: the flame (lit) or smoke wisp (doused), y-sorted with units. */
function drawCampfireFlame(
  ctx: Ctx,
  x: number,
  y: number,
  t: number,
  doused: boolean
): void {
  ctx.save();
  ctx.translate(x, y);

  if (doused) {
    // Smoke wisp: puffs rising from the embers, drifting and thinning.
    const puffs = 4;
    for (let i = 0; i < puffs; i++) {
      const p = (t * 0.32 + i / puffs) % 1; // 0 at the embers → 1 up high
      const rise = p * 46;
      const drift = Math.sin(t * 1.3 + i * 1.7) * 6 * p;
      const r = 2.5 + p * 7;
      const alpha = Math.sin(p * Math.PI) * 0.3; // fade in then out
      if (alpha <= 0.01) continue;
      const smoke = ctx.createRadialGradient(drift, 2 - rise, 0, drift, 2 - rise, r);
      smoke.addColorStop(0, `rgba(120, 116, 110, ${alpha})`);
      smoke.addColorStop(1, "rgba(120, 116, 110, 0)");
      ctx.fillStyle = smoke;
      ctx.beginPath();
      ctx.arc(drift, 2 - rise, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  const flick = 0.85 + Math.sin(t * 9) * 0.1 + Math.sin(t * 21) * 0.05;
  const h = 26 * flick;
  // Flame body (orange over a warm tip).
  ctx.shadowColor = "rgba(255, 150, 50, 0.9)";
  ctx.shadowBlur = 16;
  const body = ctx.createLinearGradient(0, 4, 0, 4 - h);
  body.addColorStop(0, "#c25e10");
  body.addColorStop(0.55, "#f5b301");
  body.addColorStop(1, "#ffe9a8");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.quadraticCurveTo(-9, 4 - h * 0.5, 0, 4 - h);
  ctx.quadraticCurveTo(9, 4 - h * 0.5, 0, 4);
  ctx.fill();
  // Inner core.
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 240, 190, 0.9)";
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.quadraticCurveTo(-4, 3 - h * 0.45, 0, 3 - h * 0.62);
  ctx.quadraticCurveTo(4, 3 - h * 0.45, 0, 3);
  ctx.fill();
  ctx.restore();
}

// A reward chest sitting ON the arena floor during the continue-deeper outro.
// Like the campfire it draws in two passes, and for the same reason: a ground
// glow (an inviting "tap me" pulse while closed) THEN the chest body — both
// under every unit, exactly how the fire's logs work. The chest is a low prop
// the band gathers in front of and then files past on the way out; y-sorting it
// meant the exit walk (up-field, across the chest's own y) put the chest ON TOP
// of the departing heroes. A hero steps over the chest, never behind it — the
// same trade the campfire logs already make. The body art is the SHARED core
// from assets/chestArt.ts, mapped from its 120×112 box into world space.
export interface FloorChest {
  x: number;
  y: number;
  tier: ChestTier;
  /** ms since the open tap (0 = closed idle). */
  t: number;
  opening: boolean;
  /** Reveal-burst sparkles, spawned once by the outro at the open beat. */
  sparkles: Sparkle[];
}

/** How wide the chest's 120-unit draw box maps to, in world px. */
const CHEST_DRAW_W = 58;

/** Ground pass: a soft inviting glow while the chest is still closed (drawn with
 *  the decals, under the units). The chest's own contact shadow lives in the
 *  body pass (chestArt), so this adds none. */
function drawFloorChestGround(ctx: Ctx, c: FloorChest, t: number): void {
  if (c.opening) return;
  ctx.save();
  ctx.translate(c.x, c.y);
  const pulse = 0.5 + Math.sin(t * 3.2) * 0.5;
  const g = ctx.createRadialGradient(0, -8, 2, 0, -8, 36);
  g.addColorStop(0, `rgba(255, 224, 138, ${(0.10 + pulse * 0.12).toFixed(3)})`);
  g.addColorStop(1, "rgba(255, 224, 138, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -8, 36, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Body pass: the chest itself, mapped from chestArt's local box so its ground
 *  contact (local 60,96) lands on the world anchor (c.x, c.y). Ground clutter
 *  like the campfire's logs — drawn before the units, never y-sorted. */
function drawFloorChestBody(ctx: Ctx, c: FloorChest): void {
  const s = CHEST_DRAW_W / VIEW_W;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(s, s);
  ctx.translate(-60, -96);
  drawChest(ctx, c.tier, c.opening ? c.t : 0, c.sparkles);
  ctx.restore();
}

function drawProjectile(ctx: Ctx, p: BattleSnapshot["projectiles"][number]): void {
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.rotate(p.angle);
  if (p.ability === "fireball") {
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7";
    ctx.beginPath();
    ctx.arc(-2, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.ability === "frost_blast") {
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 0);
    ctx.lineTo(0, -4);
    ctx.closePath();
    ctx.fill();
  } else {
    // basic arrow
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(2, -2);
    ctx.lineTo(2, 2);
    ctx.fill();
  }
  ctx.restore();
}

// A jagged lightning bolt between two points. Per-frame jitter makes it flicker
// (reads as electricity). Render-only — Math.random here never touches the sim.
function drawBolt(
  ctx: Ctx,
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  const segments = 6;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  for (let i = 1; i < segments; i++) {
    const f = i / segments;
    const jx = (Math.random() - 0.5) * 14;
    const jy = (Math.random() - 0.5) * 14;
    ctx.lineTo(from.x + (to.x - from.x) * f + jx, from.y + (to.y - from.y) * f + jy);
  }
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawVfx(ctx: Ctx, v: BattleSnapshot["vfx"][number]): void {
  const t = 1 - v.life / v.maxLife;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  switch (v.kind) {
    case "slam": {
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, 6 + t * 26, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "frost":
    case "burn_burst": {
      ctx.fillStyle = v.color;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = t * 20;
        ctx.beginPath();
        ctx.arc(v.pos.x + Math.cos(a) * r, v.pos.y + Math.sin(a) * r, 3 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "shield_pop": {
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(v.pos.x, v.pos.y, 10 + t * 18, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "death": {
      ctx.fillStyle = v.color;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = t * 24;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.fillRect(v.pos.x + Math.cos(a) * r, v.pos.y + Math.sin(a) * r, 3, 3);
      }
      break;
    }
    case "lightning": {
      if (v.to) {
        // Wide faint glow, then a bright white core — both jagged and flickering.
        ctx.globalAlpha = (1 - t) * 0.35;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 4;
        drawBolt(ctx, v.pos, v.to);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        drawBolt(ctx, v.pos, v.to);
      }
      break;
    }
  }
  ctx.restore();
}

function drawFloatingText(ctx: Ctx, ft: BattleSnapshot["floatingTexts"][number]): void {
  const t = 1 - ft.life / ft.maxLife;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.font = "bold 14px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  const color =
    ft.kind === "heal" ? "#4ade80" : ft.kind === "crit" ? "#fbbf24" : "#fca5a5";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  const y = ft.pos.y - t * 22;
  ctx.strokeText(ft.value, ft.pos.x, y);
  ctx.fillText(ft.value, ft.pos.x, y);
  ctx.restore();
}

/** Paint a full frame. */
function drawTrap(ctx: Ctx, t: BattleSnapshot["traps"][number]): void {
  ctx.save();
  ctx.translate(t.x, t.y);
  // steel jaw ring
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.stroke();
  // teeth around the ring
  ctx.fillStyle = "#d1d5db";
  for (let a = 0; a < Math.PI * 2 - 0.01; a += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
    ctx.lineTo(Math.cos(a + 0.2) * 13, Math.sin(a + 0.2) * 13);
    ctx.lineTo(Math.cos(a + 0.4) * 7, Math.sin(a + 0.4) * 7);
    ctx.closePath();
    ctx.fill();
  }
  // pressure plate
  ctx.fillStyle = "#6b4423";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Presentation-only overlays the outro layers onto the resolved match. */
export interface RenderExtras {
  /** World-space campfire, drawn y-sorted with the units. `doused` swaps the
   *  flame for charred logs + a rising smoke wisp. */
  campfire?: { x: number; y: number; doused?: boolean } | null;
  /** World-space reward chest(s) on the arena floor, y-sorted with the units.
   *  One during the continue-deeper reward beat; three in a treasure room. */
  chests?: FloorChest[] | null;
}

export function renderBattle(
  ctx: Ctx,
  snap: BattleSnapshot,
  themeId: ArenaThemeId = "grassField",
  extras?: RenderExtras
): void {
  const theme = ARENA_THEMES[themeId];
  const bufW = ctx.canvas.width;
  const bufH = ctx.canvas.height;
  const { scale, offsetX, offsetY } = fieldTransform(bufW, bufH);

  // --- Fill layer: background + ambient accents + zones span the WHOLE buffer,
  // so the arena reaches the screen edges with no black letterbox bars. The
  // buffer is sized to the display box's aspect (BattleScreen), and the
  // background art is abstract, so stretching it to fill is imperceptible. ---
  ctx.drawImage(getBackground(theme), 0, 0, FIELD_WIDTH, FIELD_HEIGHT, 0, 0, bufW, bufH);
  drawZones(ctx, theme, bufW, scale, offsetY);

  // Ambient theme animation (candle/torch flames, embers, fireflies, glyphs).
  // These belong to the BACKDROP — each animated flame sits on a static base
  // that `build()` paints into the background (see arenaThemes: "flames animate
  // in accents"), and side-wall sconces sit at the very edges. So accents must
  // share the background's STRETCH-to-fill transform, NOT the world transform —
  // otherwise the flame drifts off its candle when the arena widens. Kept in
  // the original order (over the zone tints, under the units) so the blend is
  // byte-identical to before once the buffer is 480×720.
  if (getSettings().ambientFx) {
    ctx.save();
    ctx.scale(bufW / FIELD_WIDTH, bufH / FIELD_HEIGHT);
    theme.accents?.(ctx, performance.now() / 1000);
    ctx.restore();
  }

  // --- World layer: everything positional lives in the fixed 480×720 world
  // space, translated + uniformly scaled so the fight sits centered and
  // undistorted; the margin either side is filled by the layer above. ---
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Ground-level markers under the units.
  for (const t of snap.traps) drawTrap(ctx, t);

  const now = performance.now() / 1000;

  // Corpse decals: every dead unit leaves thematic remains where it fell
  // (bone pile, slime pool, ash…). Drawn with the ground clutter, UNDER the
  // living, and crossfaded IN as the dying sprite fades out (deathFade). Dead
  // units persist in the snapshot all match, so this is pure presentation —
  // no sim state, no determinism impact. Kind lookup + art in assets/corpseArt.
  for (const u of snap.units) {
    if (u.state !== "dead" || u.deathFade <= 0) continue;
    const def = getUnitDef(u.defId);
    ctx.save();
    // Anchor near the sprite's foot line so the remains sit where it stood.
    ctx.translate(u.pos.x, u.pos.y + 18);
    ctx.globalAlpha = Math.min(1, u.deathFade);
    drawCorpse(ctx, CORPSE_KIND_BY_ID[u.defId] ?? "generic", {
      color: def.color,
      accent: def.accent,
      size:
        Math.max(14, u.radius * 1.1) *
        (def.battleScale ?? 1) *
        (CORPSE_SIZE_BY_ID[u.defId] ?? 1),
      seed: u.uid,
      t: now,
      fade: u.deathFade,
    });
    ctx.restore();
  }

  // The outro campfire's glow + logs are ground clutter — draw them with the
  // decals, UNDER every unit, so a hero walking across the fire steps over the
  // logs. Its flame/smoke (below) rise off the ground and instead join the
  // unit y-sort so front heroes occlude them.
  const camp = extras?.campfire;
  if (camp) drawCampfireGround(ctx, camp.x, camp.y, now, camp.doused ?? false);

  // The reward chest is ground clutter, glow AND body — the same treatment as
  // the fire's logs. The band gathers in FRONT of it (nearer the camera) so it
  // still reads as standing behind them, and when they file out up-field they
  // step over it instead of vanishing behind it.
  const chests = extras?.chests;
  if (chests) {
    for (const c of chests) drawFloorChestGround(ctx, c, now);
    // Still y-sorted among THEMSELVES, so a treasure room's hoard keeps its
    // depth if the spread ever tightens enough for them to overlap.
    for (const c of [...chests].sort((a, b) => a.y - b.y)) {
      drawFloorChestBody(ctx, c);
    }
  }

  // Draw units sorted by y for simple depth ordering. The campfire's upright
  // flame/smoke slots in as a pseudo-unit at the fire's base, so heroes below
  // it occlude it and those behind sit behind.
  // One lookup table per frame so each unit can find what it is facing without
  // rescanning the roster (and without the sim having to store a direction).
  const posByUid = new Map(snap.units.map((u) => [u.uid, u.pos]));
  pruneSwingTicks(new Set(posByUid.keys()));
  const drawList: { y: number; draw: () => void }[] = snap.units.map((u) => ({
    y: u.pos.y,
    draw: () => drawUnit(ctx, u, facingOf(u, posByUid)),
  }));
  if (camp) {
    drawList.push({
      y: camp.y,
      draw: () => drawCampfireFlame(ctx, camp.x, camp.y, now, camp.doused ?? false),
    });
  }
  drawList.sort((a, b) => a.y - b.y);
  for (const item of drawList) item.draw();

  for (const v of snap.vfx) drawVfx(ctx, v);
  for (const p of snap.projectiles) drawProjectile(ctx, p);
  for (const ft of snap.floatingTexts) drawFloatingText(ctx, ft);

  ctx.restore();
}

/** Draw a single unit portrait into a small canvas context (for card art).
 *  `silhouette` blacks the sprite out to the given fill — the Compendium's
 *  undiscovered/encountered reveal tiers. */
export function renderPortrait(
  ctx: Ctx,
  defId: string,
  size: number,
  opts?: {
    silhouette?: string;
    charge?: number;
    live?: boolean;
    transparent?: boolean;
    /** Vertical anchor below the canvas centre (in canvas px). Larger = the sprite
     *  sits lower in the frame. Defaults to 2 — roughly centred, since a sprite's
     *  origin sits near its body centre. Contexts override: the avatar raises it
     *  for a head-focused crop; the detail panel tunes it around its ground shadow. */
    anchorOffset?: number;
  }
): void {
  const def = getUnitDef(defId);
  const anchorY = size / 2 + (opts?.anchorOffset ?? 2);
  ctx.clearRect(0, 0, size, size);
  // `transparent` leaves the canvas cleared so the sprite renders PNG-style on
  // whatever sits behind it (the detail panel's torch-lit alcove) — no square.
  if (!opts?.transparent) {
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "#2c2118");
    grad.addColorStop(1, "#1a140d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  // Fake a unit object just for the portrait pose.
  const fake = {
    defId,
    facing: 1,
    animState: "idle" as const,
    animTime: 0,
    attackSpeed: def.attackSpeed,
    state: "idle" as const,
    uid: 0,
    // Optional charge showcase: fake a banked shield so a unit whose signature
    // is a chargeable shield (Aegis Knight) can animate it in the detail panel.
    shieldHp: (opts?.charge ?? 0) * 120,
    shieldHpMax: opts?.charge != null ? 120 : 0,
  } as unknown as Unit;

  if (opts?.silhouette) {
    // Draw the sprite on an offscreen canvas, then flood its opaque pixels
    // with the silhouette color and blit the shadow over the background.
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const octx = off.getContext("2d");
    if (!octx) return;
    drawUnitSprite(octx, fake, size / 2, anchorY, {
      scale: size / 70,
      staticPose: true,
    });
    octx.globalCompositeOperation = "source-in";
    octx.fillStyle = opts.silhouette;
    octx.fillRect(0, 0, size, size);
    ctx.drawImage(off, 0, 0);
    return;
  }

  drawUnitSprite(ctx, fake, size / 2, anchorY, {
    scale: size / 70,
    staticPose: !opts?.live,
  });
}
