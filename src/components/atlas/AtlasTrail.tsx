// ============================================================================
// AtlasTrail — one winding node trail on the Dungeon Atlas parchment: an SVG
// layer drawing the dotted path, DOM buttons for the nodes (native click/
// focus/CSS animation — no hit-testing), and the player marker standing on
// the current node. Renders both the world trail (dungeon nodes, fork
// branches) and a dungeon's floor trail — the caller just hands it different
// nodes/runs.
//
// Coordinates: nodes carry normalized 0..1 positions; the SVG viewBox is
// 100 × 100·aspect and the buttons use left/top percents from the SAME
// numbers, so curve and buttons cannot drift. The box itself gets its shape
// from CSS aspect-ratio.
//
// Living-map dressing lives here too: per-dungeon vignette icons, fog-of-war
// smudges (uncharted nodes), boss-skull stamps on cleared boss floors,
// faction banners on the conquered endgame fork, wax-seal quest pins,
// hand-written margin notes, and drifting embers.
//
// Unlock ceremony support: every segment is drawn through a mask whose white
// path uses the pathLength=1 dash trick — dashoffset 1 hides the segment,
// 0 reveals it, and transitioning between them "draws" the dotted trail in
// WITHOUT disturbing the visible path's dot spacing. The mask paths are
// exposed via segmentRefs (keyed by the segment's child node id — also handy
// for getPointAtLength marker slides); concealedIds render a segment hidden
// and its node still-locked until the ceremony flips them.
// ============================================================================

import { useEffect, useLayoutEffect, useRef } from "react";
import type React from "react";
import { hash01, trailPath, type NodeState, type TrailNode } from "@/data/atlasLayout";
import { renderPortrait } from "@/engine/Renderer";
import { useSpriteEpoch } from "@/hooks/useSpriteEpoch";
import { prefersReducedMotion } from "@/utils/motion";
import { GameIcon, type IconName } from "@/components/icons/GameIcon";
import { BiomeLayer } from "./BiomeLayer";

/** id-safe key for SVG mask ids (floor node ids contain ":"). */
const cssSafe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

/** Per-dungeon vignette icons for unlocked world nodes. */
const WORLD_ICONS: Record<string, IconName> = {
  depths: "depths",
  bonefields: "bonefields",
  wilds: "wilds",
  overgrowth: "overgrowth",
  sealed_vault: "sealedVault",
  deep_forge: "deepForge",
  eclipse_spire: "eclipseSpire",
  fallen_cathedral: "fallenCathedral",
  rogues_den: "roguesDen",
};

/** Faction banners planted on a conquered endgame-fork dungeon. */
const BANNERS: Record<string, IconName> = {
  fallen_cathedral: "bannerCathedral",
  rogues_den: "bannerRoguesDen",
};

/** A margin note pinned near a node (hand-written entryHint lore). */
export interface TrailNote {
  nodeId: string;
  text: string;
}

export interface AtlasTrailProps {
  nodes: TrailNode[];
  /** Ordered node-id runs, each drawn as one smooth curve (world = trunk +
   *  fork branches, floors = a single run). */
  runs: string[][];
  /** Box height ÷ width (WORLD_ASPECT / FLOOR_ASPECT). */
  aspect: number;
  /** Painted-biome ground: set to the dungeon id on a floor trail, leave
   *  unset for the world map's seamless multi-biome terrain. */
  biomeDungeonId?: string | null;
  /** Node id the player marker stands on. */
  markerId: string;
  /** Deck-lead defId shown inside the marker's gold ring ("you"). */
  markerDefId?: string;
  /** When true, the marker eases between nodes as the selection changes; off
   *  during a ceremony so its JS path-walk isn't fought by a CSS transition. */
  glideMarker?: boolean;
  /** Node currently playing the locked-tap shake, if any. */
  shakingId: string | null;
  /** Ceremony: node ids not yet revealed — their inbound segment renders
   *  undrawn and the node itself still-locked until the draw-in flips them. */
  concealedIds?: ReadonlySet<string>;
  /** Floor nodes hosting an unfinished rare-spawn quest (wax-seal "!"). */
  pinnedIds?: ReadonlySet<string>;
  /** Hand-written margin notes (world view: frontier + next-gate lore). */
  notes?: TrailNote[];
  onNodeClick: (node: TrailNode) => void;
  /** Pointer-enter on a node (the atlas whispers over the frontier). */
  onNodeHover?: (node: TrailNode) => void;
  /** Ceremony access to the mask paths, keyed by child node id (these carry
   *  the real path geometry, so they also serve getPointAtLength slides). */
  segmentRefs?: React.MutableRefObject<Map<string, SVGPathElement>>;
  /** Ceremony access to the marker element (slid along the path via JS). */
  markerRef?: React.RefObject<HTMLDivElement>;
}

