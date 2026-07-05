// ============================================================================
// Avatars — profile icon lookup.
// Today every avatar IS a unit (the icon is its portrait, ownership is its
// unlock), but callers resolve through getAvatar so future non-unit ids
// ("crest_dragon" chest drops, seasonal icons…) can join the same namespace
// without a save migration or touching any call site.
// ============================================================================

import { UNITS } from "@/data/units";

/** Default face for new saves — pairs with the default name "Champion".
 *  Must be a starter unit (always owned) so the avatar ⊆ unlocked invariant
 *  holds on a fresh save. */
export const DEFAULT_AVATAR_ID = "knight";

export interface Avatar {
  id: string;
  /** Display name for tooltips / aria labels. */
  name: string;
  /** Unit whose portrait renders as the icon. */
  portraitDefId: string;
}

/** Resolve an avatarId to something renderable, or null if unknown. */
export function getAvatar(id: string): Avatar | null {
  const def = UNITS[id];
  if (!def) return null;
  return { id, name: def.name, portraitDefId: id };
}

/** Avatar ⊆ unlocked: a unit avatar is wearable iff the unit is owned.
 *  (unlockedUnits only ever holds deckable ids, so monsters are excluded
 *  automatically.) */
export function isAvatarUnlocked(
  id: string,
  unlockedUnits: readonly string[]
): boolean {
  return getAvatar(id) !== null && unlockedUnits.includes(id);
}
