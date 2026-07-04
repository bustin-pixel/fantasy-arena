// ============================================================================
// Arena themes
// Presentation-only battle-field backdrops. Each theme is a static background
// (pre-rendered once to an offscreen canvas by the Renderer) plus an optional
// per-frame `accents` layer for ambient animation (fireflies, embers, rotating
// glyphs). Nothing here touches simulation state — themes are chosen per match
// from the seed and drawn under the units, so determinism is unaffected.
// ============================================================================

import { FIELD_HEIGHT, FIELD_WIDTH } from "@/utils/constants";

type Ctx = CanvasRenderingContext2D;

const W = FIELD_WIDTH;
const H = FIELD_HEIGHT;

export type ArenaThemeId =
  | "grassField"
  | "colosseum"
  | "glade"
  | "sanctum"
  | "forge"
  | "dungeon";

export interface ArenaTheme {
  id: ArenaThemeId;
  name: string;
  /** Paint the static backdrop onto a FIELD_WIDTH×FIELD_HEIGHT context. */
  build: (g: Ctx) => void;
  /** Ambient animation layer, drawn every frame under the units. `t` is
   *  wall-clock seconds — purely decorative, never simulation time. */
  accents?: (g: Ctx, t: number) => void;
  /** Deploy-zone tints + midline color (light floors need stronger tints). */
  zoneTop: string;
  zoneBottom: string;
  midline: string;
}

/** Cheap deterministic hash → [0,1). Decorative only (prop placement). */
function prand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function vgrad(g: Ctx, c0: string, c1: string, c2: string): void {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, c0);
  gr.addColorStop(0.5, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}

function speckle(g: Ctx, light: number, dark: number): void {
  for (let i = 0; i < 400; i++) {
    const x = (i * 97) % W;
    const y = (i * 53) % H;
    g.fillStyle = i % 2 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    g.fillRect(x, y, 2, 2);
  }
}

/** Darkened edges pull the eye to the battlefield center. */
function vignette(g: Ctx, color: string, strength: number): void {
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, color);
  g.globalAlpha = strength;
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Grass field — the original backdrop, kept as the Depths / default look.
// ---------------------------------------------------------------------------

function buildGrassField(g: Ctx): void {
  vgrad(g, "#2f4a26", "#37562c", "#2f4a26");
  speckle(g, 0.03, 0.05);

  // Central dirt path.
  g.fillStyle = "#5a4630";
  g.globalAlpha = 0.55;
  g.beginPath();
  g.ellipse(W / 2, H / 2, 70, H / 2.4, 0, 0, Math.PI * 2);
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
}

// ---------------------------------------------------------------------------
// Sunfall Colosseum — sandstone flagstones, sun mosaic, broken pillars.
// ---------------------------------------------------------------------------

