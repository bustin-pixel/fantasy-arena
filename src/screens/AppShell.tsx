import { useEffect, useRef, useState } from "react";
import { HubScreen } from "@/screens/HubScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { CompendiumScreen } from "@/screens/CompendiumScreen";
import type { BattleMode } from "@/hooks/useBattleEngine";

interface Props {
  /** Launch a battle in the given mode (from a Home mode card). */
  onBattle: (mode: BattleMode) => void;
}

// Page order: Collection (0) ← Home (1) → Compendium (2). Home is the landing.
const PAGES = ["Collection", "Home", "Compendium"] as const;

/**
 * Horizontal swipe pager built on native CSS scroll-snap (buttery on mobile,
 * near-zero JS). Battle is NOT a page here — it's a full-screen overlay owned by
 * App, so the pager never fights the finger mid-fight.
 */
export function AppShell({ onBattle }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1); // land on Home (center)

  // Jump to Home on mount without animating (direct scrollLeft, not scrollTo).
  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = track.clientWidth;
  }, []);

  // Derive the active page from scroll position for the tab bar.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const idx = Math.round(track.scrollLeft / (track.clientWidth || 1));
    setPage((p) => (p === idx ? p : idx));
  };

  const goTo = (idx: number) => {
    const track = trackRef.current;
    if (track)
      track.scrollTo({ left: track.clientWidth * idx, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <div className="pager" ref={trackRef} onScroll={onScroll}>
        <section className="pager-page" aria-label="Collection">
          <HubScreen />
        </section>
        <section className="pager-page" aria-label="Home">
          <HomeScreen onBattle={onBattle} />
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
            onClick={() => goTo(i)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
