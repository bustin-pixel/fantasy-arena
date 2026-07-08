// ============================================================================
// RewardPanel — the results-screen reward ceremony.
// Pure presentation: by the time this renders, everything in `rewards` has
// already been granted and persisted (grant-then-reveal). Closing the screen
// mid-animation loses nothing; the chest tap is theater, not a transaction.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { BattleRewards } from "@/meta/rewards";
import { MILESTONE_UNLOCKS, type ChestTier } from "@/meta/economy";
import {
  LEVEL_CAP,
  levelFromXp,
  levelStatMultipliers,
  xpForNext,
  xpIntoLevel,
} from "@/meta/leveling";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { ChestSprite } from "@/components/ChestSprite";
import { renderPortrait } from "@/engine/Renderer";
import { playStinger } from "@/audio/music";

/** One deck unit's XP movement this battle (both values pre-clamped by the
 *  same addXp the grant used, so the animation ends exactly on the saved value). */
export interface XpGain {
  defId: string;
  before: number;
  after: number;
}

interface Props {
  rewards: BattleRewards;
  /** Depths floor the battle was fought on (drives the milestone callout). */
  floor: number;
  mode: string;
  /** Per-deck-unit XP gains for the bar ceremony (omit to hide the section). */
  xpGains?: XpGain[];
}

const CHEST_LABEL: Record<ChestTier, string> = {
  wooden: "Wooden Chest",
  silver: "Silver Chest",
  gold: "Golden Chest",
  arcane: "Arcane Chest",
  dragon: "Dragon's Hoard",
};

/** closed → (tap) → opening (sprite animates) → open (contents revealed). */
type ChestPhase = "closed" | "opening" | "open";

