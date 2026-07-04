// ============================================================================
// Music
// Procedural Web Audio chiptune — every track is synthesized from note-pattern
// data at runtime; there are no audio assets. Presentation-only: nothing here
// touches the simulation, and scheduling runs on wall-clock AudioContext time.
//
// A tiny module-level "director" owns one AudioContext and at most one playing
// track. Screens declare what should be playing via setMusicTrack(); the
// director handles autoplay unlock (browsers block audio until a user
// gesture), crossfades between tracks, and a persisted mute toggle.
//
// The six tracks were auditioned with the user as widget mockups (2026-07-04):
// Emberfall (hub) · Blackblade (Arena battle) · The Long Dark / Cold Vigil /
// Catacomb Hymn (random per Depths floor) · The Warden (Depths boss floors).
// All are A-rooted so any crossfade lands consonantly.
// ============================================================================

import { isBossFloor } from "@/data/depths";

export type MusicTrackId =
  | "emberfall"
  | "blackblade"
  | "longDark"
  | "coldVigil"
  | "catacombHymn"
  | "warden";

interface TrackDef {
  bpm: number;
  /** Loop length in 16th-note steps. */
  steps: number;
  /** Schedule one loop starting at AudioContext time t0. `st` is the length
   *  of one 16th step in seconds; `out` is the track's (fading) gain node. */
  schedule: (t0: number, out: GainNode, st: number) => void;
}

// ---------------------------------------------------------------------------
// Synth voices
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

/** midi note → Hz (fractional midi allowed, used for detuned choir voices). */
const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** One enveloped oscillator note. Optional pitch slide for cries/swells. */
function tone(
  t: number, midi: number, dur: number, type: OscillatorType,
  vol: number, out: GainNode, slideTo?: number
): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz(midi), t);
  if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(hz(slideTo), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A sustained pad note with a slow swell in and out. */
function drone(
  t: number, midi: number, dur: number, type: OscillatorType,
  vol: number, out: GainNode
): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = hz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
  g.gain.setValueAtTime(vol, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise — wind beds, snares, hats, drips. `ramp` swells instead of
 *  decaying (the boss drum-roll build). */
function noiseHit(
  t: number, dur: number, vol: number, out: GainNode,
  fType: BiquadFilterType, fFreq: number, ramp = false
): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf!;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = fType;
  f.frequency.value = fFreq;
  const g = c.createGain();
  if (ramp) {
    g.gain.setValueAtTime(0.0015, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Pitch-dropping drum thump (kick / tom / toll, depending on f0→f1). */
function thump(t: number, vol: number, out: GainNode, f0: number, f1: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.13);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

// ---------------------------------------------------------------------------
// The tracks (note patterns: [step, midi, durationInSteps])
// ---------------------------------------------------------------------------

/** Hub/menus — warm but mysterious; chords + music box, no percussion. */
const emberfall: TrackDef = {
  bpm: 76,
  steps: 64,
  schedule(t0, out, st) {
    const chords: number[][] = [[45, 52], [41, 48], [48, 55], [43, 50]]; // A/E F/C C/G G/D
    chords.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.045, out);
    });
    const arps = [[57, 60, 64, 60], [57, 60, 65, 60], [55, 60, 64, 60], [55, 59, 62, 59]];
    arps.forEach((arp, b) => {
      arp.forEach((m, i) => tone(t0 + (b * 16 + i * 4) * st, m, st * 3.4, "sine", 0.032, out));
    });
    tone(t0 + 30 * st, 81, st * 6, "sine", 0.014, out); // one distant bell
    tone(t0 + 62 * st, 76, st * 4, "sine", 0.012, out);
  },
};

/** Arena battle — dark mid-tempo groove; riff and drums carry it. */
const blackblade: TrackDef = {
  bpm: 100,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.05, out); // low weight
    const riffBar = (t: number, r: number) => {
      const hits = [[0, r, 2], [3, r, 1], [6, r + 3, 2], [8, r, 2], [11, r - 2, 1], [12, r - 5, 3]];
      for (const [s, m, d] of hits) tone(t + s * st, m, d * st, "triangle", 0.085, out);
    };
    riffBar(t0, 45);
    riffBar(t0 + 16 * st, 45);
    riffBar(t0 + 32 * st, 41);
    riffBar(t0 + 48 * st, 44);
    const lead = [[16, 52, 6], [24, 50, 4], [40, 48, 6], [48, 56, 8], [58, 55, 4]];
    for (const [s, m, d] of lead) {
      tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
      tone(t0 + s * st, m - 12, d * st, "square", 0.012, out); // low grit double
    }
    for (const s of [0, 8, 16, 22, 24, 32, 40, 48, 54, 56]) thump(t0 + s * st, 0.2, out, 110, 36);
    for (const s of [12, 28, 44, 60]) noiseHit(t0 + s * st, 0.11, 0.06, out, "highpass", 1500);
    for (let s = 2; s < 64; s += 4) noiseHit(t0 + s * st, 0.03, 0.016, out, "highpass", 6500);
  },
};

