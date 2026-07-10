// ============================================================================
// GrubbinsScene — the shop's animated set piece: Grubbins the goblin
// pawnbroker, "Gilded Baron" art (PixiJS glow-up, 2026-07-10 mockup winner —
// see docs/shopkeeper-mockups.md round 3). Native PixiJS v8 scene graph with
// WebGL bloom; replaces the earlier 2D-canvas "Gritty Pawn-Den" (git history).
// Presentation only — the sim never reads this; animation runs off the wall
// clock via Pixi's rAF ticker. Same interface as the old scene: `width` +
// `reactNonce` (bump = purchase landed → pleased reaction for a beat).
// ============================================================================

import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";

interface Props {
  /** CSS pixel width; height follows the scene's 10:7 aspect. */
  width: number;
  /** Bump to make Grubbins visibly pleased for a beat (a purchase landed). */
  reactNonce?: number;
}

// Logical drawing space.
const VIEW_W = 400;
const VIEW_H = 280;
/** Width/height ratio, for callers sizing the scene from available height. */
export const SCENE_ASPECT = VIEW_W / VIEW_H;
/** How long the purchase-pleased overlay lasts (ms). */
const REACT_MS = 1100;

const TAU = Math.PI * 2;

// -- deterministic per-index hash (stable particle paths) --------------------
const h = (i: number, k = 0) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};

// -- canvas-generated textures (module-scope: shared across mounts, so app
//    destroy must NOT destroy textures) --------------------------------------
function ctex(
  w: number,
  hh: number,
  draw: (x: CanvasRenderingContext2D, w: number, hh: number) => void
): Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hh;
  const x = c.getContext("2d");
  if (x) draw(x, w, hh);
  return Texture.from(c);
}

let texCache: { soft: Texture; star: Texture; cone: Texture; counter: Texture; wall: Texture } | null = null;
function textures() {
  if (texCache) return texCache;
  const soft = ctex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
  const star = ctex(48, 48, (x) => {
    x.strokeStyle = "rgba(255,255,255,1)";
    x.lineWidth = 3;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(24, 4); x.lineTo(24, 44);
    x.moveTo(4, 24); x.lineTo(44, 24);
    x.stroke();
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(12, 12); x.lineTo(36, 36);
    x.moveTo(36, 12); x.lineTo(12, 36);
    x.stroke();
  });
  // soft-edged lamp light cone, apex at top-center
  const cone = ctex(190, 160, (x, w, hh) => {
    x.filter = "blur(6px)";
    const g = x.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, "rgba(255,214,140,0.5)");
    g.addColorStop(0.55, "rgba(255,196,110,0.16)");
    g.addColorStop(1, "rgba(255,196,110,0)");
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(w / 2 - 8, 8); x.lineTo(w / 2 + 8, 8);
    x.lineTo(w - 18, hh - 6); x.lineTo(18, hh - 6);
    x.closePath();
    x.fill();
  });
  const vg = (w: number, hh: number, stops: Array<[number, string]>) =>
    ctex(w, hh, (x) => {
      const g = x.createLinearGradient(0, 0, 0, hh);
      for (const [o, c] of stops) g.addColorStop(o, c);
      x.fillStyle = g;
      x.fillRect(0, 0, w, hh);
    });
  texCache = {
    soft,
    star,
    cone,
    counter: vg(400, 74, [[0, "#4a2416"], [1, "#26100a"]]),
    wall: vg(400, 280, [[0, "#2c1c24"], [0.7, "#1a1016"], [1, "#120b10"]]),
  };
  return texCache;
}

function glowSprite(x: number, y: number, scale: number, tint: number, alpha: number): Sprite {
  const s = new Sprite(textures().soft);
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.scale.set(scale);
  s.tint = tint;
  s.alpha = alpha;
  s.blendMode = "add";
  return s;
}
function starSprite(x: number, y: number, scale: number, tint: number): Sprite {
  const s = new Sprite(textures().star);
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.scale.set(scale);
  s.tint = tint;
  s.blendMode = "add";
  s.alpha = 0;
  return s;
}

interface PupilRef {
  g: Graphics;
  baseX: number;
  baseY: number;
}

