// ============================================================================
// FloorInfoPanel — the bottom sheet the atlas opens when you tap into a
// dungeon's descent trail. In the RNG "hunt for the boss" model there are no
// individually-entered floors, so this is a DUNGEON overview: who you'll face
// (small canvas portraits, bestiary silhouettes for the unmet), what clearing
// it pays, the rare-spawn quest whisper, and the big Enter Dungeon button.
// Reward copy mirrors the reward fold's own sources (bossChestTierFor /
// milestoneUnlocksFor) so the preview can't drift from what actually drops.
// ============================================================================

import { useLayoutEffect, useRef } from "react";
import {
  bossChestTierFor,
  milestoneUnlocksFor,
  monsterLevelFor,
  tierForFloorIn,
  type Dungeon,
} from "@/data/dungeons";
import { questUnlockIds } from "@/data/depths";
import { getUnitDef } from "@/data/units";
import { CHEST_LABEL } from "@/components/RewardPanel";
import { renderPortrait } from "@/engine/Renderer";
import { playSfx } from "@/audio/sfx";
import { isDungeonCleared, type PlayerSave } from "@/state/persistence";

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
  onEnter: () => void;
  onClose: () => void;
}

export function FloorInfoPanel({
  dungeon,
  save,
  warbandLv,
  onEnter,
  onClose,
}: Props) {
  const cleared = isDungeonCleared(save, dungeon.id);
  // The fodder roster + boss are the same across a dungeon's floors (one tier
  // band); read them off floor 1. The boss lair itself appears at a random
  // depth during the run.
  const tier = tierForFloorIn(dungeon, 1);
  const quest = dungeon.quest;
  const questDone =
    quest != null &&
    questUnlockIds(quest).every(
      (id) => save.questUnlocks.includes(id) || save.unlockedUnits.includes(id)
    );
  const known = (id: string) => save.bestiary[id]?.encountered === true;

  // Fodder cheapest-first — the wave's bread before its butter.
  const fodderIds = Object.keys(tier.monsters).sort(
    (a, b) => tier.monsters[a] - tier.monsters[b]
  );

  const bossChest = CHEST_LABEL[bossChestTierFor(dungeon.id)];
  // Gifts the whole dungeon hands over on its first clear.
  const gifts = Object.values(milestoneUnlocksFor(dungeon.id)).filter(
    (id) => !save.unlockedUnits.includes(id)
  );
  const underleveled = warbandLv < dungeon.monsterLevel;

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
        {cleared ? "✓ " : ""}
        {dungeon.name}
      </h4>
      <p className="atlas-info-sub">
        Recommended: Lv {Math.min(10, dungeon.monsterLevel + 1)}+
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
            level={monsterLevelFor(dungeon, "fodder")}
          />
        ))}
        {quest && (
          <EnemyPortrait
            defId={quest.spawnId}
            known={known(quest.spawnId)}
            level={monsterLevelFor(dungeon, "rare")}
            tag="rare"
          />
        )}
        <EnemyPortrait
          defId={tier.boss}
          known={known(tier.boss)}
          level={monsterLevelFor(dungeon, "boss")}
          tag="boss"
        />
      </div>

      <div className="atlas-rewards">
        {cleared ? (
          <span>✓ Cleared · descend again to farm the boss ({bossChest})</span>
        ) : (
          <span>Descend and slay the boss for a {bossChest} + recruits</span>
        )}
        {gifts.length > 0 && (
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
          onEnter();
        }}
      >
        {cleared ? "Descend Again" : "Enter Dungeon"}
      </button>
    </div>
  );
}
