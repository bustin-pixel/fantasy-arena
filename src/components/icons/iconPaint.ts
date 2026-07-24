// ============================================================================
// Icon paint — the shared treatment every GameIcon is drawn with.
//
// Style direction: INKED WOODCUT (picked from public/mockups/icon-set.html).
// Every shape carries a heavy dark outline like a medieval print; highlight
// facets are dropped so the silhouette does the work. That's what keeps these
// legible at 13px over a busy battlefield, which is the hardest case in the
// game — see docs/icon-set-mockups.md for the directions that lost.
//
// An icon is authored as PART DATA (geometry + a semantic role), never as raw
// JSX. The role -> paint mapping lives here alone, so the whole 38-icon set
// retunes from one place and no icon can drift off-style.
// ============================================================================

import { createElement, type ReactNode } from "react";

/**
 * What a part means, not what colour it is.
 * - `base`   the silhouette
 * - `dark`   shading AND detail marks (a coin's star, a wolf's ears, a haft)
 * - `accent` the one thing that should catch the eye (eyes, embers, glints)
 * - `ink`    punched-out holes — eye sockets, a keyhole. Never outlined.
 */
export type Role = "base" | "dark" | "accent" | "ink";

export interface IconPart {
  k: "path" | "circle" | "rect" | "ellipse";
  /** Raw SVG geometry attributes, React-cased. */
  a: Record<string, string | number>;
  role: Role;
}

export interface IconDef {
  parts: IconPart[];
  /** Which palette the roles resolve against. */
  hue: Palette;
}

export interface Palette {
  base: string;
  dark: string;
  accent: string;
  ink: string;
}

/** The woodcut outline. One weight for the whole set — do not vary per icon. */
const OUTLINE = "#12100d";
const OUTLINE_W = 2;

// Palettes are the game's existing gold/steel/bone vocabulary (styles.css :root).
export const PAL = {
  gold: { base: "#f5b301", dark: "#8a6410", accent: "#fff3c4", ink: "#4a3608" },
  bone: { base: "#cbc5b5", dark: "#6b6552", accent: "#f5b301", ink: "#12100d" },
  steel: { base: "#cdd2d8", dark: "#7d858e", accent: "#f5b301", ink: "#16100a" },
  wood: { base: "#7a5330", dark: "#3a2c1c", accent: "#f5b301", ink: "#241a10" },
  arcane: { base: "#a97bd6", dark: "#6b4494", accent: "#ffffff", ink: "#2e1a44" },
  fire: { base: "#e8541f", dark: "#9c2f0c", accent: "#ffe08a", ink: "#5c1a06" },
  leaf: { base: "#4f8f3a", dark: "#2f5a22", accent: "#9ed36a", ink: "#16290f" },
  wax: { base: "#ece3cf", dark: "#8a6410", accent: "#ffc23d", ink: "#3a2c1c" },
  blood: { base: "#b23b3b", dark: "#6e2020", accent: "#ffc23d", ink: "#3a0f0f" },
  shadow: { base: "#4a4458", dark: "#2b2735", accent: "#c9b6ef", ink: "#15121d" },
} satisfies Record<string, Palette>;

/**
 * Turn part data into SVG children. `ink` parts are cutouts, so they never get
 * the outline — stroking a hole would fill it back in at small sizes.
 */
export function renderParts(def: IconDef): ReactNode[] {
  return def.parts.map((p, i) =>
    createElement(p.k, {
      key: i,
      fill: def.hue[p.role],
      ...(p.role === "ink"
        ? {}
        : {
            stroke: OUTLINE,
            strokeWidth: OUTLINE_W,
            strokeLinejoin: "round" as const,
            strokeLinecap: "round" as const,
          }),
      // Authored attributes come LAST so a part can opt out of the defaults —
      // an open stroke needs fill:"none", a hairline needs its own width.
      ...p.a,
    })
  );
}

// --- Authoring helpers ------------------------------------------------------
// Keep icon files readable: `p("M...")` instead of a nested object literal.

export const p = (d: string, role: Role = "base", extra?: Record<string, string | number>): IconPart =>
  ({ k: "path", a: { d, ...extra }, role });

export const circle = (cx: number, cy: number, r: number, role: Role = "base"): IconPart =>
  ({ k: "circle", a: { cx, cy, r }, role });

export const ellipse = (
  cx: number, cy: number, rx: number, ry: number,
  role: Role = "base",
  extra?: Record<string, string | number>
): IconPart => ({ k: "ellipse", a: { cx, cy, rx, ry, ...extra }, role });

export const rect = (
  x: number, y: number, width: number, height: number,
  role: Role = "base",
  extra?: Record<string, string | number>
): IconPart => ({ k: "rect", a: { x, y, width, height, ...extra }, role });

/** Repeat one part around the centre — gear teeth, arcane rays. */
export const radial = (part: IconPart, count: number): IconPart[] =>
  Array.from({ length: count }, (_, i) => ({
    ...part,
    a: { ...part.a, transform: `rotate(${(360 / count) * i} 20 20)` },
  }));
