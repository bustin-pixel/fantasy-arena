import { useEffect, useRef, useState } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef, isMelee } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { ABILITIES } from "@/data/abilities";
import { renderPortrait } from "@/engine/Renderer";
import { FIELD_WIDTH, MAX_DECK } from "@/utils/constants";
import { UNLOCK_PRICES } from "@/meta/economy";
import {
  levelFromXp,
  levelStatMultipliers,
  xpForNext,
  xpIntoLevel,
} from "@/meta/leveling";
import {
  describeItemMods,
  describeLuckyCoin,
  ITEM_SLOTS,
  parseItemKey,
  resolveItemMods,
  resolveLoadoutMods,
} from "@/data/items";
import { TENDENCIES } from "@/data/tendencies";
import { availableCount } from "@/meta/inventory";
import { ItemIcon } from "@/components/ItemIcon";
import type { ItemLoadouts, ItemSlot, UnitDef } from "@/types";

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
  /** The unit's total battle XP. Enables the level chip, the XP bar, and the
   *  leveled Health/Damage readouts. Omit (Compendium monsters, locked units)
   *  to hide all level UI. */
  totalXp?: number;
  /** Equipment (hub only): the item inventory + all loadouts, with equip /
   *  unequip callbacks scoped to THIS unit. Omit any of the four (Compendium,
   *  locked units) to hide the Equipment section. */
  items?: Record<string, number>;
  loadouts?: ItemLoadouts;
  onEquip?: (key: string) => void;
  onUnequip?: (slot: ItemSlot) => void;
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

/** The inline "pick an item for this slot" list: every owned stack of the
 *  slot's type with a FREE copy (or the one this unit already wears), plus a
 *  Remove row. Fungible stacks — equipping just points the loadout at a key. */
function EquipPicker({
  slot,
  defId,
  items,
  loadouts,
  onEquip,
  onUnequip,
}: {
  slot: ItemSlot;
  defId: string;
  items: Record<string, number>;
  loadouts: ItemLoadouts;
  onEquip: (key: string) => void;
  onUnequip: () => void;
}) {
  const current = loadouts[defId]?.[slot];
  const options = Object.keys(items)
    .filter((key) => {
      const p = parseItemKey(key);
      if (!p || p.line.slot !== slot) return false;
      return key === current || availableCount(items, loadouts, key) > 0;
    })
    .sort();
  return (
    <div className="equip-picker">
      {options.length === 0 && !current && (
        <div className="equip-picker-empty">
          No {slot}s in your Bag yet — chests drop them.
        </div>
      )}
      {options.map((key) => {
        const p = parseItemKey(key)!;
        const lines =
          p.lineId === "lucky_coin"
            ? describeLuckyCoin(p.quality, p.star)
            : describeItemMods(resolveItemMods(key));
        return (
          <button
            key={key}
            type="button"
            className={`equip-option${key === current ? " current" : ""}`}
            onClick={() => (key === current ? onUnequip() : onEquip(key))}
          >
            <ItemIcon itemKey={key} size={40} />
            <span className="equip-option-body">
              <span
                className="equip-option-name"
                style={{ color: RARITIES[p.quality].color }}
              >
                {p.line.name} {"★".repeat(p.star)}
              </span>
              <span className="equip-option-desc">{lines.join(" · ")}</span>
            </span>
            <span className="equip-option-action">
              {key === current ? "Remove" : "Equip"}
            </span>
          </button>
        );
      })}
      {current && (
        <button type="button" className="equip-option remove" onClick={onUnequip}>
          <span className="equip-option-body">
            <span className="equip-option-name">Empty the slot</span>
          </span>
          <span className="equip-option-action">Unequip</span>
        </button>
      )}
    </div>
  );
}

