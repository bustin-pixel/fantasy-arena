// ============================================================================
// DungeonAtlas — the full-screen parchment map that replaced the flat
// dungeon/floor list sheets. Two levels in one overlay: the WORLD trail (the
// 9-dungeon gate chain winding up the parchment, forking after the Eclipse
// Spire) and each dungeon's FLOOR trail (an ABSTRACT descent now — floor
// numbers are hidden). Tapping an unlocked dungeon zooms into its trail;
// tapping into the trail opens the dungeon overview with the Enter Dungeon
// button; tapping a locked world node shakes it and whispers why. The RNG
// "hunt for the boss" descent starts a run at floor 1 and stays in the battle
// screen floor-to-floor — the atlas is not revisited between floors, so there
// is no per-floor node-to-node animation.
//
// Unlock ceremony: a dungeon cleared since the atlas was last viewed (the
// atlasSeen side-store) plays back on open — the new WORLD path segment draws
// itself in, the marker walks it, the node lights up. The seen store is
// written on unmount, so a bailed ceremony just replays next time. This is why
// clearing a dungeon returns to the atlas world map (App.openAtlasWorld).
//
// Conventions: .detail-overlay root (pager-swipe exempt), body.modal-open +
// Escape lifecycle, BookOverlay's phase-class state machine for enter/close/
// level transitions. All JS-driven motion checks prefersReducedMotion.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FLOOR_ASPECT,
  WORLD_ASPECT,
  floorNodes,
  markerNodeId,
  worldNodes,
  worldTrailPlan,
  type TrailNode,
} from "@/data/atlasLayout";
import { DUNGEONS, getDungeon } from "@/data/dungeons";
import { questUnlockIds } from "@/data/depths";
import { ATLAS_BIOMES, FOG_GROUND } from "@/data/atlasBiomes";
import { averageDeckLevel, LEVEL_CAP, levelFromXp } from "@/meta/leveling";
import type { TierId } from "@/data/tiers";
import { highestClearedFloorOf } from "@/state/persistence";
import { useGameState } from "@/state/GameStateContext";
import { playSfx } from "@/audio/sfx";
import { prefersReducedMotion } from "@/utils/motion";
import {
  markAllSeen,
  pendingUnlocks,
  readAtlasSeen,
} from "./atlasSeen";
import { AtlasTrail, type TrailNote } from "./AtlasTrail";
import { FloorInfoPanel } from "./FloorInfoPanel";

type View = { level: "world" } | { level: "floors"; dungeonId: string };
type Phase = "enter" | "open" | "level-out" | "level-in" | "closing";

/** Must match the .dungeon-atlas transition durations in styles.css. */
const LEVEL_MS = 240;
const CLOSE_MS = 280;
const DRAW_MS = 700;
const SLIDE_MS = 600;
const SHAKE_MS = 420;
const TOAST_MS = 2000;

/** A world-trail ceremony (a gate flip revealed new dungeon node(s)). */
interface WorldPending {
  fromId: string;
  unlockedIds: string[];
}

/** The ceremony currently animating. Concealed nodes render still-locked with
 *  their inbound segment undrawn; the marker starts on `markerFrom`. */
interface Ceremony {
  concealed: Set<string>;
  markerFrom: string;
  markerTo: string;
}

/** Stroke-draws a concealed segment's mask path (pathLength=1 dash trick).
 *  A JS-set transition, not a keyframe: the global reduced-motion CSS block
 *  would silently kill a keyframe, and we need a completion signal. */
function animateStrokeDraw(el: SVGPathElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.style.transition = "";
      el.style.strokeDashoffset = "0";
      resolve();
    };
    el.style.transition = `stroke-dashoffset ${ms}ms ease-in-out`;
    void el.getBoundingClientRect(); // commit the start value before moving it
    el.style.strokeDashoffset = "0";
    el.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, ms + 150); // fallback if transitionend is eaten
  });
}

/** Slides the marker element along a segment path via getPointAtLength.
 *  `vbH` is the trail's viewBox height (x is already in 0..100 = percent). */
