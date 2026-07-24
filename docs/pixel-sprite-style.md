# Hi-bit pixel sprites — recipe of record & handoff

Style is locked. The **ogre is complete and integrated into the game**, now
including a real 8-facing **idle** loop; the other 11 mocked units still need
converting to the current recipe.

State as of 2026-07-20 (superseding the Phase-0 version of this doc).

📄 **Converting the next unit? Start with
[`pixel-next-unit-handoff.md`](pixel-next-unit-handoff.md)** — the runbook,
the acceptance gate, and the traps in cost order. This file is the *why*
behind it.

---

## 0. Quick start

**There is no Python on PATH.** Use the ComfyUI venv:

```
PY="C:/Users/Justin/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ghost/ComfyUI/.venv/Scripts/python.exe"
cd C:/Users/Justin/Documents/comfyui-2d-character-pipeline
```

**Anything that generates needs ComfyUI running** — headless on port **8188**
with `--enable-cors-header "*"`. The Desktop app opens a dashboard and does
*not* auto-start the server. Check with `curl -s http://127.0.0.1:8188/queue`.

```bash
# --- full conversion of one unit (roughly 15 min GPU) ---
$PY tools/pixel_fa.py master  <unit>                        # identity spine (t2i)
$PY tools/pixel_fa.py dirs    <unit> --pad 0.55             # 5 facings  ⚠ --pad
$PY tools/pixel_anim.py <unit> <dir> idle walk --pad 0.62   # ⚠ --pad, per facing
$PY tools/pixel_anim.py <unit> <dir> attack --pad 0.62      # x5 facings
$PY tools/pixel_anim.py <unit> s  death  --pad 0.62         # S and N only
$PY tools/promote_rest_frame.py <unit>                      # idle frame -> S still
$PY tools/make_corpse.py <unit> s                           # corpse from death clip
$PY tools/export_to_game.py <unit>                          # -> game public/sprites

# --- idle drifts on an off-axis facing? the seed still is mid-gesture (3a) ---
$PY tools/promote_rest_frame.py <unit> se --dry-run         # inspect the pick
$PY tools/promote_rest_frame.py <unit> se                   # settled tail -> still
$PY tools/pixel_anim.py <unit> se idle                      # ⚠ NO --pad now

# --- no GPU ---
$PY tools/pixel_sync.py --units <unit>    # re-pixelize + acceptance gates
$PY tools/ogre_review.py                  # build the review page
```

**Viewing:** `npm run dev`, then
`http://localhost:5173/mockups/ogre-animations.html`. Do **not** open the file
directly — Chrome gives each local file its own opaque origin and sibling images
fail.

**Verifying the game integration:** `/mockups/idle-verify.html` drives
`drawUnitSprite` by hand at chosen phases and asserts the strip is wired, the
bob is suppressed and the feet stay planted. The preview pane suspends rAF, so
never wait on a battle to animate.

⚠ **Warm the registry through `drawUnitSprite`, not `getPixelFrame`.** The
registry is lazy — the first call starts an async decode and returns `null`
meanwhile — and a harness that imports `/src/assets/imageSprites.ts` gets a
*different module instance* from the one `drawUnitSprite` reaches via
`@/assets/imageSprites`. Warming the wrong one leaves every draw on the
procedural fallback, which then reports the bob as "not suppressed" and the
strip as "not animating". Both are artefacts of a cold registry; this cost a
real debugging detour. Detect readiness the way a caller can: with `staticPose`
freezing the procedural clock, two phases of the same state must render
*differently*.

⚠ **The pipeline tools are UNTRACKED in git.** `tools/*.py` is all untracked in
`comfyui-2d-character-pipeline`. There is one manual backup
(`pixel_fa.py.bak-20260719-181905`). Committing them is overdue.

---

## 1. Locked decisions

| | |
|---|---|
| Style | **crisp** (of crisp / grim / lush) |
| Animation source | **real WAN frames for everything** — idle, walk, attack, death |
| Camera | high-angle 3/4, ~60° |
| Cell | **80×80**, character ~46px tall, anchor (40, 72) |
| Facings | 8 — **5 generated** (S, SE, E, NE, N), 3 mirrored |
| Attack coverage | all 8 facings |
| Death coverage | **S and N only** — see §6 |

