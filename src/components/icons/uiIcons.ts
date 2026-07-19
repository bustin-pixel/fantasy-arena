// ============================================================================
// UI icons — navigation, controls, slots and markers.
// Replaces: 💰 ⚒️ ⚙️ ⚜ 🔊 🔇 🛠 ⚔ 🛡 ⚠ 🔒 ☠ 💀
// ============================================================================

import { PAL, p, rect, circle, ellipse, type IconDef } from "./iconPaint";
import { skullParts, gearParts, swordParts } from "./iconShapes";

/** Grubbins' Pawn-Den — a drawstring coin purse. (Shop FAB.) */
export const shop: IconDef = {
  hue: PAL.wood,
  parts: [
    p(
      "M11 21 C11 16 14.5 13.5 20 13.5 C25.5 13.5 29 16 29 21 L30.5 30 " +
        "C30.5 34 26 36.5 20 36.5 C14 36.5 9.5 34 9.5 30 Z"
    ),
    p("M13.8 15.6 C16 12.4 24 12.4 26.2 15.6 L26.2 18 C23.6 15.6 16.4 15.6 13.8 18 Z", "dark"),
    p("M16.6 6.5 L20 12.8 L23.4 6.5 L21.8 13.2 L18.2 13.2 Z", "dark"),
    circle(20, 27, 4.6, "accent"),
  ],
};

/** The Forge / Blacksmith — a smith's hammer. (Forge FAB, Forge buttons.) */
export const forge: IconDef = {
  hue: PAL.steel,
  parts: [
    rect(18.2, 17, 3.6, 19, "dark", { rx: 1.5, transform: "rotate(-35 20 20)" }),
    rect(18.2, 29.5, 3.6, 6.5, "ink", { rx: 1.5, transform: "rotate(-35 20 20)" }),
    p("M8.5 5 h23 v10.5 a2 2 0 0 1 -2 2 h-19 a2 2 0 0 1 -2 -2 z", "base", {
      transform: "rotate(-35 20 20)",
    }),
    rect(27.6, 5, 3.9, 12.5, "dark", { transform: "rotate(-35 20 20)" }),
  ],
};

/** Settings. */
export const settings: IconDef = { hue: PAL.steel, parts: gearParts() };

/** The Commander's crest — a fleur-de-lis. */
export const commander: IconDef = {
  hue: PAL.gold,
  parts: [
    p("M20 3 C23 9 24 13.5 24 18 C24 20 22.5 21.5 20 21.5 C17.5 21.5 16 20 16 18 C16 13.5 17 9 20 3 Z"),
    p("M16 12 C11 12.5 8 16 8.5 20 C9 23 11.5 24 13.5 22.8 C11.8 22 11.5 20 12.6 18.6 C13.7 17.2 15 17.2 16 18 Z"),
    p("M24 12 C29 12.5 32 16 31.5 20 C31 23 28.5 24 26.5 22.8 C28.2 22 28.5 20 27.4 18.6 C26.3 17.2 25 17.2 24 18 Z"),
    rect(13.2, 21.4, 13.6, 3.2, "dark", { rx: 1.2 }),
    p("M17 24.6 h6 l1.4 8.8 C24.4 35.4 22.4 36.4 20 36.4 C17.6 36.4 15.6 35.4 15.6 33.4 Z"),
  ],
};

const SPEAKER = p("M7 16 h6.4 l8.6 -7.4 v22.8 l-8.6 -7.4 h-6.4 z");

/** Sound on. */
export const soundOn: IconDef = {
  hue: PAL.steel,
  parts: [
    SPEAKER,
    p("M25 15 C27.5 17.2 27.5 22.8 25 25 L26.6 26.8 C30 24 30 16 26.6 13.2 Z", "dark"),
    p("M29.4 10.4 C34 14.6 34 25.4 29.4 29.6 L31 31.4 C36.4 26.4 36.4 13.6 31 8.6 Z", "dark"),
  ],
};

/** Sound muted. */
export const soundOff: IconDef = {
  hue: PAL.steel,
  parts: [
    SPEAKER,
    rect(24.6, 18.2, 13, 3.4, "dark", { rx: 1.7, transform: "rotate(45 31.1 19.9)" }),
    rect(24.6, 18.2, 13, 3.4, "dark", { rx: 1.7, transform: "rotate(-45 31.1 19.9)" }),
  ],
};

/** Dev-panel toggle (local builds only) — a spanner. */
export const dev: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M10.5 29.5 L22 18 L26 22 L14.5 33.5 A2.8 2.8 0 0 1 10.5 29.5 Z"),
    p("M32.6 7.4 A8.5 8.5 0 1 0 32.6 19.6 L28.9 16.9 A4.2 4.2 0 1 1 28.9 10.1 Z"),
  ],
};

/** Weapon slot / the Heroes book — crossed swords. Mirrors ModeIcons' ArenaIcon. */
export const weapon: IconDef = {
  hue: PAL.steel,
  parts: [
    ...swordParts("rotate(34 20 20)"),
    ...swordParts("rotate(-34 20 20)"),
  ],
};

/** Armour slot — a kite shield. */
export const armor: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M20 4 L33 8 C33 20 29 30 20 36.5 C11 30 7 20 7 8 Z"),
    rect(7.4, 14.6, 25.2, 3, "dark"),
    circle(20, 11, 3.4, "accent"),
  ],
};

/** Underlevelled warning. */
export const warning: IconDef = {
  hue: PAL.gold,
  parts: [
    p("M20 4.5 L36 33 C36.9 34.7 35.8 36.2 34 36.2 H6 C4.2 36.2 3.1 34.7 4 33 Z"),
    rect(17.9, 14, 4.2, 11.4, "ink", { rx: 1.7 }),
    circle(20, 30, 2.4, "ink"),
  ],
};

/** Locked — a padlock. Used for gated units, books, floors and avatars. */
export const locked: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M13 19 V14.4 A7 7 0 0 1 27 14.4 V19 H22.7 V14.4 A2.7 2.7 0 0 0 17.3 14.4 V19 Z", "dark"),
    rect(8.6, 18.4, 22.8, 17, "base", { rx: 2.6 }),
    circle(20, 24.6, 2.7, "ink"),
    p("M18.6 25.4 h2.8 l-0.8 5.4 h-1.2 Z", "ink"),
  ],
};

/** A live boss threat. (Battle banners, floor markers, the ominous omen.) */
export const bossSkull: IconDef = { hue: PAL.bone, parts: skullParts() };

/**
 * A boss already put down — the same skull, sockets gilded so a cleared node
 * reads as a claimed trophy rather than a standing threat.
 */
export const bossCleared: IconDef = { hue: PAL.bone, parts: skullParts("accent") };

/** Glinting treasure — a spill of coins. Distinct from the single `gold` coin. */
export const treasure: IconDef = {
  hue: PAL.gold,
  parts: [
    ellipse(20, 30, 11.6, 5.2),
    ellipse(14.4, 24.6, 7, 3.4),
    ellipse(24.6, 23.6, 6.4, 3.2),
    p("M28.5 6 L30.1 11.2 L35.3 12.8 L30.1 14.4 L28.5 19.6 L26.9 14.4 L21.7 12.8 L26.9 11.2 Z", "accent"),
  ],
};
