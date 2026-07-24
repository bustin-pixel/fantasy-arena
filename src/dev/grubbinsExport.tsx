// ============================================================================
// DEV HARNESS (delete before ship) — capture the live GrubbinsScene and stage
// it in ComfyUI's input dir as restyle sources.
//
// Two sources come out of one capture:
//   source_fa_grubbins_scene.png  640x448  the whole pawn-den set piece
//   source_fa_grubbins_bust.png   512x512  a padded crop around the goblin
//
// Pixi renders to a WebGL canvas whose drawing buffer is normally discarded
// after composite, so `toDataURL` would read blank — we wrap
// Application.prototype.init (same module instance as GrubbinsScene, via the
// Vite graph) to force `preserveDrawingBuffer`.
// ============================================================================

import { createRoot } from "react-dom/client";
import { Application } from "pixi.js";
import { GrubbinsScene } from "@/components/GrubbinsScene";

const MOUNT_W = 1024;
const VIEW_W = 400;
const VIEW_H = 280;
const COMFY = "http://127.0.0.1:8188";

// ---- force a readable drawing buffer before the scene mounts ---------------
const apps: Application[] = [];
const origInit = Application.prototype.init;
Application.prototype.init = function (this: Application, opts?: Record<string, unknown>) {
  apps.push(this);
  return origInit.call(this, { ...(opts ?? {}), preserveDrawingBuffer: true } as never);
};

function log(msg: string) {
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
  console.log("[grubbins-export]", msg);
}

/** Crop a logical-space rect out of the live canvas onto a padded output. */
function cropTo(
  src: HTMLCanvasElement,
  lx: number,
  ly: number,
  lw: number,
  lh: number,
  outW: number,
  outH: number,
  inset: number,
  bg: string
): HTMLCanvasElement {
  const s = src.width / VIEW_W; // device px per logical unit
  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const x = c.getContext("2d")!;
  x.fillStyle = bg;
  x.fillRect(0, 0, outW, outH);
  const scale = Math.min(outW / lw, outH / lh) * inset;
  const dw = lw * scale;
  const dh = lh * scale;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(
    src,
    lx * s, ly * s, lw * s, lh * s,
    (outW - dw) / 2, (outH - dh) / 2, dw, dh
  );
  return c;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png")
  );
}

async function upload(c: HTMLCanvasElement, name: string) {
  const fd = new FormData();
  fd.append("image", await toBlob(c), name);
  fd.append("overwrite", "true");
  fd.append("type", "input");
  const r = await fetch(`${COMFY}/upload/image`, { method: "POST", body: fd });
  log(`${name}  ${c.width}x${c.height}  -> ComfyUI ${r.status} ${await r.text()}`);
  // also show it on the page so the crop can be eyeballed
  const holder = document.getElementById("shots");
  if (holder) {
    const fig = document.createElement("figure");
    const img = new Image();
    img.src = c.toDataURL();
    img.style.cssText = "max-width:420px;border:1px solid #443";
    const cap = document.createElement("figcaption");
    cap.textContent = `${name} (${c.width}x${c.height})`;
    cap.style.cssText = "color:#c9b98a;font:12px monospace;margin-top:4px";
    fig.append(img, cap);
    holder.append(fig);
  }
}

async function run() {
  const host = document.getElementById("scene")!;
  createRoot(host).render(<GrubbinsScene width={MOUNT_W} />);

  // Pixi's init is async and the scene needs a few ticks of the coin flip.
  await new Promise((r) => setTimeout(r, 2500));
  const app = apps[0];
  if (!app) {
    log("FAIL: no Pixi Application captured");
    return;
  }
  const canvas = app.canvas as HTMLCanvasElement;
  log(`live canvas ${canvas.width}x${canvas.height} (css ${canvas.style.width})`);

  // Force one render so the preserved buffer holds a complete frame.
  app.renderer.render(app.stage);

  // 1) whole set piece, 10:7 like the shop screen
  await upload(
    cropTo(canvas, 0, 0, VIEW_W, VIEW_H, 640, 448, 1, "#0b0810"),
    "source_fa_grubbins_scene.png"
  );

  // 1b) the same set piece INSET in its frame. Qwen-Edit zoom-crops an
  // edge-to-edge source (it ate the lamp, the sign and the scale on the first
  // roll) and the anti-zoom clause that would fix it also flattens the repaint
  // to near-identity. Padding solves framing mechanically, which frees the
  // prompt to push style — the recipe that won the UI re-mock.
  await upload(
    cropTo(canvas, 0, 0, VIEW_W, VIEW_H, 640, 448, 0.74, "#0b0810"),
    "source_fa_grubbins_scenepad.png"
  );

  // 2) the goblin himself, padded so Qwen-Edit repaints instead of zoom-cropping
  await upload(
    cropTo(canvas, 118, 54, 174, 168, 512, 512, 0.88, "#0b0810"),
    "source_fa_grubbins_bust.png"
  );

  // 3) a MEDIUM SHOT at the shop banner's exact 10:7 — closer than the full
  // set piece, wider than the bust, so a painted result drops into the shop
  // slot without re-framing the screen or losing the ear tips.
  await upload(
    cropTo(canvas, 100, 58, 200, 140, 640, 448, 0.9, "#0b0810"),
    "source_fa_grubbins_mid.png"
  );

  // 4) THE DEN WITH THE GOBLIN REMOVED — the plate a pixel Grubbins gets
  // composited onto, so he can be judged standing behind the real counter
  // instead of floating on a contact sheet. buildScene() adds its layers in a
  // fixed order and the goblin is three of them (body, resting arm, flip arm)
  // plus his coin; hide those and the den, counter, lamp, scale and wares all
  // stay. Verified by colour, not by faith — see the skin-pixel count below.
  const root = app.stage.children[0];
  const kids = (root as unknown as { children: Array<{ visible: boolean }> }).children;
  const skinPixels = (c: HTMLCanvasElement) => {
    const g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // his three skin tones sit around #7d8f4e / #5a6a36 / #98ab62
      if (d[i] > 70 && d[i] < 170 && d[i + 1] > 95 && d[i + 1] < 190 &&
          d[i + 2] > 35 && d[i + 2] < 115 && d[i + 1] > d[i] && d[i] > d[i + 2]) n++;
    }
    return n;
  };
  const before = skinPixels(cropTo(canvas, 0, 0, VIEW_W, VIEW_H, 640, 448, 1, "#0b0810"));
  for (const i of [5, 9, 10, 12]) if (kids[i]) kids[i].visible = false;
  app.renderer.render(app.stage);
  const plate = cropTo(canvas, 0, 0, VIEW_W, VIEW_H, 640, 448, 1, "#0b0810");
  const after = skinPixels(plate);
  log(`den plate: goblin skin px ${before} -> ${after}` +
      (after < before * 0.05 ? "  OK" : "  ** GOBLIN STILL VISIBLE **"));
  await upload(plate, "source_fa_grubbins_den_empty.png");
  for (const i of [5, 9, 10, 12]) if (kids[i]) kids[i].visible = true;

  log("DONE");
}

run().catch((e) => log(`ERROR ${e?.message ?? e}`));
