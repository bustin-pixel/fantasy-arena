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
// The six original tracks were auditioned with the user as widget mockups
// (2026-07-04): Emberfall (hub) · Blackblade (Arena battle) · The Long Dark /
// Cold Vigil / Catacomb Hymn (random per Depths floor) · The Warden (Depths
// boss floors). The 18 themed-dungeon tracks (two floor tracks + one boss
// track per dungeon) were auditioned the same way (2026-07-06) over eight
// revisions; each boss track has its own rhythmic engine (see the per-track
// comments). All tracks are A-rooted so any crossfade lands consonantly, and
// the palette rule holds throughout: drones and triangle/sine voices — no
// chirpy square leads (squares appear nowhere anymore).
// ============================================================================

import { DUNGEONS, isBossFloorIn } from "@/data/dungeons";
import {
  getAudioContext,
  getNoiseBuffer,
  installAudioUnlockListener,
  isAudioUnlocked,
  onAudioUnlocked,
} from "@/audio/context";
import { getSettings, subscribeSettings } from "@/state/settings";

export type MusicTrackId =
  | "emberfall"
  | "blackblade"
  | "longDark"
  | "coldVigil"
  | "catacombHymn"
  | "warden"
  | "barrowWind"
  | "theRestless"
  | "abomination"
  | "underCanopy"
  | "packTrails"
  | "direAlpha"
  | "wardedHalls"
  | "leakingArcana"
  | "runeGolem"
  | "blightedGrove"
  | "sporefall"
  | "elderTreant"
  | "twinLight"
  | "shadowclimb"
  | "totality"
  | "coldAnvil"
  | "emberHalls"
  | "forgeGolem"
  | "shopTheme";

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

// Mirrors of the shared audio context (see audio/context.ts), refreshed by
// apply() before any scheduling so the voice helpers can assume non-null.
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

/** Anvil clank: a metallic noise snap plus an inharmonic sine pair (the
 *  off-ratio partner is what reads as "metal"). The Deep Forge's signature. */
function anvil(t: number, vol: number, out: GainNode): void {
  noiseHit(t, 0.09, vol, out, "highpass", 3200);
  tone(t, 93, 0.35, "sine", vol * 0.5, out);
  tone(t, 100.3, 0.25, "sine", vol * 0.3, out);
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

// ---------------------------------------------------------------------------
// The themed-dungeon tracks — three per dungeon (two floor tracks, one boss).
// Floor tracks are real tunes: a 4-bar chord progression, a composed melody,
// and a pulse, with each dungeon's sound-effect identity (bone clicks, drips,
// anvils, birds) demoted to accents. Boss tracks share a 4-bar DNA — groove ·
// groove · themed bar-3 dropout · bar-4 build — but each runs on its own
// rhythmic engine so they don't blur together.
// ---------------------------------------------------------------------------

/** Bonefields floor — creeping harmonic-minor tune: Am–B♭(Neapolitan)–Am–E,
 *  a melody that creeps in half-steps, and a faint music-box echo trailing
 *  each note an octave up. Bone-click offbeats, tolls, wind. */
const barrowWind: TrackDef = {
  bpm: 66,
  steps: 64,
  schedule(t0, out, st) {
    const prog = [[45, 52, 60], [46, 53, 58], [45, 52, 60], [40, 47, 56]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.026, out);
      tone(t0 + b * 16 * st, ch[0] - 12, st * 14, "sine", 0.045, out);
    });
    const mel = [[0, 57, 3], [4, 58, 3], [8, 60, 4], [12, 58, 2], [16, 58, 3], [20, 62, 3], [24, 65, 4], [28, 62, 2], [32, 60, 3], [36, 57, 3], [40, 56, 4], [44, 52, 2], [48, 59, 4], [52, 56, 4], [56, 57, 7]];
    for (const [s, m, d] of mel) {
      tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
      tone(t0 + (s + 1) * st, m + 12, d * st * 0.8, "sine", 0.012, out); // music-box echo
    }
    for (let b = 0; b < 4; b++) {
      noiseHit(t0 + (b * 16 + 6) * st, 0.04, 0.02, out, "highpass", 4200);
      noiseHit(t0 + (b * 16 + 14) * st, 0.04, 0.016, out, "highpass", 4200);
    }
    thump(t0, 0.07, out, 58, 27);
    thump(t0 + 32 * st, 0.07, out, 58, 27);
    noiseHit(t0, st * 64, 0.016, out, "lowpass", 380);
    tone(t0 + st * 46, 69, st * 8, "sine", 0.012, out, 67);
  },
};

/** Bonefields floor — detuned ghost choir (Am → F) under a faint music box
 *  wandering the harmonic-minor G#, with slow tolls and stray bone ticks. */
const theRestless: TrackDef = {
  bpm: 60,
  steps: 64,
  schedule(t0, out, st) {
    const half = 32 * st;
    for (const m of [45, 52, 60])
      for (const dt of [-0.09, 0.09]) drone(t0, m + dt, half, "triangle", 0.026, out);
    for (const m of [41, 48, 57])
      for (const dt of [-0.09, 0.09]) drone(t0 + half, m + dt, half, "triangle", 0.026, out);
    const box = [[0, 69], [10, 68], [16, 72], [26, 69], [32, 65], [40, 64], [48, 68], [56, 69]];
    for (const [s, m] of box) tone(t0 + s * st, m, st * 5, "sine", 0.015, out);
    thump(t0, 0.06, out, 58, 27);
    thump(t0 + 32 * st, 0.06, out, 58, 27);
    for (const s of [20, 21, 52]) noiseHit(t0 + s * st, 0.04, 0.02, out, "highpass", 4200);
    noiseHit(t0, st * 64, 0.014, out, "lowpass", 450);
  },
};