/** Depths — barely-music ambience: drone, slow arp, wind, distant cries. */
const longDark: TrackDef = {
  bpm: 66,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "triangle", 0.11, out); // A1
    drone(t0, 45, st * 64, "triangle", 0.05, out); // A2
    drone(t0 + st * 32, 46, st * 32, "square", 0.018, out); // Bb2 rub in half 2
    const arp = [[0, 57], [8, 60], [16, 64], [24, 63], [32, 57], [40, 56], [48, 52], [56, 50]];
    for (const [s, m] of arp) tone(t0 + s * st, m, st * 7, "triangle", 0.055, out);
    tone(t0 + st * 20, 69, st * 10, "sine", 0.02, out, 68); // distant falling cries
    tone(t0 + st * 52, 71, st * 10, "sine", 0.016, out, 64);
    noiseHit(t0, st * 64, 0.02, out, "lowpass", 420); // wind
    for (const s of [12, 44]) noiseHit(t0 + s * st, 0.12, 0.04, out, "bandpass", 2200);
  },
};

/** Depths — detuned choir chords with a faint music box and a slow toll. */
const coldVigil: TrackDef = {
  bpm: 66,
  steps: 64,
  schedule(t0, out, st) {
    const half = 32 * st;
    for (const m of [45, 52, 60])
      for (const dt of [-0.07, 0.07]) drone(t0, m + dt, half, "triangle", 0.028, out); // Am
    for (const m of [40, 47, 55])
      for (const dt of [-0.07, 0.07]) drone(t0 + half, m + dt, half, "triangle", 0.028, out); // Em
    const box = [[0, 69], [12, 72], [20, 76], [32, 71], [44, 67], [52, 64]];
    for (const [s, m] of box) tone(t0 + s * st, m, st * 5, "sine", 0.016, out);
    noiseHit(t0, st * 64, 0.013, out, "lowpass", 500);
    thump(t0, 0.06, out, 60, 28);
    thump(t0 + 32 * st, 0.06, out, 60, 28); // slow toll
  },
};

/** Depths — a low chant in parallel fifths (organum), like monks far below. */
const catacombHymn: TrackDef = {
  bpm: 58,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "triangle", 0.11, out);
    drone(t0, 40, st * 64, "sine", 0.04, out);
    const chant = [[0, 45, 8], [8, 47, 8], [16, 48, 12], [28, 47, 4], [32, 45, 8], [40, 43, 8], [48, 45, 16]];
    for (const [s, m, d] of chant) {
      tone(t0 + s * st, m, d * st, "triangle", 0.055, out);
      tone(t0 + s * st, m + 7, d * st, "triangle", 0.02, out); // parallel fifth
    }
    thump(t0, 0.07, out, 60, 28);
    thump(t0 + 32 * st, 0.07, out, 60, 28);
    noiseHit(t0, st * 64, 0.018, out, "lowpass", 400);
    noiseHit(t0 + 52 * st, 0.12, 0.03, out, "bandpass", 2800);
  },
};

/** Boss floors — lumbering drums, tritone rub, a dropout bar, then the roll
 *  builds it back. Bars 1-2 groove · bar 3 drop · bar 4 build. */
const warden: TrackDef = {
  bpm: 76,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "triangle", 0.10, out); // A1 floor
    drone(t0, 39, st * 64, "sine", 0.02, out); // Eb2 tritone rub
    noiseHit(t0, st * 64, 0.015, out, "lowpass", 380); // wind
    for (const b of [0, 16]) {
      thump(t0 + b * st, 0.24, out, 130, 30);
      thump(t0 + (b + 6) * st, 0.12, out, 95, 38);
      thump(t0 + (b + 8) * st, 0.2, out, 120, 32);
      thump(t0 + (b + 14) * st, 0.12, out, 95, 38);
    }
    for (const s of [12, 28]) noiseHit(t0 + s * st, 0.1, 0.06, out, "highpass", 1300);
    const riff = [[0, 45, 4], [8, 48, 4], [16, 47, 4], [24, 51, 6]]; // A C B Eb(!)
    for (const [s, m, d] of riff) {
      tone(t0 + s * st, m, d * st, "triangle", 0.08, out);
      tone(t0 + s * st, m - 12, d * st, "square", 0.018, out);
    }
    // bar 3 — the drop
    thump(t0 + 32 * st, 0.09, out, 55, 26);
    tone(t0 + 32 * st, 45, 8 * st, "triangle", 0.06, out);
    tone(t0 + 32 * st, 51, 8 * st, "triangle", 0.018, out);
    tone(t0 + 40 * st, 44, 8 * st, "triangle", 0.06, out);
    tone(t0 + 36 * st, 75, 8 * st, "sine", 0.012, out, 73); // distant shriek
    // bar 4 — rising riff + drum-roll build
    const rise = [[48, 45, 4], [52, 47, 4], [56, 48, 4], [60, 51, 4]];
    for (const [s, m, d] of rise) tone(t0 + s * st, m, d * st, "triangle", 0.075, out);
    for (let i = 0; i < 8; i++) thump(t0 + (48 + i * 2) * st, 0.06 + i * 0.02, out, 110, 34);
    noiseHit(t0 + 48 * st, st * 16, 0.05, out, "highpass", 1100, true);
  },
};

