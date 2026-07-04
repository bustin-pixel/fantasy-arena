import { useMemo, useState } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { rarityRank, RARITY_ORDER, RARITIES } from "@/data/rarities";
import type { Rarity } from "@/types";
import { CardPortrait, type CardAddState } from "@/components/CardPortrait";
import { DeckStrip } from "@/components/DeckStrip";
import { UnitDetail } from "@/components/UnitDetail";
import { generateRandomDeck } from "@/engine/AIDeck";
import { MAX_DECK } from "@/utils/constants";
import { generateSeed } from "@/utils/rng";
import { useGameState } from "@/state/GameStateContext";

export function HubScreen() {
  const { save, setDeck, purchaseUnit } = useGameState();
  const deck = save.deck;
  const unlockedUnits = save.unlockedUnits;
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");

  // Does the current deck already contain a legendary?
  const hasLegendary = useMemo(
    () => deck.some((id) => getUnitDef(id).rarity === "legendary"),
    [deck]
  );

  const isLocked = (id: string) => !unlockedUnits.includes(id);

  const toggle = (id: string) => {
    if (isLocked(id)) return; // buy it first (detail panel)
    if (deck.includes(id)) {
      setDeck(deck.filter((d) => d !== id));
      return;
    }
    if (deck.length >= MAX_DECK) return;
    // One-legendary-per-deck rule.
    if (getUnitDef(id).rarity === "legendary" && hasLegendary) return;
    setDeck([...deck, id]);
  };

  // Fresh, non-sim seed per click — these are meta actions, so it's fine to
  // draw randomness outside the deterministic battle (like generateSeed itself).
  const autoFill = () => {
    if (deck.length >= MAX_DECK) return;
    setDeck(generateRandomDeck(generateSeed(), MAX_DECK, deck, unlockedUnits));
  };
  const randomize = () =>
    setDeck(generateRandomDeck(generateSeed(), MAX_DECK, [], unlockedUnits));
  const clearDeck = () => setDeck([]);

  // Roster for the card grid: "All" shows rarest-first (Legendary > Epic > Rare;
  // ties keep their stable data order), a rarity chip narrows to that rarity.
  // Within a band, owned units come before locked ones so the playable
  // collection reads first.
  const rosterIds = useMemo(() => {
    const ownedFirst = (a: string, b: string) =>
      Number(!unlockedUnits.includes(a)) - Number(!unlockedUnits.includes(b));
    if (rarityFilter === "all") {
      return [...DECKABLE_UNIT_IDS].sort(
        (a, b) =>
          rarityRank(getUnitDef(b).rarity) - rarityRank(getUnitDef(a).rarity) ||
          ownedFirst(a, b)
      );
    }
    return DECKABLE_UNIT_IDS.filter(
      (id) => getUnitDef(id).rarity === rarityFilter
    ).sort(ownedFirst);
  }, [rarityFilter, unlockedUnits]);

  return (
    <div className="screen hub">
      <header className="hub-header">
        <div>
          <h1 className="title">Collection</h1>
          <p className="subtitle">Build your warband</p>
        </div>
      </header>

      <section className="deck-section">
        <div className="section-head">
          <h2>Your Warband</h2>
          <span className="deck-count">
            {deck.length} / {MAX_DECK} selected
          </span>
        </div>

        {/* Current deck, in deploy order (front-to-back). Drag to reorder; tap
            a slot to remove. */}
        <DeckStrip deck={deck} onReorder={setDeck} onRemove={toggle} />

        {/* Quick deck-building shortcuts. */}
        <div className="deck-actions" role="group" aria-label="Deck shortcuts">
          <button
            type="button"
            className="deck-action-btn"
            onClick={autoFill}
            disabled={deck.length >= MAX_DECK}
          >
            Auto-fill
          </button>
          <button type="button" className="deck-action-btn" onClick={randomize}>
            Randomize
          </button>
          <button
            type="button"
            className="deck-action-btn"
            onClick={clearDeck}
            disabled={deck.length === 0}
          >
            Clear
          </button>
        </div>

        <div className="roster-head">
          <h3>
            All Units <span className="roster-count">{rosterIds.length}</span>
          </h3>
        </div>

        <div className="roster-filter" role="group" aria-label="Filter by rarity">
          <button
            type="button"
            className={`filter-chip${rarityFilter === "all" ? " active" : ""}`}
            onClick={() => setRarityFilter("all")}
            aria-pressed={rarityFilter === "all"}
          >
            All
          </button>
          {RARITY_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              className={`filter-chip${rarityFilter === r ? " active" : ""}`}
              style={{ "--chip": RARITIES[r].color } as React.CSSProperties}
              onClick={() => setRarityFilter(r)}
              aria-pressed={rarityFilter === r}
            >
              {RARITIES[r].label}
            </button>
          ))}
        </div>

        <div className="card-grid">
          {rosterIds.map((id) => {
            const isLegendary = getUnitDef(id).rarity === "legendary";
            const selected = deck.includes(id);
            // Mirror the add-button rules from the detail panel: in-deck toggles
            // off; otherwise a full deck or a second legendary blocks the add.
            // Locked wins over everything — the unit must be bought first.
            let addState: CardAddState;
            if (isLocked(id)) addState = "locked";
            else if (selected) addState = "in-deck";
            else if (deck.length >= MAX_DECK) addState = "deck-full";
            else if (isLegendary && hasLegendary) addState = "legendary-max";
            else addState = "add";
            return (
              <CardPortrait
                key={id}
                defId={id}
                addState={addState}
                onToggle={() => toggle(id)}
                onInfo={() => setDetailId(id)}
              />
            );
          })}
        </div>
        <p className="hint-text">
          Choose up to four units — at most one Legendary per deck. Order matters:
          they deploy front-to-back as slots open, with two of yours on the field
          at once. Locked units unlock with gold, from chests, or at Depths
          milestones.
        </p>
      </section>

      {detailId && (
        <UnitDetail
          defId={detailId}
          deck={deck}
          onToggle={toggle}
          onClose={() => setDetailId(null)}
          locked={isLocked(detailId)}
          gold={save.gold}
          onBuy={() => purchaseUnit(detailId)}
        />
      )}
    </div>
  );
}