function buildColosseum(g: Ctx): void {
  vgrad(g, "#a8895c", "#b6976a", "#a1835a");

  // Flagstone grid with per-tile shade variation.
  const T = 60;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx < W / T; tx++) {
      const r = prand(tx * 31 + ty * 7);
      g.fillStyle = `rgba(${r > 0.5 ? "255,240,210" : "70,50,25"},${0.04 + r * 0.05})`;
      g.fillRect(tx * T, ty * T, T, T);
    }
  }
  g.strokeStyle = "rgba(80,60,35,0.4)";
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += T) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let y = 0; y <= H; y += T) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Hairline cracks.
  g.strokeStyle = "rgba(60,45,25,0.5)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    let x = prand(i) * W;
    let y = prand(i + 9) * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (prand(i * 4 + s) - 0.5) * 44;
      y += (prand(i * 4 + s + 2) - 0.5) * 44;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Central sun mosaic.
  g.save();
  g.translate(W / 2, H / 2);
  const rings: Array<[string, number]> = [
    ["#8a5a2b", 96], ["#c8a45e", 84], ["#8a5a2b", 64], ["#d9b56a", 52],
  ];
  for (const [c, r] of rings) {
    g.strokeStyle = c;
    g.globalAlpha = 0.7;
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 0.8;
  g.fillStyle = "#c8842e";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
    g.lineTo(Math.cos(a + 0.14) * 46, Math.sin(a + 0.14) * 46);
    g.lineTo(Math.cos(a - 0.14) * 46, Math.sin(a - 0.14) * 46);
    g.closePath();
    g.fill();
  }
  g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fillStyle = "#e0b45c"; g.fill();
  g.restore();
  g.globalAlpha = 1;

  // Broken pillar stubs in the corners.
  for (const [px, py] of [[46, 90], [434, 90], [46, 630], [434, 630]]) {
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath(); g.ellipse(px, py + 10, 26, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#cbb794";
    g.beginPath(); g.ellipse(px, py, 24, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#b5a17f";
    g.fillRect(px - 24, py - 26, 48, 26);
    g.fillStyle = "#d8c6a2";
    g.beginPath(); g.ellipse(px, py - 26, 24, 9, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(90,70,45,0.5)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(px - 14, py - 24); g.lineTo(px - 10, py - 4); g.stroke();
  }

  speckle(g, 0.05, 0.06);
  vignette(g, "rgba(70,45,20,1)", 0.35);
}

/** Sun-bleached dust motes drifting across the sand. */
function accentsColosseum(g: Ctx, t: number): void {
  g.save();
  for (let i = 0; i < 18; i++) {
    const speed = 6 + prand(i) * 8;
    const x = ((prand(i * 3) * W + t * speed) % (W + 20)) - 10;
    const y = ((prand(i * 3 + 1) * H + t * speed * 0.4) % (H + 20)) - 10;
    const a = 0.10 + 0.10 * Math.sin(t * 1.4 + i * 2.1);
    g.fillStyle = `rgba(255,236,190,${Math.max(0, a)})`;
    g.beginPath();
    g.arc(x, y, 1.4 + prand(i + 7), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Elderwood Glade — mossy grove, roots, glowing mushrooms, fireflies.
// ---------------------------------------------------------------------------

const GLADE_SHROOMS: Array<[number, number, string]> = [
  [70, 260, "#59e3ff"], [420, 320, "#59e3ff"], [100, 470, "#7dffb0"],
  [390, 540, "#59e3ff"], [240, 120, "#7dffb0"], [220, 640, "#59e3ff"],
];

function buildGlade(g: Ctx): void {
  vgrad(g, "#1e3320", "#2a4a2a", "#1c2e1e");

  // Dappled canopy light.
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(180,230,140,${0.05 + prand(i) * 0.05})`;
    g.beginPath();
    g.ellipse(
      prand(i * 3) * W, prand(i * 3 + 1) * H,
      40 + prand(i + 5) * 60, 26 + prand(i + 8) * 40,
      prand(i) * 3, 0, Math.PI * 2
    );
    g.fill();
  }

  // Mossy stone ring at center.
  g.strokeStyle = "rgba(110,140,90,0.55)";
  g.lineWidth = 10;
  g.beginPath(); g.arc(W / 2, H / 2, 80, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#5c6b52";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.ellipse(W / 2 + Math.cos(a) * 80, H / 2 + Math.sin(a) * 80, 11, 7, a, 0, Math.PI * 2);
    g.fill();
  }

  // Giant roots creeping in from the edges.
  g.fillStyle = "#3a2c1e";
  const root = (
    x0: number, y0: number, x1: number, y1: number,
    cx: number, cy: number, w: number
  ) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cx, cy, x1, y1);
    g.quadraticCurveTo(cx + w, cy + w, x0 + w * 1.5, y0);
    g.closePath();
    g.fill();
  };
  root(0, 120, 150, 0, 60, 40, 22);
  root(W, 180, W - 170, 0, W - 50, 60, -24);
  root(0, 620, 170, H, 50, 690, 26);
  root(W, 580, W - 150, H, W - 60, 660, -22);
  g.strokeStyle = "rgba(90,70,45,0.5)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(20, 100); g.quadraticCurveTo(70, 50, 130, 14); g.stroke();
  g.beginPath(); g.moveTo(W - 30, 150); g.quadraticCurveTo(W - 80, 70, W - 140, 20); g.stroke();

  // Mushroom stems (the glowing caps are animated in `accents`).
  for (const [mx, my, mc] of GLADE_SHROOMS) {
    g.fillStyle = mc;
    g.globalAlpha = 0.4;
    g.fillRect(mx - 1.5, my, 3, 6);
    g.globalAlpha = 1;
  }

  speckle(g, 0.03, 0.05);
  vignette(g, "rgba(6,16,10,1)", 0.55);
}

/** Pulsing mushroom caps + wandering fireflies. */
function accentsGlade(g: Ctx, t: number): void {
  g.save();
  for (let i = 0; i < GLADE_SHROOMS.length; i++) {
    const [mx, my, mc] = GLADE_SHROOMS[i];
    const pulse = 0.65 + 0.35 * Math.sin(t * 1.6 + i * 1.3);
    g.shadowColor = mc;
    g.shadowBlur = 10 + pulse * 8;
    g.globalAlpha = 0.55 + pulse * 0.4;
    g.fillStyle = mc;
    g.beginPath(); g.ellipse(mx, my, 7, 5, 0, Math.PI, 0); g.fill();
  }
  g.shadowColor = "#ffe98a";
  g.shadowBlur = 8;
  for (let i = 0; i < 14; i++) {
    const bx = prand(i * 7) * W;
    const by = prand(i * 7 + 3) * H;
    const x = bx + Math.sin(t * (0.3 + prand(i) * 0.4) + i * 2.7) * 26;
    const y = by + Math.cos(t * (0.25 + prand(i + 4) * 0.3) + i * 1.9) * 18;
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.1 + i * 2.2));
    g.globalAlpha = blink;
    g.fillStyle = "rgba(255,235,140,0.9)";
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Arcane Sanctum — obsidian tiles, summoning circle straddling the midline.
// ---------------------------------------------------------------------------

function buildSanctum(g: Ctx): void {
  vgrad(g, "#151022", "#1d1531", "#120e1e");

  // Faint tile grid.
  g.strokeStyle = "rgba(140,110,220,0.10)";
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let y = 0; y <= H; y += 48) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Arcane dust (the brighter twinkles are animated in `accents`).
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(200,180,255,${0.08 + prand(i) * 0.2})`;
    g.fillRect(prand(i * 3) * W, prand(i * 3 + 1) * H, 1.6, 1.6);
  }

  // Summoning circle — rings and squares are static; the glyph ticks that
  // orbit the outer ring are drawn by `accents` so the circle slowly turns.
  g.save();
  g.translate(W / 2, H / 2);
  g.shadowColor = "#8b5cf6";
  g.shadowBlur = 18;
  g.strokeStyle = "#9d78ff";
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 110, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.stroke();
  for (const rot of [0, Math.PI / 4]) {
    g.save();
    g.rotate(rot);
    g.strokeStyle = "rgba(157,120,255,0.8)";
    g.strokeRect(-66, -66, 132, 132);
    g.restore();
  }
  g.restore();

  // Floating crystals in the corners.
  for (const [cx, cy, s] of [[60, 110, 1], [420, 90, 0.8], [70, 620, 0.9], [410, 640, 1.1]]) {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.shadowColor = "#b28bff";
    g.shadowBlur = 16;
    g.fillStyle = "#7c5fd4";
    g.beginPath();
    g.moveTo(0, -24); g.lineTo(11, -4); g.lineTo(6, 18); g.lineTo(-6, 18); g.lineTo(-11, -4);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(230,215,255,0.65)";
    g.beginPath();
    g.moveTo(0, -24); g.lineTo(4, -4); g.lineTo(-6, 10); g.lineTo(-11, -4);
    g.closePath();
    g.fill();
    g.restore();
  }

  vignette(g, "rgba(4,2,12,1)", 0.5);
}

/** Slowly orbiting glyph ticks, a pulsing core, twinkling dust. */
function accentsSanctum(g: Ctx, t: number): void {
  g.save();
  g.translate(W / 2, H / 2);
  const spin = t * 0.15;
  g.shadowColor = "#8b5cf6";
  g.shadowBlur = 10;
  g.fillStyle = "#c9b1ff";
  for (let i = 0; i < 16; i++) {
    const a = spin + (i / 16) * Math.PI * 2;
    g.save();
    g.translate(Math.cos(a) * 101, Math.sin(a) * 101);
    g.rotate(a);
    g.fillRect(-1.5, -6, 3, 12);
    g.restore();
  }
  const pulse = 0.6 + 0.4 * Math.sin(t * 2);
  g.globalAlpha = pulse;
  g.fillStyle = "#e6dcff";
  g.beginPath(); g.arc(0, 0, 5 + pulse * 3, 0, Math.PI * 2); g.fill();
  g.restore();

  // Twinkling motes scattered over the tiles.
  g.save();
  for (let i = 0; i < 12; i++) {
    const a = Math.max(0, Math.sin(t * (0.8 + prand(i) * 0.8) + i * 3.1));
    g.fillStyle = `rgba(220,205,255,${a * 0.5})`;
    g.fillRect(prand(i * 11) * W, prand(i * 11 + 5) * H, 2, 2);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Emberdeep Forge — basalt slabs, lava cracks and pools, rising embers.
// ---------------------------------------------------------------------------

const FORGE_POOLS: Array<[number, number]> = [[30, 700], [455, 690], [15, 20]];

function buildForge(g: Ctx): void {
  vgrad(g, "#221d19", "#2a231d", "#1d1815");

  // Offset basalt slabs.
  const T = 80;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const r = prand(tx * 13 + ty * 29);
      g.fillStyle = `rgba(${r > 0.5 ? "90,75,60" : "10,8,6"},${0.1 + r * 0.08})`;
      g.fillRect(tx * T + (ty % 2 ? T / 2 : 0) - T / 2, ty * T, T, T);
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 2;
  for (let y = 0; y <= H; y += T) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Glowing lava cracks.
  const crack = (x: number, y: number, n: number, seed: number) => {
    g.save();
    g.shadowColor = "#ff6b35";
    g.shadowBlur = 12;
    g.strokeStyle = "#ff7b3a";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < n; s++) {
      x += (prand(seed + s) - 0.45) * 52;
      y += prand(seed + s + 40) * 46;
      g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = "#ffd23a";
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  };
  crack(40, 60, 6, 1);
  crack(400, 40, 7, 11);
  crack(240, 300, 6, 51);
  crack(90, 430, 6, 21);
  crack(360, 470, 7, 31);
  crack(240, 590, 5, 41);

  // Lava pools tucked into the corners.
  for (const [lx, ly] of FORGE_POOLS) {
    g.save();
    g.shadowColor = "#ff6b35";
    g.shadowBlur = 20;
    g.fillStyle = "#e8512a";
    g.beginPath(); g.ellipse(lx, ly, 34, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffb03a";
    g.beginPath(); g.ellipse(lx, ly, 18, 9, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  vignette(g, "rgba(8,4,2,1)", 0.5);
}

/** Rising embers + breathing lava-pool glow. */
function accentsForge(g: Ctx, t: number): void {
  g.save();
  // Pool glow breathes.
  for (let i = 0; i < FORGE_POOLS.length; i++) {
    const [lx, ly] = FORGE_POOLS[i];
    const breath = 0.10 + 0.08 * Math.sin(t * 1.2 + i * 2.4);
    const gr = g.createRadialGradient(lx, ly, 4, lx, ly, 55);
    gr.addColorStop(0, `rgba(255,140,60,${breath})`);
    gr.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = gr;
    g.fillRect(lx - 55, ly - 55, 110, 110);
  }
  // Embers drift upward, swaying, and wrap around.
  g.shadowColor = "#ff9b3a";
  g.shadowBlur = 6;
  for (let i = 0; i < 22; i++) {
    const speed = 14 + prand(i) * 18;
    const x = prand(i * 5) * W + Math.sin(t * 0.8 + i * 1.7) * 10;
    const y = H + 10 - (((prand(i * 5 + 2) * H + t * speed) % (H + 20)));
    const flicker = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 2.6));
    g.globalAlpha = flicker;
    g.fillStyle = `rgba(255,${120 + Math.floor(prand(i) * 100)},60,0.9)`;
    g.beginPath();
    g.arc(x, y, 1.5 + prand(i + 3), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Depths Dungeon — torchlit stone slabs, iron grate, bones and moss.
// Used on every floor of The Depths.
// ---------------------------------------------------------------------------

/** Wall-sconce torches lining the side walls (shared with `accents`). */
const DUNGEON_TORCHES: Array<[number, number]> = [
  [16, 150], [464, 150], [16, 400], [464, 400], [16, 610], [464, 610],
];

function buildDungeon(g: Ctx): void {
  vgrad(g, "#232228", "#2b2a31", "#1e1d23");

  // Offset stone slabs with per-tile shade variation.
  const T = 60;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const r = prand(tx * 17 + ty * 43);
      g.fillStyle = `rgba(${r > 0.5 ? "160,160,175" : "5,5,10"},${0.05 + r * 0.07})`;
      g.fillRect(tx * T + (ty % 2 ? T / 2 : 0) - T / 2, ty * T, T, T);
    }
  }
  g.strokeStyle = "rgba(8,8,12,0.55)";
  g.lineWidth = 2;
  for (let y = 0; y <= H; y += T) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const x = tx * T + (ty % 2 ? T / 2 : 0);
      g.beginPath(); g.moveTo(x, ty * T); g.lineTo(x, ty * T + T); g.stroke();
    }
  }

  // Hairline cracks.
  g.strokeStyle = "rgba(10,10,14,0.6)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    let x = prand(i + 60) * W;
    let y = prand(i + 70) * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (prand(i * 5 + s) - 0.5) * 40;
      y += (prand(i * 5 + s + 3) - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Damp moss creeping out of the corners and along the walls.
  for (const [mx, my, mr] of [
    [10, 30, 50], [470, 60, 44], [8, 690, 56], [472, 680, 48], [240, 6, 36],
  ]) {
    g.fillStyle = "rgba(52,72,44,0.35)";
    g.beginPath(); g.ellipse(mx, my, mr, mr * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(70,95,55,0.25)";
    g.beginPath(); g.ellipse(mx + 6, my + 4, mr * 0.55, mr * 0.35, 0.4, 0, Math.PI * 2); g.fill();
  }

  // Shallow puddles catching a cold sheen.
  for (const [px, py, pr] of [[130, 200, 26], [356, 560, 30], [90, 500, 18]]) {
    g.fillStyle = "rgba(12,14,22,0.55)";
    g.beginPath(); g.ellipse(px, py, pr, pr * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(140,160,200,0.18)";
    g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(px, py, pr * 0.8, pr * 0.32, 0, 0, Math.PI * 2); g.stroke();
  }

  // Central iron drain grate.
  g.save();
  g.translate(W / 2, H / 2);
  g.fillStyle = "rgba(10,10,14,0.6)";
  g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#4a4a52";
  g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    g.beginPath();
    g.moveTo(Math.cos(a) * 54, Math.sin(a) * 54);
    g.lineTo(-Math.cos(a) * 54, -Math.sin(a) * 54);
    g.stroke();
  }
  // rivets on the outer ring
  g.fillStyle = "#5b5b64";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.beginPath(); g.arc(Math.cos(a) * 56, Math.sin(a) * 56, 3, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // Scattered old bones.
  const bone = (bx: number, by: number, rot: number) => {
    g.save();
    g.translate(bx, by);
    g.rotate(rot);
    g.strokeStyle = "#b9b3a4";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke();
    g.fillStyle = "#b9b3a4";
    for (const ex of [-8, 8]) {
      g.beginPath(); g.arc(ex, -2.5, 2.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(ex, 2.5, 2.6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
  bone(88, 320, 0.6);
  bone(402, 250, -0.9);
  bone(150, 620, 2.2);
  bone(340, 100, 1.4);
  // a lone skull by the grate
  g.fillStyle = "#c4beae";
  g.beginPath(); g.arc(310, 396, 7, 0, Math.PI * 2); g.fill();
  g.fillRect(306, 400, 8, 5);
  g.fillStyle = "#1e1d23";
  g.beginPath(); g.arc(307.5, 395, 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(312.5, 395, 1.8, 0, Math.PI * 2); g.fill();

  // Torch sconces: iron bracket + charred stub (the flame itself is animated).
  for (const [tx, ty] of DUNGEON_TORCHES) {
    g.fillStyle = "#3a3a42";
    g.fillRect(tx - 3, ty + 4, 6, 12);
    g.fillStyle = "#57432c";
    g.fillRect(tx - 2.5, ty - 8, 5, 14);
  }

  speckle(g, 0.02, 0.06);
  vignette(g, "rgba(2,2,6,1)", 0.62);
}

/** Flickering torch flames + warm breathing glow + drifting dust. */
function accentsDungeon(g: Ctx, t: number): void {
  g.save();
  for (let i = 0; i < DUNGEON_TORCHES.length; i++) {
    const [tx, ty] = DUNGEON_TORCHES[i];
    const flick = 0.72 + 0.28 * Math.sin(t * 9 + i * 2.3) * Math.sin(t * 5.7 + i);
    // pool of torchlight on the floor
    const gr = g.createRadialGradient(tx, ty, 4, tx, ty, 90);
    gr.addColorStop(0, `rgba(255,160,70,${0.13 * flick})`);
    gr.addColorStop(1, "rgba(255,160,70,0)");
    g.fillStyle = gr;
    g.fillRect(tx - 90, ty - 90, 180, 180);
    // the flame
    g.shadowColor = "#ffa040";
    g.shadowBlur = 12;
    g.fillStyle = "#ff9b35";
    g.beginPath();
    g.ellipse(tx, ty - 12, 4 * flick + 1.5, 8 * flick + 3, Math.sin(t * 7 + i) * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffd873";
    g.beginPath();
    g.ellipse(tx, ty - 10, 2 * flick + 0.8, 4 * flick + 1.5, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  // Dust sifting down from the ceiling.
  for (let i = 0; i < 12; i++) {
    const speed = 5 + prand(i + 30) * 7;
    const x = prand(i * 9) * W + Math.sin(t * 0.5 + i) * 6;
    const y = ((prand(i * 9 + 4) * H + t * speed) % (H + 10)) - 5;
    g.globalAlpha = 0.10 + 0.08 * Math.sin(t + i * 1.8);
    g.fillStyle = "rgba(200,195,185,0.9)";
    g.fillRect(x, y, 1.5, 1.5);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Registry + per-match selection
// ---------------------------------------------------------------------------

export const ARENA_THEMES: Record<ArenaThemeId, ArenaTheme> = {
  grassField: {
    id: "grassField",
    name: "Greenfield",
    build: buildGrassField,
    zoneTop: "rgba(180,40,40,0.06)",
    zoneBottom: "rgba(60,140,220,0.06)",
    midline: "rgba(245,179,1,0.25)",
  },
  colosseum: {
    id: "colosseum",
    name: "Sunfall Colosseum",
    build: buildColosseum,
    accents: accentsColosseum,
    zoneTop: "rgba(180,40,40,0.09)",
    zoneBottom: "rgba(60,140,220,0.09)",
    midline: "rgba(140,90,40,0.5)",
  },
  glade: {
    id: "glade",
    name: "Elderwood Glade",
    build: buildGlade,
    accents: accentsGlade,
    zoneTop: "rgba(180,40,40,0.07)",
    zoneBottom: "rgba(60,140,220,0.07)",
    midline: "rgba(150,220,130,0.35)",
  },
  sanctum: {
    id: "sanctum",
    name: "Arcane Sanctum",
    build: buildSanctum,
    accents: accentsSanctum,
    zoneTop: "rgba(220,60,90,0.08)",
    zoneBottom: "rgba(70,150,255,0.08)",
    midline: "rgba(157,120,255,0.35)",
  },
  forge: {
    id: "forge",
    name: "Emberdeep Forge",
    build: buildForge,
    accents: accentsForge,
    zoneTop: "rgba(220,60,60,0.08)",
    zoneBottom: "rgba(60,140,220,0.09)",
    midline: "rgba(255,140,60,0.35)",
  },
  dungeon: {
    id: "dungeon",
    name: "The Depths",
    build: buildDungeon,
    accents: accentsDungeon,
    zoneTop: "rgba(200,50,50,0.08)",
    zoneBottom: "rgba(70,140,220,0.08)",
    midline: "rgba(255,170,80,0.30)",
  },
};

/** The themes Arena mode rotates through (grassField stays the Depths look). */
const ARENA_ROTATION: ArenaThemeId[] = ["colosseum", "glade", "sanctum", "forge"];

/** Dev/testing override: set localStorage "fantasy-arena/arena-theme" to a
 *  theme id to pin the backdrop. Presentation-only, so this can't desync. */
const THEME_OVERRIDE_KEY = "fantasy-arena/arena-theme";

/** Pick the Arena backdrop for a match. Derived from the match seed so a
 *  replay of the same seed shows the same arena. */
export function pickArenaTheme(seed: number): ArenaThemeId {
  try {
    const override = localStorage.getItem(THEME_OVERRIDE_KEY);
    if (override && override in ARENA_THEMES) return override as ArenaThemeId;
  } catch {
    // localStorage unavailable (SSR/tests) — fall through to seed pick.
  }
  return ARENA_ROTATION[Math.abs(seed) % ARENA_ROTATION.length];
}
