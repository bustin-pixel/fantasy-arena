# Forge set — visual upgrade mockups (2026-07-14)

Upgrade of the Blacksmith's **placeholder forge set** (the character is still
deferred — see the `blacksmith-forge-built` memory). Composition stays pinned to
the live scene (forge left, anvil centre, quench vat right) because the crafting
theatre targets `ANVIL_X`/`ANVIL_TOP`/`FORGE_*`. Harness was
`public/mockups/forge-upgrade.html` (gitignored).

Three directions were shown:

- **1 — Roaring Hearth** *(not chosen)* — same set, dramatically better fire:
  licking flame tongues, a pulsing glowing coal bed, a brighter mouth, a warm
  floor light-pool, an anvil rim-light, busier embers. This became the fire
  base layer for all variants.
- **2 — Working Smithy** ✅ **CHOSEN & BUILT** — Roaring Hearth + a lived-in
  shop: a wall tool-rail (two hammers, tongs), a hung bellows/air-blower, and
  finished blades cooling by the quench.
- **3 — Molten Forge-Heart** *(not chosen)* — dramatic: rune-etched glowing
  lintel, molten cracks in the coals, a rising heat column, steam off the
  quench, and a cool blue room shadow so the fire reads white-hot. (The steam
  routine survives in the mockup's `drawBarrel({steam})` if we ever want it.)

## Tweaks applied to #2 before building (in iteration order)

1. **Anvil 1.7×** and **quench vat 1.6×**, both anchored at their base so they
   grow upward and stay on the floor. Vat got a lighter inner water pool, a
   second hoop band, and a surface shimmer.
2. **Anvil moved right** to `ANVIL_X=200` (silhouette centre ≈ 202 in the
   400-wide frame; nudged right of dead centre per the last note).
3. **Horseshoe removed** from the tool rail; the **bellows (air blower) hung on
   the rail** in its place next to the other tools; the old floor bellows dropped.
4. **Small-brick hearth** added at the base of the fire (running-bond bricks +
   a warm lip) for a real built-forge look.
5. **Smoke flue extended to the ceiling** (`shaftTop` param on the forge shell)
   with a lit/shadowed edge for depth.
6. **Furnace floor light-pool clipped to the floor** so it no longer washes the
   wall beside the forge.

## Build notes (ported into `src/components/BlacksmithScene.tsx`)

- 2D-canvas mockup → PixiJS v8: additive **glowSprites** for room wash, deep
  mouth heat, hot core, coals, barrel shimmer; a per-frame **`Graphics` with
  `blendMode="add"`** for the flame tongues; a static additive `Graphics` arc
  for the inner-arch rim (alpha animated). The floor pool is a soft glowSprite
  **masked** by a floor-band `Graphics`.
- **The mockup has NO bloom.** First build wrongly parked the whole fire inside
  the bloomed `fx` container, which double-brightened the stacked additive glows
  and blew them out (user: "too bright vs the mockup"). Fix: the idle fire now
  lives in its own **un-bloomed `fireLayer`**; the `AdvancedBloomFilter` on `fx`
  is reserved for the transient crafting sparks/flash/result-glow. This makes
  the idle render additive-only, matching the mockup 1-for-1.
- Landmark math: `ANVIL_BASE_Y=240`, `ANVIL_Y=240−34·1.7`, `ANVIL_TOP=ANVIL_Y−10·1.7`
  (≈165) so the scaled container's base sits on the floor and the striking face
  — where sparks + the rising forged item land — moves with it.
- Gate: typecheck + build + 518 tests all green. **Live Pixi render NOT
  self-verified** — the in-app Browser pane refuses to load this project's Pixi
  scenes (documented), so the render was confirmed by the user on their dev server.
