# Atlas liveliness mockups — 2026-07-16

Harness: `public/mockups/atlas-lively.html` (deleted after the build; it was a
faithful canvas mini-port of the atlas renderer). Two animation packages were
mocked over today's Painted Realm atlas, plus a shared base-polish pass.

## Shared base polish (built — applies regardless of variant)

- **De-stacked placement**: every solid doodad claims a footprint
  (`DOODAD_FOOT` in `data/atlasBiomes.ts`); candidates must clear claimed
  footprints at 80% of summed radii. Hero landmarks place FIRST so scatter
  respects them. Tufts/pebbles stay free clutter. Attempt caps raised
  (world 120→260, floor 420→700) to keep density.
- **Prop art upgrade** (`BiomeLayer.tsx` `doodadInner`): highlight facets on
  pines/rocks/mountains/stalags/tents, moss + cracks on tombs/ruins/arches,
  crystal glints + base rubble, mushroom gills + cap sheen, volcano molten
  crater + extra streak, mountain ash cap, spire window glow, candle drips +
  flame core, lava bright core, dagger/blade glints, skull-pile extra sockets.
- **Per-instance hue tint** on organic kinds (`tint` on `DoodadPlacement`).
- **Contact shadows** under every solid prop (heroes heavier).
- **Medallion catch-light** (inset box-shadow, kept through the pulse keyframes).

## 1 — Living Realm (NOT built — archived)

Nature-flavored ambience: drifting cloud shadows, wind-sway on flora
(rotate ±2.6° at base, per-doodad phase), ambient glows (crystals violet,
candles flicker, lava breathes), volcano smoke, marching trail dots
(lineDashOffset crawl on conquered segments), a light-beacon column on the
current node, bird flocks crossing every ~11 s, fireflies over green biomes;
floor views: rising ash + sparks, smouldering red aura on the boss lair.

Worth revisiting: the **marching trail dots** and the **boss-lair smoulder**
mix well with Enchanted Chart if the user ever wants a hybrid.

## 2 — Enchanted Chart (PICKED & BUILT)

Magical-cartography ambience, built into:

- `AtlasTrail.tsx` — ley-pulse comet (rAF along the first run's conquered
  segments via the mask paths' `getPointAtLength`; own `pulsePaths` ref map),
  rolling fog banks (world: uncharted nodes; floor: locked steps), inked
  compass rose w/ wobbling needle (world only), orbiting sparks on the current
  node, glyph bob (world unlocked vignettes; `.world` class added), marker
  ripple ring, rotating runic circle under a floor's entry node, drifting
  arcane runes (floor views).
- `BiomeLayer.tsx` — living landmarks on HERO props only: volcano smoke,
  tombBig ghost wisp, mushroomBig spores, crystalBig sparkle, caveMouth warm
  glow (radialGradient in defs — NO SVG filters, they jank the zoom).
- `styles.css` — all keyframes + breathing map edges (`.atlas-map::after`),
  breathing margin notes.

Verified in-game 2026-07-16 (typecheck + 596 tests + build + DOM/anim probes
in the preview pane; ley-pulse position sampled moving along the trail).
Screenshot tool was blocked in the pane — needs a quick device/browser eyeball.
