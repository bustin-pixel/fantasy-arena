// ============================================================================
// Shared audio context
// One AudioContext (and one white-noise buffer) for the whole game — the music
// director and the SFX engine both draw from here. Browsers refuse audio until
// a user gesture, so consumers arm the unlock listener and get a callback once
// audio is actually available.
// ============================================================================

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlocked = false;
let listenerInstalled = false;
const unlockCbs: Array<() => void> = [];

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

/** 1s of white noise, shared by every noise-based voice (wind, snares, dust). */
export function getNoiseBuffer(): AudioBuffer | null {
  return noiseBuf;
}

/** Run `cb` once audio unlocks (or never, if the user never interacts). */
export function onAudioUnlocked(cb: () => void): void {
  if (unlocked) cb();
  else unlockCbs.push(cb);
}

function createCtx(): void {
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

/** Arm a one-shot listener on the first gesture; safe to call repeatedly. */
export function installAudioUnlockListener(): void {
  if (listenerInstalled || typeof window === "undefined") return;
  listenerInstalled = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("click", unlock);
    createCtx();
    unlocked = true;
    for (const cb of unlockCbs.splice(0)) cb();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("click", unlock);
}
