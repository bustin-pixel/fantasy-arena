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
