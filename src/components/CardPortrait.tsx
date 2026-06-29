import { useEffect, useRef } from "react";
import { renderPortrait } from "@/engine/Renderer";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";

/** State of the quick-add button, computed by the hub from the current deck. */
export type CardAddState = "add" | "in-deck" | "deck-full" | "legendary-max";

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
};

/** A small canvas-rendered card with rarity border, matching battlefield art. */
export function CardPortrait({ defId, size = 96, addState, onInfo, onToggle }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];
  const selected = addState === "in-deck";
  const disabled = addState === "deck-full" || addState === "legendary-max";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) renderPortrait(ctx, defId, size);
  }, [defId, size]);

  return (
    <div
      className={`card-portrait${disabled ? " locked" : ""}`}
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
          className={`card-add${selected ? " in-deck" : ""}`}
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={selected}
        >
          {ADD_LABEL[addState]}
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
