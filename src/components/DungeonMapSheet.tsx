// ============================================================================
// DungeonMapSheet — choose which dungeon to descend.
// Lists the dungeons in gate-chain order. A dungeon is locked until its `gate`
// (the previous dungeon's last floor) is met — see isDungeonUnlocked for the
// never-re-lock rule — and shows the legendary its rare-spawn quest unlocks
// (dimmed until owned), its monster level vs your warband's, plus a vague lore
// blurb. Picking an unlocked dungeon hands off to the FloorPickerSheet. Reuses
// the detail-overlay modal pattern (AppShell exempts it from page-swipe drags).
// ============================================================================

import { useEffect } from "react";
import { DUNGEONS, getDungeon, isDungeonUnlocked } from "@/data/dungeons";
import { questUnlockIds } from "@/data/depths";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { averageDeckLevel, levelFromXp } from "@/meta/leveling";
import { highestClearedFloorOf, type PlayerSave } from "@/state/persistence";
import { playSfx } from "@/audio/sfx";

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

  const warbandLv = averageDeckLevel(
    save.deck,
    Object.fromEntries(
      save.deck.map((id) => [id, levelFromXp(save.unitXp[id] ?? 0)])
    )
  );

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
        <div
          style={{
            fontSize: "0.78rem",
            opacity: 0.75,
            margin: "-4px 0 6px",
          }}
        >
          Your warband: Lv {warbandLv}
        </div>

        <ul className="floor-list">
          {Object.values(DUNGEONS).map((d) => {
            const locked = !isDungeonUnlocked(d, (id) =>
              highestClearedFloorOf(save, id)
            );
            const cleared = highestClearedFloorOf(save, d.id);
            const underleveled = warbandLv < d.monsterLevel;
            const rewardIds = d.quest ? questUnlockIds(d.quest) : [];
            const rewardNames = rewardIds
              .map((id) => getUnitDef(id).name)
              .join(" & ");
            const owned =
              rewardIds.length > 0 &&
              rewardIds.every((id) => save.unlockedUnits.includes(id));
            // Status line: gate hint when locked; the legendaries it unlocks
            // when themed; plain progress for The Depths.
            // (`locked` implies `gate` exists — gateless dungeons never lock.)
            const status = locked
              ? `Clear ${getDungeon(d.gate!.dungeonId).name} floor ${d.gate!.floor} to unlock`
              : rewardIds.length > 0
                ? `Unlocks ${rewardNames}${owned ? " ✓" : ""}`
                : cleared > 0
                  ? `Deepest cleared — floor ${cleared}`
                  : "The endless descent";
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="floor-row"
                  disabled={locked}
                  onClick={() => { if (!locked) { playSfx("uiSelect"); onPick(d.id); } }}
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
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        // Warn when the warband is under the dungeon's level.
                        color: underleveled ? "#e08a3c" : "#c9b26b",
                        opacity: locked ? 0.8 : 1,
                      }}
                    >
                      Lv {d.monsterLevel} foes{underleveled ? " ⚠" : ""}
                    </span>
                  </span>
                  <span
                    className="floor-reward"
                    style={
                      rewardIds.length > 0 && !locked
                        ? {
                            color:
                              RARITIES[getUnitDef(rewardIds[0]).rarity].color,
                          }
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
