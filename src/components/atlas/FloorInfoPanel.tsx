// ============================================================================
// FloorInfoPanel — the bottom sheet the atlas opens when you tap into a
// dungeon's descent trail. In the RNG "hunt for the boss" model there are no
// individually-entered floors, so this is a DUNGEON overview: the difficulty
// pills (Normal / Hard / Elite — the per-dungeon ladder), who you'll face at
// the picked tier (small canvas portraits, bestiary silhouettes for the
// unmet), what clearing it pays, the rare-spawn quest whisper, and the big
// Enter Dungeon button. Reward copy mirrors the reward fold's own sources
// (effectiveBossChestTier / milestoneUnlocksFor / TIER_REWARDS) so the
// preview can't drift from what actually drops.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isCapstoneDungeon,
  milestoneUnlocksFor,
  monsterLevelFor,
  tierForFloorIn,
  type Dungeon,
} from "@/data/dungeons";
import {
  isTierUnlocked,
  prevTier,
  TIER_IDS,
  TIER_LABEL,
  tierMonsterLevel,
  type TierId,
} from "@/data/tiers";
import { questUnlockIds } from "@/data/depths";
import { getUnitDef } from "@/data/units";
import { TIER_REWARDS } from "@/meta/economy";
import { LEVEL_CAP } from "@/meta/leveling";
import { effectiveBossChestTier } from "@/meta/rewards";
import { CHEST_LABEL } from "@/components/RewardPanel";
import { renderPortrait } from "@/engine/Renderer";
import { playSfx } from "@/audio/sfx";
import {
  highestUnlockedTier,
  isDungeonCleared,
  isTierCleared,
  type PlayerSave,
} from "@/state/persistence";

const ART = 64;

/** A small enemy portrait; unmet enemies show as bestiary silhouettes. */
function EnemyPortrait({
  defId,
  known,
  level,
  tag,
}: {
  defId: string;
  known: boolean;
  level: number;
  tag?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Layout effect so the sheet never flashes blank canvases as it slides up
  // (same reason the compendium paints its cards pre-frame).
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    renderPortrait(
      ctx,
      defId,
      ART,
      known ? undefined : { silhouette: "#0d0b08" }
    );
  }, [defId, known]);
  const name = known ? getUnitDef(defId).name : "???";
  return (
    <div className={`atlas-enemy${tag ? ` ${tag}` : ""}`}>
      <canvas ref={ref} width={ART} height={ART} />
      <span className="atlas-enemy-name">{name}</span>
      <span className="atlas-enemy-sub">
        {tag === "boss" ? "☠ Boss · " : tag === "rare" ? "✦ Rare · " : ""}
        Lv {level}
      </span>
    </div>
  );
}

interface Props {
  dungeon: Dungeon;
  save: PlayerSave;
  /** The player's warband level (for the under-level warning). */
  warbandLv: number;
  onEnter: (tier: TierId) => void;
  onClose: () => void;
}

