# Handoff — convert the BESTIARY (43 non-deckable monsters)

**State 2026-07-23.** The deckable roster is done (36 units have pixel art; see
`docs/pixel-next-unit-handoff.md` and the ROUND-4 section of
`docs/pixel-batch-review-notes.md`). This handoff is the **next batch**: the
dungeon monsters, bosses and summons that are NOT deckable cards.

**Read the deckable handoff first.** The whole recipe — the diagonal-4 contract,
the runbook, the 17 traps, best-of-N judging, accept.py, the family-builder
ATTACK/DEATH texts, the two skeleton fixes (`newest()` digit-glob, GEAR_HOLD
chirality) — carries over unchanged. This file only records **what is
different about monsters** plus the per-unit identities.

**Nothing is shipped.** `public/` is untracked. Pipeline commits are LOCAL-ONLY
on a THIRD PARTY's repo — **NEVER PUSH**.

---

## PROGRESS — batch started 2026-07-23

**Step 1 of §1.1 (cheap stills first) is DONE: all 43 identities are written.**

- **43 DESCs authored and injected** into `pixel_fa.py` (`DESC`, `UNITS`,
  `MASTER_BY_UNIT` — the module imports clean at 81 units / 81 DESCs / 27
  overrides). Each was written from a read of that monster's real `draw*`
  function in `src/assets/sprites.ts`, **not** from the §4.1 blocks below —
  those are truncated mid-sentence with `…` and are a summary, not a spec.
- **23 master overrides** written for the non-biped body plans, including the
  three that had no precedent: floating wisps, hovering legless shades, and
  the eight-legged spider.
- **Full record: `docs/pixel/bestiary-descs.json`** — per unit: the shipped
  desc, the pre-audit original, body plan, material, gear + hands, master
  override, confidence, author notes, and the game facts (`moveSpeed`,
  `ranged`, `battleScale`). Read it before generating anything.
