import { useMemo, useState } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { rarityRank } from "@/data/rarities";
import { CardPortrait, type CardAddState } from "@/components/CardPortrait";
import { DeckStrip } from "@/components/DeckStrip";
import { UnitDetail } from "@/components/UnitDetail";
import { generateRandomDeck } from "@/engine/AIDeck";
import { MAX_DECK } from "@/utils/constants";
import { generateSeed } from "@/utils/rng";
import { useGameState } from "@/state/GameStateContext";

export function HubScreen() {
  const { save, setDeck, setSortMode } = useGameState();
  const deck = save.deck;
  const sortMode = save.sortMode;
  const [detailId, setDetailId] = useState<string | null>(null);

  // Does the current deck already contain a legendary?
  const hasLegendary = useMemo(
    () => deck.some((id) => getUnitDef(id).rarity === "legendary"),
    [deck]
  );

  const toggle = (id: string) => {
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
    setDeck(generateRandomDeck(generateSeed(), MAX_DECK, deck));
  };
  const randomize = () => setDeck(generateRandomDeck(generateSeed(), MAX_DECK));
  const clearDeck = () => setDeck([]);

  // Roster order for the card grid. "rarity" groups rarest-first; ties keep
  // their original (stable) order so the grid stays predictable.
  const rosterIds = useMemo(() => {
    if (sortMode === "default") return DECKABLE_UNIT_IDS;
    return [...DECKABLE_UNIT_IDS].sort(
      (a, b) => rarityRank(getUnitDef(b).rarity) - rarityRank(getUnitDef(a).rarity)
    );
  }, [sortMode]);

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
          <h3>All Units</h3>
          <div className="sort-control" role="group" aria-label="Sort units">
            <button
              type="button"
              className={`sort-btn${sortMode === "default" ? " active" : ""}`}
              onClick={() => setSortMode("default")}
              aria-pressed={sortMode === "default"}
            >
              Default
            </button>
            <button
              type="button"
              className={`sort-btn${sortMode === "rarity" ? " active" : ""}`}
              onClick={() => setSortMode("rarity")}
              aria-pressed={sortMode === "rarity"}
            >
              Rarity
            </button>
          </div>
        </div>

        <div className="card-grid">
          {rosterIds.map((id) => {
            const isLegendary = getUnitDef(id).rarity === "legendary";
            const selected = deck.includes(id);
            // Mirror the add-button rules from the detail panel: in-deck toggles
            // off; otherwise a full deck or a second legendary blocks the add.
            let addState: CardAddState;
            if (selected) addState = "in-deck";
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
          at once.
        </p>
      </section>

      {detailId && (
        <UnitDetail
          defId={detailId}
          deck={deck}
          onToggle={toggle}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
