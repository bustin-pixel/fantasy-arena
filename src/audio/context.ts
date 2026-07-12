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
    installResumeWatchers();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

// Browsers suspend the AudioContext when the tab is backgrounded/slept
// (Edge sleeping tabs, Chrome Memory Saver, iOS "interrupted"). These
// watchers are permanent: wake the context whenever the page becomes
// visible again, and on any gesture (some browsers only allow resume
// from a user gesture).
let watchersInstalled = false;

function installResumeWatchers(): void {
  if (watchersInstalled) return;
  watchersInstalled = true;
  const resumeIfSleeping = () => {
    if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume();
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeIfSleeping();
  });
  window.addEventListener("pointerdown", resumeIfSleeping);
  window.addEventListener("keydown", resumeIfSleeping);
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
