// ============================================================================
// ChestSprite — procedural canvas chest for the reward ceremony.
// Same hand-drawn vector style as assets/sprites.ts but self-contained: five
// tiers (wooden → silver → gold → arcane → dragon), a closed idle pose, and
// an opening animation (rattle → lid swing → light burst → rising sparkles)
// that voices itself through audio/sfx.ts at the matching visual beats.
// Pure presentation: rewards are granted before this ever renders, and
// Math.random here is fine — the determinism rule only binds the engine.
// ============================================================================

import { useEffect, useRef } from "react";
import type { ChestTier } from "@/meta/economy";
import { playSfx } from "@/audio/sfx";

interface Props {
  tier: ChestTier;
  /** Flips false→true exactly once; starts the opening animation. */
  opening: boolean;
  /** Fired once, the moment the lid lands fully open (reveal beat). */
  onOpened?: () => void;
  /** CSS pixel width; height follows the sprite's aspect. */
  width?: number;
}

// Logical drawing space (scaled to the canvas, dpr-aware).
const VIEW_W = 120;
const VIEW_H = 112;
const HINGE_Y = 64; // top edge of the body; the lid pivots here
const LID_H = 24;

// Animation beats (ms from the open tap).
const RATTLE_MS = 380; // anticipation jiggle
const SWING_MS = 340; // lid travel
const OPEN_AT = RATTLE_MS + SWING_MS;
const SPARKLE_MS = 1500; // burst tail after the lid lands

interface Palette {
  body: string;
  bodyDark: string;
  bodyLight: string;
  band: string;
  bandLight: string;
  latch: string;
  glow: string;
  sparkles: string[];
}

const PALETTES: Record<ChestTier, Palette> = {
  wooden: {
    body: "#8a5a2b", bodyDark: "#5c3b1a", bodyLight: "#a9743c",
    band: "#4b4b55", bandLight: "#6e6e7a", latch: "#8d99a6",
    glow: "#f0d78a", sparkles: ["#f0d78a", "#dfb968"],
  },
  silver: {
    body: "#aeb8c6", bodyDark: "#78828f", bodyLight: "#dde3ec",
    band: "#4f5a6b", bandLight: "#8b96a8", latch: "#eef2f8",
    glow: "#cfe4ff", sparkles: ["#ffffff", "#a9c8f0", "#e3eeff"],
  },
  gold: {
    body: "#e2b93b", bodyDark: "#a87a12", bodyLight: "#f7dd7a",
    band: "#7c5c14", bandLight: "#b28a2a", latch: "#fff0b8",
    glow: "#ffe08a", sparkles: ["#ffe9a0", "#ffd24d", "#fff6d8"],
  },
  arcane: {
    body: "#4a3a72", bodyDark: "#2c2148", bodyLight: "#6a55a0",
    band: "#8f6cff", bandLight: "#b79aff", latch: "#e4d6ff",
    glow: "#b18cff", sparkles: ["#c9a8ff", "#8f6cff", "#f0e6ff"],
  },
  dragon: {
    body: "#7c2622", bodyDark: "#471110", bodyLight: "#a33d2f",
    band: "#d97b29", bandLight: "#f2a548", latch: "#ffd24d",
    glow: "#ff9440", sparkles: ["#ffb347", "#ff6b35", "#ffe08a", "#ff9440"],
  },
};

/** Creak pitch per tier (dragon is a heavier lid). */
const CREAK_RATE: Record<ChestTier, number> = {
  wooden: 1, silver: 1.08, gold: 1.15, arcane: 1.2, dragon: 0.85,
};

/** Extra reveal flavor layered on the shared chestOpen jingle. */
const REVEAL_EXTRA: Partial<Record<ChestTier, () => void>> = {
  arcane: () => playSfx("arcaneWarp"),
  dragon: () => playSfx("roar", 0.75),
};

interface Sparkle {
  x: number; y: number; vx: number; vy: number;
  born: number; life: number; size: number; color: string;
}