/** Bonefields boss — slam dirge on a 3+3+2 rhythm, each slam answered by bone
 *  clatter, a ghost choir underneath. Bar 3 it stops and shrieks; bar 4 the
 *  slams accelerate from every-5-steps down to every-2. */
const abomination: TrackDef = {
  bpm: 70,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.08, out);
    for (const m of [45, 52, 60])
      for (const dt of [-0.09, 0.09]) drone(t0, m + dt, st * 32, "triangle", 0.018, out);
    noiseHit(t0, st * 64, 0.016, out, "lowpass", 360);
    for (const b of [0, 16]) {
      for (const [s, v] of [[0, 0.28], [6, 0.22], [12, 0.24]]) {
        thump(t0 + (b + s) * st, v, out, 130, 26);
        noiseHit(t0 + (b + s + 2) * st, 0.05, 0.026, out, "highpass", 4000);
        noiseHit(t0 + (b + s + 3) * st, 0.04, 0.018, out, "highpass", 4200);
      }
    }
    thump(t0, 0.07, out, 58, 27);
    thump(t0 + 16 * st, 0.07, out, 58, 27);
    const riff = [[0, 45, 5], [6, 46, 5], [12, 45, 4], [16, 41, 5], [22, 46, 5], [28, 45, 4]];
    for (const [s, m, d] of riff) tone(t0 + s * st, m, d * st, "triangle", 0.085, out);
    // bar 3 — it stops and looks at you
    thump(t0 + 32 * st, 0.09, out, 52, 24);
    tone(t0 + 32 * st, 45, 12 * st, "triangle", 0.05, out);
    tone(t0 + 32 * st, 46, 12 * st, "triangle", 0.02, out);
    tone(t0 + 35 * st, 74, 9 * st, "sine", 0.014, out, 69); // wet shriek
    for (const s of [41, 42, 44, 45]) noiseHit(t0 + s * st, 0.05, 0.03, out, "highpass", 3800);
    // bar 4 — the slams close in
    for (const [s, v] of [[48, 0.16], [53, 0.18], [57, 0.2], [60, 0.24], [62, 0.26]])
      thump(t0 + s * st, v, out, 130, 26);
    for (const m of [45, 52, 60])
      for (const dt of [-0.09, 0.09]) drone(t0 + 48 * st, m + dt, 16 * st, "triangle", 0.02, out);
    tone(t0 + 56 * st, 46, 8 * st, "triangle", 0.06, out);
    noiseHit(t0 + 48 * st, st * 16, 0.05, out, "highpass", 1100, true);
  },
};

/** Wilds floor — dorian hunting tune: Am–D–Am–G (the D major is the dorian
 *  brightness) under a 4-phrase melody, walking toms, a leaf shaker, one bird. */
const underCanopy: TrackDef = {
  bpm: 76,
  steps: 64,
  schedule(t0, out, st) {
    const prog = [[45, 52, 60], [50, 54, 57], [45, 52, 60], [43, 50, 55]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.03, out);
    });
    const mel = [[0, 64, 3], [4, 62, 2], [6, 60, 2], [8, 57, 6], [16, 62, 3], [20, 64, 2], [22, 66, 2], [24, 69, 6], [32, 64, 3], [36, 62, 2], [38, 60, 2], [40, 57, 4], [44, 55, 2], [48, 55, 3], [52, 57, 2], [54, 59, 2], [56, 57, 7]];
    for (const [s, m, d] of mel) tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
    for (let b = 0; b < 4; b++) {
      thump(t0 + b * 16 * st, 0.1, out, 85, 38);
      thump(t0 + (b * 16 + 8) * st, 0.07, out, 80, 40);
      thump(t0 + (b * 16 + 12) * st, 0.05, out, 78, 42);
    }
    for (let s = 4; s < 64; s += 8) noiseHit(t0 + s * st, 0.04, 0.014, out, "highpass", 5000);
    noiseHit(t0, st * 64, 0.014, out, "bandpass", 900);
    tone(t0 + st * 30, 81, st * 3, "sine", 0.009, out, 83);
  },
};

/** Wilds floor — rolling tom groove with a minor-pentatonic trail line. */
const packTrails: TrackDef = {
  bpm: 84,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.07, out);
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * 16 * st;
      thump(t, 0.18, out, 100, 34);
      thump(t + 4 * st, 0.1, out, 85, 40);
      thump(t + 8 * st, 0.16, out, 100, 34);
      thump(t + 10 * st, 0.08, out, 80, 42);
      thump(t + 12 * st, 0.12, out, 90, 38);
    }
    for (let s = 2; s < 64; s += 8) noiseHit(t0 + s * st, 0.05, 0.018, out, "highpass", 5000);
    const line = [[0, 57, 4], [6, 60, 2], [8, 62, 4], [16, 64, 6], [24, 62, 4], [32, 60, 4], [38, 57, 2], [40, 55, 6], [48, 57, 10]];
    for (const [s, m, d] of line) tone(t0 + s * st, m, d * st, "triangle", 0.055, out);
    noiseHit(t0, st * 64, 0.014, out, "bandpass", 800);
  },
};

/** Wilds boss — the gallop engine: da-da-DUM toms at full sprint, a low riff
 *  answered an octave up with a howl bent over it. Bar 3 halves the time for
 *  the alpha's big howl; bar 4 doubles the gallop as the pack answers. */
