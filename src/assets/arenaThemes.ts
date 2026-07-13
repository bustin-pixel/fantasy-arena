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
  | "dungeon"
  | "bonefields"
  | "huntingGrounds"
  | "sealedVault"
  | "overgrowth"
  | "eclipseSpire"
  | "deepForge"
  | "frostveil"
  | "mire"
  | "feyCourt"
  | "shadowPit"
  | "hollow"
  | "fallenCathedral";

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

/** Little femur prop, shared by the grim themes. */
function boneProp(g: Ctx, bx: number, by: number, rot: number): void {
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
// Dungeon — torchlit stone slabs, iron grate, bones and moss.
// Every floor of The Depths uses it; it's also in the Arena rotation.
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
// The Bonefields — grave dirt, tilted headstones, green grave-candles.
// Livelies: rising soul wisps, guttering green flames, low creeping fog.
// ---------------------------------------------------------------------------

const GRAVE_CANDLES: Array<[number, number]> = [
  [70, 180], [410, 240], [90, 560], [396, 590], [240, 96],
];

function buildBonefields(g: Ctx): void {
  vgrad(g, "#2e2820", "#3a3128", "#262019");

  // Bare dirt patches.
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(90,70,45,${0.08 + prand(i) * 0.08})`;
    g.beginPath();
    g.ellipse(prand(i * 3) * W, prand(i * 3 + 1) * H, 40 + prand(i + 5) * 50, 22 + prand(i + 8) * 26, prand(i) * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Tilted headstones (kept off the center lane).
  const stones: Array<[number, number, number]> = [
    [52, 120, -0.12], [430, 130, 0.1], [40, 420, 0.16], [442, 420, -0.14],
    [66, 660, -0.08], [420, 668, 0.12], [150, 60, 0.06], [340, 640, -0.05],
  ];
  for (const [sx, sy, rot] of stones) {
    g.save();
    g.translate(sx, sy);
    g.rotate(rot);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(2, 20, 18, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#6f6a5e";
    g.beginPath();
    g.moveTo(-13, 20); g.lineTo(-13, -10);
    g.arc(0, -10, 13, Math.PI, 0);
    g.lineTo(13, 20);
    g.closePath(); g.fill();
    g.fillStyle = "#807a6c";
    g.fillRect(-13, -6, 8, 26);
    g.strokeStyle = "rgba(30,28,22,0.6)";
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-6, -12); g.lineTo(2, 2); g.lineTo(-2, 12); g.stroke();
    g.restore();
  }

  // Open grave pits with dirt mounds.
  for (const [px, py] of [[130, 300], [352, 500]]) {
    g.fillStyle = "#141009";
    g.beginPath(); g.ellipse(px, py, 30, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(110,85,55,0.6)";
    g.beginPath(); g.ellipse(px + 34, py + 8, 16, 7, 0.3, 0, Math.PI * 2); g.fill();
  }

  boneProp(g, 96, 250, 0.7);
  boneProp(g, 390, 350, -1.1);
  boneProp(g, 210, 630, 2.0);

  // Candle stubs (flames animate in accents).
  for (const [cx, cy] of GRAVE_CANDLES) {
    g.fillStyle = "#d8d2bc";
    g.fillRect(cx - 3, cy - 6, 6, 10);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(cx, cy + 5, 7, 3, 0, 0, Math.PI * 2); g.fill();
  }

  speckle(g, 0.02, 0.06);
  vignette(g, "rgba(4,6,4,1)", 0.6);
}

function accentsBonefields(g: Ctx, t: number): void {
  g.save();
  // Guttering green candle flames + light pools.
  for (let i = 0; i < GRAVE_CANDLES.length; i++) {
    const [cx, cy] = GRAVE_CANDLES[i];
    const flick = 0.7 + 0.3 * Math.sin(t * 8 + i * 2.1) * Math.sin(t * 5.3 + i);
    const gr = g.createRadialGradient(cx, cy, 3, cx, cy, 60);
    gr.addColorStop(0, `rgba(110,255,160,${0.1 * flick})`);
    gr.addColorStop(1, "rgba(110,255,160,0)");
    g.fillStyle = gr;
    g.fillRect(cx - 60, cy - 60, 120, 120);
    g.shadowColor = "#7dffb0";
    g.shadowBlur = 10;
    g.fillStyle = "#8dffb8";
    g.beginPath();
    g.ellipse(cx, cy - 12, 2.5 * flick + 1, 6 * flick + 2, Math.sin(t * 6 + i) * 0.2, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  // Soul wisps rising out of the graves.
  g.shadowColor = "#b0ffd0";
  g.shadowBlur = 8;
  for (let i = 0; i < 10; i++) {
    const speed = 10 + prand(i) * 12;
    const x = prand(i * 7) * W + Math.sin(t * 0.9 + i * 2.2) * 16;
    const y = H + 10 - ((prand(i * 7 + 3) * H + t * speed) % (H + 20));
    const a = 0.12 + 0.18 * Math.max(0, Math.sin(t * 0.8 + i * 2.8));
    g.globalAlpha = a;
    g.fillStyle = "rgba(190,255,215,0.9)";
    g.beginPath(); g.arc(x, y, 2.4 + prand(i + 4) * 1.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 1, y + 6, 1.2, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  // Low fog banks creeping sideways.
  for (let i = 0; i < 4; i++) {
    const x = ((prand(i * 13) * W + t * (5 + i * 2)) % (W + 240)) - 120;
    const y = 140 + prand(i * 13 + 5) * 480;
    g.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.5 + i * 2);
    g.fillStyle = "#b9c4b2";
    g.beginPath(); g.ellipse(x, y, 110, 26, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Hunting Grounds — trampled earth, claw gashes, painted standing
// stones, skull totems, pine edges. Livelies: falling leaves, crossing
// birds, drifting seed puffs.
// ---------------------------------------------------------------------------

function buildHuntingGrounds(g: Ctx): void {
  vgrad(g, "#33422a", "#3f4d2e", "#2e3b26");
  speckle(g, 0.03, 0.05);

  // Trampled diagonal game trail.
  g.fillStyle = "rgba(96,74,46,0.4)";
  g.beginPath();
  g.moveTo(90, 0); g.lineTo(180, 0);
  g.quadraticCurveTo(300, 340, 400, H);
  g.lineTo(310, H);
  g.quadraticCurveTo(210, 340, 90, 0);
  g.closePath(); g.fill();

  // Pine silhouettes crowding the top and bottom edges.
  g.fillStyle = "rgba(18,32,18,0.8)";
  for (let i = 0; i < 8; i++) {
    const x = i * 66 + (i % 2 ? 20 : 0);
    for (const yBase of [4, H - 4]) {
      const dir = yBase < H / 2 ? 1 : -1;
      const h = 28 + prand(i) * 22;
      g.beginPath();
      g.moveTo(x, yBase);
      g.lineTo(x + 16, yBase);
      g.lineTo(x + 8, yBase + dir * h);
      g.closePath(); g.fill();
    }
  }

  // Claw gashes torn into the turf.
  g.strokeStyle = "rgba(50,32,20,0.75)";
  g.lineWidth = 4;
  g.lineCap = "round";
  for (const [gx, gy, rot] of [[120, 250, 0.5], [370, 420, -0.7], [200, 580, 0.2]]) {
    g.save();
    g.translate(gx, gy);
    g.rotate(rot);
    for (let s = -1; s <= 1; s++) {
      g.beginPath();
      g.moveTo(-26, s * 10);
      g.quadraticCurveTo(0, s * 10 + 4, 30, s * 10);
      g.stroke();
    }
    g.restore();
  }
  g.lineCap = "butt";

  // Standing stones with ochre beast paintings.
  for (const [sx, sy, s] of [[60, 340, 1], [424, 200, 0.85], [420, 560, 1.05]]) {
    g.save();
    g.translate(sx, sy);
    g.scale(s, s);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(2, 34, 24, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#66685c";
    g.beginPath();
    g.moveTo(-20, 34); g.lineTo(-16, -26); g.quadraticCurveTo(0, -40, 14, -28);
    g.lineTo(20, 34); g.closePath(); g.fill();
    g.fillStyle = "#787a6c";
    g.beginPath();
    g.moveTo(-14, 30); g.lineTo(-11, -22); g.quadraticCurveTo(-2, -30, 2, -26);
    g.lineTo(0, 30); g.closePath(); g.fill();
    // ochre elk + hunter stick-figures
    g.strokeStyle = "rgba(190,110,50,0.9)";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-8, 2); g.lineTo(0, 2); g.moveTo(-6, 2); g.lineTo(-6, 10); g.moveTo(-2, 2); g.lineTo(-2, 10); g.stroke();
    g.beginPath(); g.moveTo(0, 2); g.lineTo(4, -6); g.moveTo(2, -2); g.lineTo(6, -2); g.stroke();
    g.beginPath(); g.arc(8, -8, 2.5, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // Skull totems on stakes.
  for (const [tx, ty] of [[150, 130], [330, 620]]) {
    g.strokeStyle = "#4c3a26";
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(tx, ty + 26); g.lineTo(tx, ty - 8); g.stroke();
    g.fillStyle = "#cfc6ae";
    g.beginPath(); g.arc(tx, ty - 14, 9, 0, Math.PI * 2); g.fill();
    g.fillRect(tx - 5, ty - 9, 10, 6);
    g.fillStyle = "#2e3b26";
    g.beginPath(); g.arc(tx - 3.5, ty - 15, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(tx + 3.5, ty - 15, 2.2, 0, Math.PI * 2); g.fill();
    // antlers lashed to the stake
    g.strokeStyle = "#b8a888";
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(tx - 8, ty - 20); g.quadraticCurveTo(tx - 18, ty - 30, tx - 14, ty - 40); g.stroke();
    g.beginPath(); g.moveTo(tx + 8, ty - 20); g.quadraticCurveTo(tx + 18, ty - 30, tx + 14, ty - 40); g.stroke();
  }

  boneProp(g, 250, 320, 1.2);
  vignette(g, "rgba(8,14,8,1)", 0.5);
}

function accentsHuntingGrounds(g: Ctx, t: number): void {
  g.save();
  // Falling leaves, tumbling as they drift.
  for (let i = 0; i < 12; i++) {
    const speed = 16 + prand(i) * 14;
    const x = prand(i * 5) * W + Math.sin(t * 1.1 + i * 1.9) * 30;
    const y = ((prand(i * 5 + 2) * H + t * speed) % (H + 20)) - 10;
    g.save();
    g.translate(x, y);
    g.rotate(t * (1 + prand(i)) + i);
    g.globalAlpha = 0.55;
    g.fillStyle = i % 3 === 0 ? "#c8842e" : i % 3 === 1 ? "#a8642a" : "#8a7a2e";
    g.beginPath(); g.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // A pair of birds crossing high overhead every so often.
  const cycle = (t % 9) / 9;
  if (cycle < 0.5) {
    const bx = cycle * 2 * (W + 160) - 80;
    for (const [ox, oy] of [[0, 0], [26, 10]]) {
      const by = 90 + oy + Math.sin(t * 6 + ox) * 3;
      g.strokeStyle = "rgba(20,26,18,0.7)";
      g.lineWidth = 2;
      const flap = Math.sin(t * 10 + ox) * 4;
      g.beginPath();
      g.moveTo(bx + ox - 7, by - flap);
      g.quadraticCurveTo(bx + ox, by + 3, bx + ox + 7, by - flap);
      g.stroke();
    }
  }
  // Drifting seed puffs catching the light.
  g.shadowColor = "#fff8d8";
  g.shadowBlur = 5;
  for (let i = 0; i < 8; i++) {
    const x = ((prand(i * 9) * W + t * (8 + prand(i) * 6)) % (W + 20)) - 10;
    const y = prand(i * 9 + 4) * H + Math.sin(t * 0.7 + i * 2.4) * 20;
    g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.3 + i * 2);
    g.fillStyle = "rgba(255,250,225,0.9)";
    g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Sealed Vault — black marble, a giant rune-bolted vault seal in the
// floor, warding chains. Livelies: counter-rotating ward rings, sparks
// leaking from the crack, a glint racing along the chains.
// ---------------------------------------------------------------------------

const VAULT_CHAINS: Array<[number, number, number, number]> = [
  [0, 60, W / 2 - 96, H / 2 - 66], [W, 100, W / 2 + 96, H / 2 - 60],
  [0, 660, W / 2 - 90, H / 2 + 70], [W, 620, W / 2 + 92, H / 2 + 64],
];

function buildSealedVault(g: Ctx): void {
  vgrad(g, "#131120", "#191527", "#100e1b");

  // Marble veining.
  g.strokeStyle = "rgba(200,195,230,0.07)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    let x = prand(i * 3) * W;
    let y = prand(i * 3 + 1) * H;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (prand(i * 6 + s) - 0.45) * 70;
      y += (prand(i * 6 + s + 3) - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Warding chains stretched from the corners to the seal.
  g.fillStyle = "#4c4a58";
  for (const [x0, y0, x1, y1] of VAULT_CHAINS) {
    const links = 14;
    for (let i = 0; i <= links; i++) {
      const f = i / links;
      const sag = Math.sin(f * Math.PI) * 18;
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f + sag;
      g.beginPath();
      g.ellipse(x, y, 5, 3.2, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
      g.fill();
    }
  }

  // The great vault seal.
  g.save();
  g.translate(W / 2, H / 2);
  g.fillStyle = "#221f30";
  g.beginPath(); g.arc(0, 0, 132, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#6a6478";
  g.lineWidth = 8;
  g.beginPath(); g.arc(0, 0, 130, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "#3c3850";
  g.lineWidth = 3;
  for (const r of [112, 58]) {
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  // rune bolt studs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 122, y = Math.sin(a) * 122;
    g.fillStyle = "#8d86a2";
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2738";
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  }
  // central keyhole boss
  g.fillStyle = "#8d86a2";
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#191527";
  g.beginPath(); g.arc(0, -3, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.lineTo(3, 13); g.lineTo(-3, 13); g.closePath(); g.fill();
  // the crack in the seal, faintly leaking gold light
  g.save();
  g.shadowColor = "#ffd873";
  g.shadowBlur = 10;
  g.strokeStyle = "rgba(255,214,120,0.75)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(28, -110);
  g.lineTo(44, -62); g.lineTo(30, -30); g.lineTo(50, 8);
  g.stroke();
  g.restore();
  g.restore();

  // Corner ward pylons.
  for (const [px, py] of [[44, 76], [436, 76], [44, 648], [436, 648]]) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(px, py + 16, 20, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#35314a";
    g.fillRect(px - 12, py - 24, 24, 40);
    g.fillStyle = "#4b4566";
    g.fillRect(px - 16, py - 30, 32, 8);
    g.save();
    g.shadowColor = "#ffd873";
    g.shadowBlur = 8;
    g.fillStyle = "#e8c56a";
    g.beginPath(); g.arc(px, py - 8, 4, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  vignette(g, "rgba(3,2,10,1)", 0.55);
}

function accentsSealedVault(g: Ctx, t: number): void {
  g.save();
  g.translate(W / 2, H / 2);
  // Counter-rotating ward rings of golden glyph ticks.
  g.shadowColor = "#ffd873";
  g.shadowBlur = 8;
  g.fillStyle = "#ffe6a0";
  for (const [r, n, dir] of [[96, 14, 1], [74, 10, -1]]) {
    for (let i = 0; i < n; i++) {
      const a = t * 0.22 * dir + (i / n) * Math.PI * 2;
      g.save();
      g.translate(Math.cos(a) * r, Math.sin(a) * r);
      g.rotate(a);
      g.globalAlpha = 0.75;
      g.fillRect(-1.5, -5, 3, 10);
      g.restore();
    }
  }
  // Sparks leaking out of the crack.
  for (let i = 0; i < 7; i++) {
    const life = (t * (0.6 + prand(i) * 0.5) + prand(i * 3)) % 1;
    const x = 38 + prand(i * 5) * 10 + (prand(i) - 0.5) * 20 * life;
    const y = -60 + prand(i * 5 + 2) * 90 - life * 46;
    g.globalAlpha = (1 - life) * 0.8;
    g.fillStyle = "#ffe9b0";
    g.fillRect(x, y, 2, 2);
  }
  // The seal core breathing gold through the keyhole.
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
  g.globalAlpha = 0.25 + pulse * 0.3;
  g.fillStyle = "#ffdf8e";
  g.beginPath(); g.arc(0, 0, 10 + pulse * 5, 0, Math.PI * 2); g.fill();
  g.restore();

  // A glint racing along each chain in turn.
  g.save();
  g.shadowColor = "#fff2c8";
  g.shadowBlur = 8;
  const which = Math.floor(t / 2.2) % VAULT_CHAINS.length;
  const f = (t % 2.2) / 2.2;
  const [x0, y0, x1, y1] = VAULT_CHAINS[which];
  const gx = x0 + (x1 - x0) * f;
  const gy = y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * 18;
  g.globalAlpha = Math.sin(f * Math.PI) * 0.9;
  g.fillStyle = "#fff6d8";
  g.beginPath(); g.arc(gx, gy, 2.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------
// The Overgrowth — strangling vines, thorn brambles, spore pods, a great
// heart-root under the field. Livelies: heartbeat vein glow, swelling
// pods, drifting spores.
// ---------------------------------------------------------------------------

const SPORE_PODS: Array<[number, number, number]> = [
  [80, 210, 1], [408, 300, 1.2], [110, 540, 0.9], [386, 580, 1.1], [230, 110, 0.8],
];

function buildOvergrowth(g: Ctx): void {
  vgrad(g, "#17240f", "#213318", "#131f0d");

  // Matted vine tangles across the whole floor.
  for (let i = 0; i < 26; i++) {
    const x0 = prand(i * 4) * W;
    const y0 = prand(i * 4 + 1) * H;
    g.strokeStyle = `rgba(${30 + prand(i) * 30},${60 + prand(i + 2) * 40},${20 + prand(i + 3) * 20},0.5)`;
    g.lineWidth = 2 + prand(i + 5) * 3;
    g.beginPath();
    g.moveTo(x0, y0);
    g.bezierCurveTo(
      x0 + (prand(i * 7) - 0.5) * 200, y0 + (prand(i * 7 + 1) - 0.5) * 160,
      x0 + (prand(i * 7 + 2) - 0.5) * 200, y0 + (prand(i * 7 + 3) - 0.5) * 160,
      x0 + (prand(i * 7 + 4) - 0.5) * 260, y0 + (prand(i * 7 + 5) - 0.5) * 220
    );
    g.stroke();
  }

  // Thorned brambles crowding the corners.
  g.strokeStyle = "#1e2a12";
  for (const [bx, by, dir] of [[0, 0, 1], [W, 0, -1], [0, H, 1], [W, H, -1]]) {
    for (let i = 0; i < 5; i++) {
      g.lineWidth = 4 - i * 0.5;
      g.beginPath();
      g.moveTo(bx, by + (prand(i) - 0.5) * 60);
      g.quadraticCurveTo(
        bx + dir * (60 + i * 22), by === 0 ? 60 + i * 18 : H - 60 - i * 18,
        bx + dir * (30 + i * 30), by === 0 ? 120 + i * 10 : H - 120 - i * 10
      );
      g.stroke();
      // thorns
      g.fillStyle = "#141d0b";
      for (let s = 0; s < 4; s++) {
        const fx = bx + dir * (18 + i * 24 + s * 9);
        const fy = (by === 0 ? 50 + i * 16 : H - 50 - i * 16) + s * (by === 0 ? 14 : -14);
        g.beginPath();
        g.moveTo(fx, fy); g.lineTo(fx + 5 * dir, fy - 3); g.lineTo(fx + 2 * dir, fy + 3);
        g.closePath(); g.fill();
      }
    }
  }

  // The heart-root: a gnarled knot at center with veins radiating outward.
  g.save();
  g.translate(W / 2, H / 2);
  g.fillStyle = "#2c2013";
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 44 + Math.sin(a * 5) * 8;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  g.strokeStyle = "#3d2d1a";
  g.lineWidth = 3;
  g.stroke();
  // dormant veins (glow animates in accents)
  g.strokeStyle = "rgba(110,200,90,0.25)";
  g.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    g.beginPath();
    g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
    g.quadraticCurveTo(
      Math.cos(a + 0.5) * 110, Math.sin(a + 0.5) * 110,
      Math.cos(a + 0.3) * 190, Math.sin(a + 0.3) * 190
    );
    g.stroke();
  }
  g.restore();

  // Spore pod stems (bulbs animate in accents).
  for (const [px, py, s] of SPORE_PODS) {
    g.strokeStyle = "#3a4a22";
    g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(px, py + 12 * s); g.lineTo(px, py); g.stroke();
  }

  speckle(g, 0.02, 0.05);
  vignette(g, "rgba(4,10,3,1)", 0.6);
}

function accentsOvergrowth(g: Ctx, t: number): void {
  g.save();
  // Double-thump heartbeat on the root veins.
  const beat = Math.max(0, Math.sin(t * 3.2)) ** 6 + 0.6 * Math.max(0, Math.sin(t * 3.2 - 0.8)) ** 6;
  g.save();
  g.translate(W / 2, H / 2);
  g.strokeStyle = `rgba(140,255,110,${0.1 + beat * 0.4})`;
  g.shadowColor = "#7dffb0";
  g.shadowBlur = 8 + beat * 10;
  g.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    g.beginPath();
    g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
    g.quadraticCurveTo(
      Math.cos(a + 0.5) * 110, Math.sin(a + 0.5) * 110,
      Math.cos(a + 0.3) * 190, Math.sin(a + 0.3) * 190
    );
    g.stroke();
  }
  g.globalAlpha = 0.2 + beat * 0.5;
  g.fillStyle = "#9dff8a";
  g.beginPath(); g.arc(0, 0, 8 + beat * 6, 0, Math.PI * 2); g.fill();
  g.restore();

  // Spore pods swelling and glowing.
  for (let i = 0; i < SPORE_PODS.length; i++) {
    const [px, py, s] = SPORE_PODS[i];
    const swell = 0.85 + 0.15 * Math.sin(t * 1.4 + i * 1.7);
    g.shadowColor = "#c8ff70";
    g.shadowBlur = 8 + swell * 6;
    g.fillStyle = "#6a8a30";
    g.beginPath(); g.ellipse(px, py - 4 * s, 9 * s * swell, 11 * s * swell, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(215,255,140,${0.35 + swell * 0.3})`;
    g.beginPath(); g.ellipse(px - 2 * s, py - 7 * s, 3.5 * s * swell, 4.5 * s * swell, 0, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;

  // Spores drifting up and sideways.
  for (let i = 0; i < 16; i++) {
    const x = ((prand(i * 5) * W + t * (6 + prand(i) * 8)) % (W + 20)) - 10;
    const y = H + 10 - ((prand(i * 5 + 2) * H + t * (8 + prand(i + 2) * 10)) % (H + 20));
    g.globalAlpha = 0.2 + 0.25 * Math.sin(t * 1.2 + i * 2.4);
    g.fillStyle = "#d0ff9a";
    g.beginPath(); g.arc(x, y, 1.4 + prand(i + 6), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Eclipse Spire — the floor itself is split day/night across the
// midline, with an orrery ring straddling it. Livelies: orbiting sun and
// moon that periodically eclipse, twinkling stars, drifting light motes.
// ---------------------------------------------------------------------------

function buildEclipseSpire(g: Ctx): void {
  // Day half (enemy side) / night half (player side).
  const day = g.createLinearGradient(0, 0, 0, H / 2);
  day.addColorStop(0, "#cbb88a");
  day.addColorStop(1, "#b5a077");
  g.fillStyle = day;
  g.fillRect(0, 0, W, H / 2);
  const night = g.createLinearGradient(0, H / 2, 0, H);
  night.addColorStop(0, "#221c3e");
  night.addColorStop(1, "#151129");
  g.fillStyle = night;
  g.fillRect(0, H / 2, W, H / 2);

  // Sun-ray inlay on the day half.
  g.save();
  g.translate(W / 2, H * 0.22);
  g.strokeStyle = "rgba(160,110,40,0.35)";
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
    g.lineTo(Math.cos(a) * 64, Math.sin(a) * 64);
    g.stroke();
  }
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke();
  g.restore();

  // Crescent inlay + fixed stars on the night half.
  g.save();
  g.translate(W / 2, H * 0.78);
  g.strokeStyle = "rgba(150,150,220,0.35)";
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 34, Math.PI * 0.35, Math.PI * 1.65); g.stroke();
  g.beginPath(); g.arc(14, 0, 26, Math.PI * 0.45, Math.PI * 1.55); g.stroke();
  g.restore();
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(220,220,255,${0.15 + prand(i) * 0.3})`;
    g.fillRect(prand(i * 3) * W, H / 2 + prand(i * 3 + 1) * (H / 2), 1.6, 1.6);
  }

  // Worn marble tiling on both halves.
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 1.5;
  for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  // The orrery: three rings straddling the midline, gold above, silver below.
  g.save();
  g.translate(W / 2, H / 2);
  for (const r of [64, 100, 136]) {
    const grad = g.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, "rgba(214,164,70,0.85)");
    grad.addColorStop(0.5, "rgba(200,180,160,0.7)");
    grad.addColorStop(1, "rgba(150,160,230,0.85)");
    g.strokeStyle = grad;
    g.lineWidth = r === 100 ? 5 : 2.5;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  g.restore();

  // Broken statue plinths at the four corners.
  for (const [px, py, dark] of [[50, 90, 0], [430, 90, 0], [50, 630, 1], [430, 630, 1]]) {
    g.fillStyle = dark ? "#2d2750" : "#a8946a";
    g.fillRect(px - 18, py - 12, 36, 24);
    g.fillStyle = dark ? "#403a68" : "#c0ab7d";
    g.fillRect(px - 22, py - 18, 44, 8);
  }

  vignette(g, "rgba(10,8,20,1)", 0.4);
}

function accentsEclipseSpire(g: Ctx, t: number): void {
  g.save();
  g.translate(W / 2, H / 2);
  const a1 = t * 0.24;          // sun
  const a2 = t * 0.57 + Math.PI; // moon, faster — laps the sun for eclipses
  const r = 100;
  const sx = Math.cos(a1) * r, sy = Math.sin(a1) * r;
  const mx = Math.cos(a2) * r, my = Math.sin(a2) * r;
  // eclipse proximity → corona flash
  let d = Math.abs(((a1 - a2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  d = Math.min(d, Math.PI * 2 - d);
  const near = Math.max(0, 1 - d / 0.5);
  // the sun
  g.shadowColor = "#ffcf5a";
  g.shadowBlur = 14;
  g.fillStyle = "#ffcf5a";
  g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fff0b8";
  g.beginPath(); g.arc(sx - 2, sy - 2, 4, 0, Math.PI * 2); g.fill();
  // the moon
  g.shadowColor = "#b9c2ff";
  g.shadowBlur = 12;
  g.fillStyle = "#c8cfec";
  g.beginPath(); g.arc(mx, my, 7.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8e97c4";
  g.beginPath(); g.arc(mx + 2, my + 1, 2.4, 0, Math.PI * 2); g.fill();
  // corona when they overlap
  if (near > 0) {
    g.globalAlpha = near * 0.8;
    g.strokeStyle = "#fff3c8";
    g.shadowColor = "#fff3c8";
    g.shadowBlur = 20;
    g.lineWidth = 3;
    g.beginPath(); g.arc(mx, my, 13 + near * 8, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = near * 0.25;
    g.fillStyle = "#fff8e0";
    g.beginPath(); g.arc(mx, my, 40, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // Twinkling stars (night half) and drifting motes (day half).
  g.save();
  for (let i = 0; i < 10; i++) {
    const a = Math.max(0, Math.sin(t * (0.9 + prand(i) * 0.7) + i * 2.9));
    g.fillStyle = `rgba(225,225,255,${a * 0.6})`;
    g.fillRect(prand(i * 11) * W, H / 2 + 20 + prand(i * 11 + 5) * (H / 2 - 30), 2, 2);
  }
  for (let i = 0; i < 8; i++) {
    const x = ((prand(i * 13) * W + t * (7 + prand(i) * 6)) % (W + 16)) - 8;
    const y = 20 + prand(i * 13 + 4) * (H / 2 - 50) + Math.sin(t + i * 2) * 8;
    g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.5 + i * 2.2);
    g.fillStyle = "#fff2c0";
    g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Deep Forge — riveted iron plates, mine rails, an embossed master
// gear, molten runoff channel. Livelies: meshed corner gears turning,
// anvil spark bursts, flowing molten channel, quench steam.
// ---------------------------------------------------------------------------

const ANVIL_POS: [number, number] = [402, 150];
const QUENCH_POS: [number, number] = [84, 596];

function buildDeepForge(g: Ctx): void {
  vgrad(g, "#26221f", "#2d2825", "#211d1a");

  // Riveted iron floor plates.
  const T = 96;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const r = prand(tx * 19 + ty * 37);
      g.fillStyle = `rgba(${r > 0.5 ? "120,110,100" : "10,8,6"},${0.07 + r * 0.07})`;
      const x = tx * T + (ty % 2 ? T / 2 : 0) - T / 2;
      g.fillRect(x, ty * T, T, T);
      g.fillStyle = "#4a443e";
      for (const [ox, oy] of [[8, 8], [T - 8, 8], [8, T - 8], [T - 8, T - 8]]) {
        g.beginPath(); g.arc(x + ox, ty * T + oy, 2.5, 0, Math.PI * 2); g.fill();
      }
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = 2;
  for (let y = 0; y <= H; y += T) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  // Mine-cart rails running up the left side.
  g.strokeStyle = "#57504a";
  g.lineWidth = 4;
  for (const rx of [30, 58]) {
    g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx, H); g.stroke();
  }
  g.lineWidth = 3;
  for (let y = 16; y < H; y += 36) {
    g.strokeStyle = "#3d3833";
    g.beginPath(); g.moveTo(22, y); g.lineTo(66, y); g.stroke();
  }

  // Embossed master gear at center.
  g.save();
  g.translate(W / 2, H / 2);
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.fillStyle = "rgba(150,135,110,0.14)";
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 86, 0, Math.PI * 2); g.fill(); g.stroke();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillRect(-9, -102, 18, 18);
    g.strokeRect(-9, -102, 18, 18);
    g.restore();
  }
  g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath(); g.arc(Math.cos(a) * 37, Math.sin(a) * 37, 5, 0, Math.PI * 2); g.stroke();
  }
  g.restore();

  // Molten runoff channel down the right edge.
  g.fillStyle = "#141110";
  g.fillRect(W - 40, 0, 26, H);
  g.save();
  g.shadowColor = "#ff6b35";
  g.shadowBlur = 14;
  g.fillStyle = "#e8512a";
  g.fillRect(W - 36, 0, 18, H);
  g.restore();

  // The anvil.
  const [ax, ay] = ANVIL_POS;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(ax, ay + 20, 34, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#3b3b42";
  g.fillRect(ax - 12, ay, 24, 16);
  g.fillStyle = "#52525c";
  g.beginPath();
  g.moveTo(ax - 30, ay - 6); g.lineTo(ax + 20, ay - 6); g.quadraticCurveTo(ax + 38, ay - 6, ax + 34, ay - 16);
  g.lineTo(ax + 20, ay - 14); g.lineTo(ax - 30, ay - 14);
  g.closePath(); g.fill();
  g.fillStyle = "#6a6a76";
  g.fillRect(ax - 30, ay - 14, 50, 3);

  // The quench barrel.
  const [qx, qy] = QUENCH_POS;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(qx, qy + 14, 26, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#4e3b28";
  g.fillRect(qx - 20, qy - 18, 40, 32);
  g.strokeStyle = "#332718";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(qx - 20, qy - 6); g.lineTo(qx + 20, qy - 6); g.stroke();
  g.fillStyle = "#1a2a33";
  g.beginPath(); g.ellipse(qx, qy - 18, 20, 6, 0, 0, Math.PI * 2); g.fill();

  speckle(g, 0.02, 0.06);
  vignette(g, "rgba(8,4,2,1)", 0.55);
}

function accentsDeepForge(g: Ctx, t: number): void {
  g.save();
  // Two meshed gears turning in the top-left corner.
  const gear = (cx: number, cy: number, r: number, teeth: number, angle: number, tone: string) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.fillStyle = tone;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      g.save(); g.rotate(a); g.fillRect(-r * 0.14, -r - r * 0.22, r * 0.28, r * 0.24); g.restore();
    }
    g.fillStyle = "#211d1a";
    g.beginPath(); g.arc(0, 0, r * 0.3, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  gear(120, 56, 26, 10, t * 0.5, "#5d564e");
  gear(170, 76, 17, 8, -t * 0.5 * (26 / 17) + 0.25, "#6b635a");

  // Molten channel flow: bright blobs streaming downward.
  g.save();
  g.beginPath(); g.rect(W - 36, 0, 18, H); g.clip();
  g.shadowColor = "#ffd23a";
  g.shadowBlur = 8;
  for (let i = 0; i < 12; i++) {
    const y = ((prand(i * 5) * H + t * (60 + prand(i) * 40)) % (H + 30)) - 15;
    g.fillStyle = `rgba(255,${170 + Math.floor(prand(i) * 60)},60,0.8)`;
    g.beginPath(); g.ellipse(W - 27 + (prand(i * 3) - 0.5) * 8, y, 4, 9, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // Anvil spark burst on a work rhythm (three strikes, pause).
  const cycleT = t % 4;
  const strike = cycleT < 1.8 ? cycleT % 0.6 : -1;
  if (strike >= 0 && strike < 0.35) {
    const f = strike / 0.35;
    const [ax, ay] = ANVIL_POS;
    g.shadowColor = "#ffd23a";
    g.shadowBlur = 6;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.15 + prand(i + Math.floor(t / 0.6)) * 0.7);
      const v = 40 + prand(i * 3) * 60;
      const x = ax + Math.cos(a) * v * f;
      const y = ay - 12 + Math.sin(a) * v * f + 60 * f * f;
      g.globalAlpha = 1 - f;
      g.fillStyle = "#ffe9a0";
      g.fillRect(x, y, 2.2, 2.2);
    }
    g.globalAlpha = 1;
  }

  // Steam curling off the quench barrel.
  const [qx, qy] = QUENCH_POS;
  for (let i = 0; i < 4; i++) {
    const life = (t * 0.35 + i * 0.25) % 1;
    const x = qx + Math.sin(t * 1.5 + i * 2) * 8 * life;
    const y = qy - 22 - life * 60;
    g.globalAlpha = (1 - life) * 0.18;
    g.fillStyle = "#cfd8dc";
    g.beginPath(); g.arc(x, y, 6 + life * 12, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Frostveil Citadel — cracked blue ice with warriors frozen beneath it.
// Livelies: two-layer snowfall, shimmering aurora ribbons, ice glints.
// (Held for a possible future dungeon; in the Arena rotation meanwhile.)
// ---------------------------------------------------------------------------

function buildFrostveil(g: Ctx): void {
  vgrad(g, "#5f8299", "#7899ad", "#54788f");

  // Sheet-ice sheen.
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(220,240,255,${0.05 + prand(i) * 0.06})`;
    g.beginPath();
    g.ellipse(prand(i * 3) * W, prand(i * 3 + 1) * H, 60 + prand(i + 5) * 70, 30 + prand(i + 8) * 40, prand(i) * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Figures frozen under the ice — dark blurred silhouettes.
  for (const [fx, fy, rot] of [[150, 260, 0.4], [340, 480, -0.6], [230, 620, 1.2]]) {
    g.save();
    g.translate(fx, fy);
    g.rotate(rot);
    g.fillStyle = "rgba(20,32,48,0.35)";
    g.beginPath(); g.ellipse(0, -14, 8, 9, 0, 0, Math.PI * 2); g.fill();      // head
    g.beginPath(); g.ellipse(0, 6, 11, 16, 0, 0, Math.PI * 2); g.fill();      // torso
    g.beginPath(); g.ellipse(-13, 2, 4, 12, 0.5, 0, Math.PI * 2); g.fill();   // arm
    g.beginPath(); g.ellipse(12, 0, 4, 13, -0.4, 0, Math.PI * 2); g.fill();
    // a sword frozen beside them
    g.strokeStyle = "rgba(25,40,55,0.4)";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(22, -18); g.lineTo(28, 20); g.stroke();
    g.restore();
    // frosted glaze over each figure
    g.fillStyle = "rgba(210,235,255,0.12)";
    g.beginPath(); g.ellipse(fx, fy, 34, 30, 0, 0, Math.PI * 2); g.fill();
  }

  // Deep fissures forking through the ice.
  g.strokeStyle = "rgba(230,246,255,0.65)";
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    let x = prand(i + 20) * W;
    let y = prand(i + 25) * H;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (prand(i * 6 + s) - 0.5) * 70;
      y += (prand(i * 6 + s + 3) - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = "rgba(30,60,90,0.35)";
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = "rgba(230,246,255,0.65)";
    g.lineWidth = 2;
  }

  // Snow drifts along the edges + ice spike clusters in the corners.
  g.fillStyle = "rgba(240,248,255,0.75)";
  for (const [dx, dy, dr] of [[0, 40, 60], [W, 200, 46], [10, 690, 66], [W - 6, 660, 52], [W / 2, 0, 44]]) {
    g.beginPath(); g.ellipse(dx, dy, dr, dr * 0.4, 0, 0, Math.PI * 2); g.fill();
  }
  for (const [cx, cy, dir] of [[40, 110, 1], [440, 96, -1], [44, 620, 1], [436, 640, -1]]) {
    for (let i = 0; i < 3; i++) {
      const bx = cx + dir * i * 16;
      const hgt = 42 - i * 10;
      g.fillStyle = "#bfe0f2";
      g.beginPath();
      g.moveTo(bx - 9, cy + 12); g.lineTo(bx, cy + 12 - hgt); g.lineTo(bx + 9, cy + 12);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.beginPath();
      g.moveTo(bx - 3, cy + 8); g.lineTo(bx, cy + 14 - hgt); g.lineTo(bx + 2, cy + 8);
      g.closePath(); g.fill();
    }
  }

  speckle(g, 0.05, 0.02);
  vignette(g, "rgba(10,25,45,1)", 0.45);
}

function accentsFrostveil(g: Ctx, t: number): void {
  g.save();
  // Aurora ribbons rippling across the upper field.
  for (let band = 0; band < 2; band++) {
    const baseY = 70 + band * 60;
    g.globalAlpha = 0.10 + 0.05 * Math.sin(t * 0.6 + band * 2);
    const hue = band === 0 ? "140,255,190" : "150,170,255";
    for (let x = 0; x <= W; x += 16) {
      const y = baseY + Math.sin(x * 0.02 + t * 0.8 + band * 3) * 22;
      const hgt = 34 + Math.sin(x * 0.013 - t * 0.5 + band) * 14;
      g.fillStyle = `rgba(${hue},0.5)`;
      g.fillRect(x, y - hgt / 2, 16, hgt);
    }
  }
  g.globalAlpha = 1;
  // Two-layer snowfall.
  for (let i = 0; i < 26; i++) {
    const far = i < 14;
    const speed = far ? 14 : 30;
    const x = prand(i * 5) * W + Math.sin(t * (far ? 0.6 : 1) + i * 1.8) * (far ? 8 : 18);
    const y = ((prand(i * 5 + 2) * H + t * speed) % (H + 12)) - 6;
    g.globalAlpha = far ? 0.35 : 0.7;
    g.fillStyle = "#f4faff";
    g.beginPath(); g.arc(x, y, far ? 1.2 : 2.1, 0, Math.PI * 2); g.fill();
  }
  // Hard glints off the ice.
  for (let i = 0; i < 6; i++) {
    const a = Math.max(0, Math.sin(t * (1.2 + prand(i)) + i * 3.7)) ** 4;
    if (a > 0.05) {
      const x = prand(i * 17) * W, y = prand(i * 17 + 5) * H;
      g.globalAlpha = a * 0.85;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.4;
      const s = 3 + a * 4;
      g.beginPath();
      g.moveTo(x - s, y); g.lineTo(x + s, y);
      g.moveTo(x, y - s); g.lineTo(x, y + s);
      g.stroke();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Witchlight Mire — dead-tree bog with ritual stones. Livelies:
// roaming will-o-wisps, drifting fog, popping mud bubbles.
// (Held for a possible future dungeon; in the Arena rotation meanwhile.)
// ---------------------------------------------------------------------------

const MIRE_POOLS: Array<[number, number, number]> = [
  [120, 240, 46], [360, 420, 54], [180, 600, 40],
];

function buildMire(g: Ctx): void {
  vgrad(g, "#22301f", "#2b3a26", "#1c2820");
  speckle(g, 0.02, 0.06);

  // Murky pools with reed clusters.
  for (const [px, py, pr] of MIRE_POOLS) {
    g.fillStyle = "#101c14";
    g.beginPath(); g.ellipse(px, py, pr, pr * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(140,190,150,0.14)";
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(px, py, pr * 0.78, pr * 0.38, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#3d4a2c";
    g.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      const rx = px + (prand(i * 3 + px) - 0.5) * pr * 1.7;
      const ry = py + pr * 0.36;
      g.beginPath();
      g.moveTo(rx, ry);
      g.quadraticCurveTo(rx + 3, ry - 16, rx + (prand(i + px) - 0.5) * 8, ry - 26 - prand(i * 5) * 10);
      g.stroke();
    }
  }

  // Dead trees looming at the edges, moss dangling.
  for (const [tx, ty, dir] of [[36, 130, 1], [446, 240, -1], [40, 520, 1], [442, 600, -1]]) {
    g.strokeStyle = "#26201a";
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(tx, ty + 60);
    g.quadraticCurveTo(tx + dir * 6, ty, tx + dir * 14, ty - 50);
    g.stroke();
    g.lineWidth = 4;
    for (const [ba, bl] of [[-0.7, 40], [0.3, 34], [-0.2, 46]]) {
      g.beginPath();
      g.moveTo(tx + dir * 8, ty - 20 + ba * 30);
      g.quadraticCurveTo(
        tx + dir * (24 + bl * 0.4), ty - 30 + ba * 40,
        tx + dir * (14 + bl), ty - 44 + ba * 52
      );
      g.stroke();
    }
    // hanging moss
    g.strokeStyle = "rgba(90,120,70,0.5)";
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const mx = tx + dir * (16 + i * 12);
      const my = ty - 40 + prand(i + tx) * 20;
      g.beginPath();
      g.moveTo(mx, my);
      g.quadraticCurveTo(mx + 2, my + 12, mx - 1, my + 20 + prand(i * 7 + tx) * 8);
      g.stroke();
    }
  }

  // A half-sunken ritual stone circle.
  g.save();
  g.translate(W / 2, H / 2 + 10);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sx = Math.cos(a) * 74, sy = Math.sin(a) * 42;
    const sunk = prand(i * 9) * 8;
    g.fillStyle = "#41443c";
    g.beginPath();
    g.moveTo(sx - 8, sy + 6);
    g.lineTo(sx - 6, sy - 16 + sunk);
    g.quadraticCurveTo(sx, sy - 22 + sunk, sx + 6, sy - 15 + sunk);
    g.lineTo(sx + 8, sy + 6);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(90,140,90,0.3)";
    g.beginPath(); g.ellipse(sx, sy - 12 + sunk, 5, 3, 0, 0, Math.PI * 2); g.fill();
  }
  // carved eye on the tallest stone
  g.strokeStyle = "rgba(150,200,160,0.4)";
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(74, -4, 4.5, 2.5, 0, 0, Math.PI * 2); g.stroke();
  g.restore();

  boneProp(g, 280, 180, 0.9);
  vignette(g, "rgba(4,8,4,1)", 0.6);
}

function accentsMire(g: Ctx, t: number): void {
  g.save();
  // Will-o-wisps tracing slow figure-eights.
  for (let i = 0; i < 3; i++) {
    const cx = 120 + i * 120, cy = 220 + i * 150;
    const x = cx + Math.sin(t * 0.5 + i * 2.1) * 60;
    const y = cy + Math.sin(t * 1.0 + i * 2.1) * 26;
    const breathe = 0.6 + 0.4 * Math.sin(t * 2.2 + i * 1.5);
    g.shadowColor = "#7de8c8";
    g.shadowBlur = 14 + breathe * 8;
    g.globalAlpha = 0.5 + breathe * 0.4;
    g.fillStyle = "#a8f8dc";
    g.beginPath(); g.arc(x, y, 3 + breathe * 1.6, 0, Math.PI * 2); g.fill();
    // faint trailing motes
    for (let s = 1; s <= 3; s++) {
      const tx2 = cx + Math.sin((t - s * 0.12) * 0.5 + i * 2.1) * 60;
      const ty2 = cy + Math.sin((t - s * 0.12) * 1.0 + i * 2.1) * 26;
      g.globalAlpha = (0.4 - s * 0.11) * breathe;
      g.beginPath(); g.arc(tx2, ty2, 2 - s * 0.4, 0, Math.PI * 2); g.fill();
    }
  }
  g.shadowBlur = 0;
  // Mud bubbles: swell then pop into a ripple ring.
  for (let i = 0; i < MIRE_POOLS.length; i++) {
    const [px, py, pr] = MIRE_POOLS[i];
    const cyc = (t * 0.5 + i * 0.37) % 1;
    const bx = px + (prand(i * 31 + Math.floor(t * 0.5)) - 0.5) * pr;
    if (cyc < 0.7) {
      const swell = cyc / 0.7;
      g.globalAlpha = 0.6;
      g.fillStyle = "#2c3823";
      g.beginPath(); g.arc(bx, py, 2 + swell * 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(170,200,160,0.25)";
      g.lineWidth = 1;
      g.beginPath(); g.arc(bx, py, 2 + swell * 4, 0, Math.PI * 2); g.stroke();
    } else {
      const pop = (cyc - 0.7) / 0.3;
      g.globalAlpha = (1 - pop) * 0.4;
      g.strokeStyle = "#9ab890";
      g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(bx, py, 6 + pop * 10, (6 + pop * 10) * 0.4, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  // Fog banks sliding through.
  for (let i = 0; i < 5; i++) {
    const x = ((prand(i * 13) * W + t * (6 + i * 2)) % (W + 280)) - 140;
    const y = 120 + prand(i * 13 + 5) * 500;
    g.globalAlpha = 0.06 + 0.03 * Math.sin(t * 0.4 + i * 2);
    g.fillStyle = "#aebfa8";
    g.beginPath(); g.ellipse(x, y, 130, 30, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Feywild Court — twilight fairy ring beneath giant mushrooms.
// Livelies: darting fairy lights, falling petals, breathing cap-glow.
// (Held for a possible future dungeon; in the Arena rotation meanwhile.)
// ---------------------------------------------------------------------------

const FEY_CAPS: Array<[number, number, number, string, string]> = [
  [66, 170, 1.2, "#d46a9e", "#f0a8c8"],   // pink
  [430, 250, 1.0, "#3fae9c", "#8ee0d0"],  // teal
  [80, 560, 0.9, "#b06ad4", "#dcaef0"],   // violet
  [420, 600, 1.25, "#d46a9e", "#f0a8c8"],
];

function buildFeyCourt(g: Ctx): void {
  vgrad(g, "#2c2340", "#3a3050", "#252038");

  // Pastel meadow patches.
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(${120 + prand(i) * 60},${180 + prand(i + 2) * 40},${140 + prand(i + 4) * 60},${0.06 + prand(i) * 0.05})`;
    g.beginPath();
    g.ellipse(prand(i * 3) * W, prand(i * 3 + 1) * H, 40 + prand(i + 5) * 55, 22 + prand(i + 8) * 30, prand(i) * 3, 0, Math.PI * 2);
    g.fill();
  }

  // The fairy ring — a circle of tiny white toadstools.
  g.save();
  g.translate(W / 2, H / 2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const mx = Math.cos(a) * 92, my = Math.sin(a) * 70;
    g.fillStyle = "#e8e2d4";
    g.fillRect(mx - 1.5, my - 3, 3, 6);
    g.fillStyle = "#f4f0e6";
    g.beginPath(); g.ellipse(mx, my - 4, 6, 4, 0, Math.PI, 0); g.fill();
    g.fillStyle = "rgba(200,120,150,0.5)";
    g.beginPath(); g.arc(mx - 2, my - 6, 1.1, 0, Math.PI * 2); g.fill();
  }
  // pressed-grass ring inside
  g.strokeStyle = "rgba(190,230,190,0.12)";
  g.lineWidth = 14;
  g.beginPath(); g.ellipse(0, 0, 74, 55, 0, 0, Math.PI * 2); g.stroke();
  g.restore();

  // Giant mushrooms (stems + spotted caps; under-glow animates).
  for (const [mx, my, s, capC, spotC] of FEY_CAPS) {
    g.save();
    g.translate(mx, my);
    g.scale(s, s);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(0, 34, 26, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d8cfc0";
    g.beginPath();
    g.moveTo(-9, 32); g.quadraticCurveTo(-6, 6, -12, -6);
    g.lineTo(12, -6); g.quadraticCurveTo(7, 6, 9, 32);
    g.closePath(); g.fill();
    g.fillStyle = "#b8ac9a";
    g.beginPath(); g.moveTo(2, 32); g.quadraticCurveTo(4, 8, 8, -6); g.lineTo(12, -6); g.quadraticCurveTo(7, 6, 9, 32); g.closePath(); g.fill();
    g.fillStyle = capC;
    g.beginPath(); g.ellipse(0, -12, 34, 20, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.ellipse(0, -11, 34, 7, 0, 0, Math.PI); g.fill();
    g.fillStyle = spotC;
    for (const [ox2, oy2, r2] of [[-18, -18, 4], [2, -26, 5], [20, -16, 3.5], [-4, -14, 2.6]]) {
      g.beginPath(); g.arc(ox2, oy2, r2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // Oversized bellflowers nodding at the edges.
  for (const [fx, fy, c] of [[190, 90, "#8ec8f0"], [300, 660, "#f0c88e"]] as Array<[number, number, string]>) {
    g.strokeStyle = "#5a7a4a";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(fx, fy + 30); g.quadraticCurveTo(fx + 6, fy + 10, fx, fy); g.stroke();
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(fx - 9, fy);
    g.quadraticCurveTo(fx, fy - 8, fx + 9, fy);
    g.lineTo(fx + 6, fy + 12); g.lineTo(fx + 2, fy + 8); g.lineTo(fx - 2, fy + 13); g.lineTo(fx - 6, fy + 8);
    g.closePath(); g.fill();
  }

  speckle(g, 0.03, 0.04);
  vignette(g, "rgba(12,8,24,1)", 0.5);
}

function accentsFeyCourt(g: Ctx, t: number): void {
  g.save();
  // Cap under-glow breathing.
  for (let i = 0; i < FEY_CAPS.length; i++) {
    const [mx, my, s, , spotC] = FEY_CAPS[i];
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 1.9);
    const gr = g.createRadialGradient(mx, my + 6 * s, 4, mx, my + 6 * s, 46 * s);
    gr.addColorStop(0, `rgba(255,220,250,${0.10 + breathe * 0.10})`);
    gr.addColorStop(1, "rgba(255,220,250,0)");
    g.fillStyle = gr;
    g.fillRect(mx - 50 * s, my - 40 * s, 100 * s, 100 * s);
    g.globalAlpha = 0.3 + breathe * 0.3;
    g.fillStyle = spotC;
    g.beginPath(); g.ellipse(mx, my - 11 * s, 30 * s, 5 * s, 0, 0, Math.PI); g.fill();
    g.globalAlpha = 1;
  }
  // Fairy lights darting on looping paths.
  const cols = ["#ff9ed2", "#8ee0d0", "#ffd98e", "#c8a8ff", "#a8ffb8", "#8ec8ff"];
  for (let i = 0; i < 6; i++) {
    const cx = 90 + prand(i * 5) * 300;
    const cy = 120 + prand(i * 5 + 2) * 480;
    const x = cx + Math.sin(t * (0.9 + prand(i) * 0.8) + i * 2.3) * 46;
    const y = cy + Math.sin(t * (1.3 + prand(i + 3) * 0.6) + i * 1.1) * 30;
    const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 2.7);
    g.shadowColor = cols[i];
    g.shadowBlur = 10 + tw * 6;
    g.globalAlpha = 0.6 + tw * 0.4;
    g.fillStyle = cols[i];
    g.beginPath(); g.arc(x, y, 1.8 + tw, 0, Math.PI * 2); g.fill();
    // wing shimmer
    g.globalAlpha = tw * 0.4;
    g.fillStyle = "#ffffff";
    g.beginPath(); g.ellipse(x - 3, y - 1, 2.4, 1, 0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + 3, y - 1, 2.4, 1, -0.6, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  // Petals fluttering down.
  for (let i = 0; i < 10; i++) {
    const speed = 12 + prand(i) * 10;
    const x = prand(i * 7) * W + Math.sin(t * 1.4 + i * 2.2) * 26;
    const y = ((prand(i * 7 + 3) * H + t * speed) % (H + 14)) - 7;
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 2 + i) * 1.2);
    g.globalAlpha = 0.55;
    g.fillStyle = i % 2 ? "#f0a8c8" : "#dcaef0";
    g.beginPath(); g.ellipse(0, 0, 3.4, 1.8, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Shadow Pit — a black-stone fighting pit ringed with stakes.
// Livelies: crimson braziers, a swinging chain, eyes blinking open in
// the dark. (Held for a possible future dungeon; in the rotation meanwhile.)
// ---------------------------------------------------------------------------

const PIT_BRAZIERS: Array<[number, number]> = [[30, 360], [450, 360]];
const PIT_EYES: Array<[number, number]> = [[60, 60], [420, 100], [50, 680], [430, 660], [240, 30]];

function buildShadowPit(g: Ctx): void {
  vgrad(g, "#191419", "#221c22", "#141014");

  // Rough black flagstones.
  const T = 68;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const r = prand(tx * 29 + ty * 17);
      g.fillStyle = `rgba(${r > 0.5 ? "120,95,110" : "0,0,0"},${0.07 + r * 0.07})`;
      g.fillRect(tx * T + (ty % 2 ? T / 2 : 0) - T / 2, ty * T, T, T);
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = 2;
  for (let y = 0; y <= H; y += T) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  // Packed-sand fighting oval.
  g.fillStyle = "rgba(120,95,60,0.18)";
  g.beginPath(); g.ellipse(W / 2, H / 2, 170, 250, 0, 0, Math.PI * 2); g.fill();

  // Old blood, scrubbed but not gone.
  for (const [sx, sy, ss] of [[210, 300, 1], [290, 470, 1.4], [180, 520, 0.8]]) {
    g.fillStyle = "rgba(90,16,20,0.4)";
    g.beginPath(); g.ellipse(sx, sy, 18 * ss, 10 * ss, prand(sx) * 3, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(sx + (prand(i * 3 + sx) - 0.5) * 50 * ss, sy + (prand(i * 3 + sy) - 0.5) * 30 * ss, 2 + prand(i) * 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Stake palisade ringing the pit.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const sx = W / 2 + Math.cos(a) * 226;
    const sy = H / 2 + Math.sin(a) * 342;
    if (sx < -6 || sx > W + 6 || sy < -6 || sy > H + 6) continue;
    const lean = (prand(i) - 0.5) * 0.35;
    g.save();
    g.translate(sx, sy);
    g.rotate(Math.atan2(sy - H / 2, sx - W / 2) + Math.PI / 2 + lean);
    g.fillStyle = "#241d18";
    g.beginPath();
    g.moveTo(-5, 16); g.lineTo(-4, -18); g.lineTo(0, -30); g.lineTo(4, -18); g.lineTo(5, 16);
    g.closePath(); g.fill();
    g.fillStyle = "#453830";
    g.beginPath(); g.moveTo(0, -30); g.lineTo(4, -18); g.lineTo(1, -16); g.closePath(); g.fill();
    g.restore();
  }

  // Skull pile in one corner.
  g.fillStyle = "#9a9385";
  for (const [kx, ky, kr] of [[76, 636, 8], [92, 642, 7], [84, 626, 6.5], [104, 632, 6]]) {
    g.beginPath(); g.arc(kx, ky, kr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#141014";
    g.beginPath(); g.arc(kx - kr * 0.35, ky - kr * 0.15, kr * 0.22, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(kx + kr * 0.35, ky - kr * 0.15, kr * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#9a9385";
  }

  // Brazier bowls (flames animate).
  for (const [bx, by] of PIT_BRAZIERS) {
    g.fillStyle = "#2c2c33";
    g.beginPath(); g.ellipse(bx, by, 16, 6, 0, 0, Math.PI); g.fill();
    g.fillRect(bx - 3, by, 6, 18);
    g.beginPath(); g.ellipse(bx, by + 18, 10, 3.5, 0, 0, Math.PI * 2); g.fill();
  }

  speckle(g, 0.015, 0.07);
  vignette(g, "rgba(0,0,0,1)", 0.72);
}

function accentsShadowPit(g: Ctx, t: number): void {
  g.save();
  // Crimson brazier flames + pooled glow.
  for (let i = 0; i < PIT_BRAZIERS.length; i++) {
    const [bx, by] = PIT_BRAZIERS[i];
    const flick = 0.7 + 0.3 * Math.sin(t * 8.4 + i * 2.9) * Math.sin(t * 5.1 + i);
    const gr = g.createRadialGradient(bx, by, 4, bx, by, 110);
    gr.addColorStop(0, `rgba(255,60,50,${0.12 * flick})`);
    gr.addColorStop(1, "rgba(255,60,50,0)");
    g.fillStyle = gr;
    g.fillRect(bx - 110, by - 110, 220, 220);
    g.shadowColor = "#ff4838";
    g.shadowBlur = 14;
    g.fillStyle = "#e83a2a";
    g.beginPath();
    g.ellipse(bx, by - 12, 5 * flick + 2, 10 * flick + 4, Math.sin(t * 6.4 + i) * 0.22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff9b6a";
    g.beginPath();
    g.ellipse(bx, by - 9, 2.4 * flick + 1, 5 * flick + 2, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  // A hooked chain swaying overhead.
  const sway = Math.sin(t * 0.8) * 0.35;
  g.save();
  g.translate(W / 2 + 90, 0);
  g.rotate(sway);
  g.fillStyle = "#3d3d46";
  for (let i = 0; i < 9; i++) {
    g.beginPath(); g.ellipse(0, 10 + i * 13, 4, 6.5, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "#4c4c56";
  g.lineWidth = 4;
  g.beginPath(); g.arc(6, 128, 9, Math.PI * 0.7, Math.PI * 1.9); g.stroke();
  g.restore();
  // Eyes blinking open in the darkness beyond the stakes.
  for (let i = 0; i < PIT_EYES.length; i++) {
    const [ex, ey] = PIT_EYES[i];
    const cyc = (t * 0.14 + prand(i * 9)) % 1;
    let a = 0;
    if (cyc > 0.55 && cyc < 0.95) {
      a = Math.min(1, (cyc - 0.55) / 0.08) * Math.min(1, (0.95 - cyc) / 0.08);
      // blink shut for an instant mid-stare
      const blink = (t * 1.7 + i) % 2.3;
      if (blink < 0.12) a *= blink / 0.12;
    }
    if (a > 0.02) {
      g.shadowColor = "#ff3830";
      g.shadowBlur = 6;
      g.globalAlpha = a * 0.9;
      g.fillStyle = "#ff5040";
      g.beginPath(); g.ellipse(ex - 5, ey, 2.6, 1.6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(ex + 5, ey, 2.6, 1.6, 0, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Crystal Hollow — an amethyst geode cave. Livelies: crystals pulsing
// in sequence, drifting sparkle motes, dripwater rippling the pool.
// (Held for a possible future dungeon; in the Arena rotation meanwhile.)
// ---------------------------------------------------------------------------

const HOLLOW_CRYSTALS: Array<[number, number, number, number]> = [
  // x, y, scale, phase
  [56, 130, 1.15, 0], [420, 100, 0.9, 1], [446, 380, 1.05, 2],
  [60, 470, 0.85, 3], [110, 660, 1.2, 4], [400, 630, 1.0, 5], [250, 60, 0.75, 6],
];
const HOLLOW_POOL: [number, number, number] = [310, 500, 60];

function buildHollow(g: Ctx): void {
  vgrad(g, "#241a33", "#2d2140", "#1c142a");

  // Cave-floor mottling.
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(${140 + prand(i) * 40},${100 + prand(i + 2) * 40},${190 + prand(i + 4) * 40},${0.04 + prand(i) * 0.04})`;
    g.beginPath();
    g.ellipse(prand(i * 3) * W, prand(i * 3 + 1) * H, 45 + prand(i + 5) * 60, 26 + prand(i + 8) * 34, prand(i) * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Stalagmite silhouettes crowding the top and bottom.
  g.fillStyle = "rgba(16,10,26,0.85)";
  for (let i = 0; i < 9; i++) {
    const x = i * 58 + (prand(i) - 0.5) * 20;
    for (const [yBase, dir] of [[0, 1], [H, -1]] as Array<[number, number]>) {
      const hgt = 24 + prand(i * 3 + yBase) * 34;
      g.beginPath();
      g.moveTo(x - 14, yBase);
      g.lineTo(x, yBase + dir * hgt);
      g.lineTo(x + 14, yBase);
      g.closePath(); g.fill();
    }
  }

  // The still pool (ripples animate).
  const [plx, ply, plr] = HOLLOW_POOL;
  g.fillStyle = "#141024";
  g.beginPath(); g.ellipse(plx, ply, plr, plr * 0.45, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(190,160,255,0.25)";
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(plx, ply, plr * 0.85, plr * 0.38, 0, 0, Math.PI * 2); g.stroke();
  // reflected crystal shard in the water
  g.fillStyle = "rgba(170,130,240,0.16)";
  g.beginPath(); g.moveTo(plx - 8, ply); g.lineTo(plx - 2, ply - 12); g.lineTo(plx + 5, ply); g.closePath(); g.fill();

  // Amethyst clusters (glow animates in accents).
  for (const [cx, cy, s] of HOLLOW_CRYSTALS.map((c) => [c[0], c[1], c[2]] as [number, number, number])) {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath(); g.ellipse(0, 16, 26, 8, 0, 0, Math.PI * 2); g.fill();
    for (const [ox, tilt, hgt, wdt] of [[-12, -0.35, 30, 8], [10, 0.3, 26, 7], [0, -0.05, 44, 10], [18, 0.5, 18, 6]]) {
      g.save();
      g.translate(ox, 12);
      g.rotate(tilt);
      g.fillStyle = "#6d4fae";
      g.beginPath();
      g.moveTo(-wdt, 0); g.lineTo(-wdt * 0.6, -hgt); g.lineTo(0, -hgt - 8); g.lineTo(wdt * 0.6, -hgt); g.lineTo(wdt, 0);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(220,195,255,0.5)";
      g.beginPath();
      g.moveTo(-wdt * 0.5, 0); g.lineTo(-wdt * 0.25, -hgt * 0.9); g.lineTo(0, -hgt - 6); g.lineTo(0, 0);
      g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
  }

  // Scattered shards.
  g.fillStyle = "#8a68cc";
  for (let i = 0; i < 8; i++) {
    const x = 100 + prand(i * 9) * 280, y = 180 + prand(i * 9 + 4) * 380;
    g.save();
    g.translate(x, y);
    g.rotate(prand(i) * 3);
    g.beginPath(); g.moveTo(-4, 2); g.lineTo(0, -5); g.lineTo(4, 2); g.closePath(); g.fill();
    g.restore();
  }

  speckle(g, 0.02, 0.05);
  vignette(g, "rgba(6,2,14,1)", 0.6);
}

function accentsHollow(g: Ctx, t: number): void {
  g.save();
  // Crystals pulse in a slow traveling sequence.
  for (const [cx, cy, s, phase] of HOLLOW_CRYSTALS) {
    const pulse = Math.max(0, Math.sin(t * 1.3 - phase * 0.85)) ** 2;
    const gr = g.createRadialGradient(cx, cy, 4, cx, cy, 56 * s);
    gr.addColorStop(0, `rgba(178,139,255,${0.06 + pulse * 0.16})`);
    gr.addColorStop(1, "rgba(178,139,255,0)");
    g.fillStyle = gr;
    g.fillRect(cx - 56 * s, cy - 56 * s, 112 * s, 112 * s);
    g.globalAlpha = 0.25 + pulse * 0.55;
    g.shadowColor = "#b28bff";
    g.shadowBlur = 10 + pulse * 8;
    g.fillStyle = "#dcc8ff";
    g.beginPath(); g.moveTo(cx - 3 * s, cy + 6 * s); g.lineTo(cx, cy - (34 + pulse * 4) * s); g.lineTo(cx + 3 * s, cy + 6 * s); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
  // Sparkle motes drifting like dust in torchless dark.
  for (let i = 0; i < 14; i++) {
    const x = prand(i * 7) * W + Math.sin(t * 0.5 + i * 2.6) * 18;
    const y = ((prand(i * 7 + 3) * H + t * (4 + prand(i) * 5)) % (H + 10)) - 5;
    const tw = Math.max(0, Math.sin(t * (1.4 + prand(i) * 1.2) + i * 2.9)) ** 3;
    g.globalAlpha = tw * 0.7;
    g.fillStyle = "#e8dcff";
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillRect(-1.2, -1.2, 2.4, 2.4);
    g.restore();
  }
  // Dripwater: a falling drop, then rings spreading across the pool.
  const [plx, ply, plr] = HOLLOW_POOL;
  const cyc = (t % 3.2) / 3.2;
  const dropX = plx - plr * 0.3;
  if (cyc < 0.18) {
    const f = cyc / 0.18;
    g.globalAlpha = 0.7;
    g.strokeStyle = "#cfe0ff";
    g.lineWidth = 1.4;
    const dy = ply - 90 + f * 88;
    g.beginPath(); g.moveTo(dropX, dy - 5); g.lineTo(dropX, dy); g.stroke();
  } else if (cyc < 0.75) {
    const f = (cyc - 0.18) / 0.57;
    for (let ring = 0; ring < 2; ring++) {
      const rf = Math.max(0, f - ring * 0.22);
      if (rf <= 0) continue;
      g.globalAlpha = (1 - rf) * 0.5;
      g.strokeStyle = "#cfe0ff";
      g.lineWidth = 1.3;
      g.beginPath();
      g.ellipse(dropX, ply, rf * plr * 0.9, rf * plr * 0.38, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// The Fallen Cathedral — the Seraph's dungeon (see data/dungeons). A desecrated
// nave: cracked marble, a shattered rose window bleeding one great light shaft
// across the field, a toppled altar, and guttering votive candles (animated).
// ---------------------------------------------------------------------------

/** Votive candle clusters (flames animate in accents). */
const CATHEDRAL_CANDLES: Array<[number, number]> = [
  [64, 180], [78, 196], [402, 240], [388, 226],
  [70, 560], [410, 540], [396, 556], [232, 92],
];

function buildFallenCathedral(g: Ctx): void {
  vgrad(g, "#26222c", "#2b2531", "#1c1922");

  // Cracked marble checker — alternating pale/dark tiles, worn through.
  const T = 60;
  for (let ty = 0; ty < H / T; ty++) {
    for (let tx = 0; tx <= W / T; tx++) {
      const r = prand(tx * 31 + ty * 13);
      const pale = (tx + ty) % 2 === 0;
      g.fillStyle = pale
        ? `rgba(196,188,176,${0.1 + r * 0.06})`
        : `rgba(20,16,26,${0.12 + r * 0.06})`;
      g.fillRect(tx * T, ty * T, T, T);
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1.5;
  for (let y = 0; y <= H; y += T) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = 0; x <= W; x += T) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }

  // Long nave runner, wine-red and threadbare.
  g.fillStyle = "rgba(88,22,34,0.5)";
  g.fillRect(W / 2 - 46, 0, 92, H);
  g.fillStyle = "rgba(140,44,56,0.25)";
  g.fillRect(W / 2 - 38, 0, 76, H);
  // Moth-holes worn through the runner.
  for (let i = 0; i < 14; i++) {
    const hx = W / 2 - 36 + prand(i * 7) * 72;
    const hy = prand(i * 11 + 3) * H;
    g.fillStyle = "rgba(20,16,26,0.5)";
    g.beginPath(); g.ellipse(hx, hy, 3 + prand(i) * 6, 2 + prand(i + 1) * 4, prand(i) * 3, 0, Math.PI * 2); g.fill();
  }

  // The shattered rose window (top wall, enemy side) — a broken wheel of
  // stained glass, several petals gone dark.
  const rx = W / 2, ry = 34, rr = 58;
  g.save();
  g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.clip();
  const petals = 12;
  for (let i = 0; i < petals; i++) {
    const broken = prand(i * 5 + 2) < 0.35;
    g.fillStyle = broken
      ? "rgba(18,14,24,0.9)"
      : ["#7c3aed", "#b91c1c", "#b45309", "#1d4ed8"][i % 4];
    g.globalAlpha = broken ? 0.9 : 0.55;
    g.beginPath();
    g.moveTo(rx, ry);
    g.arc(rx, ry, rr, (i / petals) * Math.PI * 2, ((i + 1) / petals) * Math.PI * 2);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  g.restore();
  // Wheel tracery + hub.
  g.strokeStyle = "rgba(200,188,160,0.6)";
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr); g.stroke();
  }
  g.fillStyle = "rgba(232,176,75,0.8)";
  g.beginPath(); g.arc(rx, ry, 9, 0, Math.PI * 2); g.fill();

  // One great light shaft from the broken window, falling across the nave.
  const shaft = g.createLinearGradient(rx, ry, rx - 120, H * 0.72);
  shaft.addColorStop(0, "rgba(255,226,150,0.22)");
  shaft.addColorStop(1, "rgba(255,226,150,0)");
  g.fillStyle = shaft;
  g.beginPath();
  g.moveTo(rx - 34, ry + 30);
  g.lineTo(rx + 44, ry + 30);
  g.lineTo(rx - 30, H * 0.74);
  g.lineTo(rx - 190, H * 0.7);
  g.closePath(); g.fill();

  // Fallen column drums along the flanks.
  for (const [cx, cy, cr, rot] of [
    [58, 320, 22, 0.4], [86, 352, 18, 0.9], [418, 400, 24, -0.5], [396, 128, 17, -1.0],
  ]) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.fillStyle = "#6b6560";
    g.fillRect(-cr, -cr * 0.55, cr * 2, cr * 1.1);
    g.fillStyle = "#7d7770";
    g.beginPath(); g.ellipse(cr, 0, cr * 0.28, cr * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1.5;
    for (const fx of [-cr * 0.5, 0, cr * 0.5]) {
      g.beginPath(); g.moveTo(fx, -cr * 0.55); g.lineTo(fx, cr * 0.55); g.stroke();
    }
    g.restore();
  }

  // The toppled altar — a great slab pitched off its plinth mid-field, where
  // the light shaft lands.
  g.save();
  g.translate(W / 2 - 66, H * 0.62);
  g.rotate(-0.16);
  g.fillStyle = "#8d8478";
  g.fillRect(-44, -14, 88, 28);
  g.fillStyle = "#a29a8c";
  g.fillRect(-44, -14, 88, 7);
  g.strokeStyle = "rgba(40,30,30,0.5)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-20, -14); g.lineTo(-8, 14); g.stroke(); // crack
  g.restore();
  // Its empty plinth.
  g.fillStyle = "rgba(60,54,64,0.9)";
  g.fillRect(W / 2 - 24, H * 0.585, 48, 18);

  // Scattered votive candles (lit — flames animate in accents).
  for (const [vx, vy] of CATHEDRAL_CANDLES) {
    g.fillStyle = "#d8cfb8";
    g.fillRect(vx - 2.5, vy - 8, 5, 8);
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.beginPath(); g.ellipse(vx, vy + 1, 5, 2, 0, 0, Math.PI * 2); g.fill();
  }

  speckle(g, 0.015, 0.06);
  vignette(g, "rgba(8,4,12,1)", 0.66);
}

function accentsFallenCathedral(g: Ctx, t: number): void {
  g.save();
  // Guttering votive flames + pooled amber glow.
  for (let i = 0; i < CATHEDRAL_CANDLES.length; i++) {
    const [vx, vy] = CATHEDRAL_CANDLES[i];
    const f = 0.75 + Math.sin(t * 9 + i * 2.1) * 0.18 + Math.sin(t * 23 + i * 5.3) * 0.07;
    g.globalAlpha = 0.5 * f;
    const glow = g.createRadialGradient(vx, vy - 10, 0, vx, vy - 10, 22);
    glow.addColorStop(0, "rgba(255,196,90,0.6)");
    glow.addColorStop(1, "rgba(255,196,90,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(vx, vy - 10, 22, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.9 * f;
    g.fillStyle = "#ffd76a";
    g.beginPath();
    g.ellipse(vx, vy - 11, 2, 4 + f * 2, Math.sin(t * 7 + i) * 0.2, 0, Math.PI * 2);
    g.fill();
  }
  // Dust motes drifting down the light shaft.
  g.fillStyle = "#ffe9b8";
  for (let i = 0; i < 16; i++) {
    const p = (t * 0.03 + prand(i * 3)) % 1;
    const mx = W / 2 + 30 - p * 150 + Math.sin(t * 0.8 + i) * 8;
    const my = 64 + p * (H * 0.66);
    g.globalAlpha = 0.28 * Math.sin(p * Math.PI);
    g.beginPath(); g.arc(mx, my, 1.4, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.globalAlpha = 1;
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
  bonefields: {
    id: "bonefields",
    name: "The Bonefields",
    build: buildBonefields,
    accents: accentsBonefields,
    zoneTop: "rgba(200,50,50,0.08)",
    zoneBottom: "rgba(70,140,220,0.08)",
    midline: "rgba(125,255,176,0.28)",
  },
  huntingGrounds: {
    id: "huntingGrounds",
    name: "The Hunting Grounds",
    build: buildHuntingGrounds,
    accents: accentsHuntingGrounds,
    zoneTop: "rgba(180,40,40,0.08)",
    zoneBottom: "rgba(60,140,220,0.08)",
    midline: "rgba(200,150,80,0.35)",
  },
  sealedVault: {
    id: "sealedVault",
    name: "The Sealed Vault",
    build: buildSealedVault,
    accents: accentsSealedVault,
    zoneTop: "rgba(220,60,90,0.08)",
    zoneBottom: "rgba(70,150,255,0.08)",
    midline: "rgba(255,216,115,0.30)",
  },
  overgrowth: {
    id: "overgrowth",
    name: "The Overgrowth",
    build: buildOvergrowth,
    accents: accentsOvergrowth,
    zoneTop: "rgba(200,50,50,0.08)",
    zoneBottom: "rgba(60,140,220,0.08)",
    midline: "rgba(157,255,138,0.30)",
  },
  eclipseSpire: {
    id: "eclipseSpire",
    name: "The Eclipse Spire",
    build: buildEclipseSpire,
    accents: accentsEclipseSpire,
    zoneTop: "rgba(200,80,40,0.09)",
    zoneBottom: "rgba(90,110,255,0.09)",
    midline: "rgba(255,240,200,0.35)",
  },
  deepForge: {
    id: "deepForge",
    name: "The Deep Forge",
    build: buildDeepForge,
    accents: accentsDeepForge,
    zoneTop: "rgba(220,60,60,0.08)",
    zoneBottom: "rgba(60,140,220,0.09)",
    midline: "rgba(255,180,80,0.32)",
  },
  frostveil: {
    id: "frostveil",
    name: "Frostveil Citadel",
    build: buildFrostveil,
    accents: accentsFrostveil,
    zoneTop: "rgba(200,50,50,0.10)",
    zoneBottom: "rgba(60,140,220,0.10)",
    midline: "rgba(220,245,255,0.40)",
  },
  mire: {
    id: "mire",
    name: "The Witchlight Mire",
    build: buildMire,
    accents: accentsMire,
    zoneTop: "rgba(200,50,50,0.08)",
    zoneBottom: "rgba(60,140,220,0.08)",
    midline: "rgba(168,248,220,0.28)",
  },
  feyCourt: {
    id: "feyCourt",
    name: "The Feywild Court",
    build: buildFeyCourt,
    accents: accentsFeyCourt,
    zoneTop: "rgba(220,60,110,0.08)",
    zoneBottom: "rgba(70,150,255,0.08)",
    midline: "rgba(240,168,200,0.32)",
  },
  shadowPit: {
    id: "shadowPit",
    name: "The Shadow Pit",
    build: buildShadowPit,
    accents: accentsShadowPit,
    zoneTop: "rgba(255,50,50,0.08)",
    zoneBottom: "rgba(70,140,220,0.08)",
    midline: "rgba(255,72,56,0.30)",
  },
  hollow: {
    id: "hollow",
    name: "The Crystal Hollow",
    build: buildHollow,
    accents: accentsHollow,
    zoneTop: "rgba(220,60,90,0.08)",
    zoneBottom: "rgba(70,150,255,0.08)",
    midline: "rgba(178,139,255,0.35)",
  },
  fallenCathedral: {
    id: "fallenCathedral",
    name: "The Fallen Cathedral",
    build: buildFallenCathedral,
    accents: accentsFallenCathedral,
    zoneTop: "rgba(220,60,90,0.08)",
    zoneBottom: "rgba(70,150,255,0.08)",
    midline: "rgba(255,215,106,0.30)",
  },
};

/** The themes Arena mode rotates through (Depths pins `dungeon`; PVP keeps
 *  `grassField`). */
const ARENA_ROTATION: ArenaThemeId[] = [
  "colosseum",
  "glade",
  "sanctum",
  "forge",
  "dungeon",
  "bonefields",
  "huntingGrounds",
  "sealedVault",
  "overgrowth",
  "eclipseSpire",
  "deepForge",
  "frostveil",
  "mire",
  "feyCourt",
  "shadowPit",
  "hollow",
  "fallenCathedral",
];

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
