# Handoff — converting the next unit to pixel sprites

**Ogre, knight, orc and skeleton are done and integrated — all DIAGONAL-4**
(orc converted 2026-07-21; ogre/knight cut down to match the same day;
skeleton converted 2026-07-21 as the first **best-of-N** unit). Eight units
remain. This is the runbook for the next one.

## ⚡ BEST-OF-N IS NOW THE STANDARD (user-granted 2026-07-21)

Roll 2–4 seeds per clip (default + 7 + 13 is the house set; widen if all
drift the same way), sheet them side by side, judge ORIENTATION FIRST, then
the read, then the numbers; record winners in `SEED_BY_FACING` with the
reasoning. ⚠ **The exporter takes the NEWEST 33 frames per motion — the
winning takes must be REGENERATED LAST** (deterministic, so a re-run with the
winning seed restages it byte-identically). The skeleton's picks are the
worked example — its gate run came out near-perfect (walks at 0px steadiness,
attacks reading +10px) on the first export. Judging tools live in the session
scratchpad pattern: `take_sheets.py` (labeled rows per take) and
`score_takes.py` (h-range / seam / w-drift / edge per take).

## ⚡ 2026-07-21: the ORC is through — what its run added

First diagonal-4 conversion, end to end in one session (~15 clips incl.
rerolls). Full detail in §0b below; the headlines:

- **`accept.py`'s stills gate now accepts a mirror-complete diagonal-4 set**
  (se/sw/ne/nw). Everything else already tolerated subsets.