const direAlpha: TrackDef = {
  bpm: 96,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.075, out);
    drone(t0, 40, st * 64, "sine", 0.03, out);
    for (let g = 0; g < 32; g += 4) {
      thump(t0 + g * st, 0.07, out, 80, 42);
      thump(t0 + (g + 1) * st, 0.07, out, 85, 40);
      thump(t0 + (g + 2) * st, 0.2, out, 105, 32);
    }
    for (const s of [8, 24]) noiseHit(t0 + s * st, 0.09, 0.05, out, "highpass", 1500);
    const call = [[0, 45, 2], [2, 48, 2], [4, 50, 3], [8, 50, 2], [10, 52, 2], [12, 55, 3]];
    for (const [s, m, d] of call) tone(t0 + s * st, m, d * st, "triangle", 0.08, out);
    const resp = [[16, 57, 2], [18, 60, 2], [20, 62, 3], [24, 62, 2], [26, 64, 2], [28, 67, 3]];
    for (const [s, m, d] of resp) tone(t0 + s * st, m, d * st, "triangle", 0.06, out);
    tone(t0 + 20 * st, 69, 6 * st, "sine", 0.018, out, 74);
    // bar 3 — half-time, the alpha alone
    thump(t0 + 32 * st, 0.22, out, 100, 26);
    thump(t0 + 40 * st, 0.18, out, 95, 28);
    drone(t0 + 32 * st, 45, 16 * st, "triangle", 0.05, out);
    tone(t0 + 33 * st, 69, 7 * st, "sine", 0.026, out, 78); // the howl rises
    tone(t0 + 40 * st, 78, 7 * st, "sine", 0.022, out, 71); // and falls
    // bar 4 — full sprint, pack howls stack
    for (let g = 48; g < 64; g += 2) {
      thump(t0 + g * st, 0.1 + (g - 48) * 0.008, out, 105, 32);
      thump(t0 + (g + 1) * st, 0.06, out, 85, 40);
    }
    tone(t0 + 50 * st, 64, 5 * st, "sine", 0.014, out, 69);
    tone(t0 + 54 * st, 62, 5 * st, "sine", 0.012, out, 67);
    tone(t0 + 58 * st, 66, 5 * st, "sine", 0.011, out, 71);
    noiseHit(t0 + 48 * st, st * 16, 0.05, out, "highpass", 1200, true);
  },
};

/** Sealed Vault floor — the lydian I–II oscillation (A major swelling to B
 *  major and back — the classic "magic" device) with a continuous glass arp
 *  and a floating melody. The detuned ward-hum beating sits underneath. */
const wardedHalls: TrackDef = {
  bpm: 74,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 45, st * 64, "triangle", 0.04, out);
    drone(t0, 45.12, st * 64, "triangle", 0.04, out); // beats vs the line above
    const prog = [[57, 61, 64], [59, 63, 66], [57, 61, 64], [59, 63, 66]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.02, out);
      [0, 1, 2, 1, 0, 1, 2, 1].forEach((ci, i) =>
        tone(t0 + (b * 16 + i * 2) * st, ch[ci] + 12, st * 1.8, "sine", 0.014, out)
      );
    });
    const mel = [[0, 76, 4], [6, 73, 2], [8, 71, 6], [16, 75, 4], [22, 71, 2], [24, 69, 6], [32, 73, 4], [38, 76, 2], [40, 78, 6], [48, 75, 3], [52, 73, 2], [54, 71, 2], [56, 69, 7]];
    for (const [s, m, d] of mel) tone(t0 + s * st, m, d * st, "sine", 0.028, out);
    for (const [s, m] of [[12, 88], [44, 87]]) tone(t0 + s * st, m, st * 8, "sine", 0.008, out);
    for (let b = 0; b < 4; b++) thump(t0 + b * 16 * st, 0.05, out, 70, 30);
    noiseHit(t0, st * 64, 0.01, out, "lowpass", 600);
  },
};

/** Sealed Vault floor — whole-tone runs that rise and evaporate, drifting
 *  unresolved cries, arcane spark ticks. No low drone at all — it floats. */
const leakingArcana: TrackDef = {
  bpm: 74,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 45, st * 64, "sine", 0.05, out);
    drone(t0, 52, st * 64, "sine", 0.025, out);
    [57, 59, 61, 63, 65, 67].forEach((m, i) => tone(t0 + (4 + i * 2) * st, m, st * 3, "sine", 0.02, out));
    [57, 59, 61, 63].forEach((m, i) => tone(t0 + (36 + i * 2) * st, m, st * 3, "sine", 0.017, out));
    tone(t0 + 18 * st, 69, st * 8, "sine", 0.014, out, 70);
    tone(t0 + 46 * st, 67, st * 10, "sine", 0.012, out, 63);
    for (const s of [14, 30, 31, 50]) noiseHit(t0 + s * st, 0.06, 0.02, out, "bandpass", 3600);
    noiseHit(t0, st * 64, 0.012, out, "lowpass", 520);
    thump(t0 + 16 * st, 0.05, out, 65, 30);
    thump(t0 + 48 * st, 0.05, out, 65, 30);
  },
};

/** Sealed Vault boss — the sequencer engine: a pulsing octave-hopping bass
 *  line like a rune circuit cycling, stone slams every two beats, bells over
 *  it. Bar 3 the power fails (pulse halves, sinks chromatically under the
 *  ward tone); bar 4 the reboot climbs back with accelerating ticks. */
