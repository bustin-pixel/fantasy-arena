// ============================================================================
// Biome, banner, omen and compendium-spine icons.
// Replaces: 🕯️ 💀 🐺 🌿 🔮 🌗 ⛪ 🗡️ 🕊️ 🏴 🐀 🐾 🍃 ✦ ◐ ◎ ∞ ◆
// ============================================================================

import { PAL, p, rect, circle, ellipse, type IconDef } from "./iconPaint";
import { skullParts, crossbonesParts, daggerParts, leafParts } from "./iconShapes";

// --- Dungeon world nodes ----------------------------------------------------

/** The Depths — a guttering candle. */
export const depths: IconDef = {
  hue: PAL.wax,
  parts: [
    p("M10.5 34 h19 l-2.4 3.6 h-14.2 z", "dark"),
    rect(14.6, 18.5, 10.8, 15.5, "base", { rx: 1.4 }),
    rect(19.4, 15.4, 1.2, 3.4, "ink"),
    p("M20 2.6 C22.6 7.2 24.4 9 24.4 11.9 C24.4 14.6 22.4 16.6 20 16.6 C17.6 16.6 15.6 14.6 15.6 11.9 C15.6 9 17.4 7.2 20 2.6 Z", "accent"),
  ],
};

/** The Bonefields — a skull over crossed bones. */
export const bonefields: IconDef = {
  hue: PAL.bone,
  parts: [...crossbonesParts(), ...skullParts()],
};

/** The Wilds — a wolf's head. */
export const wilds: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M9 15 L6.6 4.6 L15 9.6 Z", "dark"),
    p("M31 15 L33.4 4.6 L25 9.6 Z", "dark"),
    p("M8.2 13.6 C8.2 8.4 13.6 6 20 6 C26.4 6 31.8 8.4 31.8 13.6 C31.8 19.6 29.2 23.8 26 25.8 L24.2 31.4 C24.2 34.5 22.4 36 20 36 C17.6 36 15.8 34.5 15.8 31.4 L14 25.8 C10.8 23.8 8.2 19.6 8.2 13.6 Z"),
    p("M15.9 25.4 L24.1 25.4 L23.5 31.4 C23.5 33.9 22 35.2 20 35.2 C18 35.2 16.5 33.9 16.5 31.4 Z", "dark"),
    p("M13 14.6 L17.6 16.5 L13 18.5 Z", "accent"),
    p("M27 14.6 L22.4 16.5 L27 18.5 Z", "accent"),
    ellipse(20, 32.4, 2, 1.5, "ink"),
  ],
};

/** The Overgrowth — a broad leaf on a climbing stem. */
export const overgrowth: IconDef = { hue: PAL.leaf, parts: leafParts() };

/** The Sealed Vault — a scrying orb on a stand. */
export const sealedVault: IconDef = {
  hue: PAL.arcane,
  parts: [
    p("M10 31.5 h20 l-2.6 4.6 h-14.8 z", "dark"),
    circle(20, 19, 12, "base"),
    p("M13.4 13 C14.8 10.2 17.4 8.6 20.2 8.6 C17.4 9.8 15.4 11.4 14.6 14.2 Z", "accent"),
  ],
};

/** The Eclipse Spire — a half-shadowed disc. */
export const eclipseSpire: IconDef = {
  hue: PAL.shadow,
  parts: [
    circle(20, 20, 12.5, "base"),
    p("M20 7.5 A12.5 12.5 0 0 1 20 32.5 Z", "accent"),
  ],
};

/** The Fallen Cathedral — a steepled church. */
export const fallenCathedral: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M17.4 12 L20 2.5 L22.6 12 Z", "dark"),
    p("M7 21.5 L20 10 L33 21.5 Z", "dark"),
    rect(10, 21.5, 20, 14.6, "base"),
    circle(20, 25.6, 2.4, "accent"),
    p("M17 30 a3 3 0 0 1 6 0 v6.1 h-6 z", "ink"),
  ],
};

/** The Rogue's Den — a dagger. */
export const roguesDen: IconDef = { hue: PAL.steel, parts: daggerParts("") };

// --- Conquest banners -------------------------------------------------------

/** Planted on a conquered Fallen Cathedral — a dove. */
export const bannerCathedral: IconDef = {
  hue: PAL.bone,
  parts: [
    p("M9.5 22.5 L2.5 26.5 L10 27.5 Z", "dark"),
    p("M9 24 C9 18 14 14 20 14 C24 14 27 15.5 29 18 L35 15.6 L32 21.4 C32 27.4 26.6 31.5 20 31.5 C13.6 31.5 9 28.4 9 24 Z", "base"),
    p("M16 17.4 C20 15.4 25 16.8 27 20.4 C23 21 19 20.4 16 17.4 Z", "dark"),
    circle(26.6, 19.2, 1.3, "ink"),
  ],
};

