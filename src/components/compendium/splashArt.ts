// ============================================================================
// splashArt — the library's oil-vignette paintings (mockup variant 2,
// auditioned 2026-07-11). One hand-painted canvas scene per book, drawn in
// relative coordinates so the same painting composes on the portrait cover
// and the landscape lore-page plate. Every scene gets the shared painterly
// finish: brush streaks, canvas grain, and a dark vignette. Presentation-only
// (never engine state); randomness is a per-book seeded PRNG so a painting
// is identical every time it's hung.
// ============================================================================

type Ctx = CanvasRenderingContext2D;

/** Tiny mulberry32 — grain/sparks look hand-flicked but never shimmer
 *  between repaints. */
function prng(seedStr: string): () => number {
  let a = 0;
  for (let i = 0; i < seedStr.length; i++) a = (a * 31 + seedStr.charCodeAt(i)) >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- shared painter's toolkit ----------------------------------------------

function sky(g: Ctx, w: number, h: number, top: string, bottom: string): void {
  const s = g.createLinearGradient(0, 0, 0, h);
  s.addColorStop(0, top);
  s.addColorStop(1, bottom);
  g.fillStyle = s;
  g.fillRect(0, 0, w, h);
}

function glow(g: Ctx, x: number, y: number, r: number, color: string): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function finish(g: Ctx, w: number, h: number, rnd: () => number): void {
  // horizontal brush streaks
  g.save();
  g.globalAlpha = 0.045;
  for (let i = 0; i < 14; i++) {
    const y = rnd() * h;
    const grad = g.createLinearGradient(0, y, w, y);
    grad.addColorStop(0, "rgba(255,240,210,0)");
    grad.addColorStop(rnd(), "rgba(255,240,210,.5)");
    grad.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = grad;
    g.fillRect(0, y, w, 1.4);
  }
  g.restore();
  // canvas grain
  for (let i = 0; i < (w * h) / 90; i++) {
    g.fillStyle =
      rnd() < 0.5
        ? `rgba(255,245,220,${0.05 * rnd()})`
        : `rgba(30,20,8,${0.05 * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1, 1);
  }
  // vignette
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(10,6,2,.5)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

// --- the nine scenes ---------------------------------------------------------

/** The Depths — a torchlit stair descending into rat-eyed dark. */
function depths(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#1a2420", "#060a08");
  for (let i = 0; i < 7; i++) {
    const y = h * 0.28 + i * h * 0.1;
    const ww = w * (0.72 - i * 0.07);
    g.fillStyle = `rgb(${36 - i * 3},${56 - i * 5},${48 - i * 4})`;
    g.fillRect((w - ww) / 2, y, ww, h * 0.085);
  }
  glow(g, w * 0.2, h * 0.3, w * 0.3, "rgba(255,170,70,.5)");
  glow(g, w * 0.8, h * 0.34, w * 0.26, "rgba(255,150,60,.4)");
  g.fillStyle = "#ffb050";
  g.fillRect(w * 0.195, h * 0.24, 3, 10);
  g.fillRect(w * 0.795, h * 0.28, 3, 10);
  g.fillStyle = "#ffd080";
  for (const [x, y] of [[0.47, 0.82], [0.52, 0.82], [0.36, 0.9], [0.39, 0.9]]) {
    g.fillRect(w * x, h * y, 2.5, 2.5);
  }
  void rnd;
}

/** The Bonefields — a pale moon over skull-strewn barrow mounds. */
function bonefields(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#2c3140", "#11141c");
  glow(g, w * 0.72, h * 0.22, w * 0.3, "rgba(220,225,235,.55)");
  g.fillStyle = "#d8dce6";
  g.beginPath();
  g.arc(w * 0.72, h * 0.22, w * 0.09, 0, 7);
  g.fill();
  g.fillStyle = "#2c3140";
  g.beginPath();
  g.arc(w * 0.75, h * 0.2, w * 0.075, 0, 7);
  g.fill();
  ["#232833", "#1a1f28", "#12161e"].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(w * (0.25 + i * 0.3), h * (0.78 + i * 0.06), w * 0.34, h * 0.22, 0, Math.PI, 0);
    g.fill();
  });
  const skulls: Array<[number, number]> = [[0.3, 0.74], [0.62, 0.83], [0.45, 0.9]];
  g.fillStyle = "#cfc4a6";
  for (const [x, y] of skulls) {
    g.beginPath();
    g.arc(w * x, h * y, 3.6, 0, 7);
    g.fill();
    g.fillRect(w * x - 2.6, h * y + 2.4, 5.2, 2.2);
  }
  g.fillStyle = "#11141c";
  for (const [x, y] of skulls) {
    g.fillRect(w * x - 2, h * y - 1, 1.5, 1.5);
    g.fillRect(w * x + 0.7, h * y - 1, 1.5, 1.5);
  }
  void rnd;
}

/** The Wilds — a wolf howling on a crag against an amber dusk. */
function wilds(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#8a5a26", "#241408");
  glow(g, w * 0.5, h * 0.34, w * 0.42, "rgba(255,190,90,.4)");
  g.fillStyle = "#ffdf9a";
  g.beginPath();
  g.arc(w * 0.5, h * 0.34, w * 0.1, 0, 7);
  g.fill();
  // pine ridge
  g.fillStyle = "#1c1208";
  for (let i = 0; i < 8; i++) {
    const x = (i / 7) * w;
    const ph = h * (0.14 + rnd() * 0.1);
    g.beginPath();
    g.moveTo(x - w * 0.07, h * 0.66);
    g.lineTo(x, h * 0.66 - ph);
    g.lineTo(x + w * 0.07, h * 0.66);
    g.closePath();
    g.fill();
  }
  g.fillRect(0, h * 0.64, w, h * 0.36);
  // crag + howling wolf silhouette
  g.fillStyle = "#120b05";
  g.beginPath();
  g.moveTo(w * 0.14, h);
  g.lineTo(w * 0.3, h * 0.62);
  g.lineTo(w * 0.52, h * 0.7);
  g.lineTo(w * 0.5, h);
  g.closePath();
  g.fill();
  g.beginPath(); // body seated
  g.moveTo(w * 0.30, h * 0.62);
  g.quadraticCurveTo(w * 0.27, h * 0.5, w * 0.33, h * 0.47);
  g.lineTo(w * 0.355, h * 0.40); // neck up
  g.lineTo(w * 0.385, h * 0.365); // muzzle to the sky
  g.lineTo(w * 0.395, h * 0.385);
  g.lineTo(w * 0.375, h * 0.42); // ear notch
  g.lineTo(w * 0.40, h * 0.44);
  g.quadraticCurveTo(w * 0.43, h * 0.52, w * 0.42, h * 0.62);
  g.closePath();
  g.fill();
}

/** The Overgrowth — the grove's ancient heart glowing inside a great tree. */
function overgrowth(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#1c3018", "#0a1408");
  // canopy masses
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(${40 + i * 6},${86 + i * 8},${36 + i * 5},.5)`;
    g.beginPath();
    g.ellipse(w * rnd(), h * (0.1 + rnd() * 0.2), w * 0.3, h * 0.14, 0, 0, 7);
    g.fill();
  }
  // trunk
  g.fillStyle = "#241708";
  g.beginPath();
  g.moveTo(w * 0.42, h);
  g.quadraticCurveTo(w * 0.4, h * 0.5, w * 0.34, h * 0.3);
  g.lineTo(w * 0.44, h * 0.36);
  g.lineTo(w * 0.5, h * 0.24);
  g.lineTo(w * 0.56, h * 0.36);
  g.lineTo(w * 0.66, h * 0.3);
  g.quadraticCurveTo(w * 0.6, h * 0.5, w * 0.58, h);
  g.closePath();
  g.fill();
  // the heart
  glow(g, w * 0.5, h * 0.55, w * 0.2, "rgba(157,255,138,.75)");
  g.fillStyle = "#c8ffb0";
  g.beginPath();
  g.arc(w * 0.5, h * 0.55, w * 0.035, 0, 7);
  g.fill();
  // drifting spores
  g.fillStyle = "rgba(180,255,150,.6)";
  for (let i = 0; i < 12; i++) g.fillRect(w * rnd(), h * (0.3 + rnd() * 0.6), 1.6, 1.6);
  // undergrowth
  g.fillStyle = "#0e1c0a";
  g.beginPath();
  g.ellipse(w * 0.5, h * 1.04, w * 0.7, h * 0.16, 0, Math.PI, 0);
  g.fill();
}

/** The Sealed Vault — a warded door straining against the arcana inside. */
function sealedVault(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#141a30", "#080a16");
  // hall floor
  g.fillStyle = "#10142a";
  g.fillRect(0, h * 0.72, w, h * 0.28);
  g.strokeStyle = "rgba(120,140,255,.15)";
  g.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(w * 0.5 - i * w * 0.18, h);
    g.lineTo(w * 0.5 - i * w * 0.07, h * 0.72);
    g.moveTo(w * 0.5 + i * w * 0.18, h);
    g.lineTo(w * 0.5 + i * w * 0.07, h * 0.72);
    g.stroke();
  }
  // the vault door
  glow(g, w * 0.5, h * 0.45, w * 0.34, "rgba(110,130,255,.35)");
  g.fillStyle = "#1c2340";
  g.beginPath();
  g.arc(w * 0.5, h * 0.46, w * 0.26, Math.PI, 0);
  g.fill();
  g.fillRect(w * 0.24, h * 0.46, w * 0.52, h * 0.26);
  // rune ring on the door
  g.strokeStyle = "#ffd873";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(w * 0.5, h * 0.5, w * 0.13, 0, 7);
  g.stroke();
  g.fillStyle = "#ffd873";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    g.fillRect(w * 0.5 + Math.cos(a) * w * 0.13 - 1.5, h * 0.5 + Math.sin(a) * w * 0.13 - 1.5, 3, 3);
  }
  glow(g, w * 0.5, h * 0.5, w * 0.08, "rgba(255,216,115,.7)");
  // stray wisps
  g.fillStyle = "rgba(150,170,255,.7)";
  for (let i = 0; i < 6; i++) g.fillRect(w * (0.15 + rnd() * 0.7), h * (0.2 + rnd() * 0.45), 2, 2);
}

