// Zombie Shambler — The Depths' fodder-tier horde monster (never deckable).
// Numbing Bite: every melee bite mires the victim in a 30% move+attack slow for
// 2s (refreshed each hit via applyEffect, never stacked). The horde's threat is
// being ground down and mired, not any single bite. No state, no active cast —
// its whole kit is one post-swing rider.
import type { UnitKit } from "./UnitKit";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

export const zombieShamblerKit: UnitKit = {
  onAfterAttack(unit, target) {
    applyEffect(
      target,
      makeEffect("slow", { source: unit.uid, durationSec: 2, magnitude: 0.3 })
    );
  },
};