- Every DESC was trap-audited, then re-scanned by hand. **9 real defects were
  found and fixed**; 2 flags were false positives (`abomination`'s "ribs on
  one side" is anatomy; `knife_thrower`'s "throwing knife" is a noun).
- No stale art existed for any of the 43, so trap 9 did not apply.

### New traps this batch surfaced

- **`-less` and `un-` adjectives are R2 negations in disguise.** "bodiless",
  "hairless", "unbroken" all read as *without X* — inert at cfg=1, and the
  named noun gets summoned. "bodiless mote" invites a torso onto a wisp;
  "hairless tail" grows fur on the one part of a rat that must stay bare.
  State it positively: *its whole form is the energy star*, *a scaly ringed
  tail*, *one smooth continuous shell*.
- **"where a face would be" is a counterfactual negation** — it names `face`
  and the cowl renders one. Say what IS there: *filled with solid black
  shadow*.
- **One-sided highlights fight the prompt AND the exporter.** A sheen pinned
  "high on its upper left" contradicts the master's own *"flat even overhead
  light, identical on the left and right"* in the same prompt, so the model
  invents a side light. Worse, the diagonals are **mirrored at export**, so
  the highlight flips between facings and reads as the sprite popping. Put
  highlights on the **crown**, which survives mirroring.
- **"walking staff" leaks a locomotion token.** The proven anti-aim idiom is
  "straight up and down **like a tall staff**". At cfg=1 the text encoder does
  not respect the compound-noun boundary, so "walking" bleeds into pose and
  invites a mid-stride master — which then seeds every derived clip.
- **The shipped slime master carries a latent negation**: `"...sitting flat on
  the ground with nothing beneath it"`. `slime`/`slime_clone` shipped fine
  anyway, so it is not worth a re-roll, but the three new blobs (bloater,
  bloatling, slime_squire) were given a positive contact clause instead —
  *"its underside spread flat and fully in contact with the ground"*.
- **`void_imp` (shipped) uses "cupping a small orange coal-flame in one hand"**
  — an active hand gesture. The new red `imp` deliberately says *"resting in
  one open palm"* instead. The two are the same rig, so expect a slightly
  different hand pose between them; that is fine (they differ in colour and
  scale by design) but do not "fix" one to match the other by accident.

### Also corrected against the unit data

- `spore_pod` is **not** static — see §2.2. Every one of the 43 moves.
- The owed winrate sweep touches **15** ranged monsters, not 3 — see §5.
- More id ≠ name cases for the engine-keys-off-id rule: `slime_squire` shows
  as **"Slime Blob"**, `cultist` as "Vault Cultist", `sentry` as "Forge
  Sentry", `fallen_seraph` as "Seraphiel the Forsworn", plus the three
  "The …" legendaries (penitent / bandit_king / silencer).

### Masters reviewed + two re-rolled (2026-07-23)

All 43 masters generated and eyeballed at full size (a 200px contact sheet
falsely flattened the quadrupeds — checked against the shipped wolf/bear, they
are fine). User triaged the flagged set:

- **`light_wisp` — RE-ROLLED.** v1 grew a smiling face + a crown. Root cause:
  "orb of light + rays" reads as a cartoon sun-face, and **"crown" was in the
  DESC *and* the master override**, summoning a literal crown from two places
  at cfg=1. v2 removes "crown"/"orb" and states the surface as one uniform
  blaze; shipped on the **default seed** (seeds 7 and 13 both regressed a
  face). v1 + losing seeds parked under `master/_reroll_*`.
- **`eclipse_herald` — RE-ROLLED.** v1 was a chibi anime angel girl (blonde
  hair, pink cheeks, bare feet) on "a serene head of pale light". v2 pushes
  solemn/adult: the head is a smooth mask of light (eyes only, no hair), the
  robe reaches the ground, "halo-crown" → "crescent above its brow". Shipped
  on the default seed; reads its legendary tier now.
- **`animated_armor` — KEPT** (user: "the knight is fine"). The floating-helm
  gap never rendered so it reads as an ordinary knight, but that is accepted.
  If ever revisited it needs the gap named first AND its own master override
  (the shared "both feet planted" fought the hollow suit).

Two new pipeline lessons, folded into §2/§4 thinking: **a landmark word can
seed from the override as well as the DESC** (check both when a feature won't
die), and **"a serene head of pale light" on a small figure reads as a cute
child** — legendaries need "tall/solemn/austere" + a masked (not serene) face.

**Second review round — all resolved (2026-07-23):**

- **`eclipse_warden` — RE-ROLLED.** v1 had a gold arrow nocked and streaking
  off the "bow of light" (the archer prior adds an arrow even when the text
  asks for none). v2 carries the bow upright like a staff, string slack, no
  arrow named anywhere. Default seed.
- **`knife_thrower` — RE-ROLLED.** v1 held a big green machete with no readable
  bandolier. v2 gives him a small throwing knife (blade no longer than his
  hand) and a bandolier lined with a visible row of knives. Seed 13.
- **`cutpurse` — RE-ROLLED.** v1 was a chibi mascot (big head, huge round
  eyes) — the word "small" plus a bare cute face drove it. v2 is a lean adult
  of normal build with a hard stubbled masked face. Default seed.
- **`penitent` — KEPT** (user: "I like the penitent"). Skull face stays.

**Third review round — the base fix (2026-07-23):**

- **`wildheart` — RE-ROLLED.** v1 sat on a solid isometric grass PLATFORM that
  survived background removal. Cause: "roots planted flat **on the ground**" in
  the DESC *and* "roots that all reach **the ground** and stand flat on it" in
  the master override — naming "the ground" in a BODY clause draws a literal
  ground disc at cfg=1. v2 reframes them as "root-feet that curl outward", no
  ground named. Confirmed clean on a magenta composite (b-ratio 0.78 → 0.41).
- **`spore_pod` — RE-ROLLED** (same fix, applied proactively — it had the
  identical grass-patch base; b 0.68 → 0.22). The user only flagged wildheart,
  but "should be a straight png background" is a standard, so both got fixed.

I composited **all 43** on magenta to be sure: wildheart and spore_pod were the
ONLY two with an opaque ground platform. The clean rooted units (dryad,
elder_treant) had already dodged it by calling their roots "root-feet" /
"root-claw legs" — never "on the ground". That is the rule.

**Fourth review round — the imp is a recolor, not a generation (2026-07-23):**

- **`imp` — RECOLOURED, not generated.** User: *"I want the imp flying and it
  should basically mirror the warlock's summon but just a color change."* The
  generated master was a big grounded red devil — nothing like the small winged
  `void_imp`. imp now ships as a **crimson recolor of void_imp's shipped
  strips**: `tools/recolor_imp.py (pipeline)` does a hue-wedge remap (body maroon →
  crimson; the orange flame, gold eyes and near-black wings sit in other hue
  wedges and pass through untouched), writes `imp_*.png` (all 24 strips), and
  clones void_imp's manifest entry with the filenames swapped. Because void_imp
  reads as a small winged flyer, imp inherits the flying pose for free.
  **Verified in-game** (dev server, offscreen render): imp draws from pixel art,
  identical 1205px silhouette to void_imp, ~9× more bright-crimson pixels. The
  big-devil master is parked; `imp`'s pixel_fa DESC now carries a ⚠ note that it
  is a recolor — **do NOT `export_to_game.py imp`** (there are no imp dirs/anim).
  This is the mirror_image/bear reuse pattern plus a recolor; re-run the script
  if void_imp is ever regenerated.

**Fifth review round — the blobs go eyeless (2026-07-23):**

- **`bloatling`, `slime_squire`, `bloater` — RE-ROLLED EYELESS** (user: *"can we
  remove the eyes"*). Eye vocabulary was **deleted** from the DESC *and* from
  each master override's camera clause (*"its front and its two dot eyes still
  read clearly"* → *"its glossy domed surface"*) — the light_wisp lesson again:
  a landmark seeds from the override as readily as the DESC. Nothing is
  negated: at cfg=1 *"no eyes"* summons eyes, and *"eyeless"/"featureless"* are
  `-less` negations that do the same. The eye clause is simply gone and the
  dome was given real surface detail (highlight, core, gel skin) to read
  instead. ⚠ The shipped deckable **`slime`/`slime_clone` KEEP their eyes** —
  only these three monsters are eyeless, which is a deliberate split.
- **Best-of-N was what actually closed it, not the prompt.** Even with every
  trace of eye vocabulary removed, the blob prior regrew features on several
  seeds: `bloatling` seed 7 regrew dot eyes; `slime_squire` regrew eyes **and a
  mouth** on default and a face on seed 13 (seed **7** was the only clean roll
  of three); `bloater` seed 13 grew a ground base. Winners: bloatling default,
  slime_squire **seed 7**, bloater default.

Net: **13 of the 43 masters were touched by review — 10 re-rolled, 1 recoloured
from another unit, 2 kept as-is by user call. The other 30 passed the eyeball
unchanged.** All masters done.
Three lasting lessons: **"small" summons a chibi** (say "lean adult, normal
build"); **"bow of light" summons an arrow** (name the bow carried/at-rest,
slack string, no arrow or quiver); and **naming "the ground" in a body clause
draws a ground platform that survives bg-removal** — describe roots/feet as
themselves, never their contact with a ground.

### Decisions still open

- **Legendary-monster auras (§2.6)** — asked, not yet answered by the user.
  Nothing is blocked: auras are game-side work that comes after the sprites.
- The pixel-corpse vs `corpseArt` decal question (§3) is still undecided.

---

## 0. THE MANDATE

Convert the **43 bestiary non-deckable units** to diagonal-4 pixel sprites, the
same contract as the deckables. These populate the 9 dungeon tiers (The Depths +
8 themed dungeons). 8 already have art (`wolf, skeleton, slime, lich, rune_golem,
slime_clone, turret, void_imp`) and `mirror_image` aliases the archmage — those
are DONE and out of scope.

### 0.1 The queue, by dungeon tier

Bosses render **2.1× in battle** (the game applies `def.battleScale` at draw
time — see §3). "gift" = the tier's legendary. ✅ = already has art.

| tier | fodder (rare) | epic | BOSS (2.1×) | legendary "gift" |
|---|---|---|---|---|
| **The Depths** | giant_rat, zombie_shambler | bloater (2.1×) | (abomination↓) | slime ✅ |
| **Bonefields** (undead) | skeleton_archer, ghoul | bonecaller | **abomination** | lich ✅ |
| **The Wilds** (beast) | dire_wolf, razorback, grizzly | — | **dire_alpha** | apex_beast |
| **Sealed Vault** (arcane) | arcane_wisp, imp, cultist | — | rune_golem ✅ | (archmage — deckable) |
| **Overgrowth** (nature) | thornbeast, spore_pod | dryad | **elder_treant** | wildheart |
| **Eclipse Spire** (celestial) | light_wisp, shadow_wraith, eclipse_acolyte | — | **eclipse_warden** | eclipse_herald |
| **Deep Forge** (construct) | clockwork_spider, sentry, animated_armor | — | **forge_golem** | ancient_automaton |
| **Fallen Cathedral** (desecrated) | heretic_zealot, gargoyle, grave_chorister | — | **fallen_seraph** | penitent |
| **Rogue's Den** (thieves) | cutpurse, knife_thrower, den_bruiser | — | **bandit_king** | silencer |
| **Summons** | boar, bloatling, slime_squire | — | — | — |

**7 dungeon bosses to convert**: abomination, dire_alpha, elder_treant,
eclipse_warden, forge_golem, fallen_seraph, bandit_king (rune_golem, the Vault
boss, is done) — **plus bloater**, an epic that also renders 2.1×, so **8 units
need boss-scale eyeballing** (§4.0, §2.3).
**6 legendary monsters**: apex_beast, wildheart, eclipse_herald,
ancient_automaton, penitent, silencer.

### 0.2 Suggested batch order (body-plan grouped, so texts amortise)

Do a whole **body-plan family** at once — one MASTER_BY_UNIT / gait / DEATH
template serves the group (exactly how the deckable knights/casters/rogues
amortised):

1. **Humanoids** (standard rig — most of the roster): zombie_shambler, ghoul,
   bonecaller, cultist, dryad, eclipse_acolyte, heretic_zealot, grave_chorister,
   cutpurse, knife_thrower, den_bruiser, animated_armor, skeleton_archer,
   sentry(?), abomination, eclipse_warden, bandit_king, silencer, penitent,
   wildheart, eclipse_herald, ancient_automaton, imp. → reuse the deckable
   sword/caster/rogue/bow builders; material-name the deaths (§2).
2. **Quadruped beasts** (wolf/bear precedent — muzzle-pinned idle/walk, beast
   trot, beast-curl death): boar, giant_rat, dire_wolf, razorback, grizzly,
   dire_alpha, apex_beast, thornbeast.
3. **Amorphous blobs** (slime precedent — MASTER_BY_UNIT, SQUASH_WALK hop,
   melt death): bloatling, slime_squire, bloater.
4. **Floating wisps** (NEW body plan — a hover with NO legs, like the seraph's
   hover but bodiless): arcane_wisp, light_wisp, shadow_wraith.
5. **Rooted / static** — spore_pod. ⚠ It still **moves** (`moveSpeed 24`), so
   it is NOT the turret; it needs a walk and a promote. See §2.2.
6. **Special rigs** (one-offs, hardest — do last): clockwork_spider (8 legs),
   forge_golem (molten colossus, boss), elder_treant (tree, boss),
   gargoyle (winged, uses `variantOf` — see §3), fallen_seraph (winged, boss).

---

## 1. THE RECIPE (inherited — see the deckable handoff §1-§2)

No changes. `pixel_fa.DESC` + optional `MASTER_BY_UNIT` + `WALK`/`IDLE`/`ATTACK`/
`DEATH` overrides + `GEAR`/`GEAR_HOLD` + export registrations
(`BEST_CYCLE_WALK`, `SQUASH_WALK`). Add each unit to `pixel_fa.UNITS`. Run the
diagonal-4 runbook (master → dirs se,ne → promote → idle/walk/attack → deaths →
corpse → export → accept), best-of-N, judge orientation→read→numbers.

The family-builder ATTACK/DEATH functions in `pixel_anim.py`
(`_sword_swing`, `_staff_burst`, `_dual_slash`, `_bow_loose`, `_robe_heap`,
`_armour_heap`, `_beast_curl`, `_crumble`, …) are already written — reuse them.

### 1.1 The one cheap-stills-first insight that paid off

Generate **all masters + dirs first** (cheap, ~40s each), eyeball ORIENTATION
across the whole batch, fix DESCs, THEN spend GPU on clips. On the deckable
batch this caught the bear-name collision, the aiming bows, and a rear-collapse
before a single expensive clip was wasted. Do the same here.

---

## 2. WHAT IS DIFFERENT ABOUT MONSTERS

### 2.1 MATERIAL-NAMED DEATHS ARE MANDATORY, NOT OPTIONAL

The deckable lesson (a rear-facing fall grows human FLESH unless the material is
named) is FAR sharper for monsters, because most of them are explicitly NOT
human: bone, rotting flesh, stone, molten metal, ooze, shadow, light, wood,
fur. **Every** monster DEATH must name its material (`_robe_heap`/`_crumble`
already take a material/rear arg — use it). Undead especially: a skeleton_archer
or ghoul falling must stay BONE / rotted, never sprout a living face.

### 2.2 New body plans (no deckable precedent)

- **Floating wisps** (arcane_wisp, light_wisp, shadow_wraith): a bodiless
  glowing mote/shade that HOVERS — no legs, no walk gait. Model like the
  seraph's hover (idle = a bob, "walk" = drift in place, NO stepping). They may
  need a `MASTER_BY_UNIT` ("a floating orb of X, no body, no legs"). Their
  "death" is a fade/dissipate, not a fall — consider a shrink-and-scatter DEATH.
- **Rooted plant** (spore_pod): ⚠ **CORRECTED 2026-07-23 — it is NOT static.**
  Its def is `moveSpeed: 24` (*"barely creeps"*) against the turret's
  `moveSpeed: 0`, and its range is `MELEE`, not a ranged spore burst. So the
  turret precedent does **not** apply: it needs a real walk cycle (a slow
  rooted creep — the root prongs shuffling, the cap staying level) and it does
  get a promote. Checked against the data for the whole queue: **every one of
  the 43 has `moveSpeed > 0`**, so no unit in this batch skips the walk.
- **Spider** (clockwork_spider): 8 legs — the hardest rig. The master must name
  "eight legs" or WAN draws a humanoid. Its gait is a skitter (all legs),
  muzzle/head pinned; likely needs a bespoke WALK.

### 2.3 Bosses generate at NORMAL size

The 7 bosses are drawn at the same TARGET_BODY as everyone else; the GAME scales
them 2.1× at render (`bossScale = def.battleScale` in `drawUnitSprite`). So **do
not** upscale the art, and accept.py measures them at normal size like any unit.
BUT: eyeball each boss AT 2.1× — a blemish invisible at 46px is glaring at 96px
(the `boss-size` harness / battleScale note). The rune_golem was the deckable
precedent (its `SCALE_OVERRIDE 1.18` is a DIFFERENT lever — a per-unit
generation-size tweak, not battleScale; most bosses won't need it).

### 2.4 variantOf bodies (gargoyle)

The gargoyle draws two uid-parity variants (`variantOf(unit.uid)` picks body A/B
by uid). Decide whether both variants need distinct art or one strip serves both
(the pixel path keys on `defId`, not variant — so ONE strip is served to both
unless the game is taught otherwise). Simplest: one gargoyle strip for both;
note the loss.

### 2.5 Summons keep their owner in view

boar/bloatling/slime_squire/imp are spawned mid-fight. They render beside their
summoner, so convert them or the owner fights beside procedural pets (the
mixed-look problem). `imp` is the Sealed Vault's own monster AND polymorph-fair
(distinct from the Warlock's `void_imp`, already done) — give it its own art.

### 2.6 Optional: legendary-monster auras

The deckable legendaries each got a themed engine aura (`AURA_BY_ID` in
`Renderer.ts`). The 6 legendary MONSTERS (apex_beast, wildheart, eclipse_herald,
ancient_automaton, penitent, silencer) could get the same treatment — but that
is a design call, NOT assumed. **Ask the user** before building monster auras;
the mandate here is the sprites.

---

## 3. GAME-SIDE — mostly free

Monsters use the SAME `imageSprites` registry + `drawUnitSprite` pixel path as
deckables. Adding one = run `export_to_game.py`, no game code — with two things
to confirm:

- **Corpse decals**: monsters have themed corpses in `corpseArt.ts` (bones,
  ooze, rubble, ash). The pixel death now ships a `corpse` frame too, so there
  are TWO corpse systems again (the deckable ogre had this exact unresolved
  tension). Decide per-tier whether the pixel corpse replaces the `corpseArt`
  decal or they coexist — the same open question the deckable handoff flagged.
- **Boss VFX overlays** in `Renderer.ts` scale with `bossScaleOf(u)` and ride
  the raised body centre — verify they still sit right over the pixel boss body.

Determinism is untouched (all presentation, defId-keyed, per-uid phase).

---

## 4. PER-UNIT VISUAL IDENTITIES

*(Extracted from each monster's procedural draw function — silhouette, palette,
props, BODY PLAN, MATERIAL. Filled in below by the inventory pass 2026-07-23.)*

### 4.0 REUSE MAP — many monsters are RECOLORS of converted bodies

The single biggest planning lever: a large share of the roster shares a draw
function with a unit that ALREADY has pixel art, so its DESC is a recolor of a
proven one and it inherits that unit'''s WALK/ATTACK/DEATH template.

| shared body (done) | monsters that reuse it | what changes |
|---|---|---|
| **drawSlime** (slime, slime_clone) | bloater (2.1x), bloatling, slime_squire | colour + scale; hop/melt as slime |
| **drawImp** (void_imp) | imp (Vault) | recolour blue->RED; same fiend rig |
| **drawHealer** (healer/Cleric, priest) | fallen_seraph (2.1x boss), penitent | Cleric robe body + CHARRED WINGS + broken halo |
| **outlaw** (hooded dual-wield) | silencer | recolour to near-black + red eyes |
| **wolf / bear (summoner_bear) quadruped rig** | dire_wolf, dire_alpha (boss), grizzly, apex_beast, boar, razorback, thornbeast, giant_rat | muzzle-pinned trot + beast-curl death, per-beast head/crest |
| **robed-caster cone** (mage/necromancer) | cultist, eclipse_acolyte, bonecaller, heretic_zealot | robe recolour + each unit'''s sigil/prop |

So of 43, roughly **20 are recolors/reskins** of an existing body (fast), and
~23 need fresh masters. The two winged angels (fallen_seraph + penitent) are the
same Cleric-body-plus-wings composition — build the wings ONCE.

WARNING **8 units render 2.1x in battle** (eyeball at scale, section 2.3):
bloater, abomination, dire_alpha, elder_treant, eclipse_warden, forge_golem,
fallen_seraph, bandit_king. (rune_golem, the 9th, is done.)


### 4.1 Per-unit identities

### Summons
- **boar** — *quadruped*, made of fur-and-flesh living beast
  - SILH: A low, horizontal war-boar seen in profile — a fat barrel body riding on four short hooved legs, with a heavy raised shoulder hump at the front that lifts the neck/head above the rump. A jagged mohawk of spiky bristles runs along the whole spine. The head sits low and forward with a blunt snout, angry brow, and two forward-jutting tusks;…
  - HEAD: none — bare animal head; a small dark triangular ear and the spiny bristle ridge are the …
  - KEY: Heavy front shoulder hump (front-high, rump-low profile) · Jagged mohawk bristle ridge running the length of the spine · Two forward tusks — one large fore tusk plus a smaller rear… · Blunt snout with two dark nostril dots and an angry down-sl…
  - PAL: #6b4423=body — boar brown (Un… · #936c4b=light — lighter brown… · #3e1700=dark — deep brown (wi… · #754e2d=snout — mid brown (wi…
- **bloatling** [shares drawSlime — same procedural blob function used by `slime` and by its parent `bloater` (bloater at 1.2x, bloatling at 0.85x); only the def color/accent and scale differ, no dedicated draw fn of its own] — *amorphous-blob*, made of ooze / gelatinous slime
  - SILH: A small, single-mass gelatinous blob: a rounded gooey dome with a wobbly, slightly scalloped base — no head, neck, arms or legs, just one squat pus-green droplet of ooze. Two tiny black dot eyes sit near the top-center and a glossy white highlight rides the upper-left; a soft yellow-green glow pulses in its belly. Drawn at 0.85x (a shrun…
  - HEAD: none
  - KEY: single pus-green gelatinous dome blob (no limbs, no head) · wobbly / faintly scalloped bottom edge where it meets the g… · glossy white highlight ellipse on the upper-left of the dome · two small black dot eyes with white shine, set high and cen…
  - PAL: #8a9a3b=body base — pus/sickl… · #c2d165=lightened top of the … · #d4e157=accent — bright yello… · #ffffff=glossy highlight patc…
- **slime_squire** [shares drawSlime (shared with `slime` and `slime_clone`; this unit is drawn by the same function at 0.6 scale)] — *amorphous-blob*, made of translucent green ooze / gelatin slime
  - SILH: A tiny, lone gelatinous blob — a rounded dome that is wider at the base and pinches inward at the top, with a wobbly scalloped bottom edge where it meets the ground. Drawn at 0.6 scale via the shared drawSlime, so it reads as a small droplet roughly two-thirds the size of a full slime. Two small black dot eyes with white shine sit near t…
  - HEAD: none — despite the "Squire" id, no helmet, armor, or crown is drawn; it is a bare glob
  - KEY: rounded gelatinous dome shape, wider at the bottom with a w… · two small black dot eyes with tiny white shine, set near th… · translucent emerald-green slime body with a top-to-bottom l… · soft glowing pale-mint inner core visible through the goo
  - PAL: #3ec46f=body — emerald slime … · #7edb9c=light green top of th… · #c9f9d8=accent — pale mint, t… · #ffffff=glossy highlight blob…

### The Depths
- **giant_rat** — *quadruped*, made of fur
  - SILH: A low, ground-hugging quadruped rat, drawn small (rendered at 0.75 scale) so it reads as tiny vermin. A fat horizontal teardrop body sits close to the earth, tapering forward through a rounded head into a pointed snout; two big round mouse-like ears sit atop the head, and a long thin hairless tail curls up and behind the rump. At 45px th…
  - HEAD: bare — no helm or crown; two large round mouse-ears (dark-fur outer, pink #f4a8a8 inner) …
  - KEY: Two big round ears with pink insides atop the head · Long thin hairless pink tail (segmented ticks) curling up b… · Pointed snout with a dark nose and a single off-white buck … · Low, fat teardrop body hugging the ground, mangy brown-grey…
  - PAL: #6d5c4d=body — mangy brown-gr… · #f4a8a8=accent — pink ear-int… · #c88f8f=deep pink (accent sha… · #5a4b3e=darker fur — mange pa…
- **zombie_shambler** — *humanoid (bipedal), but it BREAKS the upright feet-…*, made of rotting flesh over bone
  - SILH: A bipedal humanoid corpse locked in a permanent heavy forward hunch (the whole body is drawn tilted ~4-7 degrees forward). A rounded rot-green torso over a dark torn-trouser block for legs, a small tilted skull-head slung low and forward, and two thin tapered arms that end in splayed bony fingers — one hangs limp at the side, the other r…
  - HEAD: bare — no helm or hood; a cracked bare skull-head, tilted, with a fracture line running u…
  - KEY: Tilted skull head slung low: slack hanging lower jaw with a… · Rot-green decayed flesh body, permanently hunched sharply f… · Thin tapered arms ending in 3 splayed bony/clawed fingers —… · Tattered clothing: torn shirt with a jagged zigzag hem + to…
  - PAL: #7a8f6a=body — rot-green deca… · #c9d1c0=accent (def.accent) —… · #a8bc98=light (body lightened… · #414b3a=dark (body shaded ~-4…
- **bloater** 🔴BOSS [shares drawSlime (the generic slime body; also used by slime, slimeling, and bloatling — bloater is drawSlime at internal scale 1.2)] — *amorphous-blob*, made of goo / ooze
  - SILH: A single amorphous gelatinous blob: a rounded translucent dome that bulges wide at the base with a soft wobbly/scalloped bottom edge sitting flush on the ground — no head, neck, arms, or legs. Two small black dot eyes with white shine sit high on the front, a bright lime inner core glows through the ooze, and a glossy white highlight cat…
  - HEAD: none
  - KEY: rounded gel-dome blob silhouette with a wobbly/scalloped bo… · translucent pus/olive-green body (#8a9a3b) shaded lighter a… · bright lime-green glowing inner core (#d4e157) visible thro… · two small black dot eyes with tiny white shine set high on …
  - PAL: #8a9a3b=body base — pus/olive… · #b2c263=body light — lighter … · #d4e157=accent — glowing lime… · #1a1a1a=eyes — two small near…

### Bonefields (undead)
- **skeleton_archer** — *humanoid*, made of bone
  - SILH: A bare bipedal skeleton standing in an archer's stance, drawing a bone recurve bow held out to its right (the target side). Roughly human proportions but stripped to the bone — a domed skull, visible spine and four rib pairs, a knobbed pelvis, and thin two-segment bone limbs. One arm reaches forward gripping the bow, the other is bent ba…
  - HEAD: bare — a naked bone skull, no helm or hood; hollow eye sockets glow cold blue (#9bd0ff), … | GEAR: bone recurve bow wi…(left); nocked arrow (drawn…(right); quiver of arrows(worn)
  - KEY: bare bone skeleton — no flesh, skin, or robes; exposed spin… · skull with glowing cold-blue eye sockets and a slack hangin… · bone recurve bow held out front, drawn, with a nocked arrow… · quiver of cold-blue-fletched arrows slung over the shoulder…
  - PAL: #e7e5e4=bone white — skull, r… · #c8c6c2=bone shade — jaw unde… · #9bd0ff=cold-blue accent — gl… · #cfc7b2=bone recurve bow limb
- **ghoul** — *humanoid (bipedal) but broken from the standard rig…*, made of rotting undead flesh over a starved ske…
  - SILH: A hunched, forward-leaning undead humanoid frozen mid-lunge. It crouches low on two bent, splayed legs, torso pitched forward, with both long arms stretched out ahead reaching for prey and a gaunt head thrust forward off the shoulders. The read at 45px is a starved, stooped biped clawing forward — not an upright person. Faces right/forwa…
  - HEAD: none — bare, gaunt skull-like head with a jutting dark brow spike/ridge; no helm, hood, o…
  - KEY: Hunched, forward-pitched crouch on bent, splayed legs — a l… · Both long arms reaching forward with three hooked jaundiced… · Thrust-forward gaunt head with a wide gaping fanged maw (bo… · Grave-rot grey-green emaciated torso with visible starved r…
  - PAL: 
- **bonecaller** — *humanoid(robed)*, made of bone-and-cloth undead: bare skull + ske…
  - SILH: A short, rooted humanoid caster hidden inside a bell-shaped grave-robe that flares to a ragged zig-zag hem at the ground — no legs or feet show, the robe silhouette is a solid triangle/bell. A pointed drooping hood caps the head; a small bone-white skull sits in the hood's shadow with two square violet eye-glints. One thin skeletal arm j…
  - HEAD: pointed dark indigo-violet hood (peaked, draping to the shoulders), skull face recessed i…
  - KEY: Hooded, bell-shaped violet grave-robe with a ragged saw-too… · Bone-white skull face in the hood shadow with two glowing v… · One raised skeletal bone arm ending in splayed finger-bone … · A small floating skull rising above the raised hand, ringed…
  - PAL: #4b3f6b=violet grave-robe bod… · #736793=lighter lavender-grey… · #1e123e=very dark indigo-viol… · #2d214d=dark inner robe fold …
- **abomination** 🔴BOSS — *humanoid*, made of rotting reanimated grey-green flesh sti…
  - SILH: A hulking, hunched, asymmetric stitched corpse-giant — a boss that towers over rank-and-file (battleScale 2.1, and the sprite adds another 1.25x). Its mass is a lopsided torso slung between two MISMATCHED legs (a slim left, a bulkier stitched-on right) on broad flat feet, with one enormous arm dragging down to the ground on the right and…
  - HEAD: none — bald sunken head; a single rusty grey (#9a9488) spike is stitched into the right s…
  - KEY: Hulking hunched asymmetric silhouette: one huge ground-drag… · Mismatched stitched-on legs of different sizes on broad fla… · Tiny head sunken between the shoulders with ONE glowing pal… · Exposed off-white ribs on the left side of the torso
  - PAL: #6f7a58=body — grey-green sti… · #424d2b=dark shade — deep gre… · #97a280=light — pale sickly h… · #4d5836=the mismatched stitch…

### The Wilds (beast)
- **dire_wolf** — *quadruped*, made of living flesh, fur and hide
  - SILH: A lean, rangy quadruped wolf drawn in strict side profile, facing right. Long low horizontal body (a stretched ellipse) slung over four thin bent legs, with a low sweeping tail trailing behind at the left and a wolfish head thrust forward at the right on a triangular pointed snout. A row of raised triangular hackles zig-zags along the sp…
  - HEAD: none — bare feral head; natural pointed wolf ears (two overlapping triangles) and a bared…
  - KEY: four-legged wolf profile with a long low horizontal spine (… · row of raised triangular hackles bristling along the back · pointed forward snout with a single bared bone-white fang · two erect pointed ears
  - PAL: #5b6470=base slate-grey pelt … · #313842=dark slate — withShad… · #8890a0=pale slate — withShad… · #c7ccd4=silver accent — faint…
- **razorback** — *quadruped (boar/hog)*, made of living flesh and bristly brown boar hid…
  - SILH: A low, horizontal boar-brute: a fat barrel body slung on four short stubby hooved legs, head thrust forward at the same height with a blunt pig-snout and two upward-curving tusks. The defining feature is a row of pale bony triangular razor-spines cresting the spine (tallest near mid-back). At 45px it reads as a bristly brown wedge with a…
  - HEAD: none — natural; a small dark triangular ear and a heavy angry brow over one black eye. (T…
  - KEY: Row of 7 pale bony triangular razor-spines cresting the spi… · Two upward-curving ivory tusks jutting from the snout (one … · Blunt pig-snout with two dark nostrils at the front of the … · Four short stubby legs ending in dark hooves
  - PAL: #5a3f2c=body — bristly brown … · rgb(45,…=dark = withShade(body… · rgb(130…=light = withShade(bod… · rgb(100…=snout ellipse (withSh…
- **grizzly** — *quadruped (bear)*, made of fur over flesh
  - SILH: A stocky, front-facing brown bear built as a compact vertical stack: pear-shaped wide haunches at the base with two small hind feet, thick forelegs running down both sides that end in clawed fore-paws, a rounded chest, and a rounded bear head centered on top. Its signature read is the raised, paler shoulder hump at the nape and the growl…
  - HEAD: none — bare bear head with two small rounded ears (body-brown with darker inner)
  - KEY: Raised pale shoulder hump at the nape (the defining grizzly… · Brown fur body over pale tan lighter belly/chest highlight · Rounded bear head with a pale tan muzzle and small black no… · Growling open mouth showing two white triangular fangs
  - PAL: #7a5a34=body · #e8d3ad=accent
- **dire_alpha** 🔴BOSS — *quadruped*, made of fur / pelt over flesh and bone
  - SILH: A massive dire wolf drawn in strict side profile facing RIGHT — a broad barrel-shaped body on four powerful bent-hock legs, a heavy bushy tail raised and curling up behind, a row of tall jagged raised hackles (spines) running along the spine, a round head with an elongated triangular snout, two pointed ears, bared fangs and a single glow…
  - HEAD: bare — two dark pointed wolf ears atop the head, no helm/crown/horns
  - KEY: quadruped wolf in right-facing side profile (four bent legs… · glowing blood-red eye(s) with pulsing shadow-blur · tall jagged raised hackles / spine crest along the back · heavy raised bushy tail curling up behind
  - PAL: #3f4550=body fill — near-blac… · rgb(18,…=dark = withShade(body… · rgb(103…=light = withShade(bod… · #ef4444=accent — blood-red gl…
- **apex_beast** — *quadruped (ursine/bear) drawn in a frontal reared-u…*, made of living fur and flesh
  - SILH: A colossal front-facing brown bear reared up and seated on broad haunches, filling the frame. Forelegs run straight down both sides of the body to great clawed paws planted on the ground, a massive grizzly shoulder hump bulges above the back, and a centered ursine head roars with an open fanged maw and blazing amber eyes. It reads at 45p…
  - HEAD: none — bare ursine head with two small rounded bear ears (brown with darker inner), no he…
  - KEY: Huge grizzly shoulder/back hump rising above the head · Blazing amber glowing eyes (with pulsing glow) · Wide-open roaring maw with white upper and lower fangs · Great ivory claws on the fore paws
  - PAL: #6b4a2a=body — great brown be… · #f5e0b8=declared accent (ligh… · #ffb43a=amber — primal aura g… · #f0e2c0=ivory/bone — the grea…

### Sealed Vault (arcane)
- **arcane_wisp** — *floating-wisp / amorphous energy mote*, made of pure arcane energy / magic light
  - SILH: A bodiless floating mote of magic — no legs, no torso, no head. The whole thing is a compact spiky violet energy star (an 8-point pointed burst, ~16px across) hovering above the ground, wrapped in a soft round lavender glow halo, with four crackling lightning tendrils radiating outward and a tiny shard orbiting it. At 45px it reads as a …
  - HEAD: none
  - KEY: spiky 8-point violet energy star core (slow-spinning), radi… · soft translucent lavender glow halo surrounding the core · four crackling lightning/energy tendrils radiating outward,… · bright near-white glint highlight on the upper-left of the …
  - PAL: #7c5cff=violet energy core (t… · #c4b5fd=lavender accent — sof… · #a68cff=lightened violet (lig… · #f0ecff=near-white glint high…
- **imp** [shares void_imp reuses this same drawImp function (the Warlock's pact imp — scaled to 0.9x and painted from its own blue def); the Vault Imp is the red-painted original] — *winged biped fiend*, made of Red demonic flesh
  - SILH: A small, pot-bellied biped fiend: one fat round crimson belly-sphere with a smaller round head perched on top, two short curved horns, a pair of leathery bat wings spread behind the torso, and a thin barbed tail curling down. Two spindly twig legs end in tiny stub feet. One arm is raised to the side cradling a glowing ember/flame orb. At…
  - HEAD: two short dark-red horns (#a50808) curving up-and-back from the brow; otherwise bare-head… | GEAR: conjured ember / sm…(right)
  - KEY: Fat round pot-bellied crimson body (single sphere torso) · Leathery bat wings spread behind, flapping · Two short curved horns on a small round head · Thin barbed tail with an ember-orange arrowhead tip
  - PAL: #b91c1c=body — crimson demon … · #8c0000=dark — oxblood shade:… · #e14444=light — bright coral-… · #fb923c=accent — ember orange…
- **cultist** — *humanoid(robed)*, made of cloth / fabric robes
  - SILH: A tall, narrow, floor-length hooded robe shaped as a single tapering triangle — a pointed cowl at the top widening to a jagged, scalloped hem at the base, with no legs or feet drawn (the hem IS the ground contact, like a standing mage). Two short sleeves converge inward toward the belly where a small glowing violet rune-ring sigil floats…
  - HEAD: Pointed cloth hood in dark plum-black (withShade -45), face hidden in near-black shadow; … | GEAR: floating arcane sig…(both)
  - KEY: Pointed hood with a face lost in near-black shadow · Two small glowing violet eyes (flicker/glow) inside the hood · A floating violet rune-ring sigil hovering at the belly, sl… · Tall triangular floor-length robe with a jagged/scalloped h…
  - PAL: #3b2a52=robe body (dark plum,… · #695188=robe highlight — ligh… · #20172d=hood + robe base shad… · #2a1e3b=inner robe-fold shado…

### Overgrowth (nature)
- **thornbeast** — *quadruped*, made of living plant-matter beast
  - SILH: A low, wide, four-legged beast drawn in strict profile facing right — a boar-shaped bramble charger. The trunk is a broad horizontal ellipse riding on four short stubby legs, with a blunt round head and a stout snout jutting forward at the right end. The defining edge is a spiny ridge: a row of curved bramble thorns arching up off its ba…
  - HEAD: none — bare blunt beast head; a single curved thorn tusk of olive-green (#8fae52) hooks u…
  - KEY: Low wide four-legged boar body, mossy-green hide with darke… · Ridge of curved bramble thorns arching up along the spine · Blunt snout at front with an upward-hooking thorn tusk · Single glowing yellow-green eye (#c6f76a) that pulses
  - PAL: #3f6b2f=body / mossy-green hi… · #123e02=dark — belly, legs, s… · #679357=light — top of hide, … · #8fae52=accent — bramble thor…
- **spore_pod** — *rooted-plant / static-object*, made of fungal flesh / spongy mushroom pulp
  - SILH: A squat, stationary mushroom/toadstool: a wide bulbous domed cap (about 32px across, 26px tall) perched on a short thick stalk (~8px wide, 18px tall) with three splayed root prongs digging into the ground. No head, no limbs, no face — the cap IS the whole read. At 45px it reads as a fat fungal bloom with pale glowing dots. Silhouette is …
  - HEAD: none — the domed fungal cap is the top of the body, not worn headgear
  - KEY: bulbous olive-green domed mushroom cap · short thick central stalk · three splayed root prongs at the base · 5 pale lime spore spots glowing on the cap
  - PAL: #6b7f3a=cap body — fungal oli… · #3e520d=dark (withShade -45) … · #93a762=light (withShade +40)… · #d9f99d=accent — pale lime-ye…
- **dryad** — *Rooted-plant humanoid (dryad / tree-spirit)*, made of Living wood
  - SILH: A slender, upright tree-spirit built like a tapering tree-trunk: a narrow bark-skinned torso that flares slightly toward the base and splits into three little splayed root-feet instead of two legs, with two thin branch-arms — one lowered, one raised. A small round head sits on top crowned by a cluster of round leaves. The one thing that …
  - HEAD: Leafy crown — a cluster of five round mint-green (#bbf7d0) leaf-balls forming a hair-crow… | GEAR: glowing 5-petal hea…(left)
  - KEY: Slender tapering bark trunk-torso with a light-to-dark gree… · Crown of round mint-green leaves for hair · Small round head with two softly glowing pale eyes · Glowing 5-petal mint heal-flower held in the raised hand
  - PAL: #2f6b4a=body — deep leaf-gree… · #023e1d=dark — root-feet, bac… · #579372=light — lit front of … · #1b5736=vertical bark-seam st…
- **elder_treant** 🔴BOSS — *rooted-plant / walking tree*, made of living wood
  - SILH: A hulking walking tree, roughly the height-stance of a humanoid but built entirely from a thick, twisted bark trunk. Wide-based: two splayed gnarled root-claw legs plant it to the ground, a broad barrel trunk forms the torso, and two heavy upswept branch-arms end in clusters of clawed twig-fingers. The top is capped by a lumpy, asymmetri…
  - HEAD: Leafy canopy crown — an asymmetric cluster of overlapping foliage lobes (dark forest gree…
  - KEY: Face carved into the bark low on the trunk: heavy dark brow… · Leafy asymmetric green canopy crown on top (clustered folia… · Two heavy gnarled branch-arms sweeping upward, ending in cl… · Two splayed root-claw legs/feet gripping the ground
  - PAL: #5b4327=bark brown — trunk/bo… · #836b4f=lighter tan bark — tr… · #2e1c0d=dark bark brown — sha… · #4d7c0f=canopy green — mid fo…
- **wildheart** — *Rooted wood-spirit / animate tree - humanoid-massed…*, made of Living heartwood / gnarled wood, lit fr…
  - SILH: A short, upright heartwood tree-spirit built from a gnarled trunk-torso that narrows to a small bark-faced head and splays at the base into three splayed roots (not feet). Two crooked branch-arms reach out and up, each ending in a spray of three twig-claws, and a leafy crown of three little tufts crests the head. The read at 45px is a fi…
  - HEAD: Leafy crown - three small amber-gold leaf tufts (#dcae00) cresting the top of the bark he…
  - KEY: Glowing golden heart-core pulsing in the center of the ches… · Radiating golden sap-cracks branching out from the heart ac… · Soft round golden aura/halo enveloping the whole body · Branch-arms ending in twig-claws (three splayed twigs per h…
  - PAL: #6b5327=heartwood body / bran… · #3e2600=dark bark - root legs… · #937b4f=light heartwood highl… · #facc15=golden sap-glow - hea…

### Eclipse Spire (celestial)
- **light_wisp** — *floating-wisp*, made of Pure light / radiant holy energy
  - SILH: A small floating orb of light with NO body, face, or limbs. A soft, translucent gold halo disc (~14px radius, 30% alpha) surrounds a bright glowing gold core (~5.5px) that carries a tiny near-white highlight. A crown of 8 short light-ray spokes (radius ~6→13) radiates outward and rotates slowly, and 3 twinkling sparks orbit the whole thi…
  - HEAD: none (bare radiant mote)
  - KEY: soft translucent gold halo disc enclosing the whole mote · bright glowing gold core with a small near-white highlight · crown of 8 short rotating light-ray spokes · 3 twinkling sparks orbiting the core
  - PAL: #fcd34d=radiant gold — transl… · #fffb75=pale near-white gold … · #fffbeb=declared accent (near…
- **shadow_wraith** — *floating-wisp / floating-cloak-shade*, made of shadow
  - SILH: A floating, legless cloaked shade: a tapered dark-violet cloak body ending in three or four tattered downward points where legs would be, no arms. A horned pointed hood tops it, with two thin curved horns sweeping up-and-back from the crown. Inside the hood is a black face-void holding two small glowing violet eyes. Two small ragged bat-…
  - HEAD: Horned pointed hood — dark near-black cowl coming to a peak, with two thin curved horns (…
  - KEY: Legless tapered cloak body ending in tattered downward poin… · No arms at all · Horned/peaked dark hood with two up-swept horns · Black face-void with two glowing violet eyes
  - PAL: #2a2140=body — umbral shade (… · #0b0819=dark — near-black clo… · #4a3a63=light — top-of-cloak … · #7c3aed=accent — violet aura …
- **eclipse_acolyte** — *humanoid robed caster*, made of cloth
  - SILH: A hooded, floor-length robed caster standing upright — a tall narrow triangle from a peaked hood down to a wide jagged robe hem, no visible legs or feet (robe sweeps to the ground). Reads at 45px as a cloaked figure with a black face-void under a pointed hood, two mismatched glowing pinprick eyes, and a single bright floating eclipse dis…
  - HEAD: a peaked/pointed cloth hood in deep dark violet (near-black indigo), pulled fully over th…
  - KEY: Peaked dark-violet hood with a pure-black face-void underne… · Two mismatched glowing eyes inside the hood — one pale gold… · A floating eclipse-disc sigil at the chest: a dark disc bea… · Long tapered robe with a jagged multi-point hem, top-lit gr…
  - PAL: #4c1d95=body — twilight-viole… · #1f0068=dark — deep near-blac… · #7445bd=light — brighter viol… · #c4b5fd=accent — pale lavende…
- **eclipse_warden** 🔴BOSS — *Bipedal upright humanoid (armored celestial archer)*, made of celestial armor
  - SILH: A towering, upright celestial archer standing behind a split half-light/half-dark halo. Its lower body is a long armored tabard/robe that flares to a jagged angular hem (no separate legs or feet showing), topped by rounded pauldrons and a small helmed head. It holds a glowing curved bow out to one side (front hand extended) with a nocked…
  - HEAD: Full helm: dark-indigo upper dome over a lighter lower face, crossed by a glowing gold ho… | GEAR: bow of light with n…(right)
  - KEY: Split light/dark halo behind the torso — front/right half g… · Glowing gold bow of light held to one side with a nocked go… · Gold crescent-moon crest above the helm · Glowing gold visor slit across a dark helm
  - PAL: #3730a3=deep indigo body / ro… · #0a0376=near-black umbral ind… · #5f58cb=lighter periwinkle-in… · #fcd34d=radiant gold accent —…
- **eclipse_herald** — *winged*, made of celestial light-and-shadow energy
  - SILH: A serene robed celestial figure that floats — no legs or feet; its blue robe tapers from a small round head to a scalloped/zigzag hem that hovers over the ground. Its defining read is DUALITY: one wing is a jagged near-black shadow wing (left), the other a glowing golden feathered wing (right), and a split disc-halo behind it is golden-l…
  - HEAD: glowing gold crescent halo-crown — a thin luminous gold arc arced above the head | GEAR: twin floating orbs …(none)
  - KEY: Asymmetric wings: one jagged near-black shadow wing (left),… · Split disc-halo behind the body — golden-light right half, … · Two floating flank orbs — a bright golden sun (right) and a… · Crescent gold halo-crown over a small round head, with two …
  - PAL: #0ea5e9=robe mid — dawn-blue … · #36cdff=robe top highlight + … · #0078bc=robe hem/base shadow … · #fde68a=pale-gold accent: lig…

### Deep Forge (construct)
- **clockwork_spider** — *multi-legged (spider)*, made of metal / clockwork construct
  - SILH: A small, low-slung mechanical spider seen from the side, oriented facing right. Its body is two metal lobes — a bulbous rear abdomen and a smaller front head-thorax — carried on eight thin articulated legs (four splayed to each side), each with a sharp knee-bend and a planted foot, giving a wide horizontal spread far wider than it is tal…
  - HEAD: none — bare metal head-thorax fitted with a single round glowing brass lens (its only 'ey…
  - KEY: Eight thin articulated bent-knee metal legs, four splayed p… · Two-lobe segmented body: bulbous rear abdomen + smaller fro… · Single glowing brass lens 'eye' with a warm-white center, s… · A spinning brass gear mounted on top of the abdomen
  - PAL: #71717a=gunmetal base tint (d… · #44444d=dark steel — legs, ma… · #9da0a8=light steel/silver — … · #fcd34d=brass — joints, rivet…
- **sentry** — *other*, made of Brass/bronze riveted metal construct
  - SILH: A squat, low-slung brass automaton: a fat riveted drum/barrel body wider than it is tall, sitting on three short stubby legs, with a stubby cannon jutting horizontally out the right side and a small half-dome head cap on top holding a single glowing eye. A thin smokestack pokes up from the left shoulder venting steam. At 45px it reads as…
  - HEAD: A small pale-brass half-dome cap on top of the drum, housing a single glowing amber cyclo…
  - KEY: Riveted brass drum/barrel body (rounded, light-to-dark vert… · A horizontal cannon jutting from the right side with a puls… · Single glowing amber cyclops eye under a small brass dome c… · Three short stubby legs with little peg feet (squat, low st…
  - PAL: #8a6a3d=body — dwarven brass … · #b29265=light — pale brass hi… · #5d3d10=dark — deep bronze sh… · #765629=belly band shadow = w…
- **animated_armor** — *other(floating empty-suit / animated-object)*, made of Hollow, EMPTY steel plate armor
  - SILH: An empty, self-standing suit of plate armor with a DETACHED helm hovering in the air above a hollow breastplate — a clear gap of nothing between head and body, bridged only by glowing blue spirit-light. A curved steel cuirass with rounded pauldrons, below it a few small pointed fauld/greave plates dangling (no real legs), and one armored…
  - HEAD: A floating knight's helm, detached and bobbing above the breastplate with a visible empty… | GEAR: longsword (steel bl…(right)
  - KEY: Detached, floating helm hovering above the empty breastplat… · Glowing pale-blue slit eyes (#7dd3fc) in the dark visor · Glowing blue spirit seam running vertically down the center… · Rounded steel pauldrons + curved cuirass + small dangling f…
  - PAL: #52525b=dark steel — main bod… · #6e6e78=lighter steel (withSh… · #3a3a40=darker steel (withSha… · #a1a1aa=silver accent — pauld…
- **forge_golem** 🔴BOSS — *humanoid*, made of fire-blackened iron / molten-metal cons…
  - SILH: A hunched, colossal humanoid golem — broad trapezoid torso tapering to a narrow waist, mounted on two thick stubby legs. Oversized boxy fists hang forward on long arms well below the shoulders, and a tiny angry wedge head sits sunken between the shoulders with no neck. The chest is dominated by a glowing arched furnace maw crossed with g…
  - HEAD: bare — a small sunken wedge/trapezoid head recessed between the shoulders, no helm or cro…
  - KEY: glowing arched furnace maw in the chest with vertical grate… · huge boxy fists dangling forward on long arms, with molten-… · broad hunched trapezoid torso on two thick short legs · tiny sunken angry head with narrow angled glowing eyes, no …
  - PAL: #7c2d12=body — fire-blackened… · #f97316=accent — molten-orang… · #fff3c4=hot — pale-yellow fur… · #ffb43a=ember — rising ember …
- **ancient_automaton** — *winged-less floating humanoid CONSTRUCT*, made of ancient bronze / gilded metal armor pla…
  - SILH: A hovering humanoid suit of ancient-bronze armor assembled from separate floating angular plates — a small angular helm, a broad hexagonal breastplate, a chevron waist, two tapered greaves, and two flared pauldrons — all strung along a glowing vertical gold energy spine with a bright pulsing gem at the chest. There is no solid flesh body…
  - HEAD: angular metal helm in bronze with a lighter-to-darker gradient, set with two glowing gold…
  - KEY: Body built from separated floating angular armor plates (he… · Glowing gold vertical energy spine running down the center … · Pulsing gold core gem set in the chest, wrapped in a glow · Two glowing gold slit eyes in the helm
  - PAL: #78350f=ancient-bronze base p… · #fde68a=gold filigree, eyes, … · #ffd86b=glowing energy spine … · #fffbe6=bright gold highlight…

### Fallen Cathedral (desecrated)
- **heretic_zealot** — *humanoid*, made of Cloth
  - SILH: A hunched, frenzied hooded cultist standing on two legs — a robed humanoid. The body is a single frayed robe that flares from a narrow hooded top to a wide, jagged sawtooth hem (torn triangular points instead of a clean skirt edge). A deep pointed hood swallows the head into a black void pierced by two glowing candle-gold eye-glints. One…
  - HEAD: Deep pointed monk/cultist hood in dark wine-black (#2a1015), hanging forward over the fac… | GEAR: short curved knife …(right)
  - KEY: Deep pointed hood with a faceless black void interior and t… · Frayed robe ending in a jagged sawtooth (torn triangular) h… · One forearm thrust forward brandishing a short curved knife · Tan rope belt knotted at the waist with a loose swinging ta…
  - PAL: #4c1d24=wine-dark robe body (… · #7a3540=robe highlight (light… · #2a1015=robe/hood shadow (dar… · #0c0810=inner hood void (the …
- **gargoyle** — *winged / floating*, made of carved granite stone
  - SILH: An airborne winged gargoyle that HOVERS — it never plants feet. Spread bat-style stone wings frame a compact rounded granite torso; a horned, snarling head with glowing eyes sits atop, clawed legs dangle loosely beneath, and a barbed spade-tipped tail trails below. The wingspan-plus-dangling-limbs read as a floating flying gremlin, not a…
  - HEAD: Bare stone horns, no helm/crown. Variant 0: a straight upright horn pair. Variant 1: swep…
  - KEY: Spread bat-like stone wings (membrane with a single strut r… · Glowing eyes — pale ghost-white (imp) or cold blue (ravager… · Horned, snarling head with pricked stone ears and ivory fan… · Barbed spade-tipped tail trailing below the hovering body
  - PAL: #57534e=body — weathered gran… · #a8a29e=accent — pale stone g… · #2c2a27=dark — deep granite s… · #7f7b74=light — pale granite …
- **grave_chorister** — *floating-wisp / ghost*, made of spectral cloth / shroud-shadow
  - SILH: A floating hooded death-spirit. The upper body reads as a shrouded, cinched-hood head and shoulders that dissolve below the waist into a tattered, wisp-tapered burial shroud with jagged bottom points — NO legs, it drifts. The face is the read: two hollow black eye-sockets and a long, open, wailing mouth. Concentric sound-rings ripple out…
  - HEAD: burial-shroud hood, cinched to a point at the crown, in darker shroud-grey (withShade bod… | GEAR: a small guttering c…(left)
  - KEY: long open wailing mouth (elongated black ellipse) flanked b… · pointed burial-shroud hood cinched at the crown · tattered, wisp-tapered lower body with jagged points and no… · concentric spectral sound-rings ('its song') rippling outwa…
  - PAL: #8b93a7=body / shroud — faded… · #dbe4ff=accent — spectral pal… · #b6bccb=lightened shroud high… · #4d525f=dark shroud, fades to…
- **fallen_seraph** 🔴BOSS [shares healer (displays as "Cleric") — drawFallenSeraph draws its own charred wings + broken halo + ember motes, then calls drawHealer for the ENTIRE body (robe, cream tabard/cross, rope belt, prayer book, skullcap head, secondary double halo, crozier+orb). It is the Cleric body reskinned as a fallen angel via added wings/halo and the dusk-purple color; no bespoke body geometry of its own.] — *Winged humanoid*, made of Charred/burned feathers and cloth
  - SILH: A towering robed angel with a broad charred wingspan fanned behind it, a tilted broken halo hovering askew over its bowed head, and a tall crook-staff (crozier) planted to one side. The floor-length robe flares to a triangular skirt hiding the legs, so it reads as a hovering figure rather than a striding one. At 45px it resolves to three…
  - HEAD: Broken tilted halo — a tarnished-gold ring (#e8b04b) hanging askew with a bite/gap missin… | GEAR: crozier / shepherd'…(right)
  - KEY: Broad charred/ashen feathered angel wings (dense fanned fea… · Broken, tilted tarnished-gold halo with a gap bitten out of… · Dusk-purple floor-length robe with a cream tabard bearing a… · Crozier / crook staff topped with a glowing orb held at the…
  - PAL: #3f3348=robe body — ash-stain… · #e8b04b=accent — tarnished ha… · #f5f0e1=cream/off-white tabar… · #57505c=wing primaries, charr…
- **penitent** [shares drawHealer (the Cleric, id "healer") — drawPenitent adds the two ashen angelWings and a dim guttering halo, then calls drawHealer for the entire robed body. The Fallen Seraph boss (drawFallenSeraph) is the same composition with a larger 1.28 wingspan, more ember motes, and a broken tilted halo.] — *winged*, made of robed cloth over a humanoid angel body,…
  - SILH: A tall, floor-length robed cleric figure (drawHealer body) crowned by a pair of large, drooped charred angel wings held low and barely beating, plus a faint guttering halo. The robe is a triangular skirt that hides the feet, so the read is: hooded/skullcapped head, mantled shoulders, a bright vertical cross-tabard down the chest, a sheph…
  - HEAD: bare serene face with closed/downcast eyes, wearing a dark taupe skullcap (#a2998b) over … | GEAR: crozier (shepherd's…(right); prayer book(worn)
  - KEY: Large drooped charred angel wings held low in mourning — sm… · Dim, guttering pale-blue halo above the head (broken/faint,… · Floor-length ash-alabaster robe with a mantled shoulder cap… · Off-white front tabard bearing a glowing cold-blue cross
  - PAL: #cfc6b8=robe body — ash-duste… · #a2998b=robe shadow / skullca… · #f7eee0=lit robe panel / face… · #9db8ff=accent — cold votive …

### Rogue's Den (thieves)
- **cutpurse** — *humanoid*, made of living human flesh and cloth/leather
  - SILH: A small, compact two-legged rogue caught mid-getaway, leaning hard forward into a sprint (whole body rotated ~-0.13 rad, drawn at 0.9x so it reads as a little gutter-blade). Top-heavy upper-body pose: a slim hooded jerkin torso, a short ragged hip-length capelet, a red scarf streaming out behind, a loot sack hugged under the left arm and…
  - HEAD: bare head, no helm/hood/crown — a black burglar eye-mask band (#1c1a22) across the eyes w… | GEAR: shiv / short crude …(right); bulging leather loo…(left); bulging coin purse(worn)
  - KEY: black burglar eye-mask band with gold-glinting eyes · bulging coin purse on the belt + loot sack hugged under one… · single shiv thrust out front (not twin daggers, not a hood) · red scarf streaming out behind
  - PAL: #3b3347=body — patched dusk-g… · #d4a017=accent — stolen-coin … · #c99b6a=face skin (bare head) · #1c1a22=black burglar band ac…
- **knife_thrower** — *humanoid (two-legged), but NOT an upright planted-f…*, made of living flesh and oiled leather
  - SILH: A lean two-legged human rogue caught mid-throw in an aggressive forward lunge: back leg extended straight behind, front leg bent, torso pitched forward into the throw. The lead (throwing) arm is snapped out to full extension in follow-through with an open, empty hand, while the off-hand is drawing the next blade from a chest bandolier. R…
  - HEAD: bare cropped dark head (skin #c99b6a, dark hair) with a RED bandit mask (#c22f2f) coverin… | GEAR: throwing knife (ste…(left); bandolier of spare …(worn); lead throwing hand …(right)
  - KEY: Forward-lunging throw stance — torso pitched into the throw… · Red bandit mask over the lower face (matches the Bandit Kin… · Chest bandolier of throwing knives crossing the torso, off-… · A thrown steel knife streaking away ahead of the body, spin…
  - PAL: #2c333d=body / oiled-leather … · #84cc16=venom-lime accent — t… · #c22f2f=red bandit mask over … · #8f1f1f=darker red mouth/stit…
- **den_bruiser** — *humanoid (two legs, two arms)*, made of human flesh and leather
  - SILH: A hunched, thickset human brawler standing on two wide-planted bandy legs — a barrel-chested grappler, not a slim rogue. Both huge bare hands are thrust forward with flexing fingers ready to grab, and there is no weapon. At 45px it reads as a squat, top-heavy bruiser: bald scarred head sunk low between heavy shoulders, wide vest-clad tor…
  - HEAD: bare — bald, scarred head (a thin white scar over the left temple); no helm, hood, or cro…
  - KEY: Barrel torso in a scarred hide vest (gradient brown) with a… · Both huge open grappling hands thrust forward with flexing … · Bald, scarred head with heavy brow, mean little black eyes,… · Glowing brass pit-brand (small ring + slash sigil) pulsing …
  - PAL: #5b4632=scarred hide vest (bo… · #c98a3d=brass accent — glowin… · #b98a5e=tan skin — bare chest… · #a5764b=darker skin shade — h…
- **bandit_king** 🔴BOSS — *Standard two-legged humanoid, but oversized/boss-sc…*, made of Mortal flesh-and-leather man: tanned hu…
  - SILH: A towering, barrel-chested humanoid brute standing upright on two wide-planted legs, rendered at boss scale (2.1x battleScale, plus an extra ctx.scale(1.25) in dispatch = a crowned colossus). A stolen gold crown sits high on his head and a red bandit mask covers the whole lower face; one fist is planted on the hip while the other arm swi…
  - HEAD: Stolen gold crown (#e8b04b), worn straight and oversized (scaled 1.2x), set with a red (#… | GEAR: broad cleaver-falch…(right)
  - KEY: Oversized glowing gold crown with red + green jewels · Red cloth bandit mask over the whole lower face (knot-tails… · Broad cleaver-falchion raised mid-swing (steel blade, gold … · Fur-collared wine-leather coat open over a bare, scarred ta…
  - PAL: #4a2c3a=body / wine-stained l… · #1d000d=legs & coat shadow (d… · #725462=coat highlight (light… · #e8b04b=accent — stolen crown…
- **silencer** [shares outlaw] — *humanoid (bipedal rogue) BUT no distinct legs or fe…*, made of cloth-and-flesh
  - SILH: A slim, upright hooded assassin reading as a near-solid black silhouette with a single red glow. A deep pointed hood swallows the face down to two glowing red eyes; a slender torso wears a diagonal chest sash and a belt with a side pouch; a ragged tattered-hemmed cape flows behind, its bottom edge cut into sharp pointed tatters. Twin dag…
  - HEAD: deep pointed assassin's hood in near-black (#1c1a22 / #0d0912 interior), no helm or crown… | GEAR: dagger (right hand)(right); dagger (left hand)(left)
  - KEY: deep pointed hood with a shadow-void face and two glowing r… · twin daggers, one per hand, held blade-out with red-tinted … · tattered cape with a sharp pointed hem flowing behind · featureless near-black body with a single red accent thread…
  - PAL: #1c1a22=body/robe — near-blac… · #0d0912=face-shadow void insi… · #b91c1c=accent — glowing red … · #20161a=belt, blackened leath…


---

## 5. BEFORE SHIPPING (carried from the deckable handoff)

- The ranged advance-fire WINRATE SWEEP is still owed. ⚠ **CORRECTED
  2026-07-23 — the blast radius is 5× what this said.** Not three units:
  **15 of the 43 are ranged**, so the advance-while-firing buff lands on a
  third of the bestiary, including 2 bosses and 2 legendaries —
  `skeleton_archer, bonecaller, arcane_wisp, imp, cultist, dryad, light_wisp,
  eclipse_acolyte, eclipse_warden (BOSS), eclipse_herald (legendary), sentry,
  grave_chorister, fallen_seraph (BOSS), penitent (legendary), knife_thrower`.
  Raise this before shipping; sweeps are a user decision, do not run one
  unprompted.
- Delete/gitignore the `*-all-animations.html` harnesses + `src/dev/`.
- Decide the pixel-corpse vs `corpseArt` decal question (§3).
- Usual gate, then WORKFLOW.md batch-PR flow; the user decides when to merge.
