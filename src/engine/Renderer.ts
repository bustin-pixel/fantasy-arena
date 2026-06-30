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
} from "@/utils/constants";
import { drawUnitSprite } from "@/assets/sprites";
import { getUnitDef } from "@/data/units";

type Ctx = CanvasRenderingContext2D;

let bgPattern: HTMLCanvasElement | null = null;

/** Pre-render the static grass/dirt field to an offscreen canvas once. */
function buildBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FIELD_WIDTH;
  c.height = FIELD_HEIGHT;
  const g = c.getContext("2d")!;

  // Grass base with subtle vertical gradient.
  const grad = g.createLinearGradient(0, 0, 0, FIELD_HEIGHT);
  grad.addColorStop(0, "#2f4a26");
  grad.addColorStop(0.5, "#37562c");
  grad.addColorStop(1, "#2f4a26");
  g.fillStyle = grad;
  g.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

  // Grass speckle (deterministic-ish, purely decorative).
  for (let i = 0; i < 400; i++) {
    const x = (i * 97) % FIELD_WIDTH;
    const y = (i * 53) % FIELD_HEIGHT;
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
    g.fillRect(x, y, 2, 2);
  }

  // Central dirt path.
  g.fillStyle = "#5a4630";
  g.globalAlpha = 0.55;
  g.beginPath();
  g.ellipse(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 70, FIELD_HEIGHT / 2.4, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  // Decorative rocks.
  const rocks = [
    [60, 130], [410, 200], [90, 560], [380, 600], [240, 360],
  ];
  for (const [rx, ry] of rocks) {
    g.fillStyle = "#5b5f63";
    g.beginPath();
    g.ellipse(rx, ry, 10, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#73777b";
    g.beginPath();
    g.ellipse(rx - 2, ry - 2, 6, 4, 0, 0, Math.PI * 2);
    g.fill();
  }

  return c;
}

function drawZones(ctx: Ctx): void {
  ctx.save();
  ctx.fillStyle = "rgba(180,40,40,0.06)";
  ctx.fillRect(0, ENEMY_ZONE.top, FIELD_WIDTH, ENEMY_ZONE.bottom - ENEMY_ZONE.top);
  ctx.fillStyle = "rgba(60,140,220,0.06)";
  ctx.fillRect(
    0,
    PLAYER_ZONE.top,
    FIELD_WIDTH,
    PLAYER_ZONE.bottom - PLAYER_ZONE.top
  );
  // midline
  ctx.strokeStyle = "rgba(245,179,1,0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(0, FIELD_HEIGHT / 2);
  ctx.lineTo(FIELD_WIDTH, FIELD_HEIGHT / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHealthBar(ctx: Ctx, u: Unit): void {
  const w = 34;
  const h = 4;
  const x = u.pos.x - w / 2;
  const y = u.pos.y - u.radius - 14;
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
  let i = 0;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  for (const e of u.effects) {
    const icon = icons[e.type];
    if (!icon) continue;
    ctx.fillText(icon, u.pos.x - 14 + i * 12, u.pos.y - u.radius - 20);
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

  drawUnitSprite(ctx, u, u.pos.x, u.pos.y);

  // Red damage flash overlay (not while stealthed).
  if (u.hitFlash > 0 && u.state !== "dead" && !stealthed) {
    ctx.globalAlpha = (u.hitFlash / 4) * 0.5;
    ctx.fillStyle = "#ff3030";
    ctx.beginPath();
    ctx.arc(u.pos.x, u.pos.y - 4, u.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = stealthed ? 0.3 : 1;
  }

  // Shield ring.
  if (u.effects.some((e) => e.type === "shield")) {
    ctx.strokeStyle = "rgba(226,232,240,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.pos.x, u.pos.y - 2, u.radius * 0.9, 0, Math.PI * 2);
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
export function renderBattle(ctx: Ctx, snap: BattleSnapshot): void {
  if (!bgPattern) bgPattern = buildBackground();
  ctx.drawImage(bgPattern, 0, 0);
  drawZones(ctx);

  // Draw units sorted by y for simple depth ordering.
  const sorted = [...snap.units].sort((a, b) => a.pos.y - b.pos.y);
  for (const u of sorted) drawUnit(ctx, u);

  for (const v of snap.vfx) drawVfx(ctx, v);
  for (const p of snap.projectiles) drawProjectile(ctx, p);
  for (const ft of snap.floatingTexts) drawFloatingText(ctx, ft);
}

/** Draw a single unit portrait into a small canvas context (for card art). */
export function renderPortrait(
  ctx: Ctx,
  defId: string,
  size: number
): void {
  const def = getUnitDef(defId);
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#2c2118");
  grad.addColorStop(1, "#1a140d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Fake a unit object just for the portrait pose.
  const fake = {
    defId,
    facing: 1,
    animState: "idle" as const,
    animTime: 0,
    attackSpeed: def.attackSpeed,
    state: "idle" as const,
  } as unknown as Unit;
  drawUnitSprite(ctx, fake, size / 2, size / 2 + 14, {
    scale: size / 70,
    staticPose: true,
  });
}
