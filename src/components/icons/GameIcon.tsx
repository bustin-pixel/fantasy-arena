// ============================================================================
// GameIcon — the single registry every drawn UI icon is served from.
//
// These replace the game's emoji. Emoji were never ours: they render as Segoe
// UI Emoji on Windows, Apple Color Emoji on iOS and Noto on Android, so the
// same screen looked like three different games and none of them matched the
// gold/steel/bone palette. Mobile also auto-emojifies bare dingbats like ☠ and
// ⚠, which is why those are in here too.
//
// Adding an icon: author its parts in one of the three data files, then add a
// line to ICONS below. The name is its MEANING, not its old glyph — 💀 used to
// do three unrelated jobs (a curse, the Bonefields, a cleared boss node) and
// they're separate names here so they can diverge without a rename.
//
// NOT replaced, deliberately: ✕ ✓ ★ ☆ ← → ⟳ ↺ ✎ and friends. Those are UI
// chrome that reads correctly as type on every platform.
// ============================================================================

import { renderParts, type IconDef } from "./iconPaint";
import * as currency from "./currencyIcons";
import * as ui from "./uiIcons";
import * as biome from "./biomeIcons";

const ICONS = {
  // Currency
  gold: currency.gold,
  shard: currency.shard,

  // Navigation & controls
  shop: ui.shop,
  forge: ui.forge,
  settings: ui.settings,
  commander: ui.commander,
  soundOn: ui.soundOn,
  soundOff: ui.soundOff,
  dev: ui.dev,

  // Equipment slots
  weapon: ui.weapon,
  armor: ui.armor,

  // State markers
  warning: ui.warning,
  locked: ui.locked,
  bossSkull: ui.bossSkull,
  bossCleared: ui.bossCleared,

  // Dungeon world nodes
  depths: biome.depths,
  bonefields: biome.bonefields,
  wilds: biome.wilds,
  overgrowth: biome.overgrowth,
  sealedVault: biome.sealedVault,
  deepForge: ui.forge,
  eclipseSpire: biome.eclipseSpire,
  fallenCathedral: biome.fallenCathedral,
  roguesDen: biome.roguesDen,

  // Conquest banners
  bannerCathedral: biome.bannerCathedral,
  bannerRoguesDen: biome.bannerRoguesDen,

  // Path omens
  omenSafe: biome.omenSafe,
  omenOminous: ui.bossSkull,
  omenTreasure: ui.treasure,

  // Compendium book spines. Several share a drawing with their dungeon — the
  // book IS about that place — but keep their own name so a spine can be
  // redrawn without touching the Atlas.
  bookDepths: biome.bookDepths,
  bookBonefields: biome.bonefields,
  bookWilds: biome.bookWilds,
  bookOvergrowth: biome.bookOvergrowth,
  bookSealedVault: biome.bookSealedVault,
  bookDeepForge: ui.settings,
  bookEclipseSpire: biome.eclipseSpire,
  bookCathedral: biome.fallenCathedral,
  bookRoguesDen: biome.roguesDen,
  bookHeroes: ui.weapon,
  bookTendencies: biome.bookTendencies,
  bookBoons: biome.bookBoons,
  bookItems: biome.bookItems,
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export interface GameIconProps {
  name: IconName;
  /**
   * Defaults to `1em` so an icon inherits the surrounding font-size exactly
   * the way the emoji it replaced did. Pass a number only where the call site
   * wants a fixed box (FABs, book spines).
   */
  size?: number | string;
  className?: string;
  /** Set when the icon is the ONLY content of its control and needs a name. */
  title?: string;
}

export function GameIcon({ name, size, className, title }: GameIconProps) {
  const dim = size ?? "1em";
  return (
    <svg
      className={className ? `game-icon ${className}` : "game-icon"}
      viewBox="0 0 40 40"
      width={dim}
      height={dim}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {renderParts(ICONS[name])}
    </svg>
  );
}

/** Every registered name — used by the icon-sheet dev harness. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
