// ============================================================================
// BookOverlay — the library's open-book ceremony. A tapped spine becomes a
// tome that scales up and swings its cover open (CSS 3D, CombineCeremony's
// timeout-phase pattern), revealing two-page spreads. Page turns animate a
// real flipping leaf (front face = the outgoing right page, back face = the
// incoming left page) over the static pages beneath. Monster pages reuse the
// bestiary's 3-tier reveal; the boss showcase closes every dungeon book; the
// items book pages hand off to ItemDetailPane. Defeated monsters bubble up
// via onOpenUnit — the screen renders the existing UnitDetail on top.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { ITEM_LINES, makeItemKey } from "@/data/items";
import { renderPortrait } from "@/engine/Renderer";
import { ItemIcon } from "@/components/ItemIcon";
import { playSfx } from "@/audio/sfx";
import type { BestiaryEntry, PlayerSave } from "@/state/persistence";
import { ownsLine, shadeHex, type BookDef, type BookPage } from "./books";
import { ItemDetailPane } from "./ItemDetailPane";
import { drawSplash } from "./splashArt";

// --- the bestiary 3-tier reveal (same contract the flat compendium had) -----

type RevealTier = "undiscovered" | "encountered" | "defeated";

function tierOf(entry: BestiaryEntry | undefined): RevealTier {
  if (entry?.defeated) return "defeated";
  if (entry?.encountered) return "encountered";
  return "undiscovered";
}

/** Silhouette fills for the two hidden tiers (drawn over the card art bg). */
const SILHOUETTE: Record<Exclude<RevealTier, "defeated">, string> = {
  undiscovered: "#0d0b08",
  encountered: "#4a4438",
};

// Portrait bitmap sizes; CSS scales the canvas to the card, so these just set
// resolution (96 matches the old flat grid — crisp at every card width).
const ART = 96;
const BOSS_ART = 120;

/** How long the cover-open transition waits behind the scale-in. */
const PULL_MS = 380;
const CLOSE_MS = 450;
/** Must match the .book-flip keyframes duration in styles.css. */
const FLIP_MS = 560;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function Portrait({
  defId,
  tier,
  size,
}: {
  defId: string;
  tier: RevealTier;
  size: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    renderPortrait(
      ctx,
      defId,
      size,
      tier === "defeated" ? undefined : { silhouette: SILHOUETTE[tier] }
    );
  }, [defId, tier, size]);
  return <canvas ref={ref} width={size} height={size} className="card-canvas" />;
}

/** An oil-vignette painting, sized to whatever box CSS gives it. Painted once
 *  per book (the splash PRNG is seeded, so repaints are identical anyway). */
function SplashArt({ bookId, className }: { bookId: string; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth || 200;
    const h = canvas.clientHeight || 130;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSplash(ctx, bookId, w, h);
  }, [bookId]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

function MonsterCard({
  defId,
  tier,
  onOpen,
}: {
  defId: string;
  tier: RevealTier;
  onOpen: (defId: string) => void;
}) {
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];
  const revealed = tier === "defeated";
  return (
    <button
      type="button"
      className={`comp-card book-card ${tier}`}
      style={{ borderColor: revealed ? rarity.color : "#8a6a3a55" }}
      onClick={revealed ? () => onOpen(defId) : undefined}
      disabled={!revealed}
      aria-label={
        revealed
          ? `${def.name} — view lore`
          : tier === "encountered"
            ? `${def.name} — defeat one to unlock`
            : "Undiscovered"
      }
    >
      <Portrait defId={defId} tier={tier} size={ART} />
      <span className="card-name">{tier === "undiscovered" ? "???" : def.name}</span>
      {!revealed && (
        <span className="comp-hint-tag">{tier === "encountered" ? "Sighted" : "Unknown"}</span>
      )}
    </button>
  );
}

