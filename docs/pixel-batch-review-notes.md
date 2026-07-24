# Pixel batch — review notes for the user

One section per unit, written by the batch session as each unit finishes.
Per unit: the picks (seed + one-line why), every accepted gate FAIL, and an
**eyeball this** list — the specific clips the user should diagnose, most
doubtful first. Review vehicle: the roster artifact ("The diagonal-4
roster", updated in place after each unit).

---

## lich — DONE 2026-07-22 (pre-batch)

Picks: se idle 13 · se walk default (v5 march, BEAM_CYCLE_WALK cut —
**walk USER-APPROVED**) · se attack 7 · ne idle default · ne walk 13
(v1-frozen) · ne attack 7 · deaths default ×2 (bones-named override).

Accepted FAILs: attack steadiness se 17px / ne 13px — staff rise + shard
burst, body planted (accept.py comments).

Eyeball this (rest of the unit not yet reviewed):
- se/ne **attacks** — the burst peak and the settle back to rest.
- se/ne **deaths** — compact heaps; se ends skull-atop-pile, ne ends robe
  mound with bone feet showing.
- **corpses** in game context (they come from death frame ~30).
- ne idle/walk — rear views, crown steady.

---

## necromancer — DONE 2026-07-22 (batch unit 1/6)

Picks: se idle 77 (only wrap ≤0.9×, hood void steady) · se walk default
(seam 0, feet visibly stepping under the hem) · se attack 13 (crispest
starburst + clearest hand thrust; 5 seeds rolled) · ne idle 13 · ne walk 7
(consistent silhouette; 13 closed better but narrowed 28px) · ne attack 13
(only take whose skull glow returns) · deaths default ×2 on a
DEATH["necromancer"] override written up front — **no seed grew flesh, 6/6**
(the lich lesson paid for itself).

Accepted FAILs: attack se steadiness 17px (flare travel, body planted — lich
precedent); **attack ne size -6px** (46 vs 52 — the rear flare peaks so high
uniform_fit shrinks the whole one-shot; most compact of 5 seeds).

Eyeball this (most doubtful first):
- **ne attack** — the -6px body shrink during the cast, and the free hand
  thrusting screen-LEFT while the burst goes right (rear depth is
  unpromptable; the burst carries the read).
- **se+ne attack skull tint** — the staff skull discharges violet→bone-white
  after the burst on every seed; idle/walk hold violet, so the handback
  flickers the tint at cell scale.
- se idle — the lean-down/lean-up sway; confirm it reads as breathing, not
  bowing.
- deaths — se robe mound face-down / ne forward crumple; corpses come from
  frame ~30.

---

## fire_mage — DONE 2026-07-22 (batch unit 2/6)

Picks: se idle default (hat band steady, flame flicker left alone per
handoff) · se walk default (real march, knees named) · se attack 7 — the
ONLY seed that keeps the staff in hand through a forward thrust (default
loses the staff mid-clip; **13 turned square-frontal and dropped the staff
while beating every gate** — the turn-wins-gates trap again) · ne idle 7
(5 seeds) · ne walk 7 · ne attack 7 (raise + flare + smoke-ring puff) ·
deaths se default / ne 13 on a new DEATH["fire_mage"] (hat settles on top
of the pile, as written).

Accepted FAILs: attack se 16px / attack ne 22px (flame column, body
planted); **idle ne 5px steadiness + 4px wrap seam** — the staff flame
flickers 30-39px source on every seed (5 rolled), the body is still;
handoff's own "don't chase the flame" call.

Eyeball this (most doubtful first):
- **ne idle** — the 4px wrap pop from flame flicker; watch a few loops.
- **se attack** — the flame briefly detaches toward the free hand mid-cast
  (reads as conjuring); confirm it reads as a cast, not a glitch.
- ne death tail — the fallen staff's flame keeps burning (rides into the
  corpse decal); ember or bug, your call.
- se death — the fall tips sideways mid-air before the heap settles.

---

## seraph — DONE 2026-07-22 (batch unit 3/6)

