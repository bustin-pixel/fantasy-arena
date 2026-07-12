# Library Compendium — shelf & book-ceremony mockups (2026-07-11)

Four harness variants of the bookshelf Compendium (9 books: 7 dungeons +
Heroes of the Arena + Arms & Relics; chained spines for gated dungeons; CSS 3D
open ceremony with two-page spreads and a flipping leaf; procedural
bookOpen/pageFlip/bookClose/chainRattle SFX).

**Chosen & built: 1 — Grand Athenaeum** (no tweaks requested). Stately
dark-walnut shelves, tall slim spines with raised gold accent bands and
small-caps embossed titles, candlelight flicker in the shelf's upper corner.
Built into `screens/CompendiumScreen.tsx` + `components/compendium/`
(books.ts manifest, BookOverlay ceremony, ItemDetailPane) with styles under
"Grand Athenaeum" in styles.css; spine palette lives in books.ts `SPINES`.

Losing variants (differences from the winner — shared bones were identical):

- **2 — Cozy Scriptorium**: warm oak boards, chunkier 42px spines with cloth
  stripe texture, two books leaning at ±3–4°, dust motes drifting up through
  the light.
- **3 — Arcane Archive**: near-black shelving under a violet haze, each spine
  carrying a pulsing rune strip (`repeating-linear-gradient` + blur keyframe)
  and a glow shadow in its accent color; the open tome floated with drifting
  light orbs and a `drop-shadow` aura.
- **4 — Field Journal**: rough plank boards (`repeating-linear-gradient`
  grain), dashed stitched borders, a leather strap + brass buckle across each
  spine at 38% height, kraft-paper pages with uppercase Trebuchet headings.

Harness page (`public/mockups/library-compendium.html`) deleted after the
build; the ceremony/leaf/chain CSS in styles.css is a direct port of it.

## Round 2 — splash paintings (2026-07-11)

Four painting styles for the book covers + lore-page plates (harness
`public/mockups/book-splash-art.html`, deleted after the build).

**Chosen & built: 2 — Oil Vignette** (no tweaks) — bespoke hand-painted canvas
scene per book with a shared painterly finish (brush streaks, grain,
vignette), living in `components/compendium/splashArt.ts` (seeded PRNG so the
grain never shimmers between repaints). Placement per the user: BOTH the cover
(behind the title, emoji dropped from the cover; spines keep theirs) and a
gold-framed plate on each book's first page.

Losing variants:

- **1 — Arena Vista**: the dungeon's real `arenaThemes` backdrop cropped as a
  landscape painting (zero new art; items book got a still-life fallback).
  Authentic but read as "screenshot", less painterly.
- **3 — Illuminated Emblem**: painterly medallion in the book's leather/accent
  colors, drawn motif (skull/gear/stair/gem) in a gold-leaf ring with corner
  flourishes; systematic one-renderer approach.
- **4 — Watercolor Glyph**: the theme emoji printed huge over watercolor
  washes with a print-offset shadow; cheapest.

Harness gotcha for future rounds: this session's embedded browser pane never
fired `requestAnimationFrame`, so harness paint scheduling moved to
`setTimeout(0)` — keep doing that in mockup harnesses.
