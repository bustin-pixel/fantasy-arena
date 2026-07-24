// Settings specs — focused on the one-time "pixel art ships OFF" migration,
// because a plain default flip does NOT reach existing players: updateSettings
// persists the whole object, so anyone who ever hit mute already has the old
// `pixelArt: true` on disk.
//
// The module caches its settings in a module-level variable, so every case
// resets the registry and re-imports to get a cold load.
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "fantasy-arena/settings/v1";
const MARKER = "fantasy-arena/settings/pixel-default-off";

/** Minimal localStorage for the node test environment. */
function installStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  return map;
}

async function freshSettings() {
  vi.resetModules();
  return import("@/state/settings");
}

describe("pixel art ships off", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to off on a brand-new install", async () => {
    installStorage();
    const { getSettings } = await freshSettings();
    expect(getSettings().pixelArt).toBe(false);
  });

  it("forces off a player who already has pixelArt true stored", async () => {
    // Exactly what a live player gets today from hitting mute on the battle
    // HUD: the whole object written out, pixelArt included.
    const map = installStorage({
      [KEY]: JSON.stringify({ musicVol: 0.5, muted: true, pixelArt: true }),
    });
    const { getSettings } = await freshSettings();
    expect(getSettings().pixelArt).toBe(false);
    // and it is written back, so the next load agrees
    expect(JSON.parse(map.get(KEY)!).pixelArt).toBe(false);
    expect(map.get(MARKER)).toBe("1");
    // unrelated settings survive the migration
    expect(getSettings().musicVol).toBe(0.5);
    expect(getSettings().muted).toBe(true);
  });

  it("runs only once — a later deliberate opt-in survives", async () => {
    const map = installStorage({
      [KEY]: JSON.stringify({ pixelArt: true }),
      [MARKER]: "1",
    });
    const { getSettings } = await freshSettings();
    expect(getSettings().pixelArt).toBe(true);
    expect(JSON.parse(map.get(KEY)!).pixelArt).toBe(true);
  });

  it("still lets the toggle turn it on", async () => {
    installStorage();
    const { getSettings, updateSettings } = await freshSettings();
    expect(getSettings().pixelArt).toBe(false);
    expect(updateSettings({ pixelArt: true }).pixelArt).toBe(true);
    expect(getSettings().pixelArt).toBe(true);
  });
});