export function FloorInfoPanel({
  dungeon,
  save,
  warbandLv,
  onEnter,
  onClose,
}: Props) {
  // The per-dungeon difficulty ladder: default to the frontier (the highest
  // unlocked tier), re-derived if the sheet is retargeted at another dungeon.
  const [tier, setTier] = useState<TierId>(() =>
    highestUnlockedTier(save, dungeon.id)
  );
  useEffect(() => {
    setTier(highestUnlockedTier(save, dungeon.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon.id]);

  const tierDone = (t: TierId) => isTierCleared(save, dungeon.id, t);
  const dungeonCleared = isDungeonCleared(save, dungeon.id);
  const cleared = tierDone(tier);
  // The fodder roster + boss are the same across a dungeon's floors (one
  // monster band); read them off floor 1. The boss lair itself appears at a
  // random depth during the run. (`band` — the difficulty tier is `tier`.)
  const band = tierForFloorIn(dungeon, 1);
  const quest = dungeon.quest;
  const questDone =
    quest != null &&
    questUnlockIds(quest).every(
      (id) => save.questUnlocks.includes(id) || save.unlockedUnits.includes(id)
    );
  const known = (id: string) => save.bestiary[id]?.encountered === true;

  // Fodder cheapest-first — the wave's bread before its butter.
  const fodderIds = Object.keys(band.monsters).sort(
    (a, b) => band.monsters[a] - band.monsters[b]
  );

  const bossChest = CHEST_LABEL[effectiveBossChestTier(dungeon.id, tier)];
  // Gifts the whole dungeon hands over on its first (Normal) clear.
  const gifts = Object.values(milestoneUnlocksFor(dungeon.id)).filter(
    (id) => !save.unlockedUnits.includes(id)
  );
  const fodderLv = tierMonsterLevel(dungeon.monsterLevel, tier);
  const underleveled = warbandLv < fodderLv;
  const firstClearShards = isCapstoneDungeon(dungeon.id)
    ? TIER_REWARDS[tier].shardsBossFirstClearCapstone
    : TIER_REWARDS[tier].shardsBossFirstClear;

  return (
    <div className="atlas-info" role="dialog" aria-label={`${dungeon.name} details`}>
      <button
        className="detail-close"
        onClick={() => {
          playSfx("uiClose");
          onClose();
        }}
        aria-label="Close dungeon details"
      >
        ✕
      </button>
      <h4 className="atlas-info-title">
        {dungeonCleared ? "✓ " : ""}
        {dungeon.name}
      </h4>

      <div className="atlas-tier-pills" role="group" aria-label="Difficulty">
        {TIER_IDS.map((t) => {
          const unlocked = isTierUnlocked(t, tierDone);
          const done = tierDone(t);
          const below = prevTier(t);
          return (
            <button
              key={t}
              type="button"
              className={[
                "atlas-tier-pill",
                t,
                t === tier ? "selected" : "",
                unlocked ? "" : "locked",
                done ? "cleared" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={t === tier}
              title={
                unlocked || !below
                  ? undefined
                  : `Clear ${TIER_LABEL[below]} first`
              }
              onClick={() => {
                if (!unlocked) {
                  playSfx("uiDeny");
                  return;
                }
                if (t !== tier) playSfx("uiSelect");
                setTier(t);
              }}
            >
              {done ? "✓ " : !unlocked ? "🔒 " : ""}
              {TIER_LABEL[t]}
            </button>
          );
        })}
      </div>

      <p className="atlas-info-sub">
        Recommended: Lv {Math.min(LEVEL_CAP, fodderLv + 1)}+
        {underleveled && (
          <span className="atlas-info-warn"> · your warband is Lv {warbandLv} ⚠</span>
        )}
      </p>

      <div className="atlas-enemies">
        {fodderIds.map((id) => (
          <EnemyPortrait
            key={id}
            defId={id}
            known={known(id)}
            level={monsterLevelFor(dungeon, "fodder", tier)}
          />
        ))}
        {quest && (
          <EnemyPortrait
            defId={quest.spawnId}
            known={known(quest.spawnId)}
            level={monsterLevelFor(dungeon, "rare", tier)}
            tag="rare"
          />
        )}
        <EnemyPortrait
          defId={band.boss}
          known={known(band.boss)}
          level={monsterLevelFor(dungeon, "boss", tier)}
          tag="boss"
        />
      </div>

      <div className="atlas-rewards">
        {cleared ? (
          <span>✓ Cleared · descend again to farm the boss ({bossChest})</span>
        ) : (
          <span>
            Descend and slay the boss for a {bossChest}
            {tier === "normal" ? " + recruits" : ""}
          </span>
        )}
        {tier !== "normal" && (
          <span className="atlas-tier-mult">
            ×{TIER_REWARDS[tier].xpMult} XP · ×{TIER_REWARDS[tier].goldMult}{" "}
            gold
            {!cleared && ` · +${firstClearShards} ◆ on the first clear`}
          </span>
        )}
        {tier === "normal" && gifts.length > 0 && (
          <span className="atlas-gift">
            {gifts.length === 1 ? "Recruit on clear: " : "Recruits on clear: "}
            {gifts.map((id) => getUnitDef(id).name).join(", ")}
          </span>
        )}
      </div>

      {quest && !questDone && <p className="atlas-quest-hint">{quest.hint}</p>}

      <button
        className="btn btn-gold atlas-enter"
        onClick={() => {
          playSfx("uiConfirm");
          onEnter(tier);
        }}
      >
        {cleared
          ? `Descend Again — ${TIER_LABEL[tier]}`
          : tier === "normal"
            ? "Enter Dungeon"
            : `Enter Dungeon — ${TIER_LABEL[tier]}`}
      </button>
    </div>
  );
}
