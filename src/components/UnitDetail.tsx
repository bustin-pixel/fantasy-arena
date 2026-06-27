import { useEffect, useRef } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef, isMelee } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { ABILITIES } from "@/data/abilities";
import { renderPortrait } from "@/engine/Renderer";
import { FIELD_WIDTH, MAX_DECK } from "@/utils/constants";
import type { UnitDef } from "@/types";

interface Props {
  defId: string;
  deck: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}

const ART_SIZE = 120;

// Roster maxima, used to normalize the stat bars so a value reads relative to the
// rest of the cast (computed once — the unit data is static).
const DECK_DEFS = DECKABLE_UNIT_IDS.map(getUnitDef);
const MAX_HP = Math.max(...DECK_DEFS.map((d) => d.hp));
const MAX_DMG = Math.max(...DECK_DEFS.map((d) => d.damage));
const MIN_ATK = Math.min(...DECK_DEFS.map((d) => d.attackSpeed));
const MAX_MOVE = Math.max(...DECK_DEFS.map((d) => d.moveSpeed));
const MAX_RANGE = Math.max(...DECK_DEFS.map((d) => d.range));

function rangeLabel(def: UnitDef): string {
  if (isMelee(def)) return "Melee";
  return def.range <= FIELD_WIDTH * 0.31 ? "Medium" : "Long";
}

function StatBar({
  label,
  pct,
  value,
  fill,
}: {
  label: string;
  pct: number;
  value: string;
  fill: string;
}) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="stat-track">
        <div
          className="stat-fill"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: fill }}
        />
      </div>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function UnitDetail({ defId, deck, onToggle, onClose }: Props) {
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];
  const ability = ABILITIES[def.ability];
  const abilityKind = ability.cooldown > 0 ? "Active" : "Passive";
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderPortrait(ctx, defId, ART_SIZE);
  }, [defId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inDeck = deck.includes(defId);
  const isLegendary = def.rarity === "legendary";
  const hasLegendary = deck.some((id) => getUnitDef(id).rarity === "legendary");
  const deckFull = deck.length >= MAX_DECK;

  let addLabel = "Add to deck";
  let addDisabled = false;
  let addClass = "btn btn-add";
  if (inDeck) {
    addLabel = "✓ In deck";
    addClass = "btn btn-add in-deck";
  } else if (deckFull) {
    addLabel = "Deck full";
    addDisabled = true;
  } else if (isLegendary && hasLegendary) {
    addLabel = "1 Legendary max";
    addDisabled = true;
  }

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal"
        role="dialog"
        aria-label={`${def.name} details`}
        style={{ borderColor: rarity.color }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="detail-art">
          <canvas ref={canvasRef} width={ART_SIZE} height={ART_SIZE} />
        </div>

        <div className="detail-body">
          <div className="detail-head">
            <span className="detail-name">{def.name}</span>
            <span
              className="detail-rarity"
              style={{ color: rarity.color, borderColor: rarity.color }}
            >
              {rarity.label}
            </span>
            <span className="detail-deckcount">
              {deck.length}/{MAX_DECK} in deck
            </span>
          </div>
          <div className="detail-role">{def.role}</div>

          <div className="detail-stats">
            <StatBar label="Health" pct={(def.hp / MAX_HP) * 100} value={`${def.hp}`} fill="#86efac" />
            <StatBar label="Damage" pct={(def.damage / MAX_DMG) * 100} value={`${def.damage}`} fill="#fb923c" />
            <StatBar
              label="Atk speed"
              pct={(MIN_ATK / def.attackSpeed) * 100}
              value={`${def.attackSpeed.toFixed(1)}s`}
              fill="#fcd34d"
            />
            <StatBar label="Move" pct={(def.moveSpeed / MAX_MOVE) * 100} value={`${def.moveSpeed}`} fill="#7dd3fc" />
            <StatBar
              label="Range"
              pct={(def.range / MAX_RANGE) * 100}
              value={rangeLabel(def)}
              fill="#5dcaa5"
            />
          </div>

          <div className="detail-section">
            <div className="detail-skill-head">
              <span className="detail-skill-name">{ability.name}</span>
              <span className={`detail-tag ${abilityKind === "Active" ? "active" : "passive"}`}>
                {abilityKind}
              </span>
              {(ability.castTimeSec || ability.cooldown > 0) && (
                <span className="detail-skill-meta">
                  {ability.castTimeSec ? (
                    <span className="detail-cd" title="Cast time">
                      ⏲ Cast {ability.castTimeSec}s
                    </span>
                  ) : null}
                  {ability.cooldown > 0 ? (
                    <span className="detail-cd" title="Cooldown">
                      ⟳ {ability.cooldown}s
                    </span>
                  ) : null}
                </span>
              )}
            </div>
            <div className="detail-skill-text">{ability.description}</div>
          </div>

          {def.traits?.map((trait) => (
            <div className="detail-section" key={trait.name}>
              <div className="detail-skill-head">
                <span className="detail-skill-name">{trait.name}</span>
                <span className="detail-tag passive">Passive</span>
              </div>
              <div className="detail-skill-text">{trait.description}</div>
            </div>
          ))}
        </div>

        <div className="detail-footer">
          <button className="btn btn-close-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className={addClass}
            disabled={addDisabled}
            onClick={() => {
              onToggle(defId);
              onClose();
            }}
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
