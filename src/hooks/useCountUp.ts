// ============================================================================
// useCountUp — animate 0 → target over ~800ms. Presentation only; the real
// value is already committed to the save (grant-then-reveal). Shared by the
// results-screen RewardPanel and the on-floor loot reveal (FloorLootReveal).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { playSfx } from "@/audio/sfx";

/** Animate 0 → target over ~800ms. With `tick`, plays a coin tick as the
 *  counter rolls — time-throttled (≥90ms) rather than per-value so big totals
 *  don't machine-gun; the ease-out makes the ticks decelerate like coins
 *  settling, pitch rising as the count lands. */
export function useCountUp(target: number, tick = false): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const prevRef = useRef(0);
  const lastTickRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const DURATION = 800;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const v = Math.round(target * (1 - Math.pow(1 - t, 3))); // ease-out cubic
      if (tick && v !== prevRef.current && now - lastTickRef.current >= 90) {
        lastTickRef.current = now;
        playSfx("coinTick", 1 + t * 0.25);
      }
      prevRef.current = v;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, tick]);
  return value;
}
