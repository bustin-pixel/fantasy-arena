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

/** Heroes of the Arena — "The Victor's Dawn": a caped champion raises a
 *  gleaming blade into a huge low sun; god-rays, colosseum arches, crowd
 *  flecks, drifting petals ("visual upgrade" mockup 1, built 2026-07-12). */
function heroes(g: Ctx, w: number, h: number, rnd: () => number): void {
  const s = g.createLinearGradient(0, 0, 0, h);
  s.addColorStop(0, "#2c2440");
  s.addColorStop(0.45, "#8a4e2a");
  s.addColorStop(0.62, "#e09850");
  s.addColorStop(1, "#5a3a1c");
  g.fillStyle = s;
  g.fillRect(0, 0, w, h);
  // the low sun + corona
  glow(g, w * 0.5, h * 0.45, w * 0.5, "rgba(255,200,110,.55)");
  g.fillStyle = "#ffe2a0";
  g.beginPath();
  g.arc(w * 0.5, h * 0.45, w * 0.15, 0, 7);
  g.fill();
  // god-rays
  g.save();
  g.globalAlpha = 0.1;
  g.fillStyle = "#ffd88a";
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.45);
    g.lineTo(w * 0.5 + Math.cos(a - 0.05) * w, h * 0.45 + Math.sin(a - 0.05) * w);
    g.lineTo(w * 0.5 + Math.cos(a + 0.05) * w, h * 0.45 + Math.sin(a + 0.05) * w);
    g.closePath();
    g.fill();
  }
  g.restore();
  // colosseum ring: dark band with sun-lit arches
  g.fillStyle = "#2a1a10";
  g.fillRect(0, h * 0.42, w, h * 0.16);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.06 + i * 0.15);
    g.fillStyle = "rgba(224,152,80,.8)";
    g.beginPath();
    g.arc(x, h * 0.52, w * 0.032, Math.PI, 0);
    g.fill();
    g.fillRect(x - w * 0.032, h * 0.52, w * 0.064, h * 0.045);
  }
  // crowd flecks above the band
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,220,160,${0.15 + rnd() * 0.25})`;
    g.fillRect(rnd() * w, h * (0.43 + rnd() * 0.05), 1.6, 1.6);
  }
  // sand
  const sand = g.createLinearGradient(0, h * 0.58, 0, h);
  sand.addColorStop(0, "#d8b06a");
  sand.addColorStop(1, "#6e5228");
  g.fillStyle = sand;
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.92, w * 0.62, h * 0.36, 0, 0, 7);
  g.fill();
  // champion mound shadow
  g.fillStyle = "rgba(60,38,14,.55)";
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.88, w * 0.2, h * 0.05, 0, 0, 7);
  g.fill();
  // the champion — dark silhouette, sword raised into the sun
  g.fillStyle = "#221208";
  g.beginPath(); // torso + skirt
  g.moveTo(w * 0.455, h * 0.86);
  g.lineTo(w * 0.468, h * 0.62);
  g.lineTo(w * 0.532, h * 0.62);
  g.lineTo(w * 0.545, h * 0.86);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(w * 0.5, h * 0.575, w * 0.032, 0, 7);
  g.fill(); // head
  // raised sword arm
  g.strokeStyle = "#221208";
  g.lineWidth = w * 0.022;
  g.beginPath();
  g.moveTo(w * 0.525, h * 0.65);
  g.lineTo(w * 0.575, h * 0.52);
  g.stroke();
  // the blade catching light
  g.strokeStyle = "#fff2c8";
  g.lineWidth = w * 0.014;
  g.beginPath();
  g.moveTo(w * 0.578, h * 0.51);
  g.lineTo(w * 0.6, h * 0.3);
  g.stroke();
  glow(g, w * 0.6, h * 0.3, w * 0.07, "rgba(255,240,190,.9)");
  // flowing cape
  g.fillStyle = "#7a1e1e";
  g.beginPath();
  g.moveTo(w * 0.468, h * 0.63);
  g.quadraticCurveTo(w * 0.38, h * 0.7, w * 0.36, h * 0.85);
  g.quadraticCurveTo(w * 0.43, h * 0.8, w * 0.462, h * 0.84);
  g.closePath();
  g.fill();
  // gold rim-light on the sun side
  g.strokeStyle = "rgba(255,216,138,.85)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(w * 0.532, h * 0.62);
  g.lineTo(w * 0.545, h * 0.86);
  g.stroke();
  g.beginPath();
  g.arc(w * 0.5, h * 0.575, w * 0.032, -0.9, 0.9);
  g.stroke();
  // drifting petals
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(255,${140 + ((rnd() * 60) | 0)},120,${0.4 + rnd() * 0.4})`;
    g.fillRect(rnd() * w, h * (0.1 + rnd() * 0.6), 2.4, 1.6);
  }
}