export function ChestSprite({ tier, opening, onOpened, width = 104 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openedRef = useRef(false);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const height = Math.round((width * VIEW_H) / VIEW_W);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const scale = (width * dpr) / VIEW_W;

    const setup = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    };

    if (!opening) {
      openedRef.current = false;
      setup();
      drawChest(ctx, tier, 0, []);
      return;
    }

    // --- opening timeline ---------------------------------------------------
    playSfx("chestCreak", CREAK_RATE[tier]);
    const start = performance.now();
    let revealPlayed = false;
    let sparkles: Sparkle[] = [];
    let raf = 0;

    const frame = (now: number) => {
      const t = now - start;

      if (!revealPlayed && t >= OPEN_AT) {
        revealPlayed = true;
        playSfx("chestOpen", CREAK_RATE[tier]);
        REVEAL_EXTRA[tier]?.();
        sparkles = spawnSparkles(tier, t);
        if (!openedRef.current) {
          openedRef.current = true;
          onOpenedRef.current?.();
        }
      }

      setup();
      drawChest(ctx, tier, t, sparkles);

      // Keep animating through the sparkle tail, then rest on the final frame.
      if (t < OPEN_AT + SPARKLE_MS) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tier, opening, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="chest-sprite"
      style={{ width, height }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function spawnSparkles(tier: ChestTier, born: number): Sparkle[] {
  const p = PALETTES[tier];
  const count = tier === "wooden" ? 12 : tier === "silver" ? 14 : 18;
  const out: Sparkle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: 60 + (Math.random() - 0.5) * 52,
      y: HINGE_Y + 2 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 0.022,
      vy: -(0.03 + Math.random() * 0.05),
      born: born + Math.random() * 250,
      life: 550 + Math.random() * 700,
      size: 1.2 + Math.random() * 2,
      color: p.sparkles[i % p.sparkles.length],
    });
  }
  return out;
}