/** Planted on a conquered Rogue's Den — a black flag. */
export const bannerRoguesDen: IconDef = {
  hue: PAL.shadow,
  parts: [
    rect(8.5, 3, 3.2, 33, "dark", { rx: 1.4 }),
    p("M11.7 5.5 h20.8 l-4.4 6.6 l4.4 6.6 h-20.8 z", "base"),
  ],
};

// --- Path omens -------------------------------------------------------------

/** The safe road — greenery ahead. */
export const omenSafe: IconDef = { hue: PAL.leaf, parts: leafParts() };

// --- Compendium book spines -------------------------------------------------

/** Depths bestiary — a rat. */
export const bookDepths: IconDef = {
  hue: PAL.wood,
  parts: [
    p("M9 29 C4.5 29.5 3 25 5.8 21.6", "dark", { fill: "none", strokeWidth: 2.4 }),
    ellipse(18, 26, 10, 7.6, "base"),
    p("M26 21.6 C31 21.6 35.6 24.2 35.6 26.6 C35.6 28.6 31 30.8 26 30.8 Z", "base"),
    circle(23.6, 19.6, 4.2, "base"),
    circle(23.6, 19.6, 2, "dark"),
    circle(29.6, 25.2, 1.3, "ink"),
    circle(34.6, 26.8, 1.2, "ink"),
  ],
};

/** Wilds bestiary — a paw print. */
export const bookWilds: IconDef = {
  hue: PAL.steel,
  parts: [
    ellipse(11.6, 18.4, 3.4, 4.4, "base", { transform: "rotate(-22 11.6 18.4)" }),
    ellipse(17.2, 14.6, 3.4, 4.8, "base"),
    ellipse(22.8, 14.6, 3.4, 4.8, "base"),
    ellipse(28.4, 18.4, 3.4, 4.4, "base", { transform: "rotate(22 28.4 18.4)" }),
    p("M20 22.4 C25.5 22.4 29.6 25.8 29.6 29.6 C29.6 33 26.6 34.6 20 34.6 C13.4 34.6 10.4 33 10.4 29.6 C10.4 25.8 14.5 22.4 20 22.4 Z", "base"),
  ],
};

/** Overgrowth bestiary — a leaf. */
export const bookOvergrowth: IconDef = { hue: PAL.leaf, parts: leafParts() };

/** Sealed Vault bestiary — an arcane star. */
export const bookSealedVault: IconDef = {
  hue: PAL.arcane,
  parts: [
    p("M20 2 L23.4 16.6 L38 20 L23.4 23.4 L20 38 L16.6 23.4 L2 20 L16.6 16.6 Z"),
    circle(20, 20, 2.6, "accent"),
  ],
};

/** Tendencies — an eye, for targeting personality. */
export const bookTendencies: IconDef = {
  hue: PAL.steel,
  parts: [
    p("M4 20 C10 12 30 12 36 20 C30 28 10 28 4 20 Z"),
    circle(20, 20, 5.8, "dark"),
    circle(20, 20, 2.6, "ink"),
  ],
};

/** Boons — an infinity ribbon. Stroked, so it carries its own ink pass. */
const BOON_RIBBON =
  "M20 20 C17 13.6 12.8 11.6 9.6 13.8 C6 16.3 6 23.7 9.6 26.2 " +
  "C12.8 28.4 17 26.4 20 20 C23 13.6 27.2 11.6 30.4 13.8 " +
  "C34 16.3 34 23.7 30.4 26.2 C27.2 28.4 23 26.4 20 20 Z";
export const bookBoons: IconDef = {
  hue: PAL.gold,
  parts: [
    p(BOON_RIBBON, "base", { fill: "none", stroke: "#12100d", strokeWidth: 8.5 }),
    p(BOON_RIBBON, "base", { fill: "none", stroke: PAL.gold.base, strokeWidth: 4.5 }),
  ],
};

/** Items — a cut gem. */
export const bookItems: IconDef = {
  hue: PAL.gold,
  parts: [
    p("M20 4 L31 16.5 L20 36 L9 16.5 Z", "base"),
    p("M20 4 L31 16.5 L20 36 Z", "dark"),
    p("M20 4 L25.5 16.5 L20 23.5 L14.5 16.5 Z", "base"),
    p("M17.4 10.2 L18.7 13.9 L16.6 13.2 Z", "accent"),
  ],
};
