// ============================================================================
// Procedural sprites
// Rather than ship binary sprite sheets, each unit is drawn procedurally on the
// canvas with a distinct silhouette + accent color. Animation (idle bob, walk
// bounce, attack lunge, cast flare, hit flash, death fade) is derived from the
// unit's animTime/animState so the look matches the spec's six animation states
// without needing real art assets. Portraits reuse the same draw routine.
//
// Art style: every body reads as a shaded volume (a light→body→dark vertical
// gradient), catches a rim light on its left edge, and carries a signature glow
// or particle emitter themed to its accent colour. Ambient particles (embers,
// wisps, drips, gleams) ride a presentation-only wall clock (see `nowSeconds`)
// rather than `unit.animTime`, which resets to 0 on every state change and would
// pop the loops. Static hub portraits pass `live: false` to freeze the clock and
// suppress the particle emitters, so card art stays still.
// ============================================================================

import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";

type Ctx = CanvasRenderingContext2D;
const PI2 = Math.PI * 2;

/** Per-frame animation inputs handed to each unit's draw routine. */
interface SpriteAnim {
  /** Presentation clock (seconds), offset per-unit so clones desync. 0 static. */
  t: number;
  /** 0..1 ambient glow pulse. */
  glow: number;
  /** 0..1 casting flare, from the unit's cast animation state. */
  cast: number;
  /** False for static hub portraits — suppress motion-only particle emitters. */
  live: boolean;
}

/** Wall-clock seconds. Presentation-only: never read by the simulation, so this
 *  does not affect determinism (the Renderer is free to read wall time). */
function nowSeconds(): number {
  return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

/** A small stable phase from a unit's uid so identical units don't pulse in
 *  lockstep. Portraits pass a stub with no uid → phase 0 (a clean frozen frame). */
function phaseOf(uid: string | undefined): number {
  if (!uid) return 0;
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 1009;
  return (h / 1009) * PI2;
}

/** Deterministic 0/1 body-variant pick from a unit's uid, so horde units don't
 *  all read as clones. XOR of char-code parities: real uids are sequential
 *  ("u0","u1",…), so this alternates through a wave instead of clustering
 *  (phaseOf's range test puts u0–u9 all on one side). Presentation-only.
 *  Portraits (no uid) always get 0. */
function variantOf(uid: string | undefined): 0 | 1 {
  if (!uid) return 0;
  let p = 0;
  for (let i = 0; i < uid.length; i++) p ^= uid.charCodeAt(i) & 1;
  return p as 0 | 1;
}

function withShade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

/** Body bob/lunge offsets from animation state. */
function animOffsets(unit: Unit): { bob: number; lunge: number; cast: number } {
  const t = unit.animTime;
  switch (unit.animState) {
    case "moving":
      return { bob: Math.sin(t * 14) * 2.5, lunge: 0, cast: 0 };
    case "attacking": {
      // sharp lunge on each attack
      const phase = (t % unit.attackSpeed) / unit.attackSpeed;
      const l = phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI) * 7 : 0;
      return { bob: 0, lunge: l, cast: 0 };
    }
    case "casting":
      return { bob: 0, lunge: 0, cast: Math.sin(t * 24) * 0.5 + 0.5 };
    case "idle":
      return { bob: Math.sin(t * 3) * 1.2, lunge: 0, cast: 0 };
    default:
      return { bob: 0, lunge: 0, cast: 0 };
  }
}

// ---- shared upgrade helpers ------------------------------------------------

/** A rounded torso filled with a light→body→dark vertical gradient (metal/robe
 *  volume). Same footprint as the old flat `roundedBody`. */
function metalBody(
  ctx: Ctx,
  w: number,
  h: number,
  y: number,
  body: string,
  dark: string,
  light: string,
  r = 6
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.5, body);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w / 2, y, w, h, r);
  ctx.fill();
}

/** A glowing orb: soft outer bloom, saturated body, bright offset core. */
function orb(ctx: Ctx, x: number, y: number, r: number, color: string, glow: number, core = "#ffffff"): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 + glow * 9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.42, 0, PI2);
  ctx.fill();
  ctx.restore();
}

/** A drifting-upward mote emitter (embers, spores, soul-wisps). Motion only —
 *  drawn nothing when `!A.live` so portraits stay still. */
function rising(
  ctx: Ctx,
  cx: number,
  spread: number,
  baseY: number,
  riseH: number,
  color: string,
  A: SpriteAnim,
  n = 5
): void {
  if (!A.live) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const seed = i * 1.7;
    const life = (A.t * 0.6 + seed) % 1;
    const x = cx + Math.sin(seed * 5 + A.t * 1.5) * spread + (i - n / 2);
    const y = baseY - life * riseH;
    ctx.globalAlpha = (1 - life) * 0.8;
    const r = 1.2 * (1 - life) + 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

interface DrawOpts {
  /** Override scale (portraits use a larger scale). */
  scale?: number;
  /** Force a static idle pose (portraits). */
  staticPose?: boolean;
}

/**
 * Draw a unit centered at (cx, cy) in the current canvas. The shape per archetype
 * keeps each unit recognizable: ogre = bulky, knight = shielded blocky, archer =
 * slim with bow, mages = robed with orb.
 */
export function drawUnitSprite(
  ctx: Ctx,
  unit: Unit,
  cx: number,
  cy: number,
  opts: DrawOpts = {}
): void {
  const def = getUnitDef(unit.defId);
  const scale = opts.scale ?? 1;
  const live = !opts.staticPose;
  const { bob, lunge, cast } = live
    ? animOffsets(unit)
    : { bob: 0, lunge: 0, cast: 0 };

  // Presentation clock, offset per-unit so identical units desync.
  const t = (live ? nowSeconds() : 0) + phaseOf(unit.uid);
  const A: SpriteAnim = { t, glow: 0.5 + 0.5 * Math.sin(t * 3), cast, live };

  ctx.save();
  ctx.translate(cx, cy - bob);

  // Facing flip + attack lunge toward facing direction.
  const dirX = unit.facing;
  ctx.translate(dirX * lunge, 0);
  ctx.scale(dirX * scale, scale);

  const body = def.color;
  const dark = withShade(body, -45);
  const light = withShade(body, 40);
  const accent = def.accent;

  // Shadow.
  if (!opts.staticPose) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 26, 18, 6, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  // A polymorphed unit draws as a harmless sheep regardless of its def id.
  // (The hub portrait passes a minimal stub with no effects — hence the `?.`.)
  if (unit.effects?.some((e) => e.type === "polymorph")) {
    drawSheep(ctx);
    ctx.restore();
    return;
  }

  // Druid in bear form draws as a bear regardless of its def id.
  if (def.id === "summoner" && unit.transformed) {
    drawBear(ctx, "#6b4a2a", "#3f2c18", "#8a6240", accent, A);
    ctx.restore();
    return;
  }

  switch (def.id) {
    case "ogre":
      drawOgre(ctx, body, dark, light, accent, A);
      break;
    case "orc":
      drawOrc(ctx, body, dark, light, accent, A);
      break;
    case "archer":
      drawArcher(ctx, body, dark, light, accent, A);
      break;
    case "ranger":
      drawRanger(ctx, body, dark, light, accent, A);
      break;
    case "hunter":
      drawHunter(ctx, body, dark, light, accent, A);
      break;
    case "boar":
      drawBoar(ctx, body, dark, light, accent, A);
      break;
    case "knight":
      drawKnight(ctx, body, dark, light, accent, A, KNIGHT_LIVERY);
      break;
    case "warrior":
      drawWarrior(ctx, body, dark, light, accent, A);
      break;
    case "aegis_knight":
      drawAegisKnight(ctx, body, dark, light, accent, A);
      break;
    case "holy_knight":
      drawKnight(ctx, body, dark, light, accent, A, HOLY_LIVERY);
      break;
    case "engineer":
      drawEngineer(ctx, body, dark, light, accent, A);
      break;
    case "turret":
      drawTurret(ctx, body, dark, light, accent, A);
      break;
    case "fire_mage":
      drawMage(ctx, body, dark, light, accent, A, "fire");
      break;
    case "ice_mage":
      drawMage(ctx, body, dark, light, accent, A, "ice");
      break;
    case "arcane_mage":
      drawMage(ctx, body, dark, light, accent, A, "arcane");
      break;
    case "mage":
      drawMage(ctx, body, dark, light, accent, A, "plain");
      break;
    case "electric_mage":
      drawMage(ctx, body, dark, light, accent, A, "electric");
      break;
    case "assassin":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "rogue":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "trickster":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "healer":
      drawHealer(ctx, body, dark, light, accent, A);
      break;
    case "summoner":
      drawSummoner(ctx, body, dark, light, accent, A);
      break;
    case "wolf":
      drawWolf(ctx, body, dark, light, accent, A);
      break;
    // Depths monsters — recolors of existing bodies (per the locked design).
    case "giant_rat":
      ctx.scale(0.75, 0.75); // tiny vermin, low to the ground
      drawGiantRat(ctx, body, dark, light, accent, A);
      break;
    case "zombie_shambler":
      drawZombieShambler(ctx, body, dark, light, accent, A, variantOf(unit.uid));
      break;
    case "bloater":
      drawSlime(ctx, body, dark, light, accent, A, 1.2); // swollen pus-green blob
      break;
    case "berserker":
      drawBerserker(ctx, body, dark, light, accent, A);
      break;
    case "necromancer":
      drawNecromancer(ctx, body, dark, light, accent, A);
      break;
    case "skeleton":
      drawSkeleton(ctx, body, dark, light, accent, A, variantOf(unit.uid));
      break;
    case "slime":
      drawSlime(ctx, body, dark, light, accent, A, 1);
      break;
    case "slime_clone":
      drawSlime(ctx, body, dark, light, accent, A, 0.7);
      break;
    case "mystic_archer":
      drawMysticArcher(ctx, body, dark, light, accent, A, unit.mysticForm);
      break;
    default:
      drawBrute(ctx, body, dark, light, accent, A);
  }

  ctx.restore();
}

// Each draw fn works in a normalized space (~ -20..20 wide, -28..28 tall).

// Turret — a stubby armored base with a barrel pointing up. Symmetric, so the
// renderer's facing-flip is a no-op.
function drawTurret(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Wide base with shading.
  const bg = ctx.createLinearGradient(0, 8, 0, 20);
  bg.addColorStop(0, body);
  bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-16, 8, 32, 12, 3);
  ctx.fill();
  // Armored housing.
  const hg = ctx.createLinearGradient(0, -4, 0, 10);
  hg.addColorStop(0, light);
  hg.addColorStop(1, body);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(-12, -4, 24, 14, 4);
  ctx.fill();
  // Dome cap.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -4, 10, Math.PI, PI2);
  ctx.fill();
  // Barrel + highlight.
  ctx.fillStyle = dark;
  ctx.fillRect(-4, -22, 8, 18);
  ctx.fillStyle = withShade(dark, 22);
  ctx.fillRect(-4, -22, 3, 18);
  // Glowing muzzle.
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.fillRect(-4, -24, 8, 4);
  ctx.restore();
  // Rivets.
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 1, 3, 3);
  ctx.fillRect(6, 1, 3, 3);
  ctx.fillStyle = withShade(light, 20);
  ctx.fillRect(-9, 1, 1.5, 1.5);
  ctx.fillRect(6, 1, 1.5, 1.5);
}

