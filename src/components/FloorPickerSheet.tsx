// ============================================================================
// FloorPickerSheet — choose a floor before descending into a dungeon.
// Selectable floors: everything cleared (replayable) plus the next uncleared
// one, capped at the dungeon's deepest floor. Reuses the detail-overlay modal
// pattern (AppShell exempts it from page-swipe drags). Dungeon-driven: The
// Depths and every themed legendary dungeon share this one sheet.
// ============================================================================

import { useEffect, useState } from "react";
import { isBossFloorIn, type Dungeon } from "@/data/dungeons";
import { GOLD_REWARDS } from "@/meta/economy";

interface Props {
  dungeon: Dungeon;
  highestClearedFloor: number;
  onDescend: (floor: number) => void;
  onClose: () => void;
}

export function FloorPickerSheet({
  dungeon,
  highestClearedFloor,
  onDescend,
  onClose,
}: Props) {
  const maxSelectable = Math.min(highestClearedFloor + 1, dungeon.floors);
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
  // Boss chest tier label: The Depths' bosses give silver; the themed dungeons'
  // deep bosses give gold (mirrors the reward fold in meta/rewards.ts).
  const bossChest = dungeon.id === "depths" ? "silver" : "gold";

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
        <h3 className="floor-sheet-title">{dungeon.name}</h3>

        <ul className="floor-list">
          {floors.map((floor) => {
            const cleared = floor <= highestClearedFloor;
            const boss = isBossFloorIn(dungeon, floor);
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
                      : `${firstClearGold}g + ${boss ? bossChest : "wooden"} chest`}
                  </span>
                </button>
              </li>
            );
          })}
          {maxSelectable < dungeon.floors && (
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
