// ============================================================================
// ItemIcon — a self-contained procedural canvas sprite for equipment (the
// ChestSprite mold: own palettes + draw fns, dpr-aware, presentation-only).
// One draw function per ItemIconKind; the item's QUALITY drives the plate /
// glow palette (reusing the rarity colors) and the line's accent colors the
// identifying detail. Star pips render along the bottom edge.
// ============================================================================

import { useEffect, useRef } from "react";
import { RARITIES } from "@/data/rarities";
import { parseItemKey, type ItemIconKind } from "@/data/items";

interface Props {
  /** ItemKey "lineId:quality:star". Invalid keys draw an empty plate. */
  itemKey: string;
  size?: number;
  /** Hide the star pips (slot buttons show stars in text instead). */
  hideStars?: boolean;
}

export function ItemIcon({ itemKey, size = 56, hideStars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawItemIcon(ctx, itemKey, size, !hideStars);
  }, [itemKey, size, hideStars]);

  return (
    <canvas
      ref={canvasRef}
      className="item-icon"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/** Exposed for non-React canvases (the combine ceremony's flash frames). */
export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  itemKey: string,
  size: number,
  withStars: boolean
): void {
  ctx.clearRect(0, 0, size, size);
  const p = parseItemKey(itemKey);
  const s = size / 64; // draw in a 64-unit space
  const quality = p ? RARITIES[p.quality].color : "#3f3a33";

  // Plate: dark rounded square with a quality border + inner glow.
  ctx.save();
  ctx.scale(s, s);
  rounded(ctx, 3, 3, 58, 58, 10);
  const bg = ctx.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, "#241f18");
  bg.addColorStop(1, "#15110c");
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = quality;
  ctx.stroke();
  if (p?.quality === "legendary") {
    // Legendary shimmer: a soft inner halo.
    const halo = ctx.createRadialGradient(32, 30, 4, 32, 30, 30);
    halo.addColorStop(0, "rgba(245,179,1,0.22)");
    halo.addColorStop(1, "rgba(245,179,1,0)");
    ctx.fillStyle = halo;
    rounded(ctx, 4, 4, 56, 56, 9);
    ctx.fill();
  }

  if (p) {
    const draw = ICON_DRAWS[p.line.icon];
    ctx.save();
    ctx.translate(32, withStars ? 29 : 32);
    draw(ctx, p.line.color, quality);
    ctx.restore();

    if (withStars) {
      const n = p.star;
      const cx = 32 - (n - 1) * 7;
      for (let i = 0; i < n; i++) {
        star(ctx, cx + i * 14, 54, 4.6, "#f5b301");
      }
    }
  }
  ctx.restore();
}

// --- primitives -------------------------------------------------------------

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function disc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// --- the 25 shapes, drawn around (0,0) in a ~44-unit box --------------------
// `c` = the line's accent color, `q` = the quality color (small highlights).

type IconDraw = (ctx: CanvasRenderingContext2D, c: string, q: string) => void;

const STEEL = "#aeb6c2";
const GRIP = "#6b4a2a";

