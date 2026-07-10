# Shopkeeper (Grubbins) — mockup rounds

The shop's set piece was chosen over two mockup rounds shown as **inline chat
widgets** (2026-07-09, during plan mode — the usual `public/mockups/` harness
can't be written there; the widgets satisfied rule zero since they render in
the user's own chat).

## Round 1 — who runs the shop (4 concepts)

| # | Concept | Signature animations |
|---|---------|----------------------|
| **1** | **Grubbins — Goblin Pawnbroker (CHOSEN)** | coin flip, ear twitch, gold-tooth glint, swinging lantern, dust motes |
| 2 | Borga — Dwarven Quartermaster | axe polishing, blade gleam, beard sway, forge sparks |
| 3 | Vesper — Hooded Curio-Mystic | glowing eyes, floating bottles, orb pulse, cat tail flick |
| 4 | Maribel — Halfling Alchemist Granny | bubbling cauldron, steam, friendly wave, glasses glint |

User note on picking 1: make him **higher fidelity** — explicitly licensed to
exceed the sprite house style because it's a fully rendered set-piece screen.

## Round 2 — render treatment (4 takes on Grubbins)

| # | Treatment | Notes |
|---|-----------|-------|
| 1 | Lantern Painterly | soft chiaroscuro, no outlines, coin-tracking eyes |
| 2 | Inked & Cel | bold comic outlines, flat cel shade |
| 3 | Plush Toybox | chunky Hearthstone-y, squash & stretch |
| **4** | **Gritty Pawn-Den (CHOSEN & BUILT)** | muted grime, pipe smoke, scarred ear, heavy shadows, wall-cast silhouette |

## What was built

`src/components/GrubbinsScene.tsx` — the round-2 winner ported to a typed,
self-contained rAF canvas (ChestSprite pattern), plus a purchase-pleased
reaction (`reactNonce` prop: perked ears, brow raise, guaranteed tooth glint).
Idle loop: slow coin flip with eye tracking, drumming fingers, swaying lantern
+ volumetric beam + motes, rocking balance scale, smoking pipe, price tag sway.

Further art tweaks happen against the REAL screen (Home → Shop) — there is no
separate scene harness on purpose; a copy would drift from the component.

## Round 3 — brand-new PixiJS art (4 directions, 2026-07-10)

Superseded round 2's canvas art. Harness: `public/mockups/grubbins-newart.html`
(deleted after the pick, per the loop) — four from-scratch goblins authored as
native PixiJS v8 scene graphs with WebGL bloom, not effect passes over old art.
(The earlier `grubbins-pixi.html` round — effect stacks over the round-2 canvas
art — was abandoned unpicked when the user asked for new art instead.)

| # | Direction | Signature bits |
|---|-----------|----------------|
| **1** | **Gilded Baron (CHOSEN & BUILT)** | burgundy velvet, monocle + glint, gold chain/medallion, brass lamp + light cone, coin flip w/ eye tracking, bloomed golds |
| 2 | Bog Fence | notched droopy ears, snaggletooth, moon slats vs. candle, pickled-things jars, fireflies, circling fly |
| 3 | Arcane Appraiser | jeweler's lens w/ magnified eye, levitating gem over palm, rising runes, glowing bottles, brass scale |
| 4 | Torchlit Brute | tusks, torn ear, ear cuffs, live brazier + embers/smoke, coin-bite test cycle, pulsing vignette |

Tweaks applied to 1 before building: variant 4's broad flat nose; variant 3's
brass balance scale added (left counter, verbatim incl. cyan gem chip); ring
stand moved from under the resting arm to the counter's far right; the lamp's
hard skewed beam polygon replaced with a soft conical gradient that sways with
the lamp + a tracking light pool (motes re-aimed into the cone).

Built as `components/GrubbinsScene.tsx` (same `width`/`reactNonce` interface;
ShopScreen untouched). This added `pixi.js` + `pixi-filters` as the app's
first WebGL dependency — gotchas in NOTES hazard 10.

## Theme song

Ear-tested 2026-07-09 on a gitignored harness (3 sketches): **2 — Jaunty
Haggler WON** and is wired in as `shopTheme` in `src/audio/music.ts` — a
bright A-major oom-pah market tune played as cheerful contrast over the
gritty den. Losers: 1 Sly & Smoky (the interim default; composition preserved
in git history at commit 23008c3) and 3 Curio Music-Box Waltz. The harness
page was deleted after the pick, per the mockup loop.

Harness bug for posterity (the "audio is bugged" report): never schedule
gain automation on a shared master bus — play()'s volume restore raced
stop()'s pending fade and parked the page at permanent silence. Fix: one
session GainNode per play(), faded + disconnected on stop/switch (which also
kills pre-scheduled note bleed). Pattern recorded in session memory.
