// ============================================================================
// ChestLoot — what came out of a chest, drawn the same way everywhere.
//
// The on-floor dungeon reveal (FloorLootReveal) floats the loot up out of the
// chest: icon rising and glowing, gold counting up, nothing boxed. The panels
// used to list the same contents as text rows inside a bordered box, so one
// item looked like two different things depending on where you opened it.
// This is that presentation, extracted so the floor and the panels share one
// source of truth rather than imitating each other.
//
// Pure theater: everything here was granted before the chest was ever tapped
// (grant-then-reveal), so dismissing mid-animation loses nothing. Positioning
// and any surrounding chrome belong to the caller.
// ============================================================================

import type { ChestContent } from "@/meta/rewards";
import { ITEM_LINES, makeItemKey } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { getUnitDef } from "@/data/units";
import { ItemIcon } from "@/components/ItemIcon";
import { GameIcon } from "@/components/icons/GameIcon";
import { useCountUp } from "@/hooks/useCountUp";

type ItemEntry = Extract<ChestContent, { kind: "item" }>;
type ChoiceEntry = Extract<ChestContent, { kind: "item_choice" }>;
type UnitEntry = Extract<ChestContent, { kind: "unit" }>;
type DupeEntry = Extract<ChestContent, { kind: "duplicate" }>;

interface Props {
  contents: readonly ChestContent[];
  /** Icon size — the floor reveal sits over the arena and can afford more. */
  iconSize?: number;
  /** Gold paid ALONGSIDE the chest (a quest's flat reward). Folded into the
   *  one total below rather than shown as its own line: two gold figures in
   *  one reveal reads as a bug, and the player only cares what they earned. */
  extraGold?: number;
}

export function ChestLoot({ contents, iconSize = 54, extraGold = 0 }: Props) {
  // One number: chest gold + any owned-duplicate refund + whatever was paid
  // alongside it. Nobody cares which slice came from where.
  const gold = contents.reduce(
    (s, e) =>
      s + (e.kind === "gold" ? e.amount : e.kind === "duplicate" ? e.gold : 0),
    extraGold
  );
  const shards = contents.reduce(
    (s, e) => s + (e.kind === "shards" ? e.amount : 0),
    0
  );
  const items = contents.filter((e): e is ItemEntry => e.kind === "item");
  const choices = contents.filter(
    (e): e is ChoiceEntry => e.kind === "item_choice"
  );
  const units = contents.filter((e): e is UnitEntry => e.kind === "unit");
  const dupes = contents.filter((e): e is DupeEntry => e.kind === "duplicate");
  const shownGold = useCountUp(gold, true);

  return (
    <div className="chest-loot">
      {items.map((it, i) => (
        <div key={`i${i}`} className="chest-loot-item">
          <ItemIcon
            itemKey={makeItemKey(it.lineId, it.quality, 1)}
            size={iconSize}
          />
          <span
            className="chest-loot-name"
            style={{ color: RARITIES[it.quality].color }}
          >
            {ITEM_LINES[it.lineId]?.name ?? it.lineId} ★1
          </span>
        </div>
      ))}

      {/* The Reliquary's relic is a CHOICE, so there's no single icon to show
          yet — name the prize and point at where it's waiting. */}
      {choices.map((c, i) => (
        <div key={`c${i}`} className="chest-loot-item">
          <span
            className="chest-loot-name"
            style={{ color: RARITIES[c.quality].color }}
          >
            A relic of your choosing
          </span>
          <span className="chest-loot-sub">waiting on the quest board</span>
        </div>
      ))}

      {units.map((u, i) => {
        const def = getUnitDef(u.unitId);
        return (
          <div key={`u${i}`} className="chest-loot-item">
            <span
              className="chest-loot-name"
              style={{ color: RARITIES[def.rarity].color }}
            >
              {def.name} unlocked!
            </span>
          </div>
        );
      })}

      {/* A duplicate's gold is already inside the total above; this line only
          says WHERE it came from. */}
      {dupes.map((d, i) => {
        const def = getUnitDef(d.unitId);
        return (
          <div key={`d${i}`} className="chest-loot-item">
            <span
              className="chest-loot-name"
              style={{ color: RARITIES[def.rarity].color }}
            >
              {def.name}
            </span>
            <span className="chest-loot-sub">owned — traded for gold</span>
          </div>
        );
      })}

      {gold > 0 && (
        <div className="chest-loot-gold">
          <span className="coin" aria-hidden>
            <GameIcon name="gold" />
          </span>{" "}
          +{shownGold} gold
        </div>
      )}

      {shards > 0 && (
        <div className="chest-loot-shards">
          <span className="shard-gem" aria-hidden>
            <GameIcon name="shard" />
          </span>{" "}
          +{shards} Soul Shards
        </div>
      )}
    </div>
  );
}
