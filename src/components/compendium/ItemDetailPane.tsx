// ============================================================================
// ItemDetailPane — the Arms & Relics catalog's entry sheet. Fully revealed by
// design (the catalog's whole point is seeing what everything is): flavor,
// the power ladder from rare 1★ to legendary 3★, the signature effect note,
// and how many copies the player owns. Presentation-only — key handling lives
// in BookOverlay (Escape closes this pane before the book).
// ============================================================================

import { getDungeon } from "@/data/dungeons";
import {
  describeItemMods,
  describeLuckyCoin,
  ITEM_LINES,
  ITEM_QUALITIES,
  makeItemKey,
  resolveItemMods,
  type ItemQuality,
} from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { ItemIcon } from "@/components/ItemIcon";
import type { PlayerSave } from "@/state/persistence";

const SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon",
  armor: "Armor",
  trinket: "Trinket",
};

function describe(lineId: string, quality: ItemQuality, star: number): string[] {
  if (lineId === "lucky_coin") return describeLuckyCoin(quality, star);
  return describeItemMods(resolveItemMods(makeItemKey(lineId, quality, star)));
}

export function ItemDetailPane({
  lineId,
  save,
  onClose,
}: {
  lineId: string;
  save: PlayerSave;
  onClose: () => void;
}) {
  const line = ITEM_LINES[lineId];
  const ownedCopies = Object.entries(save.items).reduce(
    (n, [key, count]) => (key.startsWith(lineId + ":") ? n + count : n),
    0
  );

  // The power ladder: where the line starts, then each quality at its 3★ peak.
  const ladder: { label: string; color: string; lines: string[] }[] = [
    { label: "Rare 1★", color: RARITIES.rare.color, lines: describe(lineId, "rare", 1) },
    ...ITEM_QUALITIES.map((q) => ({
      label: `${RARITIES[q].label} 3★`,
      color: RARITIES[q].color,
      lines: describe(lineId, q, 3),
    })),
  ];

  // stopPropagation on the backdrop: this pane mounts inside the BookOverlay
  // root — clicking off it must fall back to the open book, never bubble up
  // and close the whole ceremony.
  return (
    <div
      className="detail-overlay item-pane-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="detail-modal item-pane"
        role="dialog"
        aria-label={line.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="item-pane-head">
          <ItemIcon itemKey={makeItemKey(lineId, "legendary", 3)} size={64} hideStars />
          <div>
            <h3 className="item-pane-name">{line.name}</h3>
            <div className="item-pane-slot">
              {SLOT_LABEL[line.slot]}
              {line.dungeonId && (
                <span className="item-pane-sig"> · Signature of {getDungeon(line.dungeonId).name}</span>
              )}
            </div>
          </div>
        </div>
        <p className="item-pane-desc">{line.desc}</p>
        <ul className="item-pane-ladder">
          {ladder.map((row) => (
            <li key={row.label}>
              <span className="item-pane-q" style={{ color: row.color }}>
                {row.label}
              </span>
              <span className="item-pane-mods">{row.lines.join(" · ")}</span>
            </li>
          ))}
        </ul>
        {line.dungeonId && (
          <p className="item-pane-note">
            Drops only from {getDungeon(line.dungeonId).name}&apos;s boss chest; its signature effect
            awakens at legendary.
          </p>
        )}
        <div className="item-pane-owned">
          {ownedCopies > 0 ? `In your bag: ×${ownedCopies}` : "Not yet found"}
        </div>
      </div>
    </div>
  );
}
