// ============================================================================
// BlacksmithScene — the Forge's animated set piece (PixiJS v8 + bloom, the
// GrubbinsScene mold). CHARACTER PENDING: the smith himself lands after the
// mockup pick; this shell ships the full contract — the set (forge, anvil,
// quench barrel, embers) and every act timeline (craft / montage / salvage /
// commission, with the REAL item icons riding the anvil via drawItemIcon) —
// so the screen can be built and verified against it.
//
// Contract: bump `act.nonce` to run a sequence; a new nonce preempts. The
// exported *_MS timings let the screen schedule its reveal SFX/stingers to
// land exactly on the scene's beats. The SCENE owns frame-synced strike
// clangs (playSfx("anvil") on hammer frames); the screen owns transactional
// cues (coinSpend/uiDeny/itemReveal/levelup).
//
// Pixi gotchas (inherited from GrubbinsScene — NOTES §10): Application.init
// is async, so a `disposed` guard covers unmount/StrictMode races; canvas-
// generated textures (texCache + iconTexCache) are module-scope and SHARED
// across mounts, so app.destroy must never pass texture:true.
// ============================================================================

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { drawItemIcon } from "./ItemIcon";
import { RARITIES } from "@/data/rarities";
import { parseItemKey } from "@/data/items";
import { playSfx } from "@/audio/sfx";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export type SmithActKind = "craft" | "montage" | "salvage" | "commission";

export interface SmithAct {
  /** Bump to trigger; a new nonce preempts a running sequence. */
  nonce: number;
  kind: SmithActKind;
  /** craft: the fuel key (two icons slide in); salvage: the melted key. */
  fromKey?: string;
  /** craft/commission: the result key that rises glowing. */
  toKey?: string;
  /** montage: total merges (visuals clamp to MONTAGE_MAX_STEPS). */
  count?: number;
  /** craft: quality crossed — bigger, gold-tinted finish. */
  qualityUp?: boolean;
}

interface Props {
  /** CSS pixel width; height follows the scene's 10:7 aspect. */
  width: number;
  act?: SmithAct | null;
}

// Logical drawing space.
const VIEW_W = 400;
const VIEW_H = 280;
/** Width/height ratio, for callers sizing the scene from available height. */
export const SCENE_ASPECT = VIEW_W / VIEW_H;

// Sequence beats (ms) — the screen syncs reveal SFX/stingers to these.
export const CRAFT_REVEAL_MS = 1650;
export const CRAFT_TOTAL_MS = 3100;
export const SALVAGE_MS = 1300;
export const SALVAGE_TOTAL_MS = 2000;
export const COMMISSION_REVEAL_MS = 1250;
export const COMMISSION_TOTAL_MS = 2600;
export const MONTAGE_STEP_MS = 450;
export const MONTAGE_MAX_STEPS = 8;
export function montageTotalMs(count: number): number {
  return (
    Math.min(Math.max(1, count), MONTAGE_MAX_STEPS) * MONTAGE_STEP_MS + 700
  );
}

function actTotalMs(act: SmithAct): number {
  switch (act.kind) {
    case "craft":
      return CRAFT_TOTAL_MS;
    case "salvage":
      return SALVAGE_TOTAL_MS;
    case "commission":
      return COMMISSION_TOTAL_MS;
    case "montage":
      return montageTotalMs(act.count ?? 1);
  }
}

/** Hammer-strike offsets (seconds) per act — SFX and impact visuals share it. */
function strikeTimes(act: SmithAct): number[] {
  switch (act.kind) {
    case "craft":
      return [0.75, 1.05, 1.35];
    case "commission":
      return [0.55, 0.85];
    case "salvage":
      return [];
    case "montage": {
      const n = Math.min(Math.max(1, act.count ?? 1), MONTAGE_MAX_STEPS);
      return Array.from(
        { length: n },
        (_, i) => ((i + 0.55) * MONTAGE_STEP_MS) / 1000
      );
    }
  }
}

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
const hexNum = (hex: string) => parseInt(hex.slice(1), 16);
const clampByte = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x);
// shade a packed 0xRRGGBB colour by a signed per-channel delta
const shadeNum = (n: number, a: number) =>
  (clampByte((n >> 16 & 255) + a) << 16) |
  (clampByte((n >> 8 & 255) + a) << 8) |
  clampByte((n & 255) + a);

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