/** t is ms since the open tap (0 = closed idle). */
function drawChest(
  ctx: CanvasRenderingContext2D,
  tier: ChestTier,
  t: number,
  sparkles: Sparkle[]
): void {
  const p = PALETTES[tier];

  // Lid angle 0 (closed) → ~125° (resting open behind the body).
  const swing = clamp01((t - RATTLE_MS) / SWING_MS);
  const angle = easeOutBack(swing) * ((125 * Math.PI) / 180);
  const openness = swing;

  // Glow burst: spikes as the lid lands, settles to a soft loot-light.
  const sinceOpen = t - OPEN_AT;
  const burst = sinceOpen < 0 ? 0 : Math.max(0.55, 1.4 - sinceOpen / 400);

  ctx.save();

  // Anticipation rattle while the latch fights back.
  if (t > 0 && t < RATTLE_MS) {
    const wobble = Math.sin(t * 0.09) * 1.8 * (1 - t / RATTLE_MS + 0.3);
    ctx.translate(wobble, Math.abs(Math.sin(t * 0.13)) * -1.2);
  }

  // Ground shadow.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(60, 96, 38, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Idle aura for the magical tiers (arcane/dragon smoulder even closed).
  if (tier === "arcane" || tier === "dragon") {
    paintGlow(ctx, p.glow, 0.16, 46);
  }

  // The lid's apparent height is cos(swing): shrinks to a sliver at 90°, then
  // grows again past vertical as its dark underside, tilted back BEHIND the
  // body — so past 90° it draws before (under) everything else.
  const lidCos = Math.cos(angle);
  const underside = lidCos < 0;
  const drawLid = () => {
    const h = LID_H * Math.abs(lidCos);
    if (h < 0.8) return;
    ctx.save();
    ctx.translate(0, HINGE_Y);
    ctx.scale(1, h / LID_H);
    const lidGrad = ctx.createLinearGradient(0, -LID_H, 0, 0);
    if (underside) {
      lidGrad.addColorStop(0, "#241812");
      lidGrad.addColorStop(1, p.bodyDark);
    } else {
      lidGrad.addColorStop(0, p.bodyLight);
      lidGrad.addColorStop(1, p.body);
    }
    ctx.fillStyle = lidGrad;
    ctx.beginPath();
    ctx.roundRect(24, -LID_H, 72, LID_H, [14, 14, 0, 0]);
    ctx.fill();
    strokeOutline(ctx);
    // lid straps
    ctx.fillStyle = underside ? p.band : p.bandLight;
    ctx.fillRect(36, -LID_H + 3, 8, LID_H - 3);
    ctx.fillRect(76, -LID_H + 3, 8, LID_H - 3);
    if (!underside) drawLidDecor(ctx, tier, p);
    ctx.restore();
  };
  if (underside) drawLid();

  // --- body ----------------------------------------------------------------
  const bodyGrad = ctx.createLinearGradient(0, HINGE_Y, 0, 92);
  bodyGrad.addColorStop(0, p.body);
  bodyGrad.addColorStop(1, p.bodyDark);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(26, HINGE_Y, 68, 28, [0, 0, 5, 5]);
  ctx.fill();
  strokeOutline(ctx);
  drawBodyDecor(ctx, tier, p);

  // Interior + light shaft appear as the lid clears the rim.
  if (openness > 0.15) {
    const seen = clamp01((openness - 0.15) / 0.5);
    // dark inside
    ctx.fillStyle = "#1a1210";
    ctx.beginPath();
    ctx.roundRect(28, HINGE_Y, 64, 10, 3);
    ctx.fill();
    // loot mound + coins
    ctx.globalAlpha = seen;
    ctx.fillStyle = p.glow;
    ctx.beginPath();
    ctx.ellipse(60, HINGE_Y + 6, 26, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#ffd24d";
    for (const [cx, cy, r] of [
      [48, HINGE_Y + 4, 3], [60, HINGE_Y + 2.5, 3.5], [71, HINGE_Y + 4, 3],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#a87a12";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // rising light shaft
    const shaft = ctx.createLinearGradient(0, HINGE_Y, 0, 8);
    shaft.addColorStop(0, withAlpha(p.glow, 0.5 * seen * (0.6 + burst * 0.4)));
    shaft.addColorStop(1, withAlpha(p.glow, 0));
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(34, HINGE_Y);
    ctx.lineTo(86, HINGE_Y);
    ctx.lineTo(98, 8);
    ctx.lineTo(22, 8);
    ctx.closePath();
    ctx.fill();
  }
  // Body straps (the lid halves animate separately, below).
  for (const bx of [36, 76]) {
    const strap = ctx.createLinearGradient(bx, 0, bx + 8, 0);
    strap.addColorStop(0, p.bandLight);
    strap.addColorStop(1, p.band);
    ctx.fillStyle = strap;
    ctx.fillRect(bx, HINGE_Y, 8, 28);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, HINGE_Y, 8, 28);
  }

  // Lock plate on the body (the hasp on the lid swings away from it).
  drawLatch(ctx, tier, p);

  // Closed/closing lid sits in front, over the body rim.
  if (!underside) drawLid();

  // --- sparkles --------------------------------------------------------------
  for (const s of sparkles) {
    const age = t - s.born;
    if (age < 0 || age > s.life) continue;
    const fade = 1 - age / s.life;
    const twinkle = 0.6 + 0.4 * Math.sin(age * 0.03 + s.x);
    ctx.globalAlpha = fade * twinkle;
    ctx.fillStyle = s.color;
    const x = s.x + s.vx * age;
    const y = s.y + s.vy * age + 0.00001 * age * age; // faint gravity
    const r = s.size * (0.5 + fade * 0.5);
    // four-point star
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2);
    ctx.quadraticCurveTo(x, y, x + r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 2);
    ctx.quadraticCurveTo(x, y, x - r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The reveal flash sits in front of everything, then fades to a loot-light.
  if (burst > 0) paintGlow(ctx, p.glow, 0.22 * burst, 52);

  ctx.restore();
}

/** Per-tier body detail: planks, rivets, engraving, runes, scales. */
function drawBodyDecor(
  ctx: CanvasRenderingContext2D,
  tier: ChestTier,
  p: Palette
): void {
  ctx.save();
  if (tier === "wooden") {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (const y of [72, 80, 87]) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(92, y);
      ctx.stroke();
    }
  } else if (tier === "silver") {
    // brushed sheen + rivets
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.bodyLight;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, 90);
    ctx.lineTo(66, HINGE_Y + 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.band;
    for (const x of [30, 90]) {
      for (const y of [68, 76, 84]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (tier === "gold") {
    // engraved scroll arcs
    ctx.strokeStyle = "rgba(255,244,200,0.5)";
    ctx.lineWidth = 1.4;
    for (const x of [50, 70]) {
      ctx.beginPath();
      ctx.arc(x, 78, 6, Math.PI * 0.15, Math.PI * 1.6);
      ctx.stroke();
    }
  } else if (tier === "arcane") {
    // glowing runes
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = p.glow;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); // triangle rune
    ctx.moveTo(52, 84);
    ctx.lineTo(56, 72);
    ctx.lineTo(60, 84);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); // eye rune
    ctx.arc(68, 78, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(68, 78, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = p.glow;
    ctx.fill();
  } else {
    // dragon: overlapping scale rows
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 3; row++) {
      const y = 70 + row * 7;
      for (let i = 0; i < 6; i++) {
        const x = 33 + i * 10 + (row % 2) * 5;
        if (x < 30 || x > 90) continue;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Per-tier lid detail (drawn in lid-local space, y in [-LID_H, 0]). */
function drawLidDecor(
  ctx: CanvasRenderingContext2D,
  tier: ChestTier,
  p: Palette
): void {
  ctx.save();
  if (tier === "wooden") {
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, -12);
    ctx.lineTo(92, -12);
    ctx.stroke();
  } else if (tier === "gold" || tier === "silver") {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.latch;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(60, 2, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (tier === "arcane") {
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 5;
    ctx.strokeStyle = p.glow;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); // crescent rune
    ctx.arc(60, -11, 6, Math.PI * 0.25, Math.PI * 1.4);
    ctx.stroke();
  } else {
    // dragon: two horn nubs on the lid crown
    ctx.fillStyle = p.bandLight;
    for (const dx of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(60 + dx - 3, -LID_H + 4);
      ctx.lineTo(60 + dx, -LID_H - 3);
      ctx.lineTo(60 + dx + 3, -LID_H + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Lock plate on the body front. The dragon tier gets a slit-pupil eye. */
function drawLatch(
  ctx: CanvasRenderingContext2D,
  tier: ChestTier,
  p: Palette
): void {
  ctx.save();
  if (tier === "dragon") {
    ctx.fillStyle = p.latch;
    ctx.beginPath();
    ctx.ellipse(60, 72, 7, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx);
    ctx.fillStyle = "#471110";
    ctx.beginPath();
    ctx.ellipse(60, 72, 1.6, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = p.latch;
    ctx.beginPath();
    ctx.roundRect(55, 66, 10, 11, 2);
    ctx.fill();
    strokeOutline(ctx);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(60, 70.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(59, 71, 2, 3.5);
  }
  ctx.restore();
}

function paintGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  alpha: number,
  radius: number
): void {
  const g = ctx.createRadialGradient(60, HINGE_Y, 4, 60, HINGE_Y, radius);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function strokeOutline(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Ease-out with a small overshoot so the lid lands with a bounce. */
function easeOutBack(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c1 = 1.20158;
  const inv = x - 1;
  return 1 + (c1 + 1) * inv * inv * inv + c1 * inv * inv;
}
