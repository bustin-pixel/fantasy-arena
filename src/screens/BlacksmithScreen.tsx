// ============================================================================
// BlacksmithScreen — the Forge. A full-screen App view (the ShopScreen
// pattern): animated smith set piece up top, the inventory + smith services
// below. This ABSORBS the old BagSheet — inventory browsing, merge (now
// "Forge"), plus the new Salvage / Commission / Forge All services.
//
// Everything is commit-first-then-theater (the Bag's grant-then-reveal rule):
// the pure fold lands in the save immediately, then the scene plays its
// sequence and one scheduled timeout fires the reveal cues at the scene's
// exported beat. All mutations go through the context's folds; this component
// only routes taps, plays sounds, and makes the smith swing.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ItemSlot } from "@/types";
import { useGameState } from "@/state/GameStateContext";
import {
  BlacksmithScene,
  COMMISSION_REVEAL_MS,
  CRAFT_REVEAL_MS,
  SALVAGE_MS,
  SCENE_ASPECT,
  montageTotalMs,
  type SmithAct,
} from "@/components/BlacksmithScene";
import { GoldPill, ShardPill } from "@/components/CurrencyPills";
import { GameIcon } from "@/components/icons/GameIcon";
import { ItemIcon } from "@/components/ItemIcon";
import {
  BASE_LINES_BY_SLOT,
  describeItemKey,
  ITEM_LINES,
  makeItemKey,
  nextItemKey,
  parseItemKey,
  type ItemQuality,
} from "@/data/items";
import {
  availableCount,
  canCombine,
  countReferences,
  mergeCost,
  unitsLosingFuel,
} from "@/meta/inventory";
import {
  COMMISSION_QUALITY,
  COMMISSION_STAR,
  canSalvage,
  maxCommission,
  planForgeAll,
  salvageValue,
} from "@/meta/blacksmith";
import { COMMISSION_PRICE } from "@/meta/economy";
import { RARITIES } from "@/data/rarities";
import { getUnitDef } from "@/data/units";
import { playSfx, type SfxKey } from "@/audio/sfx";
import { playStinger } from "@/audio/music";

interface Props {
  onExit: () => void;
}

const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "Weapons",
  armor: "Armor",
  trinket: "Trinkets",
};

const LINE_ORDER = Object.keys(ITEM_LINES);
const QUALITY_ORDER: ItemQuality[] = ["rare", "epic", "legendary"];

// The smith's speech-bubble barks are intentionally omitted for now — they
// return with the character sprite. The gruff `smith*` voice SFX stay in
// audio/sfx.ts, ready to wire back up (BARKS + BARK_VOICE design in git
// history / the blacksmith memory).

