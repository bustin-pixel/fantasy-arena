// Rogue — a fast stealth skirmisher. Enters stealthed (onSpawn), reveals on its
// first strike (onBeforeAttack), and envenoms every melee hit with a short,
// fast-ticking poison that refreshes (never stacks) so it keeps damaging between
// its quick swings (onAfterAttack). Its `venom` ability slot is a passive (no
// active cast), so the cast pipeline leaves it alone.
import type { UnitKit } from "./UnitKit";
import { MATCH_TIME_SEC } from "@/utils/constants";
import { applyEffect, makeEffect } from "../StatusEffectSystem";

export const rogueKit: UnitKit = {
  roleClass: "melee",

  onSpawn(unit) {
    applyEffect(
      unit,
      makeEffect("stealth", { source: unit.uid, durationSec: MATCH_TIME_SEC })
    );
  },

  onBeforeAttack(unit) {
    // Reveal on the strike (a no-op once already revealed).
    unit.effects = unit.effects.filter((e) => e.type !== "stealth");
  },

  onAfterAttack(unit, target) {
    applyEffect(
      target,
      makeEffect("poison", {
        source: unit.uid,
        durationSec: 3,
        damagePerTick: 3,
        tickIntervalSec: 0.5,
      })
    );
  },
};
