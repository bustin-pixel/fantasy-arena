# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

> **✅ The architecture deepening batch SHIPPED** (PR #65, merge `6d5a4e9`,
> 2026-07-17, deploy hash-verified). Six refactors, no gameplay change, 663 tests.
> Two hazards it left behind that are worth knowing before you touch the area:
> **item swing effects resolve in a FIXED order that is simulation, not layout**
> (`engine/items/swingEffects.ts` header explains why a kind-keyed loop would be a
> bug), and **adding a dungeon is guarded by `data/__tests__/dungeonFacets.test.ts`**
> — a red line there is the checklist.
>
> **Deferred: the sprites art registry** — splitting `assets/sprites.ts`'s 83-case
> `switch (def.id)` into a per-defId registry. Cut deliberately: it buys locality
> only (no bug fixed, no coverage gained, no feature unblocked). Plan + the
> exceptions to preserve live in the `architecture-refactor-batch` memory if it's
> ever wanted.

> **✅ SHIPPED PR #67 (2026-07-17): level cap 30 + per-dungeon difficulty tiers.**
> `LEVEL_CAP` 10→30 (same XP curve — 21,750 to max; old capped saves load as
> Lv 10 of 30), the Normal chain's `monsterLevel` re-spread 1→20 (forks at 20,
> bosses 21), and a per-dungeon Normal/Hard/Elite ladder picked on the atlas
> sheet (`FloorInfoPanel` pills; clear a dungeon's Normal → its Hard → its
> Elite). Tiers re-band monster LEVELS only (`data/tiers.ts`: Hard 25–30,
> Elite 30–40 — deliberately past the player cap; fork Elite boss Lv **41**),
> pay ×2/×3 XP+gold, bump chests +1/+2, and each tier's first boss kill is a
> real first clear (gold + shards, `TIER_REWARDS` in economy.ts). Save **v14**
> (`DungeonProgress.clearedTiers`). Invariants in NOTES §8. Sweep the tiers
> with `SWEEP=1 SWEEP_TIER=hard|elite npm test -- winrateSweep`.
>
> **Deferred: prestige / cosmetic ascension.** Cap 30 + the tier ladder carry
> the long game; revisit prestige as its own slice once players saturate Elite.

> **✅ SHIPPED PR #67 (2026-07-17): descent march-in + Regroup.** Dungeon floors
> 2+ auto-field the warband on the *previous floor's deploy-time marks* (a walk-in
> cinematic — the twin of the walk-off), then the normal 3s countdown runs with a
> **Regroup** button that drops back to manual placement. Uniform incl. the boss
> lair; floor 1 stays manual; within-one-run only (`DungeonRun.formation`, never
> persisted — **no save bump**). Capture reads the `deployments` log (live
> positions are scattered by the outro by hand-off time); fielded at construction
> behind an `introHold` that makes the deployment tick a no-op until the walk-in
> releases it. 712 tests (+11 `formation.test.ts`; F3 = byte-identical to manually
> placing the same marks). ⚠ walk-in + floor-2 button need a **device eyeball**
> (preview pane suspends rAF). Memory: `descent-march-in-formation-built`.

> **✅ SHIPPED PR #67 (2026-07-17): boss "brace up" cinematic.** The mid-battle
> sibling of the march-in: when a boss (or the rare quest catalyst) telegraphs onto
> a cleared field, the sim FREEZES and the survivors pull back into a centered
> horizontal row at the arena mid-line to face the entrance; the fight then resumes
> **from that row** (a real, deterministic gameplay change — user-picked over a
> cosmetic snap-back). Covers **Depths boss + rare AND Endless boss + rare** via one
> shared trigger (a boss/rare `state.waveBanner` on a clear field — clear in all
> four cases). The freeze is the in-battle twin of the march-in hold: frozen ticks
> touch no sim state, the engine snaps survivors to a deterministic row on release
> (`computeBraceRow`/`applyBraceRow`), and a `BOSS_BRACE_FAILSAFE_SEC` failsafe auto-
> releases headlessly — so boss floors still resolve AND stay byte-reproducible. 718
> tests (+6 `brace.test.ts`). Lives entirely in `MatchController` + the hook
> (`OutroCinematic.braceToRow`, a `braceRef`); no UI/App changes. ⚠ the retreat
> cinematic needs a **device eyeball**. Memory: `boss-brace-cinematic-built`.

