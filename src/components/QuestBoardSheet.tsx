// ============================================================================
// QuestBoardSheet — the bulletin board. An overlay sheet (the DungeonMapSheet
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
  questLocation,
  normalizeQuestBoard,
  refreshCost,
  rollDailyBoard,
  type ActiveQuest,
  type QuestNotice,
} from "@/meta/quests";
import {
  currentStage,
  describeWeekly,
  isFinalStage,
  normalizeSaga,
  normalizeWeekly,
  sagaStageClaimable,
  sweepEarned,
  themeForMonth,
  weeklyClaimable,
  weeklyCtx,
  type WeeklyQuest,
} from "@/meta/questCycles";
import {
  ITEM_PITY_THRESHOLD,
  QUEST_ACTIVE_MAX,
  WEEKLY_SWEEP_CHEST_TIER,
  type ChestTier,
  type QuestDifficulty,
} from "@/meta/economy";
import { rollChest, type ChestContent } from "@/meta/rewards";
import { dayIndexLocal, monthIndexLocal, weekIndexLocal } from "@/meta/shop";
import { generateSeed } from "@/utils/rng";
import { getUnitDef } from "@/data/units";
import { ITEM_LINES } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { ChestSprite } from "@/components/ChestSprite";
import { CHEST_LABEL } from "@/components/RewardPanel";
import { GameIcon } from "@/components/icons/GameIcon";
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

/** Flavor headers for the weekly contracts. */
const WEEKLY_TITLE: Record<WeeklyQuest["kind"], string> = {
  arena_wins: "War Season",
  depths_clears: "Spelunker's Season",
  slay_any: "The Grand Hunt",
  endless_waves: "Endless Endurance",
  tier_wins: "Elite Campaigner",
  gold_earned: "Fortune Seeker",
  daily_clears: "Faithful Regular",
  weekly_clears: "Contract Broker",
};

/** The board's three cadences. Tabs rather than stacked sections: with the
 *  daily notices, three contracts and a saga all on one 86vh scroller, the
 *  longer cadences sat below the fold and were easy to miss entirely. */
type BoardTab = "daily" | "weekly" | "monthly";

const TAB_LABEL: Record<BoardTab, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** The in-flight claim ceremony (set AFTER the save fold committed). One shape
 *  for every source — daily, weekly, sweep, saga finale — so they can't drift. */
