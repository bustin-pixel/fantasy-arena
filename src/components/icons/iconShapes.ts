// ============================================================================
// Reusable multi-part shapes. Several icons are honestly the SAME drawing in
// different contexts — a skull serves the boss marker, the Bonefields biome,
// its compendium book and the ominous omen. Drawing it once here keeps them
// from drifting apart, while each still gets its own IconName so they're free
// to diverge later without a rename.
// ============================================================================

import { p, rect, circle, ellipse, radial, type IconPart, type Role } from "./iconPaint";

/**
 * A bare skull, cranium centred near (20,17) with a jaw of teeth.
 * `socket` lets a variant re-tint the eyes — the cleared-boss marker gilds
 * them to read as a claimed trophy rather than a live threat.
 */
export const skullParts = (socket: Role = "ink"): IconPart[] => [
  p(
    "M10 19 C9.2 8.6 13.6 4.6 20 4.6 C26.4 4.6 30.8 8.6 30 19 " +
      "C30 22.6 27.8 24.2 26.4 25.6 L13.6 25.6 C12.2 24.2 10 22.6 10 19 Z"
  ),
  rect(13.8, 25.6, 2.7, 4.0, "base", { rx: 0.9 }),
  rect(17.2, 25.6, 2.7, 4.4, "base", { rx: 0.9 }),
  rect(20.6, 25.6, 2.7, 4.4, "base", { rx: 0.9 }),
  rect(24.0, 25.6, 2.7, 4.0, "base", { rx: 0.9 }),
  ellipse(15.6, 16.4, 3.4, 4.0, socket),
  ellipse(24.4, 16.4, 3.4, 4.0, socket),
  p(
    "M20 19.6 C19 21.4 18.1 21.8 18.5 23.5 L20 22.5 L21.5 23.5 " +
      "C21.9 21.8 21 21.4 20 19.6 Z",
    "ink"
  ),
];

/** Two long bones crossed behind whatever sits on top of them. */
export const crossbonesParts = (): IconPart[] => [
  rect(4.5, 28.0, 31, 4.2, "dark", { rx: 2.1, transform: "rotate(22 20 20)" }),
  rect(4.5, 28.0, 31, 4.2, "dark", { rx: 2.1, transform: "rotate(-22 20 20)" }),
];

/** A dagger, point up. `tf` places/rotates it. */
export const daggerParts = (tf: string): IconPart[] => [
  p("M17.6 20 L20 3 L22.4 20 Z", "base", { transform: tf }),
  rect(13.2, 20, 13.6, 2.8, "dark", { rx: 1.2, transform: tf }),
  rect(18.5, 22.8, 3, 9, "dark", { rx: 1, transform: tf }),
  { k: "circle", a: { cx: 20, cy: 33.4, r: 2.4, transform: tf }, role: "accent" },
];

/** One sword, hilt down, drawn along the vertical then rotated by `tf`. */
export const swordParts = (tf: string): IconPart[] => [
  p("M18 24 L22 24 L20 4 Z", "base", { transform: tf }),
  rect(14.4, 24, 11.2, 2.8, "dark", { rx: 1.2, transform: tf }),
  rect(18.2, 26.8, 3.6, 7.4, "dark", { transform: tf }),
  { k: "circle", a: { cx: 20, cy: 35.4, r: 2.7, transform: tf }, role: "accent" },
];

/** An eight-toothed gear filling the box. */
export const gearParts = (): IconPart[] => [
  ...radial(rect(17.1, 3.4, 5.8, 7, "base", { rx: 1.2 }), 8),
  circle(20, 20, 11.4, "base"),
  circle(20, 20, 4.6, "ink"),
];

/** A single leaf on a stem, angled up-right. */
export const leafParts = (): IconPart[] => [
  p("M8 33 C14 27 18 22 22.5 14", "dark", { fill: "none", strokeWidth: 2.6 }),
  p(
    "M20 20 C24 9 32 5.5 35 5 C35.5 9.5 33 19 26 23 C23 24.7 20.8 23.6 20 20 Z",
    "base"
  ),
  p("M33.4 7.4 C29 11.5 25.6 16.4 23.4 21.6", "dark", { fill: "none", strokeWidth: 1.6 }),
];
