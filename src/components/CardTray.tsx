import { useEffect, useRef } from "react";
import type { HandCard } from "@/hooks/useBattleEngine";
import { renderPortrait } from "@/engine/Renderer";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";

interface Props {
  hand: HandCard[];
  /** Whether a slot is currently open for deployment. */
  canDeploy: boolean;
  onSelect: (index: number) => void;
}

const TRAY_PORTRAIT = 64;

function TrayCard({
  card,
  canDeploy,
  onSelect,
}: {
  card: HandCard;
  canDeploy: boolean;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getUnitDef(card.defId);
  const rarity = RARITIES[def.rarity];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) renderPortrait(ctx, card.defId, TRAY_PORTRAIT);
  }, [card.defId]);

  return (
    <button
      type="button"
      className={`tray-card ${card.selected ? "selected" : ""} ${
        canDeploy ? "" : "dimmed"
      }`}
      style={{ borderColor: rarity.color }}
      onClick={() => onSelect(card.index)}
      aria-pressed={card.selected}
    >
      <canvas
        ref={ref}
        width={TRAY_PORTRAIT}
        height={TRAY_PORTRAIT}
        className="tray-canvas"
      />
      <span className="tray-name">{def.name}</span>
      {card.selected && <span className="tray-badge">NEXT</span>}
    </button>
  );
}

/** The bottom hand: tap a card to choose who deploys next, then tap the field. */
export function CardTray({ hand, canDeploy, onSelect }: Props) {
  if (hand.length === 0) {
    return (
      <div className="card-tray empty">
        <span>No reserves left</span>
      </div>
    );
  }
  return (
    <div className="card-tray">
      {hand.map((card) => (
        <TrayCard
          key={card.index}
          card={card}
          canDeploy={canDeploy}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
