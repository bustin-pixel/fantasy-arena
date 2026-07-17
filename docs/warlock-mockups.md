# Warlock sprite — mockup variants (2026-07-17)

Four hooded red-and-black takes were shown for the Warlock (the rare pact summoner).
The unit had shipped-in-progress as a **blue** placeholder wearing `drawNecromancer`'s
body; the user asked for red/black and picked **1 — Ember Cowl**, which is what
`drawWarlock` now draws. The other three are recorded here in case they're wanted later.

## ✅ 1 — Ember Cowl (CHOSEN & BUILT)

The Necromancer's robed-summoner silhouette recolored to charred black (`#2b1b1b`) +
ember red (`#ef4444`), wearing the Archer's deep cowl. Black staff crowned with red
flame (an ember core where the Necromancer carries a skull), embers rising off the
pact, slow-rotating pentagram underfoot.

Tweaks the user asked for on top of the original variant 1, all now in `drawWarlock`:
- **Pentagram from variant 3** — bigger (r12), thinner, brighter, slowly rotating
  (`t * 0.25`), keeping variant 1's red rather than 3's rose.
- **Encircling ellipse ring removed** — just the star.
- **The bare wedges beside the face packed black** (`deepCowlHood(..., fillCavity)`).
- **Short neck** — an earlier shoulder-extension fill was tried and rejected.

## 2 — Ashen Pactbearer (not built)

Staff dropped entirely. Charred robe with red lining flashing through the tears, ash
motes drifting up, one hand cradling a pulsing rift orb (with orbiting shards) that
the imps visibly pour out of. The most "the pact is the mechanic" of the four.

## 3 — Horned Pactlord (not built)

Heavier silhouette: shoulder mantle, ember-tipped horns rising off the cowl, a chained
grimoire bobbing at the hip with glowing text. Read as the most senior/lordly — arguably
too senior for a rare. Its pentagram was harvested into the chosen variant.

## 4 — Void Cultist (not built)

Pitch black with a single wide red eye-slit instead of two eyes. A vertical rift tear
splits the air behind him, spilling sparks, with a red-lined cape. Two imp eye-pairs
wait in the dark at his feet — telegraphing the summon before it happens. Worth
revisiting if the Warlock ever wants a creepier read.

## Notes for next time

- **The see-through the user kept pointing at was a real geometry gap, not a color
  problem.** In `deepCowlHood` the face circle, hood shell and drape don't quite meet:
  they leave bare wedges at roughly `±4..5.4, y -9..-6.5`. The Ranger/Archer have always
  had them — their quiver and cape sit behind, so nothing reads through — but on the
  Warlock's open robe the arena showed through. `fillCavity` packs the cowl silhouette
  black first; everything else draws on top, so nothing else moves.
- **Verify canvas art by looking at it, not by sampling pixels.** Three rounds were lost
  measuring hood-interior RGB and reporting improvements (`20,20,16` → `5,2,2`) that were
  invisible to the eye, while the actual holes sat elsewhere. The user's paint-over
  settled it in one message. Screenshots work fine on a plain mockup page (they time out
  on the heavy React hub).
- Rendering the sprite on a **bright orange backdrop** makes any see-through gap
  unmissable, and lets you count offending pixels precisely.
