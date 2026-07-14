import { useEffect, useRef, useState } from "react";
import { HubScreen } from "@/screens/HubScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { CompendiumScreen } from "@/screens/CompendiumScreen";
import { DungeonWall } from "@/components/DungeonWall";
import { DungeonVines } from "@/components/DungeonVines";
import { DungeonGate } from "@/components/DungeonGate";
import { SettingsPanel } from "@/components/SettingsPanel";
import { QuestBoardSheet } from "@/components/QuestBoardSheet";
import { GoldPill, ShardPill } from "@/components/CurrencyPills";
import type { BattleMode } from "@/hooks/useBattleEngine";
import { playSfx } from "@/audio/sfx";

interface Props {
  /** Launch a battle in the given mode (from a Home mode card). Depths passes
   *  the floor picked in the floor sheet + the chosen dungeon id. */
  onBattle: (mode: BattleMode, floor?: number, dungeonId?: string) => void;
  /** Open Grubbins' shop — a full-screen App view, like Battle (not a sheet). */
  onOpenShop: () => void;
  /** Open the Blacksmith's forge — the items home, a full-screen App view. */
  onOpenBlacksmith: () => void;
}

// Page order: Collection (0) ← Home (1) → Compendium (2). Home is the landing.
const PAGES = ["Collection", "Home", "Compendium"] as const;

/**
 * Horizontal swipe pager built on native CSS scroll-snap (buttery touch on
 * mobile, near-zero JS). On desktop, native scroll only responds to trackpad /
 * tabs, so we add mouse click-and-drag to swipe: snap is disabled during the
 * drag and restored on release, snapping to the nearest page.
 *
 * Battle is NOT a page here — it's a full-screen overlay owned by App, so the
 * pager never fights the finger mid-fight.
 */
