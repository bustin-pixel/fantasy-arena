import { useEffect, useState } from "react";
import { subscribeSpriteLoad } from "@/assets/imageSprites";
import { getSettings, subscribeSettings } from "@/state/settings";

/**
 * A counter that changes whenever unit art could look different.
 *
 * Any component that paints unit art to a canvas ONCE (in an effect) must put
 * this in its dependency array, or it will show whatever was true at mount
 * forever. Two things move it:
 *
 *  1. **The `pixelArt` setting flips.** Turning "Pixel sprites" off swaps the
 *     whole roster to the original hand-drawn art — reported as "the collection
 *     cards don't change until I click one" (clicking mounted the detail panel,
 *     which painted fresh).
 *  2. **A unit's pixel art finishes decoding.** Loading is async, so a card
 *     painted during the first frames draws the procedural fallback and would
 *     keep it. This is the subtler half of the same bug and affects a cold
 *     load even with the setting untouched.
 *
 * The battle canvas doesn't need this — it repaints every rAF.
 */
export function useSpriteEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let pixelArt = getSettings().pixelArt;
    const bump = () => setEpoch((n) => n + 1);
    const offSettings = subscribeSettings((s) => {
      // Only repaint when the art-affecting flag actually changed — volume and
      // speed changes fire this too.
      if (s.pixelArt !== pixelArt) {
        pixelArt = s.pixelArt;
        bump();
      }
    });
    const offLoad = subscribeSpriteLoad(bump);
    return () => {
      offSettings();
      offLoad();
    };
  }, []);
  return epoch;
}
