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
  /** Rerolls still banked this run (0 disables the button). */
  rerollsLeft: number;
  /** Spend a reroll for a fresh set of offers; stays in the intermission. */
  onReroll: () => void;
  /** Decline the offers for extra healing instead. */
  onSkip: () => void;
  /** Retire the run here — bank the rewards for the waves already cleared. */
  onRetire: () => void;
  /** True at the single intermission after the capstone wave fell. */
  atFinalWaveChoice: boolean;
  /** Bank the run as a completed conquest (capstone only). */
  onFinish: () => void;
}

/** Boon-rarity accent — common reads as steel, rare/epic match the unit palette.
 *  Exported for the results screen's boon recap chips. */
export function rarityColor(r: BoonRarity): string {
  switch (r) {
    case "mythic":
      return "#f5a524"; // deep-tier gold — reads apart from epic at a glance
    case "epic":
      return "#a855f7";
    case "rare":
      return "#3b82f6";
    default:
      return "#8a9ba8"; // common — muted steel
  }
}

export function BoonPickOverlay({
  wave,
  offers,
  boonsPicked,
  onPick,
  rerollsLeft,
  onReroll,
  onSkip,
  onRetire,
  atFinalWaveChoice,
  onFinish,
}: Props) {
  // Tapping a tally chip opens its stack-math card; tapping it again closes.
  const [infoId, setInfoId] = useState<string | null>(null);
  // Two-tap retire: the first tap arms the confirm, the second banks the run.
  const [confirmRetire, setConfirmRetire] = useState(false);
  // Two-tap skip as well — a mis-tap here costs a whole boon.
  const [confirmSkip, setConfirmSkip] = useState(false);

  const info = infoId ? boonsPicked.find((b) => b.id === infoId) ?? null : null;

  return (
    <div className="boon-overlay" role="dialog" aria-label="Choose a boon">
      {atFinalWaveChoice ? (
        // The capstone. Framed as an ending you EARNED, with pressing on offered
        // as the deliberate choice rather than the default — but still offered,
        // because the mode is called Endless.
        <div className="boon-overlay-head boon-overlay-conquest">
          <div className="boon-overlay-wave conquest">Wave {wave} — the summit</div>
          <div className="boon-overlay-title conquest">Endless Conquered</div>
          <div className="boon-overlay-sub">
            A Legendary Reliquary is yours. Bank it now, or press on — the horde
            does not stop, and neither does the curve.
          </div>
          <div className="boon-actions conquest-actions">
            <button
              type="button"
              className="btn btn-gold boon-action-btn conquest-claim"
              onClick={() => { playSfx("unlockFanfare"); onFinish(); }}
            >
              Claim your Reliquary
            </button>
          </div>
          {/* Continuing needs no button of its own — taking any boon below just
              opens wave 101, which is exactly what "press on" means. */}
          <div className="boon-overlay-sub conquest-hint">
            …or take a boon below and see how far this goes.
          </div>
        </div>
      ) : (
        <div className="boon-overlay-head">
          <div className="boon-overlay-wave">Wave {wave} cleared</div>
          <div className="boon-overlay-title">Choose a Boon</div>
          <div className="boon-overlay-sub">Your warband recovers between waves.</div>
        </div>
      )}

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

      <div className="boon-actions">
        <button
          type="button"
          className="btn boon-action-btn"
          disabled={rerollsLeft <= 0}
          onClick={() => { playSfx("uiSelect"); onReroll(); }}
        >
          ↻ Reroll{rerollsLeft > 0 ? ` (${rerollsLeft})` : ""}
        </button>
        {confirmSkip ? (
          <>
            <button
              type="button"
              className="btn boon-action-btn"
              onClick={() => { setConfirmSkip(false); onSkip(); }}
            >
              Skip for healing
            </button>
            <button
              type="button"
              className="btn boon-action-btn"
              onClick={() => { playSfx("uiTap"); setConfirmSkip(false); }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn boon-action-btn"
            onClick={() => { playSfx("uiTap"); setConfirmSkip(true); }}
          >
            Skip — heal instead
          </button>
        )}
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
                {/* wave + 1: the scaled boons report the value they'll have on
                    the wave this pick is about to open, not the one just cleared. */}
                {boonStackSummary(info.id, info.count, wave + 1).map((line) => (
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
