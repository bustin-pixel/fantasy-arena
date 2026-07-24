/**
 * Hi-bit pixel sprite registry — the raster half of `drawUnitSprite`.
 *
 * Units listed in the manifest draw from generated PNGs instead of the
 * procedural canvas code in `sprites.ts`. Everything else keeps drawing
 * procedurally; that path is the permanent fallback, not a temporary one.
 *
 * The generation recipe and the palette/anchor contract live in
 * `docs/pixel-sprite-style.md`. Cell geometry is PUBLISHED IN THE MANIFEST and
 * rides on each PixelFrame, so it cannot drift from the art it describes.
 *
 * Coverage is deliberately uneven and the drawing code has to cope:
 *   - the first conversions (ogre, knight) carry stills + idle/walk/attack in
 *     all 8 directions; units converted since ship only the 4 diagonals
 *     (se/ne generated, sw/nw mirrored at export)
 *   - death + corpse only for the facings that have been generated
 * A facing with no art snaps to the nearest one that has some
 * (`nearestFacingWithArt`), and a missing piece falls back one level rather
 * than drawing nothing — a unit with no idle clip draws its still, which is
 * what every unit did before idle clips existed.
 */

/**
 * FALLBACK cell geometry, used only until the manifest loads.
 *
 * ⚠ The real values come from the manifest and ride on each `PixelFrame` —
 * these are not the source of truth. The cell is the CANVAS, not the character:
 * it was widened 64 -> 80 to give a punch room to extend without being cropped
 * or scaled down, and the body did not change size at all (the pixelizer sizes
 * bodies by its own TARGET_BODY, independent of the cell).
 *
 * Reading it per frame also means two units may ship different cell sizes,
 * which is what lets a future oversized unit grow without touching this file.
 *
 * Authored small on purpose either way: integer UPscaling of pixel art is
 * lossless, integer downscaling is not.
 */
export const CELL = 80;
/** The foot point inside the cell. Every facing and every animation frame is
 *  anchored here by the pixelizer, so a unit does not jitter between frames.
 *  This is what the blit aligns to the ground line. */
export const ANCHOR_X = 40;
export const ANCHOR_Y = 72;

/** The 8 facings, in the order `dir8Index` returns. */
export const DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;
export type Dir8 = (typeof DIRS)[number];

interface StripEntry {
  file: string;
  frames: number;
  /** Attacks only: index of the frame where the blow lands. */
  hit?: number;
}
interface UnitManifest {
  /** Cell geometry for THIS unit. Absent on manifests written before the cell
   *  became publishable, which then fall back to the module constants. */
  cell?: number;
  anchor?: [number, number];
  /** Export stamp, appended to this unit's image URLs as a cache key. */
  version?: number;
  still: Partial<Record<Dir8, string>>;
  /** Optional: manifests exported before idle clips existed have no key. */
  idle?: Partial<Record<Dir8, StripEntry>>;
  walk: Partial<Record<Dir8, StripEntry>>;
  attack: Partial<Record<Dir8, StripEntry>>;
  /** Optional: fire-while-moving strip for ranged units. Only units whose
   *  art has been generated carry the key; everyone else falls back to
   *  `attack` in getPixelFrame, so coverage can grow one unit at a time. */
  walk_attack?: Partial<Record<Dir8, StripEntry>>;
  death: Partial<Record<Dir8, StripEntry>>;
  corpse: Partial<Record<Dir8, string>>;
}

/** A decoded strip: the image plus how many cells sit along it. */
export interface Strip {
  img: HTMLImageElement;
  frames: number;
  /** Attacks only: index of the frame where the blow lands. See getPixelFrame. */
  hit?: number;
}

interface LoadedUnit {
  cell: number;
  ax: number;
  ay: number;
  still: Partial<Record<Dir8, HTMLImageElement>>;
  idle: Partial<Record<Dir8, Strip>>;
  walk: Partial<Record<Dir8, Strip>>;
  attack: Partial<Record<Dir8, Strip>>;
  walk_attack: Partial<Record<Dir8, Strip>>;
  death: Partial<Record<Dir8, Strip>>;
  corpse: Partial<Record<Dir8, HTMLImageElement>>;
}

/** `base` is relative ("./") so the built bundle works from a domain root or a
 *  subpath — see the `base` comment in vite.config.ts. */
