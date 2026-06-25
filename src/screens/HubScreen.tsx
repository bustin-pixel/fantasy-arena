import { useMemo } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { CardPortrait } from "@/components/CardPortrait";
import { useGameState } from "@/state/GameStateContext";

interface Props {
  onBattle: () => void;
}

const MAX_DECK = 4;

export function HubScreen({ onBattle }: Props) {
  const { save, setDeck } = useGameState();
  const deck = save.deck;

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
        <div className="card-grid">
          {DECKABLE_UNIT_IDS.map((id) => {
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
                onClick={() => toggle(id)}
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
    </div>
  );
}
