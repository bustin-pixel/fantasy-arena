# Home mode-buttons — downscale mockups

The three Home mode cards (Arena / Dungeons / Endless) plus the floating Bag FAB
overlapped on short phones: the Endless card's bottom-right collided with the
Bag. Three downscale directions were mocked (harness rendered the real Home
layout inside a 375×667 phone frame and measured the actual Endless-card→Bag
gap). **Variant 2 (Compact + smaller Bag) was chosen and built** into
`src/styles.css`.

## Variants shown

| # | Direction | Card size | Bag |
|---|-----------|-----------|-----|
| 1 | Condensed | same vertical card, uniformly smaller (pad 11, icon 30, title 1.12rem) | 78 (unchanged) |
| **2** | **Compact + smaller Bag (CHOSEN)** | cards stay a touch bigger; Bag shrinks | trimmed |
| 3 | Icon-left row | horizontal list (icon left, text right), shortest cards | 78 (unchanged) |

## What actually shipped (variant 2, tuned against the real screen)

The harness under-represented real heights — the live `.home-header` (75px) and
`.profile-plate` (69px) are chunkier than the mock's stand-ins, and real cards
render ~8px taller than the harness predicted. So variant 2 was re-tuned against
the **live DOM** (`preview_eval` measuring `.mode-card.endless` bottom vs
`.home-bag-fab` top) until it genuinely cleared. Final values in `src/styles.css`:

- `.mode-cards` gap: `14px → 9px`
- `.mode-card` padding: `22px 16px → 8px 16px`
- `.mode-card-icon`: (was 44px via the SVG's own width/height) → `width/height: 32px`; dropped the vestigial `font-size: 2rem` (leftover from the emoji era)
- `.mode-card-title` font-size: `1.5rem → 1.24rem`
- `.home-bag-fab`: `78×78, radius 22 → 52×52, radius 16`
- `.home-bag-emoji` font-size: `2rem → 1.4rem`
- `.home-bag-text` font-size: `0.82rem → 0.58rem`

Result: per-card height `141px → 104px`; Endless card clears the Bag by **+15px**
at 375×667. Per the user's call, the fix is scoped to the buttons + Bag only
(not the header/profile spacing), so it clears standard small phones (≥667px
tall); very short phones (≤640px) may still slightly overlap.

## Lesson

For layout/spacing mockups, the harness phone frame is directional but **not
pixel-faithful** — its stand-in header/profile-plate were shorter than the real
components. Always re-measure the real Home screen via `preview_eval` before
declaring a spacing fix done. See memory `verify-in-browser-render`.