/** What the node LOOKS like right now (a concealed node plays locked until
 *  its unlock ceremony reveals it). */
function displayState(node: TrailNode, concealed: boolean): NodeState {
  return concealed ? "locked" : node.state;
}

/** The drawn icon inside a node's circle. Floor nodes are an ABSTRACT descent
 *  now (the RNG "hunt for the boss" model hides floor numbers): nothing, or
 *  the boss lair's skull — gilded once the dungeon is cleared. World nodes
 *  wear their dungeon's vignette (a padlock when locked); fog shows nothing.
 *  Returns null when the node's mark is plain type (the cleared ✓) or absent. */
function nodeIcon(node: TrailNode, state: NodeState): IconName | null {
  if (node.uncharted) return null;
  const isFloor = node.id.includes(":");
  if (isFloor) {
    if (node.boss) return state === "completed" ? "bossCleared" : "bossSkull";
    return null;
  }
  if (state === "locked") return "locked";
  return WORLD_ICONS[node.id] ?? null;
}

/** The part of a node's mark that stays plain type rather than a drawn icon. */
function nodeText(node: TrailNode, state: NodeState): string {
  if (node.uncharted) return "";
  if (node.id.includes(":")) {
    return !node.boss && state === "completed" ? "✓" : "";
  }
  // An unlocked world node with no registered vignette — i.e. a dungeon added
  // without a WORLD_ICONS entry. Keep the old lozenge so it degrades visibly
  // instead of rendering an empty circle.
  return state !== "locked" && !WORLD_ICONS[node.id] ? "◆" : "";
}

/** The deck-lead's face in a little gold ring — "you" on the map. */
function MarkerBadge({ defId }: { defId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spriteEpoch = useSpriteEpoch();
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    renderPortrait(ctx, defId, 48, { transparent: true });
  }, [defId, spriteEpoch]);
  return <canvas ref={ref} width={48} height={48} className="atlas-marker-face" />;
}