export function RewardPanel({ rewards, floor, mode, xpGains }: Props) {
  const [chestPhase, setChestPhase] = useState<ChestPhase>("closed");
  const shownGold = useCountUp(rewards.gold);

  const milestoneId =
    mode === "depths" && rewards.firstClear ? MILESTONE_UNLOCKS[floor] : undefined;

  return (
    <div className="reward-panel">
      {rewards.firstClear && (
        <div className="reward-badge">
          {mode === "endless" ? "New best!" : "First clear!"}
        </div>
      )}

      <div className="reward-gold">
        <span className="coin" aria-hidden>
          ●
        </span>
        +{shownGold} gold
      </div>

      {rewards.xp > 0 && xpGains && xpGains.length > 0 && (
        <XpCeremony xp={rewards.xp} gains={xpGains} />
      )}

      {milestoneId && (
        <div className="reward-milestone">
          New recruit: <strong>{getUnitDef(milestoneId).name}</strong>!
        </div>
      )}

      {rewards.questUnlock && (
        <div className="reward-milestone reward-quest">
          <strong>{getUnitDef(rewards.questUnlock).name}</strong> discovered —
          recruit it in your Collection!
        </div>
      )}

      {rewards.chest && (
        <button
          className={`reward-chest${chestPhase === "closed" ? "" : " opened"}`}
          onClick={() =>
            chestPhase === "closed" && setChestPhase("opening")
          }
          aria-label={`Open ${CHEST_LABEL[rewards.chest.tier]}`}
        >
          <ChestSprite
            tier={rewards.chest.tier}
            opening={chestPhase !== "closed"}
            onOpened={() => setChestPhase("open")}
          />
          <span className="reward-chest-label">
            {chestPhase === "closed"
              ? `Open ${CHEST_LABEL[rewards.chest.tier]}`
              : CHEST_LABEL[rewards.chest.tier]}
          </span>
        </button>
      )}

      {rewards.chest && chestPhase === "open" && (
        <ul className="reward-contents">
          {rewards.chest.contents.map((entry, i) => {
            if (entry.kind === "gold") {
              return (
                <li key={i} className="reward-entry">
                  +{entry.amount} gold
                </li>
              );
            }
            const def = getUnitDef(entry.unitId);
            if (entry.kind === "duplicate") {
              return (
                <li key={i} className="reward-entry">
                  <span style={{ color: RARITIES[def.rarity].color }}>
                    {def.name}
                  </span>{" "}
                  (owned) → +{entry.gold} gold
                </li>
              );
            }
            return (
              <li key={i} className="reward-entry reward-unlock">
                <span style={{ color: RARITIES[def.rarity].color }}>
                  {def.name}
                </span>{" "}
                unlocked!
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// XP ceremony — per-deck-unit bars filling from before → after. Presentation
// only (grant-then-reveal): the save already holds `after`. A bar that rolls
// past a threshold flashes LEVEL UP, chimes once per frame batch, and reveals
// the stat gains once the animation settles.
// ---------------------------------------------------------------------------

function XpCeremony({ xp, gains }: { xp: number; gains: XpGain[] }) {
  const shown = useXpReveal(gains);
  return (
    <div className="reward-xp">
      <div className="reward-xp-head">+{xp} XP each</div>
      {gains.map((g, i) => (
        <XpRow key={g.defId} gain={g} shownXp={shown[i]} />
      ))}
    </div>
  );
}

function XpRow({ gain, shownXp }: { gain: XpGain; shownXp: number }) {
  const def = getUnitDef(gain.defId);
  const level = levelFromXp(shownXp);
  const need = xpForNext(shownXp);
  const frac = need === null ? 1 : xpIntoLevel(shownXp) / need;
  const startLevel = levelFromXp(gain.before);
  const finalLevel = levelFromXp(gain.after);
  const settled = shownXp >= gain.after;
  const leveled = finalLevel > startLevel;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderPortrait(ctx, gain.defId, 36);
  }, [gain.defId]);

  return (
    <div className={`xp-row${leveled && settled ? " leveled" : ""}`}>
      <canvas ref={canvasRef} width={36} height={36} className="xp-portrait" />
      <div className="xp-body">
        <div className="xp-name-line">
          <span className="xp-name">{def.name}</span>
          {leveled && settled ? (
            <span className="xp-levelup-tag">LEVEL UP!</span>
          ) : (
            need === null && <span className="xp-max-tag">MAX</span>
          )}
        </div>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${frac * 100}%` }} />
        </div>
        {leveled && settled && (
          <div className="xp-delta">
            HP {Math.round(def.hp * levelStatMultipliers(startLevel).hp)}
            {"→"}
            {Math.round(def.hp * levelStatMultipliers(finalLevel).hp)}
            {" · DMG "}
            {Math.round(def.damage * levelStatMultipliers(startLevel).dmg)}
            {"→"}
            {Math.round(def.damage * levelStatMultipliers(finalLevel).dmg)}
          </div>
        )}
      </div>
      <span className={`xp-level-chip${level >= LEVEL_CAP ? " max" : ""}`}>
        Lv {level}
      </span>
    </div>
  );
}

/** Shared reveal timeline: after a short beat, ease every row's shown XP from
 *  before → after over ~1.1s. Fires the level-up chime when one or more rows
 *  cross a threshold in a frame (one chime per frame batch, not per unit). */
function useXpReveal(gains: XpGain[]): number[] {
  const [shown, setShown] = useState<number[]>(() => gains.map((g) => g.before));
  const rafRef = useRef(0);
  const levelsRef = useRef<number[]>(gains.map((g) => levelFromXp(g.before)));
  useEffect(() => {
    const DELAY = 500;
    const DURATION = 1100;
    const start = performance.now() + DELAY;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = gains.map((g) =>
        Math.round(g.before + (g.after - g.before) * eased)
      );
      const newLevels = next.map(levelFromXp);
      if (newLevels.some((lv, i) => lv > levelsRef.current[i])) {
        playStinger("levelup");
      }
      levelsRef.current = newLevels;
      setShown(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return shown;
}

/** Animate 0 → target over ~800ms. Presentation only — the real value is
 *  already in the save. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const DURATION = 800;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3)))); // ease-out cubic
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);
  return value;
}
