// ============================================================================
// FloorLootReveal — the loot that floats up out of the on-floor reward chest
// once the lid lands. An HTML overlay (not canvas): the item icon rises + glows
// forge-style, the gold counts up with coin ticks, shards/unit unlocks tag on.
// Pure presentation — rewards were granted at resolution; this is theater.
// Anchored over the chest via the same world→screen transform the renderer uses
// (BattleUnitTip's leftPct/topPct pattern). Auto-dismisses, or tap to skip.
// ============================================================================

import { useEffect, useRef } from "react";
import type { ChestContent } from "@/meta/rewards";
import { fieldTransform } from "@/utils/constants";
import { ChestLoot } from "@/components/ChestLoot";

interface Props {
  contents: ChestContent[];
  /** World-space point the reveal floats above (the chest's top). */
  anchor: { x: number; y: number };
  /** Render-buffer size, to invert the renderer's centering transform. */
  bufW: number;
  bufH: number;
  onDismiss: () => void;
}

export function FloorLootReveal({ contents, anchor, bufW, bufH, onDismiss }: Props) {
  const { scale, offsetX, offsetY } = fieldTransform(bufW, bufH);
  const leftPct = ((offsetX + anchor.x * scale) / bufW) * 100;
  const topPct = ((offsetY + anchor.y * scale) / bufH) * 100;

  // Linger so the loot registers, then move on (a tap skips ahead). MOUNT-ONLY:
  // BattleScreen re-renders ~6×/s, so depending on `onDismiss` (a fresh closure
  // each render) would clear + restart this timer every frame and it would never
  // fire — leaving the outro stuck at the open chest. Read the latest via a ref.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const t = window.setTimeout(() => onDismissRef.current(), 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="floor-loot"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      onClick={onDismiss}
      role="button"
      aria-label="Continue"
    >
      <ChestLoot contents={contents} />
      <div className="floor-loot-hint">tap to continue</div>
    </div>
  );
}