/** The Deep Forge — the foundry's molten heart under an anvil's shadow. */
function deepForge(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#241512", "#0c0605");
  glow(g, w * 0.5, h * 0.62, w * 0.5, "rgba(255,120,40,.55)");
  g.fillStyle = "#3a1d12";
  g.fillRect(w * 0.28, h * 0.42, w * 0.44, h * 0.4);
  const mouth = g.createRadialGradient(w * 0.5, h * 0.66, 2, w * 0.5, h * 0.66, w * 0.16);
  mouth.addColorStop(0, "#ffd070");
  mouth.addColorStop(0.5, "#ff7828");
  mouth.addColorStop(1, "#5a1e08");
  g.fillStyle = mouth;
  g.beginPath();
  g.arc(w * 0.5, h * 0.66, w * 0.14, Math.PI, 0);
  g.fill();
  g.fillRect(w * 0.36, h * 0.66, w * 0.28, h * 0.12);
  g.fillStyle = "#0a0505";
  g.fillRect(w * 0.42, h * 0.3, w * 0.16, h * 0.05);
  g.fillRect(w * 0.46, h * 0.35, w * 0.08, h * 0.07);
  g.fillStyle = "#ffcf70";
  for (let i = 0; i < 9; i++) {
    g.fillRect(w * (0.36 + rnd() * 0.28), h * (0.36 + rnd() * 0.26), 1.6, 1.6);
  }
}