interface Ceremony {
  title: string;
  /** Flat gold line; omitted when 0 (the sweep's gold is inside the chest). */
  gold: number;
  chestTier: ChestTier;
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
    visitQuestCycles,
    claimWeeklyQuest,
    claimWeeklySweep,
    claimSagaStage,
    resolveRelicPick,
  } = useGameState();
  const [confirmAbandon, setConfirmAbandon] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [tab, setTab] = useState<BoardTab>("daily");

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
  const weekIdx = weekIndexLocal();
  const monthIdx = monthIndexLocal();
  const cycles = { week: weekIdx, month: monthIdx };
  useEffect(() => {
    visitQuestBoard(todayIdx);
    visitQuestCycles(weekIdx, monthIdx);
    // Mount-only: the periods only move when the sheet (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offers derive from the NORMALIZED board so the pre-commit render (before
  // visitQuestBoard lands) already shows today's notices, not yesterday's.
  const board = normalizeQuestBoard(save.quests, todayIdx);
  const offers = rollDailyBoard(board.day, board.refreshes, boardCtx(save)).filter(
    (n) => !board.taken.includes(n.id)
  );
  const active = board.active;
  // Weekly + saga also render from their NORMALIZED state, so the pre-commit
  // render already shows this week's contracts rather than last week's.
  const weekly = normalizeWeekly(save.weeklyQuests, weekIdx, weeklyCtx(save));
  const saga = normalizeSaga(save.monthlySaga, monthIdx);
  const theme = themeForMonth(monthIdx);
  const stage = currentStage(saga);
  const pendingPick = save.pendingPicks[0] ?? null;
  const slotsFree = active.length < QUEST_ACTIVE_MAX;

  // Tabs hide what used to be one scroll away, so each one carries its own pip
  // — otherwise a finished contract behind an unselected tab is invisible and
  // the Home FAB's dot says "something is ready" without saying where.
  const tabAlert: Record<BoardTab, boolean> = {
    daily: active.some((q) => q.progress >= q.goal),
    weekly: weeklyClaimable(weekly) || sweepEarned(weekly),
    monthly: sagaStageClaimable(saga),
  };
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

  // Roll a chest with the live pity counter on a fresh drop-time seed. Always
  // called BEFORE the fold that grants it — roll-first, fold-pure.
  const rollFor = (tier: ChestTier) =>
    rollChest(generateSeed(), tier, save.unlockedUnits, {
      forceItem: save.itemPity >= ITEM_PITY_THRESHOLD,
    });

  const claim = (quest: ActiveQuest) => {
    if (ceremony) return;
    const contents = rollFor(quest.chestTier);
    claimQuest(quest.id, contents, cycles);
    playSfx("coinShower");
    setCeremony({
      title: "Quest complete!",
      gold: quest.gold,
      chestTier: quest.chestTier,
      contents,
      phase: "closed",
    });
  };

  // Every handler below re-checks its own precondition and bails while a
  // ceremony is up: a double-tap would otherwise roll a second chest whose
  // fold no-ops on the gate, revealing loot that was never granted.
  const claimWeekly = (quest: WeeklyQuest) => {
    if (ceremony) return;
    if (quest.progress < quest.goal || weekly.claimed.includes(quest.id)) return;
    const contents = rollFor(quest.chestTier);
    claimWeeklyQuest(quest.id, contents, cycles);
    playSfx("coinShower");
    setCeremony({
      title: "Contract fulfilled!",
      gold: quest.gold,
      chestTier: quest.chestTier,
      contents,
      phase: "closed",
    });
  };

  const claimSweep = () => {
    if (ceremony || !sweepEarned(weekly)) return;
    const contents = rollFor(WEEKLY_SWEEP_CHEST_TIER);
    claimWeeklySweep(contents, cycles);
    playSfx("coinShower");
    setCeremony({
      title: "A perfect week!",
      gold: 0, // the hoard's gold rides inside its contents
      chestTier: WEEKLY_SWEEP_CHEST_TIER,
      contents,
      phase: "closed",
    });
  };

  const claimStage = () => {
    if (ceremony || !stage || saga.progress < stage.goal) return;
    if (!isFinalStage(saga)) {
      // Non-final stages pay fixed gold/shards — nothing to roll, no chest.
      claimSagaStage(cycles, []);
      playSfx("questSting");
      return;
    }
    const contents = rollFor("legendary");
    claimSagaStage(cycles, contents);
    playSfx("coinShower");
    setCeremony({
      title: `${theme.title} — complete!`,
      gold: 0,
      chestTier: "legendary",
      contents,
      phase: "closed",
    });
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
          <span className="quest-board-gold">
            <GameIcon name="gold" /> {save.gold.toLocaleString()}
          </span>
        </div>

        {/* Pinned ABOVE the tabs, not inside one: an unresolved relic is a
            reward already paid for, and burying it behind a tab would make it
            easier to forget than it was as a stacked section. */}
        {pendingPick && (
          <div className="quest-board-pinned">
            <div className="quest-card saga">
              <div className="quest-card-top">
                <span className="quest-card-title">Choose Your Relic</span>
              </div>
              <div className="quest-card-ask">
                The Reliquary is open. Keep one:
              </div>
              <div className="relic-pick-row">
                {pendingPick.options.map((lineId) => {
                  const line = ITEM_LINES[lineId];
                  return (
                    <button
                      key={lineId}
                      type="button"
                      className="relic-pick"
                      onClick={() => {
                        playSfx("unlockFanfare");
                        resolveRelicPick(lineId);
                      }}
                    >
                      <span
                        className="relic-pick-name"
                        style={{ color: RARITIES[pendingPick.quality].color }}
                      >
                        {line?.name ?? lineId}
                      </span>
                      <span className="relic-pick-sub">
                        {pendingPick.quality} ★1
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="quest-tabs" role="tablist" aria-label="Quest cadence">
          {(["daily", "weekly", "monthly"] as BoardTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`quest-tab${tab === t ? " active" : ""}`}
              onClick={() => {
                if (t === tab) return;
                playSfx("uiTap");
                setTab(t);
              }}
            >
              {TAB_LABEL[t]}
              {tabAlert[t] && <span className="quest-tab-dot" />}
            </button>
          ))}
        </div>

        {/* key={tab} remounts the scroller so a switch always lands at the top
            rather than inheriting the previous tab's scroll offset. */}
        <div className="quest-board-body" key={tab}>
          {tab === "daily" && active.length > 0 && (
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
                    <WhereLine notice={q} />
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

          {tab === "daily" && (
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
                Refresh{" "}
                {cost > 0 ? (
                  <>
                    (<GameIcon name="gold" /> {cost})
                  </>
                ) : (
                  "(Free)"
                )}
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
                <WhereLine notice={n} />
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
          )}

          {tab === "weekly" && (
          <section>
            <h3 className="quest-section-title">
              Contracts <span className="quest-section-note">resets Monday</span>
            </h3>
            {weekly.quests.map((q) => {
              const claimed = weekly.claimed.includes(q.id);
              const done = q.progress >= q.goal;
              const frac = Math.min(1, q.progress / q.goal);
              return (
                <div
                  key={q.id}
                  className={`quest-card weekly${done ? " complete" : ""}${
                    claimed ? " collected" : ""
                  }`}
                >
                  <div className="quest-card-top">
                    <span className="quest-card-title">
                      {WEEKLY_TITLE[q.kind]}
                    </span>
                    <span className="quest-stamp weekly">
                      {claimed ? "COLLECTED" : done ? "COMPLETE" : "Weekly"}
                    </span>
                  </div>
                  <div className="quest-card-ask">{describeWeekly(q)}</div>
                  <div className="quest-progress">
                    <div className="quest-progress-bar">
                      <div
                        className="quest-progress-fill"
                        style={{ width: `${frac * 100}%` }}
                      />
                    </div>
                    <span className="quest-progress-num">
                      {Math.min(q.progress, q.goal).toLocaleString()} /{" "}
                      {q.goal.toLocaleString()}
                    </span>
                  </div>
                  <div className="quest-reward-line">
                    <span className="quest-reward-gold">
                      <GameIcon name="gold" /> {q.gold}
                    </span>
                    <span className={`quest-reward-chest tier-${q.chestTier}`}>
                      {CHEST_LABEL[q.chestTier]}
                    </span>
                  </div>
                  {done && !claimed && (
                    <div className="quest-card-actions">
                      <button
                        type="button"
                        className="quest-btn claim"
                        onClick={() => claimWeekly(q)}
                      >
                        Claim
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* The sweep: all contracts cleared pays a Dragon's Hoard. */}
            <div
              className={`quest-card sweep${
                weekly.sweepClaimed ? " collected" : ""
              }`}
            >
              <div className="quest-card-top">
                <span className="quest-card-title">Weekly Sweep</span>
                <span className="quest-stamp sweep">
                  {weekly.sweepClaimed ? "COLLECTED" : "Bonus"}
                </span>
              </div>
              <div className="quest-card-ask">
                Complete every contract this week
              </div>
              <div className="quest-sweep-pips">
                {weekly.quests.map((q) => (
                  <span
                    key={q.id}
                    className={`quest-sweep-pip${
                      weekly.claimed.includes(q.id) ? " lit" : ""
                    }`}
                  />
                ))}
              </div>
              <div className="quest-reward-line">
                <span
                  className={`quest-reward-chest tier-${WEEKLY_SWEEP_CHEST_TIER}`}
                >
                  {CHEST_LABEL[WEEKLY_SWEEP_CHEST_TIER]}
                </span>
              </div>
              {sweepEarned(weekly) && (
                <div className="quest-card-actions">
                  <button
                    type="button"
                    className="quest-btn claim"
                    onClick={claimSweep}
                  >
                    Claim
                  </button>
                </div>
              )}
            </div>
          </section>
          )}

          {tab === "monthly" && (
          <section>
            <h3 className="quest-section-title">
              Saga of the Month{" "}
              <span className="quest-section-note">resets on the 1st</span>
            </h3>
            <div className="quest-card saga">
              <div className="quest-card-top">
                <span className="quest-card-title">{theme.title}</span>
                <span className="quest-saga-dots">
                  {theme.stages.map((_, i) => (
                    <span
                      key={i}
                      className={`quest-saga-dot${
                        i < saga.stage ? " done" : i === saga.stage ? " live" : ""
                      }`}
                    />
                  ))}
                </span>
              </div>
              <div className="quest-card-where">{theme.flavor}</div>
              {stage ? (
                <>
                  <div className="quest-card-ask">
                    Stage {saga.stage + 1} of {theme.stages.length} — {stage.desc}
                  </div>
                  <div className="quest-progress">
                    <div className="quest-progress-bar">
                      <div
                        className="quest-progress-fill"
                        style={{
                          width: `${
                            Math.min(1, saga.progress / stage.goal) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="quest-progress-num">
                      {Math.min(saga.progress, stage.goal).toLocaleString()} /{" "}
                      {stage.goal.toLocaleString()}
                    </span>
                  </div>
                  <div className="quest-reward-line">
                    {isFinalStage(saga) ? (
                      <span className="quest-reward-chest tier-legendary">
                        {CHEST_LABEL.legendary}
                      </span>
                    ) : (
                      <>
                        <span className="quest-reward-gold">
                          <GameIcon name="gold" /> {stage.gold}
                        </span>
                        {stage.shards > 0 && (
                          <span className="quest-reward-shards">
                            {stage.shards} Soul Shards
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {saga.progress >= stage.goal && (
                    <div className="quest-card-actions">
                      <button
                        type="button"
                        className="quest-btn claim"
                        onClick={claimStage}
                      >
                        Claim
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="quest-card-ask">
                  Saga complete — a new tale begins on the 1st.
                </div>
              )}
            </div>
          </section>
          )}
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
/** "Found in …" under a slay bounty's ask. A bounty names a monster, so the
 *  card should also say where to hunt it — otherwise the only way to find out
 *  is to guess a dungeon. Renders nothing for the kinds that name a mode
 *  rather than a monster. */
function WhereLine({ notice }: { notice: QuestNotice }) {
  const where = questLocation(notice);
  if (!where) return null;
  return <div className="quest-card-where">Found in {where}</div>;
}

function RewardLine({ notice }: { notice: QuestNotice }) {
  return (
    <div className="quest-reward-line">
      <span className="quest-reward-gold">
        <GameIcon name="gold" /> {notice.gold}
      </span>
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
  const { title, gold, chestTier, contents, phase } = ceremony;
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
        <div className="quest-ceremony-title">{title}</div>
        {gold > 0 && <div className="quest-ceremony-gold">+{gold} gold</div>}
        <button
          type="button"
          className={`reward-chest${phase === "closed" ? "" : " opened"}`}
          onClick={() => phase === "closed" && onPhase("opening")}
          aria-label={`Open ${CHEST_LABEL[chestTier]}`}
        >
          <ChestSprite
            tier={chestTier}
            opening={phase !== "closed"}
            onOpened={() => onPhase("open")}
          />
          <span className="reward-chest-label">
            {phase === "closed"
              ? `Open ${CHEST_LABEL[chestTier]}`
              : CHEST_LABEL[chestTier]}
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
  if (entry.kind === "item_choice")
    return (
      <li className="reward-entry reward-unlock">
        <span style={{ color: RARITIES[entry.quality].color }}>
          A relic of your choosing
        </span>{" "}
        — pick one below
      </li>
    );
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
