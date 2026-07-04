import { useEffect, useRef } from "react";
import { renderPortrait } from "@/engine/Renderer";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { UNLOCK_PRICES } from "@/meta/economy";

/** State of the quick-add button, computed by the hub from the current deck.
 *  "locked" = the player doesn't own the unit yet — the button shows the
 *  price and routes to the detail panel's buy flow. */
export type CardAddState =
  | "add"
  | "in-deck"
  | "deck-full"
  | "legendary-max"
  | "locked";

interface Props {
  defId: string;
  size?: number;
  addState: CardAddState;
  /** Open the detail panel (also fired by tapping the card art). */
  onInfo: () => void;
  /** Add or remove this unit from the deck. */
  onToggle: () => void;
}

const ADD_LABEL: Record<CardAddState, string> = {
  add: "+ Add",
  "in-deck": "✓",
  "deck-full": "Deck full",
  "legendary-max": "🔒",
  locked: "", // computed per-unit (shows the price)
};

/** A small canvas-rendered card with rarity border, matching battlefield art. */
export function CardPortrait({ defId, size = 96, addState, onInfo, onToggle }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];
  const selected = addState === "in-deck";
  const unowned = addState === "locked";
  const disabled = addState === "deck-full" || addState === "legendary-max";
  const label = unowned
    ? `🔒 ${UNLOCK_PRICES[def.rarity]}g`
    : ADD_LABEL[addState];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) renderPortrait(ctx, defId, size);
  }, [defId, size]);

  return (
    <div
      className={`card-portrait${disabled ? " locked" : ""}${unowned ? " unowned" : ""}`}
      style={{
        borderColor: rarity.color,
        boxShadow: selected
          ? `0 0 0 3px ${rarity.color}, 0 0 18px ${rarity.color}88`
          : `0 2px 8px rgba(0,0,0,0.5)`,
      }}
    >
      <button
        type="button"
        className="card-info-target"
        onClick={onInfo}
        aria-label={`${def.name} details`}
      >
        <canvas ref={ref} width={size} height={size} className="card-canvas" />
        <span className="card-name">{def.name}</span>
        <span className="card-rarity" style={{ color: rarity.color }}>
          {rarity.label}
        </span>
      </button>

      <div className="card-actions">
        <button
          type="button"
          className={`card-add${selected ? " in-deck" : ""}${unowned ? " price" : ""}`}
          // A locked unit's button opens the detail panel (where Buy lives)
          // instead of trying to deck-add it.
          onClick={unowned ? onInfo : onToggle}
          disabled={disabled}
          aria-pressed={selected}
        >
          {label}
        </button>
        <button
          type="button"
          className="card-info-btn"
          onClick={onInfo}
          aria-label={`View ${def.name} details`}
        >
          ⓘ
        </button>
      </div>
    </div>
  );
}