function StatBar({
  label,
  pct,
  value,
  fill,
  bonus,
}: {
  label: string;
  pct: number;
  value: string;
  fill: string;
  /** Level-granted gain shown as a green suffix (e.g. "+32"). The bar itself
   *  stays normalized to BASE stats so units stay comparable across levels. */
  bonus?: string;
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
      <span className="stat-value">
        {value}
        {bonus && <span className="stat-bonus"> {bonus}</span>}
      </span>
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
  totalXp,
  items,
  loadouts,
  onEquip,
  onUnequip,
}: Props) {
  const def = getUnitDef(defId);
  const price = unlockPrice ?? UNLOCK_PRICES[def.rarity];
  const rarity = RARITIES[def.rarity];
  // Equipment (hub-owned units only). Which slot's picker is open.
  const [pickerSlot, setPickerSlot] = useState<ItemSlot | null>(null);
  const equipEnabled =
    !readonly && !locked && items != null && loadouts != null && !!onEquip && !!onUnequip;
  const loadout = equipEnabled ? loadouts[defId] : undefined;
  const itemMods = resolveLoadoutMods(loadout);
  // Level readouts (only when the caller supplies XP — hub-owned units).
  const level = totalXp !== undefined ? levelFromXp(totalXp) : 1;
  const mult = levelStatMultipliers(level);
  // Same nested rounding as the engine bake (level first, then items), so the
  // panel numbers equal the battlefield exactly.
  const shownHp = Math.round(
    Math.round(def.hp * mult.hp) * (itemMods?.hpMult ?? 1)
  );
  const shownDmg = Math.round(
    Math.round(def.damage * mult.dmg) * (itemMods?.dmgMult ?? 1)
  );
  const shownAtk = def.attackSpeed * (itemMods?.atkDelayMult ?? 1);
  const shownMove = Math.round(def.moveSpeed * (itemMods?.moveSpeedMult ?? 1));
  // The combined "what my gear does" summary under the slots (Lucky Coin is
  // meta-only, described from its own ladder).
  const luckyTrinket =
    loadout?.trinket && parseItemKey(loadout.trinket)?.lineId === "lucky_coin"
      ? parseItemKey(loadout.trinket)!
      : null;
  const equipSummary = [
    ...(itemMods ? describeItemMods(itemMods) : []),
    ...(luckyTrinket
      ? describeLuckyCoin(luckyTrinket.quality, luckyTrinket.star)
      : []),
  ];
  const xpNeed = totalXp !== undefined ? xpForNext(totalXp) : null;
  // Skip the "lifesteal" filler slot (the never-casts convention for summons
  // and Depths monsters) unless the unit actually lifesteals (the Orc pairs
  // `def.lifesteal` with a real ability, so it's unaffected).
  const abilityIds = [def.ability, ...(def.abilities ?? [])].filter(
    (id) => !(id === "lifesteal" && def.lifesteal == null)
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Living portrait: every unit's detail panel animates its idle sprite —
    // glow pulses, plume/cape sway, caster orbs, ooze, etc. — via a render loop
    // (staticPose off). The Aegis Knight additionally cycles its shield charge,
    // whose VFX is otherwise invisible at rest.
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const opts: {
        live: true;
        charge?: number;
        transparent: true;
        anchorOffset: number;
      } = {
        live: true,
        transparent: true,
        // Raise the pose so the ground shadow clears the canvas bottom edge and
        // the unit reads centred in the alcove (default anchor sits too low here).
        anchorOffset: 1,
      };
      if (defId === "aegis_knight") {
        const cyc = ((now - start) / 1000) % 4.2;
        opts.charge = cyc < 3 ? cyc / 3 : 1; // fill over 3s, hold armed ~1.2s
      }
      renderPortrait(ctx, defId, ART_SIZE, opts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
            {totalXp !== undefined && (
              <span className={`detail-level${xpNeed === null ? " max" : ""}`}>
                Lv {level}
              </span>
            )}
            {!readonly && (
              <span className="detail-deckcount">
                {deck.length}/{MAX_DECK} in deck
              </span>
            )}
          </div>
          <div className="detail-role">{def.role}</div>

          {totalXp !== undefined && (
            <div className="detail-xp">
              <div className="detail-xp-bar">
                <div
                  className="detail-xp-fill"
                  style={{
                    width: `${
                      (xpNeed === null ? 1 : xpIntoLevel(totalXp) / xpNeed) * 100
                    }%`,
                  }}
                />
              </div>
              <span className="detail-xp-text">
                {xpNeed === null
                  ? "Max level"
                  : `${xpIntoLevel(totalXp)} / ${xpNeed} XP to Lv ${level + 1}`}
              </span>
            </div>
          )}

          <div className="detail-stats">
            <StatBar
              label="Health"
              pct={(def.hp / MAX_HP) * 100}
              value={`${shownHp}`}
              bonus={shownHp > def.hp ? `+${shownHp - def.hp}` : undefined}
              fill="#86efac"
            />
            <StatBar
              label="Damage"
              pct={(def.damage / MAX_DMG) * 100}
              value={`${shownDmg}`}
              bonus={shownDmg > def.damage ? `+${shownDmg - def.damage}` : undefined}
              fill="#fb923c"
            />
            <StatBar
              label="Atk speed"
              pct={(MIN_ATK / def.attackSpeed) * 100}
              value={`${shownAtk.toFixed(1)}s`}
              bonus={
                shownAtk < def.attackSpeed
                  ? `+${Math.round((def.attackSpeed / shownAtk - 1) * 100)}%`
                  : undefined
              }
              fill="#fcd34d"
            />
            <StatBar
              label="Move"
              pct={(def.moveSpeed / MAX_MOVE) * 100}
              value={`${shownMove}`}
              bonus={shownMove > def.moveSpeed ? `+${shownMove - def.moveSpeed}` : undefined}
              fill="#7dd3fc"
            />
            <StatBar
              label="Range"
              pct={(def.range / MAX_RANGE) * 100}
              value={rangeLabel(def)}
              fill="#5dcaa5"
            />
          </div>

          {equipEnabled && (
            <div className="detail-section equip-section">
              <div className="detail-skill-head">
                <span className="detail-skill-name">Equipment</span>
              </div>
              <div className="equip-slots">
                {ITEM_SLOTS.map((slot) => {
                  const key = loadout?.[slot];
                  const p = key ? parseItemKey(key) : null;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`equip-slot${pickerSlot === slot ? " open" : ""}`}
                      onClick={() =>
                        setPickerSlot(pickerSlot === slot ? null : slot)
                      }
                      aria-label={`${slot} slot`}
                    >
                      {key && p ? (
                        <>
                          <ItemIcon itemKey={key} size={44} />
                          <span
                            className="equip-slot-name"
                            style={{ color: RARITIES[p.quality].color }}
                          >
                            {p.line.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="equip-slot-glyph" aria-hidden>
                            {slot === "weapon" ? "⚔" : slot === "armor" ? "🛡" : "◈"}
                          </span>
                          <span className="equip-slot-name empty">
                            {slot[0].toUpperCase() + slot.slice(1)}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              {pickerSlot && (
                <EquipPicker
                  slot={pickerSlot}
                  defId={defId}
                  items={items!}
                  loadouts={loadouts!}
                  onEquip={(key) => {
                    onEquip!(key);
                    setPickerSlot(null);
                  }}
                  onUnequip={() => {
                    onUnequip!(pickerSlot);
                    setPickerSlot(null);
                  }}
                />
              )}
              {equipSummary.length > 0 && (
                <ul className="equip-effects">
                  {equipSummary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

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

          {/* Tendency — derived from the registry (never duplicated into
              def.traits, so the copy can't drift). Brawler shows nothing. */}
          {def.tendency && def.tendency !== "brawler" && (
            <div className="detail-section">
              <div className="detail-skill-head">
                <span className="detail-skill-name">
                  {TENDENCIES[def.tendency].name}
                </span>
                <span className="detail-tag tendency">Tendency</span>
              </div>
              <div className="detail-skill-text">
                {TENDENCIES[def.tendency].blurb}
              </div>
            </div>
          )}

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
