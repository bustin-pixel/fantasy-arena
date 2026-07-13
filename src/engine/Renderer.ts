// ============================================================================
// Renderer
// Pure presentation. It reads a BattleSnapshot and paints it. It contains NO
// game logic and never mutates simulation state — it only consumes it. This is
// the boundary the spec requires: "Canvas rendering should only display the
// current game state."
// ============================================================================

import type { BattleSnapshot, Unit } from "@/types";
import {
  ENEMY_ZONE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PLAYER_ZONE,
  fieldTransform,
} from "@/utils/constants";
import { drawUnitSprite } from "@/assets/sprites";
import { getUnitDef } from "@/data/units";
import {
  ARENA_THEMES,
  type ArenaTheme,
  type ArenaThemeId,
} from "@/assets/arenaThemes";
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

function drawStatusIcons(ctx: Ctx, u: Unit): void {
  if (u.effects.length === 0) return;
  const icons: Record<string, string> = {
    burn: "🔥",
    slow: "❄",
    stun: "✦",
    shield: "🛡",
    haste: "»",
    poison: "☠",
    curse: "💀",
    regen: "💚",
    silence: "∅",
    stealth: "👁",
    death_immune: "✝",
    taunt: "❗",
    fear: "😱",
  };
  const bs = bossScaleOf(u);
  const iconY = bs > 1 ? spriteTopY(u) - 22 : u.pos.y - u.radius - 20;
  let i = 0;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  for (const e of u.effects) {
    const icon = icons[e.type];
    if (!icon) continue;
    ctx.fillText(icon, u.pos.x - 14 + i * 12, iconY);
    i++;
  }
}

function drawUnit(ctx: Ctx, u: Unit): void {
  ctx.save();
  const stealthed = u.effects.some((e) => e.type === "stealth");
  if (u.state === "dead") {
    ctx.globalAlpha = Math.max(0, 1 - u.deathFade);
    ctx.translate(0, u.deathFade * 4);
  } else if (stealthed) {
    // Ghostly while vanished — faintly visible to the player, untargetable to foes.
    ctx.globalAlpha = 0.3;
  }

  drawUnitSprite(ctx, u, u.pos.x, u.pos.y, { battle: true });

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

export function renderBattle(
  ctx: Ctx,
  snap: BattleSnapshot,
  themeId: ArenaThemeId = "grassField"
): void {
  const theme = ARENA_THEMES[themeId];
  const bufW = ctx.canvas.width;
  const bufH = ctx.canvas.height;
  const { scale, offsetX, offsetY } = fieldTransform(bufW, bufH);

  // --- Fill layer: background + zones span the WHOLE buffer, so the arena
  // reaches the screen edges with no black letterbox bars. The buffer is sized
  // to the display box's aspect (BattleScreen), and the background art is
  // abstract, so stretching it to fill is imperceptible. ---
  ctx.drawImage(getBackground(theme), 0, 0, FIELD_WIDTH, FIELD_HEIGHT, 0, 0, bufW, bufH);
  drawZones(ctx, theme, bufW, scale, offsetY);

  // --- World layer: everything positional lives in the fixed 480×720 world
  // space, translated + uniformly scaled so the fight sits centered and
  // undistorted; the margin either side is filled by the layer above. ---
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Ambient theme animation (embers, fireflies, glyphs) — drawn under the
  // units so combat readability is never compromised. Wall-clock time keeps
  // it presentation-only, like the lightning jitter below. Skippable in
  // settings as a courtesy to older phones (it redraws every frame).
  if (getSettings().ambientFx) theme.accents?.(ctx, performance.now() / 1000);

  // Ground-level markers under the units.
  for (const t of snap.traps) drawTrap(ctx, t);

  // Draw units sorted by y for simple depth ordering.
  const sorted = [...snap.units].sort((a, b) => a.pos.y - b.pos.y);
  for (const u of sorted) drawUnit(ctx, u);

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
