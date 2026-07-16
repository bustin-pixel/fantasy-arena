// ============================================================================
// BiomeLayer — the atlas's painted terrain ("Painted Realm"). Renders as the
// FIRST child inside AtlasTrail's .atlas-paths svg, so everything here paints
// under the trail segments, which paint under the DOM nodes/marker.
//
// Two pieces:
//  1. GROUND — seamless nearest-biome terrain, rasterized ONCE to a tiny
//     offscreen canvas (1 viewBox unit = 1px) and embedded as an SVG <image>;
//     the browser's bilinear upscale melts the biome borders together. No SVG
//     filters (feGaussianBlur re-rasterizes during the atlas zoom transitions
//     and janks mobile). Uncharted/concealed regions paint fog, not their
//     biome — the terrain itself is part of the reveal.
//  2. DOODADS — the painted prop library (pines, tombstones, crystals, hero
//     pieces…), y-sorted for painter's-order overlap. A region's props fade
//     in when its unlock ceremony reveals it (opacity transition keyed off
//     concealedIds — reduced motion never sets a ceremony, so no motion).
//
// All placement math lives in data/atlasBiomes.ts (pure, tested); this file
// only draws.
// ============================================================================

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ATLAS_BIOMES,
  DOODAD_FOOT,
  FOG_GROUND,
  blendGround,
  floorDoodads,
  floorGroundSpots,
  hexToRgb,
  worldDoodads,
  worldGroundRegions,
  type DoodadKind,
  type DoodadPlacement,
} from "@/data/atlasBiomes";
import type { TrailNode } from "@/data/atlasLayout";

/** The one "hand" every doodad is drawn with (mockup pick: Painted Realm). */
const OUTLINE = "#3a2f22";
const OUTLINE_W = 0.3;

