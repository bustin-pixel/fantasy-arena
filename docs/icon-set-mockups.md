# Icon set — style directions (mockup archive)

Context: every emoji in the game was replaced with a hand-drawn vector icon. Emoji rendered as
Segoe UI Emoji / Apple Color Emoji / Noto depending on the player's device, so the same screen
looked like three different games, and none of the three matched the gold/steel/bone palette.
Mobile also silently auto-emojifies bare dingbats (`☠ ⚠ ⚔ ⚙ ⚒ ❄ ✝ ❗ ⚜`), which is why those
were in scope too.

Three directions were mocked at `public/mockups/icon-set.html`, each shown large and — the part
that actually decided it — in the real contexts: wallet pills at inline `1em`, Home FABs at
26px, book spines at 18px, and the battle status row at 13px over turf.

## ✅ Picked — 2 · Inked Woodcut

Bold silhouette with a heavy dark outline, like a medieval print. Highlight facets drop away;
detail marks (a coin's mint-mark, a wolf's ears, a hammer's haft) stay.

**Why it won:** it's the only direction that survives the battle status row. Those icons draw at
13px over a busy, moving battlefield, and the ink outline is what separates them from the turf.

## ✗ 1 · Flat Heraldic

Flat two-tone fills, no outline — a direct continuation of `ModeIcons.tsx`. The safest match to
what already shipped, and it read well at 22px+. Lost because it went muddy at status-row size:
with no outline, a mid-tone icon on mid-tone grass has almost nothing holding its edge.

## ✗ 3 · Gilded Relief

One gold/brass ramp with a dark drop-offset, like figures stamped into metal. The most premium
of the three and by far the most cohesive. Lost because it throws away **colour as an
identifier** — every icon becomes the same gold, so burn and poison are the same object in the
status row, distinguishable only by silhouette. Fine for a nav bar, wrong for combat state.

## Implementation notes worth keeping

- A style is a **role → paint mapping**, not per-icon colours. Parts are authored once as
  geometry plus a semantic role (`base` / `dark` / `accent` / `ink`); `iconPaint.ts` resolves
  them. That's what makes 38 icons look like one set, and it's how all three directions were
  rendered from a single set of drawings.
- **`dark` does double duty** — it shades *and* it carries detail. An early version of the
  woodcut style flattened both facet roles into `base`, which silently erased the coin's star,
  the wolf's ears and the hammer's haft. Only flatten `light`.
- Icons default to `width/height: 1em` so they inherit the holder's font-size exactly the way
  the emoji did. That made most call sites a drop-in with no CSS change. The holders that *did*
  need work were ones sized for small display type (shop prices, forge service buttons) — their
  icon gets an explicit floor instead of disturbing the text beside it.
- `text-shadow` does nothing to an SVG. Holders that lit the old glyph that way needed
  `filter: drop-shadow(...)` instead.
