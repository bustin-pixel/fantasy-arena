// The between-wave intermission overlay. The sim is frozen behind it (the
// EndlessController holds the run in an intermission until a boon is picked), so
// this is where the player reviews what they've earned and chooses their next
// party-wide upgrade — or retires, banking the reward for every wave cleared.
// Pure presentation — one tap calls pickBoon(index) / onRetire().

import { useState } from "react";
import type { BoonOffer, BoonTally } from "@/engine/EndlessController";
import { boonStackSummary, BOONS, type BoonRarity } from "@/data/boons";
import { playSfx } from "@/audio/sfx";

interface Props {
  wave: number;
  offers: BoonOffer[];
  boonsPicked: BoonTally[];
  onPick: (index: number) => void;
  /** Retire the run here — bank the rewards for the waves already cleared. */
  onRetire: () => void;
}

/** Boon-rarity accent — common reads as steel, rare/epic match the unit palette.
 *  Exported for the results screen's boon recap chips. */
export function rarityColor(r: BoonRarity): string {
  switch (r) {
    case "epic":
      return "#a855f7";
    case "rare":
      return "#3b82f6";
    default:
      return "#8a9ba8"; // common — muted steel
  }
}

export function BoonPickOverlay({ wave, offers, boonsPicked, onPick, onRetire }: Props) {
  // Tapping a tally chip opens its stack-math card; tapping it again closes.
  const [infoId, setInfoId] = useState<string | null>(null);
  // Two-tap retire: the first tap arms the confirm, the second banks the run.
  const [confirmRetire, setConfirmRetire] = useState(false);

  const info = infoId ? boonsPicked.find((b) => b.id === infoId) ?? null : null;

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
          <span className="boon-tally-label">Your boons — tap for details</span>
          <div className="boon-tally-chips">
            {boonsPicked.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`boon-chip boon-chip-btn${infoId === b.id ? " open" : ""}`}
                style={{ borderColor: rarityColor(b.rarity) }}
                onClick={() => { playSfx("uiSelect"); setInfoId((prev) => (prev === b.id ? null : b.id)); }}
              >
                {b.name}
                {b.count > 1 && <strong> ×{b.count}</strong>}
              </button>
            ))}
          </div>

          {info && (
            <div
              className="boon-info"
              style={{ borderColor: rarityColor(info.rarity) }}
            >
              <div className="boon-info-head">
                <span
                  className="boon-card-rarity"
                  style={{ color: rarityColor(info.rarity) }}
                >
                  {info.rarity}
                </span>
                <span className="boon-info-name">
                  {info.name}
                  {info.count > 1 && <strong> ×{info.count}</strong>}
                </span>
              </div>
              <div className="boon-card-desc">{BOONS[info.id].description}</div>
              <ul className="boon-info-lines">
                {boonStackSummary(info.id, info.count).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="boon-retire">
        {confirmRetire ? (
          <>
            <span className="boon-retire-ask">Bank your reward and end the run?</span>
            <button type="button" className="btn btn-gold boon-retire-btn" onClick={onRetire}>
              Retire
            </button>
            <button
              type="button"
              className="btn boon-retire-btn"
              onClick={() => { playSfx("uiTap"); setConfirmRetire(false); }}
            >
              Keep fighting
            </button>
          </>
        ) : (
          <button
            type="button"
            className="boon-retire-link"
            onClick={() => { playSfx("uiTap"); setConfirmRetire(true); }}
          >
            Retire — bank {wave} {wave === 1 ? "wave" : "waves"} of rewards
          </button>
        )}
      </div>
    </div>
  );
}
