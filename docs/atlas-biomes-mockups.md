# Atlas biome art — mockup archive (2026-07-15)

Style variants for the Dungeon Atlas painted-terrain layer, mocked on
`public/mockups/atlas-biomes.html` (harness deleted after build).

## Direction (evolved during the loop)

Started as 4 ink-on-parchment styles (Fine Ink / Bold Woodcut / Faded
Cartographer / Storybook). The user pivoted mid-loop to **seamless painted
biomes** covering the map like a strategy-game world (reference: a full-color
Inkarnate-style continent map): no parchment, terrain edge-to-edge, dense
prop clutter, big hero pieces near each dungeon ("big tombstones near the
bonefields"). Two tweak rounds: **remove the ocean** (terrain edge-to-edge)
and **run the biomes all the way to the map edges** (nearest-dungeon Voronoi
ground, blur-blended).

## The painted variants

1. **Painted Realm — CHOSEN & BUILT.** Natural palette, soft biome blending,
   medium outlines (`#3a2f22` / 0.3), dense clutter, worn pale-road trail.
2. **Stylized Kingdom** — +16 sat / +7 lit, thicker outlines (0.42), crisper
   patch edges, ×1.2 density. Brighter mobile-game energy. Rejected: fought
   the game's darker tone.
3. **Grim Ledger** — −22 sat / −8 lit, thin outlines, fog vignette closing in
   at the edges. Moody. Rejected: too murky for a reward screen.

## What got built (this is the source of truth now)

- `src/data/atlasBiomes.ts` — biome registry (ground color + weighted scatter
  + hero props per dungeon), deterministic placement math, nearest-biome
  ground blend (inverse-distance⁴), fog handling.
- `src/components/atlas/BiomeLayer.tsx` — doodad library + ground raster
  (tiny canvas → SVG `<image>`, NO SVG filters — feGaussianBlur janks the
  zoom transitions on mobile; bilinear upscale does the blending instead).
- Trail became pale worn-road dots over a dark halo (`.atlas-seg` +
  `.atlas-seg-halo`); node labels/notes flipped to light ink with dark halos.

## Kept knobs (from the losing variants, if the user ever wants a mood shift)

- Density multiplier: scatter target 24/region (world), 52 (floor).
- Saturation/lightness shift applied at the palette level would reproduce
  variants 2/3 — the doodad library reads colors from literals in
  BiomeLayer, so a mood shift means a palette map, not new art.
