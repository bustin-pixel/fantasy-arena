// ============================================================================
// ProfilePlate — the player's identity card: avatar, name, battle record.
// Presentational and reusable on purpose: it reads nothing from context, so a
// future Arena pre-battle screen can render the AI opponent's plate ("Champion
// vs. Gravebane") by passing different props. With onEdit it renders as a
// tappable button (the Home plate); without, as a static card.
// ============================================================================

import { useEffect, useRef } from "react";
import { renderPortrait } from "@/engine/Renderer";
import { DEFAULT_AVATAR_ID, getAvatar } from "@/meta/avatars";

/** Round canvas-rendered profile icon. Unknown ids fall back to the default
 *  face rather than a blank circle (belt-and-braces — migrateSave should have
 *  sanitized already). */
export function AvatarPortrait({
  avatarId,
  size = 52,
}: {
  avatarId: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const avatar = getAvatar(avatarId) ?? getAvatar(DEFAULT_AVATAR_ID)!;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) renderPortrait(ctx, avatar.portraitDefId, size);
  }, [avatar.portraitDefId, size]);

  return (
    <span
      className="avatar-frame"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas ref={ref} width={size} height={size} className="avatar-canvas" />
    </span>
  );
}

interface Props {
  name: string;
  avatarId: string;
  wins: number;
  losses: number;
  /** Present = this is the player's own editable plate (adds the pencil hint,
   *  chevron, and button semantics). */
  onEdit?: () => void;
}

export function ProfilePlate({ name, avatarId, wins, losses, onEdit }: Props) {
  const total = wins + losses;
  const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);

  const body = (
    <>
      <AvatarPortrait avatarId={avatarId} />
      <span className="profile-plate-main">
        <span className="profile-name-row">
          <span className="profile-name">{name}</span>
          {onEdit && (
            <span className="profile-edit-hint" aria-hidden="true">
              ✎
            </span>
          )}
        </span>
        <span className="profile-stats">
          <span className="profile-stat">
            <b>{wins}</b> wins
          </span>
          <span className="profile-stat">
            <b>{losses}</b> losses
          </span>
          <span className="profile-stat">
            <b>{winRate}%</b> win rate
          </span>
        </span>
      </span>
      {onEdit && (
        <span className="profile-chevron" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );

  if (!onEdit) return <div className="profile-plate">{body}</div>;
  return (
    <button
      type="button"
      className="profile-plate editable"
      onClick={onEdit}
      aria-label={`Edit profile — ${name}`}
    >
      {body}
    </button>
  );
}