/** Arms & Relics — "The Trophy Wall": a mounted shield with crossed
 *  greatswords over a candlelit mantel of relics — crown, potion, gem,
 *  scroll — against a patterned tapestry ("visual upgrade" mockup 2,
 *  built 2026-07-12). */
function items(g: Ctx, w: number, h: number, rnd: () => number): void {
  sky(g, w, h, "#301c10", "#140a05");
  // tapestry panel
  g.fillStyle = "#422512";
  g.fillRect(w * 0.16, 0, w * 0.68, h * 0.66);
  g.strokeStyle = "#5c3a1c";
  g.lineWidth = 2;
  g.strokeRect(w * 0.16, 0, w * 0.68, h * 0.66);
  g.fillStyle = "rgba(216,180,85,.14)";
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const x = w * (0.22 + i * 0.13);
      const y = h * (0.08 + j * 0.15);
      g.beginPath();
      g.moveTo(x, y - 4);
      g.lineTo(x + 4, y);
      g.lineTo(x, y + 4);
      g.lineTo(x - 4, y);
      g.closePath();
      g.fill();
    }
  }
  // crossed greatswords behind the shield
  g.strokeStyle = "#c8ccd6";
  g.lineWidth = w * 0.018;
  g.beginPath();
  g.moveTo(w * 0.32, h * 0.1);
  g.lineTo(w * 0.68, h * 0.52);
  g.stroke();
  g.beginPath();
  g.moveTo(w * 0.68, h * 0.1);
  g.lineTo(w * 0.32, h * 0.52);
  g.stroke();
  g.strokeStyle = "#8a6a24";
  g.lineWidth = w * 0.02;
  g.beginPath();
  g.moveTo(w * 0.355, h * 0.145);
  g.lineTo(w * 0.41, h * 0.205);
  g.stroke();
  g.beginPath();
  g.moveTo(w * 0.645, h * 0.145);
  g.lineTo(w * 0.59, h * 0.205);
  g.stroke();
  // the mounted shield
  glow(g, w * 0.5, h * 0.32, w * 0.22, "rgba(255,190,90,.30)");
  g.fillStyle = "#4d7fd0";
  g.beginPath();
  g.moveTo(w * 0.5, h * 0.14);
  g.quadraticCurveTo(w * 0.66, h * 0.2, w * 0.5, h * 0.52);
  g.quadraticCurveTo(w * 0.34, h * 0.2, w * 0.5, h * 0.14);
  g.fill();
  g.strokeStyle = "#d9b455";
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = "#e6c86a";
  g.beginPath();
  g.arc(w * 0.5, h * 0.3, w * 0.03, 0, 7);
  g.fill(); // boss
  g.strokeStyle = "rgba(255,255,255,.35)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(w * 0.44, h * 0.2);
  g.quadraticCurveTo(w * 0.47, h * 0.3, w * 0.45, h * 0.42);
  g.stroke(); // sheen
  // the mantel shelf
  g.fillStyle = "#241207";
  g.fillRect(w * 0.12, h * 0.66, w * 0.76, h * 0.05);
  g.fillStyle = "#3c2712";
  g.fillRect(w * 0.12, h * 0.66, w * 0.76, 3);
  g.fillStyle = "#170d06";
  g.fillRect(0, h * 0.71, w, h * 0.29);
  // relics on the shelf: crown, potion, gem, scroll
  g.fillStyle = "#e6c86a"; // crown
  g.beginPath();
  g.moveTo(w * 0.24, h * 0.66);
  g.lineTo(w * 0.24, h * 0.615);
  g.lineTo(w * 0.265, h * 0.638);
  g.lineTo(w * 0.285, h * 0.605);
  g.lineTo(w * 0.305, h * 0.638);
  g.lineTo(w * 0.33, h * 0.615);
  g.lineTo(w * 0.33, h * 0.66);
  g.closePath();
  g.fill();
  g.fillStyle = "#e05a5a";
  g.fillRect(w * 0.279, h * 0.618, 4, 4);
  g.fillStyle = "#7c4fd0"; // potion
  g.beginPath();
  g.arc(w * 0.46, h * 0.635, w * 0.026, 0, 7);
  g.fill();
  g.fillStyle = "#caa84a";
  g.fillRect(w * 0.452, h * 0.585, w * 0.015, h * 0.035);
  g.fillStyle = "#59c9d9"; // gem
  g.beginPath();
  g.moveTo(w * 0.6, h * 0.6);
  g.lineTo(w * 0.625, h * 0.632);
  g.lineTo(w * 0.6, h * 0.66);
  g.lineTo(w * 0.575, h * 0.632);
  g.closePath();
  g.fill();
  g.fillStyle = "#d9c9a0"; // scroll
  g.fillRect(w * 0.7, h * 0.635, w * 0.075, h * 0.025);
  g.fillStyle = "#b09868";
  g.fillRect(w * 0.7, h * 0.635, w * 0.01, h * 0.025);
  g.fillRect(w * 0.765, h * 0.635, w * 0.01, h * 0.025);
  // candles flanking the shelf
  for (const x of [0.16, 0.84]) {
    g.fillStyle = "#d9c9a0";
    g.fillRect(w * x - 2.5, h * 0.6, 5, h * 0.06);
    glow(g, w * x, h * 0.575, w * 0.09, "rgba(255,190,90,.65)");
    g.fillStyle = "#ffcf70";
    g.beginPath();
    g.ellipse(w * x, h * 0.575, 2.2, 4.4, 0, 0, 7);
    g.fill();
  }
  // warm gleams
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(255,224,150,${0.3 + rnd() * 0.4})`;
    g.fillRect(w * (0.2 + rnd() * 0.6), h * (0.15 + rnd() * 0.5), 1.6, 1.6);
  }
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

/** Books whose portrait COVER shows a plate-scale cutout of the landscape
 *  painting (a window centered on this focal x) instead of squeezing the whole
 *  scene into the portrait box. The dungeon books keep the squeeze — their
 *  scenes (spire, trunk, vault door) read fine tall. */
const COVER_FOCAL: Record<string, number> = { heroes: 0.53, items: 0.5 };

/** Paint `bookId`'s splash vignette onto a w×h context (unknown ids get the
 *  armory still-life rather than a blank plate). Pass `cover: true` when
 *  painting a portrait book cover so COVER_FOCAL books crop instead of
 *  squeezing; the painterly finish is applied after the crop so the vignette
 *  frames the cover itself, not a cut-off corner of the plate's. */
export function drawSplash(
  g: Ctx,
  bookId: string,
  w: number,
  h: number,
  opts?: { cover?: boolean }
): void {
  const focal = opts?.cover ? COVER_FOCAL[bookId] : undefined;
  if (focal !== undefined && w < h * 1.5) {
    // Paint the 3:2 plate at this height offscreen, then crop a w-wide window.
    const dpr = g.getTransform().a || 1; // callers pre-scale the ctx by dpr
    const sw = Math.round(h * 1.5);
    const off = document.createElement("canvas");
    off.width = sw * dpr;
    off.height = h * dpr;
    const og = off.getContext("2d");
    if (og) {
      og.setTransform(dpr, 0, 0, dpr, 0, 0);
      (SCENES[bookId] ?? items)(og, sw, h, prng(bookId));
      const sx = Math.max(0, Math.min(sw - w, Math.round(focal * sw - w / 2)));
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(off, sx * dpr, 0, w * dpr, h * dpr, 0, 0, w * dpr, h * dpr);
      g.restore();
      finish(g, w, h, prng(bookId + "-cover"));
      return;
    }
  }
  const rnd = prng(bookId);
  (SCENES[bookId] ?? items)(g, w, h, rnd);
  finish(g, w, h, rnd);
}
