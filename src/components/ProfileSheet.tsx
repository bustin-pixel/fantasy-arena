// ============================================================================
// ProfileSheet — edit the profile name + icon. Opens from the Home plate.
// Reuses the detail-overlay modal pattern (AppShell exempts it from
// page-swipe drags). Icon taps apply INSTANTLY (the plate updates behind the
// sheet); the name commits once, on any close path (Done / ✕ / overlay /
// Escape / Enter) — sanitize runs at that single commit point, and an
// emptied field reverts to the previous name.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { rarityRank } from "@/data/rarities";
import { MAX_USERNAME_LENGTH } from "@/state/persistence";
import { earnedTitleIds, titleLabel } from "@/meta/bestiaryRewards";
import { useGameState } from "@/state/GameStateContext";
import { AvatarPortrait } from "@/components/ProfilePlate";
import { playSfx } from "@/audio/sfx";

interface Props {
  onClose: () => void;
}

export function ProfileSheet({ onClose }: Props) {
  const { save, setUsername, setAvatar, setTitle } = useGameState();
  const [draft, setDraft] = useState(save.username);

  // Titles are DERIVED (boss first-kills + a complete bestiary), never stored —
  // only the equipped choice is. Recompute whenever the underlying progress moves.
  const earnedTitles = useMemo(
    () => earnedTitleIds(save.bestiary, save.monsterKills),
    [save.bestiary, save.monsterKills]
  );

  // Every way out funnels through here so the name is never left uncommitted.
  const commitAndClose = () => {
    playSfx("uiClose");
    setUsername(draft);
    onClose();
  };

  // Close on Escape + freeze the background scroll, like the floor picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") commitAndClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Unlike the hub (a shop, rarest-first), a picker leads with what you can
  // actually wear: owned faces first, rarest-first within each group. Locked
  // faces stay visible below as unlock advertising (the bestiary trick).
  const rosterIds = useMemo(() => {
    const ownedFirst = (a: string, b: string) =>
      Number(!save.unlockedUnits.includes(a)) -
      Number(!save.unlockedUnits.includes(b));
    return [...DECKABLE_UNIT_IDS].sort(
      (a, b) =>
        ownedFirst(a, b) ||
        rarityRank(getUnitDef(b).rarity) - rarityRank(getUnitDef(a).rarity)
    );
  }, [save.unlockedUnits]);

  return (
    <div className="detail-overlay" onClick={commitAndClose}>
      <div
        className="detail-modal profile-sheet"
        role="dialog"
        aria-label="Edit profile"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="detail-close"
          onClick={commitAndClose}
          aria-label="Close"
        >
          ✕
        </button>
        <h3 className="profile-sheet-title">Your Profile</h3>

        <label className="profile-name-field">
          <span className="profile-field-label">Name</span>
          <input
            type="text"
            className="profile-name-input"
            value={draft}
            maxLength={MAX_USERNAME_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAndClose();
            }}
            placeholder={save.username}
          />
        </label>

        <span className="profile-field-label">Title</span>
        {earnedTitles.length === 0 ? (
          <p className="profile-title-empty">
            No titles yet — fell a dungeon boss to earn your first.
          </p>
        ) : (
          <div className="title-grid" role="listbox" aria-label="Choose a title">
            <button
              type="button"
              role="option"
              aria-selected={save.title === null}
              className={`title-cell${save.title === null ? " selected" : ""}`}
              onClick={() => { playSfx("uiSelect"); setTitle(null); }}
            >
              None
            </button>
            {earnedTitles.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={save.title === id}
                className={`title-cell${save.title === id ? " selected" : ""}`}
                onClick={() => { playSfx("uiSelect"); setTitle(id); }}
              >
                {titleLabel(id)}
              </button>
            ))}
          </div>
        )}

        <span className="profile-field-label">Icon</span>
        <div className="avatar-grid" role="listbox" aria-label="Choose an icon">
          {rosterIds.map((id) => {
            const locked = !save.unlockedUnits.includes(id);
            const selected = id === save.avatarId;
            const def = getUnitDef(id);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`avatar-cell${selected ? " selected" : ""}${
                  locked ? " locked" : ""
                }`}
                disabled={locked}
                onClick={() => { playSfx("uiSelect"); setAvatar(id); }}
                aria-label={locked ? `${def.name} (locked)` : def.name}
                title={locked ? `${def.name} — unlock to wear` : def.name}
              >
                <AvatarPortrait avatarId={id} size={56} />
                {locked && (
                  <span className="avatar-lock" aria-hidden="true">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="detail-footer">
          <button className="btn btn-gold" onClick={commitAndClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
