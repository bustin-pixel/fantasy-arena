// ============================================================================
// SFX
// Procedural unit sound effects — synthesized Web Audio, no asset files, same
// approach as music.ts. The palette was A/B auditioned with the user
// (2026-07-04): all "A" variants plus Heal B (rising shimmer) and Frost B (icy
// shatter); Deploy A without the chain tick. Everything runs through a small
// echo bus (the "dungeon reverb" that keeps the 8-bit voices from being harsh).
//
// Strategy: ~20 archetype sounds shared by unit family, with a per-defId
// pitch-rate table so units within a family still sound distinct (the Ogre
// slams deeper than the Orc, the Assassin is sharper than the Rogue).
//
// Events come from SfxObserver, which diffs consecutive BattleSnapshots on the
// render side — deaths, deploys, casts, melee swings, projectile launches,
// vfx impacts, heals, traps. Presentation-only: the simulation knows nothing
// about any of this.
// ============================================================================

import type { BattleSnapshot, Unit } from "@/types";
import { SUMMONED_UNIT_IDS } from "@/data/units";
import {
  getAudioContext,
  getNoiseBuffer,
  installAudioUnlockListener,
  isAudioUnlocked,
} from "@/audio/context";
import { getSettings, subscribeSettings } from "@/state/settings";

// ---------------------------------------------------------------------------
// Bus + primitives
// ---------------------------------------------------------------------------

const SFX_VOL = 0.5; // ceiling; the settings sfxVol slider scales under it

let out: GainNode | null = null; // dry bus
let echoSend: GainNode | null = null;

// Follow the settings sfxVol slider live.
subscribeSettings((s) => {
  if (out) out.gain.value = SFX_VOL * s.sfxVol;
});

function ensureBus(): AudioContext | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!out) {
    out = ctx.createGain();
    out.gain.value = SFX_VOL * getSettings().sfxVol;
    out.connect(ctx.destination);
    // Dungeon echo: delay -> lowpass -> feedback, mixed back into the dry bus.
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.11;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    echoSend = ctx.createGain();
    echoSend.gain.value = 0.22;
    echoSend.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(out);
  }
  return ctx;
}

function route(g: GainNode): void {
  g.connect(out!);
  g.connect(echoSend!);
}

/** Oscillator blip with a pitch ramp. All frequencies scale by `r` (the
 *  per-unit rate) so one design serves a whole family. */
