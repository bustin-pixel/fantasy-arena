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
import { ITEM_LINES, makeItemKey } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { getUnitDef } from "@/data/units";
import { ItemIcon } from "@/components/ItemIcon";
import { useCountUp } from "@/hooks/useCountUp";

interface Props {
  contents: ChestContent[];
  /** World-space point the reveal floats above (the chest's top). */
  anchor: { x: number; y: number };
  /** Render-buffer size, to invert the renderer's centering transform. */
  bufW: number;
  bufH: number;
  onDismiss: () => void;
}

type ItemEntry = Extract<ChestContent, { kind: "item" }>;
type UnitEntry = Extract<ChestContent, { kind: "unit" }>;

export function FloorLootReveal({ contents, anchor, bufW, bufH, onDismiss }: Props) {
  const { scale, offsetX, offsetY } = fieldTransform(bufW, bufH);
  const leftPct = ((offsetX + anchor.x * scale) / bufW) * 100;
  const topPct = ((offsetY + anchor.y * scale) / bufH) * 100;

  // Chest gold = direct gold + any owned-duplicate refund.
  const gold = contents.reduce(
    (s, e) =>
      s + (e.kind === "gold" ? e.amount : e.kind === "duplicate" ? e.gold : 0),
    0
  );
  const shards = contents.reduce(
    (s, e) => s + (e.kind === "shards" ? e.amount : 0),
    0
  );
  const items = contents.filter((e): e is ItemEntry => e.kind === "item");
  const units = contents.filter((e): e is UnitEntry => e.kind === "unit");
  const shownGold = useCountUp(gold, true);

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
      {items.map((it, i) => (
        <div key={`i${i}`} className="floor-loot-item">
          <ItemIcon itemKey={makeItemKey(it.lineId, it.quality, 1)} size={54} />
          <span
            className="floor-loot-name"
            style={{ color: RARITIES[it.quality].color }}
          >
            {ITEM_LINES[it.lineId]?.name ?? it.lineId} ★1
          </span>
        </div>
      ))}

      {units.map((u, i) => {
        const def = getUnitDef(u.unitId);
        return (
          <div key={`u${i}`} className="floor-loot-item">
            <span
              className="floor-loot-name"
              style={{ color: RARITIES[def.rarity].color }}
            >
              {def.name} unlocked!
            </span>
          </div>
        );
      })}

      {gold > 0 && (
        <div className="floor-loot-gold">
          <span className="coin" aria-hidden>
            ●
          </span>{" "}
          +{shownGold} gold
        </div>
      )}

      {shards > 0 && (
        <div className="floor-loot-shards">
          <span className="shard-gem" aria-hidden>
            ◆
          </span>{" "}
          +{shards} Soul Shards
        </div>
      )}

      <div className="floor-loot-hint">tap to continue</div>
    </div>
  );
}