**DEATH CHOREOGRAPHY — my call, review this first.** The shape I wrote:
wingbeats stop → drop from the hover → crumple → the great wings fold down
OVER the body so the pile reads as white feathers; halo fades. se plays
kneel-then-drape (graceful, body covered). The REAR text is stronger — the
per-unit text left the body STANDING in a "wing-tent" on five straight
seeds, so I added a `DEATH_BY_FACING` rear override (new pipeline lever,
ATTACK_BY_FACING precedent) naming the head sinking to the ground; ne ends
as a low flat feather mound. **The halo never fades on any seed** — it
rides into both corpses. If you want a deader look (or no halo), the levers
exist.

Picks: se still = dirs seed 7 (default+13 collapsed square-frontal —
symmetric wings) · se idle 7 · se walk default · se attack default — the
radiant NOVA (whole body flares inside a light globe) · ne idle 7 · ne
walk default · ne attack 7 · deaths se default / ne 13 (rear text).

Accepted FAILs: attack se 10px / ne 20px steadiness (nova + burst mass,
body planted). Both walks PASS — BEST_CYCLE_WALK cut on the wingbeat
cycle (wraps .960/.972).

Eyeball this (most doubtful first):
- **both deaths + corpses** — choreography taste + the persistent halo.
- **ne walk** — every seed reveals dangling legs below a lifted hem
  mid-clip (the hover text asks for hanging legs; the still hides them);
  default has the fullest wingbeat. Check the leg reveal doesn't pop.
- **se attack** — the nova globe swallows the whole body for ~2 frames;
  deliberate flash or glitch, your call.
- se idle drifts slightly toward frontal at the loop's still point.

---

## wolf — DONE 2026-07-22 (batch unit 4/6, first non-humanoid)

The original idle/walk texts let EVERY seed swing the muzzle to camera
(walk literally asked for "head bobbing"; two idle seeds raised a begging
paw). Fixed with muzzle-pinned v2 texts — new IDLE["wolf"] +
WALK["wolf"] v2 — then re-rolled.

Picks: se idle default-v2 (wrap .977, muzzle held) · se walk 42 (only
take of 5 that never turns the head; default glances back once) · se
attack 7 (jaws-gape → snap → low prowl) · ne idle default · ne walk 7 ·
ne attack 13 (rear-up howl → down-snap) · deaths se 13 (flat
muzzle-on-paws) / ne default (nose-to-tail curl) on a new quadruped
DEATH["wolf"].

Accepted FAILs: attack se 16px / ne 14px steadiness (the bite is a
head-height arc; paw line planted); ne extension gate exempted
(NO_EXTENSION_GATE — vertical rear bite, knight-ne reasoning).

