// ============================================================================
// statusIcons — the 13 battle status effects, drawn on the canvas above a unit.
//
// These replaced emoji rendered with ctx.fillText. Same INKED WOODCUT style as
// the DOM icon set (components/icons/), but this is a plain-TS canvas module:
// src/engine is React-free by architectural rule, so the Renderer cannot import
// a JSX component. Same mold as its siblings chestArt.ts / corpseArt.ts.
//
// The hard constraint is SIZE. These draw at ~13px in a row above a unit's
// head, over a busy battlefield. That rules out interior detail entirely — a
// skull gets a cranium, two sockets and a jaw block, and nothing else. Shape
// carries the meaning first and colour second, because two icons can share a
// hue but never a silhouette.
//
// Presentation only: Renderer never mutates sim state, so nothing here can
// affect the determinism digest.
// ============================================================================

import type { StatusEffectType } from "@/types";

/** The woodcut outline, in the 40-unit authoring space. */
const OUTLINE = "#12100d";
const OUTLINE_W = 2;

interface Part {
  d: Path2D;
  c: string;
  /** Cut-outs (eye sockets, a pupil) are never outlined — at this size the
   *  stroke would close the hole back up. */
  ink?: boolean;
}

const P = (d: string, c: string, ink?: boolean): Part => ({ d: new Path2D(d), c, ink });

/** Ellipse as SVG arc pairs — Path2D takes the same grammar as an SVG `d`. */
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;

// A skull, shared by curse. Kept to three shapes — anything finer is mud.
const SKULL_CRANIUM =
  "M10 19 C9.2 8.6 13.6 4.6 20 4.6 C26.4 4.6 30.8 8.6 30 19 " +
  "C30 22.6 27.8 24.2 26.4 25.6 L13.6 25.6 C12.2 24.2 10 22.6 10 19 Z";

// Paths are built ONCE at module load. drawStatusIcon runs per-unit per-frame,
// so constructing Path2D objects inside it would allocate on the hot path.
//
// PARTIAL on purpose: `polymorph` had no emoji either and still shows nothing.
const ICONS: Partial<Record<StatusEffectType, Part[]>> = {
  burn: [
    P(
      "M20 3 C24.5 11.5 31.5 15 31.5 23 C31.5 30.4 26.3 36 20 36 " +
        "C13.7 36 8.5 30.4 8.5 23 C8.5 16 12.8 13.4 15.4 8 C16.4 13.6 18.8 14.6 20 3 Z",
      "#e8541f"
    ),
    P(
      "M20 16 C22.6 21.2 25.2 23.2 25.2 26.8 C25.2 30.5 22.9 33 20 33 " +
        "C17.1 33 14.8 30.5 14.8 26.8 C14.8 23.6 17.4 21.6 20 16 Z",
      "#ffc23d"
    ),
  ],

  // Three crossed bars, pre-rotated into the path so no ctx.rotate is needed.
  slow: [
    P(
      "M17.5 3 h5 v34 h-5 z " +
        "M33.47 9.33 L35.97 13.67 L6.53 30.67 L4.03 26.34 Z " +
        "M4.03 13.67 L6.53 9.33 L35.97 26.34 L33.47 30.67 Z",
      "#7fd4f5"
    ),
  ],

  stun: [P("M20 1 L24 16 L39 20 L24 24 L20 39 L16 24 L1 20 L16 16 Z", "#ffd93d")],

  shield: [
    P("M20 4 L33 8 C33 20 29 30 20 36.5 C11 30 7 20 7 8 Z", "#cdd2d8"),
    P("M7.4 14.6 h25.2 v3 h-25.2 z", "#7d858e"),
  ],

  haste: [
    P(
      "M4 9 L16 20 L4 31 L11 31 L23 20 L11 9 Z M18 9 L30 20 L18 31 L25 31 L37 20 L25 9 Z",
      "#6ee0c0"
    ),
  ],

  poison: [
    P(
      "M20 4 C26 14 30 19 30 24.5 C30 30.8 25.5 35.5 20 35.5 " +
        "C14.5 35.5 10 30.8 10 24.5 C10 19 14 14 20 4 Z",
      "#8fbf3a"
    ),
    P(
      "M20 15 C23 21 25 24 25 26.6 C25 29.9 22.8 32.4 20 32.4 " +
        "C17.2 32.4 15 29.9 15 26.6 C15 24 17 21 20 15 Z",
      "#d4f56a"
    ),
  ],

  curse: [
    P(SKULL_CRANIUM, "#a97bd6"),
    P("M14 25.6 h12 v5.4 h-12 z", "#a97bd6"),
    P(ell(15.6, 16.4, 3.4, 4), OUTLINE, true),
    P(ell(24.4, 16.4, 3.4, 4), OUTLINE, true),
  ],

  regen: [
    P(
      "M20 35 C8 26 4 20 4 14.5 C4 9.5 8 6 12.5 6 C15.8 6 18.6 7.8 20 10.6 " +
        "C21.4 7.8 24.2 6 27.5 6 C32 6 36 9.5 36 14.5 C36 20 32 26 20 35 Z",
      "#57c96a"
    ),
  ],

  // A disc with a bold bar struck through it. A true ring would need a punched
  // hole, and destination-out is banned here (it tears the layered canvas).
  silence: [
    P(ell(20, 20, 15, 15), "#b8b0c8"),
    P("M8.5 28.7 L28.7 8.5 L33 12.8 L12.8 33 Z", "#4a4458"),
  ],

  stealth: [
    P("M2 20 C9 10 31 10 38 20 C31 30 9 30 2 20 Z", "#8a93c4"),
    P(ell(20, 20, 6, 6), OUTLINE, true),
  ],

  death_immune: [
    P("M16 3 h8 v11 h11 v8 h-11 v15 h-8 v-15 h-11 v-8 h11 z", "#ffe9a8"),
  ],

  taunt: [
    P("M16.5 4 h7 l-1.2 19 h-4.6 z", "#e8483f"),
    P(ell(20, 31.6, 3.6, 3.6), "#e8483f"),
  ],

  // A screaming face. The only round-with-features silhouette in the set, so
  // it can't be mistaken for the curse skull (narrower, with a jaw block).
  fear: [
    P("M20 3 C28 3 33 9 33 18 C33 28 27 37 20 37 C13 37 7 28 7 18 C7 9 12 3 20 3 Z", "#9a86c8"),
    P(ell(14.6, 15.4, 3, 3.8), OUTLINE, true),
    P(ell(25.4, 15.4, 3, 3.8), OUTLINE, true),
    P(ell(20, 27.6, 4.4, 5.4), OUTLINE, true),
  ],
};

/**
 * Draw one status icon CENTRED on (x, y) at `size` px.
 * Authored in a 40×40 box, so the outline weight scales with the icon.
 */
export function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  type: StatusEffectType,
  x: number,
  y: number,
  size: number
): void {
  const parts = ICONS[type];
  if (!parts) return;
  const s = size / 40;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(s, s);
  ctx.lineWidth = OUTLINE_W;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  for (const part of parts) {
    ctx.fillStyle = part.c;
    ctx.fill(part.d);
    if (!part.ink) ctx.stroke(part.d);
  }
  ctx.restore();
}

/** Whether a status has an icon at all (the Renderer skips the rest). */
export function hasStatusIcon(type: StatusEffectType): boolean {
  return type in ICONS;
}
