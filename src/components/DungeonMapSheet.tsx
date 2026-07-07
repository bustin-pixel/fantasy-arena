// ============================================================================
// DungeonMapSheet — choose which dungeon to descend.
// Lists The Depths + the themed legendary dungeons. A themed dungeon is locked
// until its `gate` (Depths floors cleared) is met, and shows the legendary its
// rare-spawn quest unlocks (dimmed until owned) plus a vague lore blurb. Picking
// an unlocked dungeon hands off to the FloorPickerSheet. Reuses the detail-
// overlay modal pattern (AppShell exempts it from page-swipe drags).
// ============================================================================

import { useEffect } from "react";
import { DUNGEONS } from "@/data/dungeons";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { highestClearedFloorOf, type PlayerSave } from "@/state/persistence";

interface Props {
  save: PlayerSave;
  onPick: (dungeonId: string) => void;
  onClose: () => void;
}

export function DungeonMapSheet({ save, onPick, onClose }: Props) {
  // Close on Escape + freeze the background scroll, like the floor picker.
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

  const depthsCleared = highestClearedFloorOf(save, "depths");

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal floor-sheet"
        role="dialog"
        aria-label="Choose a dungeon"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="floor-sheet-title">Dungeons</h3>

        <ul className="floor-list">
          {Object.values(DUNGEONS).map((d) => {
            const gate = d.gate?.depthsFloor ?? 0;
            const locked = depthsCleared < gate;
            const cleared = highestClearedFloorOf(save, d.id);
            const reward = d.quest ? getUnitDef(d.quest.unlocks) : null;
            const owned = reward
              ? save.unlockedUnits.includes(reward.id)
              : false;
            // Status line: gate hint when locked; the legendary it unlocks when
            // themed; plain progress for The Depths.
            const status = locked
              ? `Clear Depths floor ${gate} to unlock`
              : reward
                ? `Unlocks ${reward.name}${owned ? " ✓" : ""}`
                : cleared > 0
                  ? `Deepest cleared — floor ${cleared}`
                  : "The endless descent";
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="floor-row"
                  disabled={locked}
                  onClick={() => !locked && onPick(d.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 3,
                    textAlign: "left",
                    opacity: locked ? 0.55 : 1,
                  }}
                >
                  <span className="floor-num">
                    {locked ? "🔒 " : ""}
                    {d.name}
                  </span>
                  <span
                    className="floor-reward"
                    style={
                      reward && !locked
                        ? { color: RARITIES[reward.rarity].color }
                        : undefined
                    }
                  >
                    {status}
                  </span>
                  <span
                    style={{ fontSize: "0.72rem", opacity: 0.7, fontStyle: "italic" }}
                  >
                    {d.entryHint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="detail-footer">
          <button className="btn btn-close-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
