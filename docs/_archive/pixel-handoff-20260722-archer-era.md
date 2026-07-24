# Handoff — converting the remaining seven units to pixel sprites

**Done and integrated (all diagonal-4): ogre, knight, orc, skeleton, archer.**
Remaining, in recommended order: **lich, necromancer, fire_mage,
seraph** (humanoids — the validated route), then **wolf, slime, rune_golem**
(body plans that break the metrics' assumptions — see their briefs).

State as of 2026-07-22. **Nothing is shipped** — four units' art, the review
pages, and the icon batch are all working tree. See "Before shipping" at the
bottom. The previous handoff (the orc/knight/skeleton era, with the full
history of *why* each rule exists) is banked at
`docs/_archive/pixel-handoff-20260721-first-four-units.md`;
`docs/pixel-sprite-style.md` remains the recipe of record. This file is the
*what to do*, in order.

---

## 0. The contract (what every unit gets)

- **Diagonal-4**: generate `se` + `ne` only; `sw`/`nw` (corpse included) are
  mirrored at export; the game's `nearestFacingWithArt`
  (`src/assets/imageSprites.ts`) snaps s/e/n/w requests per state. A new unit
  needs **zero game-code changes** — `export_to_game.py` is the whole
  integration.
- **Cell 80×80, anchor (40,72), TARGET_BODY 26** (~45-48px tall humanoid).
  The cell is the canvas, not the character.
- **BEST-OF-N takes is the standard** (user-granted 2026-07-21): roll the
  house seed set per clip — default + `--seed 7` + `--seed 13` — widen with
  more seeds when all takes fail the same way. Judge ORIENTATION FIRST (the
  gates provably reward a frontal turn), then how the motion reads, then the
  numbers. Record winners in `SEED_BY_FACING` with one line of reasoning.
- What the user has NOT granted: free choreography rewrites and identity
  flair. Propose those before building them. (The one standing choreography
  rule they *did* buy, twice: **a swing must stay visible** — see §3.11.)

## 1. The runbook

```bash
PY="C:/Users/Justin/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ghost/ComfyUI/.venv/Scripts/python.exe"
cd C:/Users/Justin/Documents/comfyui-2d-character-pipeline
# ComfyUI headless (the Desktop app does NOT auto-start the server):
#   cd .../ghost/ComfyUI && .venv/Scripts/python.exe main.py --port 8188 \
#     --disable-auto-launch --reserve-vram 1 --enable-cors-header "*" \
#     --input-directory  .../ComfyUI-Shared/input \
#     --output-directory .../ComfyUI-Shared/output \
#     --extra-model-paths-config "C:/Users/Justin/AppData/Roaming/Comfy Desktop/shared_model_paths.yaml"
# takes ~5 min to boot; poll curl -s http://127.0.0.1:8188/queue

# 0. BEFORE GENERATING (order matters, see §2 per-unit briefs):
#    - park any stale art from old attempts (§3.8)
#    - write the unit's WALK override + GEAR/GEAR_HOLD clauses (§2)
#    - check DESC for mid-gesture verbs ("drawing", "swinging")

$PY tools/pixel_fa.py master  <unit>                      # skip if present (all 12 are)
$PY tools/pixel_fa.py dirs    <unit> --pad 0.55 --only se,ne
# EYEBALL ORIENTATION on both stills before animating anything.
# Best-of-N applies here too — roll dirs seeds if a facing fails.

for d in se ne; do
  $PY tools/pixel_anim.py <unit> $d idle --pad 0.62        # seed idle, PADDED
  $PY tools/promote_rest_frame.py <unit> $d --medoid       # --medoid unless SYMMETRIC (slime!)
  # EYEBALL THE PROMOTED STILL (a promote can bake a turned tail)
  # best-of-N per motion — default first, then --seed 7, --seed 13:
  $PY tools/pixel_anim.py <unit> $d idle                   # NO --pad after promote
  $PY tools/pixel_anim.py <unit> $d walk
  $PY tools/pixel_anim.py <unit> $d attack
done
# deaths: check the promoted still's frame FILL first (§3.5) — promoted
# stills run ~0.5 and take NO pad; anything ≥~0.85 needs --pad 0.62
$PY tools/pixel_anim.py <unit> se death     # + seed rolls; compact-heap
$PY tools/pixel_anim.py <unit> ne death     #   winners have beaten sprawlers 3/3
# ⚠ REGENERATE EVERY WINNING TAKE LAST — the exporter reads the NEWEST 33
# frames per motion; a re-run with the winning seed restages byte-identically.
$PY tools/make_corpse.py <unit> se && $PY tools/make_corpse.py <unit> ne
$PY tools/export_to_game.py <unit>
$PY tools/accept.py <unit>                                 # gates first, then eyes
```

**Judging tools** (recreate in the session scratchpad; ~40 lines each, the
skeleton session is the worked example): `take_sheets.py` — labeled rows, one
take per row, every 3rd frame at 2×; `score_takes.py` — per take: h-range
(steadiness proxy), first→last height (seam), first→last width (limb drift),
edge-touching count at alpha>128.

**Review**: copy `public/mockups/skeleton-all-animations.html`, change
`UNIT`, open via `npm run dev` (never `file://`). For the user: extend the
roster-artifact builder (`build_roster_showcase.py` pattern — base64-embedded
strips, canvas players, motion switcher) — that's what they actually review,
and it's already caught three real bugs the gates missed.

## 2. Per-unit briefs

Prompt work needed before each unit's first generation. Every unit below
still **inherits the defective generic walk** ("does not travel across the
frame" — a negation, and lateral-only) and needs a `WALK[<unit>]` override
that states *same size, same distance* FIRST. The knight/orc/skeleton
entries are the templates.

### archer — DONE 2026-07-22 (⚠ not user-eyeballed; on the roster artifact)
What it taught, for the units still to come:
- **A mid-gesture DESC poisons everything downstream and the fix is the
  MASTER, not an edit.** "Drawing a longbow" seeded a full-draw master;
  8 dirs takes across 3 seeds either kept the draw or settled by DELETING
  the bow. A front-loaded edit lead (unarmed_lead pattern, now the empty
  `POSE_LEAD` in pixel_fa.py) also failed — its own verb re-summoned the
  gesture. Re-rolling the master from a rest-pose DESC fixed every still
  in one roll. Check DESC verbs BEFORE generating (lich/necromancer/
  fire_mage all hold staffs — fine; seraph "wings spread" is a pose, fine).
- **A LEFT-handed weapon breaks rear-facing aim, and the prompt is not the
  lever** — the rear draw physically crosses the body (the ogre depth-punch
  dead end; an aimed ATTACK_BY_FACING entry failed on 3 seeds). Fixed at
  export: `FACING_SWAP` in export_to_game.py ships flip(gen-ne) as ne and
  gen-ne as nw, so both rear diagonals aim the way the engine arrow flies.
  Sword units are immune (right-handed rear views strike screen-right).
- Winners + accepted blemishes recorded in SEED_BY_FACING + accept.py:
  attack steadiness FAILs stand on both facings (11px/9px, tall-bow travel,
  body-band verified); se attack bakes a 4-frame arrow-tip clip at the raw
  right edge (18-23). se idle/walk needed seed 42 (the house set all
  drifted); ne idle default is the steadiest clip of the roster (h-range 2).
- Deaths: 5 se seeds — only 42 folds compact (4/4 for compact-over-sprawl);
  ne 13. The corpse pair cut from those tails.
- **Walk-attack (shoot-on-the-move) considered and DECLINED** (user picked
  keep-the-mechanic, 2026-07-22): the sim's unit states are exclusive
  (moving XOR attacking), so a walking-attack strip has no state to bind
  to — adding one is a gameplay feature (skirmisher-style fire-while-
  moving) before it is an art task. Don't re-pitch as art; if it ever
  returns, it starts as an engine/balance design.
- **Walks took FOUR rolls** and left two reusable levers: (1) check the
  HEAD BAND on every loop candidate — a hood that turns away mid-loop
  reads as "looking around" and the steadiness gates can't see it (they
  actually reward understated gaits — a soft walk verb like "light
  nimble" gets laundered into a winner by the numbers); (2)
  `BEST_CYCLE_WALK` in export_to_game.py — per-unit opt-in that cuts the
  walk strip from the best-closing gait cycle (max first/last alpha-IoU,
  10-22 frame span) instead of the blind [head::step] sample. Took the
  archer's wraps from ~0.59 to 0.874/0.977. Consider opting new units in
  from the start; do NOT retro-apply to shipped units without a review.

### lich
- Robed, on "skeletal bone legs" — the robe hides most leg action. WALK:
  a stiff gliding stride, robe swaying, staff planted rhythmically — do
  not ask for knee action you can't see. The lich was the original idle
  reference ("only the robe and the magic move") — its idle should be easy.
- GEAR: crystal-topped staff — one side pin; the gold crown must survive
  the rear view (name it positively in the ne clause or it gets lost).
- ATTACK exists (staff raise + purple burst). Casters keep the body
  planted — expect steadiness to pass without drama.

### necromancer
- Same body plan as the lich (hooded robe + skull staff). The HOOD is the
  identity anchor: front views show shadowed void, rear views plain hood —
  make the ne GEAR clause carry the staff's skull so the facing reads.
- ATTACK exists (hand thrust + violet burst from the staff skull).

### fire_mage
- Robe + wide-brimmed hat + flame-orb staff. ATTACK exists (staff thrust,
  orb flare). The FLAME is constant motion — detail churn on the orb is
  expected and no gate measures it; judge flicker by eye and don't chase it.
- The hat brim widens the head — check the top-of-head FRAMING on stills
  (the dirs prompt already names the head, but the brim is the widest thing
  a still has carried yet).

### seraph
- **The wings are the whole problem.** Widest and tallest silhouette in the
  roster; both cell budgets at risk on every motion. WALK is already
  overridden (hover + wingbeats, positive-only — do not touch it blind).
- Wingbeats move mass ABOVE the body — steadiness will read the beat as
  height change (§3.9: judge on the body band). Expect documented
  exemptions rather than clean gates.
- Death of a hovering unit: it must first FALL — the generic text assumes
  standing. Propose a seraph DEATH entry to the user before building
  (crumple + wings folding over is the obvious shape; it's a choreography
  call, i.e. theirs).

### wolf (first non-humanoid — do NOT start here)
- `SCALE_OVERRIDE["wolf"] = 0.92` exists (quadruped mass sits low; the
  body proxy over-reads). accept.py thresholds are humanoid-measured —
  expect noisy verdicts and lean harder on eyes.
- A quadruped's se/ne are body-LENGTH views: the wolf is wider than tall.
  Check lateral fit on the stills before animating anything.
- WALK (trot, diagonal legs) and ATTACK (bite, positive-only) both exist.

### slime
- **SYMMETRIC — promote WITHOUT `--medoid`** (the one unit where the
  symmetry metric is correct).
- The hop IS a height change: the idle scale-lock and the walk's
  `evened_scales` would both CANCEL the squash-and-stretch. Expect
  export_to_game to need a per-unit carve-out (treat hop like a death:
  locked scale, let the pose breathe). Budget time for exporter surgery,
  not prompt surgery.
- No gear, no facing tells beyond the face — orientation eyeballs are
  nearly moot; the cheapest unit if the exporter cooperates.

### rune_golem
- `SCALE_OVERRIDE["rune_golem"] = 1.18` (boss class towers) — and the game
  layers `battleScale` on top; verify the product doesn't overflow the
  cell before generating all motions (one dirs still tells you).
- Ogre-shaped otherwise (heavy biped, punch attack, no gear). The ogre's
  entries are the templates; its punch survived every gate.

## 3. The traps (all still live, in cost order)

1. **cfg=1 makes negatives INERT — naming a failure summons it.** Removals
   are phrased as an *edit* ("the club has been taken away"), at the FRONT.
   Avoid the word "back" even anatomically — spine/heel/rear.
2. **The SEED FRAME beats the prompt.** WAN finishes whatever gesture the
   still implies. Fix at the seed: promote the settled tail, regenerate.
   Never re-pad a promoted frame (0.62² collapses it).
3. **Regeneration is deterministic on SEED** — a re-run is a byte-identical
   no-op. Corollary A: `--seed` to roll. Corollary B (NEW): **the exporter
   takes the newest 33 frames, so winning takes are restaged LAST.**
4. **Score takes on orientation AND read AND numbers — in that order.**
   Seeds 7 and 13 beat the orc's defaults on every gate *by turning
   frontal*; the skeleton's ne idles all drifted the same way until seed 42.
   When every take fails identically, the STILL or the SEED SET is the
   problem — widen seeds before touching prompts.
5. **`--pad` rules.** dirs at 0.55; seed idle at 0.62; post-promote clips
   NO pad; deaths by the still's measured frame FILL (non-white bbox):
   ~0.5 (promoted) ⇒ no pad, ≥~0.85 ⇒ `--pad 0.62`. The knight's 0.99-fill
   stills cropped EVERY motion at source — and the exported cells never
   touch an edge when that happens (the amputation is baked in). Sweep RAW
   frames for edge contact, not just the export.
6. **`GEAR_HOLD` rides on ATTACK too.** Hard-pin only OFF-hand gear (the
   knight's shield, the skeleton's buckler); the striking arm's implement
   gets chirality/screen-side only, or the rider fights the swing.
7. **Anchor: attacks are LOCKED to frame 0** (`force_anchor`, source
   coords) — a weapon carried low drags the bottom-mass centroid and the
   body slides while its feet stand still. `PER_FRAME_ANCHOR_ATTACK`
   (currently `{orc}`) opts out choreography that deliberately CARRIES the
   body; check which side of that line a new unit's attack falls on.
8. **Stale art from abandoned attempts sweeps into the export.** Check
   `pixel/dirs`, `pixel/anim`, AND the corpse gallery
   (`public/mockups/img/pixel/crisp` — corpses export from THERE) for the
   unit's name before first export; park in a `_stale_<unit>_<date>/`
   folder. The archer/lich/etc. may have leftovers from the pose era.
9. **Judge steadiness on the BODY, not the silhouette.** A raised weapon
   or a wingbeat counts as height. Bottom-60% body-span is the check;
   accepted weapon-travel failures are documented per-unit in accept.py
   comments and SEED_BY_FACING, never fixed by moving the limit.
10. **The still's pose invites completion in LOOPS too** — a raised blade
    drifts higher across an idle. Widen seeds first (skeleton ne: 42).
11. **A swing must stay VISIBLE (user rule, paid for twice).** "Away from
    the camera" in an attack = a hidden attack; route the arc down the
    weapon's own screen side even on rear facings, and bound the windup
    positively ("level with its own head") when the cell top is at risk.
12. **Browser verification:** warm the registry through `drawUnitSprite`
    (not `getPixelFrame` — different module instance via the `/src` vs `@/`
    import paths); hard-refresh after re-export (filenames are stable,
    `manifest.version` cache-keys but your own tab can be stale); gallery
    strips under `public/mockups/img/pixel/` are HALF-SCALE previews —
    measure `public/sprites/pixel/`. The preview pane suspends rAF —
    animated review happens on the artifact or on device, never by
    screenshot.

## 4. accept.py — current standing

Thresholds are the ogre's measured numbers. The stills gate accepts a
mirror-complete diagonal-4 set. `NO_EXTENSION_GATE` = `{"s", (knight,ne),
(knight,se)}` — extension is the wrong proxy for strikes aimed in depth or
arcing across the body; it takes (unit,facing) pairs. Standing accepted
FAILs (all weapon-travel/choreography, reasoning in SEED_BY_FACING +
accept.py comments): knight attack-ne 16px, orc attacks 25/21px + its se
idle 4px / walk -3px / ne-death boundary graze, skeleton attack-se 9px.
The gate CANNOT see whether a motion reads right, detail flicker, or
source-baked cropping (§3.5) — eyes close every unit.

## 5. Before shipping any of this

- Pipeline commits are LOCAL-ONLY on a third party's repo
  (`mor-o/comfyui-2d-character-pipeline`) — **NEVER PUSH**; latest is
  `22741e7` (skeleton). One disk failure from gone; re-home if it matters.
- `public/` in the game repo is untracked — four units' art (24 files
  each) has no history; an overwrite is unrecoverable.
- Delete or gitignore the `public/mockups/*-all-animations.html` harness
  pages you don't want deployed (they ship to Netlify), plus `src/dev/`
  harnesses from the icon batch.
- The game still FADES during death instead of playing the clip and
  holding the corpse (mocked on review pages, not in `src/`), and the ogre
  still has two corpse systems (pixel corpse vs `corpseArt.ts` "arms").
  Decide before ship or ticket them.
- Usual gate: `npm run typecheck && npm test && npm run build` (824
  tests), then the batch-PR flow in `WORKFLOW.md` — merges deploy.