const runeGolem: TrackDef = {
  bpm: 72,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.07, out);
    const seq = [45, 45, 57, 45, 48, 45, 57, 48, 45, 45, 57, 45, 51, 50, 48, 45];
    seq.forEach((m, i) => tone(t0 + i * 2 * st, m, st * 1.7, "triangle", 0.055, out));
    for (const s of [0, 8, 16, 24]) thump(t0 + s * st, s % 16 === 0 ? 0.26 : 0.2, out, 118, 26);
    for (const s of [4, 12, 20, 28]) noiseHit(t0 + s * st, 0.03, 0.016, out, "highpass", 6000);
    for (const [s, m] of [[0, 69], [8, 75], [16, 74], [24, 69]]) tone(t0 + s * st, m, st * 7, "sine", 0.02, out);
    // bar 3 — power failing
    const fail = [[32, 45], [36, 44], [40, 43], [44, 42]];
    for (const [s, m] of fail) tone(t0 + s * st, m, st * 3, "triangle", 0.05, out);
    tone(t0 + 32 * st, 88, 12 * st, "sine", 0.01, out);
    thump(t0 + 32 * st, 0.08, out, 55, 24);
    drone(t0 + 34 * st, 39, 12 * st, "sine", 0.02, out); // tritone strain while down
    // bar 4 — the reboot
    const re = [45, 45, 47, 47, 48, 48, 51, 51];
    re.forEach((m, i) => tone(t0 + (48 + i * 2) * st, m, st * 1.7, "triangle", 0.05 + i * 0.004, out));
    for (let i = 0; i < 8; i++) noiseHit(t0 + (48 + i * 2) * st, 0.03, 0.012 + i * 0.004, out, "highpass", 6000);
    for (let i = 0; i < 4; i++) thump(t0 + (48 + i * 4) * st, 0.1 + i * 0.05, out, 115, 26);
    noiseHit(t0 + 48 * st, st * 16, 0.045, out, "lowpass", 800, true);
    tone(t0 + 56 * st, 57, 8 * st, "triangle", 0.045, out, 69); // rising power whine
  },
};

/** Overgrowth floor — minor tune over Am–G–F–Em with a moving bass note; the
 *  melody peaks on the dorian F#, and the drips land on offbeats. */
const blightedGrove: TrackDef = {
  bpm: 62,
  steps: 64,
  schedule(t0, out, st) {
    const prog = [[45, 52, 60], [43, 50, 55], [41, 48, 57], [40, 47, 52]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.026, out);
      tone(t0 + b * 16 * st, ch[0] - 12, st * 7, "sine", 0.05, out);
      tone(t0 + (b * 16 + 8) * st, ch[0] - 12, st * 5, "sine", 0.04, out);
    });
    const mel = [[0, 57, 4], [4, 60, 2], [6, 62, 2], [8, 64, 6], [16, 62, 4], [20, 60, 2], [22, 59, 2], [24, 55, 6], [32, 57, 4], [36, 60, 2], [38, 62, 2], [40, 66, 4], [44, 64, 2], [48, 64, 4], [52, 62, 2], [54, 59, 2], [56, 57, 7]];
    for (const [s, m, d] of mel) tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
    for (const s of [6, 22, 38, 54]) noiseHit(t0 + s * st, 0.06, 0.022, out, "bandpass", 2600);
    for (let b = 0; b < 4; b++) thump(t0 + b * 16 * st, 0.07, out, 75, 32);
    noiseHit(t0, st * 64, 0.012, out, "lowpass", 480);
  },
};

/** Overgrowth floor — music-box lullaby on Am–F–C–G: a continuous eighth-note
 *  arp under a slow falling melody (the descending spores are the tune). */
const sporefall: TrackDef = {
  bpm: 66,
  steps: 64,
  schedule(t0, out, st) {
    const prog = [[45, 52, 60], [41, 48, 57], [48, 55, 60], [43, 50, 59]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.022, out);
      [0, 1, 2, 1, 0, 1, 2, 1].forEach((ci, i) =>
        tone(t0 + (b * 16 + i * 2) * st, ch[ci] + 12, st * 1.8, "sine", 0.018, out)
      );
    });
    const mel = [[0, 72, 4], [6, 71, 2], [8, 69, 6], [16, 69, 4], [22, 67, 2], [24, 65, 6], [32, 64, 4], [38, 65, 2], [40, 67, 6], [48, 71, 3], [52, 69, 2], [54, 67, 2], [56, 64, 7]];
    for (const [s, m, d] of mel) tone(t0 + s * st, m, d * st, "sine", 0.03, out);
    for (let b = 0; b < 4; b++) thump(t0 + b * 16 * st, 0.05, out, 70, 32);
    for (const s of [14, 46]) noiseHit(t0 + s * st, 0.07, 0.018, out, "bandpass", 2200);
    noiseHit(t0, st * 64, 0.012, out, "lowpass", 520);
  },
};

/** Overgrowth boss — root-stomp engine: the deepest footfall thumps in the
 *  game (90→22 Hz) on a four-grid with twig-snap offbeats and a low chug riff.
 *  Bar 3 it takes root and groans; bar 4 the roots surge back in. */
const elderTreant: TrackDef = {
  bpm: 58,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.09, out);
    drone(t0, 40, st * 64, "sine", 0.035, out);
    noiseHit(t0, st * 64, 0.018, out, "lowpass", 420);
    for (const b of [0, 16]) {
      for (const [s, v] of [[0, 0.28], [4, 0.12], [8, 0.24], [12, 0.14]])
        thump(t0 + (b + s) * st, v, out, 90, 22);
      for (const s of [2, 6, 10, 14]) noiseHit(t0 + (b + s) * st, 0.05, 0.016, out, "bandpass", 2400);
    }
    const riff = [[0, 57, 2], [2, 57, 2], [4, 55, 4], [8, 57, 2], [10, 57, 2], [12, 53, 4], [16, 57, 2], [18, 57, 2], [20, 52, 4], [24, 53, 2], [26, 55, 2], [28, 57, 4]];
    for (const [s, m, d] of riff) tone(t0 + s * st, m, d * st, "triangle", 0.075, out);
    // bar 3 — it takes root
    thump(t0 + 32 * st, 0.1, out, 50, 22);
    drone(t0 + 32 * st, 45, 16 * st, "triangle", 0.05, out);
    tone(t0 + 34 * st, 38, 12 * st, "triangle", 0.022, out, 35); // long groan
    for (const s of [40, 44]) noiseHit(t0 + s * st, 0.09, 0.03, out, "bandpass", 2400);
    // bar 4 — the roots surge
    const rise = [[48, 52, 4], [52, 53, 4], [56, 55, 4], [60, 57, 4]];
    for (const [s, m, d] of rise) tone(t0 + s * st, m, d * st, "triangle", 0.075, out);
    for (let i = 0; i < 8; i++) thump(t0 + (48 + i * 2) * st, 0.06 + i * 0.024, out, 88, 23);
    noiseHit(t0 + 48 * st, st * 16, 0.045, out, "lowpass", 700, true);
  },
};

