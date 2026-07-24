# Berserker sprite — mockup variants (2026-07-19)

The Berserker's art was upgraded from its original hunched-brute-with-twin-crescent-axes
look. The user asked for four variants with **distinct silhouettes and better-looking
axes** and picked **4 — Ashen Champion**, which is what `drawBerserker` now draws.
The other three are recorded here in case they're wanted later.

## The axe problem (applies to all four)

The original `drawRageAxe` blobbed into an unreadable smear at the ~44px game scale:
light steel filled with a light-steel gradient, no outline, so the blade had no shape
to read. Every variant was rebuilt on a shared fix, and it is the main thing worth
carrying forward to any future weapon art:

- a **dark silhouette outline** (`#20252b`, ~2.2 lineWidth) stroked under the fill,
- a **darkened steel body** (mid-tone gradient, not near-white), and
- the accent glow concentrated on the **cutting edge only**, so the bright line does
  the shape-reading work instead of a uniformly bright blob.

Three head types were authored: a bearded single-bit (upswept horn, convex edge,
hanging beard), a double-bit with a crown spike, and the heavy angular wedge that
shipped. Only the wedge (`drawChampionAxe`) survives in the codebase.

## ✅ 4 — Ashen Champion (CHOSEN & BUILT)

Tall, **vertical** silhouette — deliberately the opposite of the original's squat
hunch. Horned full helm with a furnace visor (no face), squared plate pauldrons over
a banded ash-scale cuirass, cinched waist, and a long-hafted wedge axe held upright
at the lead side. Rage stays the signature emitter: ember seam down the centre line,
visor glow, rising motes.

Three tweaks were requested after the pick, all applied to this variant only:

1. **Ground marks removed** — the rage fissures underfoot are gone. The soft red
   backlight stayed (it's a glow, not a mark on the ground).
2. **Horns re-socketed** — they were anchored above the crown, where the helm dome
   has already curved away, so they floated. They now socket into the *sides* of the
   helm with a dark socket ring, growth ridges, and underside shading. A follow-up
   note lifted them clear of the visor; the lift is paired with a **0.6-unit inward
   nudge** because the dome narrows as it rises — lifting straight up would have
   floated the bases off the plate edge again.
3. **Axe moved in front of the pauldron** — it had been drawn before the body, so
   the plate covered it. It's now drawn after the pauldrons, with the lead fist drawn
   back over the haft so he grips it rather than the wood passing through his hand.

**Build-time gotcha worth remembering:** the first port clipped in the hub card. The
portrait renders at `size/70` scale (`renderPortrait`), so the sprite is hard-clipped
to **±35 sprite units** — the axe at `translate(16,0)` with a `0.1` lean put the blade
at x≈34.5 plus outline, hitting the right border at *every* card size (measured 13–18
edge-pixel hits). Fixed by pulling it to `translate(13.5,0)` and easing the lean to
`0.06`; re-measured at zero edge hits, margins L12/R1 at size 70. The battlefield has
no such box, so this constraint is portrait-only and easy to miss.

## 1 — Warbringer

Upright and towering, with one colossal **double-bit greataxe shouldered on a
diagonal**, so a giant wedge of steel crossed the whole silhouette. Rib-plate bone
pauldron (three stacked plates on a leather lashing), braided swaying beard, heavy
brow band with an accent stone, crossed pelt straps.

Note: the axe initially rotated the wrong way and hid its own head behind the skull —
the head vector is `(0,-12)` rotated by θ, so a *positive* θ throws it up-and-right for
a right-facing body. Worth checking on any shouldered weapon.

## 2 — Twin Fangs

Squat, coiled crouch — arms flared far out with hooked bearded axes angled blade-down,
plus an **antler crown**, making a broad triangular silhouette. The only variant that
kept dual-wield, so it stayed closest to the original read. Heavier, lower fur mantle
than the original.

## 3 — Chainbreaker

Deliberately **asymmetric** escaped-gladiator: one shoulder bolted and hunched high,
a spiked gauntlet raised on the lead arm, and the axe slung out on a **swinging chain**
(sine-driven, with drawn links along the bezier). Roaring maw lit from inside, broken
manacle at the wrist, bare scarred chest, slave chain draped across it.

The chain needed a dark under-stroke and a shorter reach to stop the axe reading as a
detached object floating beside him — a thin bright chain alone did not connect it.
