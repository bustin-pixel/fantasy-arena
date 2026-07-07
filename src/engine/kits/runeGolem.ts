// Rune Golem — the Sealed Vault boss. One mechanic: Warded Hide — ancient runes
// halve every hit it takes (physical or magical alike), making it a slow,
// grinding wall. Implemented as a single HP-funnel hook; no active cast.
import type { UnitKit } from "./UnitKit";

/** Fraction of incoming damage that gets through the wards. */
const WARD_MULT = 0.5;

export const runeGolemKit: UnitKit = {
  roleClass: "melee",
  modifyIncomingDamage(_unit, amount) {
    return amount * WARD_MULT;
  },
};