// Engineer — a stout dwarven fortifier: a lamp-lit hard hat and welder goggles, a
// steam-boiler backpack, a braided beard, and a rivet-gun that spits sparks. The
// gun points forward (to the right) and flips with the unit's facing.
function drawEngineer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // Steam-boiler backpack behind the shoulder (hooped tank + gauge + pipe + steam).
  ctx.fillStyle = withShade(body, -46);
  ctx.beginPath();
  ctx.roundRect(-15, -3, 8, 19, 3);
  ctx.fill();
  ctx.strokeStyle = withShade(body, -64);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-15, 2);
  ctx.lineTo(-7, 2);
  ctx.moveTo(-15, 8);
  ctx.lineTo(-7, 8);
  ctx.stroke();
  ctx.fillStyle = "#d9dde2"; // pressure gauge
  ctx.beginPath();
  ctx.arc(-11, -1, 2.2, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, -1);
  ctx.lineTo(-10, -2.4);
  ctx.stroke();
  ctx.strokeStyle = withShade(accent, -34); // pipe over the shoulder
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-11, -3);
  ctx.quadraticCurveTo(-11, -13, -2, -13);
  ctx.stroke();
  ctx.lineCap = "butt";
  rising(ctx, -11, 3, -3, 16, "rgba(220,224,228,0.9)", A, 4);
  // Stout torso.
  metalBody(ctx, 26, 22, 2, body, dark, light, 5);
  // Plate seam + riveted highlights.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, 9);
  ctx.lineTo(12, 9);
  ctx.stroke();
  const rivets: [number, number][] = [
    [-10, 5],
    [10, 5],
    [-10, 13],
    [10, 13],
  ];
  ctx.fillStyle = dark;
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = light;
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx - 0.5, ry - 0.5, 0.6, 0, PI2);
    ctx.fill();
  }
  // Tool belt + buckle + pouch.
  ctx.fillStyle = dark;
  ctx.fillRect(-13, 15, 26, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(-3, 15, 6, 5);
  ctx.fillStyle = withShade(body, -28);
  ctx.fillRect(6, 15, 5, 6);
  // Head.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -7, 9, 0, PI2);
  ctx.fill();
  // Braided beard with beads.
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(-7, -3);
  ctx.quadraticCurveTo(-8, 7, -3, 8);
  ctx.quadraticCurveTo(0, 10, 3, 8);
  ctx.quadraticCurveTo(8, 7, 7, -3);
  ctx.quadraticCurveTo(0, 1, -7, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-3, 7.5, 1, 0, PI2);
  ctx.arc(3, 7.5, 1, 0, PI2);
  ctx.fill();
  // Hard hat (dome + brim + ridge) with shading.
  const hg = ctx.createLinearGradient(0, -18, 0, -6);
  hg.addColorStop(0, withShade(accent, 30));
  hg.addColorStop(1, accent);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, -9, 9, Math.PI, PI2);
  ctx.fill();
  ctx.fillRect(-11, -9, 22, 3);
  ctx.fillStyle = withShade(accent, -22);
  ctx.fillRect(-1, -18, 2, 9);
  // Glowing head-lamp.
  ctx.save();
  ctx.shadowColor = "#fff2c0";
  ctx.shadowBlur = 6 + A.glow * 7;
  ctx.fillStyle = "#fff2c0";
  ctx.beginPath();
  ctx.arc(0, -10.5, 2.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // Welder goggles (two lenses + strap + accent glint).
  ctx.fillStyle = "#20242a";
  ctx.beginPath();
  ctx.arc(-3.4, -6.5, 2.7, 0, PI2);
  ctx.arc(3.4, -6.5, 2.7, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = withShade(accent, -8);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-1, -6.5);
  ctx.lineTo(1, -6.5);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.fillRect(-4.4, -7.6, 1.4, 1.4);
  ctx.fillRect(2.6, -7.6, 1.4, 1.4);
  ctx.restore();
  // Wrench in the near hand.
  ctx.save();
  ctx.translate(-10, 10);
  ctx.rotate(-0.55);
  ctx.strokeStyle = "#aeb4bc";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#cfd4db";
  ctx.beginPath();
  ctx.arc(0, -1.5, 2.8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -1.5, 1.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // Rivet-gun: wooden grip, boxy receiver + hopper, steel barrel, glowing muzzle.
  ctx.fillStyle = "#5a3d22";
  ctx.fillRect(-9, 4, 10, 5);
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.roundRect(-2, 2, 9, 7, 1.5);
  ctx.fill();
  ctx.fillStyle = withShade(accent, -16);
  ctx.fillRect(1, -1, 3, 4);
  const bg = ctx.createLinearGradient(6, 4, 6, 7);
  bg.addColorStop(0, "#cfd4db");
  bg.addColorStop(1, "#8a9099");
  ctx.fillStyle = bg;
  ctx.fillRect(6, 4.5, 17, 3);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.fillRect(21, 4, 4, 4);
  ctx.restore();
  // Welding sparks spraying forward (motion only).
  if (A.live) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const life = (t * 1.5 + i * 0.8) % 1;
      const sx = 24 + life * 11;
      const sy = 6 + Math.sin(i * 2.3 + t * 7) * 5 * life;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = i % 2 ? "#ffe08a" : accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.1 * (1 - life) + 0.4, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Hunter — a hooded beastmaster ranger drawing a heavy recurve longbow. The bow
// points forward (to the right) and flips with the unit's facing. Its boar and
// scatter traps are their own entities, so the sprite is just the archer figure.
function drawHunter(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // Fur-trimmed cloak behind the shoulders (sways idly).
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.quadraticCurveTo(12 + Math.sin(t * 1.6) * 1.5, 6, 8, 22);
  ctx.lineTo(-8, 22);
  ctx.quadraticCurveTo(-11, 5, -6, -9);
  ctx.closePath();
  ctx.fill();
  // Quiver slung behind, arrows fletched up.
  ctx.save();
  ctx.rotate(-0.15);
  ctx.fillStyle = withShade(body, -42);
  ctx.beginPath();
  ctx.roundRect(-12, -10, 5, 15, 2);
  ctx.fill();
  ctx.restore();
  for (const dx of [-11, -9, -7]) {
    ctx.strokeStyle = "#d8c9a8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx, -9);
    ctx.lineTo(dx - 1.5, -16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(dx - 1.5, -16);
    ctx.lineTo(dx - 3.4, -15);
    ctx.lineTo(dx - 1, -13);
    ctx.closePath();
    ctx.fill();
  }
  // Lean torso.
  metalBody(ctx, 16, 23, -3, body, dark, light, 5);
  // Crossed leather straps.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -1);
  ctx.lineTo(6, 11);
  ctx.moveTo(6, -1);
  ctx.lineTo(-6, 11);
  ctx.stroke();
  ctx.lineCap = "butt";
  // Belt + buckle.
  ctx.fillStyle = withShade(body, -42);
  ctx.fillRect(-8, 11, 16, 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-2, 11, 4, 4);
  // Fur ruff across the shoulders.
  ctx.fillStyle = withShade(accent, -4);
  for (const px of [-7, -4, -1, 2, 5]) {
    ctx.beginPath();
    ctx.arc(px, -6, 2.8, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = withShade(accent, 20);
  for (const px of [-6, -2, 2]) {
    ctx.beginPath();
    ctx.arc(px, -7, 1.1, 0, PI2);
    ctx.fill();
  }
  // Head under the hood (mostly shadowed).
  ctx.fillStyle = "#c2a374";
  ctx.beginPath();
  ctx.arc(1, -12, 5.6, 0, PI2);
  ctx.fill();
  // Deep hood + peak.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-5, -10);
  ctx.quadraticCurveTo(-7, -22, 2, -21);
  ctx.quadraticCurveTo(9, -20, 7, -9);
  ctx.quadraticCurveTo(1, -13, -5, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, -21);
  ctx.quadraticCurveTo(-2, -24, -5, -22);
  ctx.quadraticCurveTo(-1, -20, 2, -20);
  ctx.closePath();
  ctx.fill();
  // Face recess shadow.
  ctx.fillStyle = "#12140e";
  ctx.beginPath();
  ctx.ellipse(2, -11, 3, 3.2, 0, 0, PI2);
  ctx.fill();
  // Glowing eyes.
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.fillRect(0.4, -11.6, 1.5, 1.3);
  ctx.fillRect(2.8, -11.6, 1.5, 1.3);
  ctx.restore();
  // Heavy recurve longbow (right hand) with a nocked broadhead.
  const bg = ctx.createLinearGradient(10, -18, 10, 14);
  bg.addColorStop(0, withShade(accent, 28));
  bg.addColorStop(0.5, accent);
  bg.addColorStop(1, withShade(accent, -28));
  ctx.strokeStyle = bg;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(12, -2, 17, -Math.PI / 2.5, Math.PI / 2.5);
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(18.5, -15.8, 3, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(18.5, 11.8, 3, Math.PI * 0.3, Math.PI * 1.1);
  ctx.stroke();
  ctx.lineCap = "butt";
  // String.
  ctx.strokeStyle = "#eaeaea";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18.6, -16.4);
  ctx.lineTo(6, -2);
  ctx.lineTo(18.6, 12.4);
  ctx.stroke();
  // Nocked arrow + broadhead.
  ctx.strokeStyle = "#c9b78f";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(3, -2);
  ctx.lineTo(20, -2);
  ctx.stroke();
  ctx.fillStyle = "#e8eef2";
  ctx.beginPath();
  ctx.moveTo(23, -2);
  ctx.lineTo(19, -4);
  ctx.lineTo(19, 0);
  ctx.closePath();
  ctx.fill();
  // Drawing hand at the nock.
  ctx.fillStyle = "#a5854f";
  ctx.beginPath();
  ctx.arc(6, -2, 2, 0, PI2);
  ctx.fill();
  // Drifting motes (tan pollen/dust) — presentation only.
  rising(ctx, 0, 9, 20, 24, accent, A, 5);
}

function drawOgre(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // dust kicked up around the feet (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = "#a8a29e";
    for (let i = 0; i < 2; i++) {
      const life = (A.t * 0.35 + i * 1.3) % 1;
      ctx.globalAlpha = (1 - life) * 0.22;
      ctx.beginPath();
      ctx.arc(-12 + i * 24 + Math.sin(A.t + i) * 2, 23 - life * 4, 1.5 + life * 2.5, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // pear-shaped belly volume with a rim light
  const tg = ctx.createLinearGradient(0, -12, 0, 22);
  tg.addColorStop(0, light);
  tg.addColorStop(0.5, body);
  tg.addColorStop(1, dark);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-17, -4);
  ctx.quadraticCurveTo(-16, -12, 0, -12);
  ctx.quadraticCurveTo(16, -12, 17, -4);
  ctx.quadraticCurveTo(19, 10, 13, 21);
  ctx.lineTo(-13, 21);
  ctx.quadraticCurveTo(-19, 10, -17, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-16.4, -2);
  ctx.quadraticCurveTo(-17, 10, -12.5, 19.5);
  ctx.stroke();
  // belly highlight + navel
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = withShade(body, 18);
  ctx.beginPath();
  ctx.ellipse(0, 9, 9.5, 7.5, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 11, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rope belt with a bone charm
  ctx.strokeStyle = "#8a6a3f";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-16, 13.5);
  ctx.quadraticCurveTo(0, 15.5, 16, 13.5);
  ctx.stroke();
  ctx.fillStyle = "#8a6a3f";
  ctx.beginPath();
  ctx.arc(-6, 14.6, 1.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#e7e5e4";
  ctx.fillRect(-6.7, 15.4, 1.6, 3.6);
  // ragged loincloth
  ctx.fillStyle = "#4a3320";
  ctx.beginPath();
  ctx.moveTo(-8, 15);
  ctx.lineTo(8, 15);
  ctx.lineTo(6, 22);
  ctx.lineTo(3, 18.5);
  ctx.lineTo(0, 23);
  ctx.lineTo(-3, 18.5);
  ctx.lineTo(-6, 22);
  ctx.closePath();
  ctx.fill();
  // head with a heavy underbite jaw
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 11, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.beginPath();
  ctx.arc(0, -10, 11, 0.15 * Math.PI, 0.85 * Math.PI); // jaw shadow
  ctx.fill();
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.roundRect(-8.5, -6.5, 17, 7, 3);
  ctx.fill();
  // upturned jaw tusks
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(-7.5, -4);
  ctx.lineTo(-5.8, -11.5);
  ctx.lineTo(-4.2, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.2, -4);
  ctx.lineTo(5.8, -11.5);
  ctx.lineTo(7.5, -4);
  ctx.closePath();
  ctx.fill();
  // brow
  ctx.fillStyle = dark;
  ctx.fillRect(-9, -14.5, 18, 3);
  // eyes with a faint accent glint
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-5.5, -11, 3, 2.6);
  ctx.fillRect(2.5, -11, 3, 2.6);
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-4.5, -10.6, 1.2, 1.2);
  ctx.fillRect(3.5, -10.6, 1.2, 1.2);
  ctx.restore();
  // cheek scar
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, -17);
  ctx.lineTo(8.5, -9);
  ctx.stroke();
  // tapered club: grained wood, iron band, magma head
  ctx.fillStyle = "#6b4423";
  ctx.beginPath();
  ctx.moveTo(11.5, 17);
  ctx.lineTo(16, 17);
  ctx.lineTo(19.5, -3);
  ctx.lineTo(10.5, -3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(13, 14);
  ctx.lineTo(14.5, 2);
  ctx.moveTo(15.5, 10);
  ctx.lineTo(16.5, 3);
  ctx.stroke();
  ctx.fillStyle = "#7d7f85";
  ctx.fillRect(11, 3, 8, 3);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(11, 3, 8, 1);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(15, -9, 8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // dark crust cracks over the magma
  ctx.strokeStyle = "#3b2510";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(9, -11);
  ctx.lineTo(14, -9);
  ctx.lineTo(12, -5);
  ctx.moveTo(16, -15);
  ctx.lineTo(15.5, -10);
  ctx.lineTo(20, -8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(12.6, -11.5, 2.2, 0, PI2);
  ctx.fill();
  // embers venting off the club head
  rising(ctx, 15, 3, -5, 18, accent, A, 3);
}

// Generic hulking humanoid — used by the zombie shambler (rot palette) and as
// the fallback body for any unit without its own draw routine.
function drawBrute(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  metalBody(ctx, 22, 24, -2, body, dark, light, 5);
  ctx.fillStyle = dark;
  ctx.fillRect(-11, 12, 22, 8);
  // war-paint stripe
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(-11, 4, 22, 2);
  ctx.globalAlpha = 1;
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // tusks
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-4, -4, 2, 4);
  ctx.fillRect(2, -4, 2, 4);
  // eyes with a faint accent glint
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -12, 2, 2);
  ctx.fillRect(2, -12, 2, 2);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-4, -12, 1, 1);
  ctx.fillRect(2, -12, 1, 1);
  ctx.globalAlpha = 1;
  // big two-handed axe in the right hand
  drawBigAxe(ctx, 12, -2, 1);
}

// ---- zombie shambler -------------------------------------------------------
// Two body variants picked per-unit via variantOf(uid) so Depths hordes read
// as a mob, not clones: 0 = hunched reacher in rags, 1 = stitched gut-buster.
// Both share the zombie head (slack jaw, empty socket, milky eye, skull crack)
// and one arm per side. User-approved from canvas mockups.

/** A drooping zombie arm from shoulder (sx,sy) to hand (ex,ey), with fingers. */
function zombieArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, col: string) {
  ctx.strokeStyle = col;
  ctx.lineWidth = 4.2;
  ctx.lineCap = "round";
  const mx = (sx + ex) / 2 + (ex > sx ? 1.5 : -1.5);
  const my = (sy + ey) / 2 - 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  const d = ex > sx ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + d * 2.6, ey + 0.8 + i * 1.3);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/** Zombie head: tilted, slack hanging jaw with teeth, one empty socket, one
 *  milky eye, sunken brow, and a skull crack. */
function zombieHead(
  ctx: Ctx,
  body: string,
  light: string,
  accent: string,
  hx: number,
  hy: number,
  tilt: number,
  r: number
) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // sunken brow
  ctx.fillStyle = withShade(body, -30);
  ctx.fillRect(-r * 0.66, -r * 0.5, r * 1.32, 1.8);
  // gaping mouth void + teeth
  ctx.fillStyle = "#1c1713";
  ctx.fillRect(-1, r * 0.28, r * 0.8 + 1, r * 0.42);
  ctx.fillStyle = accent;
  for (let i = 0; i < 3; i++) ctx.fillRect(-0.5 + i * 2.1, r * 0.28, 1.1, 1.3);
  // slack lower jaw hanging off
  ctx.fillStyle = withShade(body, -8);
  ctx.beginPath();
  ctx.roundRect(-1.5, r * 0.72, r * 0.9 + 2, 2.6, 1.2);
  ctx.fill();
  // left: empty socket; right: milky eye
  ctx.fillStyle = "#161311";
  ctx.fillRect(-r * 0.5, -r * 0.28, 2.6, 2.6);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 0.1, 1.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 0.1, 0.5, 0, PI2);
  ctx.fill();
  // skull crack
  ctx.strokeStyle = withShade(body, -38);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r);
  ctx.lineTo(-r * 0.05, -r * 0.6);
  ctx.lineTo(-r * 0.35, -r * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** Short stitch seam at (x,y), rotated by ang, with n cross-bars. */
function zombieStitches(ctx: Ctx, x: number, y: number, ang: number, n: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = "#3c332a";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(n * 2.4, 0);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(1.2 + i * 2.4, -1.4);
    ctx.lineTo(1.2 + i * 2.4, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZombieShambler(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  variant: 0 | 1
) {
  if (variant === 0) {
    // hunched reacher: rags, ribs through a tear, one arm limp / one reaching
    ctx.save();
    ctx.rotate(0.07); // whole-body forward slump
    zombieArm(ctx, -9, 0, -14, 10, withShade(body, -12)); // limp arm at its side
    metalBody(ctx, 20, 22, -2, body, dark, light, 5);
    // tattered shirt with a zigzag hem
    ctx.fillStyle = withShade(body, -28);
    ctx.beginPath();
    ctx.moveTo(-10, 1);
    ctx.lineTo(10, 1);
    ctx.lineTo(10, 8);
    ctx.lineTo(7, 13);
    ctx.lineTo(5, 9);
    ctx.lineTo(2, 13.5);
    ctx.lineTo(-1, 9.5);
    ctx.lineTo(-4, 14);
    ctx.lineTo(-7, 9.5);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    // torn shoulder hole showing skin
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(-8, 1.5);
    ctx.lineTo(-4.5, 1.5);
    ctx.lineTo(-6.5, 4.5);
    ctx.closePath();
    ctx.fill();
    // torn trousers
    ctx.fillStyle = dark;
    ctx.fillRect(-10, 14, 20, 7);
    // ribs peeking through a side tear
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-6, 4 + i * 2.6, 3, -0.5, 0.9);
      ctx.stroke();
    }
    zombieStitches(ctx, 1, 6, 0.4, 3);
    zombieHead(ctx, body, light, accent, 3.5, -11, 0.14, 8);
    zombieArm(ctx, 9, -1, 16, 5, light); // reaching arm, dropped to mid height
    ctx.restore();
  } else {
    // gut-buster: swollen stitched belly, small sunken head, knuckle-draggers
    ctx.save();
    ctx.rotate(0.05);
    zombieArm(ctx, -9, -1, -15, 13, withShade(body, -12));
    metalBody(ctx, 22, 22, -2, body, dark, light, 6);
    // swollen belly
    const bg = ctx.createLinearGradient(0, 2, 0, 18);
    bg.addColorStop(0, light);
    bg.addColorStop(1, withShade(body, -25));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0.5, 10, 11, 8.5, 0, 0, PI2);
    ctx.fill();
    // stitched scar across it
    ctx.strokeStyle = "#3c332a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.quadraticCurveTo(0, 11, 9, 8.5);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = -8 + t * 17;
      const y = 7 + Math.sin(t * Math.PI) * 3.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 1.7);
      ctx.lineTo(x + 0.8, y + 1.7);
      ctx.stroke();
    }
    // rot blotches
    ctx.fillStyle = withShade(body, -20);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(-5, 12.5, 2.4, 1.7, 0.4, 0, PI2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, 13, 1.8, 1.3, -0.3, 0, PI2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // maggot hole
    ctx.fillStyle = "#241d16";
    ctx.beginPath();
    ctx.arc(2.5, 12.6, 1.2, 0, PI2);
    ctx.fill();
    zombieHead(ctx, body, light, accent, 3.5, -12, 0.1, 6.8);
    zombieArm(ctx, 10, -1, 16, 12, light);
    ctx.restore();
  }
}