> **✅ The Commander SHIPPED (PR #68, 2026-07-18; built on `feature/commander`).**
> The meta centerpiece: YOU as a customizable commander above the deck. An
> account-wide XP pool (fed the same per-battle XP the deck earns, cap Lv 20 →
> 19 talent points), a 3-branch talent tree (Warlord / Guardian / Arcanist,
> tier gates at 0/2/5/8 in-branch, keystones), and one castable battle spell
> per branch (unlocked at 8 points in; Rally / Bulwark / Arcane Storm, one
> charge per battle via a HUD button). Talents resolve to a `CommanderMods`
> fold on `teamMods.player` — a deterministic match input like slayerBonuses,
> replay-recorded; arena stat-mirrors the flat talents onto the AI side so the
> fair fight holds. Save **v17** (`commanderXp`, `talents`, `equippedSpell` —
> all derived-never-stored rules; the sanitizer REPLAYS the tree's gate rules
> on load, so hand-edited/rolled-back saves self-heal). 814 tests (+37:
> meta/commander, engine commanderMods + commanderSpell, migration). UI: Home
> banner under the profile plate → CommanderSheet — titled **"The War Table"**
> (named 2026-07-18; matches the Forge/Athenaeum place-naming voice; the
> "talent points" currency word deliberately stays); results-screen commander
> XP bar. Memory: `commander-built`.
>
> **Meta decisions recorded (2026-07-18):** a "Hero" tier above Legendary with
> a 2-unit deck was considered and **REJECTED** — it devalues the legendaries
> (each is a themed dungeon's trophy), deletes the deploy-2-of-4 reserve game,
> and ripples through AI budgets/mirrors/sweeps. Deferred meta levers for
> later: **player-facing deck budget** (expose the AIDeck rare=1/epic=2/
> legendary=4 cost system — a future Hero-class unit could slot in as a
> cost-6 card, forcing the tiny-warband tradeoff emergently), **faction/tag
> synergies** (undead/skeleton tags exist), **legendary ascension** (pairs
> with the deferred prestige note).
>
> **Still open on the Commander:** a "War Tent" full-screen scene (Forge
> pattern, `/mockup` round) — the sheet ships plain for now, and since the
> screen is named "The War Table" the scene art should center on the table
> itself (campaign maps, markers, the three branch banners around it); spell
> cast VFX/SFX polish
> + a field-edge commander banner (presentation); a talent-numbers sweep once
> players saturate the tree; device eyeball of the HUD spell button feel.

**Current state:** deterministic 4v4 auto-battler, 24 deckable units (engine fully
kit-based — see `docs/adr/0001-unitkit-seam.md`), a swipeable 3-page app shell
(Collection / Home / Compendium) over a scrolling dungeon-crypt background,
click-to-inspect detail panel, in-battle tooltips, 2v2 + countdown start.
Arena (vs AI deck) + The Depths slice 1 (PvE floors 1–5 behind a floor picker —
seeded WaveController horde, fodder tier, Bloater boss on 5) + a live Compendium
(3-tier bestiary reveal) + **Economy slice 1** (save v3: gold + chests with unit
drops, locked Collection with gold purchases, floor-milestone unlocks; pure seeded
rewards module in `src/meta/`). Deployed to Netlify (auto-deploys on merge to
`master`).

---

## Game modes

### PvE mode — "The Depths" (design locked 2026-07-01; slice 1 BUILT)
A floor-based descent through the dungeon — the Home screen's gate is literally the
entrance. Each floor is a Swarm encounter; every **5th floor is a boss floor**.

**Slice 1 shipped** (see the PR / git log): seeded `WaveController` + `"depths"`
`MatchMode` (per-side `activeCaps`: player 4 / enemy 12), `data/depths.ts` tier +
budget tables, the fodder tier (Giant Rat, Zombie Shambler, + existing Skeleton;
boss **Bloater** with Putrid Burst). The floor picker + persisted progress
(`depths.highestClearedFloor`, save v3) shipped with Economy slice 1.

**Floor rebalance DONE (2026-07-05, on PR #46)** — floors were too easy/short.
Now: per-floor stat multipliers (+8% HP / +5% dmg per floor, linear — so floors
6+ escalate instead of plateauing; **unit levels are now that player
counter-curve — BUILT, see "Unit leveling" below**; items are the second lever),
waveBudget 25+3×floor (~28–40 bodies), 0.5s trickle,
enemy cap 12, Depths-specific 300s clock, Bloater 800hp/28dmg, boss floors keep
70% fodder. Tuned by headless winrate sweep (target hit: floors 1–3 comfy→
bloodied, floor 4 77%, boss floor ≈ coin flip depending on deck). Method +
numbers in NOTES.md hazard 4b. Gold bumped to match longer floors (15/floor
first-clear, 30 replay, 15 loss).

**Still to build:**
- **Remaining bestiary tiers** (each needs its monsters built first):
  - **6–10** undead: Skeleton Archers, Ghouls, Bonecaller → boss **Abomination**
    (these monsters + a rare **Lich** are now BUILT — in the separate **Bonefields**
    dungeon, below — so reuse them if The Depths itself extends to these floors)
  - **11–15** deep crypt: Spiders, Imps, Banshee, Plague Shaman → boss **Gargoyle**
  - **16–20** the throne: elite mixes, Spore Pods, Bat Swarms → boss **Lich**
- **Discrete announced waves** ("Wave 2/3" banner + lull between bursts) —
  deliberately deferred from the rebalance to the tier-2 content drop, where a
  mid-floor mix shift has new monsters to show off.
- Extras: **3-star floors** (clear without losing a unit → bonus gold, slice 3);
  **boss first-kills unlock their Compendium page**; **Endless mode** after the
  campaign works (personal-best waves on Home).

### Progression & economy — SLICE 1 SHIPPED; remaining slices below

> **Progression revamp — BUILT 2026-07-13, UNSHIPPED** (`feat/progression-revamp`).
> A `winrateSweep` harness (`engine/__tests__`, SKIPPED by default; `SWEEP=1 npm
> test -- winrateSweep`) exposed that the whole post-Depths chain was tuned for a
> near-max warband — themed dungeons swept 0–6% and **every boss floor 0%** at
> intended power (the old sweep was Depths-only). Retuned to a smooth, winnable
> ramp: enemy cap 12→7, wave budget 25+3f→20+2f, floor scaling 0.08/0.05→0.06/0.04,
> boss-floor fodder share 0.7→0.45, Bonefields roster thinned. **10 copy-paste
> boss/rare kits replaced with bespoke themed ones** (Putrid Spew, Runic Plating
> phase fight, Magma Vents, Fan of Knives, Sentry Protocol, Duality, …) + Seraph
> now revives fallen monsters. **All-rare starter** (knight/archer/warrior/mage) +
> **every dungeon gifts a unit on first clear** (`MILESTONE_UNLOCKS` is per-dungeon,
> save v12 retro-grants). **Replay gold scales with depth** + **boss-replay chests**
> (farm-for-gear loop). Fork elites reach Lv 11 (`MONSTER_LEVEL_CAP`). Full detail:
> NOTES §4d–4f. Still-open fine-tuning (a few boss floors a notch hard) noted there.

The loop is live: battle → **gold + chest** → unlock units → stronger warband →
deeper floors. All meta-layer — the sim never learns about rewards; chest contents
roll from a **drop-time seed stored on the result** (deterministic,
server-verifiable). Every tunable number lives in `src/meta/economy.ts`; the pure
reward matrix + chest roller are `src/meta/rewards.ts` (headless specs alongside).
Shipped in slice 1: save v3 (`gold`, `unlockedUnits`, `depths` progress, v2 saves
grandfathered with everything unlocked), the floor picker, chests (wooden/silver
drop today; gold data exists but drops start with deeper bosses), locked
Collection + gold purchases, milestone unlocks (floors 2–5 → Warrior/Mage/Cleric/
Berserker), duplicate drops → gold. The chest tap is now a full ceremony (PR #46):
procedural canvas sprite + rattle/lid-swing/sparkle animation + creak/jingle SFX
per tier, and the ladder tops out at five tiers — wooden → silver → gold →
**arcane → dragon** (now dropped by the chain capstones: Deep Forge / Eclipse
Spire boss first-clears, plus arcane from deep endless milestones).

#### Unit leveling — BUILT (2026-07-08, feat/unit-leveling)

Per-unit XP/levels, the player counter-curve to floor scaling. Cap 10;
+5% HP / +3% dmg per level (max +45%/+27% vs floor-5 enemies' +32%/+20%),
hp/dmg only — the exact mirror of what enemy floors bake. Whole deck earns
full XP from every mode (dungeon wins 20+10×floor, replays pay full, losses
40%, endless 10+8×wave, arena 25/10); rising cost curve 25·(L−1)·L (cap at
2250 total ≈ clearing all content + some endless). No catch-up mechanic.
Arena AI mirrors the player's average deck level. Save v8 (`unitXp`, level
always derived). All numbers in `src/meta/leveling.ts`; pacing targets are an
executable spec. Summons inherit their creator's level (NOTES hazard 8).
Surfaced: results-screen XP bars + LEVEL UP flash/stinger + stat deltas, hub
card badges, detail-panel level chip/XP bar/leveled stats, in-battle badge by
the HP bar. Design decisions in the plan file
(`plan-how-units-level-keen-dijkstra.md`) + the `unit-leveling-built` memory.

#### Dungeon monster levels + ordered chain — BUILT (2026-07-08, feat/unit-leveling)

The dungeons now form a hard gated chain (each requires the previous one's
floor 5): Depths → Bonefields → Wilds → Overgrowth → Sealed Vault → Deep Forge
→ Eclipse Spire. Monsters carry REAL visible levels through the same createUnit
bake as players (ladder 1/3/5/6/7/8/9 ≈ your arrival level walking the chain,
one level hot from the Sealed Vault on; bosses + rare catalysts +1, so the
Eclipse Warden caps at Lv 10). Floor multipliers still layer on top; Endless
stays Lv 1 (its own curve). The gate never re-locks a dungeon with its own
progress (legacy out-of-order saves). Chest capstones: Deep Forge boss
first-clear → **arcane**, Eclipse Spire → **dragon** (first wiring of the top
two tiers). Dungeon map shows "Lv N foes" chips + your warband level with an
under-leveled warning; floor picker shows the boss level + the real chest tier.
Numbers in `data/dungeons.ts` (`monsterLevel`, `ELITE_LEVEL_BONUS`, `gate`) and
`meta/rewards.ts` (`bossChestTierFor`); ladder/gate specs in
`meta/__tests__/dungeons.test.ts`. No XP retune — the leveling pacing spec
still holds.

#### Creature tags + Slime Knight anti-horde rework — BUILT (2026-07-08, feat/unit-leveling)

`UnitDef.tags` creature types ("undead"/"skeleton"; skeletons carry both) —
pure data like `wardedAgainst`, tagged across the whole undead roster. The
Slime Knight gained the counter package for the Bonefields' skeleton hordes:
**Caustic Aura** (once a second, 30% of its damage in acid to every enemy
within 90px — but a SKELETON loses 90% of its remaining hp per pulse; scales
with level, silent while stunned/feared/polymorphed) and **Absorb Bones**
(any ENEMY skeleton dying inside the aura is slurped for 20 HP, whoever
landed the kill; shown as ONE merged "Caustic Aura" panel trait). Built on a
new reusable kit seam:
`onUnitDeath` death-observer hook (fired on every other living unit from the
HP-funnel death branch, after the victim's own `onDeath`). Unlock price stays
2500g — he's a strong optional answer to the Bonefields, not a required key.
Specs in `slimeKnight.test.ts`; panel traits added.

**Remaining economy/PvE slices, in order** (slices 2 & 3 have a build-ready
handshake with file anchors + commit sequencing in
[`docs/handoff-depths-slices-2-3.md`](docs/handoff-depths-slices-2-3.md)):
1. ~~Core loop~~ — SHIPPED (this slice).
2. **Depths content:** bestiary tiers 6–10 (undead → Abomination), 11–15 (deep
   crypt → Gargoyle), 16–20 (the throne → Lich) per the approved monster list
   below; difficulty pass as the curve extends; gold-tier chests on deep bosses.
   Content work — interleaves with slices 3+.
3. **~~Bestiary rewards~~ — ✅ BUILT (save v16, on `feature/slayer-xp`):**
   one-time discovery gold (first encounter + first defeat, bosses at a
   premium band + a Soul Shard), slayer-milestone gold at each of the five
   kill thresholds (+1 shard at the cap), and per-dungeon book-completion
   gold+shards. Plus the cosmetic layer: **titles** (a slayer epithet per
   dungeon boss — "Bloaterbane", "Kingslayer" — plus **Loremaster** for a
   complete monster bestiary), worn on the profile plate and picked in the
   ProfileSheet, and a **gilded card** in the Compendium at slayer 5.
   Every stream keys off a monotonic false→true crossing, so it's
   unfarmable without a claims ledger. Architecturally this ALSO folded
   Compendium recording into `applyBattleGrant` — `recordBestiary` is gone,
   so a reveal and the gold it pays are one atomic write. Numbers in
   `meta/economy.ts` (`BESTIARY_REWARDS`, `SLAYER_MILESTONE_GOLD`); math in
   the new pure `meta/bestiaryRewards.ts`. Save **v16** adds `title` and a
   one-time retro-grant so an existing save's whole back catalog pays out.
   **Still open from this slice: 3-star floors.** NOTE: the Soul Shard
   currency itself SHIPPED with Items v1 (save v9, not the sketched v4) —
   earned from floor/boss/capstone first clears + fresh endless milestones +
   an arcane/dragon chest drip; spent on legendary-tier merges.
4. ~~**Items v1**~~ — **✅ BUILT (feat/items-v1, save v9 — bigger than the
   sketch):** 25 item lines (6 weapons / 5 armors / 8 trinkets base + 6
   dungeon-signature relics on themed boss chests), rare→epic→legendary ×
   1–3★ with **pairwise-doubling merges** (2 identical → +1★; two 3★ → next
   quality; gold fees for rare/epic work, **Soul Shards for everything
   legendary**), UnitDetail equip slots, per-unit `itemMods` engine channel
   (a deterministic match input like levels), arena enemy item mirror, Lucky
   Coin meta trinket. Invariants = NOTES §9. The Bag sheet + combine ceremony
   were later ABSORBED by the Blacksmith (2026-07-14); Combine All shipped
   there as **Forge All**. Still open: **item-assuming dungeon tier**
   (post-gear difficulty band — new content, its own slice).
5. **General Store — Grubbins' Pawn-Den (v1 BUILT, 2026-07-09, on
   feat/player-shop).** The shop identity question was settled by grilling:
   ONE general store, and the old "Soul Shop sells distinction, never battle
   power" philosophy is formally REVISED — earned gold buying power matches
   the game's existing pattern (unit unlocks, merges); the money guardrail
   moved to the IAP layer instead (premium shelf is a coming-soon STUB, no
   payments/no fake grants until an accounts/backend project exists). v1 =
   full-screen animated Grubbins scene (gritty pawn-den, mockup-picked) +
   daily 4-slot shelf (rare/epic only, 1★, from `BASE_LINES_BY_SLOT`; never
   dungeon signatures, never legendary quality) + one 200g pre-purchase
   reroll + shop theme track + coinSpend SFX; save v10 `shop` bookkeeping;
   invariants in NOTES hazard 10. Cut by the user: boosts/potions of any
   kind. **Still open for later slices:** the distinction goods this slice
   absorbed — unit skins (palette swaps — mostly cheap via `color`/`accent`,
   but the sprite glow-up added hardcoded literals — knight `KnightLivery`
   heraldry, per-mage element tints, bone/flame/steel material colours — that
   a skin for those units must also recolour) and titles/flair ("Lichslayer",
   pairs with boss first-kills) as a cosmetics TAB of this same screen, plus
   real payments. (The themed legendary dungeons that used to live in this
   slice shipped separately via PR #50 — Bonefields → Necromancer, Wilds →
   Hunter, Sealed Vault → Aegis Knight, Overgrowth → Druid, Eclipse Spire →
   Mystic Archer, Deep Forge → Engineer; every existing legendary is
   quest-exclusive, spec in the `themed-legendary-dungeons` memory. The two
   NEW legendaries got theirs 2026-07-13 — the gate chain now FORKS after the
   Eclipse Spire into The Fallen Cathedral → Seraph (Priest anchor) and The
   Rogue's Den → Outlaw (any stealth-unit anchor, the first any-of quest);
   both Lv 10 with cap-clamped elites, built + verified, UNSHIPPED on the
   compendium/bosses/HUD batch branch — see `two-endgame-dungeons-built`.)
6. **Later:** Endless mode, per-monster kill crests, trophies/ranks → Arena
   enemy-deck budget scaling via the existing `budget` param, PvP rewards
   (server-side — PvP pays nothing today by design).

#### PvE monster bestiary — APPROVED (fodder tier BUILT; build the rest)
User greenlit the full list (2026-07-01). Non-deckable — add ids to
`NON_DECK_UNITS`. Reuse shipped systems so each stays deterministic; several can
recolor existing sprites (skeleton/wolf/slime — the fodder tier did exactly this).
Fodder stat band ≈ Skeleton `45hp/8dmg` … Boar `140hp`. ~~Struck~~ = shipped:
- **Fodder:** ~~Zombie Shambler~~, ~~Giant Rat~~, ~~Skeleton~~ (all in).
- **Runners:** Ghoul (haste on ally death), Bat Swarm.
- **Ranged:** Skeleton Archer (plain arrows), Spider (poison glob), Imp (burn bolts).
- **Exploders/splitters:** ~~Bloater~~ (in — tier-1 boss), Ooze (splits, exists),
  Spore Pod (spawns sporelings on death).
- **Support (priority kills):** Bonecaller (raises skeletons — Necro's Raise Dead;
  the summon-flush cap already scales with the Depths caps, so it won't be starved),
  Banshee (fear-wail + stealth), Plague Shaman (heal + haste the horde).
- **Elites/bosses:** Abomination (huge HP, slam, one revive — Ogre slam + Second Wind),
  Gargoyle (heavy damage reduction), Lich (curse DoT + raise dead).
Good home for the dormant statuses PvE should wake: `fear`, `haste`, `stealth`
(`poison` woke up with the Bloater/fodder slice).

### PvP mode (scaffolded)
Real-time 1v1. `BattleMode "pvp"` already exists (hides fast-forward, locks the sim to
1×). Remaining work is the server-authoritative model in README "Path to multiplayer":
run `MatchController` + `CombatSystem` on Node, send deploy inputs to the server,
broadcast snapshots, keep `Renderer` client-side. The engine is already React/DOM-free
for exactly this.

---

## Systems

### Compendium — slice 2 BUILT (with the Depths batch; shell shipped in #35)
The bestiary page is real now: save v2 (`bestiary` map, versioned merge in
`persistence.ts`), meta-layer recording on battle end (`enemyLedger` in
`useBattleEngine` → `recordBestiary` on `GameStateContext`; the sim never learns),
and the 3-tier reveal (Undiscovered `???` silhouette → Encountered/Sighted named
silhouette → Defeated full lore via read-only `UnitDetail`). Two sections:
Monsters of the Depths (roster derives from `data/depths.ts` tiers, so it grows
automatically) and Heroes of the Arena (all deckables).
- ~~Per-monster kill counters~~ — shipped as Slayer XP (save v15); the cards
  now carry a slayer track, and crossing a level pays gold (save v16, above).
- Still open: Compendium `lastPage` persistence if it ever gets sub-pages.
- Still open: a **dedicated desktop battle/layout** — the shell is phone-first (gate
  tuned so torches flank on narrow screens; the battle canvas is capped at 480px, safe
  to scale up on desktop since the 480×720 sim is display-independent).

### Engine architecture — UnitKit seam ✅ SHIPPED (PR #41 merged 2026-07-03)
All per-unit behavior lives in one stateless kit per `defId` under
`src/engine/kits/` (registry `kits/UnitKit.ts`); zero `defId` branches remain in
the engine. Adding a unit is one kit file + data. Full design + hook contracts in
**`docs/adr/0001-unitkit-seam.md`**; history in the PR. Nothing left to build here —
future balance passes just use the seam (e.g. the shipped `isIncapacitated` upkeep
suppression).

### Items / equipment for units ✅ BUILT (feat/items-v1, save v9)
Shipped exactly on the old design's anchors — modifiers bake at `createUnit`
(nested rounding, level first), drops are a `{kind:"item"}` chest-content
entry from the seeded `rollChest`, loadout UI lives in the UnitDetail panel +
a new Bag sheet. What grew beyond the sketch: item LINES that persist across
rare→epic→legendary (palette-swapped, signature effect unlocks at legendary),
1–3★ pairwise merging with a combine ceremony, Soul Shards as the premium
currency for legendary-tier merges, six dungeon-signature relics, an arena
enemy item mirror, and per-unit proc effects (execute/lifesteal/thorns/
detonations/tempo/pack tactics/…). All invariants in NOTES §9; specs in
`engine/__tests__/items.test.ts` + `meta/__tests__/inventory.test.ts`.
- Still open: **item-assuming dungeon tier** (harder content band tuned for
  geared warbands). Combine All shipped as the Blacksmith's **Forge All**.

### The Blacksmith — "The Forge" (v1 BUILT 2026-07-14, unshipped)
Replaced the Bag FAB/sheet as the items home: a full-screen NPC smithy on the
ShopScreen pattern (PixiJS set piece + speech-bubble barks + services below).
BagSheet + CombineCeremony deleted; equipping stays in UnitDetail. Services:
**Forge** (the merge ladder with anvil theater — the real item icons ride the
anvil via `drawItemIcon`→Pixi textures), **Salvage** (melt a FREE copy for
gold; the yield table is executable spec — below every acquisition price, no
merge→salvage pump), **Forge All** (gold-only chain-merge to fixpoint in
canonical order; never auto-spends shards — legendary work stays manual),
**Commission** (500g → any chosen base line at rare 1★, no RNG, signatures
excluded). Deliberately STATELESS — no new save fields, no version bump; all
folds in `meta/blacksmith.ts` over existing fields (NOTES §11). Audio:
`blacksmithTheme` ("hearth and hammer", A-rooted, anvil backbeats) + the
smith gibberish voice family (95 Hz gravel) + quench/bellows SFX. Home FAB
pip = `forgeableStackCount` (merge-ready stacks, self-clearing).
- Still open: the smith CHARACTER art (mockup round pending pick — the scene
  ships with a placeholder forge set until then), "Salvage all free ×N" QoL.

### Anticipated meta systems (still out of scope)
Trophies / ranks, accounts / auth, replay-playback UI. (Gold, chests, and unit
unlocks shipped with Economy slice 1; the General Store shipped as slice 5 —
cosmetics tab + real payments remain.) The architecture
leaves room for each; persistence swaps behind `state/persistence.ts`.

---

## Content

### New unit ideas (brainstormed, not built)
Lean on the dormant `haste` / `poison` / `silence` status effects and add counterplay the
roster lacks. Follow the rarity rule (rare = 1 mechanic, epic = 2, legendary = capstone)
and the "adding a unit" checklist in `NOTES.md`.
- **Spearman** (rare) — Skewer: a thrust that pierces to the enemy behind.
- **Arbalest** (rare) — armor-piercing bolts; counters high-reduction units (Druid bear).
- **Witch Hunter** (rare) — Disrupt: every 3rd basic attack briefly Silences the
  target. Accessible anti-caster that wakes the dormant `silence` status; keep the
  silence short / single-target so it stays under the planned epic Spellbreaker.
- **Stalker** (rare) — First Strike: deploys Stealthed; its opening attack deals
  bonus damage, then it's revealed. A rare backline threat that wakes the `stealth`
  status — lighter than the epic Assassin's Vanish.
- **Marksman** (rare) — Execute: bonus damage to enemies below ~35% HP. A focus-fire
  ranged finisher; reuses the target-HP read already in the damage calc.
- **Plague Doctor** (epic) — stacking, spreading poison; shreds swarms.
- **Warlord** (epic) — War Horn grants allies haste; the first offensive support.
- **Spellbreaker** (epic) — silences casters; anti-mage.
- **Phoenix** (legendary) — immolation aura + a once-per-match rebirth.

### Painted image sprites — whole-game visual upgrade (in progress, Phase 0 done)
Replace procedural unit art with AI-painted stills (ComfyUI Qwen-Edit restyle of the
game's own renders), animated by the existing `animOffsets` tween; procedural art stays
as permanent fallback so it ships in waves. Plan:
`~/.claude/plans/is-there-a-way-curried-tulip.md`; recipe/learnings in the
`image-sprites-phase0-mockups` memory. **Next: user picks a style at
`/mockups/image-sprites.html`** (3 candidates × 5 units, animated) → consistency probe →
Phase 1 pilot (imageSprites registry + `drawUnitSprite` seam + battle-canvas DPR fix).

### Beginner tutorial / onboarding (planned)
Resurface first-run guidance (e.g. the in-battle "tap to deploy" hint we removed) only
for new players.

---

## Open questions / design notes
- **Balance:** the Druid is intentionally dominant; revisit if it blocks PvP fairness.
- **Arena farming:** Arena pays 40g + a wooden chest on every win (accepted for
  slice 1 — all numbers in `src/meta/economy.ts` if it needs tuning).
- **Economy numbers are straw-men** — first-pass values; tune once floors 6+ give
  the gold curve room to breathe.

---

## Keeping this fresh
Forward-looking only. When something ships, delete it here (git history records it).
Update this file + relevant memories before a context reset so the next session picks up
cleanly.