/** Eclipse Spire floor — the major half (C# color) flips to minor (C) at the
 *  halfway toll: the same music box, two lights. */
const twinLight: TrackDef = {
  bpm: 68,
  steps: 64,
  schedule(t0, out, st) {
    const half = 32 * st;
    drone(t0, 45, st * 64, "triangle", 0.07, out);
    drone(t0, 52, st * 64, "sine", 0.03, out);
    drone(t0, 61, half, "triangle", 0.022, out);
    for (const [s, m] of [[0, 69], [8, 73], [16, 76], [24, 73]]) tone(t0 + s * st, m, st * 6, "sine", 0.016, out);
    drone(t0 + half, 60, half, "triangle", 0.022, out);
    for (const [s, m] of [[32, 69], [40, 72], [48, 76], [56, 72]]) tone(t0 + s * st, m, st * 6, "sine", 0.016, out);
    thump(t0 + 32 * st, 0.05, out, 60, 28); // the flip
    noiseHit(t0, st * 64, 0.012, out, "lowpass", 550);
  },
};

/** Eclipse Spire floor — three-note sequences climbing a step per bar, like
 *  ascending the tower, over a steady heartbeat pulse. */
const shadowclimb: TrackDef = {
  bpm: 72,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.07, out);
    drone(t0, 45, st * 64, "sine", 0.03, out);
    const bars = [[57, 60, 64], [59, 62, 65], [60, 64, 67], [62, 65, 69]];
    bars.forEach((bar, b) => {
      bar.forEach((m, i) => tone(t0 + (b * 16 + i * 4) * st, m, st * 3.5, "triangle", 0.04, out));
      tone(t0 + (b * 16 + 12) * st, bar[1], st * 3, "sine", 0.018, out);
    });
    for (const s of [0, 16, 32, 48]) thump(t0 + s * st, 0.07, out, 80, 34);
    for (const s of [8, 24, 40, 56]) noiseHit(t0 + s * st, 0.05, 0.02, out, "highpass", 3000);
    noiseHit(t0, st * 64, 0.012, out, "lowpass", 500);
  },
};

/** Eclipse Spire boss — the alternation engine: bar 1 belongs to the light
 *  (high bells, airy ticks, major), bar 2 to the dark (slams, low minor riff,
 *  a falling wraith cry). Bar 3 the sun goes out; bar 4 both themes collide
 *  at once, resolving minor into major right at the loop point — dawn. */
const totality: TrackDef = {
  bpm: 78,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.07, out);
    noiseHit(t0, st * 64, 0.014, out, "lowpass", 420);
    // bar 1 — the light
    drone(t0, 61, 16 * st, "triangle", 0.02, out);
    const bells = [[0, 69], [2, 73], [4, 76], [8, 81], [12, 76], [14, 73]];
    for (const [s, m] of bells) tone(t0 + s * st, m, st * 3, "sine", 0.022, out);
    tone(t0 + 4 * st, 57, 10 * st, "triangle", 0.05, out);
    thump(t0, 0.14, out, 100, 36);
    thump(t0 + 8 * st, 0.1, out, 95, 38);
    for (let s = 2; s < 16; s += 2) noiseHit(t0 + s * st, 0.03, 0.014, out, "highpass", 5500);
    // bar 2 — the dark
    drone(t0 + 16 * st, 60, 16 * st, "triangle", 0.02, out);
    for (const s of [16, 20, 24, 28]) thump(t0 + s * st, s % 8 === 0 ? 0.26 : 0.18, out, 125, 26);
    const shadow = [[16, 45, 3], [20, 48, 3], [24, 51, 4], [28, 44, 3]];
    for (const [s, m, d] of shadow) tone(t0 + s * st, m, d * st, "triangle", 0.09, out);
    tone(t0 + 26 * st, 76, 5 * st, "sine", 0.014, out, 70); // wraith cry falls
    noiseHit(t0 + 28 * st, 0.09, 0.05, out, "highpass", 1400);
    // bar 3 — totality
    thump(t0 + 32 * st, 0.09, out, 52, 24);
    drone(t0 + 32 * st, 33, 16 * st, "sine", 0.06, out);
    tone(t0 + 34 * st, 88, 12 * st, "sine", 0.012, out, 87); // corona shimmer
    thump(t0 + 40 * st, 0.06, out, 48, 24); // lone heartbeat
    tone(t0 + 42 * st, 45, 6 * st, "triangle", 0.035, out);
    // bar 4 — the collision
    const cbells = [[48, 69], [52, 73], [56, 76], [60, 81]];
    for (const [s, m] of cbells) tone(t0 + s * st, m, st * 3, "sine", 0.02, out);
    const criff = [[48, 45, 3], [52, 48, 3], [56, 49, 3], [60, 52, 4]]; // minor → major
    for (const [s, m, d] of criff) tone(t0 + s * st, m, d * st, "triangle", 0.085, out);
    for (let i = 0; i < 8; i++) thump(t0 + (48 + i * 2) * st, 0.05 + i * 0.024, out, 120, 28);
    for (let s = 49; s < 64; s += 2) noiseHit(t0 + s * st, 0.03, 0.014, out, "highpass", 5500);
    noiseHit(t0 + 48 * st, st * 16, 0.05, out, "highpass", 1100, true);
  },
};