const TRACKS: Record<MusicTrackId, TrackDef> = {
  emberfall,
  blackblade,
  longDark,
  coldVigil,
  catacombHymn,
  warden,
};

// ---------------------------------------------------------------------------
// Director — one playing track, crossfades, autoplay unlock, persisted mute
// ---------------------------------------------------------------------------

const MASTER_VOL = 0.9;
const FADE_IN_SEC = 1.2;
const FADE_OUT_SEC = 0.8;
const MUTED_KEY = "fantasy-arena/music-muted";

let desired: MusicTrackId | null = null;
let muted = false;
let mutedLoaded = false;
let unlocked = false;
let unlockListenerInstalled = false;
let playing: { id: MusicTrackId; gain: GainNode; timer: number } | null = null;

function loadMuted(): void {
  if (mutedLoaded) return;
  mutedLoaded = true;
  try {
    muted = localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    muted = false;
  }
}

/** Browsers refuse audio before a user gesture: arm a one-shot listener that
 *  unlocks the context and starts whatever track is currently desired. */
function installUnlockListener(): void {
  if (unlockListenerInstalled || typeof window === "undefined") return;
  unlockListenerInstalled = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("click", unlock);
    ensureCtx();
    unlocked = true;
    apply();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("click", unlock);
}

function ensureCtx(): void {
  if (!ctx) {
    type AC = typeof AudioContext;
    const Ctor: AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;
    ctx = new Ctor();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function startTrack(id: MusicTrackId): void {
  const c = ctx!;
  const def = TRACKS[id];
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.linearRampToValueAtTime(MASTER_VOL, c.currentTime + FADE_IN_SEC);
  gain.connect(c.destination);

  const st = 60 / def.bpm / 4;
  const loopDur = st * def.steps;
  let nextT = c.currentTime + 0.08;
  def.schedule(nextT, gain, st);
  nextT += loopDur;
  // Lookahead scheduler: top up the next loop shortly before the current one
  // ends. Wide margin so background-tab timer throttling doesn't cause gaps.
  const timer = window.setInterval(() => {
    if (c.currentTime > nextT - 0.4) {
      def.schedule(nextT, gain, st);
      nextT += loopDur;
    }
  }, 100);

  playing = { id, gain, timer };
}

function stopCurrent(): void {
  if (!playing || !ctx) return;
  const { gain, timer } = playing;
  playing = null;
  clearInterval(timer);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_OUT_SEC);
  window.setTimeout(() => {
    try {
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }, FADE_OUT_SEC * 1000 + 200);
}

function apply(): void {
  loadMuted();
  const target = muted ? null : desired;
  if (playing?.id === target) return;
  stopCurrent();
  if (target && unlocked && ctx) startTrack(target);
}

/** Declare which track should be playing (null = silence). Safe to call
 *  before any user gesture — the track starts once audio unlocks. */
export function setMusicTrack(id: MusicTrackId | null): void {
  desired = id;
  installUnlockListener();
  apply();
}

/** Flip the persisted mute toggle; returns the new muted state. */
export function toggleMusicMuted(): boolean {
  loadMuted();
  muted = !muted;
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* private mode — the toggle still works for this session */
  }
  apply();
  return muted;
}

export function isMusicMuted(): boolean {
  loadMuted();
  return muted;
}

/** The track currently audible (null while muted/locked/silent). Debug aid. */
export function getCurrentMusicTrack(): MusicTrackId | null {
  return playing?.id ?? null;
}

/** Depths floor soundtrack: boss floors get The Warden; other floors draw one
 *  of the three ambiences at random (presentation-only, so Math.random is
 *  fine here — this never touches the simulation). */
export function pickDepthsTrack(floor: number): MusicTrackId {
  if (isBossFloor(floor)) return "warden";
  const pool: MusicTrackId[] = ["longDark", "coldVigil", "catacombHymn"];
  return pool[Math.floor(Math.random() * pool.length)];
}