// ---------------------------------------------------------------------------
// The scene: Grubbins the Gilded Baron behind his counter. Built once per
// mount; `tick(t, pleased)` animates it (t seconds, pleased 0..1).
// ---------------------------------------------------------------------------
function buildScene(): { root: Container; tick: (t: number, p: number) => void } {
  const root = new Container();
  const SKIN = "#7d8f4e";
  const SKIN_D = "#5a6a36";
  const SKIN_L = "#98ab62";
  const VEST = "#6e2433";
  const VEST_D = "#4c1622";
  const GOLD = "#f5c542";

  // wall
  root.addChild(new Sprite(textures().wall));
  const wall = new Graphics();
  for (let i = 0; i < 5; i++)
    wall.moveTo(80 * i + 40, 0).lineTo(80 * i + 40, 200).stroke({ width: 1, color: "#000000", alpha: 0.18 });
  // framed sign, top right: gold frame + coin emblem
  wall.roundRect(298, 26, 78, 56, 4).fill("#241016").stroke({ width: 4, color: "#8a6a2a" });
  wall.roundRect(298, 26, 78, 56, 4).stroke({ width: 1.5, color: "#c9a13c", alpha: 0.8 });
  wall.circle(337, 54, 15).fill("#3a2410").stroke({ width: 2, color: GOLD, alpha: 0.9 });
  wall.circle(337, 54, 9).stroke({ width: 1.5, color: GOLD, alpha: 0.6 });
  // shelf with wares, top-left
  wall.rect(16, 96, 120, 7).fill("#3a2416").stroke({ width: 1, color: "#000000", alpha: 0.3 });
  wall.moveTo(24, 103).lineTo(24, 118).moveTo(128, 103).lineTo(128, 118).stroke({ width: 3, color: "#2a1810" });
  wall.poly([36, 96, 48, 96, 45, 84, 39, 84]).fill("#8a6a2a");
  wall.rect(38, 78, 8, 6).fill("#8a6a2a");
  for (let i = 0; i < 3; i++)
    wall.ellipse(70 + i * 3, 93 - i * 4, 8, 2.6).fill("#b8912f").stroke({ width: 0.7, color: "#7a5c1c" });
  wall.roundRect(96, 76, 16, 20, 3).fill("#5a3a5a").stroke({ width: 1, color: "#7a527a" });
  root.addChild(wall);

  // hanging brass lamp (swings)
  const lamp = new Container();
  lamp.position.set(84, 0);
  const lg = new Graphics();
  lg.moveTo(0, 0).lineTo(0, 24).stroke({ width: 2, color: "#6a5a34" });
  lg.poly([-9, 24, 9, 24, 6, 30, -6, 30]).fill("#8a6a2a");
  lg.roundRect(-8, 30, 16, 26, 3).fill("#241a10").stroke({ width: 2, color: "#a8842e" });
  lg.rect(-5, 33, 10, 20).fill("#f8d868").stroke({ width: 1, color: "#a8842e" });
  lg.poly([-6, 56, 6, 56, 3, 61, -3, 61]).fill("#8a6a2a");
  lamp.addChild(lg);
  const flame = new Graphics();
  flame.ellipse(0, 46, 2.6, 5).fill("#fff2c0");
  lamp.addChild(flame);
  const lampGlow = glowSprite(0, 44, 0.9, 0xffb84a, 0.55);
  lamp.addChild(lampGlow);
  root.addChild(lamp);

  // light cone from the lamp: apex at the lamp, sways with it
  const beam = new Sprite(textures().cone);
  beam.anchor.set(0.5, 0.03);
  beam.position.set(84, 56);
  beam.blendMode = "add";
  root.addChild(beam);
  // warm pool where the light lands on the counter
  const pool = glowSprite(84, 198, 1, 0xffc878, 0.16);
  pool.scale.set(1.15, 0.32);
  root.addChild(pool);

  // ---- goblin ----
  const gob = new Container();
  const torso = new Graphics();
  torso.poly([160, 208, 156, 170, 170, 149, 200, 142, 230, 149, 244, 170, 240, 208]).fill(VEST);
  torso.poly([160, 208, 156, 170, 170, 149, 186, 145, 178, 208]).fill({ color: 0x000000, alpha: 0.18 });
  torso.poly([230, 149, 244, 170, 240, 208, 226, 208, 234, 160]).fill({ color: 0xffffff, alpha: 0.06 });
  torso.poly([186, 148, 200, 143, 214, 148, 208, 176, 192, 176]).fill("#dccdaa");
  torso.circle(200, 158, 1.4).circle(200, 166, 1.4).fill("#8a7a58");
  torso.poly([186, 148, 192, 176, 180, 168, 178, 152]).fill(VEST_D);
  torso.poly([214, 148, 208, 176, 220, 168, 222, 152]).fill(VEST_D);
  torso.moveTo(184, 154).quadraticCurveTo(200, 182, 216, 154).stroke({ width: 2.2, color: GOLD });
  torso.circle(200, 170, 4.4).fill(GOLD).stroke({ width: 1, color: "#a8842e" });
  torso.circle(198.5, 168.5, 1.4).fill("#fff2c0");
  torso.rect(192, 134, 16, 12).fill(SKIN_D);
  gob.addChild(torso);

  const head = new Container();
  head.position.set(200, 114);
  const hg = new Graphics();
  hg.ellipse(0, 12, 21, 14).fill(SKIN); // jowly jaw
  hg.ellipse(0, -2, 24, 20).fill(SKIN); // skull
  hg.ellipse(-7, 14, 9, 6).fill({ color: 0xffffff, alpha: 0.07 });
  hg.ellipse(0, -14, 18, 7).fill({ color: 0x000000, alpha: 0.1 });
  hg.moveTo(-9, 20).quadraticCurveTo(0, 24, 9, 20).stroke({ width: 1.2, color: SKIN_D, alpha: 0.8 });
  hg.moveTo(-12, 4).quadraticCurveTo(-14, 10, -10, 14).stroke({ width: 1, color: SKIN_D, alpha: 0.6 });
  // broad flat nose (mockup note: variant 4's nose on the Baron)
  hg.poly([-6, 0, 6, 0, 10, 9, -10, 9]).fill(SKIN_L);
  hg.circle(-5, 7.6, 1.3).circle(5, 7.6, 1.3).fill(SKIN_D);
  hg.circle(-14, 8, 1.6).fill(SKIN_D); // wart
  head.addChild(hg);

  // ears (perk when pleased)
  const EAR_BASE = 0.06;
  function ear(sign: number): Container {
    const e = new Container();
    e.position.set(sign * 21, -6);
    const g = new Graphics();
    g.poly([0, -4, sign * 30, -18, sign * 38, -12, sign * 30, -2, sign * 8, 5]).fill(SKIN);
    g.poly([sign * 6, -3, sign * 28, -13, sign * 30, -9, sign * 10, 2]).fill({ color: 0x000000, alpha: 0.22 });
    g.circle(sign * 12, -1, 1.8).fill(GOLD); // gold ear stud
    e.addChild(g);
    return e;
  }
  const earL = ear(-1);
  const earR = ear(1);
  head.addChild(earL, earR);

  // eyes (whites + pupils in a squashable container for blinks)
  const eyes = new Container();
  const pupils: PupilRef[] = [];
  for (const ex of [-9, 9]) {
    const white = new Graphics();
    white.ellipse(ex, -5, 4.6, 3.8).fill("#e8e0c8");
    eyes.addChild(white);
    const pupil = new Graphics();
    pupil.circle(0, 0, 2).fill("#c98a20");
    pupil.position.set(ex, -5);
    eyes.addChild(pupil);
    pupils.push({ g: pupil, baseX: ex, baseY: -5 });
  }
  head.addChild(eyes);
  const brows = new Graphics();
  brows.moveTo(-14, -11).quadraticCurveTo(-9, -13.5, -4, -11).stroke({ width: 2.2, color: SKIN_D });
  brows.moveTo(4, -12).quadraticCurveTo(9, -14.5, 14, -12).stroke({ width: 2.2, color: SKIN_D });
  head.addChild(brows);
  const monocle = new Graphics();
  monocle.circle(9, -4, 7.5).fill({ color: 0xffffff, alpha: 0.1 }).stroke({ width: 1.8, color: GOLD });
  monocle.moveTo(14, 1).quadraticCurveTo(22, 16, 16, 30).stroke({ width: 1, color: GOLD, alpha: 0.8 });
  head.addChild(monocle);
  const monoGlint = new Graphics();
  monoGlint.moveTo(5, -8).lineTo(12, -1).stroke({ width: 1.6, color: "#ffffff", alpha: 0.9 });
  monoGlint.alpha = 0;
  head.addChild(monoGlint);

  // mouths (idle smile ↔ pleased grin with the gold tooth)
  const mouthIdle = new Graphics();
  mouthIdle.moveTo(-7, 14).quadraticCurveTo(0, 18, 8, 13).stroke({ width: 1.8, color: "#3a4224" });
  head.addChild(mouthIdle);
  const mouthGrin = new Container();
  const mg = new Graphics();
  mg.poly([-8, 12, 8, 11, 6, 19, -6, 19]).fill("#2a1a14");
  mg.rect(-6, 12, 3.4, 3.2).rect(-1.8, 11.7, 3.4, 3.2).rect(2.6, 11.6, 3.4, 3.2).fill("#e8e0c8");
  mg.rect(-1.8, 11.7, 3.4, 3.4).fill(GOLD); // the gold tooth
  mouthGrin.addChild(mg);
  const toothStar = starSprite(0, 13, 0.28, 0xfff2c0);
  mouthGrin.addChild(toothStar);
  mouthGrin.alpha = 0;
  head.addChild(mouthGrin);
  gob.addChild(head);
  root.addChild(gob);

  // ---- counter ----
  const counter = new Container();
  const counterFront = new Sprite(textures().counter);
  counterFront.y = 206;
  counter.addChild(counterFront);
  const cg = new Graphics();
  cg.poly([0, 196, 400, 196, 400, 206, 0, 206]).fill("#6b3a20");
  cg.moveTo(0, 196).lineTo(400, 196).stroke({ width: 1.4, color: "#8a5230", alpha: 0.9 });
  cg.poly([40, 197, 250, 197, 240, 204, 55, 204]).fill({ color: 0xffffff, alpha: 0.07 });
  for (let i = 0; i < 4; i++)
    cg.moveTo(90 * i + 55, 210).lineTo(90 * i + 40, 276).stroke({ width: 1, color: "#000000", alpha: 0.25 });
  // wares: coin tray, ring stand (far right, clear of the resting arm), necklace coil
  cg.ellipse(305, 201, 27, 6).fill("#33200f").stroke({ width: 1.4, color: "#1c0f06" });
  for (let i = 0; i < 7; i++)
    cg.ellipse(292 + (i % 4) * 8.4, 199.4 - Math.floor(i / 4) * 3, 4.4, 1.7).fill(GOLD).stroke({ width: 0.6, color: "#a8842e" });
  cg.poly([375, 199, 381, 199, 378, 186]).fill("#3a2114");
  cg.circle(378, 184, 3.4).stroke({ width: 1.6, color: GOLD });
  cg.moveTo(340, 200).quadraticCurveTo(352, 193, 362, 200).quadraticCurveTo(352, 205, 340, 200).stroke({ width: 1.8, color: GOLD, alpha: 0.9 });
  counter.addChild(cg);
  root.addChild(counter);

  // brass balance scale, left end of the counter (rocks gently)
  const scaleBase = new Graphics();
  scaleBase.poly([60, 196, 80, 196, 75, 190, 65, 190]).fill("#5a4322");
  scaleBase.moveTo(70, 190).lineTo(70, 152).stroke({ width: 3, color: "#a8842e" });
  scaleBase.circle(70, 150, 2.4).fill("#a8842e");
  root.addChild(scaleBase);
  const scaleBeam = new Container();
  scaleBeam.position.set(70, 152);
  const sb = new Graphics();
  sb.moveTo(-26, 0).lineTo(26, 0).stroke({ width: 2.6, color: "#a8842e" });
  sb.moveTo(-26, 0).lineTo(-26, 14).moveTo(26, 0).lineTo(26, 14).stroke({ width: 1, color: "#c9a13c" });
  sb.ellipse(-26, 16, 8, 3).fill("#8a6a2a").stroke({ width: 1, color: "#5a4322" });
  sb.ellipse(26, 16, 8, 3).fill("#8a6a2a").stroke({ width: 1, color: "#5a4322" });
  sb.circle(26, 13.4, 2).fill("#63e0e8");
  scaleBeam.addChild(sb);
  root.addChild(scaleBeam);

  // resting arm ON the counter (drawn above it)
  const armRest = new Graphics();
  armRest.moveTo(232, 168).lineTo(252, 186).stroke({ width: 11, color: VEST, cap: "round" });
  armRest.moveTo(252, 186).lineTo(263, 195).stroke({ width: 9, color: VEST_D, cap: "round" });
  armRest.ellipse(268, 197, 6.4, 4.8).fill(SKIN);
  armRest.circle(266, 194.4, 1).circle(269.5, 194.2, 1).circle(272.5, 195.4, 1).fill({ color: 0x000000, alpha: 0.15 });
  root.addChild(armRest);

  // flip arm + palm (in front of the counter edge)
  const armFlip = new Container();
  armFlip.position.set(176, 166);
  const fa = new Graphics();
  fa.moveTo(0, 0).lineTo(-20, 16).stroke({ width: 11, color: VEST, cap: "round" });
  fa.moveTo(-20, 16).lineTo(-28, -8).stroke({ width: 8, color: VEST_D, cap: "round" });
  fa.ellipse(-29, -13, 6, 4.6).fill(SKIN);
  fa.ellipse(-33, -14, 2.4, 1.6).fill(SKIN_D);
  armFlip.addChild(fa);
  root.addChild(armFlip);

  // his own coin stacks by the flip hand
  const stacks = new Graphics();
  for (let s = 0; s < 2; s++)
    for (let i = 0; i < 4 - s; i++)
      stacks.ellipse(116 + s * 18, 200 - i * 3.6, 7.4, 2.6).fill(GOLD).stroke({ width: 0.8, color: "#a8842e" });
  root.addChild(stacks);

  // the flipped coin
  const coin = new Container();
  const coinG = new Graphics();
  coinG.circle(0, 0, 6.4).fill(GOLD).stroke({ width: 1.4, color: "#a8842e" });
  coinG.circle(0, 0, 3.6).stroke({ width: 1, color: "#c9992e", alpha: 0.8 });
  coin.addChild(coinG);
  root.addChild(coin);

  // fx layer (bloomed): coin glow, motes, sparkles
  const fx = new Container();
  const coinGlow = glowSprite(0, 0, 0.5, 0xffd968, 0.5);
  fx.addChild(coinGlow);
  const motes: Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const m = glowSprite(0, 0, 0.05 + 0.05 * h(i), 0xffd9a0, 0);
    motes.push(m);
    fx.addChild(m);
  }
  const ringStar = starSprite(378, 184, 0.3, 0xfff2c0);
  fx.addChild(ringStar);
  const signStar = starSprite(337, 54, 0.35, 0xfff2c0);
  fx.addChild(signStar);
  fx.filters = [new AdvancedBloomFilter({ threshold: 0.25, bloomScale: 1.1, blur: 5, quality: 4 })];
  root.addChild(fx);

  function tick(t: number, p: number) {
    // lamp sway + flicker
    lamp.rotation = 0.05 * Math.sin(t * 0.85);
    const fl = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3);
    flame.scale.set(1, 0.9 + 0.25 * fl);
    lampGlow.alpha = 0.4 + 0.25 * fl;
    beam.alpha = 0.8 + 0.2 * fl;
    beam.rotation = lamp.rotation * 0.7;
    pool.alpha = 0.13 + 0.07 * fl;
    pool.position.x = 84 + lamp.rotation * 0.7 * 140; // pool tracks the swinging cone
    // breathing
    torso.scale.set(1, 1 + 0.013 * Math.sin(t * 2.1));
    torso.position.y = -0.013 * Math.sin(t * 2.1) * 208;
    head.position.y = 114 + 1.6 * Math.sin(t * 2.1 + 0.5);
    // coin flip: 3.2s cycle, airborne for the first 55%
    const per = 3.2;
    const u = (t % per) / per;
    const palmX = 147;
    const palmY = 152;
    let cy = palmY;
    let cx = palmX;
    const airborne = u < 0.55;
    if (airborne) {
      const a = Math.sin(Math.PI * (u / 0.55));
      cy = palmY - 92 * a;
      cx = palmX + 8 * Math.sin(Math.PI * 2 * (u / 0.55));
    }
    coin.position.set(cx, cy);
    coin.scale.x = Math.max(0.12, Math.abs(Math.cos(t * 14)));
    coinGlow.position.set(cx, cy);
    coinGlow.alpha = airborne ? 0.55 : 0.3;
    // toss anticipation
    armFlip.rotation = airborne
      ? 0.06 * Math.sin(Math.PI * (u / 0.55))
      : -0.1 * ease((u - 0.55) / 0.2) * (1 - ease((u - 0.75) / 0.25));
    // eyes track the coin
    for (const pu of pupils) {
      pu.g.position.x = pu.baseX - 1.6;
      pu.g.position.y = pu.baseY + (airborne ? -1.8 * Math.sin(Math.PI * (u / 0.55)) : 1.2);
    }
    // blink
    const blink = t % 4.7 < 0.13 ? 0.15 : 1;
    eyes.scale.y = blink;
    eyes.position.y = (1 - blink) * -5;
    // ears: idle twitch + pleased perk
    const tw = t % 6.1 < 0.24 ? Math.sin(t * 42) * 0.1 : 0;
    earL.rotation = -EAR_BASE + tw - 0.28 * p;
    earR.rotation = EAR_BASE - tw * 0.4 + 0.28 * p;
    // monocle glint every ~5s
    monoGlint.alpha = (Math.max(0, Math.sin(t * 1.25) - 0.92) / 0.08) * 0.9;
    // balance scale rocks
    scaleBeam.rotation = 0.07 * Math.sin(t * 0.7);
    // motes drifting in the light cone
    for (let i = 0; i < motes.length; i++) {
      const sp = 0.35 + 0.4 * h(i, 1);
      const yy = 200 - ((t * 12 * sp + h(i, 2) * 160) % 160);
      const spread = (yy - 56) * 0.5; // cone half-width at this height
      const xx = 84 + beam.rotation * (yy - 56) + (h(i, 3) - 0.5) * spread * 1.5 + 8 * Math.sin(t * 0.5 + i * 2.2);
      motes[i].position.set(xx, yy);
      motes[i].alpha = 0.35 * Math.sin(Math.PI * clamp01((200 - yy) / 160)) * (0.6 + 0.4 * Math.sin(t * 2 + i));
    }
    // occasional sparkles on the wares
    ringStar.alpha = (Math.max(0, Math.sin(t * 0.9 + 2) - 0.94) / 0.06) * 0.9;
    ringStar.rotation = t * 1.5;
    signStar.alpha = (Math.max(0, Math.sin(t * 0.7 + 4) - 0.95) / 0.05) * 0.8;
    signStar.rotation = -t;
    // pleased: grin + tooth glint
    mouthGrin.alpha = p;
    mouthIdle.alpha = 1 - p;
    toothStar.alpha = p > 0.35 ? p : 0;
    toothStar.rotation = t * 3;
  }
  return { root, tick };
}