- **New trap 10: `GEAR_HOLD` rides on ATTACK too.** Pin only chirality/screen
  side when the pinned gear IS the striking arm (the orc's cleaver), or the
  rider fights the swing. The knight never saw this — its pinned shield is
  the off arm.
- **New trap 11: a seed roll can beat every gate BY TURNING FRONTAL.** Orc se
  idle/walk: seeds 7 and 13 passed all numbers and both left the
  three-quarter facing (§6's "the contrast gate rewards the turn", now proven
  on loops, not just strikes). Eyeball ORIENTATION on every rolled take —
  clips, not only stills. The winners stayed on the DEFAULT seed with small
  documented blemishes.
- **New trap 12: stale art from an abandoned earlier attempt gets swept into
  the export.** The orc had pre-orientation-pass s/e/n stills + s clips on
  disk; `export_to_game`/`accept` happily mixed vintages. Park old takes in a
  `_stale_*` folder (done for the orc) before the first export.
- **Death-take triage:** judge RAW-frame edge contact (real loss, reroll —
  two orc ne rolls sprawled full-length at 20-23 frames touching) separately
  from an EXPORT boundary graze (extremity lands exactly on the cell edge,
  nothing cut at source — accepted on the default ne take: 1 early frame +
  the corpse's axe tip).
- **The compact-chop pattern generalises**: `ATTACK_BY_FACING[("orc","se")]`
  bounds the windup positively ("the blade staying level with its own head")
  after the shared overhead chop clipped the cell top — same lesson as
  `_OGRE_HIP_PUNCH_SHORT`, the choreography is the size fix.
- **New trap 13 (from the ogre/knight cut, same day): SEED-STILL FILL
  FRACTION predicts SOURCE clipping — for EVERY motion, not just death.**
  The knight's stills occupy 0.88–0.99 of their frame (installed un-padded,
  pre-pad-discipline) vs ~0.55 for the orc/ogre se. First the deaths clipped
  (31–33/33 source frames at any seed/prompt); then the user caught the ne
  attack's blade truncating mid-swing on the roster review — the blade ran
  off the 512px SOURCE frame (14/33 frames; se walk was shaving the plume on
  33/33). ⚠ The exported cells do NOT touch their edges in this failure —
  the amputation is baked into the pixels, so the crop gate is blind to it.
  Sweep the RAW frames for edge contact, and measure the seed still's
  non-white bbox first: ≥~0.85 fill ⇒ stage ALL its motions `--pad 0.62`
  (all six knight idle/walk/attack clips were regenerated that way, plus
  the deaths). The "never re-pad a promoted frame" trap only applies to
  stills already SMALL in frame. Also: `DEATH["knight"]` now exists (size
  pinned first + compact armour heap) — the generic text let WAN inflate
  the knight to fill the cell.
- **Knight accepted blemish** (same pattern as the orc's §0b list): `attack
  ne` steadiness 11px (limit 8) — the overhead raise + settle; body-span
  confirms ~7px is genuine pose motion, scale is locked. And both knight
  facings are exempt from the extension gate — its sword arcs across or
  away, never outward, so extension is the wrong proxy; judged by eye.

## ⚠ DECISION 2026-07-21: remaining units are DIAGONAL-4 (se + ne only)

The user chose to cut the facing count for the 10 remaining conversions:
generate **se and ne only**, mirrored to sw/nw at export. Rationale: the
per-facing cost was concentrated in exactly the facings a conventional 4-dir
scheme would keep — `e` (collapses to frontal once gear is described, §0a) and
`n` (the entire rear-view saga, §0a) — while se/ne were the cheap facings AND
the ones where attacks read best. So it's the isometric-RPG look: ~60% less
per-facing work per unit, and both nightmare facings skipped entirely.

- ~~Ogre and knight keep their full 8-dir art~~ **SUPERSEDED 2026-07-21: the
  user chose to cut the ogre and knight down to diagonal-4 too**, so the whole
  roster is now uniform. Fresh se/ne deaths + corpses were generated for both;
  their 8-dir sources are PARKED (not deleted) in `_8dir_parked_20260721/`
  under `pixel/dirs`, `pixel_raw/dirs`, `pixel/anim` and the corpse gallery —
  restoring 8-dir is un-parking + re-export. Both pass `accept.py` clean (the
  ogre's old accepted blemishes lived entirely on the discarded facings).
- **Death + corpse are now se + ne** (mirrored automatically by
  `export_to_game.py`, corpse included), not s/n.
- **The game resolves facings itself**: `nearestFacingWithArt` in
  `src/assets/imageSprites.ts` snaps any requested facing to the nearest one
  with art (ties break toward the camera-facing candidate). A diagonal unit
  needs **no game-code change** — s/e/n/w requests land on the diagonals, and
  the old all-8-stills load gate is gone.
- The e/n-specific machinery in §0a (rear-leg two-pass edits,
  `ATTACK_BY_FACING` rear phrasings, the E-frontal-collapse workarounds) is
  **historical unless 8-dir ever returns**. The per-facing orientation eyeball,
  GEAR clauses, and tail-check still apply — to se and ne.

`docs/pixel-sprite-style.md` is the recipe of record — the *why* behind every
rule here. This file is the *what to do*, in order, with the traps that will
actually cost you time.

State as of 2026-07-21. **Nothing in this batch is shipped** — it is all working
tree (orc included). See "Before shipping" at the bottom.

---

## 0a. THE ORIENTATION PASS (2026-07-20, after user review)

The user rejected the entire first knight conversion **on orientation grounds**
— N's legs faced the camera, NE/SE were frontal, S drifted off-axis, E held the
sword in the wrong hand — and none of the gates saw any of it. Everything below
in this section is now fixed and is REQUIRED READING before converting the next
armed unit:

- **Eyeball ORIENTATION per facing before animating anything.** Silhouette
  IoU/steadiness cannot see which way a sprite faces. Check: face visible on
  s/se/e, hidden on ne/n; gear on the correct SCREEN side; legs turned with the
  body (N's failure was a twisted torso over frontal legs).
- **`pixel_fa.GEAR`** — per-(unit,facing) gear clauses for the dirs stage.
  SCREEN-side language only ("the blade rises on the RIGHT side of the
  screen"); body-relative wording ("its leading shoulder") failed every roll.
  Never name gear in a negation: "never the gold cross" PAINTED the cross onto
  the N shield's back.
- **`pixel_anim.GEAR_HOLD`** — per-(unit,facing) rider after FACING_HOLD.
  FACING_HOLD permits "arms change position", and a shield is ON an arm: WAN
  rotated the shield edge-on while obeying it, which read as body rotation and
  is exactly what got promoted into the stills first time. Pinning the shield
  face took still-vs-tail IoU from 0.741/0.693/0.779 (s/se/e) to
  0.846/0.958/0.858.
- **Tail-check before promoting** (`tail_check.py` pattern: still | frame 0 |
  tail medoid side by side). Promote only if the tail HELD the facing;
  otherwise fix the prompt/seed — promotion bakes whatever the tail does.
- **E is a 3/4, not a profile, by decision.** Four prompt variants × three
  seeds all collapsed to frontal once gear was described; gear-free prompts
  profile fine but shield-forward (rejected). If a strict profile is ever
  needed: two-pass edit (profile first, then a gear-swap edit on the profile),
  not more rolls against the master.

## 0. What the knight settled

It was picked as the highest-information second unit, and it paid out:

- **WAN can do attacks.** This was the headline doubt and it is now dead. The
  knight was one of the three clips that "proved" otherwise; deleting the
  `does NOT spin or turn around` clause was the entire fix. Its sword swing now
  reads windup → cut → return to guard, and the loop returns to 0.969 IoU
  against frame 0. The old conclusion was 100% prompt-induced.
- **A weapon fits the vertical budget** — but the sword uses *all* of the
  horizontal one. Peak reach is **39px from the anchor with 40 available** (the
  ogre's punch: 34). It does not crop; 0 frames touch an edge. Anything with a
  longer weapon, or a re-rolled swing, will. `accept.py` prints this as
  "39 of 38 available" and still passes — its budget accounting is off by a
  little, the underlying pixels are fine, but treat that line as nearly-spent.
- **Two ogre-shaped assumptions broke**, both now fixed in the tools — see the
  new traps 8 and 9 in §4. Expect more of these on each new body plan.

Next: any of the remaining humanoids (**archer, skeleton, lich, necromancer,
fire_mage, seraph**) — the route is validated three times over, and the orc
proved the diagonal-4 runbook whole (§0b). The skeleton is the closest
analogue to the orc (armed, a swing, plus a buckler → knight-style GEAR_HOLD
on the off arm).

## 0b. The orc's accepted blemishes (2026-07-21, per-take reasoning in SEED_BY_FACING)

Every remaining `accept.py` FAIL on the orc is an eyes-open exemption:

- **idle se steadiness 4px (limit 3)** — the axe tip rises with the breath;
  every steadier seed turned frontal (trap 11).
- **walk se size -3px vs still** — one-unit fit shrink; same trap-11 story.
- **attack steadiness se 25px / ne 21px (limit 8)** — the overhead chop:
  roughly half weapon travel, half a deliberate crouch into the
  follow-through (body-span check per trap 9). Knight-s precedent.
- **attack se reads +3px (min 5)** — the chop extends in depth/vertical; the
  width-based gate cannot see it. Reads as a heavy chop by eye.
- **no cropping: 4 cells** — ne death frame 1 + ne corpse (and mirrors), the
  dropped axe tip landing exactly on the cell boundary at export placement;
  0 source frames touch. See death-take triage above.

Leave **wolf, slime, rune_golem** until more humanoids are through —
quadruped/blob/giant body plans break assumptions the metrics make. `pixelize`
already carries `SCALE_OVERRIDE = {"wolf": 0.92, "rune_golem": 1.18}` precisely
because the body proxy misreads those shapes, and `accept.py`'s thresholds are
humanoid numbers.

---

## 1. Before you generate: fix the prompts for this unit

Two files, and doing this first saves a full regeneration cycle.

At `cfg=1` a negation is inert and puts its own subject into the *positive*
conditioning. What matters is whether the clause names **a pose the model can
render**.

✅ **The three known offenders are fixed** — `ATTACK["knight"]`,
`ATTACK["wolf"]` and `WALK["seraph"]` are now positive-only. The ogre's and the
knight's `ATTACK` entries are the worked examples.

⚠ **But the generic `MOTION["walk"]` still carries the defect**, and every unit
without a `WALK` override inherits it — that is orc, archer, skeleton, lich,
necromancer and fire_mage. It says *"does not travel across the frame"*, which
is both a negation AND about lateral travel only, so nothing holds depth: the
knight duly walked at the camera and grew 26→31px monotonically. It was left
alone rather than churning six units that cannot be tested yet, so **expect to
write a `WALK` override for each of them**, as `WALK["knight"]` now does. State
the constraint that breaks — *same size, same distance* — and state it FIRST,
because `_HOLD` is appended after and a late clause gets buried.

**Ignore the rest of the boilerplate.** A scan flags 18 entries, but most are
just `_HOLD`'s trailing *"the camera is locked and does not rotate"*. That names
a *camera* move rather than a body pose, and both converted units carry it
cleanly — empirically tolerable. Also empirically tolerable: the ADVERB "back"
("lowers that arm back down", in the shipped ogre attack). It is the
*directional* sense that summons a rear view, not the word itself.

Do **not** invent a per-facing attack prompt to aim a punch in depth. That was
tried and failed twice (§6): toward-camera zoomed the fist until it filled the
cell, away-from-camera changed nothing at all.

---

## 2. The runbook

⚠ The order below is **not** the order the old version of this file listed.
`promote_rest_frame` mines an existing idle clip, so it cannot run straight
after `dirs` on a fresh unit — there is nothing to mine yet. Per facing the real
cycle is: **seed idle → promote → regenerate**, and only then the other motions.
Skip `master` if `pixel_raw/master/<unit>_*.png` already exists; generation is
deterministic on `SEED`, so re-running it is a slow no-op.

```bash
PY="C:/Users/Justin/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ghost/ComfyUI/.venv/Scripts/python.exe"
cd C:/Users/Justin/Documents/comfyui-2d-character-pipeline
# ComfyUI must be running headless on 8188: curl -s http://127.0.0.1:8188/queue

$PY tools/pixel_fa.py master  <unit>                       # identity spine (skip if present)
$PY tools/pixel_fa.py dirs    <unit> --pad 0.55 --only se,ne   # diagonal-4  ⚠ --pad

# per facing: se ne   (~40s per clip, deterministic on SEED)
for d in se ne; do
  $PY tools/pixel_anim.py <unit> $d idle --pad 0.62         # seed idle, PADDED
  $PY tools/promote_rest_frame.py <unit> $d --medoid        # settled frame -> still
  $PY tools/pixel_anim.py <unit> $d idle walk attack        # ⚠ NO --pad now (trap 2)
done

$PY tools/pixel_anim.py <unit> se death                    # se and ne; sw/nw are
$PY tools/pixel_anim.py <unit> ne death                    # mirrored at export
$PY tools/make_corpse.py <unit> se
$PY tools/make_corpse.py <unit> ne

$PY tools/export_to_game.py <unit>                         # -> game public/sprites
$PY tools/accept.py <unit>                                 # ⚠ THE GATE
```

`--medoid` is right for any unit that is asymmetric at rest (anything holding
different things in each hand). Drop it for a symmetric one — see trap 8.

Then **look at it** — copy `public/mockups/ogre-all-animations.html`, change
`UNIT`, and open it via `npm run dev` at
`http://localhost:5173/mockups/<unit>-all-animations.html`. Never open the file
directly; Chrome gives local files an opaque origin and sibling images fail.

---

## 3. `accept.py` is the gate, and it is not enough

It checks, with thresholds measured on the ogre: no cropping, one size across
every motion, per-clip steadiness, loop seams, idle-is-not-a-walk, idle limb
drift, and whether a strike breaks the silhouette. **The ogre passes every gate**
— that is deliberate, so a failure means something real.

It **cannot** see:

- **Whether a motion reads as the thing it is meant to be.** A punch can pass
  every number and look like a backhand. This happened. The contrast gate cannot
  tell a turn from a swing and actually *rewards* the turn.
- **Detail flicker.** The ogre's `s` idle churns 212px per frame in the head
  band against 19 on `ne`, and nothing notices. The face visibly chatters.

So: gates first, then eyes. If the numbers pass and it looks wrong, trust your
eyes and read §6.

---

## 4. The traps, in order of what they cost

1. **`cfg=1` makes negatives INERT — naming a failure summons it.** 13/13 seeds
   drew a back view from "never show its back". Removals must be phrased as an
   *edit* ("the club has been taken away") and placed at the **front**, because
   `FACING_HOLD` is appended after and a late clause gets buried. Avoid the word
   `back` even anatomically; use spine/heel/rear.
2. **The SEED FRAME beats the prompt.** WAN finishes whatever gesture the init
   frame implies. `dirs` stills routinely come back mid-gesture — the ogre's
   se/e/ne/n all held a cocked fist and their idles duly threw the punch. Fix it
   at the seed: `promote_rest_frame.py <unit> <facing>` installs the clip's
   settled tail frame as the still, then regenerate. ⚠ **Do not re-pad a
   promoted frame** — it came out of a padded clip and 0.62² = 0.38 collapses it.
3. **Regenerating a bad take is a NO-OP.** Generation is deterministic on
   `SEED`; the same prompt returns the same clip byte for byte. Use `--seed` to
   roll, and record the winner in `SEED_BY_FACING` or a default re-run will
   silently replace it.
4. **Score a take on FIT *and* STEADINESS.** Rolling on cell-fit alone picked a
   take that fitted at ×0.946 while its body swung 13px mid-punch — the same
   "it's shrinking" complaint from a different cause.
5. **`--pad` or every clip is silently cropped at source.** Without it: idle
   56/66 frames clipped, death 31/33.
6. **Warm the registry through `drawUnitSprite`, not `getPixelFrame`,** when
   verifying in the browser. A harness importing `/src/assets/imageSprites.ts`
   gets a *different module instance* than the drawing code uses; warming the
   wrong one leaves every draw on the procedural fallback and reports false
   failures. This cost a real debugging detour twice.
7. **Hard-refresh after re-exporting.** Sprite filenames are stable, so the
   browser will pair cached images with a fresh manifest. `manifest.version`
   now cache-keys the URLs, but your own open tab can still be stale.
8. **`promote_rest_frame`'s symmetry metric only fits a symmetric unit.** It
   ranks `s`/`n` candidates by bilateral mirror IoU, which is meaningful for the
   unarmed ogre (0.972 / 0.944) and meaningless for anything holding different
   things in each hand — the knight scores 0.511 / 0.486 no matter how settled
   the pose, so symmetry finds whichever frame folds the sword across the body.
   Pass **`--medoid`** to force the tail-medoid metric on every facing. On the
   knight's `s` that took the loop seam 0.718 → 0.936 and the mean IoU 0.831 →
   0.948, and stopped the clip decaying monotonically (a drift) rather than
   oscillating (a breath).
9. **Judge "steadiness" on the BODY, not the silhouette.** `accept.py` measures
   plain height, so a raised weapon counts as height. A head-on sword swing
   therefore fails the 8px limit on `s`/`n` at *every* seed tried (10–14px)
   while the three-quarter facings pass (4–7px), purely because a 3/4 view
   foreshortens the blade. The limit was measured on the ogre's punch, which
   raises nothing above the head. Before rolling seeds at a steadiness failure,
   measure the bottom-60%-mass span too: if the body is flat and only the weapon
   moves, the number is lying. (It is a noisy proxy — it can report a body span
   larger than the full height — so use it directionally.)

---

## 5. What is already handled for you

Do not re-solve these; they are in the pipeline now.

- **Cell 80×80, anchor (40, 72).** The cell is the CANVAS, not the character —
  `TARGET_BODY` is unchanged, so widening it added margin, not size. 38px per
  side against a peak punch reach of 34.
- **Sizing closes the loop on the OUTPUT** (`match_to_still`): render the clip,
  scale so its *median* height equals the still's. Both input-side estimates
  were measured and fail (see §5g).
- **Loops skip the clip head** (WAN eases off its init frame), **idle locks one
  scale**, **walk evens per-frame wobble** with a pose-robust metric,
  **one-shots lock to frame 0**, and if a clip must shrink to fit it shrinks
  **as one unit**, never per frame.
- **Geometry is published** in the manifest and rides on each `PixelFrame`, so
  a converted unit needs **no game-code change at all** — just
  `export_to_game.py`.
- **Facing resolution is the game's job.** `nearestFacingWithArt`
  (`src/assets/imageSprites.ts`, spec in `src/assets/__tests__/`) snaps any
  requested facing to the nearest one with art per state, ties toward the
  camera. Diagonal-4 coverage, s/n-only death, and partial exports all render
  correctly without any per-unit wiring. Subset tolerance holds pipeline-side
  too: `export_to_game.py` and `accept.py` skip facings that were never
  generated, and mirrors (corpse included) come from whatever exists.

---

## 6. Open items (none blocking the next unit)

**On the knight** *(the s/e/n items below became MOOT with the 2026-07-21
diagonal-4 cut — kept for the record)*

- ~~`attack s` fails steadiness at 12px, accepted~~ — s is gone; both kept
  facings pass. `attack ne` reads +4px on the extension gate and is exempted
  by (unit,facing) in `NO_EXTENSION_GATE`: the swing cuts away from the
  camera, blade hidden behind the body (approved 2026-07-20).
- ~~It resizes as it turns~~ — **FIXED 2026-07-21** after the user flagged it
  on the roster review (se/sw read smaller; ne/nw sword touched the cell
  line). `pixelize.SCALE_OVERRIDE` now takes **(unit, facing) pairs** —
  `("knight","ne"): 0.89` brings ne 52 → 47 beside se 46, and the ne sword's
  peak reach fell 38 → 25 of 40. The per-facing scale lever exists now; the
  facing is parsed from the source filename.
- **The sword clears the cell by 1px** (reach 38 of 38 post-cut). Any re-roll
  of an attack could cross it; trust the frames-touching-edge count.
- Death is now `se`/`ne` like every diagonal-4 unit (regenerated 2026-07-21,
  staged `--pad 0.62` — see trap 13).

**On the ogre**

- ~~`s` idle face flicker~~ — MOOT: s was cut; `accept.py` is fully clean on
  the kept facings.
- Death is now `se`/`ne` (regenerated 2026-07-21), but the game still **fades
  during** death instead of playing it out and holding the corpse. The
  intended behaviour is mocked on the review page but not implemented in
  `src/`.
- **Two corpse systems** exist for the ogre — the new pixel corpse and
  `corpseArt.ts:140` (`"arms"`). Pick one.
- **The hip-driven punch was rejected** and reverted; those takes are parked at
  `pixel/anim/_reverted_attacks_20260720/`. The choreography text is still in
  `pixel_anim.py` as unwired reference. **The engine lunge was also rejected** —
  the argument for it is sound and will look tempting again, so ask first.

---

## 7. Before shipping any of this

- ✅ **The pipeline `tools/*.py` are now committed** — three commits on the
  pipeline repo's local `main` (`780f3d2` baseline, `c37b479` prompt rewrites,
  `77cba79` the two fixes above), plus a `.gitignore` for `__pycache__` and the
  stale `.bak`.

  ⚠ **Never push that repo.** Its `origin` is
  `github.com/mor-o/comfyui-2d-character-pipeline` — a third party's, not ours —
  and local `main` tracks *their* `main`. The commits are local only, so the
  work is still one disk failure from gone. If it matters, re-home it: a repo
  under our own account, or vendor `tools/` into `fantasy-arena`.
- `public/` is untracked in the game repo too, so the sprite PNGs have no
  history — an overwrite is unrecoverable. This now covers **two** units'
  worth of art (36 files per unit).
- Delete or gitignore the harness pages under `public/mockups/` that you do not
  want deployed (they ship to Netlify).
- Usual gate: `npm run typecheck && npm test && npm run build` (817 tests).