**This supersedes the previous "pose keyframes for attacks" decision.** Attack
pose keyframes are abandoned; see §3.

**Why small:** integer *upscaling* of pixel art is lossless, integer
*downscaling* is not. Author at the smallest scale you ship and only scale up.

⚠ **THE CELL IS THE CANVAS, NOT THE CHARACTER.** Widening it does not make units
bigger — the body is sized by `TARGET_BODY` (26, unchanged), so 64→80 left the
ogre at the same ~46px and simply added transparent margin. `TARGET_BODY` is
deliberately NOT scaled with the cell: it fixes character size across the whole
roster, while the cell is only how much room is drawn around it.

**Why it grew to 80:** at 64 with the anchor at x=32 there were ~30px each side
of the foot point and the ogre's punch reached 32. Every way of coping was bad —
crop the fist (4 of 8 frames on se/sw), or shrink the clip to fit (the sprite
changes size mid-swing). Both were rejected on review. 80 gives 38px a side, and
all 192 rendered frames (8 facings × 3 motions × 8) now clear the edge with 6px
to spare. File size barely moved, 312K → 328K, because PNG compresses the extra
transparency almost for free.

---

## 2. ⚠⚠ The single most important rule: cfg=1 means NO NEGATIVES

Every sampler in this pipeline runs `cfg: 1`, so classifier-free guidance is off
and **the negative prompt is never evaluated**. The positive prompt is the only
channel, and a diffusion model has no reliable "not" there.

**Naming a failure summons it.** Clauses reading *"never show its back"*,
*"does NOT spin or turn around"*, *"shoulder twisted away"* put `back`, `spin`
and `away` into the conditioning and the model draws exactly that.

Evidence: an S-facing attack pose returned a **back view on 13 of 13 seeds**
across 2 pose texts, 4 pad values and both source images. Rewriting every clause
to state only what *should* be visible took it to **0**.

This also explains the old finding that "WAN i2v cannot do attacks". The three
clips that proved it — knight, wolf, fire mage — were all prompted with *"does
NOT spin or turn around"*, and the knight spun. That conclusion was
prompt-induced, not a model limit.

**Three corollaries:**

- **Removals still need stating explicitly.** "The club has been taken away"
  names an *edit*, not a pose, and works. A purely positive "both hands are
  empty" was too weak and the club came back. The rule is narrower than "never
  negate": never name a **pose the model can render**.
- **Position matters.** In a long prompt, late instructions get buried. The N
  facing kept its club through multiple seeds until the removal moved to the
  *front* of the prompt. N carries by far the longest direction clause.
- **Avoid the word `back` even anatomically.** "back arched", "back foot" and
  "not slung across the back" all leak. Use "spine", "heel", "rear".
