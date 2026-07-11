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

/** While true, voices skip the echo send — UI/meta sounds are dry (a menu tap
 *  repeating through the dungeon delay reads as a bug). Set around the SOUNDS
 *  dispatch in playSfx; safe because every recipe builds its graph
 *  synchronously. */
let dryOnly = false;

function route(g: GainNode): void {
  g.connect(out!);
  if (!dryOnly) g.connect(echoSend!);
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
  | "deploy" | "trapSet" | "trapSnap" | "chestCreak" | "chestOpen" | "polymorph"
  | "anvil" | "itemReveal" | "coinSpend"
  // UI/meta family (soundboard-auditioned 2026-07-11: Glasswork sine base with
  // the Woodwork triangle tap + equip pair)
  | "uiTap" | "uiOpen" | "uiClose" | "uiSelect" | "uiConfirm" | "uiDeny"
  | "uiEquip" | "uiUnequip" | "deckAdd" | "deckRemove" | "deckShuffle"
  | "compendiumReveal"
  // battle-flow
  | "countTick" | "countGo" | "waveHorn" | "bossAlarm" | "boonChime"
  | "boonPick" | "retireBank"
  // reward/economy
  | "coinTick" | "unlockFanfare" | "questSting" | "chestShine" | "coinShower"
  // Grubbins' gibberish barks (Warm timbre)
  | "grubbinsGreet" | "grubbinsHappy" | "grubbinsSad" | "grubbinsNeutral"
  // combat hit layer (Crunchy knock)
  | "hitSoft" | "hitBig";

/** Keys that skip the dungeon-echo bus. Battle sounds (hits, horns) stay wet;
 *  everything the player clicks in menus is dry. */
const DRY_KEYS: Set<SfxKey> = new Set([
  "uiTap", "uiOpen", "uiClose", "uiSelect", "uiConfirm", "uiDeny",
  "uiEquip", "uiUnequip", "deckAdd", "deckRemove", "deckShuffle",
  "compendiumReveal", "countTick", "countGo", "boonChime", "boonPick",
  "retireBank", "coinTick", "unlockFanfare", "questSting", "chestShine",
  "coinShower", "grubbinsGreet", "grubbinsHappy", "grubbinsSad",
  "grubbinsNeutral",
]);

// --- Grubbins' voice: Animal-Crossing-style gibberish ----------------------
// One syllable = a triangle "glottal" blip + a bandpass formant puff; a bark
// is 2–4 syllables walked along a pitch contour (mood). Warm timbre picked on
// the 2026-07-11 soundboard. `durMul` scales the whole syllable rate — the
// sad bark's 1.4 was auditioned as-is, so it stays even though it also lifts
// the formant register.
const GRUB_BASE = 140;
function syllable(r: number, at: number, f: number): void {
  blip(r, at, f, f * 0.9, 0.08, "triangle", 0.13, 0.02);
  burst(r, at, 0.04, 0.025, "bandpass", f * 5, f * 4);
}
function mumble(r: number, contour: number[], step: number, durMul: number): void {
  contour.forEach((c, i) => syllable(r * durMul, i * step, GRUB_BASE * c));
}

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
  // item combine: hammer-on-anvil clash (metallic ring over a low thud)
  anvil(r) { blip(r, 0, 110, 45, 0.14, "triangle", 0.4); ring(r, 0.01, [1720, 2610, 3900], 0.32, 0.12); burst(r, 0, 0.05, 0.2, "highpass", 3500, 6500); },
  // item reveal: rising shimmer arpeggio (the merged result pops into view)
  itemReveal(r) { [1047, 1319, 1568, 2093].forEach((f, i) => blip(r, i * 0.06, f, f * 1.04, 0.16, "sine", 0.06, 0.008)); ring(r, 0.22, [3140, 4230], 0.14, 0.05); },
  // shop purchase: coins clinking into Grubbins' palm (quick metallic double
  // tap + a couple of stray pouch jingles). First UI/meta sound — kept gentle.
  coinSpend(r) { ring(r, 0, [2520, 3810], 0.1, 0.07); ring(r, 0.07, [2930, 4420], 0.12, 0.06); [0.16, 0.23].forEach((at, i) => ring(r, at, [3350 + i * 420], 0.08, 0.035)); burst(r, 0, 0.03, 0.08, "highpass", 5200, 8200); },

  // ----- UI/meta family (all dry; quiet by design — vol ≤ .08) -------------
  // warm wood tap (nav, chips, retire-arm, deploy-zone ack)
  uiTap(r) { blip(r, 0, 820, 760, 0.04, "triangle", 0.06); },
  // rising glass pair (sheet/panel opens)
  uiOpen(r) { blip(r, 0, 1100, 1250, 0.055, "sine", 0.05); blip(r, 0.055, 1500, 1650, 0.055, "sine", 0.05); },
  // mirrored falling pair (sheet/panel closes)
  uiClose(r) { blip(r, 0, 1650, 1500, 0.055, "sine", 0.05); blip(r, 0.055, 1250, 1100, 0.055, "sine", 0.05); },
  // tiny glass tick (picking an option: floor, avatar, speed)
  uiSelect(r) { blip(r, 0, 1900, 1750, 0.025, "sine", 0.045); },
  // two-note up + faint ring (committing: Descend, save)
  uiConfirm(r) { blip(r, 0, 1320, 1320, 0.06, "sine", 0.05); blip(r, 0.07, 1760, 1760, 0.09, "sine", 0.05); ring(r, 0.13, [2640], 0.12, 0.03); },
  // dull low double-thunk (blocked: can't afford, deck full)
  uiDeny(r) { blip(r, 0, 240, 200, 0.06, "triangle", 0.07); blip(r, 0.09, 240, 200, 0.06, "triangle", 0.07); },
  // wood-warm buckle snick (item onto unit)
  uiEquip(r) { ring(r, 0, [1800, 2700], 0.07, 0.05); burst(r, 0, 0.025, 0.06, "lowpass", 1400, 700); },
  // reverse snick (item off)
  uiUnequip(r) { burst(r, 0, 0.025, 0.06, "lowpass", 1400, 700); blip(r, 0.025, 1400, 1000, 0.06, "triangle", 0.05); },
  // rising third (unit into deck)
  deckAdd(r) { blip(r, 0, 1320, 1320, 0.05, "sine", 0.05); blip(r, 0.05, 1660, 1660, 0.07, "sine", 0.05); },
  // falling third (unit out)
  deckRemove(r) { blip(r, 0, 1660, 1660, 0.05, "sine", 0.05); blip(r, 0.05, 1320, 1320, 0.07, "sine", 0.05); },
  // card riffle (auto-fill / randomize)
  deckShuffle(r) { for (let i = 0; i < 5; i++) burst(r, i * 0.04, 0.03, 0.06, "bandpass", 1200, 900); },
  // page-turn + faint ring (opening a revealed bestiary entry)
  compendiumReveal(r) { burst(r, 0, 0.12, 0.06, "bandpass", 900, 2000); ring(r, 0.1, [2800], 0.1, 0.03); },

  // ----- battle-flow --------------------------------------------------------
  // woodblock tick (3-2-1; caller raises rate per step so the count climbs)
  countTick(r) { blip(r, 0, 880, 860, 0.05, "triangle", 0.12); ring(r, 0.01, [1760], 0.05, 0.03); },
  // bright "Fight!" hit
  countGo(r) { blip(r, 0, 1046, 1046, 0.1, "sine", 0.12); ring(r, 0.04, [1568, 2093], 0.25, 0.08); burst(r, 0, 0.04, 0.06, "highpass", 3500, 5000); },
  // three ascending horn stabs (Endless: new wave) — wet
  waveHorn(r) { [147, 165, 196].forEach((f, i) => { blip(r, i * 0.15, f, f * 0.96, 0.18, "sawtooth", 0.1, 0.03); blip(r, i * 0.15, f * 1.02, f * 0.98, 0.18, "sawtooth", 0.07, 0.03); }); },
  // dread drop + low ring (boss telegraph; rare-spawn plays at rate 1.3) — wet
  bossAlarm(r) { blip(r, 0, 130, 75, 0.6, "triangle", 0.22, 0.06); ring(r, 0.05, [220, 262], 0.5, 0.09); burst(r, 0, 0.5, 0.1, "lowpass", 400, 120); },
  // harp gliss (Endless intermission opens)
  boonChime(r) { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(r, i * 0.035, f, f * 1.02, 0.12, "sine", 0.04, 0.008)); },
  // confirm + sparkle (boon chosen)
  boonPick(r) { blip(r, 0, 1320, 1320, 0.06, "sine", 0.05); blip(r, 0.07, 1760, 1760, 0.09, "sine", 0.05); ring(r, 0.13, [3140], 0.12, 0.04); },
  // big payout: ascending coin rings + shimmer (banking Endless gold)
  retireBank(r) { ring(r, 0, [2520, 2930], 0.1, 0.06); ring(r, 0.08, [3350, 3810], 0.1, 0.055); ring(r, 0.16, [4200, 4700], 0.12, 0.05); [1568, 2093].forEach((f, i) => blip(r, 0.24 + i * 0.05, f, f * 1.03, 0.12, "sine", 0.04, 0.008)); },

  // ----- reward/economy -----------------------------------------------------
  // one tiny coin ring (gold count-up; caller jitters rate + throttles)
  coinTick(r) { ring(r, 0, [3800], 0.05, 0.04); },
  // heraldic triangle stabs (new unit/item unlocked; end ping cut per user)
  unlockFanfare(r) { [[440, 554, 659], [440, 554, 659], [554, 659, 880]].forEach((chord, i) => chord.forEach((f) => blip(r, i * 0.18, f, f, i === 2 ? 0.3 : 0.12, "triangle", 0.05, 0.01))); },
  // deep bell + rising whisper (hidden quest discovered — mysterious)
  questSting(r) { ring(r, 0, [294, 588, 882], 0.6, 0.09); blip(r, 0.15, 800, 1600, 0.3, "sine", 0.03, 0.05); },
  // frosty sparkle (silver-tier chest flourish)
  chestShine(r) { [2600, 3300, 4100].forEach((f, i) => ring(r, i * 0.07, [f], 0.12, 0.05)); burst(r, 0, 0.06, 0.04, "highpass", 6000, 8000); },
  // coin scatter + low thump (gold-tier chest flourish)
  coinShower(r) { for (let i = 0; i < 8; i++) ring(r, i * 0.05, [2400 + ((i * 733) % 2200)], 0.07, 0.045); blip(r, 0.02, 120, 60, 0.1, "triangle", 0.12); burst(r, 0, 0.04, 0.06, "highpass", 5000, 7500); },

  // ----- Grubbins' barks (ShopScreen say() adds a little rate jitter) -------
  grubbinsGreet(r) { mumble(r, [1.0, 1.12, 1.28], 0.11, 1); },
  grubbinsHappy(r) { mumble(r, [1.15, 1.35, 1.45, 1.2], 0.09, 0.9); },
  grubbinsSad(r) { mumble(r, [1.0, 0.78], 0.16, 1.4); },
  grubbinsNeutral(r) { mumble(r, [1.0, 1.06, 0.97], 0.11, 1); },

  // ----- hit layer (quiet texture under the combat palette) — wet -----------
  hitSoft(r) { burst(r, 0, 0.035, 0.1, "bandpass", 900, 350); blip(r, 0, 300, 120, 0.04, "triangle", 0.05); },
  hitBig(r) { burst(r, 0, 0.06, 0.16, "bandpass", 700, 250); blip(r, 0, 220, 80, 0.07, "triangle", 0.12); ring(r, 0.01, [95], 0.1, 0.05); },
};

