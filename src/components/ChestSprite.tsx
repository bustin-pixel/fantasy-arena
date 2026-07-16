// ============================================================================
// ChestSprite — the React reward-ceremony chest (results-screen pop-up). The
// drawing itself lives in assets/chestArt.ts (shared with the on-floor chest in
// Renderer.ts); this component owns the dpr-aware canvas, the opening timeline,
// and the SFX voiced at the matching visual beats.
// ============================================================================

import { useEffect, useRef } from "react";
import type { ChestTier } from "@/meta/economy";
import {
  drawChest,
  spawnSparkles,
  OPEN_AT,
  SPARKLE_MS,
  VIEW_W,
  VIEW_H,
  type Sparkle,
} from "@/assets/chestArt";
import { playSfx } from "@/audio/sfx";

interface Props {
  tier: ChestTier;
  /** Flips false→true exactly once; starts the opening animation. */
  opening: boolean;
  /** Fired once, the moment the lid lands fully open (reveal beat). */
  onOpened?: () => void;
  /** CSS pixel width; height follows the sprite's aspect. */
  width?: number;
}

/** Creak pitch per tier (dragon is a heavier lid). */
const CREAK_RATE: Record<ChestTier, number> = {
  wooden: 1, silver: 1.08, gold: 1.15, arcane: 1.2, dragon: 0.85,
};

/** Extra reveal flavor layered on the shared chestOpen jingle (wooden stays
 *  bare — the plain tier should feel plain). */
const REVEAL_EXTRA: Partial<Record<ChestTier, () => void>> = {
  silver: () => playSfx("chestShine"),
  gold: () => playSfx("coinShower"),
  arcane: () => playSfx("arcaneWarp"),
  dragon: () => playSfx("roar", 0.75),
};

export function ChestSprite({ tier, opening, onOpened, width = 104 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openedRef = useRef(false);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const height = Math.round((width * VIEW_H) / VIEW_W);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const scale = (width * dpr) / VIEW_W;

    const setup = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    };

    if (!opening) {
      openedRef.current = false;
      setup();
      drawChest(ctx, tier, 0, []);
      return;
    }

    // --- opening timeline ---------------------------------------------------
    playSfx("chestCreak", CREAK_RATE[tier]);
    const start = performance.now();
    let revealPlayed = false;
    let sparkles: Sparkle[] = [];
    let raf = 0;

    const frame = (now: number) => {
      const t = now - start;

      if (!revealPlayed && t >= OPEN_AT) {
        revealPlayed = true;
        playSfx("chestOpen", CREAK_RATE[tier]);
        REVEAL_EXTRA[tier]?.();
        sparkles = spawnSparkles(tier, t);
        if (!openedRef.current) {
          openedRef.current = true;
          onOpenedRef.current?.();
        }
      }

      setup();
      drawChest(ctx, tier, t, sparkles);

      // Keep animating through the sparkle tail, then rest on the final frame.
      if (t < OPEN_AT + SPARKLE_MS) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tier, opening, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="chest-sprite"
      style={{ width, height }}
      aria-hidden
    />
  );
}
