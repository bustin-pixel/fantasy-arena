// The between-wave intermission overlay. The sim is frozen behind it (the
// EndlessController holds the run in an intermission until a boon is picked), so
// this is where the player reviews what they've earned and chooses their next
// party-wide upgrade. Pure presentation — one tap calls pickBoon(index).

import type { BoonOffer, BoonTally } from "@/engine/EndlessController";
import type { BoonRarity } from "@/data/boons";

interface Props {
  wave: number;
  offers: BoonOffer[];
  boonsPicked: BoonTally[];
  onPick: (index: number) => void;
}

/** Boon-rarity accent — common reads as steel, rare/epic match the unit palette. */
function rarityColor(r: BoonRarity): string {
  switch (r) {
    case "epic":
      return "#a855f7";
    case "rare":
      return "#3b82f6";
    default:
      return "#8a9ba8"; // common — muted steel
  }
}

export function BoonPickOverlay({ wave, offers, boonsPicked, onPick }: Props) {
  return (
    <div className="boon-overlay" role="dialog" aria-label="Choose a boon">
      <div className="boon-overlay-head">
        <div className="boon-overlay-wave">Wave {wave} cleared</div>
        <div className="boon-overlay-title">Choose a Boon</div>
        <div className="boon-overlay-sub">Your warband recovers between waves.</div>
      </div>

      <div className="boon-cards">
        {offers.map((offer, i) => (
          <button
            key={`${offer.id}-${i}`}
            type="button"
            className="boon-card"
            style={{ borderColor: rarityColor(offer.rarity) }}
            onClick={() => onPick(i)}
          >
            <span
              className="boon-card-rarity"
              style={{ color: rarityColor(offer.rarity) }}
            >
              {offer.rarity}
            </span>
            <span className="boon-card-name">{offer.name}</span>
            <span className="boon-card-desc">{offer.description}</span>
          </button>
        ))}
      </div>

      {boonsPicked.length > 0 && (
        <div className="boon-tally">
          <span className="boon-tally-label">Your boons</span>
          <div className="boon-tally-chips">
            {boonsPicked.map((b) => (
              <span
                key={b.id}
                className="boon-chip"
                style={{ borderColor: rarityColor(b.rarity) }}
              >
                {b.name}
                {b.count > 1 && <strong> ×{b.count}</strong>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