function slideMarkerAlong(
  el: HTMLDivElement,
  path: SVGPathElement,
  vbH: number,
  ms: number
): Promise<void> {
  return new Promise((resolve) => {
    const total = path.getTotalLength();
    const start = performance.now();
    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const p = path.getPointAtLength(ease(t) * total);
      el.style.left = `${p.x}%`;
      el.style.top = `${(p.y / vbH) * 100}%`;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export interface DungeonAtlasProps {
  /** Start a fresh RUN in this dungeon at the picked difficulty tier (the
   *  "Enter Dungeon" button). The RNG "hunt for the boss" descent begins at
   *  floor 1 and stays in the battle screen floor-to-floor — the atlas is no
   *  longer visited between floors. */
  onEnterDungeon: (dungeonId: string, tier: TierId) => void;
  onClose: () => void;
}

export function DungeonAtlas({
  onEnterDungeon,
  onClose,
}: DungeonAtlasProps) {
  const { save } = useGameState();
  const [view, setView] = useState<View>({ level: "world" });
  const [phase, setPhase] = useState<Phase>("enter");
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [infoFloor, setInfoFloor] = useState<number | null>(null);
  const [shakingId, setShakingId] = useState<string | null>(null);
  // The marker follows the player's selection ("you are here"): the dungeon /
  // floor they last tapped, overriding the progress-based default. Persists for
  // the life of the overlay (a win → entering a floor → unmount → fresh mount
  // reseeds it from progress, which is "until we progress"). selectedFloorId is
  // a full "dungeon:floor" id, so switching dungeons naturally invalidates it.
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  // Floor-view viewBox height (in 100-width units), measured from the available
  // area so the map fills the page — see the measuring effect below. Defaults
  // to the authored aspect until the first layout measure lands.
  const [floorViewH, setFloorViewH] = useState(() =>
    Math.round(100 * FLOOR_ASPECT)
  );

  // World-trail unlock ceremonies owed (a gate flip revealed new dungeon
  // node(s)). Computed in a useState initializer so StrictMode's dev
  // double-render can't recompute after a write. A null store = an existing
  // save meeting the atlas for the first time → seed silently, celebrate
  // nothing. (Per-floor ceremonies are gone: the RNG descent never returns to
  // the atlas between floors, so there is nothing to animate node-to-node.)
  const [pendingWorld, setPendingWorld] = useState<WorldPending[]>(() => {
    const seen = readAtlasSeen();
    if (seen === null) {
      markAllSeen(save); // first meeting — seed so old progress never replays
      return [];
    }
    return pendingUnlocks(save, seen)
      .filter((p) => p.unlockedDungeonIds.length > 0)
      .map((p) => ({ fromId: p.dungeonId, unlockedIds: p.unlockedDungeonIds }));
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef(new Map<string, SVGPathElement>());
  const markerElRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const shakeTimer = useRef<number | null>(null);

  // Live refs for the single window keydown listener.
  const viewRef = useRef(view);
  viewRef.current = view;
  const infoFloorRef = useRef(infoFloor);
  infoFloorRef.current = infoFloor;
  const saveRef = useRef(save);
  saveRef.current = save;

  const warbandLv = averageDeckLevel(
    save.deck,
    Object.fromEntries(
      save.deck.map((id) => [id, levelFromXp(save.unitXp[id] ?? 0)])
    )
  );

  const beginClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    playSfx("uiClose");
    setPhase("closing");
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : CLOSE_MS);
  };

  // Entrance beat, then settle open.
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("open"), 20);
    return () => clearTimeout(t);
  }, []);

  // Fill the page: a floor trail's viewBox height tracks the actual available
  // area (scroll viewport) so the painted terrain runs edge-to-edge instead of
  // sitting in letterbox strips. Because the trail box keeps aspect === viewBox
  // aspect, the SVG stays uniform (no doodad distortion) and the % -positioned
  // nodes never drift off the dots — the floors simply get more room. Clamped
  // to the authored minimum so a wide/short screen keeps the designed shape and
  // just scrolls. (World view keeps its taller fixed aspect — it needs the room
  // to space nine dungeons and is meant to scroll.)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setFloorViewH(
          Math.max(Math.round(100 * FLOOR_ASPECT), Math.round((100 * h) / w))
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Map-room ambience: the parchment unrolls on open. (The recurring distant
  // torch crackle was removed with the corner sconces.)
  useEffect(() => {
    playSfx("mapRustle");
  }, []);

  // Escape peels layers: info panel → back to world → close. Plus the modal
  // scroll freeze, for the overlay's whole life.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoFloorRef.current != null) {
        playSfx("uiClose");
        setInfoFloor(null);
      } else if (viewRef.current.level === "floors") {
        goWorld();
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

  // Whatever way the atlas leaves (close button, ESC, entering a floor), the
  // save's current progress counts as celebrated. Idempotent by construction.
  useEffect(() => {
    return () => markAllSeen(saveRef.current);
  }, []);

  // Center the action (the current node, else the marker) whenever the shown
  // view changes. A LAYOUT effect keyed on `view`, NOT a post-paint effect: it
  // runs at the level-in commit — the moment the new view's nodes exist — and
  // sets the scroll BEFORE the browser paints, so the zoom-in reveals an
  // already-centered trail. As a plain post-paint effect it painted the
  // un-scrolled view for a frame, then snap-scrolled to center — the "jump" the
  // whole atlas made as a dungeon (and its overview) opened on a scrollable trail.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>(".atlas-node.current") ??
      root.querySelector<HTMLElement>(".atlas-marker");
    target?.scrollIntoView({ block: "center" });
  }, [view]);

  // (Removed the info-panel scroll-nudge. It re-scrolled the trail every time
  //  the overview opened — a visible jolt of the whole atlas, worst in the
  //  auto-open flow where it fired in the same commit as the view-settle
  //  centering above. In the RNG-descent model the panel is a DUNGEON overview
  //  (floor numbers hidden, runs start at floor 1), so keeping a specific floor
  //  node above the sheet no longer matters — the settle-centering already
  //  frames the entrance.)

  // Toast self-clears.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast({ msg, key: Date.now() });

  const shakeNode = (id: string) => {
    playSfx("chainRattle");
    if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    setShakingId(id);
    shakeTimer.current = window.setTimeout(() => {
      setShakingId(null);
      shakeTimer.current = null;
    }, SHAKE_MS);
  };

  // --- Level transitions (zoom out of the world map into a dungeon) --------
  // `openInfo`: auto-open the dungeon overview once the zoom settles, so tapping
  // a dungeon lands you on the Enter button with no second tap on a floor node.
  // Opening it AT the landing (not up front) keeps the sheet from sliding up
  // while the map is still zooming, and lets the panel's node-nudge scroll run
  // with the floor view already active.
  const goFloors = (node: TrailNode, openInfo = false) => {
    playSfx("uiSelect");
    setZoomOrigin(`${node.x * 100}% ${node.y * 100}%`);
    // The overview is a DUNGEON overview and a run always starts at floor 1, so
    // the entrance node stands in as the "you are here" mark and info target.
    const landed = () => {
      if (!openInfo) return;
      setSelectedFloorId(`${node.id}:1`);
      setInfoFloor(1);
    };
    if (prefersReducedMotion()) {
      setView({ level: "floors", dungeonId: node.id });
      landed();
      return;
    }
    setPhase("level-out");
    window.setTimeout(() => {
      setView({ level: "floors", dungeonId: node.id });
      setPhase("level-in");
      window.setTimeout(() => {
        setPhase("open");
        landed();
      }, LEVEL_MS);
    }, LEVEL_MS);
  };

  const goWorld = () => {
    playSfx("uiTap");
    setInfoFloor(null);
    if (prefersReducedMotion()) {
      setView({ level: "world" });
      return;
    }
    setPhase("level-out");
    window.setTimeout(() => {
      setView({ level: "world" });
      setPhase("level-in");
      window.setTimeout(() => setPhase("open"), LEVEL_MS);
    }, LEVEL_MS);
  };

  // --- Node taps ------------------------------------------------------------
  const onWorldNode = (node: TrailNode) => {
    if (ceremony) return;
    if (node.state === "locked") {
      shakeNode(node.id);
      if (node.uncharted) {
        // Fog of war: don't leak the name or the gate — only that it's beyond.
        showToast("Uncharted — the path beyond is not yet drawn…");
        return;
      }
      const gate = getDungeon(node.id).gate;
      // Gate wording drops the floor number (floors are hidden now): the gate
      // opens by CLEARING the prerequisite dungeon, i.e. defeating its boss.
      showToast(
        gate
          ? `Locked — clear ${getDungeon(gate.dungeonId).name} first`
          : "Locked"
      );
      return;
    }
    // Move the "you are here" marker onto the picked dungeon, then zoom in AND
    // auto-open its overview (goFloors sets the floor pick on landing) so one tap
    // gets you straight to the Enter Dungeon button.
    setSelectedWorldId(node.id);
    goFloors(node, true);
  };

  const onFloorNode = (node: TrailNode) => {
    if (ceremony) return;
    // The avatar can only march to an UNLOCKED floor — deeper floors are
    // uncharted until you descend into them during a run (same rule as the
    // locked world nodes). Tapping one shakes it and whispers why; the marker
    // never lands there. The unlocked step (floor 1, or any floor once the
    // dungeon is cleared) opens the dungeon overview + "Enter Dungeon".
    if (node.state === "locked") {
      shakeNode(node.id);
      showToast("Uncharted — descend from the entrance to reach it");
      return;
    }
    playSfx("uiSelect");
    setSelectedFloorId(node.id);
    setInfoFloor(Number(node.id.split(":")[1]));
  };

  // --- Unlock ceremony -------------------------------------------------------
  // When the settled view owes one, conceal the new node(s), draw the segment
  // in, walk the marker, then reveal. Consumed in memory; the seen store is
  // written on unmount.
  useEffect(() => {
    if (phase !== "open" || ceremony || closingRef.current) return;
    // World-trail ceremonies only (a cleared dungeon flips its gate open). The
    // per-floor descent no longer returns to the atlas, so there is no floor
    // node-to-node animation.
    if (view.level !== "world") return;
    const wp = pendingWorld[0];
    if (!wp) return;
    const owed: Ceremony = {
      concealed: new Set(wp.unlockedIds),
      markerFrom: wp.fromId,
      // A single unlock walks the marker onto it; a fork reveal (both endgame
      // doors at once) leaves the marker at the crossroads.
      markerTo: wp.unlockedIds.length === 1 ? wp.unlockedIds[0] : wp.fromId,
    };
    const consume = () => setPendingWorld((rest) => rest.slice(1));

    if (prefersReducedMotion()) {
      consume();
      return;
    }

    const c = owed;
    let cancelled = false;
    setCeremony(c);
    (async () => {
      await new Promise((r) => window.setTimeout(r, 450)); // let the view land
      if (cancelled) return;
      const draws: Promise<void>[] = [];
      for (const id of c.concealed) {
        const seg = segmentRefs.current.get(id);
        if (seg) draws.push(animateStrokeDraw(seg, DRAW_MS));
      }
      await Promise.all(draws);
      if (cancelled) return;
      const markerEl = markerElRef.current;
      const walkSeg = segmentRefs.current.get(c.markerTo);
      if (c.markerTo !== c.markerFrom && markerEl && walkSeg) {
        // Ceremonies are world-view only now, so the viewBox is the world aspect.
        const vbH = Math.round(100 * WORLD_ASPECT);
        await slideMarkerAlong(markerEl, walkSeg, vbH, SLIDE_MS);
      }
      if (cancelled) return;
      playSfx("unlockFanfare");
      consume();
      setCeremony(null);
    })();
    return () => {
      cancelled = true;
      setCeremony(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view, pendingWorld]);

  // --- Render ----------------------------------------------------------------
  const dungeon = view.level === "floors" ? getDungeon(view.dungeonId) : null;
  const nodes = dungeon
    ? floorNodes(dungeon, highestClearedFloorOf(save, dungeon.id))
    : worldNodes((id) => highestClearedFloorOf(save, id));
  const runs = dungeon
    ? [nodes.map((n) => n.id)]
    : (() => {
        const plan = worldTrailPlan();
        return [plan.trunk, ...plan.branches];
      })();
  const aspect = dungeon ? floorViewH / 100 : WORLD_ASPECT;
  // "You are here" = the player's live selection if it's a node in this view,
  // else the progress default. A ceremony always parks it at its start node.
  const selectedId = dungeon ? selectedFloorId : selectedWorldId;
  const selectedHere =
    selectedId != null && nodes.some((n) => n.id === selectedId);
  const markerId = ceremony
    ? ceremony.markerFrom
    : selectedHere
      ? (selectedId as string)
      : // Floor view: a cleared dungeon starts the marker at the entrance (you
        // re-enter at floor 1), not on the boss it once ended on.
        markerNodeId(nodes, !!dungeon);

  // Bleed the biome terrain into the letterbox strips above/below the aspect-
  // locked trail so the map reads edge-to-edge instead of framed in dead gray.
  // Floor view = that dungeon's solid ground tone (matches the painted ground's
  // own edges → the seam vanishes under the map's inset vignette). World view =
  // a top-biome→Depths gradient echoing the seamless multi-biome ground.
  const tone = (n: TrailNode) =>
    n.uncharted ? FOG_GROUND : ATLAS_BIOMES[n.id]?.ground ?? FOG_GROUND;
  const mapFill = dungeon
    ? ATLAS_BIOMES[dungeon.id]?.ground ?? FOG_GROUND
    : nodes.length === 0
      ? FOG_GROUND
      : (() => {
          let top = nodes[0];
          let bot = nodes[0];
          for (const n of nodes) {
            if (n.y < top.y) top = n;
            if (n.y > bot.y) bot = n;
          }
          return `linear-gradient(180deg, ${tone(top)}, ${tone(bot)})`;
        })();

  // Wax-seal "!" on the floor hosting this dungeon's unfinished quest.
  let pinnedIds: Set<string> | undefined;
  if (dungeon?.quest) {
    const questDone = questUnlockIds(dungeon.quest).every(
      (id) => save.questUnlocks.includes(id) || save.unlockedUnits.includes(id)
    );
    if (!questDone) pinnedIds = new Set([`${dungeon.id}:${dungeon.quest.floor}`]);
  }

  // Hand-written margin notes (world view only): lore beside the frontier
  // dungeons, plus a tease on the next visible gate. Capped to avoid clutter.
  let notes: TrailNote[] | undefined;
  if (!dungeon) {
    notes = nodes
      .filter((n) => n.state === "current")
      .map((n) => ({ nodeId: n.id, text: DUNGEONS[n.id].entryHint }));
    const nextGate = nodes.find((n) => n.state === "locked" && !n.uncharted);
    if (nextGate) {
      notes.push({ nodeId: nextGate.id, text: DUNGEONS[nextGate.id].entryHint });
    }
    notes = notes.slice(0, 3);
  }

  // The atlas whispers when the pointer crosses the frontier (world view).
  const onNodeHover = (node: TrailNode) => {
    if (!dungeon && node.state === "current") playSfx("mapWhisper");
  };

  return (
    <div
      className={`detail-overlay dungeon-atlas phase-${phase}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) beginClose();
      }}
    >
      <div
        className="atlas-modal"
        role="dialog"
        aria-label="Dungeon Atlas"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={beginClose} aria-label="Close">
          ✕
        </button>

        <header className="atlas-header">
          {dungeon ? (
            <>
              <button type="button" className="atlas-back" onClick={goWorld}>
                ‹ Atlas
              </button>
              <h3 className="atlas-title">{dungeon.name}</h3>
              <p className="atlas-sub">
                Recommended: Lv {Math.min(LEVEL_CAP, dungeon.monsterLevel + 1)}+
                {warbandLv < dungeon.monsterLevel ? " · underleveled ⚠" : ""}
              </p>
              <p className="atlas-hint">{dungeon.entryHint}</p>
            </>
          ) : (
            <>
              <h3 className="atlas-title">Dungeon Atlas</h3>
              <p className="atlas-sub">Your warband: Lv {warbandLv}</p>
            </>
          )}
        </header>

        <div className="atlas-scroll" ref={scrollRef}>
          <div
            className="atlas-map"
            style={{ transformOrigin: zoomOrigin, background: mapFill }}
            key={view.level === "floors" ? view.dungeonId : "world"}
          >
            <AtlasTrail
              nodes={nodes}
              runs={runs}
              aspect={aspect}
              biomeDungeonId={dungeon?.id ?? null}
              markerId={markerId}
              markerDefId={save.deck[0]}
              glideMarker={!ceremony}
              shakingId={shakingId}
              concealedIds={ceremony?.concealed}
              pinnedIds={pinnedIds}
              notes={notes}
              onNodeClick={dungeon ? onFloorNode : onWorldNode}
              onNodeHover={onNodeHover}
              segmentRefs={segmentRefs}
              markerRef={markerElRef}
            />
          </div>
        </div>

        {toast && (
          <div className="atlas-toast" key={toast.key} role="status">
            {toast.msg}
          </div>
        )}

        {dungeon && infoFloor != null && (
          <FloorInfoPanel
            dungeon={dungeon}
            save={save}
            warbandLv={warbandLv}
            onEnter={(tier) => onEnterDungeon(dungeon.id, tier)}
            onClose={() => setInfoFloor(null)}
          />
        )}
      </div>
    </div>
  );
}
