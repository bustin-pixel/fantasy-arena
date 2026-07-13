# Rogue's Den + Gargoyle sprite mockups (2026-07-13)

Mockup loop for the visual upgrade of five units: Gargoyle, Den Bruiser,
Knife Thrower, Cutpurse, The Bandit King. Harness page (deleted after build):
`public/mockups/rogue-sprites.html`.

## What was chosen & built (in `src/assets/sprites.ts`)

- **Gargoyle** — BOTH round-2 airborne bodies ship, picked per-unit by
  `variantOf(uid)` (skeleton-variant pattern): **Stone Imp** (compact, quick
  imp-style wingbeats, pale eyes, falling stone dust) and **Ravager** (broad
  slab chest, slow heavy beats that lift the body, swept double horns, blue
  eyes, orbiting stone chips). Wings reuse `drawImp`'s construction, scaled
  (user asked for "wings flying similar to the imp").
- **Den Bruiser** — **Pit Grappler**: bespoke human pit-brute (replaced the
  0.85× ogre recolor). Hunched wide stance, huge open hands flexing, glowing
  brass pit-brand, tooth necklace, stomp shockwave rings.
- **Knife Thrower** — **Follow-Through**: brand-new body mid-throw; spinning
  knife streaks away while the off-hand draws the next from the bandolier.
  Tweaked per user: **red bandit mask + normal eyes** (green scarf dropped).
- **Cutpurse** — **Snatch & Dash** with the **Masked Filch face** (burglar
  band + messy hair). Mid-getaway lean, streaming scarf, loot sack, spilled
  coin trail. Deliberately de-Outlawed: no deep hood, no twin daggers.
- **The Bandit King** — **Masked King**: the original body + red mask fully
  covering the face (fixed the "goofy" look), straight jewelled crown, extra
  gold (chains/medallion/belt/bracer), left fist on hip (second saber cut),
  and the Hoard-Strider falchion seated in the fist with a **full swing
  loop** — windup → chop (blade rotation keyframed through the arc, swoosh
  trail) → recover to upright (per the user's photo reference).

## Losing variants (round 1 — layered on the old bodies)

- Gargoyle: Waking Ember (glowing cracks + embers), Night Flier (unfurling
  wings), Votive Watcher (blue runes + mist), Grotesque Awakened (lashing
  tail + maw). All crouched — user wanted it flying instead.
- Den Bruiser: Bare-Knuckle Champ (boxing guard), Spiked Maul, Chain Breaker.
- Knife Thrower: Juggler, Venom Fan, Quickdraw Phantom, Blade Dancer
  (layered acts on the old flat-hood body — user wanted a brand-new body).
- Cutpurse: Coin Flipper (bandana + coin toss), Trinket Fence (pocket watch),
  Masked Filch (its face was merged into the winner).
- Bandit King: Gilded Tyrant (coin fountain), Warpath (war cape + embers),
  Throne Taker (scepter + purple cape), Blood & Gold (crossed-saber roar).

## Losing variants (round 2 — brand-new bodies)

- Gargoyle: Ember Flier (lean, burning cracks, sheds embers — retired; the
  other two both shipped).
- Knife Thrower: Cascade (juggling four blades in a fountain), Ambusher
  (crouched in a pooled cloak, blade cocked overhead).
- Bandit King: Hoard-Strider (atop a gold mound — its falchion survived into
  the winner), Chest-Stomper (boot on a coin-popping chest), Gilded Colossus
  (gold plate + planted greatsword).

## Build notes

- Shadows retuned in `SHADOW_BY_ID` (gargoyle airborne y24; bruiser/knife
  thrower y24; cutpurse y21.5 for its 0.9× call-site scale).
- New shared helpers: `falling` (downward particles), `gargoyleWings`,
  `gargoyleHead`, `heldKnife`, `spinCoin`, `shiv`, `falchionAt`.
- All ambient cycles guard `A.live` so static hub/bestiary cards get a clean
  frozen pose (knife thrower freezes at "next knife drawn", king at windup).
- Verified: typecheck + build + 456 tests green (digest-neutral, presentation
  only); bestiary cards for all five render in-game; both gargoyle variants +
  facing mirror + bandit-king battleScale exercised through `drawUnitSprite`.
