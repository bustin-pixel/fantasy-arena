# Handoff — the 22-unit batch is DONE; what remains is ship + polish

> ## ✅ MANDATE COMPLETE 2026-07-23 — all 22 deckable units + summons converted,
> all 8 legendary auras built. **36 units now have pixel art** (the original 12
> + these 24 + the bear). Everything below §0 is the accumulated recipe, kept
> for the NEXT batch; the round-4 result is summarised here and in
> `docs/pixel-batch-review-notes.md` (ROUND 4 section).
>
> **What got done (round 4):**
> - **8 legendary auras** — `AURA_BY_ID`+`drawAura` in `Renderer.ts`, verified
>   21/21 in `/mockups/aura-verify.html`. Two read live kit state (outlaw
>   `spreeTicks`, druid `transformed`).
> - **27 new bodies** converted + exported + gated (8 legendary, 9 epic, 5 rare,
>   5 summons: bear/turret/void_imp/slime_clone + mirror_image which ALIASES the
>   archmage's art). ZERO cropping FAILs across the roster; all accepted FAILs
>   logged in `accept.py` (2026-07-23 blocks).
> - **Game-side wiring** (`sprites.ts`, additive, determinism untouched): Bear
>   Form draws from `summoner_bear` strips (was forced procedural); mirror_image
>   borrows the archmage's strips at 0.95×/0.65α. Gate: typecheck + build +
>   **826 tests** green.
> - **Roster artifact republished** (same URL) with all 38 bodies, grouped by
>   rarity, motion switcher.
>
> **Reworks that were needed (all resolved) — lessons for next time:**
> - **`newest()` prefix collision**: `{stem}_*` matched name-suffixed siblings
>   (`summoner_*` → `summoner_bear_*`), so summoner's dirs came out a BEAR. Fixed
>   to `{stem}_[0-9]*` everywhere. Watch `slime`/`slime_knight`/`slime_clone` too.
> - **GEAR_HOLD must match the seeded still, not a rule**: masters place staves
>   on either side; hard screen-side pins fight the seed. Casters/bows/gun are
>   now chirality-only; only the sword knights (consistent stills) keep sides.
> - **Bows render an AIM pose** from "holding a bow" — needs "straight up and
>   down like a staff, other hand low" + master re-roll (archer trap again).
> - **Hooded units can bake a FACE via promote** (assassin did; rogue/trickster
>   didn't — a seed fluke). `IDLE[unit]` pins the void hood positively.
> - **Static objects grow a face** on the generic breath-idle (turret). They
>   need a motionless machine idle and NO promote.
> - **Wide quadruped attacks** (bear) fight uniform_fit — a paw-swipe extends
>   the already-wide body past the cell; keep the swipe on the arm's own screen
>   side (ne fits +0px) and hold body height (no crouch/rear).
>
> **Owed before ship (unchanged):** the ranged advance-fire WINRATE SWEEP
> (ranged units advance while firing — user-approved, no sweep run). Delete/
> gitignore the `*-all-animations.html` harnesses + `src/dev/`. Decide the
> death-fade-vs-corpse-hold question. Then the WORKFLOW.md batch-PR flow.

**Nothing is shipped.** `public/` is untracked (no history — an overwrite is
unrecoverable). Pipeline commits are LOCAL-ONLY on a THIRD PARTY's repo
(`mor-o/comfyui-2d-character-pipeline`) — **NEVER PUSH**; head is `de13a0f`
(round-4 pipeline edits are UNCOMMITTED working-tree changes).

---

## THE ORIGINAL MANDATE (now complete — kept for the recipe below)

---

## 0. THE MANDATE

Convert the **22 remaining deckable units**, and give **every legendary** a
themed engine-drawn visual effect in the spirit of the necromancer's violet
soul-wisps (user: *"keeping the legendary logic with cool themed visual
effects"*).

### 0.1 The queue (rarity order — legendaries first)

| # | unit id | rarity | name | notes for its kit/VFX |
|---|---|---|---|---|
| 1 | `aegis_knight` | legendary | Aegis Knight | magic-soak tank — shield/ward theme |
| 2 | `archmage` | legendary | Archmage | Grand Grimoire, random spell each cast |
| 3 | `engineer` | legendary | Engineer | builds `turret` (turret needs art too) |
| 4 | `hunter` | legendary | Hunter | ranged; pet/trap flavour |
| 5 | `mystic_archer` | legendary | Mystic Archer | ranged, arcane arrows |
| 6 | `outlaw` | legendary | Outlaw | dodge + Killing Spree ultimate |
| 7 | `slime_knight` | legendary | Slime Knight | dies into `slime_clone`s |
| 8 | `summoner` | legendary | **Druid** (id ≠ name!) | bear form — needs a 2nd body |
| 9 | `arcane_mage` | epic | Arcane Mage | |
| 10 | `assassin` | epic | Assassin | stealth |
| 11 | `berserker` | epic | Berserker | |
| 12 | `electric_mage` | epic | Electric Mage | |
| 13 | `holy_knight` | epic | Holy Knight | |
| 14 | `ice_mage` | epic | Ice Mage | |
| 15 | `priest` | epic | Priest | |
| 16 | `rogue` | epic | Rogue | stealth |
| 17 | `trickster` | epic | Trickster | spawns `mirror_image` |
| 18 | `healer` | rare | **Cleric** (id ≠ name!) | |
| 19 | `mage` | rare | Mage | |
| 20 | `ranger` | rare | Ranger | |
| 21 | `warlock` | rare | Warlock | spawns `void_imp` |
| 22 | `warrior` | rare | Warrior | |

Summons are NOT deckable and are out of scope unless their owner needs them
on screen: `turret` (engineer), `mirror_image` (trickster), `void_imp`
(warlock), `slime_clone` / `slime_squire` (slime knight), `bloatling`, `imp`.
`skeleton` / `wolf` / `boar` already have art.

### 0.2 Legendary VFX — the pattern to follow

The necromancer's aura is the reference implementation:
`AURA_BY_ID` + `drawAura()` in `src/engine/Renderer.ts:339`.

Rules it establishes, which every new legendary aura must keep:
- **Presentation-only.** The sim never reads it. Timing runs off
  `performance.now()`; per-uid phase (`uidPhase01`) so two copies of the
  same unit don't pulse in lockstep. Determinism is untouched.
- **Keyed by `defId`**, exactly like `corpseArt.ts` — no engine branches.
- **Two passes**: most of the effect behind the sprite, one faint element in
  front, so the unit stands *inside* the effect rather than under a sticker.
- **Suppressed when `state === "dead"`.**
- **Subtle at 80px.** Radial gradients, alpha ≤ 0.3 behind / ≤ 0.16 front.

Verify an aura the way the necromancer's was: render the SAME frozen
snapshot twice a few hundred ms apart and diff the pixels in a band around
the unit — the aura is the only thing that may differ. Measured for the
necromancer: 197 violet px animating vs **0** on a control unit.

Themed suggestions (confirm with the user before building — VFX is taste):
aegis_knight = slow rotating ward hexagons; archmage = orbiting rune glyphs
that change colour per spell; engineer = spark/steam puffs; hunter = drifting
leaf motes; mystic_archer = arcane fletching trail; outlaw = smoke curl that
thickens with Killing Spree stacks; slime_knight = dripping ooze; summoner =
pollen/fireflies, swapping to fur motes in bear form.

---

## 1. THE CONTRACT (unchanged, all 12 units follow it)

- **Diagonal-4**: generate `se` + `ne` only. `sw`/`nw` (corpse included) are
  mirrored at export; the game's `nearestFacingWithArt`
  (`src/assets/imageSprites.ts`) snaps s/e/n/w per state. A new unit needs
  **zero game-code changes** — `export_to_game.py` is the whole integration.
- **Cell 80×80, anchor (40,72), TARGET_BODY 26** (~45-48px humanoid).
- **Best-of-N, you pick, ONE result delivered.** House set = default +
  `--seed 7` + `--seed 13`; widen when all fail the same way. Judge
  **ORIENTATION → READ → NUMBERS**, in that order, always.
- Review vehicle: the **roster artifact** ("The diagonal-4 roster", same URL
  every time — find via Artifact `list`). Republish IN PLACE after each unit.
  `public/mockups/<unit>-all-animations.html` (copy an existing one, change
  `UNIT`) is the dev-server harness.

### 1.1 The runbook

```bash
PY="C:/Users/Justin/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ghost/ComfyUI/.venv/Scripts/python.exe"
cd C:/Users/Justin/Documents/comfyui-2d-character-pipeline
# ComfyUI headless (the Desktop app does NOT auto-start the server):
#   cd .../ghost/ComfyUI && .venv/Scripts/python.exe main.py --port 8188 \
#     --disable-auto-launch --reserve-vram 1 --enable-cors-header "*" \
#     --input-directory  .../ComfyUI-Shared/input \
#     --output-directory .../ComfyUI-Shared/output \
#     --extra-model-paths-config ".../shared_model_paths.yaml"
# boots in 1-5 min; poll  curl -s http://127.0.0.1:8188/queue
# ⚠ it dies silently — if a step returns "FAILED, no frames", check the queue.

# 0. BEFORE GENERATING:
#  a. Park stale art in ALL FOUR mirrors (pixel/dirs, pixel_raw/dirs,
#     pixel/anim, public/mockups/img/pixel/crisp) as _stale_<unit>_<date>/.
#     pixel_anim seeds from pixel_raw/dirs NEWEST-BY-MTIME.
#  b. READ THE DESC for mid-gesture verbs ("drawing", "casting"). A
#     mid-gesture DESC needs a mid-gesture MASTER re-roll — a dirs edit can
#     neither settle a gesture NOR add/remove held objects.
#  c. Write the unit's WALK override: "same size, same distance" FIRST, name
#     the gait STRONGLY, pin the HEAD and any free hand.
#  d. Check GEAR chirality: left-handed weapon ⇒ declare the unit in
#     export_to_game.FACING_SWAP (rear aim is unpromptable).
#  e. Add the unit to export_to_game.BEST_CYCLE_WALK.

$PY tools/pixel_fa.py master <unit>                    # ONLY if DESC changed
$PY tools/pixel_fa.py dirs   <unit> --pad 0.55 --only se,ne
# EYEBALL ORIENTATION on both stills. ne loves to win gates by turning
# frontal — reject those on sight.

for d in se ne; do
  $PY tools/pixel_anim.py <unit> $d idle --pad 0.62    # seed idle, PADDED
  $PY tools/promote_rest_frame.py <unit> $d --medoid   # --medoid unless SYMMETRIC
  # EYEBALL THE PROMOTED STILL — a promote can bake a turned tail or a face
  for m in idle walk attack; do                        # best-of-N per motion
    $PY tools/pixel_anim.py <unit> $d $m               # + --seed 7 / --seed 13
  done
done
$PY tools/pixel_anim.py <unit> se death   # deaths: check promoted-still FILL
$PY tools/pixel_anim.py <unit> ne death   # ~0.5 ⇒ no pad; >=0.85 ⇒ --pad 0.62
# RECORD winners in SEED_BY_FACING with one line of reasoning, then
# REGENERATE EVERY WINNER LAST (the exporter takes the NEWEST 33 frames;
# a re-run restages byte-identically on the recorded seed).
$PY tools/make_corpse.py <unit> se && $PY tools/make_corpse.py <unit> ne
$PY tools/export_to_game.py <unit>
$PY tools/accept.py <unit>                # gates first, THEN eyes
```

**Judging tools** live in the session scratchpad (~40 lines each; rebuild
them): a take-scorer (h-range / seam / w-drift / edge-frames per 33-frame
take), a contact-sheet builder (every 3rd frame, composited on a mid-grey —
NEVER on white, transparency hides everything), and a head-band cropper.
⚠ Composite on colour: `Image.new("RGBA", size, (140,190,140,255))` then
`alpha_composite`, or you will judge a white sprite on white.

---

## 2. WHAT ROUNDS 1-3 FIXED (the reviewed history)

Full per-unit detail — picks, accepted gate FAILs, and per-unit "eyeball
this" lists — is in **`docs/pixel-batch-review-notes.md`**. Summary:

### Round 1 — the six-unit batch (2026-07-22)
necromancer, fire_mage, seraph, wolf, slime, rune_golem converted in one run,
completing the 12. New levers: `DEATH_BY_FACING` (the seraph's rear death
left the body standing in a "wing-tent" on five seeds), `SQUASH_WALK` (the
slime's hop needs its height changes kept), plus muzzle-pinned wolf texts and
a repeating-hop slime walk text.

### Round 2 — user review fixes (2026-07-22)
- **Walk hitches** (golem/wolf se): fixed at the CUT via `BEAM_CYCLE_WALK`,
  not by re-rolling.
- **Seraph se walk "growing"**: two causes — its WALK text was the only one
  missing the front-loaded size pin, AND `evened_scales` was rescaling the
  body to cancel the wingbeat. Now exports through `SQUASH_WALK`.
- **Attacks re-choreographed**: necromancer + fire_mage to the lich's
  raise-and-burst on both facings; seraph se burst moved above the head;
  wolf se to a straight forward bite; golem ne to a full-extension punch.
- **Slime redesigned** (amorphous sinister blob, toxic core, no limbs) —
  needed `MASTER_BY_UNIT` because the shared master hard-codes "both legs
  and both feet planted" and duly grew legs on a limbless creature.
- **Archer walk** re-rolled with the bow nocked.
- **walk_attack** built end-to-end + **ranged advance-while-firing**
  (see §3).

### Round 3 — shading defects (2026-07-23)
- **"Shadows flickering light to dark."** A five-arm ablation through the
  real pipeline settled it. % of core pixels changing colour per frame:

  | arm | necro/se | necro/ne | skel/ne | orc/se | |
  |---|---|---|---|---|---|
  | baseline | 27.9 | 12.4 | 65.6 | 60.7 | |
  | matte frozen | 22.7 | 10.9 | 50.7 | 52.9 | −12…−23% |
  | global exposure matched | 27.7 | 12.5 | 66.0 | 61.1 | **~0%** |
  | temporal median | 22.6 | 9.4 | 56.5 | 53.5 | −12…−24% |
  | **shading frozen** | **6.8** | **3.8** | **18.9** | **21.1** | **−65…−76%** |

  NOT registration jitter (freezing the matte takes off-register frames
  7/7 → 0/7 and barely dents it), NOT exposure drift, NOT impulsive noise.
  WAN re-lights the interior every frame and the locked palette snaps those
  sub-step drifts across ramp boundaries in different places each frame.
  Fix: `IDLE_SHADING_DAMP` (idles only; alpha untouched so geometry is
  bit-identical). Roster mean idle churn **32.3% → 16.2%**.
- **"Fire mage cloak muddy."** `build_palette_from_seeds` gave EVERY seed the
  4-step `RAMP_ACCENT`, whose darkest step targets okL 0.30 — and the outline
  is the darkest tier-2 entry, so every unit's outline sat at okL ≈0.30 and
  any unit whose body mass lives there quantized ONTO ITS OWN OUTLINE. Fire
  mage: **59.4% of body pixels were the outline colour**. Fix: the PRIMARY
  seed now uses the 5-step `RAMP_MAIN` → 42.6%, chroma +27%.
- **"One side of the necro too dark."** His 8 clips were generated at
  exposures spanning **33.0–52.8 luma**, and his rear clips were **26–39%
  less saturated**. Fix: `FACING_L_LIFT` + `FACING_C_GAIN`, keyed by
  **(unit, facing, MOTION)**, applied to the source before the palette match
  (`l_lift` / `c_gain` args on `pixelize`). Gaps: idle −10.7→−3.4,
  walk +15.4→−0.4, attack +13.0→−0.2.
- **Necromancer re-palletted** with RAMP_MAIN (flattest tone 48.3%→29.5%).

---

## 3. GAME-SIDE STATE (round 2-3 added the first engine changes)

- **Ranged units ADVANCE WHILE FIRING.** `MovementSystem.ts` forward-advance
  gate now also allows `ranged && state === "attacking"` (melee unchanged).
  ⚠ **REAL GAMEPLAY CHANGE, user-approved. A WINRATE SWEEP IS STILL OWED** —
  ranged units got stronger and no sweep has been run. Do not run one
  unprompted (sweeps are a user decision), but raise it before shipping.
  Specs: `src/engine/__tests__/advanceFire.test.ts`.
- **`walk_attack` strip**, plumbed pipeline → export → manifest →
  `getPixelFrame` → `drawUnitSprite`. The Renderer can't read "attacking AND
  moving" off the sim's single state enum, so it watches per-uid POSITIONS
  with a sticky ~0.15s window (rAF outruns 20/s ticks; a raw per-frame
  compare flickers). Units without the art fall back to `attack`.
  **ARCHER ONLY so far — user-approved** ("exactly what i wanted").
  WALK_ATTACK texts are already written for necromancer / fire_mage / lich /
  seraph in `pixel_anim.py`, pending generation.
- **Necromancer aura** — see §0.2.
- Gate: `npm run typecheck && npm test && npm run build`. **826 tests.**

---

## 4. THE TRAPS (cost order — every one burned a session)

1. **cfg=1 makes negatives INERT — naming a failure summons it.** Removals
   are phrased as an *edit*, at the FRONT. Avoid "back" (use spine/rear);
   avoid draw/aim/spin/turn verbs entirely.
2. **The SEED FRAME beats the prompt.** WAN finishes whatever gesture the
   still implies. Fix at the seed; never re-pad a promoted frame.
3. **A dirs edit cannot ADD things.** New held objects / repositioned limbs
   are unreachable by edit — change the DESC and re-roll the master.
4. **Regeneration is deterministic on SEED + prompt + seed frame.** Any
   prompt or still change VOIDS a recorded seed — clear it and say why.
5. **The exporter takes the NEWEST 33 frames** — restage winners LAST.
6. **Gates reward the wrong things**: turning frontal wins steadiness; an
   understated gait wins the walk gates; a hidden swing wins extension.
7. **`--pad` rules**: dirs 0.55; seed idle 0.62; post-promote NO pad; deaths
   by measured frame FILL. Sweep RAW frames for edge contact.
8. **`GEAR_HOLD` rides on every motion except death** — hard-pin only
   OFF-hand gear; the striking implement gets chirality/screen-side only.
9. **Stale art sweeps into the export AND the anim seed** — park all four
   mirrors first.
10. **Attacks are LOCKED to frame 0** unless in `PER_FRAME_ANCHOR_ATTACK`.
11. **Rear aim / depth is an EXPORT problem** (`FACING_SWAP`), never a
    prompt problem.
12. **Naming a feature SUMMONS it on the facing that shouldn't have it.**
    The slime's "narrow glaring eyes" pins grew a FACE on its faceless rear;
    the lich's generic death grew FLESH on rear falls. Rear-facing text gets
    its own entry with zero face/flesh vocabulary
    (`IDLE_BY_FACING`, `WALK_BY_FACING`, `DEATH_BY_FACING`).
13. **A dark-bodied unit collides with its own outline.** Check
    `body == outline %` after any palette regeneration. ⚠ But the metric
    LIES once the body also has a strong mid-tone — the necromancer went
    16.6% → 38.2% and looked *better*. Judge on dominant-tone share +
    chroma + eyes.
14. **Palettes are CACHED** in `tools/palettes/<unit>.json` and only rebuild
    when deleted. That is the safety mechanism that let the fire mage be
    re-palletted while orc/knight re-exported **byte-identically** — verify
    that after any palette-code change.
15. **`l_lift` / `c_gain` are strongly NON-LINEAR near the dark end.**
    +0.058 okL took one clip 33.0 → 54.0; chroma gain amplifies ~1.25×
    through the quantizer. Calibrate by sweeping and re-measuring.
16. **Browser verification**: warm the registry through `drawUnitSprite`
    (not `getPixelFrame` — different module instance); hard-refresh after
    re-export; gallery strips are HALF-SCALE previews.
17. **Screenshots of the preview pane do not work here** (rAF suspended,
    screenshot times out). Verify canvas work by rendering to an offscreen
    canvas in page JS and measuring pixels, or on the artifact.

---

## 5. accept.py — standing accepted FAILs

Thresholds are the ogre's numbers. `NO_EXTENSION_GATE` covers vertical
attacks (`knight ne/se`, `wolf ne`, `slime ne`, `necromancer se`,
`fire_mage se/ne`). Documented accepted FAILs: weapon/VFX travel on
knight 16px, orc 25/21px, skeleton 9px, archer 11/9px, lich 17/13px,
necromancer 18/21px, fire_mage 16/32px, seraph 10/20px, wolf 16/14px,
golem attack size −9/−8px, slime's whole hop family, plus fire_mage idle-ne
flame flicker. **The gate cannot see read, flicker, head turns or baked
cropping — eyes close every unit.**

---

## 6. BEFORE SHIPPING ANY OF THIS

- Delete or gitignore the `public/mockups/*-all-animations.html` harness
  pages and `src/dev/` (they deploy to Netlify).
- The game still FADES during death instead of playing the clip and holding
  the corpse; the ogre still has two corpse systems (pixel corpse vs
  `corpseArt.ts` "arms"). Decide or ticket.
- **Owed: the ranged advance-fire winrate sweep** (§3).
- Usual gate, then the batch-PR flow in `WORKFLOW.md` — merges deploy, and
  the user decides when to merge.
