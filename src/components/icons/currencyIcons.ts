// ============================================================================
// Currency icons — the two most-shown glyphs in the game (~25 render sites
// between them). Previously the bare geometric marks ● and ◆.
// ============================================================================

import { PAL, p, circle, type IconDef } from "./iconPaint";

/** Gold — a struck coin with a star mint-mark. Replaces ●. */
export const gold: IconDef = {
  hue: PAL.gold,
  parts: [
    circle(20, 20, 14, "dark"),
    circle(20, 20, 11.5, "base"),
    p(
      "M20 12.5 L22.3 17.9 L28.1 18.4 L23.7 22.2 L25 27.9 L20 24.9 " +
        "L15 27.9 L16.3 22.2 L11.9 18.4 L17.7 17.9 Z",
      "dark"
    ),
  ],
};

/** Soul Shard — the premium currency. A faceted violet gem. Replaces ◆. */
export const shard: IconDef = {
  hue: PAL.arcane,
  parts: [
    p("M20 4 L31 16.5 L20 36 L9 16.5 Z", "base"),
    p("M20 4 L31 16.5 L20 36 Z", "dark"),
    p("M20 4 L25.5 16.5 L20 23.5 L14.5 16.5 Z", "base"),
    p("M17.4 10.2 L18.7 13.9 L16.6 13.2 Z", "accent"),
  ],
};
