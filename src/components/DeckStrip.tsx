import { useEffect, useRef, useState } from "react";
import { getUnitDef } from "@/data/units";
import { RARITIES } from "@/data/rarities";
import { renderPortrait } from "@/engine/Renderer";
import { useSpriteEpoch } from "@/hooks/useSpriteEpoch";
import { MAX_DECK } from "@/utils/constants";

const DECK_ART = 46;
/** Pointer travel (px) before a press becomes a drag instead of a tap-to-inspect. */
const DRAG_THRESHOLD = 6;

/** The small unit sprite shown inside a filled deck slot. */
function DeckSlotArt({ defId }: { defId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spriteEpoch = useSpriteEpoch();
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) renderPortrait(ctx, defId, DECK_ART);
  }, [defId, spriteEpoch]);
  return (
    <canvas ref={ref} width={DECK_ART} height={DECK_ART} className="deck-slot-canvas" />
  );
}

interface Props {
  deck: string[];
  /** Called with the full reordered deck when a drag settles. */
  onReorder: (deck: string[]) => void;
  /** Called when a slot's Remove button is pressed to remove that unit. */
  onRemove: (id: string) => void;
  /** Called via the Info button (or a plain tap) to open the unit's detail panel. */
  onInspect: (id: string) => void;
}

/** Live gesture data kept in a ref so pointer handlers don't fight React state. */
interface Gesture {
  from: number;
  startX: number;
  startY: number;
  step: number; // distance between adjacent slot origins (slot width + gap)
  centers: number[]; // original center-x of each filled slot
  moved: boolean;
  over: number; // current target index
  pointerId: number;
}

/**
 * The current-warband strip. Filled slots can be dragged horizontally to
 * reorder deploy order (works with touch + mouse via pointer events); each
 * carries a Remove / Info button row, and a plain tap on the face also opens
 * the detail panel. Empty slots are inert placeholders.
 */
export function DeckStrip({ deck, onReorder, onRemove, onInspect }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number; dx: number } | null>(
    null
  );

  const beginDrag = (e: React.PointerEvent, index: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const slots = Array.from(
      strip.querySelectorAll<HTMLElement>(".deck-slot")
    ).slice(0, deck.length);
    const rects = slots.map((s) => s.getBoundingClientRect());
    gesture.current = {
      from: index,
      startX: e.clientX,
      startY: e.clientY,
      step: rects.length > 1 ? rects[1].left - rects[0].left : rects[0].width,
      centers: rects.map((r) => r.left + r.width / 2),
      moved: false,
      over: index,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture unsupported / pointer already gone — drag still works locally
    }
  };

  const moveDrag = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    // Insertion index from pointer x, in the strip's original coordinate space.
    g.over = Math.max(
      0,
      Math.min(deck.length - 1, Math.round((e.clientX - g.centers[0]) / g.step))
    );
    setDrag({ from: g.from, over: g.over, dx });
  };

  const endDrag = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    try {
      e.currentTarget.releasePointerCapture(g.pointerId);
    } catch {
      // pointer may already be released
    }
    if (!g.moved) {
      onInspect(deck[g.from]); // a tap (no drag) opens the detail panel
      return;
    }
    if (g.over !== g.from) {
      const next = deck.slice();
      const [moved] = next.splice(g.from, 1);
      next.splice(g.over, 0, moved);
      onReorder(next);
    }
  };

  const cancelDrag = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    try {
      e.currentTarget.releasePointerCapture(g.pointerId);
    } catch {
      // ignore
    }
  };

  const step = gesture.current?.step ?? 0;

  return (
    <div className="deck-strip" aria-label="Current deck" ref={stripRef}>
      {Array.from({ length: MAX_DECK }).map((_, slot) => {
        const id = deck[slot];
        if (!id) {
          return (
            <div key={`empty-${slot}`} className="deck-slot empty">
              <span className="deck-slot-num">{slot + 1}</span>
              <span className="deck-slot-name">Empty</span>
            </div>
          );
        }
        const def = getUnitDef(id);
        const rarity = RARITIES[def.rarity];

        // Visual shift: the dragged slot follows the pointer; the slots it has
        // passed make room by sliding one step toward its origin.
        const dragging = drag?.from === slot;
        let tx = 0;
        if (drag) {
          if (dragging) tx = drag.dx;
          else if (drag.from < drag.over && slot > drag.from && slot <= drag.over)
            tx = -step;
          else if (drag.from > drag.over && slot < drag.from && slot >= drag.over)
            tx = step;
        }

        return (
          // A div-with-button-role (not <button>) so the ✕ remove control can
          // be a real nested <button> — buttons can't contain buttons.
          <div
            key={id}
            role="button"
            tabIndex={0}
            className={`deck-slot filled${dragging ? " dragging" : ""}`}
            style={{
              borderColor: rarity.color,
              transform: dragging
                ? `translateX(${tx}px) scale(1.04)`
                : tx
                ? `translateX(${tx}px)`
                : undefined,
              // Only the make-room slides animate; the dragged slot tracks the
              // finger 1:1, and the resting state snaps (no post-drop wobble).
              transition: drag && !dragging ? "transform 0.18s ease" : "none",
              zIndex: dragging ? 5 : undefined,
            }}
            onPointerDown={(e) => beginDrag(e, slot)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onInspect(id);
              }
            }}
            title={`Tap for details · drag to reorder ${def.name}`}
          >
            <span className="deck-slot-num">{slot + 1}</span>
            <DeckSlotArt defId={id} />
            <span className="deck-slot-name">{def.name}</span>
            <span className="deck-slot-rarity" style={{ color: rarity.color }}>
              {rarity.label}
            </span>
            {/* Presses stop here so the buttons never start a slot drag/inspect. */}
            <div
              className="deck-slot-actions"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="deck-slot-btn remove"
                aria-label={`Remove ${def.name}`}
                onClick={() => onRemove(id)}
              >
                Remove
              </button>
              <button
                type="button"
                className="deck-slot-btn"
                aria-label={`${def.name} details`}
                onClick={() => onInspect(id)}
              >
                Info
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
