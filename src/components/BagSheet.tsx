// ============================================================================
// BagSheet — the equipment inventory + merge surface. An overlay sheet (the
// DungeonMapSheet/UnitDetail pattern: .detail-overlay backdrop, Escape close,
// body scroll freeze — automatically exempt from the pager swipe).
//
// The inventory is stack counts; each cell is one (line, quality, star) stack.
// Tapping a stack opens its detail pane: effects now vs. after the next merge,
// copies owned/equipped, and the Combine button (gold for rare/epic work,
// Soul Shards for anything legendary). Combining commits the save fold FIRST,
// then plays the ceremony — grant-then-reveal, like the chest.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemSlot } from "@/types";
import {
  describeItemMods,
  describeLuckyCoin,
  ITEM_LINES,
  nextItemKey,
  parseItemKey,
  resolveItemMods,
  type ItemQuality,
} from "@/data/items";
import {
  availableCount,
  canCombine,
  countReferences,
  mergeCost,
  unitsLosingFuel,
} from "@/meta/inventory";
import { RARITIES } from "@/data/rarities";
import { getUnitDef } from "@/data/units";
import { useGameState } from "@/state/GameStateContext";
import { ItemIcon } from "@/components/ItemIcon";
import { CombineCeremony } from "@/components/CombineCeremony";
import { playSfx } from "@/audio/sfx";

interface Props {
  onClose: () => void;
}

const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "Weapons",
  armor: "Armor",
  trinket: "Trinkets",
};

const LINE_ORDER = Object.keys(ITEM_LINES);
const QUALITY_ORDER: ItemQuality[] = ["rare", "epic", "legendary"];

/** Effect lines for a key (Lucky Coin is meta-only and described specially). */
function effectLines(key: string): string[] {
  const p = parseItemKey(key);
  if (!p) return [];
  if (p.lineId === "lucky_coin") return describeLuckyCoin(p.quality, p.star);
  return describeItemMods(resolveItemMods(key));
}

