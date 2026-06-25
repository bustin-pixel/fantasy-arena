// ============================================================================
// Deterministic RNG — Mulberry32
// A small, fast, fully deterministic PRNG. Given the same seed and the same
// sequence of calls, it ALWAYS produces identical output. This is the backbone
// of deterministic simulation: every random decision in combat (AI deploy
// positions, tie-breaks, future crit rolls) must draw from one of these so a
// battle can be perfectly reproduced from its seed for replays / server reconciliation.
//
// NEVER use Math.random() inside the engine.
// ============================================================================

export class RNG {
  private state: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Pick a random element. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher–Yates shuffle (returns a new array). */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Snapshot the internal state (for save/restore / replay seeking). */
  getState(): number {
    return this.state;
  }
  setState(s: number): void {
    this.state = s | 0;
  }
}

/** Generate a seed for a fresh match. Uses Date.now outside the sim boundary only. */
export function generateSeed(): number {
  return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0;
}
