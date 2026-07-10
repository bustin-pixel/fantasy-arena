// ============================================================================
// GrubbinsScene — the shop's animated set piece: Grubbins the goblin
// pawnbroker leaning over his counter in a gritty, lantern-lit den.
// Same self-contained procedural-canvas pattern as ChestSprite (rAF loop,
// dpr-aware, pure presentation — Math.random-free here too, but only for
// tidiness: nothing in the sim reads this). Deliberately HIGHER fidelity than
// assets/sprites.ts — this is a full-screen set piece, not a battle sprite
// (approved "Gritty Pawn-Den" mockup, 2026-07-09).
// ============================================================================

import { useEffect, useRef } from "react";

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

export function GrubbinsScene({ width, reactNonce = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reactAtRef = useRef(-Infinity);
  const lastNonceRef = useRef(reactNonce);

  // A nonce bump marks "pleased" time without re-running the canvas effect.
  if (reactNonce !== lastNonceRef.current) {
    lastNonceRef.current = reactNonce;
    reactAtRef.current = performance.now();
  }

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

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      const pleased = Math.max(
        0,
        1 - (now - reactAtRef.current) / REACT_MS
      );
      drawScene(ctx, (now - t0) / 1000, pleased);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
      aria-label="Grubbins the goblin pawnbroker, leaning over his counter"
      role="img"
    />
  );
}

// ---------------------------------------------------------------------------
// Drawing. One scene, drawn back-to-front each frame:
// wall & junk → lantern/beam/motes → Grubbins (minus the counter hand) →
// counter → counter props → the drumming hand → vignette.
// `pleased` (1→0) overlays the purchase reaction: perked ears, raised brows,
// a wider grin and a tooth glint.
// ---------------------------------------------------------------------------

const SKIN = "#567040";
const VEST = "#4a3524";
const WALL_BG = "#1e1610";