/** The Eclipse Spire — the tower where light and dark war without end. */
function eclipseSpire(g: Ctx, w: number, h: number, rnd: () => number): void {
  // split sky: dawn-gold left, void-violet right
  const s = g.createLinearGradient(0, 0, w, 0);
  s.addColorStop(0, "#4a3a20");
  s.addColorStop(0.5, "#241a38");
  s.addColorStop(1, "#140c26");
  g.fillStyle = s;
  g.fillRect(0, 0, w, h);
  // the eclipse: dark disc with a corona
  glow(g, w * 0.5, h * 0.24, w * 0.26, "rgba(255,240,200,.65)");
  g.fillStyle = "#0c0818";
  g.beginPath();
  g.arc(w * 0.5, h * 0.24, w * 0.085, 0, 7);
  g.fill();
  g.strokeStyle = "rgba(255,240,200,.9)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(w * 0.5, h * 0.24, w * 0.09, 0, 7);
  g.stroke();
  // the spire
  g.fillStyle = "#0e0a1c";
  g.beginPath();
  g.moveTo(w * 0.4, h);
  g.lineTo(w * 0.46, h * 0.36);
  g.lineTo(w * 0.5, h * 0.3);
  g.lineTo(w * 0.54, h * 0.36);
  g.lineTo(w * 0.6, h);
  g.closePath();
  g.fill();
  // lit windows climbing it, gold on the light side, violet on the dark
  for (let i = 0; i < 6; i++) {
    const y = h * (0.44 + i * 0.085);
    g.fillStyle = "#ffd873";
    g.fillRect(w * 0.472, y, 2.2, 3.2);
    g.fillStyle = "#b49bff";
    g.fillRect(w * 0.516, y + h * 0.03, 2.2, 3.2);
  }
  // ground haze
  glow(g, w * 0.5, h * 1.02, w * 0.5, "rgba(90,70,140,.35)");
  void rnd;
}

