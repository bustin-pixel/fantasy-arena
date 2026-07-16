// ============================================================================
// BANKED — pre-RNG floor-picker page. NOT wired into the app.
//
// This is the old "pick a floor, then descend" sheet from before the RNG "hunt
// for the boss" descent (where you enter a dungeon and descend randomized floors
// until the boss lair appears). It's parked here — compilable but unimported —
// so the flat floor-ladder model can be revived if the RNG descent doesn't pan
// out. To bring it back: render it from the Dungeon Atlas / a dungeon-select
// screen, feed it `highestClearedFloor`, and route `onDescend(floor)` to a
// battle at that fixed floor (the old App onBattle("depths", floor, dungeonId)).
//
// It still type-checks against the live data modules (dungeons/economy/rewards),
// but its semantics assume the OLD per-floor high-water-mark progression; the
// current model writes `highestClearedFloor` as a binary cleared/not-cleared
// signal, so `maxSelectable` here would read as all-or-nothing until this is
// re-adapted. Left intact as a reference, not a drop-in.
// ============================================================================

import { useEffect, useState } from "react";
import { isBossFloorIn, monsterLevelFor, type Dungeon } from "@/data/dungeons";
import { GOLD_REWARDS, replayGoldFor } from "@/meta/economy";
import { bossChestTierFor } from "@/meta/rewards";
import { playSfx } from "@/audio/sfx";

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
  // Boss chest tier label — same source of truth as the reward fold.
  const bossChest = bossChestTierFor(dungeon.id);

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
        <p
          style={{
            margin: "-6px 0 10px",
            fontSize: "0.72rem",
            opacity: 0.72,
            textAlign: "center",
          }}
        >
          Recommended warband: Lv {Math.min(10, dungeon.monsterLevel + 1)}+
        </p>

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
                  onClick={() => { playSfx("uiSelect"); setSelected(floor); }}
                >
                  <span className="floor-num">
                    {boss ? "☠ " : ""}Floor {floor}
                    {boss
                      ? ` · Lv ${monsterLevelFor(dungeon, "boss")} boss`
                      : ""}
                  </span>
                  <span className="floor-reward">
                    {cleared
                      ? `✓ Replay · ${replayGoldFor(dungeon.monsterLevel)}g`
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
          <button className="btn btn-gold" onClick={() => { playSfx("uiConfirm"); onDescend(selected); }}>
            Descend — Floor {selected}
          </button>
        </div>
      </div>
    </div>
  );
}