- **The idle prompt was the last un-rewritten offender**, and it named the
  failure five times: *"does NOT walk … no stepping, no striding, no lifting a
  foot, no marching in place"*. Its own reviewer note recorded the pre-cfg=1
  reasoning — idles were reading as walking, so stepping was "named and
  forbidden". The cure was the disease. A stance cannot be described by what the
  legs do not do; let the weight hold them still instead ("feet flat, weight
  settled evenly, holds that stance").

⚠ **A prompt cannot fix what the SEED frame implies.** See §3a — this is the
limit of everything above.

---

## 3. Why generated attack POSES were abandoned

Qwen redraws the body on every generation. Measured on the ogre, a pose frame
came back with the **torso at 33px against the resting frame's 42px and the feet
18px against 26px** — the sprite visibly deflated mid-swing. The pixelizer's
per-frame height normalisation makes each frame look right *alone*, which is why
the stills and gallery looked fine, but they do not match *each other*.

WAN continues motion from a single frame and therefore **cannot redraw the
body**, so form is preserved. That is the whole reason for the switch.

Two further things Qwen would not do, both worked around mechanically:

- **Asymmetric poses.** A one-armed punch failed across **17 seeds and 6
  wordings** — leading with the off-arm, giving it a contact landmark, naming
  screen-relative elbow directions. See `graft_limb.py`.
- **Prone bodies.** A corpse came back *standing* on every seed, even with the
  facing lock removed. See `make_corpse.py`.

---

## 3a. ⚠ The seed frame beats the prompt

WAN continues the motion its init frame implies, so a still caught **mid-gesture
gets its gesture finished**. The `dirs` stills are Qwen edits generated
independently of any pose intent, and the ogre's se/e/ne/n all came back holding
a cocked fist. Their idles duly threw the punch — measured as bbox-width drift
across the clip:

| facing | seed still | feet-pinned prompt | + pose-agnostic limb pin | + explicit front-loaded edit |
|---|---|---|---|---|
| s | neutral, arms down | +7 | +7 | **+4** |
| se | fist raised | −21 | −45 | −40 → **+10** after promote |
| e | fist cocked | +81 | **+87** (worse) | **−20** |
| ne | arms slightly out | +47 | +52 | **−8** |
| n | fists clenched | +73 | +92 | **+6** |

Only `s` was clean, and only because `promote_rest_frame.py` had already
replaced its still with a neutral frame lifted from the idle loop.

Two things this pins down:

- **Pose-agnostic wording does not work.** "Its arms stay where they start" made
  e *worse* (+81 → +87). Stating a position the model should hold is not an
  instruction it can act on.
- **An explicit EDIT does**, and must go at the **FRONT** — `FACING_HOLD` is
  appended after the motion text, so a late clause is buried. "The ogre's raised
  fist has been lowered and its clenched hands have been opened" took e from
  +87 to −20. Same construction as the club removal in §2.

That leaves the honest case: a clip that correctly **relaxes out of** a bad seed
pose is still a bad *loop*, because its head and tail disagree (se, −40). Fix it
at the seed — `promote_rest_frame.py <unit> <facing>` installs the clip's
settled tail frame as the still, then regenerate from it (se → +10).

⚠ **Do not re-pad a promoted frame.** It came out of a padded clip, so it is
already small in its canvas; padding again compounds (0.62 × 0.62 = 0.38) and se
collapsed to 168px against ~270 for its neighbours, with foot churn spiking to
walk levels. Regenerate a promoted facing with **no `--pad`**.

`promote_rest_frame.py` needs two metrics, because bilateral symmetry — the
original, still correct for the head-on `s`/`n` — is meaningless on a
three-quarter view that is asymmetric by construction. Off-axis facings use the
**medoid of the clip tail**: among the last 40% of frames, the one closest to all
the others, i.e. the pose the clip settles into. The ogre's se scored 0.984.

## 4. ⚠ Padding: every WAN clip was silently cropped

`pixel_anim.py` used to stage its i2v seed with a plain file copy — no padding.
WAN keeps a subject roughly the size it is seeded at, so anything that sprawls
ran off the 512 canvas and was **amputated in the generated frames**. The
pixelizer then faithfully reproduced a flat-ended stump and centred it in the
cell with margin to spare, which looks worse than an honest edge crop.

Before `--pad` existed, on the ogre:

| clip | frames clipped at source |
|---|---|
| idle | **56 / 66** |
| walk | 12 / 33 |
| attack | 3–13 / 33 per facing |
| death | **31 / 33** |

`--pad 0.62` takes death to **0/33**. The facing pass has the same problem and
the same fix (`dirs <unit> --pad 0.55`) — unpadded, the ogre lost the top of its
skull, and the giveaway is a **constant-width alpha row along the top edge** (a
flat slab) instead of a curve.

Padding is **opt-in** on both commands because every asset generated before it
existed was made without it; turning it on globally would silently invalidate
the roster.

---

## 5. ⚠ Scale: three separate traps

**5a. `match_area` is wrong for anything that extends a limb.** It forces total
alpha area to match the resting frame, so an extended arm makes the pixelizer
shrink the whole body to compensate. This is the same mistake the height rule
already avoids (normalise on the bottom 60% of alpha mass, *not* bbox). Use
`force_scale` instead.

**5b. Padding the seed shrinks the whole clip.** `force_scale` maps *source*
pixels to cell pixels, so a subject 0.62× smaller inside its padded source
renders 0.62× smaller — the ogre's death came out at height 29 against 46 for
its own idle. `pixel_anim.matched_scale()` corrects this by measuring the ratio
between the resting frame's body span and the clip's own first frame, so **any**
pad value self-corrects, including clips made before the flag existed.

**5c. LOOPS normalise per frame; ONE-SHOTS lock the scale.** *(Superseded in
part — see 5f. The walk still varies per frame, but the exporter now computes
those scales itself instead of letting the pixelizer re-derive one per frame.)* WAN drifts subject
size *within* a clip — the ogre's walk swings **179..229px of body span, a 28%
change**. Deriving one scale from frame 0 lets all of it through and the ogre
visibly grew as it walked (11px of height swing). Letting the pixelizer
height-normalise each walk frame independently cuts that to **1px**.

But a one-shot must **not** be normalised per frame: a death legitimately
collapses, and per-frame normalisation would scale the crumpling body back up to
full height and destroy the motion. `export_to_game.py` splits on this.

**5d. A LOOP must skip the head of the clip.** WAN eases away from its
conditioning image over the first several frames, so they sit at a different
scale from the settled remainder. On the ogre's idle the exported frame 0 came
out shorter than every other frame on all five facings — 1px on s/se/e/ne, **4px
on n** — while frames 1–7 agreed with each other. In a loop that lands squarely
on the seam and the sprite pops once per cycle; n matters most, being the facing
a freshly deployed player unit defaults to. Dropping frame 0 alone was **not**
enough (n came back byte-identical); a **sixth** of the clip clears it and still
leaves 28 of 33 frames. One-shots keep their head — a wind-up and a first
stagger *are* the motion, and nothing wraps to expose a seam.

⚠ Derive the locked scale from the first frame **actually used**, not
`frames[0]` — otherwise it re-imports the very offset the skip removes.

**5g. ⚠ SCALE IS SET BY CLOSING THE LOOP ON THE OUTPUT.** Every input-side
estimate of a clip's scale is wrong in its own way, so `export_to_game` renders
the clip and corrects it against what actually came out (`match_to_still`):
scale the whole clip so its **median rendered height equals the still's**. The
median means the strike and the deepest lean move the clip's size not at all.

Both alternatives were measured and rejected:

| | error |
|---|---|
| measuring the art | pose-sensitive. Against a *known* 0.62 pad (true ratio 1.613) the best proxy read 1.511 ± 0.103; `body_span` moves as soon as the punch leans. |
| the recorded pad | assumes WAN preserves the size it was seeded at — the doc only ever claimed "roughly". The ogre's s attack rendered 53px against a 46px still on an exactly-known pad. |

And when a clip *does* have to shrink to fit the cell, **it shrinks as one**
(`uniform_fit` takes the worst frame's clamp and folds it into the shared
scale). Letting `pixelize` clamp frame-by-frame shrinks only the frames that
overflow — which on an attack is precisely the strike, so the body pulses on the
blow. That is a backstop, not the plan: a factor well below 1 means the motion
is too wide and should be reshaped (§6).

**5e. ⚠ IDLE IS LOCKED TO ONE SCALE — and the anchor is the whole trick.**

Per-frame normalisation is right for a **walk**: the legs carry the motion, the
torso holds still, and the bottom-60% alpha-mass metric tracks that.

It is backwards for a **breath**, where the motion *is* the torso. A rising
chest moves mass upward, the derived scale changes, and the pixelizer resizes
the whole body to compensate — so the sprite visibly **grows and shrinks**
instead of breathing. Reported from the review page and confirmed on s/se/e/w.

The diagnostic is that **height and width move in lockstep** — uniform scaling,
where a real pose change moves them independently:

| | height | width | area swing | H/W corr |
|---|---|---|---|---|
| s, per-frame | `46 43 45 47 45 45 47 47` | `46 44 45 47 45 45 47 47` | **19.8%** | lockstep |
| s, locked+median | `44 46 45 44 46 46 44 44` | `45 47 45 45 46 45 44 44` | **7.8%** | 0.75 |

Locking was tried **once before and lost**, with the scale anchored to
`src_frames[0]`. That was the anchor's fault, not the lock's: one
unrepresentative frame sized the whole clip, and n came out 50–53px against a
48px still, popping 5px on every idle↔still transition. `matched_scale_median`
anchors to the clip's **median** frame instead — stable *and* in agreement with
the still. Final: area swing s 19.8→7.8%, e/w 5.1→2.6%, n 7.2→2.3%, every
facing within ±2px of its own still.

One-shots keep the frame-0 anchor: an attack and a death are *supposed* to
change size through the clip, so a median would be meaningless.

**5f. ⚠ The WALK grew on the three-quarter facings — the mass metric reacts to
LEG SPREAD.** Reported from the review page on se/e/sw/w; §9 had it as a known
open item.

`pixelize` height-normalises on the bottom 60% of alpha **mass**, which is
area-weighted. When a three-quarter walk spreads its legs, the bottom rows carry
more pixels, 60% accumulates in fewer rows, the body measures *shorter*, and the
whole sprite is scaled up to compensate. Head-on `s` barely spreads toward the
camera, which is why it was fine at 1px while se swung 6px. The tell is a
**negative** H/W correlation (−0.55 on se): shorter as it gets wider.

Neither existing lever fixes it:

| | s | se | e | ne | n |
|---|---|---|---|---|---|
| per-frame mass (was shipped) | 1 | **6** | **5** | 3 | 3 |
| locked to clip median | **7** | 4 | 6 | 5 | 3 |
| **evened_scales** | **1** | **1** | **2** | **1** | **1** |

Locking fails because WAN's real size drift then passes straight through — s
went 1px → 7px. The fix separates the two jobs the metric was conflating:
`evened_scales` locks the clip to the still via the median, then divides out
each frame's residual height wobble using **row occupancy** (`silhouette_height`),
which cannot see how wide a row is and so cannot see leg spread. Lifting a leg
does not move it either — the planted foot still sets the bottom.

Done in `export_to_game.py` via the existing `force_scale`, so **`pixelize` is
untouched** and stills/attacks/deaths keep the shipped metric. Residual area
swing of 10–13% is limbs spreading — real walk motion, against 22.4% before.

⚠ **Do not apply this to idle.** A breath *is* a height change; evening it out
would cancel the animation. Idle locks (5e), the walk evens, one-shots lock to
frame 0.

---

## 6. What reads at 64px

**Depth does not.** A punch thrown toward the camera foreshortens into the
torso; an unarmed downward slam ends with the arms at the sides, which is the
same silhouette as standing. Both scored ~0.95 on the contrast gate and were
invisible in motion. **A readable strike has to break the body outline** — throw
the limb *across* the picture or *above* the shoulders, into empty background.

Consequence: **off-axis attack facings read better than S.** SE/E/NE/N all fully
extend the arm; S is the softest of the eight.

**The cell width WAS a hard limit — the cell was widened instead.** At 64 a
standing ogre is ~47px wide anchored at x=32, leaving ~10px of clearance, and a
fully locked-out lateral punch ran off the edge; shortened enough to fit, it
scored 0.95 and was invisible. That tension is what the 80px cell resolves (§1):
the body is unchanged and the extra margin is pure headroom, so a punch can
extend without being cropped OR scaled down. Reach for reference, against a
38px-per-side budget: s 26, ne 28, n 31, se 32, e 34.

⚠ **The fit guard measures from the ANCHOR, not as a centred width** — it did
not always, and the punches were being amputated. `pixelize` places a sprite by
its foot anchor at `(ANCHOR_X, ANCHOR_Y)`, so an arm reaching asymmetrically to
one side runs off the edge while the total width still "fits": the ogre's punch
was 56px inside a 60px budget, passing the old test, with **4 of 8 frames on
se/sw clipped at the cell edge** (3/8 on ne/n/nw). Only 1px over — but a crop is
a crop, and the tell is a flat vertical alpha column at x=0 or x=63.

The vertical side is much tighter than it looks and had the same error:
`ANCHOR_Y` is 56 of 64, so there are only **7px below the feet** and the real
height budget is ~54, not the 60 that `cell - 4` implied. Cost of fixing both:
a ×0.969 shrink on the affected frames, 1–2px of body height, extension
preserved (se +13→+12, ne +15→+16). Every motion now reports 0 edge contact.

Same reason **death sinks rather than topples**: a prone body is wide and low,
fighting both the cell and the height rule. The choreography folds limbs *in*
("one arm sprawling loose" produced 63px wide, overflowing 26 of 33 frames).

**The contrast gate is still unreliable** — it cannot tell a turn from a swing
and *rewards* the turn. Build the review page and judge by eye.

⚠ **The engine LUNGE was tried as the fix for this and REJECTED.** Every attack
is prompted "stays centred in exactly the same spot", so no clip contains
forward movement — the arm extends over a planted body, which the reviewer read
as a **backhand** on nw/ne/n/sw/se. Restoring the 7px lunge (travelling along
`dir8Vector` rather than the 1-bit `Unit.facing`, so a north-facing unit drove
*up* the screen) fixed that on paper. Reviewer's verdict: *"I do not like the
lunge."* It is off. The reasoning still reads well and will look tempting
again — **ask before reintroducing it.**

⚠ **Choreography is the size fix — do not shrink frames to make them fit.** An
arm that locks out sideways needs more lateral room than the cell has, and both
ways of coping are bad: crop the fist, or shrink the frame (which makes the body
pulse on the blow). A **hip-driven** punch avoids the problem at source — power
from the hips and the torso turning, the ELBOW leading and staying bent, the
fist finishing in front of the chest — so the silhouette still breaks but inside
the shoulders' own width. `s` already did this, which is why it was the one
facing that never clipped. `ATTACK_BY_FACING` carries it, with a shorter variant
for se/e: reach that fits is facing-dependent, and profile/front-ish views are
the tight ones (ne and n fitted at full size while se needed x0.754).

⚠ **Score a take on FIT and STEADINESS, not just fit.** `uniform_fit` (does the
clip need shrinking to stay in the cell) misses the other half — the rendered
body-height RANGE across the strike, which reads as the sprite growing
mid-punch. Rolling on fit alone picked an se take at x0.946 that swung 13px.

⚠ **Regenerating a bad take is a NO-OP** — generation is deterministic on
`SEED`, so the same prompt returns the same clip byte for byte. `--seed` and the
`SEED_BY_FACING` table exist for this; the shipped takes are recorded there
because a default re-run would silently replace them.

⚠ **Aiming the punch in DEPTH by prompt does not work — do not retry.** Measured
on the ogre: "toward the viewer … looms larger" made WAN zoom the FIST until it
filled the cell, bigger than the ogre, and a size anchor ("stays about the size
of its own head, the body stays the same size in frame") did not hold it. Aiming
*away* ("into the distance, foreshortened") changed nothing at all — se +13→+14,
ne +15→+18, n +10→+9 of lateral extension — because a punch thrown away from the
camera is hidden behind the body, and lateral is the only version WAN can show.
`ATTACK_BY_FACING` exists but is deliberately empty; the fix was in the engine.

---

## 7. Tools

**Pipeline** — `C:\Users\Justin\Documents\comfyui-2d-character-pipeline\tools\`

| file | role |
|---|---|
| `pixel_fa.py` | masters (t2i), facings (`dirs --pad`), attack poses (legacy) |
| `pixel_anim.py` | **WAN clips — the main generator now.** `--pad`, `matched_scale` |
| `pixelize.py` | the deterministic pixelizer — palette, anchor, scale, outline |
| `pixel_sync.py` | pixelize → gallery, acceptance gates, `POSE_PIN` (legacy) |
| `promote_rest_frame.py` | promotes the most symmetric idle frame to be the S still |
| `graft_limb.py` | transplants a resting arm into a pose, for one-armed attacks |
| `make_corpse.py` | cuts a corpse from the death clip's most settled frame |
| `export_to_game.py` | **pixelize + strip + manifest → the game repo** |
| `ogre_review.py` | builds the review page (template for other units) |

Three of these exist only because Qwen refused something; see §3.

`promote_rest_frame.py` deserves a note: the S still and the idle loop's neutral
frame are drawn by different processes and drift apart (measured 0.837 vs 0.972
bilateral symmetry). They should be the *same image*, or the sprite twitches the
instant a unit stops moving. ⚠ Side effect: it makes the S facing
near-perfectly mirror-symmetric, which is what makes asymmetric pose generation
*harder* (§3).

---

## 8. Game integration (DONE for the ogre)

| file | change |
|---|---|
| `src/assets/imageSprites.ts` | **new** — manifest-driven registry, 8 facings, strips, fallback |
| `manifest.json` | now publishes `cell`, `anchor` and `version` |
| `src/assets/sprites.ts` | `drawImage` seam + `blitPixelFrame`, above the `switch` |
| `src/engine/Renderer.ts` | derives `dir8`, `animPhase`, swing timing |
| `src/screens/BattleScreen.tsx` | DPR fix — device-pixel backbuffer |
| `public/sprites/pixel/` | 28 ogre PNGs + `manifest.json` (tracked) |

Adding a converted unit needs **no code change** — just `export_to_game.py`.

**Cell geometry is PUBLISHED, not hardcoded.** `export_to_game` writes `cell`
and `anchor` from `pixelize`'s own constants (it used to restate `[32, 56]` by
hand, which would have published a lie the moment the cell changed), and
`getPixelFrame` hangs them on every `PixelFrame` so `blitPixelFrame` uses
exactly what the asset was built with. Widening the cell therefore needed no
drawing-code change at all, and two units may legitimately ship different sizes.

⚠ **`manifest.version` is a CACHE KEY and it is load-bearing.** The PNG
filenames are stable across exports, so a returning player pairs **cached
images** with a **fresh manifest** — and the manifest is what declares the cell
size. When the cell went 64→80 that combination read cached 512×64 strips at
80px offsets: garbage frames, several completely blank. It was hit during
verification and would otherwise have shipped silently. The game appends
`?v=<version>` to every image URL and fetches the manifest with
`cache: "no-cache"` (which *revalidates* — it does not skip the cache).

**Determinism is untouched.** `Unit.facing` is 1-bit sim state covered by the
digest, so direction is derived in the *Renderer* from the target's position and
passed via `DrawOpts.dir8`. 817 tests stay green.

**The DPR fix is load-bearing.** The canvas was pinned to 720 tall and
CSS-stretched by an arbitrary fractional factor — survivable for vector art,
fatal for pixel art. The backbuffer is now device-pixel sized (DPR floored,
capped at 2), and `blitPixelFrame` reads the composite matrix, projects the foot
anchor into device space, rounds, and blits at an integer scale under identity.

**Facing defaults to the enemy side, not the camera.** A freshly deployed unit
has no target; player units look N, enemy units look S.

**Attack timing.** ⚠ `Unit.attackSpeed` is the **delay in seconds**, not a rate.
The real interval also folds in haste, item delay, Tempo stacks and rhythm, none
of which is recoverable from the snapshot — so the Renderer *watches
`attackCooldown`* and treats a rise as a new swing. Phase is `1 - cooldown/max`.

**The strike lands on the damage tick.** Phase 0 is the moment damage applies,
so the strip is *rotated* by the `hit` frame index recorded in the manifest:
`(floor(phase*n) + hit) % n`. Playing 0..n from the hit would show the wind-up
*after* the damage number.

Coverage is uneven and the code falls back one level rather than drawing
nothing. A unit with no idle clip still draws its still, which is what every
unit did before idle clips existed.

**Idle is a loop with no sim-side cadence.** Unlike the walk (which scales with
`moveSpeed` so the feet do not slide) and the attack (which rides
`attackCooldown`), nothing in the simulation sets a breathing rate, so
`animPhaseOf` runs it on a fixed `IDLE_BREATH_SEC = 3.2`. It is offset per uid,
because `animTime` resets on a state change and a rank that stops moving on the
same tick would otherwise breathe in perfect lockstep — clockwork, not life.
`uidPhase01` in `sprites.ts` is the shared hash, so a unit's procedural and
pixel animations agree.

**An animated frame suppresses the procedural BOB — but keeps the LUNGE.**
`PixelFrame.animated` reports whether the frame came from a strip or a static
still, and `drawUnitSprite` zeroes the *bob* when it did. This is why the pixel
lookup now happens **before** the transform: the bob is baked into
`ctx.translate` and the blit inherits it. Two reasons it matters — an idle clip
already breathes, so running both means the ogre breathes *and* bobs; and
`blitPixelFrame` rounds the foot anchor to whole device pixels, so a 1.2px sine
becomes an integer judder rather than a smooth rise. It is reported per FRAME,
not per unit, because coverage is uneven: a facing that falls back to its still
keeps the bob, which is correct — that art cannot move on its own.

The **lunge** is suppressed along with it, by reviewer decision — see §6. If it
is ever brought back for pixel units it must travel along `dir8Vector`, not
`dirX`: `Unit.facing` is 1 bit, so a facing-based lunge only moves a unit left
or right and a north-facing ogre punches sideways; and `dirX` additionally
carries the mirror for the 3 flipped facings (which `blitPixelFrame` drops), so
applying it would send half the roster lunging backwards.

---

## 9. Known-open

- ~~**Idle is the worst clip and the most-seen state**~~ — **DONE.** All 5
  facings regenerated with `--pad 0.62`, 0/33 clipped (was 21–23/33), foot churn
  0.007–0.027 against the walk's 0.124–0.285, drift within ±20px. Exported,
  wired into the game, loop seams −2…+1, every facing within 2px of its own
  still. See §2 (prompt), §3a (seed), §5d–e (export), §8 (integration).
- ⚠ **The `s` idle's FACE flickers.** 212px change per frame in the head band,
  against 180 for the *walk* and only 19 on `ne` — the front view is the one
  where the face is most legible, so it is the worst place for it. Everything
  else about `s` passes; this is a quality refinement, not a defect, and would
  need a regeneration at a different seed (`SEED` is a module constant in
  `pixel_anim.py` with no CLI flag). *(The separate "s grows" complaint was the
  per-frame scaling in §5e and is fixed.)*
- **The other 11 units** are still on the old Phase-0 assets. Expect §3a to bite
  on every one of them — mid-gesture `dirs` stills are the norm, not an ogre
  quirk, so budget a promote-and-regenerate pass per off-axis facing.
- **Death is S/N only**, and the game still **fades during** death rather than
  playing it out and holding the corpse (`DEATH_FADE_TICKS` = 0.6s, corpse
  crossfading in on top). The intended behaviour — play, then hold, no fade — is
  mocked on the review page but not implemented in `src/`.
- **Two corpse systems now exist** for the ogre: the new pixel corpse and
  `corpseArt.ts:140` (`"arms"`). Pick one.
- ~~**SE/SW walk varies 6px** in height where S is 1px~~ — **FIXED**, and it did
  *not* need a `pixelize` change after all: `evened_scales` does it in the
  exporter through the existing `force_scale`, so no other unit is affected. All
  facings now hold 1–2px. See §5f.
- **The ogre corpse has no readable head** — a coherent heap, but a heap.
- **~2s between ogre swings** leaves a long recovery/wind-up stretch. If it
  reads as dead air, compress the clip into the front of the interval and hold
  the resting frame.
- **Attack poses / `POSE_PIN`** in `pixel_sync.py` are legacy. Left in place
  until WAN attacks are proven on more than one unit.
