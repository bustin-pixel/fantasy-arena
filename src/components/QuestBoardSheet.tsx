// ============================================================================
// QuestBoardSheet — the bulletin board. An overlay sheet (the BagSheet
// pattern: .detail-overlay backdrop, Escape close, body scroll freeze —
// automatically exempt from the pager swipe).
//
// Offers are always DERIVED from (day, refreshes) via meta/quests (never
// stored); accepted quests live in the save and tick from battle results.
// Claiming follows grant-then-reveal: the chest is rolled and the save fold
// committed FIRST, then the ceremony plays — closing mid-animation loses
// nothing.
// ============================================================================

import { useEffect, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import {
  boardCtx,
  describeQuest,
  normalizeQuestBoard,
  refreshCost,
  rollDailyBoard,
  type ActiveQuest,
  type QuestNotice,
} from "@/meta/quests";
import {
  ITEM_PITY_THRESHOLD,
  QUEST_ACTIVE_MAX,
  type QuestDifficulty,
} from "@/meta/economy";
import { rollChest, type ChestContent } from "@/meta/rewards";
import { dayIndexLocal } from "@/meta/shop";
import { generateSeed } from "@/utils/rng";
import { getUnitDef } from "@/data/units";
import { ITEM_LINES } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { ChestSprite } from "@/components/ChestSprite";
import { CHEST_LABEL } from "@/components/RewardPanel";
import { playSfx } from "@/audio/sfx";

interface Props {
  onClose: () => void;
}

const DIFFICULTY_LABEL: Record<QuestDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Parchment flavor headers per ask — pure theming. */
const KIND_TITLE: Record<QuestNotice["kind"], string> = {
  arena_wins: "Prove Your Mettle",
  unit_wins: "Champion's Contract",
  slay: "Bounty Posted",
  depths_clears: "Spelunker's Charter",
  endless_wave: "Hold the Line",
};

/** The in-flight claim ceremony (set AFTER the save fold committed). */
interface Ceremony {
  quest: ActiveQuest;
  contents: ChestContent[];
  phase: "closed" | "opening" | "open";
}

export function QuestBoardSheet({ onClose }: Props) {
  const {
    save,
    visitQuestBoard,
    acceptQuest,
    abandonQuest,
    refreshQuestBoard,
    claimQuest,
  } = useGameState();
  const [confirmAbandon, setConfirmAbandon] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);

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

  // Opening the board rolls its day forward (clears the Home FAB pip). The
  // impure edge (local clock) stays out here, like visitShop.
  const todayIdx = dayIndexLocal();
  useEffect(() => {
    visitQuestBoard(todayIdx);
    // Mount-only: the board day only moves when the sheet (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offers derive from the NORMALIZED board so the pre-commit render (before
  // visitQuestBoard lands) already shows today's notices, not yesterday's.
  const board = normalizeQuestBoard(save.quests, todayIdx);
  const offers = rollDailyBoard(board.day, board.refreshes, boardCtx(save)).filter(
    (n) => !board.taken.includes(n.id)
  );
  const active = board.active;
  const slotsFree = active.length < QUEST_ACTIVE_MAX;
  const cost = refreshCost(board.refreshes);
  const canRefresh = save.gold >= cost;

  const accept = (notice: QuestNotice) => {
    if (!slotsFree) return;
    playSfx("questSting");
    acceptQuest(todayIdx, notice.id);
  };

  const refresh = () => {
    if (!canRefresh) return;
    playSfx(cost > 0 ? "coinSpend" : "pageFlip");
    refreshQuestBoard(todayIdx);
  };

  const claim = (quest: ActiveQuest) => {
    // Roll first (fresh drop-time seed + the live pity counter), commit the
    // fold, THEN stage the ceremony — grant-then-reveal.
    const contents = rollChest(
      generateSeed(),
      quest.chestTier,
      save.unlockedUnits,
      { forceItem: save.itemPity >= ITEM_PITY_THRESHOLD }
    );
    claimQuest(quest.id, contents);
    playSfx("coinShower");
    setCeremony({ quest, contents, phase: "closed" });
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal quest-board"
        role="dialog"
        aria-label="Quest Board"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="quest-board-head">
          <span className="quest-board-title">Bulletin Board</span>
          <span className="quest-board-gold">● {save.gold.toLocaleString()}</span>
        </div>

        <div className="quest-board-body">
          {active.length > 0 && (
            <section>
              <h3 className="quest-section-title">
                Accepted ({active.length}/{QUEST_ACTIVE_MAX})
              </h3>
              {active.map((q) => {
                const done = q.progress >= q.goal;
                const frac = Math.min(1, q.progress / q.goal);
                return (
                  <div
                    key={q.id}
                    className={`quest-card active${done ? " complete" : ""}`}
                  >
                    <div className="quest-card-top">
                      <span className="quest-card-title">
                        {KIND_TITLE[q.kind]}
                      </span>
                      <span className={`quest-stamp ${q.difficulty}`}>
                        {done ? "COMPLETE" : DIFFICULTY_LABEL[q.difficulty]}
                      </span>
                    </div>
                    <div className="quest-card-ask">{describeQuest(q)}</div>
                    <div className="quest-progress">
                      <div className="quest-progress-bar">
                        <div
                          className="quest-progress-fill"
                          style={{ width: `${frac * 100}%` }}
                        />
                      </div>
                      <span className="quest-progress-num">
                        {Math.min(q.progress, q.goal)} / {q.goal}
                      </span>
                    </div>
                    <RewardLine notice={q} />
                    <div className="quest-card-actions">
                      {done ? (
                        <button
                          type="button"
                          className="quest-btn claim"
                          onClick={() => claim(q)}
                        >
                          Claim
                        </button>
                      ) : confirmAbandon === q.id ? (
                        <>
                          <span className="quest-abandon-ask">Abandon?</span>
                          <button
                            type="button"
                            className="quest-btn danger"
                            onClick={() => {
                              playSfx("uiDeny");
                              setConfirmAbandon(null);
                              abandonQuest(q.id);
                            }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="quest-btn"
                            onClick={() => {
                              playSfx("uiTap");
                              setConfirmAbandon(null);
                            }}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="quest-btn subtle"
                          onClick={() => {
                            playSfx("uiTap");
                            setConfirmAbandon(q.id);
                          }}
                        >
                          Abandon
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <section>
            <div className="quest-offers-head">
              <h3 className="quest-section-title">Notices</h3>
              <button
                type="button"
                className="quest-btn refresh"
                disabled={!canRefresh}
                onClick={refresh}
                title="Replace the pinned notices"
              >
                Refresh {cost > 0 ? `(● ${cost})` : "(Free)"}
              </button>
            </div>
            {offers.length === 0 && (
              <p className="quest-empty">
                The board is bare — new notices are pinned each day.
              </p>
            )}
            {offers.map((n) => (
              <div key={n.id} className="quest-card">
                <div className="quest-card-top">
                  <span className="quest-card-title">{KIND_TITLE[n.kind]}</span>
                  <span className={`quest-stamp ${n.difficulty}`}>
                    {DIFFICULTY_LABEL[n.difficulty]}
                  </span>
                </div>
                <div className="quest-card-ask">{describeQuest(n)}</div>
                <RewardLine notice={n} />
                <div className="quest-card-actions">
                  <button
                    type="button"
                    className="quest-btn accept"
                    disabled={!slotsFree}
                    onClick={() => accept(n)}
                  >
                    {slotsFree ? "Accept" : "Slots full"}
                  </button>
                </div>
              </div>
            ))}
          </section>
        </div>

        {ceremony && (
          <ClaimCeremony
            ceremony={ceremony}
            onPhase={(phase) => setCeremony((c) => (c ? { ...c, phase } : c))}
            onDone={() => setCeremony(null)}
          />
        )}
      </div>
    </div>
  );
}

/** The pay line on a card: flat gold + the chest tier it awards. */
function RewardLine({ notice }: { notice: QuestNotice }) {
  return (
    <div className="quest-reward-line">
      <span className="quest-reward-gold">● {notice.gold}</span>
      <span className={`quest-reward-chest tier-${notice.chestTier}`}>
        {CHEST_LABEL[notice.chestTier]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claim ceremony — gold line + the tap-to-open chest, over the board. Pure
// presentation: everything was granted before this mounted.
// ---------------------------------------------------------------------------

function ClaimCeremony({
  ceremony,
  onPhase,
  onDone,
}: {
  ceremony: Ceremony;
  onPhase: (phase: Ceremony["phase"]) => void;
  onDone: () => void;
}) {
  const { quest, contents, phase } = ceremony;
  return (
    // Everything was granted before the veil went up, so dismissing at any
    // point (except mid lid-swing) is loss-free.
    <div
      className="quest-ceremony"
      onClick={() => phase !== "opening" && onDone()}
    >
      <div
        className="quest-ceremony-inner"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quest-ceremony-title">Quest complete!</div>
        <div className="quest-ceremony-gold">+{quest.gold} gold</div>
        <button
          type="button"
          className={`reward-chest${phase === "closed" ? "" : " opened"}`}
          onClick={() => phase === "closed" && onPhase("opening")}
          aria-label={`Open ${CHEST_LABEL[quest.chestTier]}`}
        >
          <ChestSprite
            tier={quest.chestTier}
            opening={phase !== "closed"}
            onOpened={() => onPhase("open")}
          />
          <span className="reward-chest-label">
            {phase === "closed"
              ? `Open ${CHEST_LABEL[quest.chestTier]}`
              : CHEST_LABEL[quest.chestTier]}
          </span>
        </button>
        {phase === "open" && (
          <>
            <ul className="reward-contents">
              {contents.map((entry, i) => (
                <ContentLine key={i} entry={entry} />
              ))}
            </ul>
            <button type="button" className="quest-btn claim" onClick={onDone}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** One chest-content line — mirrors the RewardPanel reveal copy. */
function ContentLine({ entry }: { entry: ChestContent }) {
  if (entry.kind === "gold")
    return <li className="reward-entry">+{entry.amount} gold</li>;
  if (entry.kind === "shards")
    return (
      <li className="reward-entry reward-shards">
        +{entry.amount} Soul Shards
      </li>
    );
  if (entry.kind === "item") {
    const line = ITEM_LINES[entry.lineId];
    return (
      <li className="reward-entry reward-unlock">
        <span style={{ color: RARITIES[entry.quality].color }}>
          {line?.name ?? entry.lineId} ★1
        </span>{" "}
        — sent to your Bag
      </li>
    );
  }
  const def = getUnitDef(entry.unitId);
  if (entry.kind === "duplicate")
    return (
      <li className="reward-entry">
        <span style={{ color: RARITIES[def.rarity].color }}>{def.name}</span>{" "}
        (owned) → +{entry.gold} gold
      </li>
    );
  return (
    <li className="reward-entry reward-unlock">
      <span style={{ color: RARITIES[def.rarity].color }}>{def.name}</span>{" "}
      unlocked!
    </li>
  );
}
