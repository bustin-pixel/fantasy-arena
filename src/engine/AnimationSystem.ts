// ============================================================================
// AnimationSystem
// Presentation-only. It advances per-unit animation clocks and decays the
// hit-flash and death-fade timers. It NEVER affects combat outcomes, so the
// simulation stays deterministic even if rendering is skipped (headless replay).
//
// The renderer reads animTime/animState/hitFlash/deathFade to pick poses,
// apply the red damage flash, the moving bounce, and the death fade-out.
// ============================================================================

import type { Unit } from "@/types";
import { DEATH_FADE_TICKS, SEC_PER_TICK } from "@/utils/constants";

export function stepAnimation(units: Unit[]): void {
  for (const u of units) {
    // Reset the anim clock on state change so each animation starts at phase 0.
    if (u.animState !== u.state) {
      u.animState = u.state;
      u.animTime = 0;
    }
    u.animTime += SEC_PER_TICK;

    if (u.hitFlash > 0) u.hitFlash -= 1;

    if (u.state === "dead") {
      u.deathFade = Math.min(1, u.deathFade + 1 / DEATH_FADE_TICKS);
    }
  }
}
