import { useEffect, useRef } from "react";
import { renderPortrait } from "@/engine/Renderer";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";

interface Props {
  defId: string;
  size?: number;
  selected?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

/** A small canvas-rendered card with rarity border, matching battlefield art. */
export function CardPortrait({ defId, size = 96, selected, locked, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) renderPortrait(ctx, defId, size);
  }, [defId, size]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-portrait${locked ? " locked" : ""}`}
      style={{
        borderColor: rarity.color,
        boxShadow: selected
          ? `0 0 0 3px ${rarity.color}, 0 0 18px ${rarity.color}88`
          : `0 2px 8px rgba(0,0,0,0.5)`,
        opacity: locked ? 0.4 : 1,
      }}
      aria-pressed={selected}
      aria-disabled={locked}
    >
      <canvas ref={ref} width={size} height={size} className="card-canvas" />
      <span className="card-name">{def.name}</span>
      <span className="card-rarity" style={{ color: rarity.color }}>
        {rarity.label}
      </span>
      {locked && <span className="card-lock">🔒 1 Legendary max</span>}
    </button>
  );
}