let texCache: { soft: Texture; star: Texture; wall: Texture; floor: Texture } | null =
  null;
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
    wall: vg(400, 214, [[0, "#1a1218"], [0.55, "#291d23"], [1, "#33252a"]]),
    floor: vg(400, 66, [[0, "#40301f"], [1, "#241811"]]),
  };
  return texCache;
}

// Item icons as Pixi textures — the ACTUAL bag icons ride the anvil. Module
// scope + never destroyed, same rule as texCache.
const iconTexCache = new Map<string, Texture>();
function itemIconTexture(key: string): Texture {
  const hit = iconTexCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const x = c.getContext("2d");
  if (x) drawItemIcon(x, key, 96, true);
  const tex = Texture.from(c);
  iconTexCache.set(key, tex);
  return tex;
}

function glowSprite(
  x: number,
  y: number,
  scale: number,
  tint: number,
  alpha: number
): Sprite {
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

/** What tick() receives while a sequence runs. `runtime.fired` persists across
 *  frames so strike SFX/bursts fire exactly once per scheduled hit. */
interface ActRun {
  act: SmithAct;
  /** Seconds since the nonce bump. */
  el: number;
  runtime: { fired: number };
}

// Stage landmarks (logical px). The anvil is drawn 1.7× and shifted right of
// centre; its base stays pinned to the floor, and the striking FACE — where the
// crafting theatre (sparks, sliding fuel, the rising result) lands — follows the
// scale via ANVIL_TOP, so the animation lines up with the bigger anvil.
const ANVIL_X = 200;
const ANVIL_SCALE = 1.7;
const ANVIL_BASE_Y = 240; // stump bottom, resting on the floor
const ANVIL_Y = ANVIL_BASE_Y - 34 * ANVIL_SCALE; // container origin (local 0,0)
const ANVIL_TOP = ANVIL_Y - 10 * ANVIL_SCALE; // striking face ≈ 165
const FORGE_X = 64;
const FORGE_Y = 150;
const BARREL_SCALE = 1.6;

// ---------------------------------------------------------------------------
// The scene. Built once per mount; tick(t, run) animates it. The placeholder
// set is final-ish (forge/anvil/quench); the CHARACTER is added by the mockup
// winner in its own layer without touching the act machinery.
// ---------------------------------------------------------------------------
function buildScene(): {
  root: Container;
  tick: (t: number, run: ActRun | null) => void;
} {
  const root = new Container();
  const tx = textures();

  // ---- set: wall, floor ----------------------------------------------------
  const wall = new Sprite(tx.wall);
  wall.position.set(0, 0);
  root.addChild(wall);
  const floor = new Sprite(tx.floor);
  floor.position.set(0, 214);
  root.addChild(floor);
  const floorShadow = new Graphics();
  floorShadow.rect(0, 214, 400, 7).fill({ color: 0x000000, alpha: 0.35 });
  root.addChild(floorShadow);

  // stone coursing
  const stones = new Graphics();
  for (let r = 0; r < 6; r++) {
    const y = 10 + r * 34;
    stones.moveTo(0, y).lineTo(400, y);
    for (let i = 0; i < 7; i++) {
      const x = ((i + (r % 2) * 0.5) * 62 + h(r * 7 + i) * 10) % 412;
      stones.moveTo(x, y).lineTo(x, y + 34);
    }
  }
  stones.stroke({ width: 2, color: 0x120c12, alpha: 0.55 });
  root.addChild(stones);

  // ---- set: working-smithy props (wall tool-rack + cooling blades) ---------
  const props = new Graphics();
  // wooden peg rail
  props.rect(150, 44, 150, 6).fill(0x3a2a1c).rect(150, 50, 150, 2).fill(0x2a1e14);
  // hanging hammer 1
  props.moveTo(168, 50).lineTo(168, 84).stroke({ width: 3, color: 0x5a4636 });
  props.rect(160, 50, 16, 10).fill(0x4c4e58).rect(160, 58, 16, 2).fill(0x2f3138);
  // tongs
  props
    .moveTo(205, 50).lineTo(200, 92)
    .moveTo(213, 50).lineTo(218, 92)
    .stroke({ width: 2.5, color: 0x3a3c44 });
  props.arc(209, 50, 5, 0, Math.PI).stroke({ width: 2.5, color: 0x4a4c54 });
  // air blower (bellows) hung on the rail — where the horseshoe used to be
  props.moveTo(250, 50).lineTo(250, 57).stroke({ width: 2, color: 0x3a2a1c }); // hook
  props.rect(236, 57, 28, 5).fill(0x6a4630); // top paddle
  props.rect(235, 54, 5, 5).fill(0x7a5238).rect(260, 54, 5, 5).fill(0x7a5238); // knobs
  props
    .moveTo(237, 62)
    .quadraticCurveTo(234, 76, 246, 84)
    .lineTo(247, 92).lineTo(253, 92).lineTo(254, 84)
    .quadraticCurveTo(266, 76, 263, 62)
    .fill(0x5a3a24); // leather body → nozzle
  for (let i = 0; i < 3; i++) {
    const yy = 67 + i * 5, w = 12 - i * 2.5;
    props.moveTo(250 - w, yy).lineTo(250 + w, yy);
  }
  props.stroke({ width: 1.4, color: 0x3c2617 }); // pleats
  props.rect(248, 90, 4, 5).fill(0x2a1a10); // nozzle tip
  // hammer 2
  props.moveTo(283, 50).lineTo(283, 80).stroke({ width: 3, color: 0x5a4636 });
  props.rect(276, 50, 14, 9).fill(0x54463a);
  root.addChild(props);
  // finished blades leaning by the quench (behind the barrel, added next)
  for (let i = 0; i < 2; i++) {
    const b = new Graphics();
    b.rect(-2, -40, 4, 40).fill(0x6a6d78)
      .rect(-2, -40, 1.5, 40).fill(0x8d909b)
      .rect(-3, -2, 6, 8).fill(0x3a2a1c);
    b.position.set(312 + i * 9, 206);
    b.rotation = -0.22 + i * 0.06;
    root.addChild(b);
  }

  // ---- set: small-brick hearth under the forge (grounds the fire) ----------
  const hearth = new Graphics();
  {
    const x0 = FORGE_X - 50, x1 = FORGE_X + 50, y0 = 183, y1 = 214, bw = 13, bh = 7;
    hearth.rect(x0, y0, x1 - x0, y1 - y0).fill(0x241812); // mortar bed
    for (let row = 0, y = y0; y < y1; row++, y += bh) {
      const off = (row % 2) * (bw / 2);
      for (let x = x0 - off; x < x1; x += bw) {
        const bx = Math.max(x0, x), bxe = Math.min(x1, x + bw - 1.5);
        if (bxe <= bx) continue;
        hearth
          .rect(bx, y + 1, bxe - bx, bh - 2)
          .fill(shadeNum(0x372619, Math.round((h(row * 13 + x) - 0.5) * 16)));
      }
    }
    hearth.rect(FORGE_X - 42, 181, 84, 3).fill(0x4a2c18); // warm hearth lip
  }
  root.addChild(hearth);

  // ---- set: the forge (arch + fire) ----------------------------------------
  const forge = new Container();
  forge.position.set(FORGE_X, FORGE_Y);
  const hood = new Graphics();
  hood
    .poly([-46, -34, 46, -34, 30, -78, -30, -78])
    .fill(0x1d1512)
    .rect(-24, -150, 48, 74) // smoke flue, run to the ceiling
    .fill(0x1d1512)
    .rect(-24, -150, 4, 74) // lit left edge
    .fill(shadeNum(0x1d1512, 14))
    .rect(20, -150, 4, 74) // shadowed right edge
    .fill(shadeNum(0x1d1512, -8));
  forge.addChild(hood);
  const arch = new Graphics();
  arch
    .moveTo(-52, 34)
    .lineTo(-52, -8)
    .arc(0, -8, 52, Math.PI, 0)
    .lineTo(52, 34)
    .closePath()
    .fill(0x3a251d);
  forge.addChild(arch);
  const cavity = new Graphics();
  cavity
    .moveTo(-38, 34)
    .lineTo(-38, -6)
    .arc(0, -6, 38, Math.PI, 0)
    .lineTo(38, 34)
    .closePath()
    .fill(0x0d0605);
  forge.addChild(cavity);
  const coalBed = new Graphics();
  coalBed.rect(-38, 27, 76, 8).fill(0x3a1206);
  forge.addChild(coalBed);
  root.addChild(forge);

  // ---- set: the anvil ------------------------------------------------------
  const anvil = new Container();
  anvil.position.set(ANVIL_X, ANVIL_Y);
  anvil.scale.set(ANVIL_SCALE);
  const stump = new Graphics();
  stump.rect(-20, 12, 40, 22).fill(0x42301e).rect(-20, 12, 40, 5).fill(0x33241a);
  anvil.addChild(stump);
  const body = new Graphics();
  body
    .poly([
      -30, -2, 30, -2, 44, -8, 46, -4, 38, 2, 14, 4, 10, 12, -12, 12, -16, 4,
      -30, 2,
    ])
    .fill(0x4c4e58)
    .rect(-30, -8, 60, 6)
    .fill(0x6a6d78)
    .rect(-30, 0, 60, 2)
    .fill(0x2f3138);
  anvil.addChild(body);
  root.addChild(anvil);

  // ---- set: quench vat (1.6×, base pinned to the floor) --------------------
  const barrel = new Graphics();
  barrel
    .rect(-15, -20, 30, 24)
    .fill(0x42301f)
    .rect(-15, -8, 30, 2)
    .fill(0x38291a) // second hoop band
    .rect(-15, -12, 30, 2)
    .fill(0x2a1c12)
    .ellipse(0, -20, 14, 3.4)
    .fill(0x1c2b32) // water surface
    .ellipse(0, -20, 10, 2.2)
    .fill(0x274550); // lighter inner pool
  barrel.position.set(352, 223.6);
  barrel.scale.set(BARREL_SCALE);
  root.addChild(barrel);

  // forge light-pool on the floor — masked to the floor band so it never
  // climbs the wall. Soft texture already reads as light, so it lives outside
  // the bloomed fx (avoids filter+mask interplay).
  const floorMask = new Graphics();
  floorMask.rect(0, 214, 400, 66).fill(0xffffff);
  root.addChild(floorMask);
  const floorPool = glowSprite(FORGE_X, 228, 1, 0xff9a3c, 0.18);
  floorPool.scale.set(2.0, 0.62);
  floorPool.mask = floorMask;
  root.addChild(floorPool);

  // The forge fire is PURE ADDITIVE, exactly like the mockup — it lives in its
  // own un-bloomed layer so the many stacked glows don't blow out. (The first
  // build put the fire inside the bloomed fx, which over-brightened it.) Bloom
  // is reserved below for the transient crafting sparks/flash only.
  const fireLayer = new Container();
  root.addChild(fireLayer);

  // ---- fx layer (bloomed): crafting sparks / flash / result glow ------------
  const fx = new Container();
  root.addChild(fx);
  fx.filters = [
    new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 0.9, blur: 4, quality: 4 }),
  ];

  // roaring forge: room wash, deep-mouth heat + hot core (breathe in tick)
  const TINT_MOUTH = 0xff9a3c, TINT_CORE = 0xffe08a;
  const roomGlow = glowSprite(200, 150, 3.6, TINT_MOUTH, 0.09);
  const mouthHeat = glowSprite(FORGE_X, FORGE_Y + 8, 1.7, TINT_MOUTH, 0.34);
  const hotCore = glowSprite(FORGE_X, FORGE_Y + 14, 0.6, 0xfff4d0, 0.5);
  fireLayer.addChild(roomGlow, mouthHeat, hotCore);

  // glowing coals across the bed
  const coals: Sprite[] = [];
  for (let i = 0; i < 8; i++) {
    const c = glowSprite(
      FORGE_X - 34 + i * 10,
      FORGE_Y + 30,
      0.16,
      i % 2 ? TINT_CORE : TINT_MOUTH,
      0.4
    );
    coals.push(c);
    fireLayer.addChild(c);
  }

  // flame tongues (redrawn per frame) + inner-arch rim light (alpha in tick)
  const flames = new Graphics();
  flames.blendMode = "add";
  fireLayer.addChild(flames);
  const archRim = new Graphics();
  archRim.arc(FORGE_X, FORGE_Y - 6, 38, Math.PI, 0).stroke({ width: 3, color: TINT_MOUTH });
  archRim.blendMode = "add";
  fireLayer.addChild(archRim);

  // gentle shimmer on the quench-vat surface
  const barrelShimmer = glowSprite(352, 192, 0.32, 0x7fb0c0, 0.1);
  fireLayer.addChild(barrelShimmer);

  // busier rising embers (hash-driven, stateless)
  const embers: Sprite[] = [];
  for (let i = 0; i < 16; i++) {
    const e = glowSprite(FORGE_X, FORGE_Y, 0.1, i % 3 ? 0xffb060 : TINT_CORE, 0);
    embers.push(e);
    fireLayer.addChild(e);
  }

  // ---- act theater ----------------------------------------------------------
  const fuelA = new Sprite();
  const fuelB = new Sprite();
  const result = new Sprite();
  for (const s of [fuelA, fuelB, result]) {
    s.anchor.set(0.5);
    s.alpha = 0;
    root.addChild(s);
  }
  const resultGlow = glowSprite(ANVIL_X, ANVIL_TOP, 1.2, 0xffc060, 0);
  const flash = glowSprite(ANVIL_X, ANVIL_TOP, 1.6, 0xffffff, 0);
  const meltPool = glowSprite(ANVIL_X, ANVIL_TOP + 4, 0.9, 0xff8030, 0);
  fx.addChild(resultGlow, flash, meltPool);

  // coin stack for commissions
  const coins = new Graphics();
  for (let i = 0; i < 4; i++) {
    coins.ellipse(0, -i * 5, 11, 4).fill(0xd8b04a).ellipse(0, -i * 5 - 1, 11, 4).stroke({ width: 1, color: 0x8a6a1c });
  }
  coins.alpha = 0;
  root.addChild(coins);

  // spark pool
  interface Spark {
    s: Sprite;
    born: number;
    vx: number;
    vy: number;
    life: number;
  }
  const sparks: Spark[] = [];
  for (let i = 0; i < 14; i++) {
    const s = starSprite(ANVIL_X, ANVIL_TOP, 0.16, 0xffd888);
    sparks.push({ s, born: -1, vx: 0, vy: 0, life: 0 });
    fx.addChild(s);
  }
  function burstSparks(t: number, n: number, big: boolean) {
    let spawned = 0;
    for (const sp of sparks) {
      if (spawned >= n) break;
      if (sp.born >= 0 && t - sp.born < sp.life) continue;
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const speed = (big ? 120 : 70) + Math.random() * (big ? 160 : 90);
      sp.born = t;
      sp.vx = Math.cos(a) * speed;
      sp.vy = Math.sin(a) * speed;
      sp.life = 0.4 + Math.random() * 0.3;
      spawned++;
    }
  }

  function hideActLayer() {
    fuelA.alpha = fuelB.alpha = result.alpha = 0;
    resultGlow.alpha = flash.alpha = meltPool.alpha = 0;
    coins.alpha = 0;
  }

  // Per-nonce texture setup, done lazily on the first frame of a run.
  let armedNonce = -1;
  function armAct(act: SmithAct) {
    if (armedNonce === act.nonce) return;
    armedNonce = act.nonce;
    hideActLayer();
    if (act.fromKey) {
      const tex = itemIconTexture(act.fromKey);
      fuelA.texture = tex;
      fuelB.texture = tex;
      fuelA.scale.set(0.42);
      fuelB.scale.set(0.42);
    }
    if (act.toKey) {
      result.texture = itemIconTexture(act.toKey);
      result.scale.set(0.5);
      const q = parseItemKey(act.toKey)?.quality;
      resultGlow.tint = q ? hexNum(RARITIES[q].color) : 0xffc060;
    }
  }

  // ---- the animation --------------------------------------------------------
  function tick(t: number, run: ActRun | null) {
    // idle set: roaring fire, glowing coals, licking flames, drifting embers
    const flick =
      0.75 + Math.sin(t * 8.2) * 0.12 + (h(Math.floor(t * 13)) - 0.5) * 0.18;
    roomGlow.alpha = 0.06 + flick * 0.045;
    floorPool.alpha = 0.16 + flick * 0.05;
    mouthHeat.alpha = 0.34 * flick + 0.16;
    mouthHeat.scale.set(1.5 + flick * 0.3);
    hotCore.alpha = 0.5 * flick + 0.25;
    hotCore.scale.set(0.55 + flick * 0.15);
    archRim.alpha = 0.16 + flick * 0.08;
    for (let i = 0; i < coals.length; i++) {
      const pulse = 0.5 + Math.sin(t * 3 + i * 1.3) * 0.5;
      coals[i].alpha = 0.35 + pulse * 0.35;
      coals[i].scale.set(0.14 + pulse * 0.06);
    }
    // flame tongues: [baseX, baseY, height, width, phase, colour, alpha]
    flames.clear();
    const F: number[][] = [
      [FORGE_X - 14, FORGE_Y + 30, 52, 26, 0.0, 0xff9a3c, 0.35],
      [FORGE_X + 12, FORGE_Y + 30, 60, 28, 1.7, 0xff9a3c, 0.35],
      [FORGE_X - 2, FORGE_Y + 31, 74, 30, 3.1, 0xff7a28, 0.4],
      [FORGE_X - 2, FORGE_Y + 31, 44, 16, 2.2, 0xffe08a, 0.6],
    ];
    for (const [x, baseY, ht, w, seed, color, a] of F) {
      const sway =
        Math.sin(t * 5.5 + seed) * w * 0.35 + Math.sin(t * 11 + seed * 2) * w * 0.12;
      const tipX = x + sway, tipY = baseY - ht * (0.9 + Math.sin(t * 7 + seed) * 0.1);
      flames
        .moveTo(x - w / 2, baseY)
        .quadraticCurveTo(x - w * 0.35, baseY - ht * 0.5, tipX, tipY)
        .quadraticCurveTo(x + w * 0.35, baseY - ht * 0.5, x + w / 2, baseY)
        .fill({ color, alpha: a });
    }
    barrelShimmer.position.x = 352 + Math.sin(t * 1.3) * 8;
    barrelShimmer.alpha = 0.1 + Math.sin(t * 2.1) * 0.04;
    for (let i = 0; i < embers.length; i++) {
      const sp = 0.5 + h(i) * 0.7;
      const p = ((t * 0.14 * sp) + h(i, 1)) % 1;
      embers[i].position.set(
        FORGE_X + (h(i, 2) - 0.5) * 54 + Math.sin(t * 1.5 + i * 1.7) * 7,
        FORGE_Y + 18 - p * 128
      );
      embers[i].alpha = (1 - p) * 0.5 * (0.4 + h(i, 3) * 0.6);
      embers[i].scale.set(0.05 + h(i, 4) * 0.06);
    }

    // sparks age out regardless of act state
    for (const sp of sparks) {
      if (sp.born < 0) continue;
      const age = t - sp.born;
      if (age > sp.life) {
        sp.born = -1;
        sp.s.alpha = 0;
        continue;
      }
      sp.s.position.set(
        sp.s.position.x + sp.vx * (1 / 60),
        sp.s.position.y + sp.vy * (1 / 60)
      );
      sp.vy += 340 / 60;
      sp.s.alpha = 1 - age / sp.life;
      sp.s.rotation = age * 6;
    }

    if (!run || run.el * 1000 > actTotalMs(run.act)) {
      hideActLayer();
      return;
    }

    const { act, el } = run;
    armAct(act);

    // frame-synced strike clangs + impact bursts (each fires exactly once)
    const times = strikeTimes(act);
    const due = times.filter((st) => el >= st).length;
    while (run.runtime.fired < due) {
      run.runtime.fired++;
      playSfx("anvil");
      burstSparks(t, act.kind === "montage" ? 5 : 8, act.kind !== "montage");
      // reset spark origin to the anvil for each burst
      for (const sp of sparks) {
        if (sp.born === t) sp.s.position.set(ANVIL_X + (Math.random() - 0.5) * 10, ANVIL_TOP);
      }
    }
    const lastHit = due > 0 ? times[due - 1] : -Infinity;
    const hitFlash = Math.max(0, 1 - (el - lastHit) / 0.28);

    if (act.kind === "craft" || act.kind === "commission") {
      const revealAt =
        (act.kind === "craft" ? CRAFT_REVEAL_MS : COMMISSION_REVEAL_MS) / 1000;
      const total =
        (act.kind === "craft" ? CRAFT_TOTAL_MS : COMMISSION_TOTAL_MS) / 1000;
      // 1) payment slides in
      const slide = ease(el / (act.kind === "craft" ? 0.6 : 0.4));
      if (act.kind === "craft" && act.fromKey) {
        fuelA.position.set(-40 + slide * (ANVIL_X - 16 + 40), ANVIL_TOP - 34 + slide * 30);
        fuelB.position.set(440 - slide * (440 - (ANVIL_X + 16)), ANVIL_TOP - 34 + slide * 30);
        const gone = el > revealAt - 0.12 ? 0 : 1;
        fuelA.alpha = fuelB.alpha = Math.min(1, slide * 1.4) * gone;
        // squash on each hit
        const sq = 1 - hitFlash * 0.18;
        fuelA.scale.set(0.42, 0.42 * sq);
        fuelB.scale.set(0.42, 0.42 * sq);
      }
      if (act.kind === "commission") {
        coins.position.set(440 - slide * (440 - ANVIL_X), ANVIL_TOP + 2);
        coins.alpha = el > 0.95 ? Math.max(0, 1 - (el - 0.95) / 0.2) : Math.min(1, slide * 1.4);
      }
      // 2) anvil flash on hits + the big finish
      const finish = clamp01((el - (revealAt - 0.15)) / 0.15);
      const finishFade = clamp01((el - revealAt) / 0.3);
      flash.tint = act.qualityUp ? 0xffd870 : 0xffffff;
      flash.alpha = Math.max(
        hitFlash * 0.5,
        finish * (act.qualityUp ? 1 : 0.75) * (1 - finishFade)
      );
      flash.scale.set(1.3 + finish * (act.qualityUp ? 1.3 : 0.7));
      // 3) the result rises
      if (act.toKey && el >= revealAt) {
        const rise = ease((el - revealAt) / 0.5);
        const fade = clamp01((el - (total - 0.4)) / 0.4);
        result.position.set(ANVIL_X, ANVIL_TOP - 8 - rise * 40);
        result.alpha = Math.min(1, rise * 1.6) * (1 - fade);
        result.scale.set(0.5 + Math.sin(Math.min(1, rise) * Math.PI) * 0.06);
        resultGlow.position.set(result.position.x, result.position.y);
        resultGlow.alpha = (0.5 + Math.sin(t * 5) * 0.08) * result.alpha;
        resultGlow.scale.set(1 + rise * 0.4);
      }
    } else if (act.kind === "salvage") {
      // item drops to the anvil, slides into the forge mouth, melts
      const drop = ease(el / 0.4);
      const sweep = ease((el - 0.45) / 0.45);
      if (act.fromKey) {
        const x = ANVIL_X - sweep * (ANVIL_X - FORGE_X);
        const y = ANVIL_TOP - 30 + drop * 30 + Math.sin(sweep * Math.PI) * -8;
        fuelA.position.set(x, y);
        fuelA.alpha = Math.min(1, drop * 1.5) * (1 - clamp01((el - 0.95) / 0.25));
        fuelA.scale.set(0.42 * (1 - sweep * 0.4));
        fuelB.alpha = 0;
      }
      const melt = clamp01((el - 0.85) / 0.35);
      const meltFade = clamp01((el - (SALVAGE_MS / 1000 + 0.25)) / 0.45);
      meltPool.position.set(FORGE_X, FORGE_Y + 12);
      meltPool.alpha = melt * 0.9 * (1 - meltFade);
      meltPool.scale.set(0.7 + melt * 0.8);
      if (run.runtime.fired === 0 && el >= SALVAGE_MS / 1000) {
        run.runtime.fired = 1;
        burstSparks(t, 7, false);
        for (const sp of sparks) {
          if (sp.born === t) {
            sp.s.position.set(FORGE_X + (Math.random() - 0.5) * 16, FORGE_Y + 8);
            sp.s.tint = 0xffd44a; // gold — coin value out of the crucible
          }
        }
      }
    } else if (act.kind === "montage") {
      // a hot billet pulses on the anvil while strikes rain
      const totalS = actTotalMs(act) / 1000;
      const finish = clamp01((el - (totalS - 0.7)) / 0.2);
      const finishFade = clamp01((el - (totalS - 0.5)) / 0.5);
      flash.tint = 0xffffff;
      flash.alpha = Math.max(hitFlash * 0.45, finish * 0.9 * (1 - finishFade));
      flash.scale.set(1.2 + finish * 1.1);
      meltPool.position.set(ANVIL_X, ANVIL_TOP + 2);
      meltPool.alpha = 0.4 + hitFlash * 0.5 - finishFade * 0.9;
      meltPool.scale.set(0.5 + hitFlash * 0.25);
    }
  }

  return { root, tick };
}

// ---------------------------------------------------------------------------
// The component — GrubbinsScene's lifecycle harness with the act-nonce
// trigger generalized (render-time ref compare; never re-runs the effect).
// ---------------------------------------------------------------------------
export function BlacksmithScene({ width, act = null }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<{ act: SmithAct; at: number; fired: number } | null>(
    null
  );
  const lastNonceRef = useRef(0);

  if (act && act.nonce !== lastNonceRef.current) {
    lastNonceRef.current = act.nonce;
    runRef.current = { act, at: performance.now(), fired: 0 };
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
        const r = runRef.current;
        scene.tick(
          (now - t0) / 1000,
          r
            ? { act: r.act, el: (now - r.at) / 1000, runtime: r }
            : null
        );
      });
    })().catch((e) => {
      // WebGL unavailable: leave the (styled, empty) host rather than crash.
      console.error("BlacksmithScene: pixi init failed", e);
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
      aria-label="The smithy — forge fire, anvil, and the blacksmith at work"
      role="img"
    />
  );
}