export function AppShell({ onBattle, onOpenShop, onOpenBlacksmith }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hallRef = useRef<HTMLDivElement>(null);
  // Pending "restore scroll-snap" timeout from the last drag (see endDrag).
  const snapTimer = useRef<number | null>(null);
  const [page, setPage] = useState(1); // land on Home (center)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  // Live drag state in a ref so pointer handlers never trigger re-renders.
  const drag = useRef({
    pending: false,
    active: false,
    startX: 0,
    startLeft: 0,
    moved: false,
  });

  // Pan the dungeon "hall" 1:1 with the pager so swiping feels like walking down
  // the corridor — the gate lives at the Home position; swipe away to plain brick.
  const syncHall = (scrollLeft: number) => {
    if (hallRef.current)
      hallRef.current.style.transform = `translate3d(${-scrollLeft}px,0,0)`;
  };

  // Jump to Home on mount without animating (direct scrollLeft, not scrollTo).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = track.clientWidth;
    syncHall(track.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive the active page from scroll position for the tab bar, and pan the hall.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    syncHall(track.scrollLeft);
    const idx = Math.round(track.scrollLeft / (track.clientWidth || 1));
    setPage((p) => (p === idx ? p : idx));
  };

  const goTo = (idx: number) => {
    const track = trackRef.current;
    if (track)
      track.scrollTo({ left: track.clientWidth * idx, behavior: "smooth" });
  };

  // --- Desktop click-and-drag to swipe. Touch/pen keep native scroll-snap. ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return; // touch/pen: let native scroll handle it
    const d = drag.current;
    d.moved = false;
    d.active = false;
    d.pending = false;
    const track = trackRef.current;
    if (!track) return;
    // Elements with their own horizontal drag (deck reorder) or a modal own the
    // gesture — don't hijack it for a page swipe.
    if ((e.target as HTMLElement).closest(".deck-slot, .detail-overlay")) return;
    // Arm a *potential* drag only — do NOT capture the pointer or disable snap
    // yet. Capturing on press redirects the trailing click to the pager and
    // steals it from buttons/cards. We commit to a drag in onPointerMove, once
    // the pointer actually travels past the threshold.
    d.pending = true;
    d.startX = e.clientX;
    d.startLeft = track.scrollLeft;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.pending && !d.active) return;
    const track = trackRef.current;
    if (!track) return;
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) < 6) return; // still might be a click — leave it alone
      // Past the threshold: commit to a drag. Now it's safe to capture + free
      // the scroll (a real swipe, not a click).
      d.active = true;
      d.moved = true;
      track.classList.add("dragging");
      // Cancel a pending snap-restore from a previous drag so it can't fire
      // mid-drag and yank the scroll back (the edge "hiccup").
      if (snapTimer.current !== null) {
        clearTimeout(snapTimer.current);
        snapTimer.current = null;
      }
      track.style.scrollSnapType = "none";
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — drag still works locally */
      }
    }
    // Clamp to the valid range so overscrolling past the first/last page doesn't
    // fight the browser's own clamp.
    const max = track.scrollWidth - track.clientWidth;
    track.scrollLeft = Math.max(0, Math.min(max, d.startLeft - dx));
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    d.pending = false;
    if (!d.active) return; // never became a drag — a plain click; leave it alone
    d.active = false;
    const track = trackRef.current;
    if (!track) return;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    track.classList.remove("dragging");
    // Snap to a page: a quarter-page drag flips to the neighbour, else it settles
    // back to where it started.
    const w = track.clientWidth || 1;
    const startPage = Math.round(d.startLeft / w);
    const dragged = track.scrollLeft - d.startLeft;
    let target = startPage;
    if (dragged > w * 0.25) target = startPage + 1;
    else if (dragged < -w * 0.25) target = startPage - 1;
    target = Math.max(0, Math.min(PAGES.length - 1, target));
    track.scrollTo({ left: w * target, behavior: "smooth" });
    // Restore mandatory snap once the settle animation finishes — tracked so the
    // next drag can cancel it before it fires mid-gesture.
    snapTimer.current = window.setTimeout(() => {
      if (trackRef.current) trackRef.current.style.scrollSnapType = "";
      snapTimer.current = null;
    }, 400);
  };

  // Suppress the click that trails a real drag, so a swipe never activates a card.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div className="app-shell">
      {/* Wallet + settings gear. Shown on the HOME page only (per the design) —
          faded out (not unmounted) elsewhere so a mid-swipe doesn't pop
          elements in and out. (Items live behind the Forge FAB on Home.) */}
      <div className={`top-right-cluster${page === 1 ? "" : " off-home"}`}>
        <ShardPill />
        <GoldPill />
        <button
          type="button"
          className="settings-btn"
          aria-label="Settings"
          onClick={() => { playSfx("uiOpen"); setSettingsOpen(true); }}
        >
          ⚙️
        </button>
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {questsOpen && (
        <QuestBoardSheet onClose={() => { playSfx("uiClose"); setQuestsOpen(false); }} />
      )}
      <div className="shell-bg" aria-hidden="true">
        {/* One continuous hall (3 pages wide) panned 1:1 with the pager. Brick
            spans it all; the gate lives in the middle (Home) third. */}
        <div className="hall" ref={hallRef}>
          <DungeonWall />
          <div className="hall-third" style={{ left: "0%" }}>
            <DungeonVines />
          </div>
          <div className="hall-third" style={{ left: "33.3333%" }}>
            <DungeonVines />
            <DungeonGate />
          </div>
          <div className="hall-third" style={{ left: "66.6667%" }}>
            <DungeonVines />
          </div>
        </div>
      </div>
      <div
        className="pager"
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        <section className="pager-page" aria-label="Collection">
          <HubScreen />
        </section>
        <section className="pager-page" aria-label="Home">
          <HomeScreen
            onBattle={onBattle}
            onOpenBlacksmith={onOpenBlacksmith}
            onOpenShop={onOpenShop}
            onOpenQuests={() => { playSfx("uiOpen"); setQuestsOpen(true); }}
          />
        </section>
        <section className="pager-page" aria-label="Compendium">
          <CompendiumScreen />
        </section>
      </div>
      <nav className="pager-nav" aria-label="Pages">
        {PAGES.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`pager-tab${page === i ? " active" : ""}`}
            aria-current={page === i}
            onClick={() => { playSfx("uiTap"); goTo(i); }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
