// ============================================================================
// Currency pills — the gold ● and Soul Shard ◆ wallet readouts. Extracted from
// AppShell so the shop (and future screens) can show the same wallet without
// duplicating markup. Purely presentational; they read the save themselves.
// ============================================================================

import { useGameState } from "@/state/GameStateContext";
import { GameIcon } from "@/components/icons/GameIcon";

/** The player's gold. */
export function GoldPill() {
  const { save } = useGameState();
  return (
    <div className="gold-pill" aria-label={`${save.gold} gold`}>
      <span className="coin" aria-hidden>
        <GameIcon name="gold" />
      </span>
      {save.gold.toLocaleString()}
    </div>
  );
}

/** Soul Shards — the premium currency (legendary-tier item merges). */
export function ShardPill() {
  const { save } = useGameState();
  return (
    <div
      className="gold-pill shard-pill"
      aria-label={`${save.soulShards} Soul Shards`}
    >
      <span className="shard-gem" aria-hidden>
        <GameIcon name="shard" />
      </span>
      {save.soulShards.toLocaleString()}
    </div>
  );
}