const clampByte = (x: number) => Math.max(0, Math.min(255, x));
/** Lightness shift on a hex color → rgb() string (sprites.ts convention). */
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clampByte(r + amt)},${clampByte(g + amt)},${clampByte(b + amt)})`;
}

/** Deterministic per-pixel grain so the ground reads painted, not flat. */
function grain(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Doodad library — colored fill + darker facet + shared outline, authored in
// a ~10-unit local box with the base on y=0 (ported from the picked mockup).
// ---------------------------------------------------------------------------

function thinStrokes(d: string, stroke?: string): ReactNode {
  return <path d={d} fill="none" stroke={stroke} strokeWidth={0.28} />;
}

/** Castle battlements: n merlon blocks along [x0,x1], sitting on y. */
function merlonPaths(
  x0: number,
  x1: number,
  y: number,
  n: number,
  fill: string
): ReactNode {
  const step = (x1 - x0) / (n * 2 - 1);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const mx = x0 + i * 2 * step;
        return (
          <path
            key={i}
            d={`M${mx.toFixed(2)},${y} h${step.toFixed(2)} v-0.62 h${(-step).toFixed(2)} Z`}
            fill={fill}
          />
        );
      })}
    </>
  );
}

/** A metal-bar portcullis gate: dark arched opening + 4 vertical and 2
 *  horizontal iron bars, centered on x=0 with the base on y=0. */
function portcullisPaths(w: number, topY: number): ReactNode {
  const bars: string[] = [];
  for (let i = 0; i < 4; i++) {
    const x = -w + ((i + 1) * 2 * w) / 5;
    // outer bars stop lower where the arch curves down
    const t = Math.abs(x) > w * 0.55 ? topY + 0.75 : topY + 0.18;
    bars.push(`M${x.toFixed(2)},-0.06 L${x.toFixed(2)},${t.toFixed(2)}`);
  }
  const wi = (w - 0.12).toFixed(2);
  return (
    <>
      <path
        d={`M${-w},0 L${-w},${topY + 1.1} Q${-w},${topY} 0,${topY} Q${w},${topY} ${w},${topY + 1.1} L${w},0 Z`}
        fill="#1d1813"
      />
      <path
        d={`${bars.join(" ")} M-${wi},-0.8 L${wi},-0.8 M-${wi},-1.75 L${wi},-1.75`}
        fill="none"
        stroke="#9aa3ad"
        strokeWidth={0.17}
      />
    </>
  );
}

function doodadInner(kind: DoodadKind, ground: string, tint = 0): ReactNode {
  switch (kind) {
    case "tuft":
      return (
        <path
          d="M-1,0 Q-1.3,-1.5 -1.9,-2.1 M0,0 Q0,-1.9 0.1,-2.5 M1,0 Q1.3,-1.5 1.9,-2.1"
          fill="none"
          stroke={shade(ground, -32 + tint)}
          strokeWidth={0.32}
        />
      );
    case "pebble":
      return (
        <>
          <ellipse rx={0.8} ry={0.5} fill={shade(ground, -24 + tint)} stroke="none" />
          <ellipse cx={-0.2} cy={-0.15} rx={0.32} ry={0.18} fill={shade(ground, -8 + tint)} stroke="none" />
        </>
      );
    case "rock":
      return (
        <>
          <path d="M-2,0 L-1.4,-1.6 L0.2,-2.1 L1.8,-1 L2.2,0 Z" fill="#8a8378" />
          <path
            d="M0.2,-2.1 L1.8,-1 L2.2,0 L0.4,0 Z"
            fill={shade("#8a8378", -28)}
            stroke="none"
          />
          <path
            d="M-1.4,-1.6 L0.2,-2.1 L-0.3,-1.1 L-1.1,-1.0 Z"
            fill={shade("#8a8378", 20)}
            stroke="none"
            opacity={0.85}
          />
          <path d="M0.3,-1.2 L0.7,-0.4" fill="none" strokeWidth={0.16} opacity={0.6} />
        </>
      );
    case "pine":
      return (
        <>
          <path d="M-0.4,0 h0.8 v-1.1 h-0.8 Z" fill="#6b4a2e" stroke="none" />
          <path
            d="M0,-7.2 L2.4,-3.3 L1.3,-3.3 L3,-0.6 L-3,-0.6 L-1.3,-3.3 L-2.4,-3.3 Z"
            fill={shade("#3f6b35", tint)}
          />
          <path
            d="M0,-7.2 L-2.4,-3.3 L-1.3,-3.3 L-3,-0.6 L0,-0.6 Z"
            fill={shade("#3f6b35", -24 + tint)}
            stroke="none"
          />
          <path
            d="M0,-7.2 L2.4,-3.3 L1.5,-3.3 Z"
            fill={shade("#3f6b35", 24 + tint)}
            stroke="none"
            opacity={0.8}
          />
          <path
            d="M1.3,-3.3 L3,-0.6 L1.9,-0.6 Z"
            fill={shade("#3f6b35", 18 + tint)}
            stroke="none"
            opacity={0.7}
          />
        </>
      );
    case "pineSmall":
      return (
        <>
          <path
            d="M0,-4.4 L1.7,-1.7 L0.9,-1.7 L2.1,0 L-2.1,0 L-0.9,-1.7 L-1.7,-1.7 Z"
            fill={shade("#47713a", tint)}
          />
          <path
            d="M0,-4.4 L-1.7,-1.7 L-0.9,-1.7 L-2.1,0 L0,0 Z"
            fill={shade("#47713a", -22 + tint)}
            stroke="none"
          />
          <path
            d="M0,-4.4 L1.7,-1.7 L1.05,-1.7 Z"
            fill={shade("#47713a", 22 + tint)}
            stroke="none"
            opacity={0.8}
          />
        </>
      );
    case "pineBig":
      return <g transform="scale(1.9)">{doodadInner("pine", ground, tint)}</g>;
    case "blobTree":
      return (
        <>
          <path d="M-0.45,0 h0.9 v-1.4 h-0.9 Z" fill="#6b4a2e" stroke="none" />
          <path
            d="M-0.15,-1.4 L-0.5,-2.2 M0.2,-1.4 L0.55,-2.3"
            fill="none"
            stroke="#6b4a2e"
            strokeWidth={0.22}
            opacity={0.8}
          />
          <path
            d="M-2.6,-3 a2.6,2.4 0 1,1 5.2,0 a2.4,2.2 0 0,1 -2.6,2 a2.4,2.2 0 0,1 -2.6,-2 Z"
            fill={shade("#5f9440", tint)}
          />
          <path
            d="M-2.6,-3 a2.6,2.4 0 0,0 2.6,2 L0,-5.4 a2.6,2.4 0 0,0 -2.6,2.4 Z"
            fill={shade("#5f9440", -26 + tint)}
            stroke="none"
          />
          <ellipse
            cx={1}
            cy={-3.9}
            rx={1.05}
            ry={0.75}
            transform="rotate(-23 1 -3.9)"
            fill={shade("#5f9440", 26 + tint)}
            stroke="none"
          />
          <circle cx={-0.7} cy={-2.1} r={0.24} fill={shade("#5f9440", -38 + tint)} stroke="none" />
          <circle cx={0.9} cy={-1.7} r={0.2} fill={shade("#5f9440", -38 + tint)} stroke="none" />
        </>
      );
    case "deadTree":
      return (
        <>
          <path
            d="M0,0 L0,-4 M0,-2.5 L-1.6,-3.9 M0,-3.2 L1.4,-4.5 M0,-1.7 L1,-2.5"
            fill="none"
            stroke="#5c4a38"
            strokeWidth={0.42}
          />
          <path
            d="M-1.6,-3.9 L-2.1,-4.1 M1.4,-4.5 L1.8,-4.9"
            fill="none"
            stroke="#5c4a38"
            strokeWidth={0.26}
            opacity={0.85}
          />
        </>
      );
    case "tombSmall":
      return (
        <>
          <path
            d="M-1.5,0 L-1.5,-2.9 Q-1.5,-4.1 0,-4.1 Q1.5,-4.1 1.5,-2.9 L1.5,0 Z"
            fill="#9b968a"
          />
          <path
            d="M0.4,-4 L1.5,-2.9 L1.5,0 L0.4,0 Z"
            fill={shade("#9b968a", -24)}
            stroke="none"
          />
          {thinStrokes("M-0.8,-2.6 h1.6 M-0.8,-1.7 h1.1")}
          <ellipse cx={-0.85} cy={-0.35} rx={0.55} ry={0.3} fill="rgba(116,138,74,.75)" stroke="none" />
          <path d="M0.15,-3.9 L0.45,-3.1 L0.2,-2.8" fill="none" strokeWidth={0.14} opacity={0.6} />
        </>
      );
    case "tombBig":
      return (
        <g transform="scale(2.3)">
          {doodadInner("tombSmall", ground)}
          <path d="M0,-5.4 v1.5 M-0.6,-4.9 h1.2" fill="none" strokeWidth={0.28} />
          <path d="M-0.9,-3.4 L-0.2,-2.2 L-0.6,-1.2" fill="none" strokeWidth={0.14} />
        </g>
      );
    case "skullPile":
      return (
        <>
          <circle cx={-1} cy={-0.9} r={1} fill="#ded8c2" />
          <circle cx={1} cy={-0.9} r={0.9} fill="#ded8c2" />
          <circle cx={0} cy={-2.1} r={1} fill="#e6e0cc" />
          <circle cx={-0.35} cy={-2.2} r={0.22} fill="#3a332c" stroke="none" />
          <circle cx={0.35} cy={-2.2} r={0.22} fill="#3a332c" stroke="none" />
          <circle cx={-1.25} cy={-1.05} r={0.16} fill="#3a332c" stroke="none" />
          <circle cx={1.2} cy={-1} r={0.14} fill="#3a332c" stroke="none" />
          <path d="M-0.3,-1.55 h0.6" fill="none" strokeWidth={0.16} opacity={0.7} />
        </>
      );
    case "mushroom":
      return (
        <>
          <path d="M-0.5,0 L-0.4,-1.5 h0.8 L0.5,0 Z" fill="#d9cfb4" />
          <path d="M-1.7,-1.5 a1.7,1.3 0 1,1 3.4,0 Z" fill="#a5522e" />
          <path
            d="M-1.3,-1.5 Q0,-1.05 1.3,-1.5"
            fill="none"
            stroke={shade("#a5522e", -34)}
            strokeWidth={0.2}
            opacity={0.9}
          />
          <ellipse
            cx={-0.55}
            cy={-2.3}
            rx={0.6}
            ry={0.27}
            transform="rotate(-20 -0.55 -2.3)"
            fill={shade("#a5522e", 32)}
            stroke="none"
          />
          <circle cx={-0.6} cy={-2.1} r={0.22} fill="#e8ddc4" stroke="none" />
          <circle cx={0.5} cy={-1.9} r={0.18} fill="#e8ddc4" stroke="none" />
          <circle cx={0} cy={-2.55} r={0.14} fill="#e8ddc4" stroke="none" />
        </>
      );
    case "mushroomBig":
      return <g transform="scale(2.6)">{doodadInner("mushroom", ground)}</g>;
    case "fern":
      return (
        <>
          <path
            d="M0,0 Q-0.4,-2 -2,-2.8 M0,0 Q0.2,-2.2 1.8,-3 M0,0 Q0,-2.6 0.2,-3.4"
            fill="none"
            stroke={shade("#3f6b35", tint)}
            strokeWidth={0.36}
          />
          <path
            d="M-1,-1.9 l-0.5,-0.1 M1,-2 l0.5,-0.15"
            fill="none"
            stroke={shade("#3f6b35", -14 + tint)}
            strokeWidth={0.2}
            opacity={0.8}
          />
        </>
      );
    case "crystal":
      return (
        <>
          <path d="M0,-4.6 L1.3,-1.5 L0.7,0 L-0.7,0 L-1.3,-1.5 Z" fill="#8f7ad1" />
          <path
            d="M0,-4.6 L-1.3,-1.5 L-0.4,0 L0,0 Z"
            fill={shade("#8f7ad1", 30)}
            stroke="none"
            opacity={0.7}
          />
          <path
            d="M-0.3,-3.7 L-0.05,-1.7"
            fill="none"
            stroke="#e6dcff"
            strokeWidth={0.2}
            opacity={0.8}
          />
          <circle cx={-1} cy={-0.1} r={0.26} fill={shade("#8f7ad1", -30)} stroke="none" />
          <circle cx={1.05} cy={-0.15} r={0.2} fill={shade("#8f7ad1", -24)} stroke="none" />
        </>
      );
    case "crystalBig":
      return (
        <g transform="scale(1.7)">
          <g transform="translate(-1.4,0) rotate(-14)">{doodadInner("crystal", ground)}</g>
          <g transform="translate(1.3,0) rotate(11) scale(0.7)">
            {doodadInner("crystal", ground)}
          </g>
        </g>
      );
    case "mountain":
      return (
        <>
          <path d="M-4,0 L-1.2,-5.2 L0.6,-2.3 L2,-3.9 L4.4,0 Z" fill="#8d7f6f" />
          <path
            d="M-1.2,-5.2 L0.6,-2.3 L2,-3.9 L4.4,0 L-0.2,0 Z"
            fill={shade("#8d7f6f", -26)}
            stroke="none"
          />
          <path
            d="M-4,0 L-1.2,-5.2 L-1.0,-3.2 L-2.6,-0.9 Z"
            fill={shade("#8d7f6f", 16)}
            stroke="none"
            opacity={0.8}
          />
          <path
            d="M-1.2,-5.2 L-0.62,-4.05 L-1.15,-3.75 L-1.7,-4.35 Z"
            fill="#c4bcac"
            stroke="none"
            opacity={0.9}
          />
          <path d="M2,-3.9 L2.5,-2.4 L2.1,-1.2" fill="none" strokeWidth={0.14} opacity={0.5} />
        </>
      );
    case "volcano":
      return (
        <g transform="scale(1.9)">
          <path d="M-4,0 L-1.3,-4.6 L1.3,-4.6 L4,0 Z" fill="#6e4a38" />
          <path d="M0.2,0 L1.3,-4.6 L4,0 Z" fill={shade("#6e4a38", -26)} stroke="none" />
          <path
            d="M-4,0 L-1.3,-4.6 L-1.1,-3.2 L-2.9,-0.6 Z"
            fill={shade("#6e4a38", 14)}
            stroke="none"
            opacity={0.75}
          />
          <path
            d="M-1.3,-4.6 Q0,-5.2 1.3,-4.6 Q0,-4.05 -1.3,-4.6 Z"
            fill="#f08a40"
            stroke="none"
            opacity={0.95}
          />
          <path
            d="M-1.3,-4.6 Q0,-5.2 1.3,-4.6"
            fill="none"
            stroke="#e07030"
            strokeWidth={0.5}
          />
          <path
            d="M-0.4,-4.7 Q-0.8,-3 -0.2,-1.4"
            fill="none"
            stroke="#e07030"
            strokeWidth={0.4}
            opacity={0.85}
          />
          <path
            d="M0.5,-4.6 Q0.95,-3.3 0.6,-2.1"
            fill="none"
            stroke="#e07030"
            strokeWidth={0.3}
            opacity={0.7}
          />
        </g>
      );
    case "lava":
      return (
        <>
          <path
            d="M-2.6,0 L-1.2,-0.6 L-0.2,0.2 L1,-0.4 L2.4,0.1"
            fill="none"
            stroke="#e07030"
            strokeWidth={1.3}
            opacity={0.32}
            strokeLinecap="round"
          />
          <path
            d="M-2.6,0 L-1.2,-0.6 L-0.2,0.2 L1,-0.4 L2.4,0.1"
            fill="none"
            stroke="#f08a40"
            strokeWidth={0.45}
            strokeLinecap="round"
          />
          <path
            d="M-1.2,-0.6 L-0.2,0.2 L1,-0.4"
            fill="none"
            stroke="#ffc070"
            strokeWidth={0.2}
            opacity={0.9}
            strokeLinecap="round"
          />
        </>
      );
    case "candle":
      return (
        <>
          <path d="M-0.7,0 L-0.7,-2 h1.4 L0.7,0 Z" fill="#e8dfc8" />
          <path
            d="M-0.55,-1.9 L-0.62,-1.15 M0.5,-1.9 L0.6,-1.3"
            fill="none"
            stroke="#f6efdd"
            strokeWidth={0.22}
            opacity={0.9}
          />
          <path
            d="M0,-3.6 Q0.7,-2.7 0,-2.1 Q-0.7,-2.7 0,-3.6 Z"
            fill="#f0a83c"
            stroke="none"
          />
          <path
            d="M0,-3.15 Q0.3,-2.75 0,-2.35 Q-0.3,-2.75 0,-3.15 Z"
            fill="#fde39a"
            stroke="none"
          />
        </>
      );
    case "stalag":
      return (
        <>
          <path d="M-1.6,0 L-0.8,-2.7 L0,0 Z M0.4,0 L1.2,-3.5 L2,0 Z" fill="#7d766a" />
          <path
            d="M-1.6,0 L-0.8,-2.7 L-0.75,0 Z M0.4,0 L1.2,-3.5 L1.28,0 Z"
            fill={shade("#7d766a", 16)}
            stroke="none"
            opacity={0.8}
          />
        </>
      );
    case "caveMouth":
      return (
        <>
          <path d="M-4.5,0 Q-4,-4.4 0,-4.7 Q4,-4.4 4.5,0 Z" fill={shade(ground, 14)} />
          <path d="M-2.1,0 A2.1,2.5 0 0,1 2.1,0 Z" fill="#1d1813" stroke="none" />
          <path
            d="M-2.1,0 A2.1,2.5 0 0,1 2.1,0"
            fill="none"
            stroke={shade(ground, 32)}
            strokeWidth={0.28}
            opacity={0.9}
          />
          <path d="M-4.3,0 L-3.7,-1.3 L-2.8,0 Z" fill="#8a8378" />
          <path d="M2.9,0 L3.6,-1.2 L4.3,0 Z" fill="#8a8378" />
        </>
      );
    case "castle": {
      // "Twin-Tower Gatehouse" (mockup pick): crenellated towers + curtain
      // wall, stone arch with a metal-bar portcullis, arrow slits, red
      // pennant, torch sconces (their glow is the living-landmark FX).
      const STONE = "#a8a196";
      return (
        <>
          <path d="M-3.8,0 L-3.8,-4.3 L3.8,-4.3 L3.8,0 Z" fill={STONE} />
          <path d="M0.3,0 L0.3,-4.3 L3.8,-4.3 L3.8,0 Z" fill={shade(STONE, -18)} stroke="none" />
          {merlonPaths(-3.4, 3.4, -4.3, 5, STONE)}
          <path d="M-5.8,0 L-5.8,-6.7 L-3.7,-6.7 L-3.7,0 Z" fill={STONE} />
          <path d="M-4.9,-6.7 L-3.7,-6.7 L-3.7,0 L-4.9,0 Z" fill={shade(STONE, -22)} stroke="none" />
          {merlonPaths(-6.05, -3.45, -6.7, 3, STONE)}
          <path d="M3.7,0 L3.7,-6.7 L5.8,-6.7 L5.8,0 Z" fill={STONE} />
          <path d="M4.6,-6.7 L5.8,-6.7 L5.8,0 L4.6,0 Z" fill={shade(STONE, -22)} stroke="none" />
          {merlonPaths(3.45, 6.05, -6.7, 3, STONE)}
          <path
            d="M-4.75,-4.6 L-4.75,-5.6 M-4.75,-2.2 L-4.75,-3.2 M4.75,-4.6 L4.75,-5.6 M4.75,-2.2 L4.75,-3.2"
            fill="none"
            stroke="#241a16"
            strokeWidth={0.3}
          />
          <path
            d="M-1.95,0 L-1.95,-2.3 Q-1.95,-3.75 0,-3.75 Q1.95,-3.75 1.95,-2.3 L1.95,0 Z"
            fill={shade(STONE, 12)}
          />
          {portcullisPaths(1.45, -3.1)}
          <path d="M4.75,-6.7 L4.75,-8.6" fill="none" strokeWidth={0.22} />
          <path d="M4.75,-8.6 L6.4,-8.15 L4.75,-7.7 Z" fill="#8c2820" />
          <path d="M-2.6,-3.65 Q-2.28,-3.2 -2.6,-2.85 Q-2.92,-3.2 -2.6,-3.65 Z" fill="#f0a83c" stroke="none" />
          <path d="M2.6,-3.65 Q2.92,-3.2 2.6,-2.85 Q2.28,-3.2 2.6,-3.65 Z" fill="#f0a83c" stroke="none" />
          <path d="M-3.2,-1.3 h1.0 M1.6,-2.4 h1.1 M-2.6,-3.2 h0.9" fill="none" strokeWidth={0.13} opacity={0.5} />
          <ellipse cx={-4.9} cy={-0.25} rx={0.5} ry={0.26} fill="rgba(116,138,74,.55)" stroke="none" />
          <path d="M6.2,0 L6.7,-0.9 L7.2,0 Z" fill="#8a8378" />
        </>
      );
    }
    case "barbican": {
      // "Rock-Hewn Barbican": a keep grown out of the cave mound itself —
      // gate cut into the rock with the portcullis, side turrets, lit keep
      // window, gold pennant. Guards the Depths floor trail's Lair.
      const STONE = "#a8a196";
      return (
        <>
          <path d="M-6.5,0 Q-5.6,-4.4 0,-4.9 Q5.6,-4.4 6.5,0 Z" fill={shade(ground, 14)} />
          <path
            d="M-4.3,-1.6 Q-3.4,-2.6 -2.2,-3 M2.5,-3 Q3.7,-2.5 4.5,-1.5"
            fill="none"
            strokeWidth={0.14}
            opacity={0.45}
          />
          <path d="M-4.6,-1.4 L-4.6,-5.3 L-3.2,-5.3 L-3.2,-1.4 Z" fill={STONE} />
          <path d="M-3.85,-5.3 L-3.2,-5.3 L-3.2,-1.4 L-3.85,-1.4 Z" fill={shade(STONE, -22)} stroke="none" />
          {merlonPaths(-4.8, -3.0, -5.3, 2, STONE)}
          <path d="M3.2,-1.4 L3.2,-5.3 L4.6,-5.3 L4.6,-1.4 Z" fill={STONE} />
          <path d="M3.95,-5.3 L4.6,-5.3 L4.6,-1.4 L3.95,-1.4 Z" fill={shade(STONE, -22)} stroke="none" />
          {merlonPaths(3.0, 4.8, -5.3, 2, STONE)}
          <path d="M-2.0,-3.6 L-2.0,-9.0 L2.0,-9.0 L2.0,-3.6 Z" fill={STONE} />
          <path d="M0.5,-9.0 L2.0,-9.0 L2.0,-3.6 L0.5,-3.6 Z" fill={shade(STONE, -22)} stroke="none" />
          {merlonPaths(-2.25, 2.25, -9.0, 3, STONE)}
          <path
            d="M-0.38,-6.6 L-0.38,-7.4 Q-0.38,-7.85 0,-7.85 Q0.38,-7.85 0.38,-7.4 L0.38,-6.6 Z"
            fill="#ffcf7a"
          />
          <path d="M0,-9.0 L0,-10.7" fill="none" strokeWidth={0.22} />
          <path d="M0,-10.7 L1.6,-10.28 L0,-9.86 Z" fill="#caa53d" />
          <path
            d="M-2.1,0 L-2.1,-2.1 Q-2.1,-3.45 0,-3.45 Q2.1,-3.45 2.1,-2.1 L2.1,0 Z"
            fill={shade(ground, 28)}
          />
          {portcullisPaths(1.55, -2.85)}
          <path d="M-2.75,-3.25 Q-2.43,-2.8 -2.75,-2.45 Q-3.07,-2.8 -2.75,-3.25 Z" fill="#f0a83c" stroke="none" />
          <path d="M2.75,-3.25 Q3.07,-2.8 2.75,-2.45 Q2.43,-2.8 2.75,-3.25 Z" fill="#f0a83c" stroke="none" />
          <path d="M5.6,0 L6.15,-1.0 L6.7,0 Z" fill="#8a8378" />
          <ellipse cx={-5.9} cy={-0.2} rx={0.45} ry={0.24} fill="rgba(116,138,74,.5)" stroke="none" />
        </>
      );
    }
    case "ruinColumn":
      return (
        <>
          <path d="M-0.7,0 L-0.7,-2.9 L0.2,-3.3 L0.7,-2.7 L0.7,0 Z" fill="#cfc9bd" />
          {thinStrokes("M-0.7,-1 h1.4 M-0.7,-2 h1.4")}
          <circle cx={1.1} cy={-0.15} r={0.3} fill="#bdb7ab" stroke="none" />
          <circle cx={-1.15} cy={-0.1} r={0.22} fill="#bdb7ab" stroke="none" />
          <ellipse cx={-0.45} cy={-0.25} rx={0.4} ry={0.22} fill="rgba(116,138,74,.6)" stroke="none" />
        </>
      );
    case "arch":
      return (
        <>
          <path
            d="M-2.4,0 L-2.4,-1.8 Q-2.4,-4 0,-4 Q2.4,-4 2.4,-1.8 L2.4,0 L1.3,0 L1.3,-1.7 Q1.3,-2.9 0,-2.9 Q-1.3,-2.9 -1.3,-1.7 L-1.3,0 Z"
            fill="#cfc9bd"
          />
          <path d="M-0.32,-3.95 h0.64" fill="none" strokeWidth={0.22} opacity={0.8} />
          <ellipse cx={-1.85} cy={-0.25} rx={0.42} ry={0.22} fill="rgba(116,138,74,.55)" stroke="none" />
        </>
      );
    case "archBig":
      return (
        <g transform="scale(2.1)">
          {doodadInner("arch", ground)}
          <path d="M3.4,0 L3.4,-1.6 M4.2,0 L4.2,-0.9" fill="none" strokeWidth={0.3} />
        </g>
      );
    case "cathedral": {
      // "Rose Basilica" (mockup pick, + the Twin-Spire variant's towers per
      // the user): gabled nave, 8-pane stained rose window, intact spire with
      // a gold cross, broken right tower, rubble + moss — half ruined, half holy.
      const GLASS = ["#5d74c4", "#8c4fb0", "#c44f4f", "#d8a03c"];
      const cx = 0;
      const cy = -4.9;
      const wedge = (i: number) => {
        const a0 = (i * Math.PI) / 4 - Math.PI / 2;
        const a1 = a0 + Math.PI / 4;
        const x0 = (cx + Math.cos(a0) * 1.5).toFixed(2);
        const y0 = (cy + Math.sin(a0) * 1.5).toFixed(2);
        const x1 = (cx + Math.cos(a1) * 1.5).toFixed(2);
        const y1 = (cy + Math.sin(a1) * 1.5).toFixed(2);
        return `M${cx},${cy} L${x0},${y0} A1.5,1.5 0 0,1 ${x1},${y1} Z`;
      };
      return (
        <>
          {/* left facade tower — intact spire, gold cross */}
          <path d="M-6.1,0 L-6.1,-8.4 L-4.4,-8.4 L-4.4,0 Z" fill="#c7c1b4" />
          <path
            d="M-5.1,-8.4 L-4.4,-8.4 L-4.4,0 L-5.1,0 Z"
            fill={shade("#c7c1b4", -22)}
            stroke="none"
          />
          <path d="M-6.4,-8.4 L-5.25,-11 L-4.1,-8.4 Z" fill="#8b8478" />
          <path
            d="M-5.25,-11 L-5.25,-12.1 M-5.65,-11.75 h0.8"
            fill="none"
            stroke="#caa53d"
            strokeWidth={0.28}
          />
          <path
            d="M-5.55,-6.3 L-5.55,-7.2 Q-5.55,-7.7 -5.25,-7.7 Q-4.95,-7.7 -4.95,-7.2 L-4.95,-6.3 Z"
            fill="#2a2018"
          />
          {/* right facade tower — broken (the cathedral fell) */}
          <path d="M4.4,0 L4.4,-5.8 L4.95,-5.1 L5.5,-6.0 L6.1,-5.2 L6.1,0 Z" fill="#c7c1b4" />
          <path
            d="M5.5,-6.0 L6.1,-5.2 L6.1,0 L5.2,0 Z"
            fill={shade("#c7c1b4", -22)}
            stroke="none"
          />
          <path d="M-4.5,0 L-4.5,-5 L0,-8.6 L4.5,-5 L4.5,0 Z" fill="#cfc9bd" />
          <path
            d="M0,-8.6 L4.5,-5 L4.5,0 L0.2,0 Z"
            fill={shade("#cfc9bd", -26)}
            stroke="none"
          />
          <path
            d="M-4.5,-5 L0,-8.6"
            fill="none"
            stroke={shade("#cfc9bd", 26)}
            strokeWidth={0.3}
            opacity={0.9}
          />
          <path d="M2.7,-3.5 L2.3,-2.2 L2.6,-1.0" fill="none" strokeWidth={0.16} opacity={0.6} />
          <path
            d="M0,-8.6 L0,-10.1 M-0.55,-9.55 h1.1"
            fill="none"
            stroke="#caa53d"
            strokeWidth={0.3}
          />
          <circle cx={cx} cy={cy} r={1.95} fill="#b5ae9f" />
          {GLASS.map((_, i) => (
            <path key={i} d={wedge(i)} fill={GLASS[i % 4]} stroke="none" />
          ))}
          {GLASS.map((_, i) => (
            <path key={`s${i}`} d={wedge(i + 4)} fill={GLASS[i % 4]} stroke="none" />
          ))}
          <circle cx={cx} cy={cy} r={1.5} fill="none" strokeWidth={0.13} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4 - Math.PI / 2;
            return (
              <path
                key={`t${i}`}
                d={`M${cx},${cy} L${(cx + Math.cos(a) * 1.5).toFixed(2)},${(cy + Math.sin(a) * 1.5).toFixed(2)}`}
                fill="none"
                strokeWidth={0.13}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={0.36} fill="#e8dfc8" strokeWidth={0.13} />
          <path
            d="M-3.1,-1.3 L-3.1,-2.6 Q-3.1,-3.3 -2.65,-3.3 Q-2.2,-3.3 -2.2,-2.6 L-2.2,-1.3 Z"
            fill="#5d74c4"
          />
          <path
            d="M2.2,-1.3 L2.2,-2.6 Q2.2,-3.3 2.65,-3.3 Q3.1,-3.3 3.1,-2.6 L3.1,-1.3 Z"
            fill="#5d74c4"
          />
          <path
            d="M-0.95,0 L-0.95,-1.5 Q-0.95,-2.5 0,-2.5 Q0.95,-2.5 0.95,-1.5 L0.95,0 Z"
            fill="#2a2018"
          />
          {/* fallen spire chunk + rubble at the broken tower's feet */}
          <path d="M6.35,0 L7.3,-0.45 L7.7,0.3 Z" fill="#8b8478" />
          <circle cx={6.7} cy={-0.75} r={0.3} fill="#bdb7ab" />
          <ellipse cx={-5.5} cy={-0.25} rx={0.5} ry={0.26} fill="rgba(116,138,74,.6)" stroke="none" />
        </>
      );
    }
    case "spireTower":
      return (
        <g transform="scale(1.8)">
          <path d="M-1.1,0 L-0.75,-5.6 L0,-7.2 L0.75,-5.6 L1.1,0 Z" fill="#6a6288" />
          <path
            d="M0,-7.2 L0.75,-5.6 L1.1,0 L0.1,0 Z"
            fill={shade("#6a6288", -24)}
            stroke="none"
          />
          <path d="M-0.28,-3.62 h0.56 v0.42 h-0.56 Z" fill="#ffcf7a" stroke="none" />
          <path d="M-0.33,-1.82 h0.66 v0.42 h-0.66 Z" fill="#ffcf7a" stroke="none" />
          <path d="M-0.3,-3.4 h0.6 M-0.35,-1.6 h0.7" fill="none" strokeWidth={0.2} />
          <path
            d="M0.55,-8.4 A1.15,1.15 0 1,0 0.55,-6.3 A0.85,0.85 0 1,1 0.55,-8.4 Z"
            fill="#e8c65a"
            stroke="none"
          />
        </g>
      );
    case "tent":
      return (
        <>
          <path d="M-2.2,0 L0,-3.3 L2.2,0 Z" fill="#7d4a3a" />
          <path
            d="M-2.2,0 L0,-3.3 L0,0 Z"
            fill={shade("#7d4a3a", 14)}
            stroke="none"
            opacity={0.85}
          />
          <path d="M-0.6,0 L0,-1.6 L0.6,0 Z" fill="#241a16" stroke="none" />
          <path
            d="M-0.95,-1.35 L-0.62,0 M0.95,-1.35 L0.62,0"
            fill="none"
            stroke={shade("#7d4a3a", -26)}
            strokeWidth={0.2}
            opacity={0.85}
          />
          <path d="M0,-3.3 L0,-4.1" fill="none" strokeWidth={0.3} />
        </>
      );
    case "tentBig":
      return (
        <g transform="scale(1.9)">
          {doodadInner("tent", ground)}
          <path d="M3,0 L3.5,-2 M3.5,-2 l0.9,0.3" fill="none" strokeWidth={0.3} />
        </g>
      );
    case "dagger":
      return (
        <>
          <path d="M0,0 L0.55,-2.3 L0,-2.9 L-0.55,-2.3 Z" fill="#b8bdc4" />
          <path
            d="M0.1,-2.45 L0.32,-1.15"
            fill="none"
            stroke="#e8ecf2"
            strokeWidth={0.16}
            opacity={0.9}
          />
          <path d="M-1,-2.9 h2 M0,-2.9 v-1.1" fill="none" strokeWidth={0.3} />
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Ground rasterization — tiny canvas, bilinear-upscaled by the SVG <image>.
// ---------------------------------------------------------------------------

function paintWorldGround(nodes: TrailNode[], H: number, concealed: ReadonlySet<string>): string {
  // A concealed region's terrain stays fog until the ceremony reveals it.
  const regions = worldGroundRegions(
    nodes.map((n) => (concealed.has(n.id) ? { ...n, uncharted: true } : n)),
    H
  );
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(100, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 100; x++) {
      const [r, g, b] = blendGround(x + 0.5, y + 0.5, regions);
      const n = (grain(x, y) - 0.5) * 10;
      const i = (y * 100 + x) * 4;
      d[i] = clampByte(r + n);
      d[i + 1] = clampByte(g + n);
      d[i + 2] = clampByte(b + n);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function paintFloorGround(dungeonId: string, H: number): string {
  const base = hexToRgb(ATLAS_BIOMES[dungeonId].ground);
  const spots = floorGroundSpots(dungeonId, H);
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(100, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 100; x++) {
      let amt = (grain(x, y) - 0.5) * 10;
      for (const s of spots) {
        const dist = Math.hypot(s.x - x, s.y - y);
        if (dist < s.r) amt += s.amt * Math.pow(1 - dist / s.r, 1.5);
      }
      const i = (y * 100 + x) * 4;
      d[i] = clampByte(base[0] + amt);
      d[i + 1] = clampByte(base[1] + amt);
      d[i + 2] = clampByte(base[2] + amt);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// ---------------------------------------------------------------------------
// Living landmarks (Enchanted Chart) — tiny CSS-animated SVG elements on the
// HERO props only (bounded element count): the volcano smokes, ghost wisps
// rise off the great tombstones, the cave mouth glows, the giant mushroom
// sheds spores, the vault crystal twinkles. Keyframes live in styles.css;
// the global reduced-motion block stills them automatically. No SVG filters
// (they re-rasterize during the atlas zoom and jank mobile) — soft edges come
// from the shared radial gradients in <defs>.
// ---------------------------------------------------------------------------

function heroFx(kind: DoodadKind): ReactNode {
  switch (kind) {
    case "volcano":
      return (
        <>
          <circle className="atlas-fx-smoke" cx={-0.6} cy={-9.2} r={1.1} fill="rgba(120,110,100,.4)" stroke="none" />
          <circle className="atlas-fx-smoke" cx={-0.2} cy={-9.2} r={0.9} fill="rgba(120,110,100,.4)" stroke="none" style={{ animationDelay: "-2.7s" }} />
          <circle className="atlas-fx-smoke" cx={-1} cy={-9.2} r={1.3} fill="rgba(120,110,100,.4)" stroke="none" style={{ animationDelay: "-5.4s" }} />
        </>
      );
    case "tombBig":
      return (
        <circle className="atlas-fx-wisp" cx={0} cy={-8} r={0.8} fill="rgba(205,232,215,.55)" stroke="none" />
      );
    case "mushroomBig":
      return (
        <>
          <circle className="atlas-fx-spore" cx={-1.4} cy={-8.5} r={0.32} fill="#e6dcc4" stroke="none" />
          <circle className="atlas-fx-spore" cx={1.5} cy={-9} r={0.28} fill="#e6dcc4" stroke="none" style={{ animationDelay: "-3.1s" }} />
        </>
      );
    case "crystalBig":
      return (
        <path
          className="atlas-fx-sparkle"
          d="M0.8,-8 h2 M1.8,-9 v2"
          fill="none"
          stroke="#e6dcff"
          strokeWidth={0.3}
        />
      );
    case "caveMouth":
      return (
        <ellipse
          className="atlas-fx-cave-glow"
          cx={0}
          cy={-1.2}
          rx={2.3}
          ry={1.8}
          fill="url(#atlasFxWarm)"
          stroke="none"
        />
      );
    case "cathedral":
      return (
        <circle
          className="atlas-fx-window-glow"
          cx={0}
          cy={-4.9}
          r={3.1}
          fill="url(#atlasFxHoly)"
          stroke="none"
        />
      );
    case "castle":
      return (
        <>
          <circle className="atlas-fx-cave-glow" cx={-2.6} cy={-3.1} r={1.7} fill="url(#atlasFxWarm)" stroke="none" />
          <circle
            className="atlas-fx-cave-glow"
            cx={2.6}
            cy={-3.1}
            r={1.7}
            fill="url(#atlasFxWarm)"
            stroke="none"
            style={{ animationDelay: "-1.8s" }}
          />
        </>
      );
    case "barbican":
      return (
        <>
          <circle className="atlas-fx-cave-glow" cx={-2.75} cy={-2.75} r={1.7} fill="url(#atlasFxWarm)" stroke="none" />
          <circle
            className="atlas-fx-cave-glow"
            cx={2.75}
            cy={-2.75}
            r={1.7}
            fill="url(#atlasFxWarm)"
            stroke="none"
            style={{ animationDelay: "-1.8s" }}
          />
          <circle className="atlas-fx-window-glow" cx={0} cy={-7.2} r={1.5} fill="url(#atlasFxWarm)" stroke="none" />
        </>
      );
    default:
      return null;
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export interface BiomeLayerProps {
  nodes: TrailNode[];
  /** viewBox height (100 × aspect, already rounded by AtlasTrail). */
  H: number;
  /** Set = this is a floor trail of that dungeon; unset = the world map. */
  floorDungeonId?: string | null;
  /** Ceremony: regions whose reveal hasn't played — terrain fogs, props hide. */
  concealedIds?: ReadonlySet<string>;
}

export function BiomeLayer({
  nodes,
  H,
  floorDungeonId = null,
  concealedIds = EMPTY_SET,
}: BiomeLayerProps) {
  // DungeonAtlas rebuilds the nodes array every render — memo on a value
  // signature so the ground/doodads only recompute when the map truly changes.
  const sig =
    `${floorDungeonId ?? "world"}|${H}|` +
    nodes.map((n) => `${n.id}:${n.state}:${n.uncharted ? 1 : 0}`).join(",") +
    `|${[...concealedIds].sort().join("+")}`;

  /* eslint-disable react-hooks/exhaustive-deps */
  const groundUri = useMemo(
    () =>
      floorDungeonId
        ? paintFloorGround(floorDungeonId, H)
        : paintWorldGround(nodes, H, concealedIds),
    [sig]
  );
  const doodads = useMemo<DoodadPlacement[]>(
    () =>
      floorDungeonId ? floorDoodads(floorDungeonId, nodes, H) : worldDoodads(nodes, H),
    [sig]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // Locked-but-charted world regions read subdued (echoes .atlas-seg.faint).
  const dimmed = new Set(
    floorDungeonId
      ? []
      : nodes.filter((n) => n.state === "locked" && !n.uncharted).map((n) => n.id)
  );

  return (
    <g className="atlas-biomes">
      <defs>
        <radialGradient id="atlasFxWarm">
          <stop offset="0%" stopColor="rgba(255,150,60,.5)" />
          <stop offset="100%" stopColor="rgba(255,150,60,0)" />
        </radialGradient>
        <radialGradient id="atlasFxHoly">
          <stop offset="0%" stopColor="rgba(205,170,255,.5)" />
          <stop offset="100%" stopColor="rgba(205,170,255,0)" />
        </radialGradient>
      </defs>
      {groundUri && (
        <image
          href={groundUri}
          x={0}
          y={0}
          width={100}
          height={H}
          preserveAspectRatio="none"
        />
      )}
      {doodads.map((p, i) => {
        const foot = DOODAD_FOOT[p.kind];
        const alive = !concealedIds.has(p.dungeonId) && !dimmed.has(p.dungeonId);
        return (
          <g
            key={i}
            className="atlas-biome-doodad"
            transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) scale(${p.scale})`}
            stroke={OUTLINE}
            strokeWidth={OUTLINE_W}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{
              opacity: concealedIds.has(p.dungeonId) ? 0 : dimmed.has(p.dungeonId) ? 0.55 : 1,
            }}
          >
            {/* contact shadow — grounds every solid prop on the terrain */}
            {foot > 0 && p.kind !== "lava" && p.kind !== "caveMouth" && (
              <ellipse
                cy={0.3}
                rx={foot * 0.72}
                ry={foot * 0.24}
                fill={p.hero ? "rgba(26,19,11,.2)" : "rgba(26,19,11,.14)"}
                stroke="none"
              />
            )}
            {doodadInner(p.kind, p.ground, p.tint ?? 0)}
            {p.hero && alive && heroFx(p.kind)}
          </g>
        );
      })}
    </g>
  );
}