function drawScene(
  X: CanvasRenderingContext2D,
  t: number,
  pleased: number
): void {
  // -- tiny shared helpers (close over X) ----------------------------------
  const clamp255 = (x: number) => Math.max(0, Math.min(255, x));
  const S = (h: string, a: number): string => {
    const n = parseInt(h.slice(1), 16);
    return `rgb(${clamp255((n >> 16 & 255) + a)},${clamp255((n >> 8 & 255) + a)},${clamp255((n & 255) + a)})`;
  };
  const RR = (x: number, y: number, w: number, h: number, r: number) => {
    X.beginPath();
    X.moveTo(x + r, y);
    X.arcTo(x + w, y, x + w, y + h, r);
    X.arcTo(x + w, y + h, x, y + h, r);
    X.arcTo(x, y + h, x, y, r);
    X.arcTo(x, y, x + w, y, r);
    X.closePath();
  };
  const EL = (x: number, y: number, rx: number, ry: number) => {
    X.beginPath();
    X.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  };
  const LG2 = (
    x0: number, y0: number, x1: number, y1: number, c0: string, c1: string
  ) => {
    const g = X.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  };
  const GLOW = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = X.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    X.fillStyle = g;
    X.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const AO = (x: number, y: number, rx: number, ry: number, a: number) => {
    X.save();
    X.translate(x, y);
    X.scale(rx, ry);
    const g = X.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    X.fillStyle = g;
    X.beginPath();
    X.arc(0, 0, 1, 0, Math.PI * 2);
    X.fill();
    X.restore();
  };
  const limb = (
    x1: number, y1: number, x2: number, y2: number, w: number, c: string
  ) => {
    X.strokeStyle = c;
    X.lineWidth = w;
    X.lineCap = "round";
    X.beginPath();
    X.moveTo(x1, y1);
    X.lineTo(x2, y2);
    X.stroke();
  };
  const blink = (per: number, off: number) => (t + off) % per < 0.12;
  const sparkle = (x: number, y: number, r: number, col: string, a: number) => {
    X.save();
    X.globalAlpha = Math.max(0, a);
    X.strokeStyle = col;
    X.lineWidth = 1.6;
    X.beginPath();
    X.moveTo(x - r, y);
    X.lineTo(x + r, y);
    X.moveTo(x, y - r);
    X.lineTo(x, y + r);
    X.stroke();
    X.restore();
  };

  // -- back wall + junk ------------------------------------------------------
  X.fillStyle = LG2(0, 0, 0, VIEW_H, WALL_BG, "#0e0a06");
  X.fillRect(0, 0, VIEW_W, VIEW_H);
  // Grubbins' silhouette cast on the wall by the lantern.
  X.fillStyle = "rgba(0,0,0,.25)";
  X.beginPath();
  X.ellipse(150, 120, 52, 66, 0.1, 0, Math.PI * 2);
  X.fill();
  // Hanging dagger with a swinging price tag.
  X.strokeStyle = "#3a3026";
  X.lineWidth = 2;
  X.beginPath();
  X.moveTo(58, 34);
  X.lineTo(58, 44);
  X.stroke();
  X.fillStyle = "#8d99a6";
  X.beginPath();
  X.moveTo(58, 44);
  X.lineTo(62, 58);
  X.lineTo(58, 84);
  X.lineTo(54, 58);
  X.closePath();
  X.fill();
  X.fillStyle = VEST;
  X.fillRect(52, 44, 12, 5);
  X.fillStyle = "#c4b89e";
  X.save();
  X.translate(70, 52);
  X.rotate(0.2 + Math.sin(t * 0.9) * 0.04);
  X.fillRect(0, 0, 10, 7);
  X.restore();
  // Bottle shelf + a watching skull.
  X.fillStyle = "#4e4438";
  X.fillRect(24, 96, 110, 6);
  X.fillStyle = "#4e5a3e";
  RR(34, 76, 11, 20, 2);
  X.fill();
  X.fillStyle = "#5a4a6e";
  RR(52, 72, 10, 24, 2);
  X.fill();
  X.fillStyle = "#6e4a3a";
  RR(70, 80, 12, 16, 2);
  X.fill();
  X.fillStyle = "rgba(255,255,255,.1)";
  X.fillRect(36, 79, 2.6, 12);
  X.fillRect(54, 75, 2.6, 14);
  X.fillStyle = "#d8cdb4";
  EL(112, 88, 8, 7);
  X.fill();
  X.fillStyle = "#0e0a06";
  EL(109, 87, 1.8, 2.2);
  X.fill();
  EL(115, 87, 1.8, 2.2);
  X.fill();
  // Slumped loot sack.
  X.fillStyle = "#57452e";
  X.beginPath();
  X.moveTo(10, 196);
  X.quadraticCurveTo(6, 158, 26, 152);
  X.quadraticCurveTo(46, 150, 44, 172);
  X.quadraticCurveTo(43, 186, 40, 196);
  X.closePath();
  X.fill();
  X.strokeStyle = "rgba(0,0,0,.4)";
  X.lineWidth = 1.4;
  X.beginPath();
  X.moveTo(20, 160);
  X.quadraticCurveTo(26, 170, 24, 190);
  X.stroke();

  // -- lantern, light beam, dust motes --------------------------------------
  const swing = Math.sin(t * 1.05) * 0.1;
  X.save();
  X.translate(338, 0);
  X.rotate(swing);
  X.strokeStyle = "#4a3a20";
  X.lineWidth = 2.4;
  for (let k = 0; k < 3; k++) {
    X.beginPath();
    X.ellipse(0, 5 + k * 7, 2.6, 4, 0, 0, Math.PI * 2);
    X.stroke();
  }
  const fl =
    0.72 + 0.2 * Math.sin(t * 9.3) + 0.08 * Math.sin(t * 21) + Math.sin(t * 17) * 0.07;
  X.fillStyle = "#2a1f12";
  RR(-9, 26, 18, 32, 4);
  X.fill();
  X.fillStyle = `rgba(255,196,88,${0.8 * fl + 0.12})`;
  RR(-6, 30, 12, 24, 3);
  X.fill();
  X.fillStyle = "#ffe9b0";
  EL(0, 46, 2.6, 5 + 2 * fl);
  X.fill();
  X.fillStyle = "#2a1f12";
  RR(-11, 24, 22, 4, 2);
  X.fill();
  RR(-7, 56, 14, 4, 2);
  X.fill();
  X.restore();
  const lx = 338 + Math.sin(swing) * 44;
  const ly = Math.cos(swing) * 44 + 12;
  const beam = LG2(lx, ly, lx - 60, 196, `rgba(255,195,100,${0.11 * fl})`, "rgba(255,195,100,0)");
  X.fillStyle = beam;
  X.beginPath();
  X.moveTo(lx - 8, ly);
  X.lineTo(lx - 110, 196);
  X.lineTo(lx + 34, 196);
  X.lineTo(lx + 8, ly);
  X.closePath();
  X.fill();
  for (let i = 0; i < 18; i++) {
    const my = 54 + ((t * (3 + (i % 3) * 2.6) + i * 31) % 136);
    X.fillStyle = `rgba(255,222,150,${0.07 + 0.09 * Math.sin(t * 2 + i * 0.77)})`;
    X.fillRect(226 + ((i * 53) % 150), my, 2, 2);
  }
  GLOW(lx, ly + 34, 85, "255,170,60", 0.12 + 0.1 * fl);

  // -- Grubbins --------------------------------------------------------------
  const spd = 0.75;
  const bob = Math.sin(t * 1.35 * spd) * 2;
  const dark = S(SKIN, -48);
  // Sales-pitch beat every 8s, plus the purchase-pleased overlay.
  const pitchBeat = (t % 8) < 0.8 ? Math.sin((Math.PI * (t % 8)) / 0.8) : 0;
  const pitch = Math.max(pitchBeat, pleased);
  // Coin flip (slow, seen-it-all cadence) — computed first so eyes can track.
  const P = 2.4;
  const u = (t % P) / P;
  const hy = 166 + Math.sin(t * 3.1) * 1.5;
  const coin = { x: 284, y: hy - 6 };
  if (u < 0.62) coin.y = hy - 6 - 56 * Math.sin((Math.PI * u) / 0.62);

  X.save();
  X.translate(0, bob);
  const part = (
    pathFn: () => void, flat: string,
    gx0: number, gy0: number, gx1: number, gy1: number
  ) => {
    pathFn();
    X.fillStyle = LG2(gx0, gy0, gx1, gy1, S(flat, 34), S(flat, -38));
    X.fill();
  };
  // Torso (hunched over the counter).
  part(() => {
    X.beginPath();
    X.moveTo(196, 204);
    X.quadraticCurveTo(192, 158, 210, 142);
    X.quadraticCurveTo(220, 132, 236, 128);
    X.quadraticCurveTo(254, 130, 260, 146);
    X.quadraticCurveTo(270, 170, 266, 204);
    X.closePath();
  }, SKIN, 258, 120, 190, 210);
  // Vest halves + patch.
  part(() => {
    X.beginPath();
    X.moveTo(202, 204);
    X.quadraticCurveTo(198, 162, 214, 146);
    X.lineTo(222, 152);
    X.quadraticCurveTo(210, 176, 212, 204);
    X.closePath();
  }, VEST, 240, 140, 200, 210);
  part(() => {
    X.beginPath();
    X.moveTo(258, 204);
    X.quadraticCurveTo(264, 168, 252, 140);
    X.lineTo(243, 146);
    X.quadraticCurveTo(254, 174, 250, 204);
    X.closePath();
  }, VEST, 240, 140, 200, 210);
  X.fillStyle = S(VEST, -22);
  X.fillRect(246, 172, 11, 10);
  X.strokeStyle = S(VEST, 26);
  X.lineWidth = 1;
  X.beginPath();
  X.moveTo(246, 174);
  X.lineTo(244, 176);
  X.moveTo(246, 179);
  X.lineTo(244, 181);
  X.moveTo(257, 174);
  X.lineTo(259, 176);
  X.stroke();
  // Left arm down to the counter (hand drawn after the counter).
  limb(212, 148, 188, 170, 11, SKIN);
  limb(188, 170, 173, 187, 10, SKIN);
  // Right arm, flipping the coin.
  limb(246, 144, 272, 160, 11, SKIN);
  limb(272, 160, 283, hy, 9.5, SKIN);
  X.fillStyle = SKIN;
  EL(285, hy + 2, 7, 5);
  X.fill();
  EL(280, hy - 2, 2.4, 3.4);
  X.fill();
  // The coin.
  if (u < 0.62) {
    X.strokeStyle = "rgba(245,197,66,.25)";
    X.lineWidth = 3;
    X.beginPath();
    X.moveTo(coin.x, coin.y + 8);
    X.lineTo(coin.x, coin.y + 16);
    X.stroke();
  }
  const spin = Math.max(0.15, Math.abs(Math.cos(t * 12)));
  GLOW(coin.x, coin.y, 15, "255,210,90", 0.22);
  X.fillStyle = "#f5c542";
  EL(coin.x, coin.y, 7 * spin, 7);
  X.fill();
  X.strokeStyle = "#a87c1a";
  X.lineWidth = 1.4;
  EL(coin.x, coin.y, 7 * spin, 7);
  X.stroke();
  if (spin > 0.5) {
    X.strokeStyle = "rgba(168,124,26,.8)";
    X.lineWidth = 1;
    EL(coin.x, coin.y, 7 * spin * 0.62, 7 * 0.62);
    X.stroke();
  }
  // Neck + head.
  part(() => {
    X.beginPath();
    X.moveTo(214, 132);
    X.lineTo(232, 126);
    X.lineTo(234, 138);
    X.lineTo(218, 142);
    X.closePath();
  }, SKIN, 230, 120, 214, 142);
  const hx = 222;
  // Ears: lag the bob, twitch occasionally, PERK when pleased.
  const elag = Math.sin(t * 1.35 * spd - 0.5) * 0.05;
  const twitch = (t % 5.1) < 0.3 ? Math.sin(t * 36) * 0.09 : 0;
  const perk = pleased * 0.16;
  const ear = (ex: number, ey: number, dir: number, rot: number) => {
    X.save();
    X.translate(ex, ey);
    X.rotate(dir * rot);
    part(() => {
      X.beginPath();
      X.moveTo(0, 8);
      X.quadraticCurveTo(dir * 34, 0, dir * 46, -20);
      X.quadraticCurveTo(dir * 47, -24, dir * 42, -23);
      X.quadraticCurveTo(dir * 20, -12, 0, -10);
      X.closePath();
    }, SKIN, dir > 0 ? 40 : 0, -24, 0, 8);
    // Scarred notch on the left ear.
    if (dir < 0) {
      X.fillStyle = WALL_BG;
      X.beginPath();
      X.moveTo(dir * 30, -14);
      X.lineTo(dir * 38, -20);
      X.lineTo(dir * 34, -10);
      X.closePath();
      X.fill();
    }
    X.fillStyle = "rgba(0,0,0,.28)";
    X.beginPath();
    X.moveTo(dir * 8, 2);
    X.quadraticCurveTo(dir * 26, -4, dir * 36, -16);
    X.quadraticCurveTo(dir * 20, -8, dir * 7, -4);
    X.closePath();
    X.fill();
    X.restore();
  };
  ear(hx - 24, 96, -1, 0.06 + elag - perk);
  ear(hx + 24, 94, 1, 0.06 + elag + twitch - perk);
  // Gold hoop earring, swaying with the bob.
  const era = 0.32 * Math.sin(t * 1.35 * spd - 0.9);
  X.save();
  X.translate(hx + 52, 88);
  X.rotate(era);
  X.strokeStyle = "#e8b23c";
  X.lineWidth = 1.8;
  X.beginPath();
  X.arc(0, 4, 4.4, 0, Math.PI * 2);
  X.stroke();
  X.restore();
  // Head.
  part(() => {
    X.beginPath();
    X.ellipse(hx, 104, 26, 23, -0.06, 0, Math.PI * 2);
  }, SKIN, 246, 84, 198, 126);
  // Brow ridge (jumps on the pitch/pleased beat).
  part(() => {
    X.beginPath();
    X.moveTo(hx - 20, 96 - pitch * 3);
    X.quadraticCurveTo(hx, 88 - pitch * 4, hx + 20, 94 - pitch * 3);
    X.quadraticCurveTo(hx + 10, 99 - pitch * 3, hx - 8, 100 - pitch * 3);
    X.closePath();
  }, S(SKIN, -14), 0, 0, 0, 0);
  // Grit: mottled skin, stubble, cheek scar.
  X.fillStyle = "rgba(20,30,10,.16)";
  EL(hx - 12, 112, 5, 3.4);
  X.fill();
  EL(hx + 14, 98, 4, 2.6);
  X.fill();
  EL(hx + 6, 118, 3.4, 2.4);
  X.fill();
  X.fillStyle = "rgba(15,20,8,.5)";
  for (let sb = 0; sb < 6; sb++) {
    X.fillRect(hx - 8 + sb * 3, 124 + (sb % 2) * 2, 1.2, 1.2);
  }
  X.strokeStyle = "rgba(210,225,190,.35)";
  X.lineWidth = 1;
  X.beginPath();
  X.moveTo(hx - 19, 108);
  X.lineTo(hx - 14, 112);
  X.moveTo(hx - 18, 112);
  X.lineTo(hx - 13, 108);
  X.stroke();
  // Eyes — narrow, baggy, and they TRACK THE COIN.
  const bl = blink(5.2, 0);
  const eye = (ex: number, ey: number) => {
    const ox = Math.max(-2.4, Math.min(2.4, (coin.x - ex) / 40));
    const oy = Math.max(-2, Math.min(2.4, (coin.y - ey) / 50));
    if (bl) {
      X.strokeStyle = dark;
      X.lineWidth = 2;
      X.beginPath();
      X.moveTo(ex - 5, ey);
      X.lineTo(ex + 5, ey);
      X.stroke();
      return;
    }
    X.fillStyle = "#f6edd2";
    EL(ex, ey, 5.6, 3.6);
    X.fill();
    X.fillStyle = "#ffae2e";
    EL(ex + ox, ey + oy * 0.7, 3.1, 3.1);
    X.fill();
    X.fillStyle = "#1d1405";
    EL(ex + ox, ey + oy * 0.7, 1.6, 1.6);
    X.fill();
    X.fillStyle = "rgba(255,255,255,.85)";
    EL(ex + ox - 1, ey + oy * 0.7 - 1.2, 0.9, 0.9);
    X.fill();
    X.strokeStyle = "rgba(0,0,0,.3)";
    X.lineWidth = 1.2;
    X.beginPath();
    X.moveTo(ex - 5, ey + 5);
    X.quadraticCurveTo(ex, ey + 7, ex + 5, ey + 5);
    X.stroke();
  };
  eye(hx - 11, 101);
  eye(hx + 12, 98);
  X.strokeStyle = "rgba(0,0,0,.22)";
  X.lineWidth = 1;
  X.beginPath();
  X.moveTo(hx - 19, 99);
  X.lineTo(hx - 23, 97);
  X.moveTo(hx - 19, 103);
  X.lineTo(hx - 23, 104);
  X.stroke();
  // Hooked warty nose.
  part(() => {
    X.beginPath();
    X.moveTo(hx - 3, 100);
    X.quadraticCurveTo(hx + 9, 98, hx + 5, 116);
    X.quadraticCurveTo(hx - 1, 120, hx - 7, 114);
    X.quadraticCurveTo(hx - 6, 105, hx - 3, 100);
    X.closePath();
  }, S(SKIN, 12), hx + 8, 98, hx - 8, 120);
  X.fillStyle = S(SKIN, -16);
  EL(hx - 3, 111, 1.7, 1.7);
  X.fill();
  EL(hx + 3, 105, 1.3, 1.3);
  X.fill();
  // One-sided smirk (widens on pitch/pleased), teeth, THE gold tooth.
  const gw = pitch * 3;
  X.fillStyle = "#1a0d04";
  X.beginPath();
  X.moveTo(hx - 17, 118);
  X.quadraticCurveTo(hx, 126 + gw, hx + 18, 114);
  X.quadraticCurveTo(hx + 2, 122 + gw * 0.6, hx - 17, 118);
  X.closePath();
  X.fill();
  const teeth: Array<[number, number]> = [
    [hx - 11, 117.5],
    [hx - 4, 119.5],
    [hx + 4, 119],
    [hx + 11, 116.5],
  ];
  for (let th = 0; th < teeth.length; th++) {
    X.fillStyle = th === 1 ? "#f5c542" : "#fdf6e0";
    X.fillRect(teeth[th][0] - 2, teeth[th][1], 4, 4.2);
  }
  // Gold-tooth glint: rare at idle, guaranteed while pleased.
  const glintPhase = t % 9;
  const glint =
    pleased > 0.35 ? pleased : glintPhase < 0.35 ? Math.sin((Math.PI * glintPhase) / 0.35) : 0;
  if (glint > 0) sparkle(hx - 4, 121, 4.5, "#fff2b0", glint);
  // Chin crease + under-chin shadow.
  X.strokeStyle = "rgba(0,0,0,.2)";
  X.lineWidth = 1.2;
  X.beginPath();
  X.moveTo(hx - 16, 112);
  X.quadraticCurveTo(hx - 13, 116, hx - 14, 119);
  X.stroke();
  AO(hx + 2, 131, 13, 4, 0.24);
  // Dim lantern-side rim light.
  X.strokeStyle = "rgba(255,205,130,.22)";
  X.lineWidth = 2.2;
  X.lineCap = "round";
  X.beginPath();
  X.moveTo(hx + 18, 86);
  X.quadraticCurveTo(hx + 27, 96, hx + 24, 114);
  X.stroke();
  X.beginPath();
  X.moveTo(hx + 30, 90);
  X.quadraticCurveTo(hx + 50, 78, hx + 62, 70);
  X.stroke();
  X.beginPath();
  X.moveTo(252, 138);
  X.quadraticCurveTo(262, 158, 262, 182);
  X.stroke();
  X.restore();

  // -- counter ----------------------------------------------------------------
  const WOOD = "#4f3a20";
  X.fillStyle = S(WOOD, 26);
  X.fillRect(0, 188, VIEW_W, 8);
  X.fillStyle = LG2(0, 196, 0, VIEW_H, S(WOOD, 6), S(WOOD, -44));
  X.fillRect(0, 196, VIEW_W, VIEW_H - 196);
  X.fillStyle = "#6e5a36";
  X.fillRect(0, 195, VIEW_W, 3);
  X.strokeStyle = "rgba(0,0,0,.28)";
  X.lineWidth = 1;
  for (const px of [66, 144, 240, 322]) {
    X.beginPath();
    X.moveTo(px, 204);
    X.lineTo(px, 272);
    X.stroke();
  }
  X.strokeStyle = "rgba(30,16,4,.35)";
  X.lineWidth = 1.2;
  for (let g2 = 0; g2 < 4; g2++) {
    X.beginPath();
    X.moveTo(8, 190 + g2 * 1.8);
    X.bezierCurveTo(120, 189 + g2 * 2, 260, 193 + g2 * 1.2, 394, 190 + g2 * 1.9);
    X.stroke();
  }
  X.strokeStyle = "rgba(30,16,4,.45)";
  X.beginPath();
  X.ellipse(300, 192, 4, 1.6, 0, 0, Math.PI * 2);
  X.stroke();

  // -- counter props -----------------------------------------------------------
  // Coin stacks.
  const stack = (x: number, n: number) => {
    AO(x, 197, 12, 3, 0.3);
    for (let k = 0; k < n; k++) {
      X.fillStyle = k === n - 1 ? "#ffd45e" : "#f0bc3e";
      EL(x, 193 - k * 3.6, 8.5, 3);
      X.fill();
      X.strokeStyle = "#a87c1a";
      X.lineWidth = 1;
      EL(x, 193 - k * 3.6, 8.5, 3);
      X.stroke();
    }
    X.strokeStyle = "#c79a2e";
    X.lineWidth = 1;
    X.beginPath();
    X.ellipse(x, 193 - (n - 1) * 3.6, 5, 1.7, 0, 0, Math.PI * 2);
    X.stroke();
  };
  stack(52, 4);
  stack(74, 2);
  // Balance scale, gently rocking.
  AO(114, 197, 15, 3, 0.28);
  const rock = Math.sin(t * 0.65) * 0.09;
  X.strokeStyle = "#7a5a2e";
  X.lineWidth = 2.6;
  X.beginPath();
  X.moveTo(114, 194);
  X.lineTo(114, 168);
  X.stroke();
  X.save();
  X.translate(114, 168);
  X.rotate(rock);
  X.beginPath();
  X.moveTo(-19, 0);
  X.lineTo(19, 0);
  X.stroke();
  X.lineWidth = 1;
  for (const s of [-1, 1]) {
    X.beginPath();
    X.moveTo(19 * s, 0);
    X.lineTo(19 * s - 3, 10);
    X.moveTo(19 * s, 0);
    X.lineTo(19 * s + 3, 10);
    X.stroke();
    X.fillStyle = "#c9a03a";
    X.beginPath();
    X.ellipse(19 * s, 12, 7, 2.6, 0, 0, Math.PI * 2);
    X.fill();
  }
  X.fillStyle = "#b06ae0";
  X.beginPath();
  X.moveTo(-19, 8);
  X.lineTo(-16, 12);
  X.lineTo(-22, 12);
  X.closePath();
  X.fill();
  X.restore();
  X.fillStyle = "#7a5a2e";
  EL(114, 194, 7, 2.6);
  X.fill();
  // Clay tray + smoking pipe with a pulsing ember.
  AO(322, 198, 16, 3.4, 0.3);
  X.fillStyle = "#5a4636";
  EL(322, 194, 15, 4);
  X.fill();
  X.strokeStyle = "#3a2c20";
  X.lineWidth = 3;
  X.beginPath();
  X.moveTo(310, 192);
  X.quadraticCurveTo(322, 188, 332, 190);
  X.stroke();
  X.fillStyle = "#3a2c20";
  EL(334, 189, 4, 4.4);
  X.fill();
  const ember = 0.5 + 0.4 * Math.sin(t * 2.7);
  X.fillStyle = `rgba(255,120,50,${0.5 * ember})`;
  EL(334, 187.6, 2.2, 2);
  X.fill();
  X.strokeStyle = "rgba(200,200,190,.13)";
  X.lineWidth = 4;
  X.lineCap = "round";
  for (let s4 = 0; s4 < 2; s4++) {
    const sp = (t * 0.2 + s4 / 2) % 1;
    X.save();
    X.globalAlpha = 0.16 * (1 - sp);
    X.beginPath();
    X.moveTo(334 + Math.sin(t * 1.2 + s4 * 2) * 3, 184 - sp * 12);
    X.quadraticCurveTo(
      330 + Math.sin(t * 1.7 + s4) * 8,
      164 - sp * 34,
      338 + Math.sin(t * 1.4 + s4) * 10,
      142 - sp * 52
    );
    X.stroke();
    X.restore();
  }
  // Left hand ON the counter, fingers drumming.
  X.save();
  X.translate(0, bob);
  X.fillStyle = SKIN;
  EL(172, 190, 7.5, 4.6);
  X.fill();
  for (let f = 0; f < 4; f++) {
    const lift = Math.pow(Math.max(0, Math.sin(t * 5 - f * 1.05)), 2) * 4;
    limb(170 + f * 3.4 - 5, 190, 160 + f * 4.6 - 2, 196 - lift, 3.6, SKIN);
  }
  X.restore();

  // -- vignette ----------------------------------------------------------------
  const vg = X.createRadialGradient(200, 130, 90, 200, 140, 270);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.48)");
  X.fillStyle = vg;
  X.fillRect(0, 0, VIEW_W, VIEW_H);
}