/** Deep Forge floor — smith's lament: Am–Em–F–G with a walking bass and a
 *  mournful melody in four phrases; the anvil rings once at the end of each
 *  phrase, like the smith striking between lines of the song. */
const coldAnvil: TrackDef = {
  bpm: 64,
  steps: 64,
  schedule(t0, out, st) {
    const prog = [[45, 52, 60], [40, 47, 52], [41, 48, 57], [43, 50, 55]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.024, out);
      tone(t0 + b * 16 * st, ch[0] - 12, st * 7, "sine", 0.05, out);
      tone(t0 + (b * 16 + 8) * st, ch[0] - 12, st * 5, "sine", 0.04, out);
    });
    const mel = [[0, 64, 3], [4, 60, 2], [6, 57, 2], [8, 60, 6], [16, 59, 3], [20, 55, 2], [22, 52, 2], [24, 55, 6], [32, 57, 3], [36, 60, 2], [38, 64, 2], [40, 65, 5], [48, 62, 3], [52, 59, 2], [54, 55, 2], [56, 57, 7]];
    for (const [s, m, d] of mel) tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
    for (const s of [12, 28, 44, 60]) anvil(t0 + s * st, 0.024, out);
    for (let b = 0; b < 4; b++) {
      thump(t0 + b * 16 * st, 0.08, out, 75, 32);
      thump(t0 + (b * 16 + 8) * st, 0.05, out, 70, 34);
    }
    noiseHit(t0, st * 64, 0.01, out, "lowpass", 260);
  },
};

/** Deep Forge floor — dwarven work song: a pumping quarter-note bass over
 *  Am–G–Am–Em dyads, a chant doubled a fourth below (parallel organum), and
 *  the anvil on the backbeat of every bar. Bellows and ember crackles. */
const emberHalls: TrackDef = {
  bpm: 72,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.07, out);
    noiseHit(t0, st * 64, 0.014, out, "lowpass", 260);
    const prog = [[45, 52], [43, 50], [45, 52], [40, 47]];
    prog.forEach((ch, b) => {
      for (const m of ch) drone(t0 + b * 16 * st, m, 16 * st, "triangle", 0.024, out);
      for (const s of [0, 4, 8, 12]) tone(t0 + (b * 16 + s) * st, ch[0] - 12, st * 3, "sine", 0.05, out);
    });
    const mel = [[0, 57, 3], [4, 55, 3], [8, 57, 3], [12, 60, 3], [16, 59, 3], [20, 57, 3], [24, 55, 6], [32, 57, 3], [36, 60, 3], [40, 64, 5], [48, 64, 3], [52, 62, 3], [56, 59, 7]];
    for (const [s, m, d] of mel) {
      tone(t0 + s * st, m, d * st, "triangle", 0.05, out);
      tone(t0 + s * st, m - 5, d * st, "triangle", 0.018, out); // organum double
    }
    for (let b = 0; b < 4; b++) {
      anvil(t0 + (b * 16 + 8) * st, 0.022, out);
      anvil(t0 + (b * 16 + 10.5) * st, 0.01, out);
      thump(t0 + b * 16 * st, 0.12, out, 90, 32);
      thump(t0 + (b * 16 + 4) * st, 0.06, out, 80, 36);
      thump(t0 + (b * 16 + 12) * st, 0.08, out, 85, 34);
    }
    for (const s of [3, 19, 35, 51]) noiseHit(t0 + s * st, 0.03, 0.01, out, "highpass", 5200);
    noiseHit(t0 + 24 * st, st * 8, 0.02, out, "lowpass", 700, true); // one bellows swell
  },
};

/** Deep Forge boss — the piston engine (the reference the other bosses were
 *  differentiated from): four-on-the-floor thumps with anvil clanks on every
 *  offbeat and a chugging root-note riff. Bar 3 vents steam; bar 4 the
 *  hammers return accelerating. */
const forgeGolem: TrackDef = {
  bpm: 80,
  steps: 64,
  schedule(t0, out, st) {
    drone(t0, 33, st * 64, "sine", 0.08, out);
    drone(t0, 51, st * 64, "sine", 0.01, out);
    noiseHit(t0, st * 64, 0.018, out, "lowpass", 300);
    for (const b of [0, 16]) {
      for (const s of [0, 4, 8, 12]) thump(t0 + (b + s) * st, s % 8 === 0 ? 0.22 : 0.14, out, 115, 30);
      for (const s of [2, 6, 10, 14]) anvil(t0 + (b + s) * st, 0.02, out);
    }
    const riff = [[0, 45, 2], [2, 45, 2], [4, 48, 4], [8, 45, 2], [10, 44, 2], [12, 45, 4], [16, 45, 2], [18, 45, 2], [20, 51, 4], [24, 50, 2], [26, 48, 2], [28, 45, 4]];
    for (const [s, m, d] of riff) tone(t0 + s * st, m, d * st, "triangle", 0.085, out);
    // bar 3 — venting
    thump(t0 + 32 * st, 0.1, out, 55, 24);
    noiseHit(t0 + 32 * st, st * 8, 0.05, out, "highpass", 900); // steam blast
    drone(t0 + 32 * st, 45, 16 * st, "triangle", 0.05, out);
    tone(t0 + 40 * st, 44, 8 * st, "triangle", 0.05, out);
    // bar 4 — hammers return
    for (let i = 0; i < 4; i++) anvil(t0 + (48 + i * 4) * st, 0.02 + i * 0.008, out);
    for (let i = 0; i < 8; i++) thump(t0 + (48 + i * 2) * st, 0.06 + i * 0.022, out, 118, 30);
    noiseHit(t0 + 48 * st, st * 16, 0.05, out, "highpass", 1000, true);
    const rise = [[48, 45, 4], [52, 47, 4], [56, 48, 4], [60, 50, 4]];
    for (const [s, m, d] of rise) tone(t0 + s * st, m, d * st, "triangle", 0.085, out);
  },
};

