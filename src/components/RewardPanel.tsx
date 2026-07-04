// ============================================================================
// RewardPanel — the results-screen reward ceremony.
// Pure presentation: by the time this renders, everything in `rewards` has
// already been granted and persisted (grant-then-reveal). Closing the screen
// mid-animation loses nothing; the chest tap is theater, not a transaction.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { BattleRewards } from "@/meta/rewards";
import { MILESTONE_UNLOCKS } from "@/meta/economy";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";

interface Props {
  rewards: BattleRewards;
  /** Depths floor the battle was fought on (drives the milestone callout). */
  floor: number;
  mode: string;
}

const CHEST_LABEL: Record<string, string> = {
  wooden: "Wooden Chest",
  silver: "Silver Chest",
  gold: "Golden Chest",
};

export function RewardPanel({ rewards, floor, mode }: Props) {
  const [chestOpen, setChestOpen] = useState(false);
  const shownGold = useCountUp(rewards.gold);

  const milestoneId =
    mode === "depths" && rewards.firstClear ? MILESTONE_UNLOCKS[floor] : undefined;

  return (
    <div className="reward-panel">
      {rewards.firstClear && <div className="reward-badge">First clear!</div>}

      <div className="reward-gold">
        <span className="coin" aria-hidden>
          ●
        </span>
        +{shownGold} gold
      </div>

      {milestoneId && (
        <div className="reward-milestone">
          New recruit: <strong>{getUnitDef(milestoneId).name}</strong>!
        </div>
      )}

      {rewards.chest && !chestOpen && (
        <button className="reward-chest" onClick={() => setChestOpen(true)}>
          <span className={`chest-icon ${rewards.chest.tier}`} aria-hidden />
          Open {CHEST_LABEL[rewards.chest.tier]}
        </button>
      )}

      {rewards.chest && chestOpen && (
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
