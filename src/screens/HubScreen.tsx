import { useMemo, useState } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { RARITIES, rarityRank } from "@/data/rarities";
import { CardPortrait } from "@/components/CardPortrait";
import { UnitDetail } from "@/components/UnitDetail";
import { MAX_DECK } from "@/utils/constants";
import { useGameState } from "@/state/GameStateContext";

interface Props {
  onBattle: () => void;
}

export function HubScreen({ onBattle }: Props) {
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

  const winRate = useMemo(() => {
    const total = save.wins + save.losses;
    return total === 0 ? 0 : Math.round((save.wins / total) * 100);
  }, [save.wins, save.losses]);

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
          <h1 className="title">Fantasy Arena</h1>
          <p className="subtitle">Deploy. Watch. Conquer.</p>
        </div>
        <div className="stat-block">
          <div className="stat">
            <span className="stat-val">{save.wins}</span>
            <span className="stat-lbl">Wins</span>
          </div>
          <div className="stat">
            <span className="stat-val">{save.losses}</span>
            <span className="stat-lbl">Losses</span>
          </div>
          <div className="stat">
            <span className="stat-val">{winRate}%</span>
            <span className="stat-lbl">Win Rate</span>
          </div>
        </div>
      </header>

      <section className="deck-section">
        <div className="section-head">
          <h2>Your Warband</h2>
          <span className="deck-count">
            {deck.length} / {MAX_DECK} selected
          </span>
        </div>

        {/* Current deck, in deploy order (front-to-back). Tap a slot to remove. */}
        <div className="deck-strip" aria-label="Current deck">
          {Array.from({ length: MAX_DECK }).map((_, slot) => {
            const id = deck[slot];
            if (!id) {
              return (
                <div key={`empty-${slot}`} className="deck-slot empty">
                  <span className="deck-slot-num">{slot + 1}</span>
                  <span className="deck-slot-name">Empty</span>
                </div>
              );
            }
            const def = getUnitDef(id);
            const rarity = RARITIES[def.rarity];
            return (
              <button
                key={id}
                type="button"
                className="deck-slot filled"
                style={{ borderColor: rarity.color }}
                onClick={() => toggle(id)}
                title={`Remove ${def.name}`}
              >
                <span className="deck-slot-num">{slot + 1}</span>
                <span className="deck-slot-name">{def.name}</span>
                <span className="deck-slot-rarity" style={{ color: rarity.color }}>
                  {rarity.label}
                </span>
              </button>
            );
          })}
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
            // A legendary the player can't add because they already have one.
            const locked = isLegendary && hasLegendary && !selected;
            return (
              <CardPortrait
                key={id}
                defId={id}
                selected={selected}
                locked={locked}
                onClick={() => setDetailId(id)}
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

      <div className="hub-footer">
        <button
          className="btn btn-battle"
          disabled={deck.length < 2}
          onClick={onBattle}
        >
          {deck.length < 2 ? "Pick at least 2 units" : "Battle"}
        </button>
      </div>

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