export function AtlasTrail({
  nodes,
  runs,
  aspect,
  biomeDungeonId = null,
  markerId,
  markerDefId,
  glideMarker = false,
  shakingId,
  concealedIds,
  pinnedIds,
  notes,
  onNodeClick,
  onNodeHover,
  segmentRefs,
  markerRef,
}: AtlasTrailProps) {
  const H = Math.round(100 * aspect);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const marker = byId.get(markerId);

  // The ley-pulse needs its own handle on the segment geometry (the mask
  // paths), independent of whether the caller wired segmentRefs.
  const pulsePaths = useRef(new Map<string, SVGPathElement>());

  const registerSegment = (childId: string) => (el: SVGPathElement | null) => {
    if (el) pulsePaths.current.set(childId, el);
    else pulsePaths.current.delete(childId);
    if (!segmentRefs) return;
    if (el) segmentRefs.current.set(childId, el);
    else segmentRefs.current.delete(childId);
  };

  // --- Enchanted Chart: the ley-pulse -----------------------------------------
  // A golden comet travels the conquered stretch of the first run (the world
  // trunk / the floor trail), looping every few seconds. Presentation-only rAF
  // on absolutely-positioned spans — React state never ticks.
  const pulseHead = useRef<HTMLSpanElement>(null);
  const pulseTail = [
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
    useRef<HTMLSpanElement>(null),
  ];
  const pulseIds = runs[0]
    .slice(1)
    .filter(
      (id) =>
        byId.get(id)!.state !== "locked" && !(concealedIds?.has(id) ?? false)
    );
  const pulseSig = pulseIds.join("+");
  useEffect(() => {
    if (prefersReducedMotion() || pulseIds.length === 0) return;
    const dots = [pulseHead.current, ...pulseTail.map((r) => r.current)];
    if (dots.some((d) => !d)) return;
    const segs = pulseIds
      .map((id) => pulsePaths.current.get(id))
      .filter((p): p is SVGPathElement => !!p)
      .map((p) => ({ p, len: p.getTotalLength() }));
    const total = segs.reduce((s, x) => s + x.len, 0);
    if (total <= 0) return;
    const at = (dist: number) => {
      for (const s of segs) {
        if (dist <= s.len) return s.p.getPointAtLength(dist);
        dist -= s.len;
      }
      return segs[segs.length - 1].p.getPointAtLength(segs[segs.length - 1].len);
    };
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const head = (((now - start) / 1000) * 13) % (total + 18);
      dots.forEach((el, k) => {
        const d = head - k * 1.5;
        if (d < 0 || d > total) {
          el!.style.opacity = "0";
        } else {
          const pt = at(d);
          el!.style.opacity = String(0.85 * (1 - k / 4));
          el!.style.left = `${pt.x}%`;
          el!.style.top = `${(pt.y / H) * 100}%`;
        }
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseSig, H]);

  // Fog banks: rolling mist over the world's uncharted regions / a dungeon's
  // undescended locked steps. Deterministic per node (hash01), CSS-animated.
  const fogNodes = nodes.filter((n) =>
    biomeDungeonId ? n.state === "locked" : n.uncharted
  );
  const current = nodes.find((n) => n.state === "current");

  return (
    <div className="atlas-trail" style={{ aspectRatio: `100 / ${H}` }}>
      <svg
        className="atlas-paths"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <BiomeLayer
          nodes={nodes}
          H={H}
          floorDungeonId={biomeDungeonId}
          concealedIds={concealedIds}
        />
        {runs.map((run) => {
          const pts = run.map((id) => {
            const n = byId.get(id);
            if (!n) throw new Error(`Trail run references unknown node ${id}`);
            return { x: n.x * 100, y: n.y * H };
          });
          const { segments } = trailPath(pts);
          return segments.map((d, i) => {
            const childId = run[i + 1];
            const child = byId.get(childId)!;
            const concealed = concealedIds?.has(childId) ?? false;
            const faint = displayState(child, concealed) === "locked";
            const maskId = `atlas-mask-${cssSafe(childId)}`;
            return (
              <g key={childId}>
                <mask
                  id={maskId}
                  maskUnits="userSpaceOnUse"
                  x={-5}
                  y={-5}
                  width={110}
                  height={H + 10}
                >
                  <path
                    ref={registerSegment(childId)}
                    d={d}
                    pathLength={1}
                    className="atlas-seg-mask"
                    style={{ strokeDashoffset: concealed ? 1 : 0 }}
                  />
                </mask>
                {/* Worn-road halo under the dots — keeps the trail readable
                    on any painted terrain. Same mask, so the ceremony's
                    draw-in reveals halo and dots together. */}
                <path
                  d={d}
                  className={`atlas-seg-halo${child.uncharted ? " fogged" : ""}`}
                  mask={`url(#${maskId})`}
                />
                <path
                  d={d}
                  className={`atlas-seg${faint ? " faint" : ""}${
                    child.uncharted ? " fogged" : ""
                  }`}
                  mask={`url(#${maskId})`}
                />
              </g>
            );
          });
        })}
      </svg>

      {/* Enchanted Chart: the ley-pulse comet + tail (positioned by rAF). */}
      <span className="atlas-leypulse head" ref={pulseHead} aria-hidden />
      {pulseTail.map((r, i) => (
        <span key={i} className="atlas-leypulse" ref={r} aria-hidden />
      ))}

      {/* Enchanted Chart: rolling fog over uncharted / undescended ground. */}
      <div className="atlas-fogbank" aria-hidden>
        {fogNodes.flatMap((n) =>
          [0, 1, 2].map((k) => {
            const key = `${n.id}~${k}`;
            const w = biomeDungeonId
              ? 20 + hash01(`${key}w`) * 12
              : 26 + hash01(`${key}w`) * 16;
            return (
              <span
                key={key}
                className="atlas-fog"
                style={{
                  left: `${n.x * 100 + (hash01(`${key}x`) - 0.5) * 24}%`,
                  top: `${n.y * 100 + (hash01(`${key}y`) - 0.5) * 9}%`,
                  width: `${w}%`,
                  animationDelay: `${(-hash01(`${key}d`) * 9).toFixed(2)}s`,
                  animationDuration: `${(7 + hash01(`${key}s`) * 5).toFixed(2)}s`,
                }}
              />
            );
          })
        )}
      </div>

      {/* Living-map dressing: drifting embers. (Corner torch sconces removed.) */}
      <div className="atlas-embers" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="atlas-ember" />
        ))}
      </div>

      {/* Enchanted Chart: drifting arcane runes (floor views). */}
      {biomeDungeonId && (
        <div className="atlas-runes" aria-hidden>
          {["ᚠ", "ᚱ", "ᛒ", "ᛞ", "ᛟ"].map((ch, i) => (
            <span key={i} className="atlas-rune">
              {ch}
            </span>
          ))}
        </div>
      )}

      {/* Enchanted Chart: rotating runic circle under the entry node. */}
      {biomeDungeonId && current && (
        <span
          className="atlas-runecircle"
          style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
          aria-hidden
        >
          <span className="atlas-runecircle-ring" />
          {["ᚠ", "ᛒ", "ᛞ", "ᛟ"].map((ch, i) => (
            <span key={i} className={`atlas-runecircle-glyph g${i}`}>
              {ch}
            </span>
          ))}
        </span>
      )}

      {/* Enchanted Chart: inked compass rose (world view). */}
      {!biomeDungeonId && (
        <span className="atlas-compass" aria-hidden>
          <svg viewBox="0 0 24 24">
            <circle cx={12} cy={12} r={9} fill="none" stroke="#3a2f22" strokeWidth={0.7} />
            <circle cx={12} cy={12} r={6.2} fill="none" stroke="#3a2f22" strokeWidth={0.6} />
            <g stroke="#3a2f22" strokeWidth={0.7}>
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i * Math.PI) / 4;
                return (
                  <line
                    key={i}
                    x1={12 + Math.cos(a) * 7.4}
                    y1={12 + Math.sin(a) * 7.4}
                    x2={12 + Math.cos(a) * 9}
                    y2={12 + Math.sin(a) * 9}
                  />
                );
              })}
            </g>
            <path
              className="atlas-compass-needle"
              d="M12,4.5 L14,13.5 L12,12 L10,13.5 Z"
              fill="#8c2820"
              stroke="none"
            />
            <text x={12} y={2.6} textAnchor="middle" fontSize={3.4} fontWeight={700} fill="#3a2f22">
              N
            </text>
          </svg>
        </span>
      )}

      {/* Hand-written margin notes (lore annotations). */}
      {notes?.map((note) => {
        const n = byId.get(note.nodeId);
        if (!n) return null;
        const leftOf = n.x > 0.55;
        return (
          <span
            key={note.nodeId}
            className={`atlas-note ${leftOf ? "left-of" : "right-of"}`}
            style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
            aria-hidden
          >
            {note.text}
          </span>
        );
      })}

      {nodes.map((node) => {
        const concealed = concealedIds?.has(node.id) ?? false;
        const state = displayState(node, concealed);
        const isWorld = !node.id.includes(":");
        return (
          <button
            key={node.id}
            type="button"
            data-node-id={node.id}
            className={`atlas-node ${state}${isWorld ? " world" : ""}${
              node.boss ? " boss" : ""
            }${node.uncharted ? " uncharted" : ""}${
              shakingId === node.id ? " shaking" : ""
            }`}
            style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
            aria-label={
              node.uncharted
                ? "Uncharted region"
                : state === "locked"
                  ? `${node.label} — locked`
                  : node.label
            }
            aria-disabled={state === "locked"}
            onClick={() => onNodeClick(node)}
            onPointerEnter={onNodeHover ? () => onNodeHover(node) : undefined}
          >
            <span className="atlas-node-circle" aria-hidden>
              <span className="atlas-node-glyph">
                {(() => {
                  const icon = nodeIcon(node, state);
                  return icon ? <GameIcon name={icon} /> : nodeText(node, state);
                })()}
              </span>
              {isWorld && state === "completed" && (
                <span className="atlas-node-check">✓</span>
              )}
            </span>
            {state === "current" && (
              <>
                <span className="atlas-orbit" aria-hidden>
                  <span className="atlas-orbit-dot" />
                </span>
                <span className="atlas-orbit second" aria-hidden>
                  <span className="atlas-orbit-dot" />
                </span>
              </>
            )}
            {state === "completed" && BANNERS[node.id] && (
              <span className="atlas-banner" aria-hidden>
                <GameIcon name={BANNERS[node.id]} />
              </span>
            )}
            {pinnedIds?.has(node.id) && !node.uncharted && (
              <span className="atlas-pin" aria-hidden>
                !
              </span>
            )}
            <span className="atlas-node-label" aria-hidden>
              {/* World nodes keep their dungeon name; floor numbers are hidden
                  (abstract descent), with only the boss lair labelled. */}
              {isWorld ? (
                node.label
              ) : node.boss && state !== "locked" ? (
                <>
                  <GameIcon name="bossSkull" /> The Lair
                </>
              ) : (
                ""
              )}
            </span>
          </button>
        );
      })}

      {marker && (
        <>
          {/* Enchanted Chart: "you are here" ripple at the marker's node. */}
          <span
            className={`atlas-marker-ripple${glideMarker ? " gliding" : ""}`}
            style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
            aria-hidden
          />
          <div
            ref={markerRef}
            className={`atlas-marker${glideMarker ? " gliding" : ""}`}
            style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
            aria-hidden
          >
            <span className="atlas-marker-flame" />
            {markerDefId && (
              <span className="atlas-marker-ring">
                <MarkerBadge defId={markerDefId} />
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