/** Grubbins' shop — the "Jaunty Haggler" (ear-test winner, 2026-07-09, over
 *  a sly-smoky swing and a music-box waltz; the losing sketches live in git
 *  history). A bright A-major oom-pah market tune played as cheerful contrast
 *  over the gritty den: root/fifth sine bass, skipping triangle lute,
 *  tambourine offbeats, the odd coin glint. Palette rules hold — no squares,
 *  sines only down low — and it's A-rooted like everything else so
 *  crossfades land consonantly. */
const shopTheme: TrackDef = {
  bpm: 104,
  steps: 64,
  schedule(t0, out, st) {
    // Oom-pah bass: roots on the downbeats, the fifth answering; bar 3 lifts
    // to D for the turnaround.
    for (let b = 0; b < 4; b++) {
      const root = b === 2 ? 38 : 33;
      for (const s of [0, 8])
        tone(t0 + (b * 16 + s) * st, root, st * 3, "sine", 0.08, out);
      for (const s of [4, 12])
        tone(t0 + (b * 16 + s) * st, root + 7, st * 3, "sine", 0.06, out);
    }
    // The skipping lute.
    const lute = [
      [0, 69, 1], [2, 73, 1], [4, 76, 2], [7, 74, 1], [8, 73, 1], [10, 71, 1], [12, 69, 2],
      [16, 69, 1], [18, 73, 1], [20, 76, 2], [23, 78, 1], [24, 76, 1], [26, 74, 1], [28, 73, 2],
      [32, 74, 1], [34, 74, 1], [36, 78, 2], [39, 76, 1], [40, 74, 1], [42, 73, 1], [44, 71, 2],
      [48, 69, 1], [50, 71, 1], [52, 73, 2], [55, 71, 1], [56, 69, 3], [60, 64, 3],
    ];
    for (const [s, m, d] of lute) tone(t0 + s * st, m, d * st, "triangle", 0.062, out);
    // Tambourine offbeats + a light foot-tap on the bar lines.
    for (let s = 2; s < 64; s += 4)
      noiseHit(t0 + s * st, 0.05, 0.02, out, "highpass", 5200);
    for (const s of [0, 16, 32, 48]) thump(t0 + s * st, 0.08, out, 95, 40);
    // Coin glints.
    tone(t0 + 30 * st, 88, st * 1.5, "sine", 0.012, out);
    tone(t0 + 62 * st, 93, st * 1.5, "sine", 0.012, out);
  },
};

const TRACKS: Record<MusicTrackId, TrackDef> = {
  emberfall,
  blackblade,
  longDark,
  coldVigil,
  catacombHymn,
  warden,
  barrowWind,
  theRestless,
  abomination,
  underCanopy,
  packTrails,
  direAlpha,
  wardedHalls,
  leakingArcana,
  runeGolem,
  blightedGrove,
  sporefall,
  elderTreant,
  twinLight,
  shadowclimb,
  totality,
  coldAnvil,
  emberHalls,
  forgeGolem,
  shopTheme,
};

// ---------------------------------------------------------------------------
// Director — one playing track, crossfades, autoplay unlock, persisted mute
// ---------------------------------------------------------------------------

const MASTER_VOL = 0.9; // ceiling; the settings musicVol slider scales under it
const FADE_IN_SEC = 1.2;
const FADE_OUT_SEC = 0.8;

let desired: MusicTrackId | null = null;
let playing: { id: MusicTrackId; gain: GainNode; timer: number } | null = null;

const musicVol = (): number => MASTER_VOL * getSettings().musicVol;

// Start whatever's desired the moment audio unlocks (pure array push at module
// scope — touches no browser APIs until the callback actually fires).
onAudioUnlocked(() => apply());

// Follow the settings live: retarget the playing track's gain on volume
// changes; apply() handles mute flips (stop/start).
subscribeSettings((s) => {
  if (playing && ctx) {
    const g = playing.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(MASTER_VOL * s.musicVol, ctx.currentTime + 0.15);
  }
  apply();
});