const ICON_DRAWS: Record<ItemIconKind, IconDraw> = {
  sword(ctx, c) {
    ctx.rotate(-Math.PI / 4);
    poly(ctx, [[-3, -20], [3, -20], [2, 8], [-2, 8]], STEEL);
    poly(ctx, [[-3, -20], [3, -20], [0, -25]], STEEL);
    poly(ctx, [[-9, 8], [9, 8], [9, 11], [-9, 11]], c);
    poly(ctx, [[-2, 11], [2, 11], [2, 20], [-2, 20]], GRIP);
    disc(ctx, 0, 22, 3, c);
  },
  axe(ctx, c) {
    ctx.rotate(-Math.PI / 5);
    poly(ctx, [[-2, -18], [2, -18], [2, 22], [-2, 22]], GRIP);
    ctx.beginPath();
    ctx.moveTo(2, -18);
    ctx.quadraticCurveTo(18, -14, 14, 2);
    ctx.quadraticCurveTo(8, -6, 2, -6);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, -18);
    ctx.quadraticCurveTo(-18, -14, -14, 2);
    ctx.quadraticCurveTo(-8, -6, -2, -6);
    ctx.closePath();
    ctx.fill();
  },
  spear(ctx, c) {
    ctx.rotate(-Math.PI / 4);
    poly(ctx, [[-1.5, -12], [1.5, -12], [1.5, 24], [-1.5, 24]], GRIP);
    poly(ctx, [[0, -26], [6, -12], [0, -15], [-6, -12]], c);
    // storm sparks
    poly(ctx, [[8, -18], [12, -20], [9, -14]], c);
  },
  jagged(ctx, c) {
    ctx.rotate(-Math.PI / 4);
    poly(
      ctx,
      [[-3, 8], [3, 8], [4, -2], [1, -5], [4, -10], [1, -13], [3, -20], [0, -25], [-3, -18], [-1, -12], [-4, -8], [-1, -4]],
      c
    );
    poly(ctx, [[-8, 8], [8, 8], [8, 11], [-8, 11]], STEEL);
    poly(ctx, [[-2, 11], [2, 11], [2, 19], [-2, 19]], GRIP);
  },
  daggers(ctx, c) {
    for (const flip of [-1, 1]) {
      ctx.save();
      ctx.rotate((flip * Math.PI) / 5);
      poly(ctx, [[-2, -18], [2, -18], [0, -24]], c);
      poly(ctx, [[-2, -18], [2, -18], [1.5, 2], [-1.5, 2]], STEEL);
      poly(ctx, [[-5, 2], [5, 2], [5, 4.5], [-5, 4.5]], c);
      poly(ctx, [[-1.5, 4.5], [1.5, 4.5], [1.5, 12], [-1.5, 12]], GRIP);
      ctx.restore();
    }
  },
  saber(ctx, c) {
    ctx.rotate(-Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.quadraticCurveTo(-14, -10, -2, -24);
    ctx.quadraticCurveTo(-6, -8, 1, 8);
    ctx.closePath();
    ctx.fillStyle = STEEL;
    ctx.fill();
    poly(ctx, [[-7, 8], [4, 8], [4, 11], [-7, 11]], c);
    poly(ctx, [[-3, 11], [1, 11], [1, 19], [-3, 19]], GRIP);
    // wind streaks
    for (const [x, y] of [[8, -12], [11, -4]]) {
      poly(ctx, [[x, y], [x + 9, y - 1], [x, y + 2]], c);
    }
  },
  scythe(ctx, c) {
    ctx.rotate(Math.PI / 12);
    poly(ctx, [[-1.5, -16], [1.5, -16], [1.5, 24], [-1.5, 24]], GRIP);
    ctx.beginPath();
    ctx.moveTo(-1, -16);
    ctx.quadraticCurveTo(20, -22, 22, -6);
    ctx.quadraticCurveTo(16, -14, -1, -11);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  },
  hammer(ctx, c) {
    ctx.rotate(-Math.PI / 6);
    poly(ctx, [[-2, -8], [2, -8], [2, 22], [-2, 22]], GRIP);
    rounded(ctx, -13, -20, 26, 13, 3);
    ctx.fillStyle = c;
    ctx.fill();
    rounded(ctx, -13, -20, 26, 4, 2);
    ctx.fillStyle = STEEL;
    ctx.fill();
  },
  plate(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.quadraticCurveTo(0, -10, 14, -16);
    ctx.quadraticCurveTo(16, 4, 0, 18);
    ctx.quadraticCurveTo(-16, 4, -14, -16);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 15);
    ctx.moveTo(-11, -4);
    ctx.quadraticCurveTo(0, 2, 11, -4);
    ctx.stroke();
  },
  shield(ctx, c, q) {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(14, -14, 15, -6);
    ctx.quadraticCurveTo(15, 10, 0, 19);
    ctx.quadraticCurveTo(-15, 10, -15, -6);
    ctx.quadraticCurveTo(-14, -14, 0, -18);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = STEEL;
    ctx.lineWidth = 2;
    ctx.stroke();
    disc(ctx, 0, -1, 4, q);
  },
  cloak(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(16, -8, 12, 18);
    ctx.quadraticCurveTo(6, 12, 0, 17);
    ctx.quadraticCurveTo(-6, 12, -12, 18);
    ctx.quadraticCurveTo(-16, -8, 0, -18);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    disc(ctx, 0, -14, 3, "#f5deb3");
  },
  core(ctx, c, q) {
    disc(ctx, 0, 0, 15, "#4a4038");
    disc(ctx, 0, 0, 10, c);
    disc(ctx, 0, 0, 5, "#fff7d6");
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      poly(
        ctx,
        [
          [Math.cos(a) * 15, Math.sin(a) * 15],
          [Math.cos(a + 0.35) * 20, Math.sin(a + 0.35) * 20],
          [Math.cos(a + 0.7) * 15, Math.sin(a + 0.7) * 15],
        ],
        q
      );
    }
  },
  shroud(ctx, c) {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.quadraticCurveTo(0, -22, 14, -14);
    for (let i = 0; i < 4; i++) {
      const x = 14 - i * 9.3;
      ctx.quadraticCurveTo(x + 4, 20, x - 4.6, 14);
    }
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.globalAlpha = 1;
    disc(ctx, -5, -8, 2, "#fff");
    disc(ctx, 5, -8, 2, "#fff");
  },
  pelt(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(17, -12, 14, 6);
    for (let i = 0; i < 5; i++) ctx.lineTo(14 - i * 7, i % 2 === 0 ? 18 : 12);
    ctx.quadraticCurveTo(-17, -2, 0, -16);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    // wolf head clasp
    poly(ctx, [[-4, -14], [4, -14], [0, -6]], "#57534e");
    poly(ctx, [[-4, -14], [-6, -18], [-2, -15]], "#57534e");
    poly(ctx, [[4, -14], [6, -18], [2, -15]], "#57534e");
  },
  bark(ctx, c) {
    rounded(ctx, -13, -17, 26, 34, 6);
    ctx.fillStyle = "#5b4327";
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    for (const r of [4, 8.5, 13]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // a fresh sprout
    ctx.beginPath();
    ctx.moveTo(9, -13);
    ctx.quadraticCurveTo(14, -19, 18, -16);
    ctx.quadraticCurveTo(13, -15, 12, -10);
    ctx.closePath();
    ctx.fillStyle = "#4ade80";
    ctx.fill();
  },
  flame(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.quadraticCurveTo(-14, 8, -8, -4);
    ctx.quadraticCurveTo(-4, 2, -2, -2);
    ctx.quadraticCurveTo(-6, -12, 2, -18);
    ctx.quadraticCurveTo(0, -8, 5, -4);
    ctx.quadraticCurveTo(12, 2, 8, 10);
    ctx.quadraticCurveTo(6, 14, 0, 16);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.quadraticCurveTo(-5, 6, 0, -2);
    ctx.quadraticCurveTo(5, 6, 0, 12);
    ctx.closePath();
    ctx.fillStyle = "#fde68a";
    ctx.fill();
  },
  snowflake(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dx * 16, dy * 16);
      ctx.moveTo(dx * 9 - dy * 4, dy * 9 + dx * 4);
      ctx.lineTo(dx * 12, dy * 12);
      ctx.lineTo(dx * 9 + dy * 4, dy * 9 - dx * 4);
      ctx.stroke();
    }
    disc(ctx, 0, 0, 3, "#e0f2fe");
  },
  fang(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.quadraticCurveTo(10, -14, 8, 0);
    ctx.quadraticCurveTo(7, 12, 0, 18);
    ctx.quadraticCurveTo(2, 4, -4, -4);
    ctx.quadraticCurveTo(-9, -9, -8, -14);
    ctx.closePath();
    ctx.fillStyle = "#f2ead8";
    ctx.fill();
    // venom drip
    disc(ctx, 3, 14, 2.5, c);
    ctx.beginPath();
    ctx.moveTo(3, 8);
    ctx.quadraticCurveTo(5.5, 11, 3, 14);
    ctx.quadraticCurveTo(0.5, 11, 3, 8);
    ctx.fillStyle = c;
    ctx.fill();
  },
  ring(ctx, c, q) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 3, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 3, 12.6, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    poly(ctx, [[0, -16], [6, -10], [0, -4], [-6, -10]], q);
  },
  hourglass(ctx, c, q) {
    poly(ctx, [[-11, -16], [11, -16], [11, -13], [-11, -13]], GRIP);
    poly(ctx, [[-11, 16], [11, 16], [11, 13], [-11, 13]], GRIP);
    ctx.globalAlpha = 0.45;
    poly(ctx, [[-9, -13], [9, -13], [1.5, 0], [9, 13], [-9, 13], [-1.5, 0]], c);
    ctx.globalAlpha = 1;
    poly(ctx, [[-5, -12], [5, -12], [0, -3]], q);
    poly(ctx, [[-6, 12.5], [6, 12.5], [0, 6]], q);
  },
  idol(ctx, c, q) {
    rounded(ctx, -9, -6, 18, 22, 4);
    ctx.fillStyle = c;
    ctx.fill();
    disc(ctx, 0, -11, 8, c);
    // fierce little face
    disc(ctx, -3, -12, 1.8, "#1c1917");
    disc(ctx, 3, -12, 1.8, "#1c1917");
    poly(ctx, [[-4, -7.5], [4, -7.5], [0, -5]], "#1c1917");
    poly(ctx, [[-9, 2], [-14, -2], [-9, 6]], q);
    poly(ctx, [[9, 2], [14, -2], [9, 6]], q);
  },
  sigil(ctx, c, q) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = Math.cos(a) * 15;
      const y = Math.sin(a) * 15;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    disc(ctx, 0, 0, 6, q);
    disc(ctx, 0, 0, 2.6, "#1c1917");
  },
  coin(ctx, c) {
    disc(ctx, 0, 0, 15, "#8a6a1d");
    disc(ctx, 0, 0, 13, c);
    ctx.strokeStyle = "#8a6a1d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
    ctx.stroke();
    // clover stamp
    for (const [x, y] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      disc(ctx, x, y, 3, "#8a6a1d");
    }
  },
  rune(ctx, c, q) {
    rounded(ctx, -12, -16, 24, 32, 8);
    ctx.fillStyle = "#4b5563";
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.moveTo(0, -4);
    ctx.lineTo(7, -10);
    ctx.moveTo(0, 2);
    ctx.lineTo(7, 8);
    ctx.stroke();
    disc(ctx, -6, -10, 1.6, q);
    disc(ctx, -6, 10, 1.6, q);
  },
  eclipse(ctx, c) {
    disc(ctx, 0, 0, 14, c);
    disc(ctx, 4, -2, 12.5, "#211d3a");
    // corona ticks
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
      ctx.stroke();
    }
  },
};
