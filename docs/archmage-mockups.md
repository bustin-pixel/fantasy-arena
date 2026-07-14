# Archmage sprite mockups — 2026-07-13

Session goal: fix the hat rendering behind the head, and add liveliness for the
Archmage's promotion to a playable legendary (Grand Grimoire random-caster).

**The hat bug:** the original `drawArchmage` drew the face circle AFTER the hat
cone/brim, so the head painted over the brim and the hat read as pasted behind
the skull. **The fix (in every variant):** head + beard first, hat cone + brim
drawn ACROSS the forehead (brim at y-7.5), glowing eyes drawn last so the brim
never swallows them.

## Chosen & built: 4 — Woven Gold + Grimoire

Built into `drawArchmage` (src/assets/sprites.ts); the Mirror Image illusion
inherits it (same draw at 0.95 scale × 0.65 alpha). Layers, all on the wall
clock `A.t`:

- slow breathing hover (`sin(t·1.4)·0.8`, gated on `A.live`)
- robe gold seams pulse between faint and bright; a shimmer bead runs down each
- fluttering page mid-turn arcing over the spellbook's spine
- **the four spell elements drifting up out of the open grimoire** — fire flame
  `#fb923c`, frost flake `#7dd3fc`, lightning bolt `#fde047`, arcane rune
  `#c084fc` — one per phase slot, swaying + tumbling as they climb, fading out
  (user note applied: "make the rune glyphs the elements it uses flying up")
- twinkling hat star (`sin(t·5)` size+glow pulse) with two orbiting cross
  sparkles at the hat tip
- unchanged from before: orbiting rune-glyph aura, pulsing staff orb, book bob

## Rejected variants

### 1 — Fixed Classic
Hat fix only; ambient animation exactly as shipped (aura orbit, orb pulse,
book bob). Baseline option — passed over for more life.

### 2 — Grimoire Storm
Hat fix + fluttering page and generic gold rune-glyphs (circle-rune / square
glyph shapes) drifting up out of the book. Its book treatment was FOLDED INTO
the winner; the generic gold glyphs were replaced by the four colored spell
elements at the user's request.

Mote loop (for reference):
```js
for (let k = 0; k < 4; k++) {
  const ph = ((t * 0.55 + k * 0.25) % 1);
  const x = -13 + Math.sin((t + k * 7) * 2.2) * 2.5;
  const y = 2 - ph * 22;
  // alpha 0.75·(1-ph); alternate circle-rune / square glyph, rotating t·1.5+k
}
```

### 3 — Spellcycler
Hat fix + the staff orb slowly lerping through the spell schools
(fire `#fb923c` → frost `#7dd3fc` → arcane `#c084fc` → gold `#fcd34d`, cycle
`t·0.25`), with the rune aura tinted to match and sparks dripping off the orb.
Strong "random-caster identity" telegraph — lost to Woven Gold's regal look;
could return as a cast-time effect someday.

```js
const cyc = (t * 0.25) % SCHOOLS.length;
const orb = lerpHex(SCHOOLS[i], SCHOOLS[(i + 1) % SCHOOLS.length], cyc - i);
// aura(ctx, t, orb); staffOrb(ctx, glow, orb); + 3 falling sparks in orb color
```

Verified after build: typecheck + 493 tests + Vite build green; hub deck-slot
portrait, detail-panel portrait, and a live Arena battle (real Archmage casting
with motes + a translucent Mirror Image on field) all screenshot-checked.
