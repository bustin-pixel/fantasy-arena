// Dev-only probe for the `pixelArt` setting (Settings → Visuals → Pixel sprites).
//
// ⚠ WHY THIS MODULE EXISTS AT ALL: a harness page that dynamic-imports
// "/src/state/settings.ts" gets a DIFFERENT module instance from the one
// `sprites.ts` reaches via "@/state/settings" — the same alias-vs-path split
// that made a warm-up through `getPixelFrame` silently useless (see the
// imageSprites note in sprites.ts). Flipping the setting on the harness's copy
// therefore never reached the renderer, and the probe read "toggle does
// nothing" when the toggle was fine.
//
// Everything here imports through the SAME "@/" aliases the game uses, so this
// module shares instances with the renderer. Import it BY PATH from a harness
// and call `probePixelToggle()` — the flip and the draw then happen inside one
// consistent graph.
import { drawUnitSprite } from "@/assets/sprites";
import { getPixelFrame } from "@/assets/imageSprites";
import { getSettings, updateSettings } from "@/state/settings";
import type { Unit } from "@/types";

function stub(defId: string): Unit {
  return {
    uid: `probe-${defId}`,
    defId,
    state: "alive",
    animState: "idle",
    animTime: 1,
    attackSpeed: 1.4,
    attackCooldown: 0,
    moveSpeed: 40,
    facing: 1,
    effects: [],
    pos: { x: 0, y: 0 },
    maxHp: 100,
    hp: 100,
  } as unknown as Unit;
}

/** Alpha count + a cheap colour signature of one rendered unit. */
function render(defId: string): { px: number; sig: number } {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  drawUnitSprite(ctx, stub(defId), 48, 66, {
    battle: true,
    dir8: 1,
    animPhase: 0.3,
    staticPose: true,
  });
  const d = ctx.getImageData(0, 0, 96, 96).data;
  let px = 0;
  let sig = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 10) {
      px++;
      sig = (sig + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0;
    }
  }
  return { px, sig };
}

export async function probePixelToggle(ids: string[]) {
  // Warm the pixel registry through the aliased module (lazy async decode).
  for (const id of ids) getPixelFrame(id, 1, "idle", 0);
  for (let i = 0; i < 40; i++) {
    if (ids.every((id) => getPixelFrame(id, 1, "idle", 0))) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const was = getSettings().pixelArt;
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    updateSettings({ pixelArt: true });
    const on = render(id);
    updateSettings({ pixelArt: false });
    const off = render(id);
    out[id] = {
      pixel: on,
      original: off,
      differs: on.sig !== off.sig,
      hasPixelArt: !!getPixelFrame(id, 1, "idle", 0),
    };
  }
  updateSettings({ pixelArt: was });
  return out;
}
