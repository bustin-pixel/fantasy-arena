import { useEffect, useRef } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef, isMelee } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { ABILITIES } from "@/data/abilities";
import { renderPortrait } from "@/engine/Renderer";
import { FIELD_WIDTH, MAX_DECK } from "@/utils/constants";
import { UNLOCK_PRICES } from "@/meta/economy";
import type { UnitDef } from "@/types";

interface Props {
  defId: string;
  deck: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Compendium mode: pure lore page — hides the deck count and the
   *  add/remove footer (monsters can't join a warband anyway). */
  readonly?: boolean;
  /** Locked-unit mode: the footer offers Unlock (at the rarity price) instead
   *  of Add. `gold` gates affordability; `onBuy` performs the purchase. */
  locked?: boolean;
  gold?: number;
  onBuy?: () => void;
  /** Overrides the unlock price (e.g. a rare-spawn quest discount). Defaults
   *  to the unit's rarity price. */
  unlockPrice?: number;
  /** When a locked unit isn't purchasable yet (its unlock quest isn't done),
   *  this hint replaces the Unlock button and explains how to earn it. */
  lockHint?: string;
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

export function UnitDetail({
  defId,
  deck,
  onToggle,
  onClose,
  readonly,
  locked,
  gold = 0,
  onBuy,
  unlockPrice,
  lockHint,
}: Props) {
  const def = getUnitDef(defId);
  const price = unlockPrice ?? UNLOCK_PRICES[def.rarity];
  const rarity = RARITIES[def.rarity];
  // Skip the "lifesteal" filler slot (the never-casts convention for summons
  // and Depths monsters) unless the unit actually lifesteals (the Orc pairs
  // `def.lifesteal` with a real ability, so it's unaffected).
  const abilityIds = [def.ability, ...(def.abilities ?? [])].filter(
    (id) => !(id === "lifesteal" && def.lifesteal == null)
  );
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

  // Freeze the background scroll while the panel is open (it scrolls internally
  // if its content overflows). Prevents the page behind from scrolling under it.
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

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
            {!readonly && (
              <span className="detail-deckcount">
                {deck.length}/{MAX_DECK} in deck
              </span>
            )}
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

          {abilityIds.map((id) => {
            const ab = ABILITIES[id];
            const kind = ab.cooldown > 0 ? "Active" : "Passive";
            return (
              <div className="detail-section" key={id}>
                <div className="detail-skill-head">
                  <span className="detail-skill-name">{ab.name}</span>
                  <span className={`detail-tag ${kind === "Active" ? "active" : "passive"}`}>
                    {kind}
                  </span>
                  {(ab.castTimeSec || ab.cooldown > 0) && (
                    <span className="detail-skill-meta">
                      {ab.castTimeSec ? (
                        <span className="detail-cd" title="Cast time">
                          ⏲ Cast {ab.castTimeSec}s
                        </span>
                      ) : null}
                      {ab.cooldown > 0 ? (
                        <span className="detail-cd" title="Cooldown">
                          ⟳ {ab.cooldown}s
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>
                <div className="detail-skill-text">{ab.description}</div>
              </div>
            );
          })}

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
          {!readonly && locked && lockHint && (
            <span className="detail-lockhint">🔒 {lockHint}</span>
          )}
          {!readonly && locked && !lockHint && (
            <button
              className="btn btn-add btn-buy"
              disabled={gold < price}
              onClick={onBuy}
            >
              {gold >= price ? `Unlock — ${price}g` : `Need ${price}g`}
            </button>
          )}
          {!readonly && !locked && (
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
          )}
        </div>
      </div>
    </div>
  );
}
