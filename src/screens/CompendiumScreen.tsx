// ============================================================================
// CompendiumScreen — the Grand Athenaeum. The bestiary is a candlelit library:
// eleven tomes on two walnut shelves (the nine dungeons down the gate chain,
// the Heroes of the Arena, and the Arms & Relics catalog). Tapping a spine
// runs the BookOverlay ceremony; gated dungeons sit chained shut and rattle
// with the gate hint instead. Reveal tiers, UnitDetail, and the save's
// bestiary map are unchanged — this screen only re-dresses how they're
// browsed (books.ts builds the shelf from the same data the old flat grid
// flattened away).
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { UnitDetail } from "@/components/UnitDetail";
import { buildBooks, shadeHex, type BookDef } from "@/components/compendium/books";
import { BookOverlay } from "@/components/compendium/BookOverlay";
import { playSfx } from "@/audio/sfx";

/** Spine heights (px) walked in shelf order — an uneven row reads as a real
 *  shelf, not a bar chart. */
const SPINE_HEIGHTS = [128, 116, 134, 110, 124, 120, 132, 126, 114, 138, 122, 130, 118];
/** Books per shelf row. */
const ROW_SPLIT = 6;

function BookSpine({
  book,
  height,
  onOpen,
  onRattle,
}: {
  book: BookDef;
  height: number;
  onOpen: (book: BookDef) => void;
  onRattle: (book: BookDef, el: HTMLButtonElement) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className={`shelf-book${book.locked ? " locked" : ""}`}
      style={
        {
          "--leather": book.leather,
          "--leather-dk": shadeHex(book.leather, -45),
          "--leather-lt": shadeHex(book.leather, 30),
          "--accent": book.accent,
          "--h": `${height}px`,
        } as React.CSSProperties
      }
      onClick={() => (book.locked ? ref.current && onRattle(book, ref.current) : onOpen(book))}
      aria-label={
        book.locked ? `${book.title} — locked. ${book.gateHint}` : `${book.title} — open the book`
      }
    >
      <span className="shelf-book-glyph" aria-hidden>
        {book.glyph}
      </span>
      <span className="shelf-book-title">{book.title}</span>
      {book.locked ? (
        <>
          <span className="shelf-book-chains" aria-hidden />
          <span className="shelf-book-lock" aria-hidden>
            🔒
          </span>
        </>
      ) : (
        book.progress && (
          <span className="shelf-book-plaque">
            {book.progress.done}/{book.progress.total}
          </span>
        )
      )}
    </button>
  );
}

export function CompendiumScreen() {
  const { save } = useGameState();
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [gateToast, setGateToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const books = useMemo(() => buildBooks(save), [save]);
  const openBook = openBookId ? books.find((b) => b.id === openBookId) : undefined;
  const rows = [books.slice(0, ROW_SPLIT), books.slice(ROW_SPLIT)];

  const handleOpen = (book: BookDef) => {
    playSfx("uiSelect");
    setOpenBookId(book.id);
  };
  const handleRattle = (book: BookDef, el: HTMLButtonElement) => {
    playSfx("chainRattle");
    // Restart the shake even on rapid re-taps.
    el.classList.remove("rattling");
    void el.offsetWidth;
    el.classList.add("rattling");
    setGateToast(book.gateHint ?? "Locked");
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setGateToast(null), 1900);
  };

  return (
    <div className="screen compendium">
      <header className="hub-header">
        <div>
          <h1 className="title">Compendium</h1>
          <p className="subtitle">The athenaeum — bestiary, heroes &amp; relics</p>
        </div>
      </header>

      <div className="athenaeum">
        {rows.map((row, r) => (
          <div className="athenaeum-row" key={r}>
            <div className="athenaeum-books">
              {row.map((book, i) => (
                <BookSpine
                  key={book.id}
                  book={book}
                  height={SPINE_HEIGHTS[(r * ROW_SPLIT + i) % SPINE_HEIGHTS.length]}
                  onOpen={handleOpen}
                  onRattle={handleRattle}
                />
              ))}
            </div>
            <div className="athenaeum-board" />
          </div>
        ))}
        {gateToast && <div className="gate-toast">🔒 {gateToast}</div>}
      </div>
      <p className="athenaeum-hint">
        Face a creature to sight it; slay one to record its lore.
      </p>

      {openBook && (
        <BookOverlay
          book={openBook}
          save={save}
          keysSuspended={!!openUnitId}
          onOpenUnit={setOpenUnitId}
          onClose={() => setOpenBookId(null)}
        />
      )}

      {openUnitId && (
        <UnitDetail
          defId={openUnitId}
          deck={save.deck}
          onToggle={() => {}}
          onClose={() => {
            playSfx("uiClose");
            setOpenUnitId(null);
          }}
          readonly
        />
      )}
    </div>
  );
}
