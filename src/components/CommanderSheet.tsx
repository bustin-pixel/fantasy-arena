// ============================================================================
// CommanderSheet — the Commander's talent tree. Opens from the Home banner
// under the profile plate (the detail-overlay modal pattern, like the
// ProfileSheet). Three archetype branches; tapping a node SELECTS it (its
// description and Buy button land in the footer — mobile has no hover), a
// second tap on Buy spends the point via GameStateContext (the tree rules
// live in meta/commander). Respec is a two-tap confirm that costs gold.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import {
  BRANCH_IDS,
  BRANCHES,
  canBuyTalent,
  commanderLevelFromXp,
  commanderXpForNext,
  commanderXpIntoLevel,
  COMMANDER_LEVEL_CAP,
  pointsSpent,
  pointsSpentInBranch,
  RESPEC_GOLD,
  SPELL_UNLOCK_POINTS,
  SPELLS,
  spellsUnlocked,
  TALENTS,
  TALENTS_BY_ID,
  talentPointsForLevel,
  TIER_GATES,
} from "@/meta/commander";
import { playSfx } from "@/audio/sfx";

interface Props {
  onClose: () => void;
}

export function CommanderSheet({ onClose }: Props) {
  const { save, spendTalentPoint, respecTalents, setEquippedSpell } =
    useGameState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);

  const level = commanderLevelFromXp(save.commanderXp);
  const totalPoints = talentPointsForLevel(level);
  const spent = pointsSpent(save.talents);
  const free = totalPoints - spent;
  const xpInto = commanderXpIntoLevel(save.commanderXp);
  const xpNeed = commanderXpForNext(save.commanderXp);
  const unlockedSpells = useMemo(
    () => spellsUnlocked(save.talents),
    [save.talents]
  );

  const close = () => {
    playSfx("uiClose");
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = selectedId ? TALENTS_BY_ID[selectedId] : null;
  const selectedRanks = selected ? (save.talents[selected.id] ?? 0) : 0;
  const selectedBuyable = selected
    ? canBuyTalent(save.talents, selected.id, totalPoints)
    : false;
  const selectedGate = selected ? TIER_GATES[selected.tier] : 0;
  const selectedInBranch = selected
    ? pointsSpentInBranch(save.talents, selected.branch)
    : 0;

  const buySelected = () => {
    if (!selected || !selectedBuyable) return;
    playSfx("uiConfirm");
    spendTalentPoint(selected.id);
  };

  const doRespec = () => {
    if (!confirmRespec) {
      setConfirmRespec(true);
      return;
    }
    playSfx("coinSpend");
    respecTalents();
    setConfirmRespec(false);
    setSelectedId(null);
  };

  return (
    <div className="detail-overlay" onClick={close}>
      <div
        className="detail-modal commander-sheet"
        role="dialog"
        aria-label="Commander talents"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={close} aria-label="Close">
          ✕
        </button>
        <h3 className="profile-sheet-title">Commander</h3>

        {/* Level + XP into the current level (every battle feeds the pool). */}
        <div className="cmd-head">
          <span
            className={`cmd-level-chip${level >= COMMANDER_LEVEL_CAP ? " max" : ""}`}
          >
            Lv {level}
          </span>
          <div className="cmd-xp-bar" aria-hidden="true">
            <div
              className="cmd-xp-fill"
              style={{
                width: `${xpNeed === null ? 100 : (xpInto / xpNeed) * 100}%`,
              }}
            />
          </div>
          <span className="cmd-xp-label">
            {xpNeed === null ? "MAX" : `${xpInto} / ${xpNeed} XP`}
          </span>
        </div>
        <div className={`cmd-points${free > 0 ? " has-free" : ""}`}>
          {free > 0
            ? `${free} talent point${free === 1 ? "" : "s"} to spend`
            : totalPoints === 0
              ? "Win battles to earn talent points"
              : "All points spent"}
        </div>

        {/* The three branches. */}
        <div className="cmd-branches">
          {BRANCH_IDS.map((branchId) => {
            const branch = BRANCHES[branchId];
            const inBranch = pointsSpentInBranch(save.talents, branchId);
            const nodes = TALENTS.filter((t) => t.branch === branchId).sort(
              (a, b) => a.tier - b.tier || a.id.localeCompare(b.id)
            );
            return (
              <div
                key={branchId}
                className="cmd-branch"
                style={{ ["--branch" as string]: branch.color }}
              >
                <div className="cmd-branch-name">{branch.label}</div>
                <div className="cmd-branch-pts">{inBranch} pts</div>
                {nodes.map((t) => {
                  const ranks = save.talents[t.id] ?? 0;
                  const gateMet = inBranch >= TIER_GATES[t.tier];
                  const buyable = canBuyTalent(save.talents, t.id, totalPoints);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={[
                        "cmd-node",
                        t.keystone ? "keystone" : "",
                        ranks >= t.maxRanks ? "maxed" : "",
                        !gateMet ? "gated" : "",
                        buyable ? "buyable" : "",
                        selectedId === t.id ? "selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        playSfx("uiSelect");
                        setSelectedId(t.id);
                        setConfirmRespec(false);
                      }}
                      aria-label={`${t.name}, rank ${ranks} of ${t.maxRanks}`}
                    >
                      <span className="cmd-node-name">{t.name}</span>
                      <span className="cmd-node-ranks" aria-hidden="true">
                        {t.maxRanks > 1
                          ? "●".repeat(ranks) + "○".repeat(t.maxRanks - ranks)
                          : ranks > 0
                            ? "★"
                            : "☆"}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Selected-node detail + buy (the mobile "tooltip"). */}
        {selected && (
          <div className="cmd-detail">
            <div className="cmd-detail-name">
              {selected.keystone && (
                <span className="cmd-keystone-tag">KEYSTONE</span>
              )}
              {selected.name}{" "}
              <span className="cmd-detail-ranks">
                {selectedRanks}/{selected.maxRanks}
              </span>
            </div>
            <div className="cmd-detail-desc">{selected.description}</div>
            {!selectedBuyable && selectedInBranch < selectedGate ? (
              <div className="cmd-detail-gate">
                Requires {selectedGate} points in{" "}
                {BRANCHES[selected.branch].label}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-gold cmd-buy"
                disabled={!selectedBuyable}
                onClick={buySelected}
              >
                {selectedRanks >= selected.maxRanks
                  ? "Maxed"
                  : free <= 0
                    ? "No points"
                    : "Learn (1 pt)"}
              </button>
            )}
          </div>
        )}

        {/* Commander spell: pick among the branches invested deep enough. */}
        <span className="profile-field-label">Commander Spell</span>
        {unlockedSpells.length === 0 ? (
          <p className="profile-title-empty">
            Invest {SPELL_UNLOCK_POINTS} points in a branch to unlock its
            battle spell.
          </p>
        ) : (
          <div className="title-grid" role="listbox" aria-label="Choose a spell">
            {unlockedSpells.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={save.equippedSpell === id}
                className={`title-cell${save.equippedSpell === id ? " selected" : ""}`}
                onClick={() => {
                  playSfx("uiSelect");
                  setEquippedSpell(save.equippedSpell === id ? null : id);
                }}
                title={SPELLS[id].description}
              >
                {SPELLS[id].name}
              </button>
            ))}
          </div>
        )}

        <div className="detail-footer cmd-footer">
          <button
            type="button"
            className="btn cmd-respec"
            disabled={spent === 0 || save.gold < RESPEC_GOLD}
            onClick={doRespec}
          >
            {confirmRespec
              ? "Confirm respec?"
              : `Respec (${RESPEC_GOLD}g)`}
          </button>
          <button className="btn btn-gold" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
