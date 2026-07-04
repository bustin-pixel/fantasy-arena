// ============================================================================
// FloorPickerSheet — choose a Depths floor before descending.
// Selectable floors: everything cleared (replayable) plus the next uncleared
// one, capped at the deepest floor that has tier data. Reuses the
// detail-overlay modal pattern (AppShell exempts it from page-swipe drags).
// ============================================================================

import { useEffect, useState } from "react";
import { DEPTHS_TIERS, isBossFloor } from "@/data/depths";
import { GOLD_REWARDS } from "@/meta/economy";

interface Props {
  highestClearedFloor: number;
  onDescend: (floor: number) => void;
  onClose: () => void;
}

/** Deepest floor the current tier tables can build a wave for. */
export const MAX_FLOOR_WITH_DATA =
  DEPTHS_TIERS[DEPTHS_TIERS.length - 1].floors[1];

export function FloorPickerSheet({
  highestClearedFloor,
  onDescend,
  onClose,
}: Props) {
  const maxSelectable = Math.min(
    highestClearedFloor + 1,
    MAX_FLOOR_WITH_DATA
  );
  // Default to the next uncleared floor (clamped) — descent is always optimal.
  const [selected, setSelected] = useState(maxSelectable);

  // Close on Escape + freeze the background scroll, like UnitDetail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  const floors = [];
  for (let f = 1; f <= maxSelectable; f++) floors.push(f);

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal floor-sheet"
        role="dialog"
        aria-label="Choose a floor"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="floor-sheet-title">The Depths</h3>

        <ul className="floor-list">
          {floors.map((floor) => {
            const cleared = floor <= highestClearedFloor;
            const boss = isBossFloor(floor);
            const firstClearGold =
              GOLD_REWARDS.depthsFirstClearBase +
              GOLD_REWARDS.depthsFirstClearPerFloor * floor;
            return (
              <li key={floor}>
                <button
                  type="button"
                  className={`floor-row ${selected === floor ? "selected" : ""} ${
                    boss ? "boss" : ""
                  }`}
                  onClick={() => setSelected(floor)}
                >
                  <span className="floor-num">
                    {boss ? "☠ " : ""}Floor {floor}
                  </span>
                  <span className="floor-reward">
                    {cleared
                      ? `✓ Replay · ${GOLD_REWARDS.depthsReplay}g`
                      : `${firstClearGold}g + ${boss ? "silver" : "wooden"} chest`}
                  </span>
                </button>
              </li>
            );
          })}
          {maxSelectable < MAX_FLOOR_WITH_DATA && (
            <li className="floor-locked" aria-hidden>
              Floor {maxSelectable + 1} — clear floor {maxSelectable} first
            </li>
          )}
        </ul>

        <div className="detail-footer">
          <button className="btn btn-close-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-gold" onClick={() => onDescend(selected)}>
            Descend — Floor {selected}
          </button>
        </div>
      </div>
    </div>
  );
}