export function BlacksmithScreen({ onExit }: Props) {
  const { save, combineItems, salvageItem, commissionItems, forgeAll } =
    useGameState();

  // Owned stacks grouped by slot, in line-declaration → quality → star order
  // (the BagSheet grouping, verbatim).
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

  // The Forge All dry-run — button label, confirm panel, and the commit all
  // read the same walk, so preview ≡ result.
  const plan = useMemo(() => planForgeAll(save), [save]);

  // ---- the scene's act trigger ---------------------------------------------
  const [act, setAct] = useState<SmithAct | null>(null);

  // One pending reveal cue, synced to the scene's exported beats. Latest wins:
  // the fold is already committed, so an interrupted reveal loses nothing.
  const revealTimer = useRef<number | null>(null);
  const scheduleReveal = (ms: number, sfx: SfxKey, stinger = false) => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      playSfx(sfx);
      if (stinger) playStinger("levelup");
    }, ms);
  };
  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    },
    []
  );

  // ---- overlays -------------------------------------------------------------
  const [selected, setSelected] = useState<string | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionPick, setCommissionPick] = useState<string | null>(null);
  const [commissionQty, setCommissionQty] = useState(1);
  const [confirmForgeAll, setConfirmForgeAll] = useState(false);

  // How many commissions the wallet affords — the stepper ceiling / Max target.
  const commissionMax = Math.max(1, maxCommission(save));

  // A selected stack that got consumed (forged/salvaged away) clears itself.
  useEffect(() => {
    if (selected && !(save.items[selected] > 0)) setSelected(null);
  }, [save.items, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape peels one layer: confirm → picker → detail → the Forge itself.
      if (confirmForgeAll) setConfirmForgeAll(false);
      else if (commissionOpen) setCommissionOpen(false);
      else if (selected !== null) setSelected(null);
      else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmForgeAll, commissionOpen, selected, onExit]);

  // Scene sizing: fill the column width, capped to half the viewport height so
  // the pinned forge (sticky, see .smith-scene-wrap) always leaves at least
  // half the screen for the scrolling inventory. It deliberately does NOT
  // shrink to fit the inventory anymore — a full bag used to squeeze the forge
  // down to a stamp; the screen scrolls under the pinned forge instead.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sceneW, setSceneW] = useState(0);
  const measure = () => {
    const wrapW = wrapRef.current?.clientWidth ?? 0;
    const maxH = window.innerHeight * 0.5; // forge caps at half the viewport
    const target = Math.min(wrapW, Math.floor(maxH * SCENE_ASPECT));
    setSceneW((w) => (Math.abs(w - target) > 1 ? target : w));
  };
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(measure);

  // Brief pop on the grid cell of a fresh forge/commission result.
  const [justForged, setJustForged] = useState<string | null>(null);
  useEffect(() => {
    if (justForged === null) return;
    const tm = window.setTimeout(() => setJustForged(null), 700);
    return () => window.clearTimeout(tm);
  }, [justForged]);

  const bumpAct = (next: Omit<SmithAct, "nonce">) =>
    setAct((a) => ({ ...next, nonce: (a?.nonce ?? 0) + 1 }));

  // ---- the services (commit first, then theater) ----------------------------
  const forge = (key: string) => {
    const to = nextItemKey(key);
    if (!to || !canCombine(save, key).ok) return; // button gates; belt-and-braces
    const qualityUp = parseItemKey(key)!.quality !== parseItemKey(to)!.quality;
    combineItems(key); // commit FIRST
    playSfx("coinSpend");
    bumpAct({ kind: "craft", fromKey: key, toKey: to, qualityUp });
    scheduleReveal(CRAFT_REVEAL_MS, "itemReveal", qualityUp);
    setJustForged(to);
    setSelected(null); // clear the stage — the anvil is the show
  };

  const salvage = (key: string) => {
    const value = salvageValue(key);
    if (value == null || !canSalvage(save, key).ok) return;
    salvageItem(key); // commit FIRST
    bumpAct({ kind: "salvage", fromKey: key });
    scheduleReveal(SALVAGE_MS, "coinSpend");
    setSelected(null);
  };

  const commitCommission = () => {
    if (!commissionPick) return;
    const n = Math.min(commissionQty, maxCommission(save));
    if (n < 1) {
      playSfx("uiDeny");
      return;
    }
    const key = makeItemKey(commissionPick, COMMISSION_QUALITY, COMMISSION_STAR);
    commissionItems(commissionPick, n); // commit FIRST (whole batch, atomic)
    playSfx("coinSpend");
    bumpAct({ kind: "commission", toKey: key });
    scheduleReveal(COMMISSION_REVEAL_MS, "itemReveal");
    setJustForged(key);
    setCommissionOpen(false);
  };

  const commitForgeAll = () => {
    if (plan.steps.length === 0) return;
    forgeAll(); // commit FIRST
    playSfx("coinSpend");
    bumpAct({ kind: "montage", count: plan.steps.length });
    scheduleReveal(montageTotalMs(plan.steps.length), "itemReveal");
    setConfirmForgeAll(false);
    setSelected(null);
  };

  const openDetail = (key: string) => {
    playSfx("uiSelect");
    setSelected(key);
  };

  return (
    <div className="smith-screen">
      <div className="smith-scene-wrap" ref={wrapRef}>
        {sceneW > 0 && <BlacksmithScene width={sceneW} act={act} />}
        <div className="smith-header">
          <button
            type="button"
            className="smith-back"
            onClick={() => {
              playSfx("uiClose");
              onExit();
            }}
            aria-label="Back to Home"
          >
            ← Home
          </button>
          <div className="smith-pills">
            <ShardPill />
            <GoldPill />
          </div>
        </div>
        <h1 className="smith-title">The Forge</h1>
      </div>

      <div className="smith-body">
        <div className="smith-actions">
          <button
            type="button"
            className="smith-service"
            disabled={plan.steps.length === 0}
            onClick={() => {
              playSfx("uiOpen");
              setConfirmForgeAll(true);
            }}
            title={
              plan.steps.length === 0
                ? "Nothing gold-mergeable right now — shard-fee work stays manual."
                : `${plan.steps.length} merges, ${plan.totalGold} gold total`
            }
          >
            <GameIcon name="forge" /> Forge All ×{plan.steps.length} —{" "}
            <GameIcon name="gold" /> {plan.totalGold.toLocaleString()}
          </button>
          <button
            type="button"
            className="smith-service"
            onClick={() => {
              playSfx("uiOpen");
              setCommissionPick(null);
              setCommissionQty(1);
              setCommissionOpen(true);
            }}
          >
            Commission… — <GameIcon name="gold" /> {COMMISSION_PRICE}
          </button>
        </div>

        {totalStacks === 0 && (
          <p className="smith-empty">
            The racks are bare — chests from battles, dungeons and endless
            milestones drop gear (dungeon bosses guard their own signature
            relics). Or commission the smith to forge a piece from scratch.
          </p>
        )}

        {(Object.keys(bySlot) as ItemSlot[]).map((slot) =>
          bySlot[slot].length === 0 ? null : (
            <section className="smith-section" key={slot}>
              <h3 className="smith-section-title">{SLOT_LABELS[slot]}</h3>
              <div className="smith-grid">
                {bySlot[slot].map((key) => {
                  const count = save.items[key];
                  const equipped = countReferences(save.loadouts, key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`smith-cell${
                        justForged === key ? " just-forged" : ""
                      }`}
                      onClick={() => openDetail(key)}
                      aria-label={ITEM_LINES[parseItemKey(key)!.lineId].name}
                    >
                      <ItemIcon itemKey={key} size={56} />
                      {count > 1 && <span className="smith-count">×{count}</span>}
                      {equipped > 0 && (
                        <span className="smith-equipped" title="Equipped">
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
      </div>

      {selected !== null && save.items[selected] > 0 && (
        <SmithDetail
          itemKey={selected}
          count={save.items[selected]}
          save={save}
          onForge={() => forge(selected)}
          onSalvage={() => salvage(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {commissionOpen && (
        <div
          className="smith-detail-overlay"
          onClick={() => setCommissionOpen(false)}
        >
          <div
            className="smith-detail smith-commission"
            role="dialog"
            aria-label="Commission the smith"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="smith-panel-title">Commission the Smith</h3>
            <p className="smith-panel-note">
              Any base pattern, forged fresh at {RARITIES[COMMISSION_QUALITY].label}{" "}
              ★. Dungeon relics can&rsquo;t be commissioned — bosses guard those.
            </p>
            {(Object.keys(SLOT_LABELS) as ItemSlot[]).map((slot) => (
              <div key={slot}>
                <h4 className="smith-section-title">{SLOT_LABELS[slot]}</h4>
                <div className="smith-com-grid">
                  {BASE_LINES_BY_SLOT[slot].map((lineId) => {
                    const key = makeItemKey(
                      lineId,
                      COMMISSION_QUALITY,
                      COMMISSION_STAR
                    );
                    return (
                      <button
                        key={lineId}
                        type="button"
                        className={`smith-com-card${
                          commissionPick === lineId ? " selected" : ""
                        }`}
                        onClick={() => {
                          playSfx("uiSelect");
                          setCommissionPick(lineId);
                        }}
                      >
                        <ItemIcon itemKey={key} size={44} hideStars />
                        <span className="smith-com-name">
                          {ITEM_LINES[lineId].name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Fixed-height (3-line) preview — flavour clamps to 1 line, stats
                to 2 — so picking a pattern NEVER resizes the panel. */}
            <div className="smith-com-desc">
              {commissionPick ? (
                <>
                  <span className="smith-com-flavor">
                    {ITEM_LINES[commissionPick].desc}
                  </span>
                  <span className="smith-com-stats">
                    {describeItemKey(
                      makeItemKey(commissionPick, COMMISSION_QUALITY, COMMISSION_STAR)
                    ).join(" · ")}
                  </span>
                </>
              ) : (
                <span className="smith-com-desc-empty">
                  Pick a pattern to preview it — forged fresh at{" "}
                  {RARITIES[COMMISSION_QUALITY].label} ★.
                </span>
              )}
            </div>
            <div className="smith-detail-actions smith-com-actions">
              <button
                type="button"
                className="btn smith-close smith-com-close"
                onClick={() => setCommissionOpen(false)}
              >
                Close
              </button>
              <div className="smith-com-buy">
                <div className="smith-com-qty" role="group" aria-label="How many">
                  <button
                    type="button"
                    className="smith-qty-btn"
                    aria-label="One fewer"
                    disabled={commissionQty <= 1}
                    onClick={() => {
                      playSfx("uiSelect");
                      setCommissionQty((q) => Math.max(1, q - 1));
                    }}
                  >
                    −
                  </button>
                  <span className="smith-qty-n" aria-live="polite">
                    ×{commissionQty}
                  </span>
                  <button
                    type="button"
                    className="smith-qty-btn"
                    aria-label="One more"
                    disabled={commissionQty >= commissionMax}
                    onClick={() => {
                      playSfx("uiSelect");
                      setCommissionQty((q) => Math.min(commissionMax, q + 1));
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="smith-qty-max"
                    disabled={commissionQty >= commissionMax}
                    onClick={() => {
                      playSfx("uiSelect");
                      setCommissionQty(commissionMax);
                    }}
                  >
                    Max
                  </button>
                </div>
                <button
                  type="button"
                  className={`btn btn-gold smith-com-commit${
                    save.gold < COMMISSION_PRICE * commissionQty ? " cant" : ""
                  }`}
                  disabled={
                    !commissionPick ||
                    save.gold < COMMISSION_PRICE * commissionQty
                  }
                  onClick={commitCommission}
                >
                  Commission{commissionQty > 1 ? ` ×${commissionQty}` : ""} —{" "}
                  <GameIcon name="gold" />{" "}
                  {(COMMISSION_PRICE * commissionQty).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmForgeAll && (
        <div
          className="smith-detail-overlay"
          onClick={() => setConfirmForgeAll(false)}
        >
          <div
            className="smith-detail"
            role="dialog"
            aria-label="Forge everything"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="smith-panel-title">Forge everything?</h3>
            <p className="smith-panel-note">
              {plan.steps.length} merge{plan.steps.length === 1 ? "" : "s"} for{" "}
              <GameIcon name="gold" /> {plan.totalGold.toLocaleString()}. Shard-fee work (legendary tier)
              is left for your own hand.
            </p>
            {plan.touchesEquipped && (
              <p className="smith-warning">
                <GameIcon name="warning" /> Uses gear your units are wearing —
                upgrades stay equipped where possible.
              </p>
            )}
            <div className="smith-detail-actions">
              <button
                type="button"
                className="btn smith-close"
                onClick={() => setConfirmForgeAll(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-gold" onClick={commitForgeAll}>
                <GameIcon name="forge" /> Forge All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The item detail overlay — the BagSheet detail pane reborn as a floating
// panel (the shop-inspect pattern), with Forge AND Salvage actions.
// ---------------------------------------------------------------------------

interface SmithDetailProps {
  itemKey: string;
  count: number;
  save: {
    items: Record<string, number>;
    loadouts: Record<string, { weapon?: string; armor?: string; trinket?: string }>;
    gold: number;
    soulShards: number;
  };
  onForge: () => void;
  onSalvage: () => void;
  onClose: () => void;
}

function SmithDetail({
  itemKey,
  count,
  save,
  onForge,
  onSalvage,
  onClose,
}: SmithDetailProps) {
  const p = parseItemKey(itemKey)!;
  const rarity = RARITIES[p.quality];
  const next = nextItemKey(itemKey);
  const cost = mergeCost(itemKey);
  const check = canCombine(save, itemKey);
  const losing = unitsLosingFuel(save, itemKey);
  const free = availableCount(save.items, save.loadouts, itemKey);
  const melt = canSalvage(save, itemKey);
  const meltValue = salvageValue(itemKey);
  const holders = Object.keys(save.loadouts)
    .filter((defId) => {
      const l = save.loadouts[defId];
      return l.weapon === itemKey || l.armor === itemKey || l.trinket === itemKey;
    })
    .sort();

  const costLabel: ReactNode = cost ? (
    cost.shards > 0 ? (
      <>
        <GameIcon name="shard" /> {cost.shards} shards
      </>
    ) : (
      <>
        <GameIcon name="gold" /> {cost.gold}g
      </>
    )
  ) : (
    ""
  );
  const blockLabel: ReactNode = check.ok
    ? null
    : check.reason === "copies"
      ? "Need 2 copies"
      : check.reason === "gold"
        ? `Need ${cost?.gold}g`
        : check.reason === "shards"
          ? (
            <>
              Need <GameIcon name="shard" /> {cost?.shards} shards
            </>
          )
          : check.reason === "capped"
            ? "Fully upgraded"
            : null;

  return (
    <div className="smith-detail-overlay" onClick={onClose}>
      <div
        className="smith-detail"
        style={{ borderColor: rarity.color }}
        role="dialog"
        aria-label={`${p.line.name} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="smith-detail-head">
          <ItemIcon itemKey={itemKey} size={64} />
          <div className="smith-detail-title">
            <span className="smith-detail-name" style={{ color: rarity.color }}>
              {p.line.name}
            </span>
            <span className="smith-detail-tier">
              {rarity.label} {"★".repeat(p.star)}
              {p.line.dungeonId && (
                <span className="smith-detail-sig"> · dungeon relic</span>
              )}
            </span>
            <span className="smith-detail-counts">
              Owned ×{count} · {free} free
              {holders.length > 0 &&
                ` · worn by ${holders.map((id) => getUnitDef(id).name).join(", ")}`}
            </span>
          </div>
        </div>
        <p className="smith-detail-desc">{p.line.desc}</p>
        <ul className="smith-detail-effects">
          {describeItemKey(itemKey).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {next && (
          <div className="smith-next">
            <div className="smith-next-head">
              Next: {RARITIES[parseItemKey(next)!.quality].label}{" "}
              {"★".repeat(parseItemKey(next)!.star)}
            </div>
            <ul className="smith-detail-effects next">
              {describeItemKey(next).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {!next && (
          <div className="smith-maxed">Fully upgraded — legendary ★★★</div>
        )}

        <div className="smith-detail-buttons">
          {next && (
            <button
              type="button"
              className="btn btn-add smith-forge-btn"
              disabled={!check.ok}
              onClick={onForge}
            >
              {check.ok ? (
                <>
                  <GameIcon name="forge" /> Forge 2 → 1 ({costLabel})
                </>
              ) : (
                blockLabel ?? "Forge"
              )}
            </button>
          )}
          {check.ok && losing.length > 0 && (
            <span className="smith-warning">
              <GameIcon name="warning" /> Uses gear equipped on{" "}
              {losing.map((id) => getUnitDef(id).name).join(", ")} —{" "}
              {getUnitDef(losing[0]).name} keeps the upgraded item
            </span>
          )}
          <button
            type="button"
            className="btn smith-salvage-btn"
            disabled={!melt.ok}
            onClick={onSalvage}
          >
            {melt.ok
              ? (
                <>
                  Salvage 1 — +<GameIcon name="gold" /> {meltValue}
                </>
              )
              : melt.ok === false && melt.reason === "equipped"
                ? "All copies equipped — unequip first"
                : "Salvage"}
          </button>
          <button type="button" className="btn smith-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