function ItemCard({
  lineId,
  owned,
  onPick,
}: {
  lineId: string;
  owned: boolean;
  onPick: (lineId: string) => void;
}) {
  const line = ITEM_LINES[lineId];
  return (
    <button
      type="button"
      className="comp-card book-card item defeated"
      style={{ borderColor: line.dungeonId ? "#f5b301" : "#8a6a3a55" }}
      onClick={() => onPick(lineId)}
      aria-label={`${line.name} — view details`}
    >
      <ItemIcon itemKey={makeItemKey(lineId, "rare", 1)} size={ART - 20} hideStars />
      <span className="card-name">{line.name}</span>
      <span className="comp-hint-tag">{owned ? "Owned ✓" : "Unfound"}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function PageView({
  page,
  save,
  pageNo,
  onOpenUnit,
  onPickItem,
}: {
  page: BookPage;
  save: PlayerSave;
  pageNo?: number;
  onOpenUnit: (defId: string) => void;
  onPickItem: (lineId: string) => void;
}) {
  if (page.boss) {
    const tier = tierOf(save.bestiary[page.boss.defId]);
    const def = getUnitDef(page.boss.defId);
    const revealed = tier === "defeated";
    return (
      <div className="book-pagebody">
        <h4 className="book-page-heading">{page.heading}</h4>
        <button
          type="button"
          className={`book-bossbox ${tier}`}
          onClick={revealed ? () => onOpenUnit(page.boss!.defId) : undefined}
          disabled={!revealed}
          aria-label={revealed ? `${def.name} — view lore` : "Boss not yet slain"}
        >
          <Portrait defId={page.boss.defId} tier={tier} size={BOSS_ART} />
          <span className="book-boss-name">{tier === "undiscovered" ? "???" : def.name}</span>
          <span className="book-boss-tag">
            {revealed ? "Slain — lore recorded" : tier === "encountered" ? "Sighted" : "Awaits below"}
          </span>
        </button>
        {pageNo != null && <span className="book-pgno">{pageNo}</span>}
      </div>
    );
  }
  return (
    <div className="book-pagebody">
      {page.heading && <h4 className="book-page-heading">{page.heading}</h4>}
      {page.art && (
        <div className="book-splash-plate">
          <SplashArt bookId={page.art} className="book-splash-canvas" />
        </div>
      )}
      {page.entries.length > 0 && (
        <div className="book-cards">
          {page.entries.map((e) =>
            e.kind === "monster" ? (
              <MonsterCard
                key={e.defId}
                defId={e.defId}
                tier={tierOf(save.bestiary[e.defId])}
                onOpen={onOpenUnit}
              />
            ) : (
              <ItemCard
                key={e.lineId}
                lineId={e.lineId}
                owned={ownsLine(save, e.lineId)}
                onPick={onPickItem}
              />
            )
          )}
        </div>
      )}
      {page.rareTag && <div className="book-rare-tag">{page.rareTag}</div>}
      {page.note && <p className="book-page-note">{page.note}</p>}
      {pageNo != null && <span className="book-pgno">{pageNo}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

type Phase = "enter" | "pull" | "open" | "closing";
interface Flip {
  dir: 1 | -1;
  from: number;
  to: number;
}

export function BookOverlay({
  book,
  save,
  keysSuspended = false,
  onOpenUnit,
  onClose,
}: {
  book: BookDef;
  save: PlayerSave;
  /** True while a UnitDetail is stacked on top — its own Escape handler closes
   *  it, and ours must not also close the book on the same keypress. */
  keysSuspended?: boolean;
  onOpenUnit: (defId: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("enter");
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [itemSel, setItemSel] = useState<string | null>(null);
  const closingRef = useRef(false);
  // Swipe-to-turn bookkeeping: where the pointer went down on the spread, and
  // whether that gesture became a swipe (so the click it ends with is eaten
  // instead of opening whatever card it landed on).
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  // Backdrop guard: only a press that STARTED on the dim backdrop may close
  // the book — a page-drag released past the tome's edge (or a click bubbling
  // out of the stacked item pane) resolves its click on the root and must not.
  const downOnBackdropRef = useRef(false);

  const beginClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    playSfx("bookClose");
    setPhase("closing");
    window.setTimeout(onClose, CLOSE_MS);
  };

  // Entrance timeline: scale in off the shelf, then the cover swings.
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("pull"), 20);
    const t2 = window.setTimeout(() => {
      playSfx("bookOpen");
      setPhase("open");
    }, PULL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Escape closes the item pane first, then the book (DungeonMapSheet pattern).
  const itemSelRef = useRef(itemSel);
  itemSelRef.current = itemSel;
  const suspendedRef = useRef(keysSuspended);
  suspendedRef.current = keysSuspended;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || suspendedRef.current) return;
      if (itemSelRef.current) {
        playSfx("uiClose");
        setItemSel(null);
      } else {
        beginClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A stacked UnitDetail removes modal-open when it unmounts (its own
  // cleanup); restore the scroll freeze while the book is still open.
  useEffect(() => {
    if (!keysSuspended) document.body.classList.add("modal-open");
  }, [keysSuspended]);

  const spreads = book.spreads;
  const doFlip = (dir: 1 | -1) => {
    if (flip || phase !== "open") return;
    const to = idx + dir;
    if (to < 0 || to >= spreads.length) return;
    playSfx("pageFlip");
    setFlip({ dir, from: idx, to });
    window.setTimeout(() => {
      setIdx(to);
      setFlip(null);
    }, FLIP_MS);
  };

  // Static pages under the flipping leaf: during a forward flip the left page
  // stays on the OLD spread while the right already shows the NEW one (the
  // leaf covers the seam mid-turn); mirrored for backward.
  const leftPage = flip ? spreads[flip.dir === 1 ? flip.from : flip.to].left : spreads[idx].left;
  const rightPage = flip ? spreads[flip.dir === 1 ? flip.to : flip.from].right : spreads[idx].right;
  const leafFront = flip ? spreads[flip.dir === 1 ? flip.from : flip.to].right : null;
  const leafBack = flip ? spreads[flip.dir === 1 ? flip.to : flip.from].left : null;

  const openUnit = (defId: string) => {
    playSfx("compendiumReveal");
    onOpenUnit(defId);
  };
  const pickItem = (lineId: string) => {
    playSfx("uiSelect");
    setItemSel(lineId);
  };

  const pageProps = { save, onOpenUnit: openUnit, onPickItem: pickItem };

  /** Mostly-horizontal drag of ≥44px across the spread turns the page. */
  const SWIPE_PX = 44;
  const onSpreadDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    swipedRef.current = false;
  };
  const onSpreadUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipedRef.current = true;
      doFlip(dx < 0 ? 1 : -1);
    }
  };
  const onSpreadClickCapture = (e: React.MouseEvent) => {
    if (swipedRef.current) {
      swipedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className={`detail-overlay book-ceremony phase-${phase}`}
      style={
        {
          "--leather": book.leather,
          "--leather-dk": shadeHex(book.leather, -45),
          "--leather-lt": shadeHex(book.leather, 30),
          "--accent": book.accent,
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (downOnBackdropRef.current) beginClose();
        downOnBackdropRef.current = false;
      }}
    >
      <div className="book-tome" role="dialog" aria-label={book.title} onClick={(e) => e.stopPropagation()}>
        <div
          className="book-spread"
          onPointerDown={onSpreadDown}
          onPointerUp={onSpreadUp}
          onPointerCancel={() => (dragRef.current = null)}
          onClickCapture={onSpreadClickCapture}
        >
          <div className="book-page left">
            <PageView page={leftPage} pageNo={idx * 2 + 1} {...pageProps} />
          </div>
          <div className="book-page right">
            <PageView page={rightPage} pageNo={idx * 2 + 2} {...pageProps} />
          </div>
          {flip && leafFront && leafBack && (
            <div className={`book-leaf ${flip.dir === 1 ? "next" : "prev"}`} aria-hidden>
              <div className="book-leaf-face front">
                <PageView page={leafFront} {...pageProps} />
              </div>
              <div className="book-leaf-face back">
                <PageView page={leafBack} {...pageProps} />
              </div>
            </div>
          )}
        </div>

        <div className="book-cover" aria-hidden={phase === "open"}>
          <div className="book-cover-face front">
            <SplashArt bookId={book.id} className="book-cover-art" />
            <span className="book-cover-scrim" aria-hidden />
            <span className="book-cover-title">{book.title}</span>
          </div>
          <div className="book-cover-face back" />
        </div>

        <button className="detail-close book-close" onClick={beginClose} aria-label="Close the book">
          ✕
        </button>
        <div className="book-nav">
          <button type="button" onClick={() => doFlip(-1)} disabled={idx === 0 || !!flip} aria-label="Previous pages">
            ‹
          </button>
          <span className="book-nav-count">
            {idx + 1} / {spreads.length}
          </span>
          <button
            type="button"
            onClick={() => doFlip(1)}
            disabled={idx === spreads.length - 1 || !!flip}
            aria-label="Next pages"
          >
            ›
          </button>
        </div>
      </div>

      {itemSel && (
        <ItemDetailPane
          lineId={itemSel}
          save={save}
          onClose={() => {
            playSfx("uiClose");
            setItemSel(null);
          }}
        />
      )}
    </div>
  );
}
