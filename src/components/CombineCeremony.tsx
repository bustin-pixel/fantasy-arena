// ============================================================================
// CombineCeremony — the merge animation overlay. Pure theater: by the time it
// mounts, combineItems() has already committed the merge (grant-then-reveal),
// so skipping or closing early loses nothing. A phased timeline (the
// RewardPanel chest pattern, driven by timeouts instead of rAF since the
// movement is CSS transitions): two fuel icons slide together → anvil clash +
// flash → the result pops in with a shimmer (and a level-up stinger when the
// merge crossed a QUALITY, not just a star).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { ITEM_LINES, parseItemKey } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { ItemIcon } from "@/components/ItemIcon";
import { playSfx } from "@/audio/sfx";
import { playStinger } from "@/audio/music";

interface Props {
  /** The fuel key (two of these were consumed). */
  from: string;
  /** The merge result key. */
  to: string;
  onDone: () => void;
}

type Phase = "slide" | "flash" | "reveal";

const SLIDE_MS = 550;
const FLASH_MS = 240;
const LINGER_MS = 1500;

export function CombineCeremony({ from, to, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("slide");
  const doneRef = useRef(false);
  const finish = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  };

  const fromP = parseItemKey(from);
  const toP = parseItemKey(to);
  const qualityUp = fromP && toP && fromP.quality !== toP.quality;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => {
        setPhase("flash");
        playSfx("anvil");
      }, SLIDE_MS),
      window.setTimeout(() => {
        setPhase("reveal");
        playSfx("itemReveal");
        if (qualityUp) playStinger("levelup");
      }, SLIDE_MS + FLASH_MS),
      window.setTimeout(finish, SLIDE_MS + FLASH_MS + LINGER_MS),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fromP || !toP) return null;
  const line = ITEM_LINES[toP.lineId];
  const toColor = RARITIES[toP.quality].color;

  return (
    <div
      className="combine-overlay"
      onClick={finish}
      role="dialog"
      aria-label="Combining items"
    >
      <div className={`combine-stage ${phase}${qualityUp ? " quality-up" : ""}`}>
        {phase !== "reveal" && (
          <>
            <div className="combine-fuel left">
              <ItemIcon itemKey={from} size={72} />
            </div>
            <div className="combine-fuel right">
              <ItemIcon itemKey={from} size={72} />
            </div>
          </>
        )}
        {phase === "flash" && <div className="combine-flash" />}
        {phase === "reveal" && (
          <div className="combine-result">
            <div className="combine-burst" style={{ color: toColor }} aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} style={{ transform: `rotate(${i * 45}deg)` }} />
              ))}
            </div>
            <ItemIcon itemKey={to} size={96} />
            <div className="combine-result-name" style={{ color: toColor }}>
              {line.name}
            </div>
            <div className="combine-result-tier">
              {qualityUp
                ? `${RARITIES[toP.quality].label}!`
                : `${"★".repeat(toP.star)}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