export function GrubbinsScene({ width, reactNonce = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactAtRef = useRef(-Infinity);
  const lastNonceRef = useRef(reactNonce);

  // A nonce bump marks "pleased" time without re-running the mount effect.
  if (reactNonce !== lastNonceRef.current) {
    lastNonceRef.current = reactNonce;
    reactAtRef.current = performance.now();
  }

  const height = Math.round((width * VIEW_H) / VIEW_W);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let app: Application | null = null;

    (async () => {
      const a = new Application();
      await a.init({
        width,
        height,
        antialias: true,
        background: "#0b0810",
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      // init is async: the component may already be gone (or StrictMode
      // double-mounted) — never attach a canvas to a dead host.
      if (disposed) {
        a.destroy(true, { children: true });
        return;
      }
      app = a;
      host.appendChild(a.canvas);
      a.stage.scale.set(width / VIEW_W);
      const scene = buildScene();
      a.stage.addChild(scene.root);
      const t0 = performance.now();
      a.ticker.add(() => {
        const now = performance.now();
        scene.tick((now - t0) / 1000, Math.max(0, 1 - (now - reactAtRef.current) / REACT_MS));
      });
    })().catch((e) => {
      // WebGL unavailable: leave the (styled, empty) host rather than crash the shop.
      console.error("GrubbinsScene: pixi init failed", e);
    });

    return () => {
      disposed = true;
      // textures are module-scope + shared across mounts: destroy children,
      // but NOT textures.
      if (app) app.destroy(true, { children: true });
    };
  }, [width, height]);

  return (
    <div
      ref={hostRef}
      style={{ width, height, display: "block" }}
      aria-label="Grubbins the goblin pawnbroker, leaning over his counter"
      role="img"
    />
  );
}