Eyeball this (most doubtful first):
- **both attacks END in a low crouch** (the ATTACK text asks for a "low
  ready crouch") — check the pose step back to standing idle at handback.
- se walk 42 — the head is steady, but confirm the trot cadence reads at
  game speed.
- ne death curl — reads almost like sleeping; corpse comes from ~frame 30.
- se idle late frames — slight head-angle drift toward camera (mildest of
  all takes; the pinned text can't fully stop it).

---

## slime — DONE 2026-07-22 (batch unit 5/6)

Two new pipeline levers built for it: **SQUASH_WALK** (export keeps the
hop's height changes — evened_scales would have frozen the blob at
constant height) and a **v2 repeating-hop WALK text** (v1 squashed once
near the clip head then just bobbed, on every seed — WAN performed the
bounce once and settled; naming it "over and over, in a steady even
rhythm" fixed all seeds). Promoted WITHOUT --medoid as planned (the one
symmetric unit).

Picks: se idle default · se walk 7 (hop period lands the naive cut's wrap
at .986) · se attack 7 (squash → leaping open-armed slam) · ne idle
default · ne walk 7 — **default grew googly eyes + teeth on the slime's
BACK** (the faceless rear invites a face; same trap family as lich flesh)
· ne attack default · deaths 13 both on a new melt-to-puddle
DEATH["slime"]; se's puddle keeps a closed-eyes sleeping face (reads as
the game's slime-ghost), ne faceless.

Accepted FAILs (all BY DESIGN of the hop): walk se 9px / ne 10px
steadiness (the squash is the animation); walk ne seam -5px (beam cut;
wrap jump smaller than the hop's own ±10px steps); attack ne 14px + 
extension exempt (vertical slam).

Eyeball this (most doubtful first):
- **se/ne walks in motion** — the whole SQUASH_WALK carve-out rides on
  these two strips reading as a bouncy hop, not a glitch.
- se death puddle keeps its face (sleeping) — charming or wrong, your
  call; ne puddle is faceless.
- ne idle — mild arm lift mid-loop.

---

## rune_golem — DONE 2026-07-22 (batch unit 6/6 — BATCH COMPLETE)

SCALE_OVERRIDE 1.18 verified against the cell before generating (~54px of
80). WALK text got the "same size, same distance" front-load it was
missing; new stone-crumble DEATH["rune_golem"] (runes fade, rubble pile,
"bare grey stone in every frame").

Picks: se idle default (heavy breath-sway) · se walk 7 · se attack
default — wide lateral punch, the only readable blow of FIVE seeds (42/77
raise overhead and overflow the cell top for -15px; 7 balloons the fist
at camera) · ne idle default · ne walk 7 · ne attack 13 (rear punch
extends screen-right, the engine's aim) · deaths se default / ne 13 —
both crumble to rubble with fading runes, zero source clipping (the
OTHER seeds clipped 11-20/33 frames; the compact takes won on their own).

Accepted FAILs: attack se size -9px (uniform_fit keeps the punch
in-cell); idle se/ne 4px steadiness + ne 4px wrap (boss breath; the
better-seamed seeds tucked the arms -22/-47px = worse).

Eyeball this (most doubtful first):
- **se attack** — the -9px momentary shrink during the punch, on the
  UNIT whose whole identity is towering; if it bothers you the
  alternative is a less readable overhead raise.
- ne idle — the 4px wrap breath-pop over a few loops.
- deaths + corpses — rubble piles; remember battleScale layers on top of
  the 1.18, so eyeball the boss ON DEVICE in a real fight.

---

---

# ROUND 3 — "shadows flickering" + "fire mage cloak muddy" (2026-07-23)

Five measurement probes + nine adversarial re-measurements. Verdict:

### ✅ FIXED — fire mage muddy cloak (root cause found, one-line fix)
`build_palette_from_seeds` built EVERY seed's ramp with `RAMP_ACCENT`, whose
darkest step targets okL 0.30 — and the outline is picked as the darkest
tier-2 entry, so **every unit's outline sat at okL ≈0.30**. Any unit whose
body mass lives at that lightness quantizes *onto its own outline*. The fire
mage's dark-red robe sits exactly there: **59.4% of his body pixels shipped
as the outline colour `#4a1f1a`** — three fifths of the sprite was one flat
tone with no interior contour. That is the mud.

Fix: the PRIMARY seed now uses the 5-step `RAMP_MAIN` (darkest okL 0.22 —
a genuinely darker outline — plus a 0.38 step at 0.85 chroma that catches
robe-lightness mass at near-full saturation). Measured: **59.4% → 42.6%**
body-equals-outline, **chroma +27%**, tonal spread 0.44.
Palettes are cached per unit, so this touches ONLY regenerated units —
verified: orc + knight re-export **byte-identical**.

Also found and fixed a latent bug it exposed: `export_to_game` passed the
whole colours table where a per-unit dict was expected. Harmless until a
palette was regenerated (it never had been), then a hard crash.

⚠ The slime was regenerated too and came out **teal and desaturated**, losing
the toxic-green core — so it was **reverted** to its reviewed palette.

### ✅ FIXED — the shadow flicker (ablation settled it)

Ran the freeze-one-term-at-a-time ablation through the real pipeline.
% of core pixels changing colour per frame:

| arm | necro/se | necro/ne | skel/ne | orc/se | |
|---|---|---|---|---|---|
| baseline (shipped) | 27.9 | 12.4 | 65.6 | 60.7 | |
| matte frozen | 22.7 | 10.9 | 50.7 | 52.9 | −12…−23% |
| **global exposure matched** | 27.7 | 12.5 | 66.0 | 61.1 | **~0%** |
| temporal median 3/5-tap | 22.6 | 9.4 | 56.5 | 53.5 | −12…−24% |
| **shading frozen** | **6.8** | **3.8** | **18.9** | **21.1** | **−65…−76%** |

So it is **not** registration jitter (freezing the matte takes off-register
frames 7/7 → 0/7 and barely dents the flicker), **not** a global exposure
wander, and **not** impulsive noise a median could catch. WAN re-lights the
interior slightly differently on *every* frame, and the locked palette snaps
those sub-step drifts across ramp boundaries in different places each frame.

Fix: `IDLE_SHADING_DAMP` in `export_to_game.py` — idle frames carry the first
sampled frame's interior colour; alpha untouched, so the silhouette still
breathes and every geometry measurement is bit-identical. Idles only (a
walk's/attack's shading change is motivated by real motion).
Response is strongly non-linear, so the default is 1.0; `IDLE_DAMP_OVERRIDE`
holds `fire_mage: 0.55` so his staff flame keeps flickering (measured: 13% of
his bright FX pixels still change per frame).

**Result — roster mean idle churn 32.3% → 16.2%.** necromancer se 27.9 → 16.7,
necromancer ne 12.4 → 3.4, skeleton ne 65.6 → 18.9, orc se 60.7 → 34.6.

Residual on the SE facings is the 1px registration stepping, which damping
cannot remove — it is a distant second term and is left alone deliberately
(the anchor-lock cure was tried and rejected, below).

### ✅ Necromancer re-palletted too (you asked — it helped)

Applied the same primary-seed ramp change to the necromancer and measured:

| | before | after |
|---|---|---|
| flattest single tone | 44.0% of body | 29.5% |
| body chroma (okC) | 0.042 | 0.061 |
| distinct tones | 27 | 28 |

His robe was the second-flattest thing on the roster — one tone covered 44%
of the body. Now it carries a lighter, more saturated mid purple with the
deep tone doing folds and hood shadow, so the NE reads as a robe instead of
a silhouette.

**Follow-up — "the one side of the necro is too dark now" (fixed).**
Chasing this exposed a real defect the re-palette only made visible: his
eight clips were generated at **wildly different exposures**, spanning
33.0–52.8 mean luma, and his rear clips were also **26–39% less saturated**
(walk chroma 0.0365 ne vs 0.0597 se) — so the same robe read purple from the
front and grey from behind.

Two false starts, both measured and discarded:
1. `RAMP_MAIN_SOFT` (hold the dark end at okL 0.30) — just reproduces the old
   palette (flat 48.0%, chroma 0.043); the fold definition and the darker se
   come from the *same* extra tonal range, so this gives back the whole win.
2. A per-**facing** lift — fixed the idle and broke walk/attack, because his
   facings differ in *opposite directions per motion* (idle: se darker;
   walk: ne darker by 21).

Fix: `FACING_L_LIFT` + `FACING_C_GAIN` in `export_to_game.py`, keyed by
**(unit, facing, motion)**, applied to the source before the palette match
(new `l_lift` / `c_gain` args on `pixelize`). Result:

| motion | se→ne luma gap before | after |
|---|---|---|
| idle | −10.7 | −3.4 |
| walk | +15.4 | −0.4 |
| attack | +13.0 | −0.2 |
| death | +0.1 | −1.0 |

Clip spread 19.8 → ~4 luma; ne chroma now +7…+23% of se instead of −26…−39%.
Idle flicker damping unaffected (se 19.8%, ne 3.5%).

⚠ Both levers are **strongly non-linear** near the dark end — +0.058 okL took
one clip from 33.0 to 54.0, and chroma gain amplifies ~1.25× through the
quantizer. Calibrate by sweeping and re-measuring, never analytically.

⚠ The `body==outline` metric got WORSE on paper (16.6% → 38.2%) and is
misleading here: sharing the darkest tone with the outline is normal pixel
art *once the body also has a strong mid-tone*. It only signals mud when the
body has nothing else — which was the fire mage's case at 59.4%. Judge this
one on **dominant-tone share + chroma + eyes**, not on body==outline.

Roster flatness ranking, for whoever picks up the next candidates
(⚠ orc / knight / lich / archer are user-approved — get an OK before
re-palletting them, a palette change alters colour):

    fire_mage 42.7% (fixed) · slime 37.7% · ogre 37.2% · archer 30.6%*
    necromancer 29.5% (fixed) · skeleton 26.8% · lich 26.3%* · knight 25.5%*
    orc 25.2%* · rune_golem 22.3% · wolf 21.2% · seraph 19.4%

Slime was tried and REVERTED (went teal, lost its toxic core).

### ⚠ Superseded diagnosis notes — the flicker
Your description was exact. Measuring frame-to-frame registration inside
each shipped idle strip (best alpha alignment vs frame 0):

| | off-register frames |
|---|---|
| **necromancer se idle** | **6 of 7** ← flickers |
| **necromancer ne idle** | **0 of 7** ← clean |
| skeleton ne, orc se, fire_mage ne | 7 of 7 |

The body steps 1–2px between frames, so every high-contrast edge (staff
crossing robe, hood rim) inverts light↔dark each frame. Roster total: 65
off-register idle frames.

**The game is innocent** — independently confirmed three times: the ground
shadow is a fixed ellipse at constant alpha 0.25 with `bob` forced to 0 for
animated frames, and `blitPixelFrame` is integer-scale nearest-neighbour
with no tint. It is baked into the art.

**Fix attempted and REJECTED by its own test**: extending the attack's
frame-0 anchor lock to idles moved the roster only 65 → 60 and made
necromancer se (6→7) and orc ne (0→7) worse — `force_anchor` is re-mapped
through a per-frame scale, so it still rounds differently each frame.
Reverted; the roster is back at exactly 65 and the rejection is documented
in `export_to_game.py` so nobody re-pitches it.

Remaining candidates (verifiers disagreed on which dominates, all upstream):
per-frame matte re-inference feeding the 1px outline ring; per-frame
re-gridding via `evened_scales`; shading-blind frame selection. Next step is
an ablation that freezes one term at a time and measures which removes the
most churn — worth doing before touching 12 units.

---

# ROUND 2 — your review fixes (2026-07-22, same session)

Everything below is a response to your diagnosis list. The roster artifact
now has a **walk_attack** button (5th motion) — archer only so far; every
other unit falls back to its attack strip there.

### Walk hitches — golem SE/SW, wolf SE/SW ✅
Fixed at the CUT, not by re-rolling: both facings joined `BEAM_CYCLE_WALK`
(beam search maximises the *minimum* transition IoU including the wrap, so
every step is the same magnitude). Golem se walk now 1px steadiness / -1px
seam; wolf se 1px / +0px. Both gates PASS.

### Seraph SE/SW walk was growing ✅
Two causes, both fixed: (1) `WALK["seraph"]` was the **only** walk text
without the front-loaded "same size, same distance" pin — added; (2) the
exporter was *rescaling the body* to cancel the wingbeat's height change
(`evened_scales`). Seraph se now exports through the slime's locked-scale
path (`SQUASH_WALK`), so the wings beat and the body holds still. New pick:
se walk 13. ⚠ ne walk untouched (frozen take you already have).

### Necromancer + fire mage attacks → lich-style staff burst ✅
Both `ATTACK` texts rewritten to the lich shape (raise staff → burst erupts
from the skull/orb → lower). Necromancer: se 13 / ne 7 — and the v1 "-6px
body shrink" FAIL is **gone** (+0px now). Fire mage: se 13 / ne 13; the ne
burst needed its own bounded override (the raise-and-burst grew a smoke
column off the frame top on every seed) + padded staging.

### Seraph SE/SW attack = the NE effect ✅
New `ATTACK_BY_FACING[("seraph","se")]`: burst flares **above the head**,
body visible below it — no more nova swallowing the whole sprite.

### Wolf SE/SW bite, no head turn ✅
New `ATTACK_BY_FACING[("wolf","se")]`: straight forward bite driving down-
right, muzzle pinned the whole clip. Pick: seed 7. Mild camera-glance in
the recovery on all three seeds — eyeball it.

### Golem NE/NW attack like the SE punch ✅
New `ATTACK_BY_FACING[("rune_golem","ne")]`: full-extension punch on the
arm's own screen side. Cost: -8px body shrink during the blow (uniform_fit
keeping the fist in-cell) — symmetric with se's -9px, accepted.

### Slime redesign ✅ (biggest change)
New DESC — amorphous sinister blob, toxic glowing core, narrow glaring
eyes, **no arms or legs** — new master, new stills, full re-conversion.
Needed a new `MASTER_BY_UNIT` template too: the shared master hard-codes
"both legs and both feet planted" and duly grew legs under the blob.
WAN fought the redesign the whole way (it kept relaxing back into the
mascot: arm nubs for balance, round cute eyes, and a **white angry face on
the faceless rear**), so the idle/walk/attack texts gained anti-mascot pins
and the rear facing got face-free `IDLE_BY_FACING` / `WALK_BY_FACING`
overrides. Eyeball this: **ne (rear) idle+walk** — every seed sprouts brief
limb-ish flares at the hop apex; the beam cut avoids the worst frames.

### Archer walk with the bow nocked ✅
`WALK["archer"]` v3 keeps the march/knee/head pins and swaps the lowered
carry for the ready-stance carry (bow up, arrow at the string). Both
facings re-rolled from the ready-stance stills — defaults won.

### Walking-while-attacking for ranged ✅ **USER-APPROVED 2026-07-23**
> "the archer walking attack is amazing. its exactly what i wanted."

Treat the archer's walk_attack as the reference shape for the remaining four
ranged units (necromancer / fire_mage / lich / seraph) — their WALK_ATTACK
texts are written (each unit's approved walk pins + one complete
raise-burst-lower), pending generation after the shading fixes land.

### Walking-while-attacking for ranged 🆕 (archer prototype + gameplay change)
- **Engine**: ranged units now *advance while firing* — the forward-advance
  gate opened to `ranged && state === "attacking"` (`MovementSystem.ts`).
  Melee unchanged. **This changes battles**: ranged units close distance
  instead of standing at max range. Verified live — an archer slid 15px in
  6 ticks while `state: "attacking"`. ⚠ A winrate sweep is the follow-up
  (ranged got stronger); I have not run one.
- **Art/plumbing**: new `walk_attack` motion end-to-end (pipeline text →
  export → manifest → `getPixelFrame` → `drawUnitSprite`). The Renderer
  detects "attacking AND sliding" by watching positions (the sim's state
  enum can't express both) and picks the strip; units without the art fall
  back to attack — verified: archer serves `archer_se_walk_attack.png`,
  knight falls back to `knight_se_attack.png`.
- Archer se 13 / ne default. Other 4 ranged units next round, once you've
  looked at the archer.

### Necromancer legendary VFX 🆕
Engine-drawn violet soul-wisp aura (your pick), presentation-only and
defId-keyed like the corpse decals: wisps rise and curl behind the sprite
plus one faint one in front, per-uid phase so two necromancers don't pulse
together. Verified numerically — 197 violet pixels animating around the
necromancer, 0 around a control unit.

**Gate**: typecheck + build clean, **826 tests** (2 new advance-fire specs),
determinism invariants green.

---

*(batch session: append units below as they finish)*

---

# ROUND 4 — the remaining 22 deckable units + summons + legendary auras (2026-07-23)

The mandate's big batch. Per the earlier decisions: **all 8 legendary auras
built**, **all extra bodies converted** (Druid bear form, engineer turret,
warlock imp, trickster mirror, slime-knight clone), and the ranged advance-fire
winrate sweep **deferred** (raised again before ship).

## Legendary auras — ALL 8 BUILT ✅ (engine-drawn, presentation-only)

Themed per unit, following the necromancer soul-wisp pattern (`AURA_BY_ID` +
`drawAura` in `Renderer.ts`): defId-keyed, two-pass (behind + one faint front
element), per-uid phase, **suppressed when dead**, alpha ≤0.3 behind / ≤0.16
front. Two read live kit state (the direction the sim never reads back):

| unit | aura |
|---|---|
| aegis_knight | two counter-rotating cyan ward hexagons (flat ground rings) |
| archmage | 3 rune glyphs orbiting in depth (front/behind split), colour walks the schools |
| engineer | steam venting up behind + an amber spark arcing in front |
| hunter | leaf motes tumbling DOWN past him (moving through woodland) |
| mystic_archer | a trailing arc of arcane fletching chevrons sweeping the body |
| outlaw | gunsmoke curls that **thicken while Killing Spree runs** (reads `spreeTicks`) |
| slime_knight | ooze beading + dripping + a slick pooling at the feet |
| summoner | pollen-fireflies that BLINK, → drifting fur motes in **Bear Form** (reads `transformed`) |

Verified in an isolation harness (`/mockups/aura-verify.html`): each aura drawn
alone on a blank canvas at two wall-clock moments — **21/21 cases pass** (all 8
draw + animate + stay subtle; all 8 draw NOTHING when dead; control units
silent; the outlaw-spree and druid-bear branches both fire).

## Game-side wiring (two special cases, additive, determinism untouched)

- **Bear Form** (`summoner` + `transformed`) now draws from the generated
  `summoner_bear` strips when they exist, falling back to the procedural
  `drawBear`. The old code forced procedural via the `disguised` gate.
- **Mirror Image** (Archmage's illusion) borrows the **Archmage's** strips,
  drawn at 0.95× and 0.65 alpha to keep the translucent-copy read (it has no
  art of its own). *(Correction to the handoff: mirror_image is the Archmage's
  double, NOT the Trickster's.)*

## aegis_knight — DONE 2026-07-23 (legendary #1)

Picks: se still seed 7 (default cloned the master frontal with the master's
gear sides; 7/13 obey the screen-side pin, 7 crispest — calibrated to the
shipped knight's own mild se turn, which the user approved) · ne still default
(clean true rear, shield edge-on, no face) · idle/walk/attack/death all default
seed both facings (promoted stills clean, no re-roll needed).

Accepted FAILs (all standing-precedent, logged in accept.py):
- attack **ne size -7px** — rear sword raise peaks high, uniform_fit shrinks
  the one-shot (necromancer -6px / golem -9px family).
- idle **se 6px steadiness + feet 0.123** — breath + tall cyan plume + held
  sword swaying; feet verified planted on the sheet (ne idle 0.037), 0.123 is
  <½ the walk's 0.257 (fire_mage flame-idle family).
- attack **se reads +4px** — cross-body cut foreshortened by the front 3/4
  (NO_EXTENSION_GATE, knight-se precedent).
- "no cropping" 2 frames +2px — raised sword/plume grazes the cell line in the
  attack windup; exported cells show no body crop (orc boundary-graze).

Eyeball this (most doubtful first):
- **se attack** — the foreshortened cross-cut (+4px); confirm it reads as a
  swing, not a twitch.
- **ne attack** — the -7px body shrink during the raise.
- **idle se** — the plume + sword sway (6px); confirm it reads as breathing.
- deaths + corpses — compact heaps, ne fall keeps its helm (no flesh grew).

## Stills reworked before their clips (2026-07-23)

The dirs stage caught these across the roster; all fixed before clip
generation, so their clips are built from corrected stills:

- **summoner → was a BEAR** (pipeline bug, now fixed): `newest()` globbed
  `summoner_*` which also matched `summoner_bear_*`, and the bear master was
  newer, so the druid's dirs were built from the bear master. Fixed the glob
  (digit discriminator) across all five tools; summoner now renders as the
  antler-crowned druid. Same latent trap protected for `slime` vs
  `slime_knight`/`slime_clone`.
- **hunter / mystic_archer / ranger — bows were AIMING** (the archer's
  mid-gesture trap): v1 DESC "holding a bow" rendered a draw/aim pose. v2
  DESC pins "straight up and down like a staff, other hand low"; masters
  re-rolled. Result reads as a ready-carry (bow vertical, hand near string) —
  the shipped-archer ready-stance precedent. **Eyeball the idle/walk for any
  creep into a full draw.**
- **trickster se — collapsed to a REAR view** (the documented se-rear-collapse,
  aggravated by its big cape): default + seed 7 both went rear; **seed 13** is
  a clean front-3/4 (teal eyes visible). That's the pick (newest on disk).
- **GEAR_HOLD rewritten chirality-only** for all staff/crozier/gun/bow casters:
  each master placed its staff on whichever side WAN chose (archmage/
  electric_mage right, warlock left), so a hard screen-side pin fought half the
  seeded stills. The 3 sword knights keep screen sides (stills verified
  consistent: sword-right / shield-left).

## archmage · engineer · outlaw · slime_knight — DONE 2026-07-23 (legendaries 2-5)

All default seed on the promoted stills (no re-roll). The family-builder ATTACK
and DEATH texts validated on the contact sheets:
- **archmage** — attack = raise staff → golden burst above the orb → lower
  (`_staff_burst`); death = compact blue-robe heap, staff drops, no flesh.
  FAILs: attack se 17px / ne 18px steadiness (staff-burst, body planted — lich
  17/13 family). Everything else PASS incl. both deaths.
- **engineer** — attack = level rivet gun → muzzle flash + recoil → settle;
  death = topples prone (stout dwarf) but in-cell. FAIL: attack se size -6px
  (muzzle flash peaks, uniform_fit shrink).
- **outlaw** — attack = twin daggers scissor into an X-cross → draw back to
  guard (`_dual_slash`); death = compact grey heap, hood void kept. FAILs:
  attack ne size -6px + 14px steadiness (dual-slash height+width, accepted).
  ⚠ **idle ne does NOT loop** (limb-drift -53px — the promoted ne still baked
  wide daggers; the idle relaxes them). Flagged for a ne-idle re-roll; se clean.
- **slime_knight** — attack = raise sword beside helm → cut down/across →
  guard (`_sword_swing`), shield braced; death = green heap, helm kept.
  FAIL: attack ne size -6px (rear raise shrink, aegis-ne family).

Eyeball this: outlaw ne idle loop (pending re-roll); engineer/slime_knight prone
deaths on device; archmage burst-tint handback.

## Phase-3 wave — the other 17 units (hunter…turret) — DONE 2026-07-23

All 21 phase-3 units generated in one clean run (0 failures), all default seed
on their promoted stills, exported. Full contact-sheet review of every unit's
attack/death — the family-builder texts held across the whole roster:

**Clean and validated (no rework):**
- **casters** (`_staff_burst`): archmage, arcane_mage, electric_mage, ice_mage,
  mage, warlock, summoner — raise staff → themed burst from the orb → lower,
  each in its own colour; void hoods/hats kept.
- **healers** (`_crozier_light`): priest (bald serene face, correct — NOT
  hooded), healer — raise crozier → golden radiance → lower.
- **sword knights** (`_sword_swing`): holy_knight, slime_knight — raise beside
  helm → cut → guard, shield braced.
- **two-handers** (`_two_hand_chop`): berserker, warrior — bounded overhead
  chop, weapon in-cell.
- **dual-wielders** (`_dual_slash`): rogue, trickster — daggers scissor-cross →
  spread to guard, **void hoods kept** on both.
- **bows** (`_bow_loose`): hunter, mystic_archer, ranger — the v2 upright-carry
  fix HELD: idle/walk carry the bow ready with NO creep into a full draw; attack
  draws-and-looses.
- **summons**: void_imp (hurl coal-flame), slime_clone (mascot green slime, dot
  eyes + arm-nubs — matches its in-game design, distinct from the redesigned
  sinister main slime), summoner_bear (quadruped idle/walk, rear-up claw-swipe
  attack, beast-curl death — all read as a bear).

**Reworked (fixes generated):**
- **assassin — revealed a HUMAN FACE** (WAN opened the hood; promote baked the
  face-frame — the knight-N promote trap). rogue/trickster on the same body
  kept their void hoods, so it's a seed fluke. Fix: `IDLE["assassin"]` pins the
  void hood positively + full redo (clean dirs still → re-promote → clips).
- **turret — grew a FACE + flame-hand** on its idle (the generic "breath" idle
  anthropomorphized the static machine). Fix: `IDLE["turret"]` (motionless
  machine, muzzle-glow only, no face) + clean dirs still (undo the face-promote)
  + regenerate, NO promote (a static object has no rest-frame to mine).
- **outlaw ne idle** — the −53px limb-drift: re-rolled to **seed 7** (−19px,
  best of default/7/13; 13 was +124). se side was already clean.

**Roster review verdict:** 24 of 27 new bodies clean on the first pass; the 3
reworked units (assassin, turret, outlaw-ne-idle) are regenerating. No systemic
failures — the family builders and the two skeleton fixes (bear-name collision,
GEAR_HOLD chirality) carried the whole roster.