const ROOT = `${import.meta.env.BASE_URL}sprites/pixel/`;

let manifest: Record<string, UnitManifest> | null = null;
let manifestState: "idle" | "loading" | "done" | "failed" = "idle";
const loaded = new Map<string, LoadedUnit | null>();
const started = new Set<string>();

/**
 * Map a direction vector to one of the 8 facings.
 *
 * Screen space: +x is right, +y is DOWN, so "south" (toward the camera) is +y.
 * Index order matches `DIRS`, walking counter-clockwise on screen from south.
 * A zero-length vector has no meaningful direction and falls back to south.
 */
export function dir8Index(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  // atan2(-dy, dx) puts 0 at east and increases counter-clockwise on screen;
  // rotating by +90deg puts 0 at south, matching DIRS[0].
  const a = Math.atan2(-dy, dx) + Math.PI / 2;
  const i = Math.round(a / ((Math.PI * 2) / 8));
  return ((i % 8) + 8) % 8;
}

/**
 * Resolve a requested facing to the nearest one that actually has art.
 *
 * Units converted under the diagonal-4 scheme ship only se/ne (+ mirrored
 * sw/nw), and death/corpse have always been a subset — every lookup therefore
 * goes through this instead of assuming its exact facing exists. Exact matches
 * resolve to themselves, so full 8-facing units are untouched.
 *
 * Ties (a cardinal between two diagonals) break toward the camera-facing
 * candidate — the southern view is the one the player actually reads — then by
 * `DIRS` index so the pick is deterministic.
 */
export function nearestFacingWithArt(
  arts: Partial<Record<Dir8, unknown>>,
  dir: number
): Dir8 | null {
  const d = ((dir % 8) + 8) % 8;
  if (arts[DIRS[d]] !== undefined) return DIRS[d];
  let best: Dir8 | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 8; i++) {
    if (arts[DIRS[i]] === undefined) continue;
    const ring = Math.min((i - d + 8) % 8, (d - i + 8) % 8);
    const fromSouth = Math.min(i, 8 - i);
    // Ring distance dominates, then southernness, then index — strictly
    // ordered so no two candidates ever score equal.
    const score = ring * 100 + fromSouth * 10 + i;
    if (score < bestScore) {
      bestScore = score;
      best = DIRS[i];
    }
  }
  return best;
}