/** Heroes of the Arena — banners over the colosseum sand. */
function heroes(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#3a5a8a", "#1a2c4a");
  glow(g, w * 0.76, h * 0.18, w * 0.3, "rgba(255,220,140,.5)");
  // tiered stands
  for (let i = 0; i < 3; i++) {
    g.fillStyle = `rgb(${70 - i * 12},${58 - i * 10},${44 - i * 8})`;
    g.beginPath();
    g.ellipse(w * 0.5, h * (0.52 + i * 0.07), w * (0.62 - i * 0.09), h * 0.13, 0, Math.PI, 0, true);
    g.fill();
  }
  // the sand
  const sand = g.createLinearGradient(0, h * 0.55, 0, h);
  sand.addColorStop(0, "#c8a45e");
  sand.addColorStop(1, "#7a5c2c");
  g.fillStyle = sand;
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.86, w * 0.56, h * 0.32, 0, 0, 7);
  g.fill();
  // crossed sword + axe planted in the sand
  g.strokeStyle = "#d8dce6";
  g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(w * 0.38, h * 0.5);
  g.lineTo(w * 0.56, h * 0.88);
  g.stroke();
  g.strokeStyle = "#b8bcc8";
  g.beginPath();
  g.moveTo(w * 0.62, h * 0.52);
  g.lineTo(w * 0.46, h * 0.88);
  g.stroke();
  g.fillStyle = "#8a6a24";
  g.fillRect(w * 0.365, h * 0.545, w * 0.05, 3.4);
  g.fillRect(w * 0.585, h * 0.565, w * 0.05, 3.4);
  // banners
  for (const [x, c] of [[0.16, "#c23a3a"], [0.84, "#3b82f6"]] as Array<[number, string]>) {
    g.fillStyle = "#241708";
    g.fillRect(w * x - 1, h * 0.3, 2, h * 0.3);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(w * x, h * 0.3);
    g.lineTo(w * x + w * 0.09, h * 0.32);
    g.lineTo(w * x + w * 0.09, h * 0.44);
    g.lineTo(w * x, h * 0.42);
    g.closePath();
    g.fill();
  }
  void rnd;
}

/** Arms & Relics — an armory still-life by candlelight. */
function items(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#3a2415", "#170d06");
  glow(g, w * 0.35, h * 0.3, w * 0.4, "rgba(255,190,90,.3)");
  g.fillStyle = "#2a1a0c";
  g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = "#3c2712";
  g.fillRect(0, h * 0.68, w, 4);
  // shield
  g.fillStyle = "#5b8dd9";
  g.beginPath();
  g.moveTo(w * 0.3, h * 0.34);
  g.quadraticCurveTo(w * 0.44, h * 0.4, w * 0.3, h * 0.72);
  g.quadraticCurveTo(w * 0.16, h * 0.4, w * 0.3, h * 0.34);
  g.fill();
  g.strokeStyle = "#d9b455";
  g.lineWidth = 2.5;
  g.stroke();
  // sword leaning across it
  g.strokeStyle = "#c8ccd6";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(w * 0.62, h * 0.2);
  g.lineTo(w * 0.4, h * 0.7);
  g.stroke();
  g.strokeStyle = "#8a6a24";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(w * 0.585, h * 0.3);
  g.lineTo(w * 0.505, h * 0.44);
  g.stroke();
  // potion + gem
  g.fillStyle = "#7c4fd0";
  g.beginPath();
  g.arc(w * 0.72, h * 0.62, w * 0.055, 0, 7);
  g.fill();
  g.fillStyle = "#caa84a";
  g.fillRect(w * 0.705, h * 0.5, w * 0.03, h * 0.07);
  g.fillStyle = "#e05a5a";
  g.beginPath();
  g.moveTo(w * 0.84, h * 0.6);
  g.lineTo(w * 0.89, h * 0.66);
  g.lineTo(w * 0.84, h * 0.72);
  g.lineTo(w * 0.79, h * 0.66);
  g.closePath();
  g.fill();
  void rnd;
}

// --- the gallery -------------------------------------------------------------

const SCENES: Record<string, (g: Ctx, w: number, h: number, rnd: () => number) => void> = {
  depths,
  bonefields,
  wilds,
  overgrowth,
  sealed_vault: sealedVault,
  deep_forge: deepForge,
  eclipse_spire: eclipseSpire,
  heroes,
  items,
};

/** Paint `bookId`'s splash vignette onto a w×h context (unknown ids get the
 *  armory still-life rather than a blank plate). */
export function drawSplash(g: Ctx, bookId: string, w: number, h: number): void {
  const rnd = prng(bookId);
  (SCENES[bookId] ?? items)(g, w, h, rnd);
  finish(g, w, h, rnd);
}