export function BagSheet({ onClose }: Props) {
  const { save, combineItems } = useGameState();
  const [selected, setSelected] = useState<string | null>(null);
  // The in-flight merge ceremony (set AFTER the save fold committed).
  const [ceremony, setCeremony] = useState<{ from: string; to: string } | null>(
    null
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  // Owned stacks grouped by slot, in line-declaration → quality → star order.
  const bySlot = useMemo(() => {
    const groups: Record<ItemSlot, string[]> = {
      weapon: [],
      armor: [],
      trinket: [],
    };
    for (const key of Object.keys(save.items)) {
      const p = parseItemKey(key);
      if (p) groups[p.line.slot].push(key);
    }
    for (const slot of Object.keys(groups) as ItemSlot[]) {
      groups[slot].sort((a, b) => {
        const pa = parseItemKey(a)!;
        const pb = parseItemKey(b)!;
        const line = LINE_ORDER.indexOf(pa.lineId) - LINE_ORDER.indexOf(pb.lineId);
        if (line !== 0) return line;
        const q =
          QUALITY_ORDER.indexOf(pa.quality) - QUALITY_ORDER.indexOf(pb.quality);
        if (q !== 0) return q;
        return pa.star - pb.star;
      });
    }
    return groups;
  }, [save.items]);

  const totalStacks = Object.values(bySlot).reduce((n, g) => n + g.length, 0);

  const sel = selected ? parseItemKey(selected) : null;
  const selCount = selected ? save.items[selected] ?? 0 : 0;
  // A selected stack that got consumed (merged away) clears itself.
  useEffect(() => {
    if (selected && !(save.items[selected] > 0)) setSelected(null);
  }, [save.items, selected]);

  const combine = (key: string) => {
    const to = nextItemKey(key);
    if (!to || !canCombine(save, key).ok) return;
    combineItems(key); // commit FIRST (grant-then-reveal)
    setCeremony({ from: key, to });
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal bag-sheet"
        role="dialog"
        aria-label="Bag"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="bag-head">
          <span className="bag-title">🎒 Bag</span>
          <span className="bag-wallet">
            <span className="bag-gold">● {save.gold.toLocaleString()}</span>
            <span className="bag-shards">◆ {save.soulShards.toLocaleString()}</span>
          </span>
        </div>

        <div className="bag-body">
          {totalStacks === 0 && (
            <p className="bag-empty">
              No items yet — chests from battles, dungeons and endless
              milestones drop gear. Dungeon bosses guard their own signature
              relics.
            </p>
          )}

          {(Object.keys(bySlot) as ItemSlot[]).map((slot) =>
            bySlot[slot].length === 0 ? null : (
              <section className="bag-section" key={slot}>
                <h3 className="bag-section-title">{SLOT_LABELS[slot]}</h3>
                <div className="bag-grid">
                  {bySlot[slot].map((key) => {
                    const count = save.items[key];
                    const equipped = countReferences(save.loadouts, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`bag-cell${selected === key ? " selected" : ""}`}
                        onClick={() => {
                          playSfx("uiSelect");
                          setSelected(selected === key ? null : key);
                        }}
                        aria-label={ITEM_LINES[parseItemKey(key)!.lineId].name}
                      >
                        <ItemIcon itemKey={key} size={56} />
                        {count > 1 && (
                          <span className="bag-count">×{count}</span>
                        )}
                        {equipped > 0 && (
                          <span className="bag-equipped" title="Equipped">
                            E{equipped > 1 ? equipped : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )
          )}

          {sel && selected && selCount > 0 && (
            <BagDetail
              itemKey={selected}
              count={selCount}
              save={save}
              onCombine={() => combine(selected)}
            />
          )}
        </div>
      </div>

      {ceremony && (
        <CombineCeremony
          from={ceremony.from}
          to={ceremony.to}
          onDone={() => {
            setSelected(ceremony.to); // land on the shiny new item
            setCeremony(null);
          }}
        />
      )}
    </div>
  );
}

interface BagDetailProps {
  itemKey: string;
  count: number;
  save: {
    items: Record<string, number>;
    loadouts: Record<string, { weapon?: string; armor?: string; trinket?: string }>;
    gold: number;
    soulShards: number;
  };
  onCombine: () => void;
}

function BagDetail({ itemKey, count, save, onCombine }: BagDetailProps) {
  // The pane renders below the grids — bring it into view on (re)select.
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    paneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [itemKey]);
  const p = parseItemKey(itemKey)!;
  const rarity = RARITIES[p.quality];
  const next = nextItemKey(itemKey);
  const cost = mergeCost(itemKey);
  const check = canCombine(save, itemKey);
  const losing = unitsLosingFuel(save, itemKey);
  const free = availableCount(save.items, save.loadouts, itemKey);
  const holders = Object.keys(save.loadouts)
    .filter((defId) => {
      const l = save.loadouts[defId];
      return l.weapon === itemKey || l.armor === itemKey || l.trinket === itemKey;
    })
    .sort();

  const costLabel = cost
    ? cost.shards > 0
      ? `◆ ${cost.shards} shards`
      : `● ${cost.gold}g`
    : "";
  const blockLabel =
    check.ok || !("reason" in check)
      ? null
      : check.reason === "copies"
        ? "Need 2 copies"
        : check.reason === "gold"
          ? `Need ${cost?.gold}g`
          : check.reason === "shards"
            ? `Need ◆ ${cost?.shards} shards`
            : check.reason === "capped"
              ? "Fully upgraded"
              : null;

  return (
    <div ref={paneRef} className="bag-detail" style={{ borderColor: rarity.color }}>
      <div className="bag-detail-head">
        <ItemIcon itemKey={itemKey} size={64} />
        <div className="bag-detail-title">
          <span className="bag-detail-name" style={{ color: rarity.color }}>
            {p.line.name}
          </span>
          <span className="bag-detail-tier">
            {rarity.label} {"★".repeat(p.star)}
            {p.line.dungeonId && (
              <span className="bag-detail-sig"> · dungeon relic</span>
            )}
          </span>
          <span className="bag-detail-counts">
            Owned ×{count} · {free} free
            {holders.length > 0 &&
              ` · worn by ${holders.map((id) => getUnitDef(id).name).join(", ")}`}
          </span>
        </div>
      </div>
      <p className="bag-detail-desc">{p.line.desc}</p>
      <ul className="bag-detail-effects">
        {effectLines(itemKey).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {next && (
        <div className="bag-next">
          <div className="bag-next-head">
            Next: {RARITIES[parseItemKey(next)!.quality].label}{" "}
            {"★".repeat(parseItemKey(next)!.star)}
          </div>
          <ul className="bag-detail-effects next">
            {effectLines(next).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {next && (
        <div className="bag-combine-row">
          <button
            type="button"
            className="btn btn-add bag-combine"
            disabled={!check.ok}
            onClick={onCombine}
          >
            {check.ok ? `Combine 2 → 1 (${costLabel})` : blockLabel ?? "Combine"}
          </button>
          {check.ok && losing.length > 0 && (
            <span className="bag-warning">
              ⚠ Uses gear equipped on{" "}
              {losing.map((id) => getUnitDef(id).name).join(", ")} —{" "}
              {getUnitDef(losing[0]).name} keeps the upgraded item
            </span>
          )}
        </div>
      )}
      {!next && <div className="bag-maxed">Fully upgraded — legendary ★★★</div>}
    </div>
  );
}
