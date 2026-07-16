# Depths castle doodad mockups — 2026-07-16

Harness: `public/mockups/depths-castle.html` (deleted after the build).
Two castle variants for The Depths — both with a metal-bar portcullis gate
and torch glow. **Both were built** (no loser this time):

## 1 — "Twin-Tower Gatehouse" (`castle`) — world-map hero

Crenellated twin towers + curtain wall, stone arch with the portcullis
(4 vertical + 2 horizontal iron bars, `#9aa3ad` over the dark opening),
arrow slits, red pennant, torch sconces (flickering warm glow FX, staggered
delays). Placed at the Depths world node **(+9, −4)**, scale 1.1 — the user
X'd the world map's cave mound and asked for the castle in its place, so the
castle is now the Depths' ONLY world landmark (it took the mound's x offset;
it previously sat at −10, +3 on the node's other side). `dy` was then raised
from +2 to **−4**: at +2 the castle's base landed on the node's "The Depths"
label (the label starts ~3.2 viewBox units under the node center, and the
castle's base is its own origin), so it now clears the label by ~8.7 units.

The mound survives for variety on the **floor** corners via the new
`BiomeSpec.floorCorner` seam (`{ kind: "caveMouth", scale: 1.6 }`), which
overrides the heroes[last] corner rule — needed because the mound is no
longer in `heroes` at all. Unset for every other dungeon, so they keep the
heroes[last] behavior.

## 2 — "Rock-Hewn Barbican" (`barbican`) — Depths floor's Lair guard

The castle grown out of the cave mound itself: mound foundation
(biome-ground shaded, like caveMouth), gate cut into the rock + portcullis,
side turrets, tall central keep with a lit window (breathing glow) and gold
pennant. Placed via `BiomeSpec.bossProp` beside the Depths floor trail's
deepest node at **(+12, +3)**, scale 1.0.

Shared helpers added to `BiomeLayer.tsx`: `merlonPaths` (battlements) and
`portcullisPaths` (arched dark opening + iron bars) — reusable for any future
fortification doodad.