function startTrack(id: MusicTrackId): void {
  const c = ctx!;
  const def = TRACKS[id];
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, musicVol()), c.currentTime + FADE_IN_SEC);
  gain.connect(c.destination);

  const st = 60 / def.bpm / 4;
  const loopDur = st * def.steps;
  let nextT = c.currentTime + 0.08;
  def.schedule(nextT, gain, st);
  nextT += loopDur;
  // Lookahead scheduler: top up the next loop shortly before the current one
  // ends. Wide margin so background-tab timer throttling doesn't cause gaps.
  const timer = window.setInterval(() => {
    // If the schedule fell far behind the audio clock (hidden-tab timers can
    // throttle to ~1/min while the context keeps running), skip the missed
    // loops instead of replaying them one per tick.
    if (nextT < c.currentTime - 1) nextT = c.currentTime + 0.08;
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
  ctx = getAudioContext();
  noiseBuf = getNoiseBuffer();
  const target = getSettings().muted ? null : desired;
  if (playing?.id === target) return;
  stopCurrent();
  if (target && isAudioUnlocked() && ctx) startTrack(target);
}

/** Declare which track should be playing (null = silence). Safe to call
 *  before any user gesture — the track starts once audio unlocks. */
export function setMusicTrack(id: MusicTrackId | null): void {
  desired = id;
  installAudioUnlockListener();
  apply();
}

/** The track currently audible (null while muted/locked/silent). Debug aid. */
export function getCurrentMusicTrack(): MusicTrackId | null {
  return playing?.id ?? null;
}

/** Per-dungeon soundtrack sets: each dungeon draws one of its floor tracks at
 *  random per floor, and its boss floor gets the bespoke boss track. */
const DUNGEON_TRACKS: Record<string, { floors: MusicTrackId[]; boss: MusicTrackId }> = {
  depths: { floors: ["longDark", "coldVigil", "catacombHymn"], boss: "warden" },
  bonefields: { floors: ["barrowWind", "theRestless"], boss: "abomination" },
  wilds: { floors: ["underCanopy", "packTrails"], boss: "direAlpha" },
  sealed_vault: { floors: ["wardedHalls", "leakingArcana"], boss: "runeGolem" },
  overgrowth: { floors: ["blightedGrove", "sporefall"], boss: "elderTreant" },
  eclipse_spire: { floors: ["twinLight", "shadowclimb"], boss: "totality" },
  deep_forge: { floors: ["coldAnvil", "emberHalls"], boss: "forgeGolem" },
};

/** Dungeon floor soundtrack: the dungeon's boss floors get its boss track;
 *  other floors draw from its floor pool at random (presentation-only, so
 *  Math.random is fine here — this never touches the simulation). Unknown
 *  dungeon ids fall back to the Depths set. */
export function pickDungeonTrack(dungeonId: string, floor: number): MusicTrackId {
  const dungeon = DUNGEONS[dungeonId] ?? DUNGEONS.depths;
  const set = DUNGEON_TRACKS[dungeon.id] ?? DUNGEON_TRACKS.depths;
  if (isBossFloorIn(dungeon, floor)) return set.boss;
  return set.floors[Math.floor(Math.random() * set.floors.length)];
}

// ---------------------------------------------------------------------------
// Result stingers — one-shot victory/defeat pieces outside the loop system.
// Playing one ends the looping battle track (the battle is over); the hub
// theme returns when the player leaves the results screen and the shell
// declares emberfall again. Same A-rooted language as the tracks, and same
// palette rule: drones and triangle/sine voices, no chirpy square leads.
// ---------------------------------------------------------------------------

export type StingerId = "victory" | "defeat" | "levelup";

const STINGER_DUR: Record<StingerId, number> = {
  victory: 4.5,
  defeat: 5.5,
  levelup: 1.8,
};

const STINGERS: Record<StingerId, (t0: number, out: GainNode) => void> = {
  /** A-major sunrise: low drone, a rising triangle arpeggio, then the chord
   *  swells and holds with one distant bell on top. Warm, not brassy. */
  victory(t0, out) {
    thump(t0, 0.2, out, 130, 30);
    drone(t0, 45, 4.4, "triangle", 0.09, out); // A2 floor
    drone(t0, 52, 4.4, "sine", 0.04, out); // E3
    const arp = [[0, 57], [0.18, 61], [0.36, 64], [0.54, 69]]; // A C# E A
    for (const [at, m] of arp) tone(t0 + at, m, 0.55, "triangle", 0.07, out);
    thump(t0 + 0.72, 0.12, out, 110, 36); // land the chord
    for (const m of [57, 61, 64]) drone(t0 + 0.72, m, 3.4, "triangle", 0.05, out);
    tone(t0 + 1.2, 76, 1.4, "sine", 0.02, out); // E5 shimmer
    tone(t0 + 1.7, 81, 2.2, "sine", 0.016, out); // A5 distant bell
  },
  /** A-minor lament: the line falls A→G→F and hangs unresolved on E over a
   *  detuned choir, with a slow toll and wind. Somber, not punishing. */
  defeat(t0, out) {
    thump(t0, 0.08, out, 60, 28); // toll
    drone(t0, 33, 5.4, "triangle", 0.11, out); // A1 floor
    noiseHit(t0, 5.4, 0.018, out, "lowpass", 400); // wind
    const line = [[0, 57, 0.9], [0.8, 55, 0.9], [1.6, 53, 0.9], [2.4, 52, 2.2]];
    for (const [at, m, d] of line) tone(t0 + at, m, d, "triangle", 0.06, out);
    for (const m of [45, 52, 60]) // Am choir, detuned pairs
      for (const dt of [-0.07, 0.07]) drone(t0 + 1.5, m + dt, 3.8, "triangle", 0.02, out);
    thump(t0 + 2.4, 0.06, out, 55, 26); // second, farther toll
    tone(t0 + 3.2, 69, 1.8, "sine", 0.013, out, 66); // distant falling cry
  },
  /** Level-up chime: a quick A-major triangle run up the octave with a sine
   *  sparkle on top. Light and short — it rings over the results screen
   *  (after the result stinger), so no drone floor, no toll. */
  levelup(t0, out) {
    const run = [[0, 69], [0.09, 73], [0.18, 76], [0.27, 81]]; // A4 C#5 E5 A5
    for (const [at, m] of run) tone(t0 + at, m, 0.4, "triangle", 0.055, out);
    tone(t0 + 0.27, 88, 1.1, "sine", 0.02, out); // E6 sparkle
    tone(t0 + 0.42, 93, 1.2, "sine", 0.012, out); // A6 glint
  },
};

/** Play a one-shot result stinger. Ends the current looping track (fade-out)
 *  and leaves silence behind it — screens re-declare music afterwards via
 *  setMusicTrack. Honors mute and the musicVol slider at fire time. */
export function playStinger(id: StingerId): void {
  desired = null; // the battle track ends with the battle
  installAudioUnlockListener();
  apply(); // fades out the loop and refreshes ctx/noiseBuf mirrors
  if (!ctx || !isAudioUnlocked() || getSettings().muted) return;
  const c = ctx;
  const gain = c.createGain();
  gain.gain.value = musicVol();
  gain.connect(c.destination);
  STINGERS[id](c.currentTime + 0.05, gain);
  window.setTimeout(() => {
    try {
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }, (STINGER_DUR[id] + 1) * 1000);
}