/** Kick off manifest + asset loading. Safe to call every frame. */
function ensureLoaded(defId: string): LoadedUnit | null {
  if (manifestState === "idle") {
    manifestState = "loading";
    // ⚠ `no-cache` REVALIDATES (it does not skip the cache). The sprite
    // filenames are stable across exports, so this tiny JSON is the only thing
    // that can tell the client its images went stale — serving it from cache
    // would hide a geometry change behind old art. See the version note below.
    void fetch(`${ROOT}manifest.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
      .then((m) => {
        manifest = m;
        manifestState = "done";
      })
      .catch(() => {
        // No manifest = no pixel art anywhere. The whole roster stays
        // procedural, which is a complete and correct drawing.
        manifestState = "failed";
      });
  }
  if (manifestState !== "done" || !manifest) return null;

  const cached = loaded.get(defId);
  if (cached !== undefined) return cached;
  if (!manifest[defId]) {
    loaded.set(defId, null);
    return null;
  }
  if (!started.has(defId)) {
    started.add(defId);
    void loadUnit(defId, manifest[defId]);
  }
  return null;
}

async function loadUnit(defId: string, m: UnitManifest): Promise<void> {
  try {
    // ⚠ Cache key. The PNG filenames never change between exports, so without
    // this a returning player pairs CACHED IMAGES with a FRESH manifest — and
    // the manifest is what says how big a cell is. When the cell went 64 -> 80
    // that combination read the old 512x64 strips at 80px offsets: garbage
    // frames, some of them completely blank. Hit during verification, and it
    // would have shipped silently.
    const v = m.version ? `?v=${m.version}` : "";
    const out: LoadedUnit = {
      cell: m.cell ?? CELL,
      ax: m.anchor?.[0] ?? ANCHOR_X,
      ay: m.anchor?.[1] ?? ANCHOR_Y,
      still: {}, idle: {}, walk: {}, attack: {}, walk_attack: {}, death: {},
      corpse: {},
    };
    const jobs: Promise<void>[] = [];
    for (const [d, file] of Object.entries(m.still)) {
      jobs.push(
        loadImage(ROOT + file + v).then((img) => {
          out.still[d as Dir8] = img;
        })
      );
    }
    for (const [d, s] of Object.entries(m.corpse)) {
      jobs.push(
        loadImage(ROOT + s + v).then((img) => {
          out.corpse[d as Dir8] = img;
        })
      );
    }
    for (const kind of ["idle", "walk", "attack", "walk_attack",
                        "death"] as const) {
      // `?? {}` covers a manifest exported before that motion existed — idle is
      // the current case, and the same will hold for whatever comes next.
      for (const [d, e] of Object.entries(m[kind] ?? {})) {
        const entry = e as StripEntry;
        jobs.push(
          loadImage(ROOT + entry.file + v).then((img) => {
            out[kind][d as Dir8] = {
              img,
              frames: entry.frames,
              hit: entry.hit,
            };
          })
        );
      }
    }
    await Promise.all(jobs);
    // At least one still, so every state has a last-resort frame. It used to
    // require all 8, but facing lookups now snap to the nearest facing that
    // has art (diagonal-4 units ship only se/ne/sw/nw), so a partial set can
    // no longer flip a unit back to the procedural style as it turns.
    loaded.set(defId, Object.keys(out.still).length > 0 ? out : null);
    notifyLoad();
  } catch {
    loaded.set(defId, null);
    notifyLoad();
  }
}

// ---------------------------------------------------------------------------
// Load notifications.
//
// ⚠ WHY: art decodes ASYNCHRONOUSLY. `getPixelFrame` returns null until a
// unit's strips are in, so anything that paints a canvas ONCE — the collection
// cards, the deck strip, the reward panel — can paint the procedural fallback
// and then keep it forever, because nothing tells React the art has arrived.
// The battle canvas never showed this: it repaints every rAF, so it picks the
// art up on the next frame regardless.
//
// Listeners fire when a unit finishes loading (successfully or not). Combined
// with the `pixelArt` setting in `useSpriteEpoch`, this is what lets a
// one-shot canvas know it must repaint.
// ---------------------------------------------------------------------------
const loadListeners = new Set<() => void>();

function notifyLoad(): void {
  for (const cb of loadListeners) cb();
}

/** Subscribe to "a unit's pixel art finished loading". Returns an unsubscribe. */
export function subscribeSpriteLoad(cb: () => void): () => void {
  loadListeners.add(cb);
  return () => loadListeners.delete(cb);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`pixel sprite failed: ${src}`));
    img.src = src;
  });
}

/** What to draw this frame: a source image plus which cell of it to take. */
export interface PixelFrame {
  img: HTMLImageElement;
  /** Left edge of the cell within `img`, in sprite pixels. */
  sx: number;
  /**
   * This unit's cell geometry, straight from the manifest.
   *
   * Carried per frame rather than read from the module constants so the two can
   * never drift: the pixelizer decides the cell size and anchor, publishes them
   * in the manifest, and the blit uses exactly what it was given. Widening the
   * cell then needs no code change here at all, and two units may legitimately
   * ship different sizes.
   */
  cell: number;
  /** Foot point inside the cell — what the blit aligns to the ground line. */
  ax: number;
  ay: number;
  /**
   * True when this came from a multi-frame CLIP rather than a static still.
   *
   * The caller uses it to drop the procedural bob/lunge: those exist to fake
   * life in art that cannot move on its own, and doubling them onto a clip that
   * already animates reads as a judder. It has to be reported per FRAME, not
   * per unit, because coverage is uneven — a unit can have a walk clip for one
   * facing and fall back to the still for another.
   */
  animated?: boolean;
}

/**
 * Pick the sprite cell for a unit's current direction and animation state.
 *
 * `null` means "no pixel art available, draw procedurally" — that covers a unit
 * with no art, art still decoding, and the manifest having failed to load.
 *
 * `phase` is 0..1 through the current animation; the caller owns timing so this
 * stays a pure lookup.
 */
export function getPixelFrame(
  defId: string,
  dir: number,
  state: "idle" | "walk" | "attack" | "walk_attack" | "dead",
  phase: number
): PixelFrame | null {
  const unit = ensureLoaded(defId);
  if (!unit) return null;
  // Spread onto every frame this function returns, so the blit never has to
  // guess the geometry or read a module constant that may not match the asset.
  const geom = { cell: unit.cell, ax: unit.ax, ay: unit.ay };

  if (state === "dead") {
    // Death runs ONCE and holds on its last frame, which is the corpse pose —
    // the corpse sprite is cut from it, so there is nothing to cross-fade.
    const dd = nearestFacingWithArt(unit.death, dir);
    const strip = dd ? unit.death[dd] : undefined;
    if (strip) {
      const i = Math.min(strip.frames - 1, Math.floor(phase * strip.frames));
      return { img: strip.img, sx: i * unit.cell, ...geom, animated: true };
    }
    const dc = nearestFacingWithArt(unit.corpse, dir);
    const corpse = dc ? unit.corpse[dc] : undefined;
    if (corpse) return { img: corpse, sx: 0, ...geom };
    // No death art at all — fall through to the standing still rather than
    // drawing nothing.
  }

  if (state === "walk_attack") {
    // Fire-while-moving (ranged kiting/advancing). Attack-timed, so the hit
    // rotation below applies identically; a unit without walk_attack art
    // falls through to the plain attack branch — coverage is per-unit.
    const dm = nearestFacingWithArt(unit.walk_attack, dir);
    const strip = dm ? unit.walk_attack[dm] : undefined;
    if (strip) {
      const n = strip.frames;
      const i = (Math.floor(phase * n) + (strip.hit ?? 0)) % n;
      return { img: strip.img, sx: i * unit.cell, ...geom, animated: true };
    }
  }

  if (state === "attack" || state === "walk_attack") {
    const da = nearestFacingWithArt(unit.attack, dir);
    const strip = da ? unit.attack[da] : undefined;
    if (strip) {
      // ⚠ Phase 0 is the moment the blow LANDS — the sim deals damage the tick
      // the attack cooldown re-arms, and the renderer derives phase from that
      // cooldown. So the strike frame is rotated onto phase 0 rather than the
      // clip simply starting there.
      //
      // Playing 0..n from the hit would show wind-up AFTER the damage number,
      // which reads as the ogre reacting to its own hit. Rotating means the
      // blow is on frame `hit` exactly when damage applies, recovery follows,
      // and the wind-up plays out the tail of the interval leading into the
      // NEXT swing — which is what the wind-up is for.
      const n = strip.frames;
      const i = (Math.floor(phase * n) + (strip.hit ?? 0)) % n;
      return { img: strip.img, sx: i * unit.cell, ...geom, animated: true };
    }
  }

  if (state === "walk") {
    const dw = nearestFacingWithArt(unit.walk, dir);
    const strip = dw ? unit.walk[dw] : undefined;
    if (strip) {
      // A walk LOOPS, so wrap rather than clamping to the last frame the way a
      // one-shot attack or death does.
      const i = Math.floor(phase * strip.frames) % strip.frames;
      return { img: strip.img, sx: i * unit.cell, ...geom, animated: true };
    }
  }

  if (state === "idle") {
    const di = nearestFacingWithArt(unit.idle, dir);
    const strip = di ? unit.idle[di] : undefined;
    if (strip) {
      // Idle LOOPS, so wrap like the walk rather than clamping to the last
      // frame. The exporter drops the head of the clip so frame 0 and the last
      // frame agree, which is what stops the wrap from popping.
      const i = Math.floor(phase * strip.frames) % strip.frames;
      return { img: strip.img, sx: i * unit.cell, ...geom, animated: true };
    }
  }

  // Anything unmatched, and any facing with no clip for this state: the
  // nearest directional still. A unit whose idle has not been generated keeps
  // the procedural bob applied by the caller's transform.
  const ds = nearestFacingWithArt(unit.still, dir);
  const still = ds ? unit.still[ds] : undefined;
  return still ? { img: still, sx: 0, ...geom } : null;
}

/** True once a unit's art is resident — lets callers skip procedural setup. */
export function hasPixelArt(defId: string): boolean {
  return !!loaded.get(defId);
}

/** Test/dev hook: forget everything so a reload re-requests the assets. */
export function resetPixelSprites(): void {
  loaded.clear();
  started.clear();
  manifest = null;
  manifestState = "idle";
}
