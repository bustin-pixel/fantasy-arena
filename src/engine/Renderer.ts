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
  const drawList: { y: number; draw: () => void }[] = snap.units.map((u) => ({
    y: u.pos.y,
    draw: () => drawUnit(ctx, u),
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