// ---------------------------------------------------------------------------
// Per-unit character
// ---------------------------------------------------------------------------

/** Pitch-rate per defId (1 = as designed; lower = bigger/deeper). */
const RATE: Record<string, number> = {
  ogre: 0.8, bloater: 0.75, orc: 0.9, zombie_shambler: 0.85, berserker: 0.85,
  knight: 1.0, warrior: 1.05, holy_knight: 0.95, aegis_knight: 0.9,
  assassin: 1.15, rogue: 1.05, trickster: 1.2, wolf: 1.1, giant_rat: 1.4,
  skeleton: 1.25, slime: 1.0, slime_clone: 1.3, boar: 1.0, bloatling: 1.05,
  slime_knight: 0.95, slime_squire: 1.3,
  archer: 1.0, ranger: 1.05, hunter: 0.95, mystic_archer: 1.1, turret: 1.35,
  mage: 1.0, fire_mage: 0.95, ice_mage: 1.1, electric_mage: 1.15,
  arcane_mage: 1.0, necromancer: 0.8, healer: 1.1, summoner: 0.9, engineer: 1.0,
};

/** Melee swing sound per defId (ranged/caster attacks sound on projectile
 *  launch instead). Anything unlisted falls back to "sword". */
const MELEE_SOUND: Record<string, SfxKey> = {
  knight: "sword", warrior: "sword", holy_knight: "sword", aegis_knight: "sword",
  berserker: "sword", orc: "sword", skeleton: "sword", slime_knight: "sword",
  ogre: "slam", bloater: "slam", zombie_shambler: "slam", boar: "slam", summoner: "slam",
  assassin: "dagger", rogue: "dagger", trickster: "dagger", wolf: "dagger", giant_rat: "dagger",
  slime: "slimeSquish", slime_clone: "slimeSquish", bloatling: "slimeSquish",
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
  bloater: "slimeSquish", bloatling: "slimeSquish",
  slime_knight: "slimeSquish", slime_squire: "slimeSquish",
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
  uiTap: 50, uiOpen: 120, uiClose: 120, uiSelect: 50, uiConfirm: 150,
  uiDeny: 200, uiEquip: 120, uiUnequip: 120, deckAdd: 80, deckRemove: 80,
  deckShuffle: 250, compendiumReveal: 200,
  countTick: 300, countGo: 500, waveHorn: 1000, bossAlarm: 1000,
  boonChime: 400, boonPick: 300, retireBank: 500,
  coinTick: 40, unlockFanfare: 800, questSting: 800, chestShine: 300,
  coinShower: 500,
  grubbinsGreet: 300, grubbinsHappy: 300, grubbinsSad: 300, grubbinsNeutral: 300,
  hitSoft: 140, hitBig: 260,
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
  dryOnly = DRY_KEYS.has(key);
  SOUNDS[key](rate);
  dryOnly = false;
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

/** Damage at/above this reads as a "big hit" (hitBig). Tunable — calibrated
 *  against mid-floor numbers; late-floor sweeps may want it higher. */
const BIG_HIT_DMG = 35;
/** Shared gate across hitSoft+hitBig so the layer stays a texture. */
const HIT_FAMILY_GAP_MS = 140;

export class SfxObserver {
  private baselined = false;
  private units = new Map<string, UnitMemo>();
  private projectiles = new Set<string>();
  private vfx = new Set<string>();
  private texts = new Set<string>();
  private traps = new Set<string>();
  private banner: string | null = null;
  private lastHitMs = -Infinity;

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

    // --- floating text: heals + the hit layer ------------------------------
    // Hits get their OWN budget (1/frame + family gate), outside play()'s
    // MAX_PER_OBSERVE pool, so a brawl's thud texture never starves deaths,
    // casts, or deploys — and vice versa.
    let hitBudget = first ? 0 : 1;
    for (const ft of snap.floatingTexts) {
      if (this.texts.has(ft.id)) continue;
      this.texts.add(ft.id);
      if (first) continue;
      if (ft.kind === "heal") {
        play("heal");
      } else {
        // damage | crit
        const now = performance.now();
        if (hitBudget > 0 && now - this.lastHitMs >= HIT_FAMILY_GAP_MS) {
          hitBudget--;
          this.lastHitMs = now;
          const amt = Number(ft.value.replace(/[^0-9]/g, "")) || 0;
          const big = ft.kind === "crit" || amt >= BIG_HIT_DMG;
          // Rate jitter is presentation-only (never touches the sim).
          playSfx(big ? "hitBig" : "hitSoft", big ? 0.9 : 1 + (Math.random() - 0.5) * 0.15);
        }
      }
    }

    // --- telegraph banners: boss/rare incoming, or a new Endless wave -------
    const b = snap.waveBanner;
    const bannerId = b ? `${b.kind}:${b.name}` : null;
    if (!first && b && bannerId !== this.banner) {
      if (b.kind === "wave") playSfx("waveHorn");
      else playSfx("bossAlarm", b.kind === "rare" ? 1.3 : 1);
    }
    this.banner = bannerId;

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