function blip(
  r: number, at: number, f0: number, f1: number, dur: number,
  type: OscillatorType, vol: number, attack = 0.006
): void {
  const ctx = getAudioContext()!;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0 * r, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * r), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  route(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise burst with a filter sweep. */
function burst(
  r: number, at: number, dur: number, vol: number,
  fType: BiquadFilterType, f0: number, f1: number
): void {
  const ctx = getAudioContext()!;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer()!;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = fType;
  f.frequency.setValueAtTime(f0 * r, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * r), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  route(g);
  src.start(t);
  src.stop(t + dur + 0.03);
}

/** A few decaying sine partials — metallic rings, gongs, bells. */
function ring(r: number, at: number, freqs: number[], dur: number, vol: number): void {
  const ctx = getAudioContext()!;
  const t = ctx.currentTime + at;
  freqs.forEach((fr, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = fr * r;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol / (i + 1), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.15));
    o.connect(g);
    route(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

// ---------------------------------------------------------------------------
// The palette (user's A/B picks)
// ---------------------------------------------------------------------------

export type SfxKey =
  | "sword" | "slam" | "dagger" | "bow" | "mysticShot" | "bolt" | "fireWhoosh"
  | "fireBoom" | "frostShatter" | "zap" | "arcaneWarp" | "curse" | "heal"
  | "summon" | "roar" | "shieldGong" | "slimeSquish" | "boneRattle" | "death"
  | "deploy" | "trapSet" | "trapSnap" | "chestCreak" | "chestOpen" | "polymorph";

const SOUNDS: Record<SfxKey, (r: number) => void> = {
  // metallic clang (A)
  sword(r) { ring(r, 0, [2000, 3050, 4600], 0.16, 0.1); burst(r, 0, 0.04, 0.22, "highpass", 4000, 7000); },
  // deep quake (A)
  slam(r) { blip(r, 0, 90, 28, 0.3, "triangle", 0.55); burst(r, 0.01, 0.3, 0.3, "lowpass", 600, 110); },
  // whisper shink (A)
  dagger(r) { burst(r, 0, 0.04, 0.26, "highpass", 5500, 8500); ring(r, 0.01, [6200], 0.05, 0.03); },
  // longbow twang + arrow whistle (A)
  bow(r) { blip(r, 0, 140, 60, 0.07, "square", 0.2); blip(r, 0.03, 1200, 2400, 0.16, "sine", 0.045); burst(r, 0.02, 0.1, 0.1, "bandpass", 1500, 3000); },
  // bow pluck with a shimmer tail (round-1 keeper)
  mysticShot(r) { blip(r, 0, 220, 90, 0.05, "square", 0.16); [1800, 2400, 3200].forEach((f, i) => blip(r, 0.04 + i * 0.035, f, f * 0.9, 0.09, "sine", 0.05)); },
  // generic magic bolt launch (caster basic attacks)
  bolt(r) { blip(r, 0, 700, 380, 0.08, "sine", 0.12); burst(r, 0, 0.05, 0.06, "bandpass", 1800, 2600); },
  // fireball launch whoosh (impact is fireBoom, on the burn_burst vfx)
  fireWhoosh(r) { burst(r, 0, 0.2, 0.16, "bandpass", 300, 1500); },
  // grand boom + crackle (A)
  fireBoom(r) { burst(r, 0, 0.42, 0.45, "lowpass", 800, 140); blip(r, 0, 100, 30, 0.38, "triangle", 0.45); [0.08, 0.18, 0.29].forEach((at) => burst(r, at, 0.05, 0.06, "highpass", 3000, 2200)); },
  // icy shatter (B)
  frostShatter(r) { burst(r, 0, 0.14, 0.18, "highpass", 4500, 7000); [3000, 2300, 1700, 1250].forEach((f, i) => burst(r, 0.03 + i * 0.04, 0.03, 0.14, "bandpass", f, f * 0.85)); },
  // buzzy crackle (A)
  zap(r) { for (let i = 0; i < 6; i++) blip(r, i * 0.028, 2200 - i * 300, 600 - i * 60, 0.03, "sawtooth", 0.13); burst(r, 0, 0.16, 0.09, "highpass", 5000, 8000); },
  // warp up-down (A) — also the generic cast wind-up
  arcaneWarp(r) { blip(r, 0, 300, 900, 0.12, "sine", 0.12); blip(r, 0.11, 900, 250, 0.16, "sine", 0.12); blip(r, 0.05, 1800, 2600, 0.12, "sine", 0.035); },
  // low moan + breath (A)
  curse(r) { blip(r, 0, 140, 60, 0.55, "sawtooth", 0.1, 0.06); blip(r, 0.01, 144, 62, 0.55, "sawtooth", 0.07, 0.06); burst(r, 0, 0.5, 0.08, "lowpass", 700, 160); },
  // rising shimmer (B)
  heal(r) { [1047, 1319, 1568, 1976, 2093].forEach((f, i) => blip(r, i * 0.04, f, f, 0.18, "sine", 0.04, 0.01)); },
  // summon poof (round-1 keeper)
  summon(r) { burst(r, 0, 0.28, 0.12, "bandpass", 300, 2600); blip(r, 0.26, 500, 950, 0.07, "sine", 0.14); blip(r, 0.3, 700, 1200, 0.06, "sine", 0.09); },
  // big beast bellow (A)
  roar(r) { blip(r, 0, 160, 90, 0.1, "sawtooth", 0.18); blip(r, 0.06, 95, 58, 0.55, "sawtooth", 0.2, 0.05); blip(r, 0.06, 99, 61, 0.55, "sawtooth", 0.14, 0.05); burst(r, 0.08, 0.45, 0.14, "lowpass", 500, 150); },
  // shield gong (round-1 keeper)
  shieldGong(r) { ring(r, 0, [220, 505, 830, 1190], 0.7, 0.12); burst(r, 0, 0.05, 0.08, "highpass", 2500, 4000); },
  // slime squish (round-1 keeper)
  slimeSquish(r) { blip(r, 0, 220, 60, 0.16, "sine", 0.26); blip(r, 0.07, 160, 50, 0.14, "sine", 0.18); burst(r, 0, 0.18, 0.2, "lowpass", 420, 130); },
  // bone rattle (round-1 keeper)
  boneRattle(r) { [0, 0.05, 0.11, 0.16].forEach((at, i) => burst(r, at, 0.03, 0.24, "bandpass", 1500 + i * 180, 1200)); },
  // fading sweep (A)
  death(r) { blip(r, 0, 500, 70, 0.32, "triangle", 0.15); burst(r, 0, 0.28, 0.14, "lowpass", 1000, 140); },
  // stone thud, no chain tick (A, per user)
  deploy(r) { blip(r, 0, 120, 45, 0.13, "triangle", 0.3); burst(r, 0.01, 0.09, 0.09, "lowpass", 500, 180); },
  // trap armed: quiet mechanical tick
  trapSet(r) { blip(r, 0, 1600, 1100, 0.03, "square", 0.08); ring(r, 0.02, [2200], 0.05, 0.03); },
  // trap sprung (round-1 keeper)
  trapSnap(r) { blip(r, 0, 2400, 900, 0.03, "square", 0.18); ring(r, 0.02, [1900], 0.09, 0.09); burst(r, 0.035, 0.06, 0.14, "highpass", 3000, 5000); },
  // chest lid: latch click + stick-slip hinge squeaks (reward ceremony)
  chestCreak(r) { blip(r, 0, 950, 1400, 0.035, "square", 0.11); [0.07, 0.17, 0.28].forEach((at, i) => blip(r, at, 330 - i * 45, 235 - i * 45, 0.1, "sawtooth", 0.06, 0.025)); burst(r, 0.06, 0.28, 0.045, "bandpass", 950, 480); },
  // chest reveal: lid thump + rising sparkle + coin jingle
  chestOpen(r) { blip(r, 0, 130, 55, 0.13, "triangle", 0.24); [1319, 1568, 2093, 2637].forEach((f, i) => blip(r, 0.05 + i * 0.05, f, f * 1.03, 0.15, "sine", 0.05, 0.008)); [0.14, 0.22, 0.3, 0.39].forEach((at, i) => ring(r, at, [3140 + i * 230, 4250 + i * 270], 0.09, 0.045)); },
  // polymorph lands: sparkle rise, comic pop, confused double baa (variant B,
  // widget-auditioned 2026-07-05; the bleat is the zap-style rapid-blip wobble)
  polymorph(r) { [900, 1300, 1900].forEach((f, i) => blip(r, i * 0.05, f, f * 1.2, 0.08, "sine", 0.05)); blip(r, 0.16, 1400, 300, 0.05, "square", 0.12); for (let i = 0; i < 3; i++) blip(r, 0.26 + i * 0.04, 660 - i * 20, 600 - i * 20, 0.045, "sawtooth", 0.08, 0.008); for (let i = 0; i < 3; i++) blip(r, 0.47 + i * 0.045, 520 - i * 15, 470 - i * 15, 0.05, "sawtooth", 0.07, 0.01); },
};

// ---------------------------------------------------------------------------
// Per-unit character
// ---------------------------------------------------------------------------

/** Pitch-rate per defId (1 = as designed; lower = bigger/deeper). */
const RATE: Record<string, number> = {
  ogre: 0.8, bloater: 0.75, orc: 0.9, zombie_shambler: 0.85, berserker: 0.85,
  knight: 1.0, warrior: 1.05, holy_knight: 0.95, aegis_knight: 0.9,
  assassin: 1.15, rogue: 1.05, trickster: 1.2, wolf: 1.1, giant_rat: 1.4,
  skeleton: 1.25, slime: 1.0, slime_clone: 1.3, boar: 1.0,
  archer: 1.0, ranger: 1.05, hunter: 0.95, mystic_archer: 1.1, turret: 1.35,
  mage: 1.0, fire_mage: 0.95, ice_mage: 1.1, electric_mage: 1.15,
  arcane_mage: 1.0, necromancer: 0.8, healer: 1.1, summoner: 0.9, engineer: 1.0,
};

/** Melee swing sound per defId (ranged/caster attacks sound on projectile
 *  launch instead). Anything unlisted falls back to "sword". */
const MELEE_SOUND: Record<string, SfxKey> = {
  knight: "sword", warrior: "sword", holy_knight: "sword", aegis_knight: "sword",
  berserker: "sword", orc: "sword", skeleton: "sword",
  ogre: "slam", bloater: "slam", zombie_shambler: "slam", boar: "slam", summoner: "slam",
  assassin: "dagger", rogue: "dagger", trickster: "dagger", wolf: "dagger", giant_rat: "dagger",
  slime: "slimeSquish", slime_clone: "slimeSquish",
};

/** Projectile-launch sound by the shooter's defId. */
const SHOT_SOUND: Record<string, SfxKey> = {
  archer: "bow", ranger: "bow", hunter: "bow", turret: "bow",
  mystic_archer: "mysticShot",
  fire_mage: "fireWhoosh",
};

/** Cast wind-up sound per defId (castTicks starting to count down). */
const CAST_SOUND: Record<string, SfxKey> = {
  necromancer: "curse", summoner: "summon", engineer: "trapSet",
};

/** Death sound overrides (default is the fading sweep). */
const DEATH_SOUND: Record<string, SfxKey> = {
  skeleton: "boneRattle", slime: "slimeSquish", slime_clone: "slimeSquish",
  bloater: "slimeSquish",
};

/** Units whose mid-battle arrival is a summon poof, not a deploy thud. */
const SUMMONED = SUMMONED_UNIT_IDS;

/** Big monsters announce themselves (Depths bosses emerging). */
const ROARS_ON_SPAWN = new Set(["bloater"]);

const rateFor = (defId: string): number => RATE[defId] ?? 1;

/** Currently a harmless sheep (mirrors the renderer's polymorph check). */
const sheeped = (u: Unit): boolean =>
  u.effects?.some((e) => e.type === "polymorph") ?? false;

// ---------------------------------------------------------------------------
// Playback with throttling
// ---------------------------------------------------------------------------

/** Per-key minimum gap (ms) so a 4v4 brawl stays crunchy, not white noise. */
const MIN_GAP_MS: Partial<Record<SfxKey, number>> = {
  heal: 450, sword: 90, dagger: 90, slam: 120, bow: 70, bolt: 80,
  death: 120, deploy: 100, zap: 140, fireBoom: 150, frostShatter: 140,
  slimeSquish: 120, shieldGong: 200,
};
const DEFAULT_GAP_MS = 60;
const MAX_PER_OBSERVE = 6;

const lastPlayed = new Map<SfxKey, number>();

/** Fire one sound (rate-adjusted), honoring mute + throttles. */
export function playSfx(key: SfxKey, rate = 1): void {
  installAudioUnlockListener();
  if (!isAudioUnlocked() || getSettings().muted) return;
  if (!ensureBus()) return;
  const now = performance.now();
  const last = lastPlayed.get(key) ?? -Infinity;
  if (now - last < (MIN_GAP_MS[key] ?? DEFAULT_GAP_MS)) return;
  lastPlayed.set(key, now);
  SOUNDS[key](rate);
}

// ---------------------------------------------------------------------------
// SfxObserver — turns snapshot diffs into sounds
// ---------------------------------------------------------------------------

interface UnitMemo {
  state: Unit["state"];
  anim: Unit["animState"];
  casting: boolean;
  sheeped: boolean;
}

export class SfxObserver {
  private baselined = false;
  private units = new Map<string, UnitMemo>();
  private projectiles = new Set<string>();
  private vfx = new Set<string>();
  private texts = new Set<string>();
  private traps = new Set<string>();

  observe(snap: BattleSnapshot): void {
    const first = !this.baselined;
    this.baselined = true;
    let budget = first ? 0 : MAX_PER_OBSERVE;
    const play = (key: SfxKey, rate = 1) => {
      if (budget <= 0) return;
      budget--;
      playSfx(key, rate);
    };

    const byUid = new Map<string, Unit>();
    for (const u of snap.units) byUid.set(u.uid, u);

    // --- units: deploys/summons, deaths, melee swings, cast wind-ups ------
    for (const u of snap.units) {
      const memo = this.units.get(u.uid);
      const r = rateFor(u.defId);
      if (!memo) {
        if (!first && u.state !== "dead") {
          if (ROARS_ON_SPAWN.has(u.defId)) play("roar", r);
          else if (snap.phase === "battle" && SUMMONED.has(u.defId)) play("summon", r);
          else play("deploy", r);
        }
      } else {
        if (u.state === "dead" && memo.state !== "dead") {
          play(DEATH_SOUND[u.defId] ?? "death", r);
        }
        // Melee swing: attack animation started on a short-range unit
        // (ranged/caster attacks are voiced by their projectile instead).
        if (u.animState === "attacking" && memo.anim !== "attacking" && u.range <= 60 && u.state !== "dead") {
          play(MELEE_SOUND[u.defId] ?? "sword", r);
        }
        const casting = u.castTicks > 0;
        if (casting && !memo.casting) {
          play(CAST_SOUND[u.defId] ?? "arcaneWarp", r);
        }
        // Polymorph landing: the effect appearing on the VICTIM voices the
        // sheep-poof, pitched by the victim's rate (an Ogre baas deeper).
        if (sheeped(u) && !memo.sheeped) {
          play("polymorph", r);
        }
      }
      this.units.set(u.uid, {
        state: u.state,
        anim: u.animState,
        casting: u.castTicks > 0,
        sheeped: sheeped(u),
      });
    }

    // --- projectile launches ----------------------------------------------
    for (const p of snap.projectiles) {
      if (this.projectiles.has(p.id)) continue;
      this.projectiles.add(p.id);
      if (first) continue;
      const src = byUid.get(p.sourceUid);
      const defId = src?.defId ?? "";
      play(SHOT_SOUND[defId] ?? "bolt", rateFor(defId));
    }

    // --- vfx impacts --------------------------------------------------------
    for (const v of snap.vfx) {
      if (this.vfx.has(v.id)) continue;
      this.vfx.add(v.id);
      if (first) continue;
      switch (v.kind) {
        case "slam": play("slam"); break;
        case "frost": play("frostShatter"); break;
        case "burn_burst": play("fireBoom"); break;
        case "lightning": play("zap"); break;
        case "shield_pop": play("shieldGong"); break;
        // "death" vfx is skipped — the unit state transition already voices it.
      }
    }

    // --- heals (floating text) ---------------------------------------------
    for (const ft of snap.floatingTexts) {
      if (this.texts.has(ft.id)) continue;
      this.texts.add(ft.id);
      if (first) continue;
      if (ft.kind === "heal") play("heal");
    }

    // --- traps: armed / sprung ---------------------------------------------
    const nowTraps = new Set<string>();
    for (const t of snap.traps) nowTraps.add(`${t.x},${t.y},${t.team}`);
    if (!first) {
      for (const k of nowTraps) if (!this.traps.has(k)) play("trapSet");
      for (const k of this.traps) if (!nowTraps.has(k)) play("trapSnap");
    }
    this.traps = nowTraps;

    // Keep the seen-id sets from growing all match.
    if (this.projectiles.size > 600) this.prune(this.projectiles, snap.projectiles.map((p) => p.id));
    if (this.vfx.size > 600) this.prune(this.vfx, snap.vfx.map((v) => v.id));
    if (this.texts.size > 600) this.prune(this.texts, snap.floatingTexts.map((t) => t.id));
  }

  private prune(set: Set<string>, keep: string[]): void {
    set.clear();
    for (const id of keep) set.add(id);
  }
}