// Orc — a bare-chested warband champion: carved abs, spiked iron pauldrons,
// a fang necklace, and pointed ears. Big axe stays in the right hand.
function drawOrc(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // bare muscled torso
  metalBody(ctx, 24, 24, -2, body, dark, light, 6);
  // pec + ab definition carved into the gradient
  ctx.strokeStyle = withShade(body, -38);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.quadraticCurveTo(0, 5, 8, 2); // pec line
  ctx.moveTo(0, 4);
  ctx.lineTo(0, 14); // center channel
  ctx.moveTo(-5, 7);
  ctx.quadraticCurveTo(0, 8.5, 5, 7); // ab rows
  ctx.moveTo(-5, 11);
  ctx.quadraticCurveTo(0, 12.5, 5, 11);
  ctx.stroke();
  // embossed highlight just under each ab crease
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4.5, 8.2);
  ctx.quadraticCurveTo(0, 9.7, 4.5, 8.2);
  ctx.moveTo(-4.5, 12.2);
  ctx.quadraticCurveTo(0, 13.7, 4.5, 12.2);
  ctx.stroke();
  // war-paint slash across the chest
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.save();
  ctx.rotate(-0.18);
  ctx.fillRect(-11, 0, 22, 2.4);
  ctx.restore();
  ctx.globalAlpha = 1;
  // hide belt with a fang buckle
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 15, 24, 7);
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(-1.8, 16);
  ctx.lineTo(1.8, 16);
  ctx.lineTo(0, 20.5);
  ctx.closePath();
  ctx.fill();
  // pointed ears poking out past the jaw
  for (const side of [-1, 1] as const) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(side * 7, -13);
    ctx.lineTo(side * 15, -17);
    ctx.lineTo(side * 8, -8);
    ctx.closePath();
    ctx.fill();
    // inner-ear shade
    ctx.fillStyle = withShade(body, -20);
    ctx.beginPath();
    ctx.moveTo(side * 8.5, -12.5);
    ctx.lineTo(side * 13, -15.5);
    ctx.lineTo(side * 8.8, -9.5);
    ctx.closePath();
    ctx.fill();
  }
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // heavy brow shadow
  ctx.fillStyle = withShade(body, -30);
  ctx.fillRect(-6, -14.5, 12, 2);
  // tusks jutting up from the underbite
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-4.5, -4.5, 2.4, 5);
  ctx.fillRect(2.1, -4.5, 2.4, 5);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(-4.5, -4.5, 1, 1.6);
  ctx.fillRect(2.1, -4.5, 1, 1.6);
  // eyes with a faint accent glint
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -12, 2, 2);
  ctx.fillRect(2, -12, 2, 2);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-4, -12, 1, 1);
  ctx.fillRect(2, -12, 1, 1);
  ctx.globalAlpha = 1;
  // fang necklace on a leather cord
  ctx.strokeStyle = "#3a2a18";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.quadraticCurveTo(0, 4, 9, -2);
  ctx.stroke();
  for (const [fx, fy, fs] of [
    [-6, -0.6, 2.6],
    [-3, 0.8, 3.2],
    [0, 1.4, 3.8],
    [3, 0.8, 3.2],
    [6, -0.6, 2.6],
  ] as const) {
    ctx.fillStyle = "#f3f3e0";
    ctx.beginPath();
    ctx.moveTo(fx - 1.4, fy);
    ctx.lineTo(fx + 1.4, fy);
    ctx.lineTo(fx, fy + fs);
    ctx.closePath();
    ctx.fill();
  }
  // spiked iron pauldrons capping both shoulders
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 12, -4);
    ctx.scale(side, 1);
    // bone spike jutting up and out
    ctx.fillStyle = "#e8e6d4";
    ctx.beginPath();
    ctx.moveTo(1, -4);
    ctx.lineTo(7, -11);
    ctx.lineTo(4.5, -3);
    ctx.closePath();
    ctx.fill();
    // dome plate with an iron gradient
    const pg = ctx.createLinearGradient(0, -6, 0, 5);
    pg.addColorStop(0, "#82868f");
    pg.addColorStop(1, "#474a52");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 1, 7.5, Math.PI, 0);
    ctx.quadraticCurveTo(7.5, 4.5, 5, 5);
    ctx.lineTo(-5, 5);
    ctx.quadraticCurveTo(-7.5, 4.5, -7.5, 1);
    ctx.closePath();
    ctx.fill();
    // rim + rivets
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 1, 6.8, -Math.PI, -Math.PI * 0.25);
    ctx.stroke();
    ctx.fillStyle = "#2e3036";
    for (const rx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.arc(rx, 2.2, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // double-bit war axe held two-handed at a diagonal ready
  drawOrcWarAxe(ctx, body, light, accent);
}

/** The orc's double-bit battle axe: crude jagged iron bits flanking a socket
 *  with a forward pike, a leather-wrapped haft with a bone butt-spike, and
 *  both fists on the grip. Drawn at a diagonal two-handed carry. */
function drawOrcWarAxe(ctx: Ctx, body: string, light: string, accent: string) {
  ctx.save();
  ctx.translate(0, 3.5);
  ctx.rotate(-0.35);
  // rough dark haft
  ctx.strokeStyle = "#463020";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-17, 0);
  ctx.lineTo(16, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-16, -1);
  ctx.lineTo(11, -1);
  ctx.stroke();
  ctx.lineCap = "butt";
  // leather grip wraps
  ctx.fillStyle = "#2c1f13";
  ctx.fillRect(-10, -2.1, 4.4, 4.2);
  ctx.fillRect(2.6, -2.1, 4.4, 4.2);
  // bone butt-spike
  ctx.fillStyle = "#e8e6d4";
  ctx.beginPath();
  ctx.moveTo(-17, -1.7);
  ctx.lineTo(-21.5, 0);
  ctx.lineTo(-17, 1.7);
  ctx.closePath();
  ctx.fill();
  // two mirrored bits flaring off the head
  for (const s of [-1, 1] as const) {
    ctx.save();
    ctx.scale(1, s);
    const g = ctx.createLinearGradient(11, -12, 21, -2);
    g.addColorStop(0, "#7d828c");
    g.addColorStop(1, "#464a52");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(14.2, -2);
    ctx.bezierCurveTo(12.5, -4.5, 11.5, -6.5, 11, -9); // concave throat toward the haft
    ctx.lineTo(13.5, -8); // jagged, chipped cutting edge
    ctx.lineTo(15.5, -11);
    ctx.lineTo(18, -8.6);
    ctx.lineTo(20.5, -10.5);
    ctx.bezierCurveTo(21.5, -6.5, 21, -4, 19.5, -2);
    ctx.closePath();
    ctx.fill();
    // chipped-edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, -9);
    ctx.lineTo(13.5, -8);
    ctx.lineTo(15.5, -11);
    ctx.lineTo(18, -8.6);
    ctx.lineTo(20.5, -10.5);
    ctx.stroke();
    ctx.restore();
  }
  // iron socket band over the haft between the bits
  ctx.fillStyle = "#33363c";
  ctx.fillRect(13.6, -2.6, 6.6, 5.2);
  ctx.fillStyle = "#2e3036";
  ctx.beginPath();
  ctx.arc(16.9, 0, 1, 0, PI2);
  ctx.fill();
  // forward pike between the bits
  ctx.fillStyle = "#7d828c";
  ctx.beginPath();
  ctx.moveTo(20.2, -1.6);
  ctx.lineTo(26, 0);
  ctx.lineTo(20.2, 1.6);
  ctx.closePath();
  ctx.fill();
  // war-paint slashes on the upper bit cheek
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(14, -7.5);
  ctx.lineTo(17.5, -3.5);
  ctx.moveTo(16.5, -8);
  ctx.lineTo(19, -5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // both fists gripping the wraps
  for (const hx of [-7.8, 4.8]) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(hx, 0, 2.7, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = withShade(body, -25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, 0, 2.7, 0, PI2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 2, -0.8);
    ctx.lineTo(hx + 2, -0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArcher(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // quiver slung behind
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.roundRect(-9, -8, 5, 16, 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, -9);
  ctx.lineTo(-6, -14);
  ctx.moveTo(-6, -9);
  ctx.lineTo(-4, -14);
  ctx.stroke();
  metalBody(ctx, 16, 22, -2, body, dark, light, 5);
  // face
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 6, 0, PI2);
  ctx.fill();
  // hood dome
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -13, 8, Math.PI, 0);
  ctx.fill();
  // face recess shadow
  ctx.fillStyle = "#0e0e10";
  ctx.beginPath();
  ctx.ellipse(0, -11, 3.6, 3, 0, 0, PI2);
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.fillRect(-2.6, -11.5, 1.6, 1.4);
  ctx.fillRect(1, -11.5, 1.6, 1.4);
  ctx.restore();
  // bow with a gradient limb
  const bg = ctx.createLinearGradient(6, -16, 6, 12);
  bg.addColorStop(0, withShade(accent, 30));
  bg.addColorStop(1, accent);
  ctx.strokeStyle = bg;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(10, -2, 14, -Math.PI / 2.4, Math.PI / 2.4);
  ctx.stroke();
  // string
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(15, -12);
  ctx.lineTo(15, 8);
  ctx.stroke();
  // nocked arrow
  ctx.strokeStyle = "#d8c9a8";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(3, -2);
  ctx.lineTo(15, -2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(15, -2);
  ctx.lineTo(12, -3.6);
  ctx.lineTo(12, -0.4);
  ctx.closePath();
  ctx.fill();
}

// Ranger — no longer shares the Archer's sprite. A caped volley-ranger in a
// feathered cap whose multishot is the signature: three arrows fanned from the
// nock with glinting tips.
function drawRanger(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // swaying cape behind
  const sway = Math.sin(A.t * 1.6) * 1.5;
  ctx.fillStyle = withShade(body, -25);
  ctx.beginPath();
  ctx.moveTo(-2, -10);
  ctx.quadraticCurveTo(-12, -3, -10 + sway, 17);
  ctx.lineTo(-4 + sway * 0.5, 15);
  ctx.quadraticCurveTo(-7, 0, -1, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9.6 + sway, 16);
  ctx.lineTo(-4.4 + sway * 0.5, 14.4);
  ctx.stroke();
  // hip quiver, angled, stuffed with arrows
  ctx.save();
  ctx.translate(-7, 9);
  ctx.rotate(0.5);
  ctx.fillStyle = withShade(body, -35);
  ctx.beginPath();
  ctx.roundRect(-2.5, -6, 5, 12, 2);
  ctx.fill();
  ctx.strokeStyle = "#d8c9a8";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1.5, -6);
  ctx.lineTo(-1.5, -9);
  ctx.moveTo(0, -6);
  ctx.lineTo(0, -9.6);
  ctx.moveTo(1.5, -6);
  ctx.lineTo(1.5, -8.8);
  ctx.stroke();
  ctx.restore();
  metalBody(ctx, 15, 20, -2, body, dark, light, 4.5);
  // scarf with a trailing end
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.quadraticCurveTo(0, -4, 6, -6);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(5, -5.5);
  ctx.quadraticCurveTo(7.5, -2, 7, 1);
  ctx.stroke();
  // face with an accent glint in the eyes
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 5.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-2.6, -12.5, 1.7, 1.5);
  ctx.fillRect(1, -12.5, 1.7, 1.5);
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-2.2, -12.2, 0.8, 0.8);
  ctx.fillRect(1.4, -12.2, 0.8, 0.8);
  ctx.restore();
  // cap (reads different from the Archer/Hunter hoods)
  ctx.fillStyle = withShade(body, -40);
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.quadraticCurveTo(0, -19.5, 6, -14);
  ctx.lineTo(5, -12.2);
  ctx.quadraticCurveTo(0, -16, -5, -12.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-5.4, -13.8);
  ctx.quadraticCurveTo(0, -18.6, 5.4, -13.8);
  ctx.stroke();
  // short flat bow with a gradient limb
  const bg = ctx.createLinearGradient(6, -14, 6, 10);
  bg.addColorStop(0, withShade(accent, 30));
  bg.addColorStop(1, accent);
  ctx.strokeStyle = bg;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(9, -2, 12, -Math.PI / 2.6, Math.PI / 2.6);
  ctx.stroke();
  // string drawn to the nock
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12.9, -11.2);
  ctx.lineTo(4, -2);
  ctx.lineTo(12.9, 7.2);
  ctx.stroke();
  // multishot: three arrows fanned from the nock
  ctx.strokeStyle = "#d8c9a8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(16, -2);
  ctx.moveTo(4, -2);
  ctx.lineTo(15, -8);
  ctx.moveTo(4, -2);
  ctx.lineTo(15, 4);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(17.4, -2);
  ctx.lineTo(14.4, -3.5);
  ctx.lineTo(14.4, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16.4, -8.8);
  ctx.lineTo(13.2, -9.2);
  ctx.lineTo(14.6, -6.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16.4, 4.8);
  ctx.lineTo(14.6, 2.4);
  ctx.lineTo(13.2, 5.2);
  ctx.closePath();
  ctx.fill();
  // tip glints + drifting feather motes (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 3 + A.glow * 4;
    ctx.globalAlpha = 0.4 + A.glow * 0.5;
    for (const [px, py] of [[17, -2], [15.8, -8.4], [15.8, 4.4]]) {
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#f5f0e1";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const seed = i * 2.2;
      const life = (A.t * 0.3 + seed * 0.37) % 1;
      const x = -15 + i * 5 + Math.sin(A.t * 1.2 + seed) * 2.5;
      const y = -16 + life * 30;
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - 1.5, y);
      ctx.quadraticCurveTo(x, y - 1.4, x + 1.5, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

interface KnightLivery {
  plume: string;
  plumeDark: string;
  cape: string;
  shield: string;
  shieldDark: string;
  trim: string;
  gem: string;
}

// The Knight wears gold-and-royal-blue heraldry (the design mockup); the Holy
// Knight a white-and-gold paladin livery. Same body, per-unit colours.
const KNIGHT_LIVERY: KnightLivery = {
  plume: "#e8c15a",
  plumeDark: "#b8922f",
  cape: "#2b3f63",
  shield: "#3f6bb0",
  shieldDark: "#284a80",
  trim: "#e8c15a",
  gem: "#e8c15a",
};
const HOLY_LIVERY: KnightLivery = {
  plume: "#fff4c2",
  plumeDark: "#d9b74a",
  cape: "#6e5417",
  shield: "#f3f5f2",
  shieldDark: "#cdd2cf",
  trim: "#c9a227",
  gem: "#fff4c2",
};

function drawKnight(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  livery: KnightLivery
) {
  // cape peeking behind the shoulders (sways idly)
  ctx.fillStyle = livery.cape;
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(6, -8);
  ctx.lineTo(10 + Math.sin(A.t * 2) * 1.4, 20);
  ctx.lineTo(-10, 20);
  ctx.closePath();
  ctx.fill();
  // body — metallic volume
  metalBody(ctx, 22, 24, -4, body, dark, light, 6);
  // plate seams
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, 5);
  ctx.lineTo(10, 5);
  ctx.moveTo(-10, 11);
  ctx.lineTo(10, 11);
  ctx.stroke();
  // pauldrons (both shoulders)
  for (const x of [-11, 11]) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, -1, 6.5, 5.5, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(x, -2.5, 5.3, 4.4, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = livery.trim;
    ctx.fillRect(x - 0.8, -6, 1.6, 2);
  }
  // helm with a T-visor
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#15181d";
  ctx.fillRect(-5, -14, 10, 3);
  ctx.fillRect(-1.5, -14, 3, 7);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-2, -13, 6, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  // crest plume, arcing back
  ctx.fillStyle = livery.plume;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-2, -31, -12, -31 + Math.sin(A.t * 3) * 1.5);
  ctx.quadraticCurveTo(-6, -24, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = livery.plumeDark;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-3, -27, -9, -28);
  ctx.quadraticCurveTo(-5, -23, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = livery.plume;
  ctx.beginPath();
  ctx.arc(0, -19, 2, 0, PI2);
  ctx.fill();
  // heater shield (left) with a glowing cross crest
  ctx.save();
  ctx.translate(-14, 1);
  const sf = ctx.createLinearGradient(0, -9, 0, 16);
  sf.addColorStop(0, livery.shield);
  sf.addColorStop(1, livery.shieldDark);
  ctx.fillStyle = sf;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 4);
  ctx.quadraticCurveTo(6, 12, 0, 16);
  ctx.quadraticCurveTo(-6, 12, -6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = livery.trim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 4);
  ctx.quadraticCurveTo(6, 12, 0, 16);
  ctx.quadraticCurveTo(-6, 12, -6, 4);
  ctx.closePath();
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = livery.trim;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillStyle = livery.trim;
  ctx.fillRect(-1, -6, 2, 14);
  ctx.fillRect(-4, -2, 8, 2);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-2.5, -5, 1.4, 2.6, -0.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // sword (right hand) with a traveling gleam
  ctx.save();
  ctx.translate(13, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.6, 2, 3.2, 9);
  ctx.fillStyle = livery.gem;
  ctx.beginPath();
  ctx.arc(0, 12, 2.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(livery.gem, 35);
  ctx.beginPath();
  ctx.arc(-0.6, 11.4, 0.9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = livery.trim;
  ctx.beginPath();
  ctx.roundRect(-6, -0.5, 12, 2.5, 1.2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-6, 0.7, 1.4, 0, PI2);
  ctx.arc(6, 0.7, 1.4, 0, PI2);
  ctx.fill();
  const bl = ctx.createLinearGradient(-3, 0, 3, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-2.8, 0);
  ctx.lineTo(2.8, 0);
  ctx.lineTo(0, -24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(70,80,95,0.5)";
  ctx.fillRect(-0.5, -20, 1, 18);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-2.8, 0);
  ctx.lineTo(2.8, 0);
  ctx.lineTo(0, -24);
  ctx.closePath();
  ctx.clip();
  const gy = A.live ? -1 - ((A.t * 26) % 24) : -12;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(0, gy, 3, 2.6, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawWarrior(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // broad-shouldered fighter hefting a two-handed claymore
  metalBody(ctx, 24, 26, -2, body, dark, light, 6);
  // waist belt
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 12, 24, 5);
  // chest strap
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -2);
  ctx.lineTo(8, 12);
  ctx.stroke();
  // pauldrons
  for (const x of [-12, 12]) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, -2, 6, 5, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(x, -3.5, 5, 4, 0, 0, PI2);
    ctx.fill();
  }
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor slit
  // crest plume (accent), swaying
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.quadraticCurveTo(0, -30, 4 + Math.sin(A.t * 3) * 1.2, -30);
  ctx.quadraticCurveTo(1, -24, 2, -18);
  ctx.closePath();
  ctx.fill();
  // two-handed claymore, held across the body and tilted up (flips with facing)
  ctx.save();
  ctx.translate(6, 2);
  ctx.rotate(-0.35);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.6, 4, 3.2, 15);
  ctx.fillStyle = withShade(accent, -10);
  ctx.fillRect(-2.4, 18, 4.8, 2.4); // pommel
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(-8, 2, 16, 3); // crossguard
  const bl = ctx.createLinearGradient(-3.5, 0, 3.5, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-3.5, 2);
  ctx.lineTo(3.5, 2);
  ctx.lineTo(0, -32);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-3.5, 2);
  ctx.lineTo(3.5, 2);
  ctx.lineTo(0, -32);
  ctx.closePath();
  ctx.clip();
  const gy = A.live ? 2 - ((A.t * 34) % 34) : -14;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, gy, 3.4, 3, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawAegisKnight(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  metalBody(ctx, 22, 26, -2, body, dark, light, 6);
  // armor seam
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, 18);
  ctx.stroke();
  // right pauldron (left arm carries the tower shield)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(11, -2, 6, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(11, -3.5, 5, 4, 0, 0, PI2);
  ctx.fill();
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor
  // plume
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-2, -30, -10, -30 + Math.sin(A.t * 3) * 1.3);
  ctx.quadraticCurveTo(-5, -24, -1, -18);
  ctx.closePath();
  ctx.fill();
  // big runic tower shield (left)
  const sf = ctx.createLinearGradient(-20, 0, -7, 0);
  sf.addColorStop(0, withShade(body, -40));
  sf.addColorStop(1, dark);
  ctx.fillStyle = sf;
  ctx.beginPath();
  ctx.roundRect(-20, -13, 13, 31, 4);
  ctx.fill();
  ctx.strokeStyle = withShade(accent, -10);
  ctx.lineWidth = 1;
  ctx.strokeRect(-19.5, -12.5, 12, 30);
  // glowing rune (pulses with the shield's charge)
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 7;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-13.5, -8);
  ctx.lineTo(-13.5, 13); // vertical bar
  ctx.moveTo(-17, 2);
  ctx.lineTo(-10, 2); // crossbar
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13.5, -5);
  ctx.lineTo(-10.5, -1);
  ctx.lineTo(-13.5, 3);
  ctx.lineTo(-16.5, -1);
  ctx.closePath();
  ctx.stroke(); // diamond rune
  ctx.restore();
  // sword (right hand)
  ctx.save();
  ctx.translate(12, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.5, 2, 3, 8);
  ctx.fillStyle = withShade(accent, -15);
  ctx.fillRect(-5, 0, 10, 2.5);
  const bl = ctx.createLinearGradient(-2.5, 0, 2.5, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(0, -20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

type MageElement = "fire" | "ice" | "arcane" | "electric" | "plain";

function drawMage(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  element: MageElement
) {
  const t = A.t;
  const core =
    element === "ice"
      ? "#eaf6ff"
      : element === "electric"
      ? "#fff7cc"
      : element === "arcane"
      ? "#f3e8ff"
      : element === "fire"
      ? "#fff3d0"
      : "#ffffff";

  // ground glow beneath the caster (skipped for the plain mage)
  if (element !== "plain") {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const gg = ctx.createRadialGradient(0, 22, 2, 0, 22, 18);
    gg.addColorStop(0, accent);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(0, 22, 16, 5, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  // robe with a vertical gradient; fire/ice get a jagged hem
  const hemGlow =
    element === "fire" ? "#e0561b" : element === "ice" ? withShade(body, 40) : withShade(body, -10);
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, withShade(body, -12));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, hemGlow);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(14, 20);
  if (element === "fire") {
    const hem: [number, number][] = [
      [10, 15], [7, 20], [4, 15], [1, 21], [-2, 15], [-5, 20], [-8, 15], [-11, 20], [-14, 20],
    ];
    for (const [hx, hy] of hem) ctx.lineTo(hx, hy + Math.sin(t * 6 + hx) * 0.6);
  } else if (element === "ice") {
    const hem: [number, number][] = [
      [10, 16], [8, 20], [5, 15], [2, 20], [-1, 15], [-4, 20], [-7, 15], [-10, 20], [-14, 20],
    ];
    for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  } else {
    ctx.lineTo(-14, 20);
  }
  ctx.closePath();
  ctx.fill();
  // inner fold shadow
  ctx.fillStyle = withShade(body, -40);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.fill();
  // glowing rune band
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(i * 4, 8, 1, 0, PI2);
    ctx.stroke();
  }
  ctx.restore();
  // collar
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.lineTo(7, -6);
  ctx.lineTo(5, -1);
  ctx.lineTo(-5, -1);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = withShade(light, -15);
  ctx.beginPath();
  ctx.arc(0, -14, 5.5, 0, PI2);
  ctx.fill();
  // wide-brim pointed hat with a bent tip + gem
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -16, 10, 3, 0, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -16);
  ctx.quadraticCurveTo(-2, -28, -7, -32 + Math.sin(t * 2.4) * 1.4);
  ctx.quadraticCurveTo(0, -26, 8, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.fillRect(-8, -18, 16, 2.2); // band
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, -16.9, 1.8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // glowing eyes in the brim shadow
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillStyle = core;
  ctx.fillRect(-3, -13, 2, 2);
  ctx.fillRect(1, -13, 2, 2);
  ctx.restore();
  // staff
  ctx.strokeStyle = "#4a3320";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(12, 18);
  ctx.lineTo(12, -2);
  ctx.stroke();
  ctx.lineCap = "butt";
  // elemental head on the staff
  const or = (5 + A.cast * 2) * (0.9 + 0.12 * Math.sin(t * 8));
  orb(ctx, 12, -6, or, accent, A.glow + A.cast, core);
  if (element === "fire") {
    ctx.fillStyle = "#f0731f";
    for (let k = 0; k < 5; k++) {
      const an = t * 4 + k * 1.256;
      const fl = or * (1 + 0.35 * Math.abs(Math.sin(t * 7 + k)));
      ctx.beginPath();
      ctx.moveTo(12 + Math.cos(an) * or * 0.5, -6 + Math.sin(an) * or * 0.5);
      ctx.lineTo(12 + Math.cos(an - 0.2) * fl, -6 + Math.sin(an - 0.2) * fl);
      ctx.lineTo(12 + Math.cos(an + 0.2) * fl, -6 + Math.sin(an + 0.2) * fl);
      ctx.closePath();
      ctx.fill();
    }
    rising(ctx, 12, 3, -8, 20, accent, A, 5);
  } else if (element === "ice") {
    ctx.strokeStyle = core;
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const an = k * (PI2 / 6) + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(12 + Math.cos(an) * or, -6 + Math.sin(an) * or);
      ctx.lineTo(12 + Math.cos(an) * (or + 3), -6 + Math.sin(an) * (or + 3));
      ctx.stroke();
    }
  } else if (element === "electric") {
    ctx.save();
    ctx.strokeStyle = core;
    ctx.lineWidth = 1;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    for (let k = 0; k < 3; k++) {
      const a0 = t * 6 + k * 2.1;
      ctx.beginPath();
      ctx.moveTo(12, -6);
      for (let s = 1; s <= 3; s++) {
        const rr = (or * s) / 3 + 2;
        const aa = a0 + s * 0.9;
        ctx.lineTo(12 + Math.cos(aa) * rr, -6 + Math.sin(aa) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (element === "arcane") {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    for (let k = 0; k < 3; k++) {
      const an = t * 2 + k * (PI2 / 3);
      ctx.beginPath();
      ctx.arc(12 + Math.cos(an) * (or + 3), -6 + Math.sin(an) * (or + 3), 1.3, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// A harmless sheep — drawn in place of any polymorphed unit.
function drawSheep(ctx: Ctx) {
  // Woolly white body with bumpy fleece.
  ctx.fillStyle = "#eceae3";
  ctx.beginPath();
  ctx.ellipse(-2, 8, 15, 11, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  for (const [bx, by] of [
    [-12, 2],
    [-4, -3],
    [5, -2],
    [-8, 12],
    [3, 12],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, PI2);
    ctx.fill();
  }
  // Dark face + ears.
  ctx.fillStyle = "#3a3530";
  ctx.beginPath();
  ctx.ellipse(11, 2, 6, 7, 0, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -4, 3, 2, -0.5, 0, PI2);
  ctx.fill();
  // Eye.
  ctx.fillStyle = "#fff";
  ctx.fillRect(12, 0, 2, 2);
  // Stick legs.
  ctx.fillStyle = "#2a2622";
  ctx.fillRect(-9, 17, 3, 7);
  ctx.fillRect(5, 17, 3, 7);
}

function drawAssassin(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // shadow-smoke wisps at the feet (Vanish/stealth flavour) — motion only
  if (A.live) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const seed = i * 1.9;
      const life = (t * 0.5 + seed) % 1;
      const wx = (i - 1.5) * 5 + Math.sin(t * 1.2 + seed) * 3;
      const wy = 18 - life * 16;
      ctx.globalAlpha = (1 - life) * 0.28;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(wx, wy, 3 + life * 3, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  const sway = A.live ? Math.sin(t * 2) * 2 : 0;
  // flowing tattered cape behind the body
  ctx.fillStyle = withShade(body, -26);
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(5, -8);
  ctx.quadraticCurveTo(11 + sway, 4, 8 + sway, 20);
  ctx.lineTo(5, 15);
  ctx.lineTo(3, 20);
  ctx.lineTo(0, 15);
  ctx.lineTo(-3, 20);
  ctx.lineTo(-6, 15);
  ctx.lineTo(-8 - sway, 20);
  ctx.quadraticCurveTo(-11 - sway, 6, -5, -8);
  ctx.closePath();
  ctx.fill();
  // slim body with a subtle gradient
  const bg = ctx.createLinearGradient(-7, 0, 7, 0);
  bg.addColorStop(0, dark);
  bg.addColorStop(0.5, body);
  bg.addColorStop(1, withShade(body, -14));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-7, -4, 14, 22, 5);
  ctx.fill();
  // chest sash
  ctx.strokeStyle = withShade(body, -36);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(6, 8);
  ctx.stroke();
  // belt + pouch
  ctx.fillStyle = "#20161a";
  ctx.fillRect(-7, 10, 14, 3);
  ctx.fillStyle = withShade(body, -28);
  ctx.fillRect(3, 11, 4, 4);
  // forearm wraps
  ctx.strokeStyle = withShade(body, 22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-3, 4);
  ctx.moveTo(-6, 7);
  ctx.lineTo(-3, 7);
  ctx.stroke();
  // deep hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-9, -16, 0, -19);
  ctx.quadraticCurveTo(9, -16, 8, -4);
  ctx.quadraticCurveTo(0, -8, -8, -4);
  ctx.closePath();
  ctx.fill();
  // face shadow
  ctx.fillStyle = "#0d0912";
  ctx.beginPath();
  ctx.ellipse(0, -9, 4.5, 5, 0, 0, PI2);
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 5;
  ctx.beginPath();
  ctx.ellipse(-2.2, -9, 1.1, 1.5, 0.2, 0, PI2);
  ctx.ellipse(2.2, -9, 1.1, 1.5, -0.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // hood rim light
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-9, -16, 0, -19);
  ctx.stroke();
  // twin daggers — one in each hand, held blade-out
  drawDagger(ctx, 9, 6, 1, accent, A);
  drawDagger(ctx, -9, 6, -1, accent, A);
}

/** A small dagger at (hx,hy), pointing up-and-outward by `side` (1 right, -1
 *  left). Blade carries an accent (poison/shadow) sheen and drips while live. */
function drawDagger(ctx: Ctx, hx: number, hy: number, side: number, accent: string, A: SpriteAnim) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(side * -0.5); // angle the blade outward
  // handle
  ctx.fillStyle = "#2a1d12";
  ctx.fillRect(-1.5, 0, 3, 7);
  // crossguard
  ctx.fillStyle = "#6b532e";
  ctx.fillRect(-4, -1, 8, 2.5);
  // blade with an accent sheen
  const g = ctx.createLinearGradient(0, -1, 0, -15);
  g.addColorStop(0, "#cfd3da");
  g.addColorStop(1, accent);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-2.6, -1);
  ctx.lineTo(2.6, -1);
  ctx.lineTo(0.4, -15);
  ctx.lineTo(-0.4, -15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // edge highlight
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-1.5, -2);
  ctx.lineTo(-0.2, -13);
  ctx.stroke();
  // venom drip
  if (A.live) {
    const drip = (A.t * 0.8 + (side > 0 ? 0 : 0.5)) % 1;
    ctx.globalAlpha = 1 - drip;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -14 + drip * 12, 1.1 * (1 - drip) + 0.4, 0, PI2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A chunky two-handed-style axe at (hx,hy): wooden haft + big steel bit.
 *  `side` mirrors it (1 = bit faces right, -1 = left). */
function drawBigAxe(ctx: Ctx, hx: number, hy: number, side: number) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  // wooden haft
  ctx.strokeStyle = "#5a3a1f";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.lineTo(2, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1.5, -13);
  ctx.lineTo(1.5, 16);
  ctx.stroke();
  ctx.lineCap = "butt";
  // big steel bit — a crescent blade with a gradient
  const g = ctx.createLinearGradient(0, -17, 12, -6);
  g.addColorStop(0, "#e9edf2");
  g.addColorStop(1, "#9aa0a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.bezierCurveTo(14, -17, 17, -10, 15, -6);
  ctx.bezierCurveTo(17, -2, 12, 2, -1, 1);
  ctx.closePath();
  ctx.fill();
  // darker steel near the haft (the poll/eye)
  ctx.fillStyle = "#8a9099";
  ctx.beginPath();
  ctx.moveTo(-1, -13);
  ctx.lineTo(6, -11);
  ctx.lineTo(6, -2);
  ctx.lineTo(-1, -1);
  ctx.closePath();
  ctx.fill();
  // bright cutting edge
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
}

/** The berserker's variant of the big axe: leather-wrapped haft, a notch
 *  bitten out of the crescent, and a cutting edge lit by the rage accent. */
function drawRageAxe(ctx: Ctx, hx: number, hy: number, side: number, accent: string, A: SpriteAnim) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  // wooden haft with leather wraps
  ctx.strokeStyle = "#5a3a1f";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.lineTo(2, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1.5, -13);
  ctx.lineTo(1.5, 16);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#7c4a24";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2.2, 6);
  ctx.lineTo(2.8, 8);
  ctx.moveTo(-1.8, 10);
  ctx.lineTo(3.2, 12);
  ctx.stroke();
  // notched crescent blade
  const g = ctx.createLinearGradient(0, -17, 12, -6);
  g.addColorStop(0, "#e9edf2");
  g.addColorStop(1, "#9aa0a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.bezierCurveTo(14, -17, 17, -10, 15, -6);
  ctx.lineTo(12.5, -4.5);
  ctx.lineTo(15.5, -3.5);
  ctx.bezierCurveTo(16, -1, 12, 2, -1, 1);
  ctx.closePath();
  ctx.fill();
  // darker steel near the haft (the poll/eye)
  ctx.fillStyle = "#8a9099";
  ctx.beginPath();
  ctx.moveTo(-1, -13);
  ctx.lineTo(6, -11);
  ctx.lineTo(6, -2);
  ctx.lineTo(-1, -1);
  ctx.closePath();
  ctx.fill();
  // cutting edge, rage-lit on the glow pulse
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55 + A.glow * 0.35;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 6;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
}

function drawHealer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // soft gold backlight
  ctx.save();
  ctx.globalAlpha = 0.12 + A.glow * 0.06;
  const bl = ctx.createRadialGradient(0, -4, 3, 0, -4, 24);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -4, 24, 0, PI2);
  ctx.fill();
  ctx.restore();
  // layered robe with a lighter inner panel
  const rg = ctx.createLinearGradient(0, -11, 0, 20);
  rg.addColorStop(0, withShade(body, -10));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, withShade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(14, 20);
  ctx.lineTo(-14, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, 15);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(9, 20);
  ctx.lineTo(-9, 20);
  ctx.closePath();
  ctx.fill();
  // white tabard with a glowing cross
  ctx.fillStyle = "#f5f0e1";
  ctx.beginPath();
  ctx.moveTo(-4, -7);
  ctx.lineTo(4, -7);
  ctx.lineTo(3, 19);
  ctx.lineTo(-3, 19);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + A.glow * 3;
  ctx.fillRect(-1, -3, 2, 8);
  ctx.fillRect(-3, -1, 6, 2);
  ctx.restore();
  // rope belt with a knot and hanging cord
  ctx.strokeStyle = "#b1905a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, 6);
  ctx.quadraticCurveTo(0, 8.5, 9, 6);
  ctx.stroke();
  ctx.fillStyle = "#b1905a";
  ctx.beginPath();
  ctx.arc(6.5, 7.2, 1.4, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#b1905a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6.5, 8.4);
  ctx.lineTo(6.2, 13);
  ctx.stroke();
  // prayer book on the hip
  ctx.fillStyle = "#5b3a29";
  ctx.beginPath();
  ctx.roundRect(-13, 8, 6, 7.5, 1);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-13, 9.5);
  ctx.lineTo(-7, 9.5);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-10.6, 10.5, 1.2, 3.6);
  ctx.fillRect(-11.8, 11.6, 3.6, 1.2);
  ctx.restore();
  // shoulder mantle
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(-9.5, -9);
  ctx.quadraticCurveTo(0, -13.5, 9.5, -9);
  ctx.lineTo(7, -2.5);
  ctx.quadraticCurveTo(0, -6, -7, -2.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, -8.6);
  ctx.quadraticCurveTo(0, -12.8, 9, -8.6);
  ctx.stroke();
  // head with serene closed eyes + skullcap
  ctx.fillStyle = withShade(light, -10);
  ctx.beginPath();
  ctx.arc(0, -14, 6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -25);
  ctx.beginPath();
  ctx.arc(0, -15.5, 5.7, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "#6b5232";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.2, -13.6);
  ctx.quadraticCurveTo(-2.2, -12.9, -1.2, -13.6);
  ctx.moveTo(1.2, -13.6);
  ctx.quadraticCurveTo(2.2, -12.9, 3.2, -13.6);
  ctx.stroke();
  // radiant double halo
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 7 + A.glow * 7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -23, 7.5, 3, 0, 0, PI2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -23, 4.5, 1.8, 0, 0, PI2);
  ctx.stroke();
  ctx.restore();
  // spark orbiting the halo (motion only)
  if (A.live) {
    const ang = A.t * 2;
    ctx.save();
    ctx.fillStyle = "#fffbe6";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 7.5, -23 + Math.sin(ang) * 3, 1, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
  // crozier: curled head cradling a glowing orb
  ctx.strokeStyle = "#d8c08a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(12, 18);
  ctx.lineTo(12, -11);
  ctx.stroke();
  ctx.strokeStyle = "#d8c08a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(12, -15, 4, 0.5 * Math.PI, 1.9 * Math.PI);
  ctx.stroke();
  orb(ctx, 12, -15, 2.6, accent, A.glow, "#fffbe6");
  // rising motes + cross sparkles (motion only)
  rising(ctx, 0, 6, 16, 24, accent, A, 4);
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = "#fffbe6";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const seed = i * 2.1 + 0.7;
      const life = (A.t * 0.7 + seed) % 1;
      const x = Math.sin(seed * 6) * 9;
      const y = 12 - life * 24;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.3, y);
      ctx.lineTo(x + 1.3, y);
      ctx.moveTo(x, y - 1.3);
      ctx.lineTo(x, y + 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSummoner(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Ancient forest-warden (defId "summoner").
  const t = A.t;
  const wood = "#6b4a2a";
  const leaf = accent;
  const leafGlow = "#c6f76a";
  // summoning circle underfoot (a nod to its wolf-summoning)
  ctx.save();
  ctx.globalAlpha = 0.32 + 0.15 * Math.sin(t * 2);
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(0, 24, 17, 5, 0, 0, PI2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 24, 12, 3.5, 0, 0, PI2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = leaf;
  for (let i = 0; i < 6; i++) {
    const a = i * (PI2 / 6) + t * 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 15, 24 + Math.sin(a) * 4.5, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // green backlight
  ctx.save();
  ctx.globalAlpha = 0.18;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, leaf);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // layered cloak
  const rg = ctx.createLinearGradient(0, -6, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.5, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(13, 20);
  ctx.lineTo(-13, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.fill();
  // leaf-trim mantle
  ctx.fillStyle = leaf;
  for (let j = -2; j <= 2; j++) {
    ctx.save();
    ctx.translate(j * 5, -4);
    ctx.rotate(j * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 1.6, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
  // head, hood, white beard
  ctx.fillStyle = withShade(light, -10);
  ctx.beginPath();
  ctx.arc(0, -12, 6.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -13, 7.5, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#d8d2c4";
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.lineTo(3, -9);
  ctx.lineTo(1.5, -5);
  ctx.lineTo(-1.5, -5);
  ctx.closePath();
  ctx.fill();
  // glowing nature eyes
  ctx.save();
  ctx.fillStyle = leafGlow;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-2.4, -12, 1.3, 0, PI2);
  ctx.arc(2.4, -12, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  // branching antler crown
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, -16);
  ctx.lineTo(-6, -22);
  ctx.lineTo(-10, -27);
  ctx.moveTo(-6, -22);
  ctx.lineTo(-11, -23);
  ctx.moveTo(-8, -25);
  ctx.lineTo(-6, -29);
  ctx.moveTo(4, -16);
  ctx.lineTo(6, -22);
  ctx.lineTo(10, -27);
  ctx.moveTo(6, -22);
  ctx.lineTo(11, -23);
  ctx.moveTo(8, -25);
  ctx.lineTo(6, -29);
  ctx.stroke();
  ctx.lineCap = "butt";
  // glowing antler tips
  ctx.save();
  ctx.fillStyle = leafGlow;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 6;
  const tips: [number, number][] = [
    [-10, -27], [-11, -23], [-6, -29], [10, -27], [11, -23], [6, -29],
  ];
  for (const [tx, ty] of tips) {
    ctx.beginPath();
    ctx.arc(tx, ty, 1.3, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // living staff (flips with facing)
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 19);
  ctx.lineTo(12, 9);
  ctx.lineTo(14, -1);
  ctx.lineTo(12, -10);
  ctx.stroke();
  // vine wrap
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s <= 10; s++) {
    const yy = 19 - s * 3;
    const xx = 13 + Math.sin(s * 1.1) * 2.5;
    if (s === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
  // glowing seed-orb cradled in leaves
  ctx.save();
  ctx.fillStyle = leaf;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.ellipse(10, -13, 3.5, 2, -0.5, 0, PI2);
  ctx.ellipse(16, -13, 3.5, 2, 0.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  orb(ctx, 13, -14, 3.2 * (0.9 + 0.1 * Math.sin(t * 4)), leafGlow, A.glow, "#f0ffd0");
  // orbiting spirit-wisp + drifting leaves + fireflies (motion only)
  if (A.live) {
    const wa = t * 1.2;
    const wx = Math.cos(wa) * 16;
    const wy = -2 + Math.sin(wa) * 8;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = leafGlow;
    ctx.shadowColor = leaf;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, PI2);
    ctx.fill();
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.arc(wx - Math.cos(wa) * 3, wy - Math.sin(wa) * 1.5, 1.2, 0, PI2);
    ctx.fill();
    ctx.restore();
    for (let l = 0; l < 5; l++) {
      const seed = l * 1.7;
      const life = (t * 0.4 + seed) % 1;
      const lx = (l - 2) * 7 + Math.sin(t * 1.3 + seed) * 4;
      const ly = 18 - life * 30;
      ctx.save();
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.translate(lx, ly);
      ctx.rotate(life * 6 + seed);
      ctx.fillStyle = l % 2 ? leaf : leafGlow;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.4, 1.2, 0, 0, PI2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = leafGlow;
    ctx.shadowColor = leaf;
    ctx.shadowBlur = 5;
    for (let f = 0; f < 3; f++) {
      const a2 = t * (1 + f * 0.3) + f * 2;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 5 + f);
      ctx.beginPath();
      ctx.arc(Math.cos(a2) * 14 + (f - 1) * 3, -4 + Math.sin(a2 * 1.3) * 10, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Spirit Wolf — feral pounce: chest low over braced forelegs, hackles raised,
// bushy tail up, fangs bared. Authored head-right (no facing mirror needed).
// User-approved from canvas mockups.
function drawWolf(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // bushy raised tail
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-12, 6);
  ctx.quadraticCurveTo(-20, 2, -21, -6);
  ctx.lineTo(-17.5, -5);
  ctx.quadraticCurveTo(-16, 1, -10, 4);
  ctx.closePath();
  ctx.fill();
  // crouched body, chest dipped toward the target
  const bgd = ctx.createLinearGradient(0, 1.5, 0, 14.5);
  bgd.addColorStop(0, light);
  bgd.addColorStop(1, dark);
  ctx.fillStyle = bgd;
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 6.5, -0.14, 0, PI2);
  ctx.fill();
  // hackle spikes along the spine
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-9, 4.5);
  ctx.lineTo(-7, 0.5);
  ctx.lineTo(-4.5, 3.2);
  ctx.lineTo(-2, -0.5);
  ctx.lineTo(0.5, 2.4);
  ctx.lineTo(3, -1);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.fill();
  // legs: rear pair coiled with bent hocks, front pair braced under the chest
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, 9);
  ctx.lineTo(-10, 15);
  ctx.lineTo(-8.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 11);
  ctx.lineTo(-5.5, 15.5);
  ctx.lineTo(-4.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, 11.5);
  ctx.lineTo(7.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(9.5, 10.5);
  ctx.lineTo(11, 19.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // head with an angular muzzle
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(12, 3, 6, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(22.5, 5.2);
  ctx.lineTo(15, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#26282c";
  ctx.beginPath();
  ctx.arc(22, 5.2, 1.3, 0, PI2);
  ctx.fill(); // nose
  // perked ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(8, -1);
  ctx.lineTo(9.5, -7.5);
  ctx.lineTo(12.5, -1.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12.5, -1.5);
  ctx.lineTo(15, -6.5);
  ctx.lineTo(17, -0.5);
  ctx.closePath();
  ctx.fill();
  // glowing spirit eye
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(14.5, 2.5, 1.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bared fangs + snarl line
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(17.5, 6.6);
  ctx.lineTo(18.7, 6.6);
  ctx.lineTo(18.1, 8.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, 6.4);
  ctx.lineTo(21, 6.4);
  ctx.lineTo(20.5, 8.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#26282c";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(15.5, 8.4);
  ctx.lineTo(20.5, 8);
  ctx.stroke();
  void body;
}

// Boar — war boar: shoulder hump, mohawk bristle ridge, proper snout with
// nostrils, four hooved legs, curly tail, angry brow, two spaced tusks.
// Authored head-right (no facing mirror needed). User-approved from mockups.
function drawBoar(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // curly tail
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-15, 4);
  ctx.quadraticCurveTo(-19, 2, -18, -1);
  ctx.quadraticCurveTo(-17, 1, -15.5, 0);
  ctx.stroke();
  ctx.lineCap = "butt";
  // body with a heavy front shoulder hump
  const bgd = ctx.createLinearGradient(0, -2, 0, 17);
  bgd.addColorStop(0, light);
  bgd.addColorStop(1, dark);
  ctx.fillStyle = bgd;
  ctx.beginPath();
  ctx.ellipse(-1, 7, 15, 9, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(6, 2.5, 8.5, 6, 0.1, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-1, 12.5, 13, 4.5, 0, 0, PI2);
  ctx.fill(); // belly shading
  // mohawk bristle ridge (head overlaps its front edge)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(10, -3);
  ctx.lineTo(8, -8);
  ctx.lineTo(5.5, -3.5);
  ctx.lineTo(3, -7.5);
  ctx.lineTo(0.5, -3);
  ctx.lineTo(-2, -6.5);
  ctx.lineTo(-4.5, -2);
  ctx.lineTo(-7, -5);
  ctx.lineTo(-9, -0.5);
  ctx.lineTo(-11, 1.5);
  ctx.closePath();
  ctx.fill();
  // four legs with hoof caps
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.8;
  for (const x of [-10, -5, 5, 10]) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, 20);
    ctx.stroke();
  }
  ctx.fillStyle = "#2b1c10";
  for (const x of [-10, -5, 5, 10]) ctx.fillRect(x - 1.6, 19, 3.2, 2);
  // head + snout with nostrils
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(13, 5, 7.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.ellipse(20, 7.5, 4, 3, 0.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#2b1c10";
  ctx.beginPath();
  ctx.arc(21, 7, 0.7, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(21.5, 8.4, 0.7, 0, PI2);
  ctx.fill();
  // ear
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(9, -1.5);
  ctx.lineTo(10.5, -6.5);
  ctx.lineTo(13.5, -2);
  ctx.closePath();
  ctx.fill();
  // angry brow + eye
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(12, 0.5);
  ctx.lineTo(16.5, 2);
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(13.5, 2.2, 2, 2);
  // two tusks, spaced so they read separately: a big fore tusk and a
  // smaller rear one
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(18.5, 9.5);
  ctx.quadraticCurveTo(23, 7.5, 22, 3);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, 10.8);
  ctx.quadraticCurveTo(17.5, 10, 17.5, 7.2);
  ctx.stroke();
  ctx.lineCap = "butt";
  void A;
}

function drawBear(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Druid's bear form — a shaggy, fanged bruiser wreathed in nature magic.
  const nat = accent;
  const natGlow = "#c6f76a";
  // green nature backlight
  ctx.save();
  ctx.globalAlpha = 0.14;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, nat);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // shaggy fur silhouette
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI2;
    const ex = Math.cos(a) * 19;
    const ey = 4 + Math.sin(a) * 15;
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex * 1.13, 4 + (ey - 4) * 1.13);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
  // body
  const g = ctx.createLinearGradient(0, -14, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 4, 20, 16, 0, 0, PI2);
  ctx.fill();
  // shoulder hump
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, -4, 13, 9, 0, 0, PI2);
  ctx.fill();
  // belly shading
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, 12, 16, 8, 0, 0, PI2);
  ctx.fill();
  // chest highlight
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 2, 8, 10, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  // ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-8, -20, 4, 0, PI2);
  ctx.arc(8, -20, 4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-8, -20, 2, 0, PI2);
  ctx.arc(8, -20, 2, 0, PI2);
  ctx.fill();
  // brow ridge
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-8, -15);
  ctx.lineTo(-1, -16);
  ctx.lineTo(-2, -13);
  ctx.closePath();
  ctx.moveTo(8, -15);
  ctx.lineTo(1, -16);
  ctx.lineTo(2, -13);
  ctx.closePath();
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = natGlow;
  ctx.shadowColor = nat;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-4.5, -13, 2, 0, PI2);
  ctx.arc(4.5, -13, 2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // muzzle
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -8, 5.5, 4.5, 0, 0, PI2);
  ctx.fill();
  // nose
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, -10, 2.2, 1.6, 0, 0, PI2);
  ctx.fill();
  // growling mouth
  ctx.fillStyle = "#2a0f0f";
  ctx.beginPath();
  ctx.ellipse(0, -5, 3.6, 2, 0, 0, PI2);
  ctx.fill();
  // fangs
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-2.6, -6);
  ctx.lineTo(-1.6, -3);
  ctx.lineTo(-0.8, -6);
  ctx.closePath();
  ctx.moveTo(2.6, -6);
  ctx.lineTo(1.6, -3);
  ctx.lineTo(0.8, -6);
  ctx.closePath();
  ctx.fill();
  // forepaws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-16, 12, 5, 4, 0, 0, PI2);
  ctx.ellipse(16, 12, 5, 4, 0, 0, PI2);
  ctx.fill();
  // claws
  ctx.strokeStyle = "#f3f3e0";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-19, 13);
  ctx.lineTo(-21, 17);
  ctx.moveTo(-16, 14);
  ctx.lineTo(-17, 18.5);
  ctx.moveTo(-13, 14);
  ctx.lineTo(-13, 18.5);
  ctx.moveTo(19, 13);
  ctx.lineTo(21, 17);
  ctx.moveTo(16, 14);
  ctx.lineTo(17, 18.5);
  ctx.moveTo(13, 14);
  ctx.lineTo(13, 18.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // hind paws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-9, 19, 4, 2.5, 0, 0, PI2);
  ctx.ellipse(9, 19, 4, 2.5, 0, 0, PI2);
  ctx.fill();
  // druidic moss on the shoulders
  ctx.save();
  ctx.fillStyle = nat;
  ctx.shadowColor = nat;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.ellipse(-11, -3, 2.6, 1.4, -0.4, 0, PI2);
  ctx.ellipse(11, -3, 2.6, 1.4, 0.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rising nature-motes
  rising(ctx, 0, 13, 12, 30, natGlow, A, 4);
}

function drawBerserker(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // hulking, hunched, dual axes — rage is the signature emitter
  // pulsing blood-red backlight
  ctx.save();
  ctx.globalAlpha = 0.14 + A.glow * 0.08;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rage fissures underfoot
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.25 + A.glow * 0.3;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4, 24);
  ctx.lineTo(-9, 26.5);
  ctx.lineTo(-15, 25.5);
  ctx.moveTo(3, 24.5);
  ctx.lineTo(9, 27);
  ctx.lineTo(13, 25.5);
  ctx.moveTo(-1, 25);
  ctx.lineTo(1, 28);
  ctx.stroke();
  ctx.restore();
  // hunched torso — wide shoulders tapering to the hips, with rim light
  const tg = ctx.createLinearGradient(0, -6, 0, 22);
  tg.addColorStop(0, light);
  tg.addColorStop(0.5, body);
  tg.addColorStop(1, dark);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-16, -2);
  ctx.quadraticCurveTo(-14, -8, 0, -8);
  ctx.quadraticCurveTo(14, -8, 16, -2);
  ctx.quadraticCurveTo(15, 12, 10, 20);
  ctx.lineTo(-10, 20);
  ctx.quadraticCurveTo(-15, 12, -16, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-15.2, 0);
  ctx.quadraticCurveTo(-14.6, 10, -10.5, 18.5);
  ctx.stroke();
  // fur pelt mantle across the shoulders
  ctx.fillStyle = "#3a2417";
  ctx.beginPath();
  ctx.moveTo(-17, -3);
  const tufts: [number, number][] = [
    [-13, -1], [-11, -6], [-8, -2], [-5, -7], [-2, -3], [2, -7], [5, -2], [8, -7], [11, -2], [13, -6], [17, -3],
  ];
  for (const [tx, ty] of tufts) ctx.lineTo(tx, ty);
  ctx.lineTo(17, -8);
  ctx.quadraticCurveTo(0, -13, -17, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(-17, -8);
  ctx.quadraticCurveTo(0, -13, 17, -8);
  ctx.lineTo(15, -6.5);
  ctx.quadraticCurveTo(0, -11.2, -15, -6.5);
  ctx.closePath();
  ctx.fill();
  // war-paint chevrons, faintly rage-lit
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.65;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + A.glow * 3;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.lineTo(-2, 7);
  ctx.moveTo(8, 2);
  ctx.lineTo(2, 7);
  ctx.moveTo(-7, 7);
  ctx.lineTo(-2, 11);
  ctx.moveTo(7, 7);
  ctx.lineTo(2, 11);
  ctx.stroke();
  ctx.restore();
  // belt with a skull buckle
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 14, 24, 6);
  ctx.fillStyle = "#e7e5e4";
  ctx.beginPath();
  ctx.arc(0, 17, 2.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(-1.8, 16.2, 1.2, 1.2);
  ctx.fillRect(0.7, 16.2, 1.2, 1.2);
  // fists gripping the hafts, veins pulsing with bloodrage
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    const ag = ctx.createLinearGradient(10, -2, 18, 6);
    ag.addColorStop(0, withShade(body, 25));
    ag.addColorStop(1, withShade(body, -20));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(14.5, 2, 4.6, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(14.5, 2, 4.6, Math.PI * 0.9, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.3 + A.glow * 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.quadraticCurveTo(13.5, 2, 12.5, 5);
    ctx.stroke();
    ctx.restore();
  }
  // head with a war-paint band across the face
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -13, 8.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -13, 8.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-7.5, -16);
  ctx.lineTo(7.5, -12);
  ctx.stroke();
  ctx.restore();
  // topknot, swaying on the presentation clock
  ctx.fillStyle = "#2a1810";
  ctx.beginPath();
  ctx.arc(0, -20.5, 3.4, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2a1810";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -21.5);
  ctx.quadraticCurveTo(3 + Math.sin(A.t * 2.4), -26, 1.5 + Math.sin(A.t * 2.4) * 1.6, -28.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // rage eyes (glow) with rising ember flecks
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 7;
  ctx.fillRect(-5.5, -15, 3.4, 2);
  ctx.fillRect(2.1, -15, 3.4, 2);
  if (A.live) {
    ctx.globalAlpha = 0.4 + A.glow * 0.3;
    ctx.fillRect(-4.6, -18 - A.glow * 1.5, 1.4, 1.4);
    ctx.fillRect(3.2, -18.5 - A.glow * 1.2, 1.4, 1.4);
  }
  ctx.restore();
  // twin notched axes with rage-lit edges
  drawRageAxe(ctx, 15, -1, 1, accent, A);
  drawRageAxe(ctx, -15, -1, -1, accent, A);
  // rising rage motes + the odd bright spark
  rising(ctx, 0, 13, 16, 30, accent, A, 6);
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = "#ffd9b0";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const seed = i * 2.3 + 0.9;
      const life = (A.t * 0.8 + seed) % 1;
      const x = Math.sin(seed * 7) * 10;
      const y = 14 - life * 26;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, y);
      ctx.lineTo(x + 1.4, y);
      ctx.moveTo(x, y - 1.4);
      ctx.lineTo(x, y + 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawNecromancer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  const bone = "#e7e5e4";
  const boneDark = "#b8b4ad";
  const vio = accent;
  const vioGlow = "#c9b6ff";
  // grave glyph underfoot (a summoning pentagram)
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 2);
  ctx.strokeStyle = vio;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.ellipse(0, 24, 16, 4.5, 0, 0, PI2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * ((PI2 * 2) / 5);
    const x = Math.cos(a) * 11;
    const y = 24 + Math.sin(a) * 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // violet backlight
  ctx.save();
  ctx.globalAlpha = 0.2;
  const bl = ctx.createRadialGradient(0, -2, 4, 0, -2, 24);
  bl.addColorStop(0, vio);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 24, 0, PI2);
  ctx.fill();
  ctx.restore();
  // soul-wisps with hollow faces (motion only)
  if (A.live) {
    for (let w = 0; w < 5; w++) {
      const seed = w * 1.9;
      const life = (t * 0.45 + seed) % 1;
      const wx = (w - 2) * 6 + Math.sin(t + seed) * 3;
      const wy = 16 - life * 28;
      ctx.save();
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.fillStyle = vioGlow;
      ctx.shadowColor = vio;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 2, 2.6, 0, 0, PI2);
      ctx.fill();
      ctx.globalAlpha *= 0.8;
      ctx.fillStyle = body;
      ctx.fillRect(wx - 1.1, wy - 0.6, 0.8, 0.8);
      ctx.fillRect(wx + 0.3, wy - 0.6, 0.8, 0.8);
      ctx.restore();
    }
  }
  // tattered death-shroud with a ragged hem
  const rg = ctx.createLinearGradient(0, -14, 0, 20);
  rg.addColorStop(0, withShade(body, 10));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, withShade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(14, 18);
  const hem: [number, number][] = [
    [11, 14], [8, 19], [5, 14], [2, 19], [-1, 14], [-4, 19], [-7, 14], [-10, 19], [-14, 18],
  ];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -35);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(8, 18);
  ctx.lineTo(-8, 18);
  ctx.closePath();
  ctx.fill();
  // horned hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(10, -15);
  ctx.lineTo(0, 0);
  ctx.lineTo(-10, -15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, -16);
  ctx.quadraticCurveTo(-11, -20, -9, -24);
  ctx.moveTo(7, -16);
  ctx.quadraticCurveTo(11, -20, 9, -24);
  ctx.stroke();
  ctx.lineCap = "butt";
  // detailed skull
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(2, -15);
  ctx.lineTo(3, -11);
  ctx.stroke();
  // glowing eye sockets
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.ellipse(-2.3, -11.5, 1.4, 1.6, 0, 0, PI2);
  ctx.ellipse(2.3, -11.5, 1.4, 1.6, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  // nasal + teeth
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.moveTo(-0.7, -9);
  ctx.lineTo(0.7, -9);
  ctx.lineTo(0, -10.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    ctx.moveTo(k * 1.2, -7.6);
    ctx.lineTo(k * 1.2, -6);
  }
  ctx.stroke();
  // bone staff topped with a violet-flaming skull
  ctx.strokeStyle = "#4a4038";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 18);
  ctx.lineTo(13, -8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.85;
  for (let k = 0; k < 5; k++) {
    const an = t * 3 + k * 1.256;
    const fl = 6 * (0.9 + 0.3 * Math.abs(Math.sin(t * 6 + k)));
    ctx.beginPath();
    ctx.moveTo(13 + Math.cos(an) * 3, -14 + Math.sin(an) * 3);
    ctx.lineTo(13 + Math.cos(an - 0.2) * fl, -14 + Math.sin(an - 0.2) * fl);
    ctx.lineTo(13 + Math.cos(an + 0.2) * fl, -14 + Math.sin(an + 0.2) * fl);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.arc(13, -14, 3.4, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 5;
  ctx.fillRect(11.8, -15, 1.3, 1.3);
  ctx.fillRect(12.8, -15, 1.3, 1.3);
  ctx.restore();
  ctx.fillStyle = bone;
  ctx.fillRect(11.5, -11, 3, 1.8);
  // orbiting bone shards (motion only)
  if (A.live) {
    ctx.fillStyle = bone;
    for (let s = 0; s < 3; s++) {
      const a3 = t * 1.5 + s * (PI2 / 3);
      ctx.save();
      ctx.translate(Math.cos(a3) * 15, -2 + Math.sin(a3) * 9);
      ctx.rotate(a3);
      ctx.fillRect(-1.5, -0.6, 3, 1.2);
      ctx.restore();
    }
  }
  void light;
}

// ---- skeleton --------------------------------------------------------------
// Two variants picked per-unit via variantOf(uid) so summoned packs vary:
// 0 = restrung classic (bare bones + rusty sword), 1 = grave warrior (adds a
// cracked half-helm and a bitten plank shield held in front of the bones).
// User-approved from canvas mockups.

const BONE = "#e7e5e4";
const BONE_SHADE = "#c8c6c2";

/** Skull with glowing sockets, nasal cavity, teeth, a hanging jaw (dropped by
 *  jawDrop) and a cranium crack. */
function skeletonSkull(ctx: Ctx, accent: string, glow: number, x: number, y: number, tilt: number, jawDrop: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(0, -1, 5.2, Math.PI, 0);
  ctx.quadraticCurveTo(5.2, 2.5, 3.5, 3.2);
  ctx.lineTo(-3.5, 3.2);
  ctx.quadraticCurveTo(-5.2, 2.5, -5.2, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BONE_SHADE;
  ctx.fillRect(-3.5, 1.4, 7, 1.8);
  // dark mouth gap + upper teeth
  ctx.fillStyle = "#141216";
  ctx.fillRect(-2.6, 3.1, 5.2, 1 + jawDrop);
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) ctx.fillRect(-2.4 + i * 1.4, 3.1, 0.7, 1);
  // hanging jaw
  ctx.fillStyle = "#dcdad6";
  ctx.beginPath();
  ctx.roundRect(-2.8, 4.1 + jawDrop, 5.6, 2.2, 1);
  ctx.fill();
  // glowing sockets
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + glow * 3;
  ctx.fillRect(-3.5, -2.4, 2.3, 2.3);
  ctx.fillRect(1.2, -2.4, 2.3, 2.3);
  ctx.restore();
  // nasal cavity
  ctx.fillStyle = "#8f8d89";
  ctx.beginPath();
  ctx.moveTo(0, -0.2);
  ctx.lineTo(-0.9, 1.7);
  ctx.lineTo(0.9, 1.7);
  ctx.closePath();
  ctx.fill();
  // cranium crack
  ctx.strokeStyle = "#9a9894";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1.2, -6);
  ctx.lineTo(-0.3, -3.9);
  ctx.lineTo(-2, -2.7);
  ctx.stroke();
  ctx.restore();
}

/** Spine, four curved rib pairs, and a pelvis with hip knobs. */
function skeletonRibs(ctx: Ctx) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(0, 11);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const y = -2.5 + i * 3;
    const w = 6.2 - i * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(-w, y + 0.4, -w + 0.6, y + 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(w, y + 0.4, w - 0.6, y + 2.6);
    ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3.8, 11);
  ctx.lineTo(3.8, 11);
  ctx.stroke();
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(-3.4, 11.8, 1.5, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.4, 11.8, 1.5, 0, PI2);
  ctx.fill();
}

/** A bone limb through the given joints, with knob joints between segments. */
function boneLimb(ctx: Ctx, pts: [number, number][], lw: number) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#d5d3cf";
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], lw * 0.6, 0, PI2);
    ctx.fill();
  }
}

/** Three finger-bone claws splaying from (x,y) toward dir (+1 right / -1 left). */
function boneClaws(ctx: Ctx, x: number, y: number, dir: number) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 3, y - 1.5 + i * 1.5);
    ctx.stroke();
  }
}

function skeletonLegs(ctx: Ctx) {
  boneLimb(ctx, [[0, 12], [-3, 15.5], [-4.5, 19.5]], 2);
  boneLimb(ctx, [[0, 12], [3, 15], [4.5, 19.5]], 2);
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-4.5, 19.5);
  ctx.lineTo(-7, 19.5);
  ctx.moveTo(4.5, 19.5);
  ctx.lineTo(7, 19.5);
  ctx.stroke();
}

/** Notched, rust-spotted sword gripped at (hx,hy). */
function rustySword(ctx: Ctx, hx: number, hy: number, ang: number) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.fillStyle = "#6b5a3a"; // grip
  ctx.fillRect(-0.8, 1, 1.6, 3.4);
  ctx.fillStyle = "#7d7260"; // guard
  ctx.fillRect(-3, -0.4, 6, 1.4);
  // notched blade
  ctx.fillStyle = "#b9b3a6";
  ctx.beginPath();
  ctx.moveTo(-1.1, -0.4);
  ctx.lineTo(-1.1, -13);
  ctx.lineTo(0, -15.5);
  ctx.lineTo(1.1, -13);
  ctx.lineTo(1.1, -8.5);
  ctx.lineTo(-0.1, -7.4);
  ctx.lineTo(1.1, -6.2);
  ctx.lineTo(1.1, -0.4);
  ctx.closePath();
  ctx.fill();
  // rust blooms
  ctx.fillStyle = "#8a5a3a";
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(-0.3, -11, 0.9, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.4, -4, 1, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-0.4, -2, 0.6, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-1.1, -1);
  ctx.lineTo(-1.1, -13);
  ctx.stroke();
  ctx.restore();
}

function drawSkeleton(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  variant: 0 | 1
) {
  if (variant === 0) {
    // restrung classic: bare bones, off-hand claw, notched rusty sword
    boneLimb(ctx, [[0, -3], [-6, 0], [-8.5, 4.5]], 1.8);
    boneClaws(ctx, -8.5, 4.5, -1);
    skeletonRibs(ctx);
    skeletonLegs(ctx);
    skeletonSkull(ctx, accent, A.glow, 0, -12, 0, 0.4);
    boneLimb(ctx, [[0, -3], [6, -1], [9.5, 2]], 1.8);
    rustySword(ctx, 9.5, 2, 0.35);
  } else {
    // grave warrior: cracked half-helm + bitten plank shield held in front
    boneLimb(ctx, [[0, -3], [-6, -1], [-9, 2]], 1.8); // shield arm
    skeletonRibs(ctx);
    skeletonLegs(ctx);
    skeletonSkull(ctx, accent, A.glow, 0, -12, 0, 0.4);
    // cracked half-helm
    ctx.fillStyle = "#7d828c";
    ctx.beginPath();
    ctx.arc(0, -13.5, 5.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d6068";
    ctx.fillRect(-5.6, -13.8, 11.2, 1.4);
    ctx.strokeStyle = "#494c53";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2, -18.5);
    ctx.lineTo(2.8, -15.8);
    ctx.lineTo(1.2, -14.2);
    ctx.stroke();
    // plank shield in front of the bones, a bite missing from the top edge
    ctx.save();
    ctx.translate(-10, 3);
    ctx.fillStyle = "#8a6a42";
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "#6e5230";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.8, -5.2);
    ctx.lineTo(-1.8, 5.2);
    ctx.moveTo(1.8, -5.2);
    ctx.lineTo(1.8, 5.2);
    ctx.stroke();
    ctx.strokeStyle = "#57595e";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.stroke();
    ctx.fillStyle = "#6a6d74";
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, PI2);
    ctx.fill();
    // bite gouge in the rim, clipped to the shield face (dark fill — erasing
    // would punch a hole through the arena behind the sprite)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.clip();
    ctx.fillStyle = "#1a1b1e";
    ctx.beginPath();
    ctx.arc(4.6, -4.6, 2.4, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    boneLimb(ctx, [[0, -3], [6, -1], [9.5, 2]], 1.8);
    rustySword(ctx, 9.5, 2, 0.35);
  }
  void body;
  void dark;
  void light;
}

// Giant rat — a proper sewer rat: pointed snout with buck teeth and whiskers,
// big round pink ears, beady eye, mange patches, long segmented curling tail.
// User-approved from canvas mockups (drawn full-size; the call site shrinks it).
function drawGiantRat(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // The geometry below is authored head-left, but the renderer's facing flip
  // assumes sprites face right — mirror so the rat attacks nose-first.
  ctx.save();
  ctx.scale(-1, 1);
  const pinkDeep = withShade(accent, -25);
  // tail behind the body
  ctx.strokeStyle = pinkDeep;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(11, 8);
  ctx.quadraticCurveTo(21, 10, 24, 3);
  ctx.quadraticCurveTo(25.5, -1, 22.5, -3.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // tail segment ticks
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  for (const [tx, ty] of [[15, 9.3], [19, 8.2], [22.5, 5], [23.7, 0.5]] as const) {
    ctx.beginPath();
    ctx.moveTo(tx, ty - 1.2);
    ctx.lineTo(tx + 0.6, ty + 1.2);
    ctx.stroke();
  }
  // low teardrop body
  const g = ctx.createLinearGradient(0, 1.5, 0, 14.5);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(2, 8, 13, 6.5, -0.1, 0, PI2);
  ctx.fill();
  // mange patches
  ctx.fillStyle = withShade(body, -18);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(6, 5.5, 3, 2, 0.3, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1, 10, 2.2, 1.5, -0.2, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // big round ears, pink inside
  for (const [ex, ey, er] of [[-10.5, -2, 3.6], [-4.5, -3, 3.2]] as const) {
    ctx.fillStyle = withShade(body, -22);
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, PI2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(ex, ey + 0.3, er * 0.58, 0, PI2);
    ctx.fill();
  }
  // head dome tapering to a pointed snout
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(-3, 0.5);
  ctx.quadraticCurveTo(-9, -0.5, -19, 6.5);
  ctx.quadraticCurveTo(-9, 10.5, -3, 9.5);
  ctx.closePath();
  ctx.fill();
  // nose + buck teeth
  ctx.fillStyle = "#3d3028";
  ctx.beginPath();
  ctx.arc(-19, 6.5, 1.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-17.6, 7.6, 1.5, 2.4);
  // beady eye with a glint
  ctx.fillStyle = "#191512";
  ctx.beginPath();
  ctx.arc(-11, 3, 1.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(-11.4, 2.5, 0.45, 0, PI2);
  ctx.fill();
  // whiskers
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 0.7;
  for (const dy of [-2, 0.5, 3]) {
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(-21.5, 6 + dy);
    ctx.stroke();
  }
  // little pink feet
  ctx.strokeStyle = pinkDeep;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7, 13);
  ctx.lineTo(-7.5, 18);
  ctx.moveTo(7, 13.5);
  ctx.lineTo(7, 18.5);
  ctx.stroke();
  ctx.restore();
  void A;
}

function drawSlime(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim, scale: number) {
  ctx.save();
  ctx.scale(scale, scale);
  // gooey blob body — rounded dome with a wobbly base, shaded top-to-bottom
  const g = ctx.createLinearGradient(0, -16, 0, 19);
  g.addColorStop(0, light);
  g.addColorStop(1, body);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-18, 16);
  ctx.bezierCurveTo(-20, -8, -10, -16, 0, -16);
  ctx.bezierCurveTo(10, -16, 20, -8, 18, 16);
  // wobbly bottom
  ctx.bezierCurveTo(12, 20, 6, 16, 0, 19);
  ctx.bezierCurveTo(-6, 16, -12, 20, -18, 16);
  ctx.closePath();
  ctx.fill();
  // glossy highlight
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(-6, -6, 5, 7, -0.3, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // inner core glow
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 4, 7, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bubbles rising through the goo (motion only)
  if (A.live) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 3; i++) {
      const seed = i * 2.1;
      const life = (A.t * 0.5 + seed) % 1;
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.beginPath();
      ctx.arc((i - 1) * 6, 12 - life * 20, 1.4 * (1 - life) + 0.5, 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // eyes
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(-5, -2, 2, 0, PI2);
  ctx.arc(5, -2, 2, 0, PI2);
  ctx.fill();
  // eye shine
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-4, -3, 0.7, 0, PI2);
  ctx.arc(6, -3, 0.7, 0, PI2);
  ctx.fill();
  // rim highlight along the top-left edge
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-17, 10);
  ctx.bezierCurveTo(-19, -6, -11, -14, -2, -15);
  ctx.stroke();
  ctx.restore();
  void dark;
}

function drawMysticArcher(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  form: "light" | "dark"
) {
  // Celestial ranger; its aura snaps between golden Light and violet Dark stance.
  const t = A.t;
  const aura = form === "light" ? "#fcd34d" : "#a78bfa";
  const auraB = form === "light" ? "#fff2c0" : "#e6dbff";
  const robeBase = form === "light" ? body : withShade(body, -22);
  // backlight aura
  ctx.save();
  ctx.globalAlpha = 0.2;
  const bg = ctx.createRadialGradient(0, -4, 4, 0, -4, 26);
  bg.addColorStop(0, aura);
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, -4, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // star sparkles (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = auraB;
    ctx.shadowColor = aura;
    ctx.shadowBlur = 4;
    for (let i = 0; i < 5; i++) {
      const a = t * (0.5 + i * 0.2) + i * 1.7;
      const sx = Math.cos(a) * 18;
      const sy = -4 + Math.sin(a * 1.2) * 14;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 3 + i));
      ctx.beginPath();
      ctx.arc(sx, sy, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // celestial halo behind the head
  ctx.save();
  ctx.translate(0, -20);
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, PI2);
  ctx.stroke();
  ctx.fillStyle = auraB;
  for (let h = 0; h < 4; h++) {
    const a2 = h * (PI2 / 4);
    ctx.beginPath();
    ctx.arc(Math.cos(a2) * 6, Math.sin(a2) * 6, 1.1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // quiver of glowing arrows on the back
  ctx.strokeStyle = withShade(body, -20);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-10, 8);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 1;
  for (let q = 0; q < 3; q++) {
    ctx.beginPath();
    ctx.moveTo(-9 + q * 1.5, -6);
    ctx.lineTo(-11 + q * 1.5, -12);
    ctx.stroke();
  }
  ctx.restore();
  // flowing robe
  const rg = ctx.createLinearGradient(0, -14, 0, 18);
  rg.addColorStop(0, withShade(robeBase, 25));
  rg.addColorStop(0.6, robeBase);
  rg.addColorStop(1, withShade(robeBase, -25));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(6, 0);
  ctx.lineTo(13, 18);
  ctx.lineTo(4, 14);
  ctx.lineTo(0, 18);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-13, 18);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  // sash
  ctx.strokeStyle = aura;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(6, 8);
  ctx.stroke();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(8, -14);
  ctx.lineTo(0, -2);
  ctx.lineTo(-8, -14);
  ctx.closePath();
  ctx.fill();
  // brow gem
  ctx.save();
  ctx.fillStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(0, -13, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.fillRect(-3.4, -11, 2.2, 1.8);
  ctx.fillRect(1.2, -11, 2.2, 1.8);
  ctx.restore();
  // ornate recurve bow + nocked energy arrow (flips with facing)
  ctx.save();
  ctx.translate(12, 0);
  ctx.strokeStyle = withShade(aura, -30);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 13, -Math.PI / 2.1, Math.PI / 2.1);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.cos(-Math.PI / 2.1) * 13, Math.sin(-Math.PI / 2.1) * 13);
  ctx.quadraticCurveTo(6, -13, 3, -15);
  ctx.moveTo(Math.cos(Math.PI / 2.1) * 13, Math.sin(Math.PI / 2.1) * 13);
  ctx.quadraticCurveTo(6, 13, 3, 15);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5;
  for (let r = -1; r <= 1; r++) {
    const ra = r * 0.5;
    ctx.beginPath();
    ctx.arc(Math.cos(ra) * 13, Math.sin(ra) * 13, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.lineTo(-1, 0);
  ctx.lineTo(3, 15);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.shadowColor = aura;
  ctx.shadowBlur = 6 + A.glow * 4;
  ctx.strokeStyle = auraB;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(12, 0);
  ctx.stroke();
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(12, -2.4);
  ctx.lineTo(12, 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = aura;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(-7, 0);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // aura motes
  rising(ctx, 0, 10, 16, 24, aura, A, 4);
  void light;
  void accent;
}
