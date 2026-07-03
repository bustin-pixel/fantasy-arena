# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

**Current state:** deterministic 4v4 auto-battler, 24 deckable units, a swipeable
3-page app shell (Collection / Home / Compendium) over a scrolling dungeon-crypt
background, click-to-inspect detail panel, in-battle tooltips, 2v2 + countdown start.
Arena (vs AI deck) + The Depths slice 1 (PvE floor 1 via the Home card — seeded
WaveController horde, fodder-tier monsters, Bloater boss on floor 5) + a live
Compendium (3-tier bestiary reveal, save v2). Deployed to Netlify (auto-deploys
on merge to `master`).

---

## Game modes

### PvE mode — "The Depths" (design locked 2026-07-01; slice 1 BUILT)
A floor-based descent through the dungeon — the Home screen's gate is literally the
entrance. Each floor is a Swarm encounter; every **5th floor is a boss floor**.

**Slice 1 shipped** (see the PR / git log): seeded `WaveController` + `"depths"`
`MatchMode` (per-side `activeCaps`: player 4 / enemy 8), `data/depths.ts` tier +
budget tables, the fodder tier (Giant Rat, Zombie Shambler, + existing Skeleton;
boss **Bloater** with Putrid Burst), and the Home card launching **floor 1**.

**Still to build:**
- **Floor picker + progress** (highest floor cleared, persisted — save-v2 growth);
  the Home card is hardcoded to floor 1 until then. Floor replays / rewards below.
- **Remaining bestiary tiers** (each needs its monsters built first):
  - **6–10** undead: Skeleton Archers, Ghouls, Bonecaller → boss **Abomination**
  - **11–15** deep crypt: Spiders, Imps, Banshee, Plague Shaman → boss **Gargoyle**
  - **16–20** the throne: elite mixes, Spore Pods, Bat Swarms → boss **Lich**
- **Difficulty pass** once floors 2+ are reachable: floor 1 clears in ~15s for a
  full warband (fine for the opener, but tune `waveBudget` / spawn interval /
  monster costs in `data/depths.ts` as the curve extends). Profile before pushing
  the enemy cap to 10–12 (`DEPTHS_ENEMY_ACTIVE`).
- Extras: **3-star floors** (clear without losing a unit → bonus gold); **boss
  first-kills unlock their Compendium page**; **Endless mode** after the campaign
  works (personal-best waves on Home). First-clear rewards ≫ replay rewards so
  farming is possible but descent is always optimal.

### Progression & economy (design locked 2026-07-01)
The loop: battle (any mode) → **chest + gold** → unlock units / equip items → stronger
warband → deeper floors & better Arena. All meta-layer — the sim never learns about
rewards; chest contents roll from a **seed stored at drop time** (deterministic,
server-verifiable later).
- **Gold** (straw-man numbers): PvE first clear `50 + 10×floor` **+ chest** (boss
  floors drop a better tier); floor replays ~15, no chest; **PvP win 40 + chest**;
  PvP loss 10 (never zero).
- **Chests:** **instant-open** at the results screen (a quick reveal ceremony — no
  timers, no queue). Tiers wooden/silver/gold: gold + 1–2 items + a small chance of a
  unit unlock; **duplicate unit drops convert to gold**.
- **Unit unlocks:** new players start with the **starter deck 4** (Ogre, Archer,
  Knight, Fire Mage); key units unlock **free at floor milestones** (designer-controlled
  curve); the rest are **gold purchases** (straw-man: rare 400 / epic 1200 / legendary
  4000). **Existing saves are grandfathered** — a save from an older version keeps every
  unit (migration: version < N ⇒ all current units unlocked). `sanitizeDeck` must also
  enforce deck ⊆ unlocked.
- **Items (v1 small):** 3 slots — weapon (+dmg) / armor (+HP) / trinket (special) —
  × 3 tiers, from chests only; modifiers applied at `createUnit` per the items design
  below; surfaced in the (data-driven) detail panel + a loadout UI.
- **Bestiary rewards** (one-time, granted on the tier-upgrade write into the
  `bestiary` save map — inherently unfarmable): first **encounter** 10–15 gold; first
  **defeat** 40–60 gold (bosses/legendaries also drop Soul Shards); **section
  complete** (all monsters of a floor tier) → Soul Shards + gold; **full Compendium**
  → big Soul payout + a ceremonial title. (v2 idea, parked: per-monster kill-counter
  crests, hunting-log style.)
- **Premium currency — Soul Shards** ("bind the souls of the fallen"; ghost-flame
  wisp icon, matches the game's flame art). **Scarce by design**: earned only from
  boss **first**-kills, bestiary section/full completions, every 10th floor
  first-clear, later achievements — never from replays/farming. **The Soul Shop
  sells distinction, never battle power** (no stat boosts, no revives, no timers):
  - **Unit skins** — palette swaps (cheap: `drawUnitSprite` derives everything from
    `color`/`accent`, so a skin is an alternate color pair in data)
  - **Legendary unit unlocks** — alt path alongside gold
  - **Premium chest** (guaranteed epic+ item, better unlock odds) + **chest reroll
    token** (reroll one item slot)
  - **Titles/flair** under the username ("Lichslayer" — pairs with boss first-kills)
- **Save growth:** `gold`, `soulShards`, `unlockedUnits`, `items` inventory, per-unit
  `loadouts`, owned `skins`/`titles`, `depths` progress (highest floor, stars), and
  reward flags folded into the `bestiary` map — versioned-merge pattern in
  `persistence.ts`, same as the Compendium save-v2 plan.
- **Arena tie-in:** once trophies/ranks exist, Arena's enemy-deck budget scales with
  player progress via the existing `budget` param.

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
- Still open: **per-monster kill counters** (v2 idea, parked with the bestiary
  rewards), and Compendium `lastPage` persistence if it ever gets sub-pages.
- Still open: a **dedicated desktop battle/layout** — the shell is phone-first (gate
  tuned so torches flank on narrow screens; the battle canvas is capped at 480px, safe
  to scale up on desktop since the 480×720 sim is display-independent).

### Engine architecture — UnitKit seam (in progress; PR 1 on `refactor/unitkit-seam`)
Collapse the ~38 `defId`/`ability` branches in `CombatSystem`, the `AbilityId`
`dispatchAbility` switch + `PASSIVE_ABILITIES` in `AbilitySystem`, and the role
heuristics in `MatchController` into **one stateless kit per `defId`** behind a
`UnitKit` seam. Full design (8 locked decisions, the interface, 3 open hook
contracts, migration order) in **`docs/adr/0001-unitkit-seam.md`**.
- **Guardrail:** behavior-identical — `digest()` byte-identical at every commit.
- **Shape:** engine owns the tick skeleton (gate/targeting/cast pipeline); kit gets
  `onTick`/`onActTick` + event/modifier/override hooks + `fireAbility`/`wantsToCast`;
  private state moves to a flat typed `unit.kit` (opportunistically, per-unit).
- **Migration:** strangler-fig (kit-preferred, old-path fallback). Each kit lives in
  `src/engine/kits/`; the registry is `kits/UnitKit.ts` (`getKit`).
- **Done (on `refactor/unitkit-seam`, PR #41), all digest-byte-identical:** scaffolding
  (every seam call site, empty registry) → **Zombie Shambler** (`onAfterAttack`) →
  **Knight** (`fireAbility`+`roleClass`) → **Slime + Slimeling** (`onDamaged` split +
  `onDeath` burst) → **Ogre** (`onDamaged`+`onWouldDie` Second Wind; `fireAbility`
  Crushing Slam) → **Assassin** (`onSpawn` stealth + `onBeforeAttack` Ambush +
  `onWouldDie` Vanish — wired `onSpawn` into deploy + summon flush) → **Berserker**
  (`onTick` Bloodrage + `onWouldDie` Last Stand + `onKill` Bloodthirst + `onAfterAttack`
  Cleave) → **Rogue** (`onSpawn`+`onBeforeAttack`+`onAfterAttack`) → **Aegis Knight**
  (two-phase `modifyIncomingDamage` soak + `onDamaged` bank + `onAfterAttack` Backlash;
  **Warded is now data** — `UnitDef.wardedAgainst`, read in `StatusEffectSystem`) →
  **Druid** (`onTick` bear transform + guard-timer, `onActTick` Rejuv, `modifyIncomingHeal`
  bear +50%, `fireAbility` Summon Wolves — **first `onActTick` user**) → **Mystic Archer**
  (`onTick` Momentum, `onBasicAttack` form shot, **`onProjectileHit`** Light/Dark
  stack+detonate+flip — added that hook; stacks stay flat cross-unit fields) →
  **Hunter** (`onTick` boar re-summon + Scatter Trap laying via new **`ctx.spawnTrap`**,
  `fireAbility` Mend Beast; the boar's guard-charge stays `defId`-gated pending the
  charge-system refactor with the Orc) → **Trickster** (onSpawn stealth, onTick re-cloak,
  onBeforeAttack reveal, **`onReactTick`** Shadow Step — added that hook, the **pre-idle
  reactive slot** reserved at the Druid; retired the last deploy-stealth branch) →
  **Necromancer** (onTick Raise Dead via new **`ctx.tick`**; **`onActTick` returns `true`**
  to OWN its dual Curse/Terrify cast bar and bypass the standard cast chain). **All 14 kits
  migrated — the per-unit strangler-fig is done.**
- **Done (ordinary units, extending the batch past the ADR's 14 — same recipe, all
  digest-byte-identical):** **Warrior** (`onBasicAttack` → true, Whirlwind spin + bleed) →
  **Ranger** (`onBasicAttack` → true, Multishot spread) → **Holy Knight** (`fireAbility`
  Blessing, instant — fires through the instant-cast seam) → **Cleric/`healer`**
  (`fireAbility` Mend + **`wantsToCast`** begin-cast gate — **first `wantsToCast` user**;
  its `mendTarget` helper moved into the kit). Dropped the `blessing` + `mend` cases from the
  `dispatchAbility` switch (12 → 10 live cases).
- **Done (next easy tier — same recipe, all digest-safe):** **Archer** (`fireAbility` Kiting
  Leap, instant) → **Bloater** (`onDeath` Putrid Burst) → **Mage** (`fireAbility` Polymorph +
  `wantsToCast`) → **Engineer** (`onTick` Field Repairs + `fireAbility` Deploy Turret). Dropped
  `kiting_leap`/`polymorph`/`deploy_turret` (switch 10 → 7). Guard covers Archer (seed 20260626)
  + Engineer (777/999); Bloater/Mage aren't in the guard's decks so `bloater.test.ts` (added) and
  `mage.test.ts` are their nets. `AbilitySystem.wantsToCast` collapsed to the `return true`
  fallback; trimmed the imports the deleted casts left unused.
- **Remaining: the cleanup commit** — delete `dispatchAbility`, `PASSIVE_ABILITIES`,
  `isActiveAbility`, `unitRoleClass` internals, and the `?? old-path` fallbacks (only once
  nothing needs them). Still `defId`-gated / on the switch:
  - **Electric Mage** (`chain_lightning`) — a pure cast, **no projectile rider**, so it's an easy
    `fireAbility` migration (the quick next win).
  - **Fire / Ice Mage** — the `fireball`/`frost_blast` casts are easy, but their every-Nth-attack
    burn/freeze **ride the projectile** (`onHitBurn`/`onHitStunSec`), still deferred to the
    candidate-3 projectile on-hit *data-descriptor* (complements the Mystic's `onProjectileHit`
    code-hook); migrate the cast + rider together.
  - **Arcane Mage** — Blink (`defId`-gated, slots into `onReactTick`) + the Arcane Barrage
    streamer (`stepArcaneBarrage`) + the `arcane_barrage` cast.
  - **Orc + Boar** — the `charge`/`stepCharge`/guard-charge shared system; migrate together via a
    charge-system refactor.
  - Switch leftovers not tied to an un-migrated unit: `shield_block` (no owning unit — likely dead)
    and `fear_aura` (invoked internally by the already-migrated Necromancer).
- **✓ onActTick split (RESOLVED, now fully wired):** two distinct post-target slots ended up
  needed. **`onActTick`** fires **POST-idle** (needs a live target): Druid Rejuv (instant →
  returns void → falls through to the standard cast chain) and the Necromancer's dual cast
  (returns **`true`** to OWN the pipeline and bypass the standard chain, locking the unit while
  `castTicks > 0`). **`onReactTick`** fires **PRE-idle** (reacts even when the committed target
  just died): the Trickster's Shadow Step wired it first; the Arcane Mage's Blink slots into
  the same seam when it migrates. Both are passed the loop's `abilityCtx`.
- **First balance dividend after the refactor** (separate commit, own spec): stun
  suppresses Raise Dead / Engineer repair / Hunter traps (move the hook past the gate).
- Retires the `NOTES.md §2` "consider a per-unit traits field" note and the §3
  `PASSIVE_ABILITIES` footgun.

### Items / equipment for units (planned)
Gear that modifies a unit's stats or kit (weapon → +damage, armor → +HP / damage
reduction, trinket → a small effect or extra trait). Design notes:
- Layer item modifiers onto `UnitDef` stats at unit creation (like a buff applied in
  `entities/createUnit.ts`) so the engine stays data-driven.
- **Must stay deterministic** — no random drops mid-battle; any rolls happen in the meta
  layer with a stored seed, never inside the sim.
- Surface equipped items in the hub detail panel (already data-driven) and a new loadout
  UI. Ties into PvE rewards and the rarity model.

### Anticipated meta systems (out of scope today, per README)
Shop, chests, currencies, trophies / ranks, accounts / auth, progression / upgrades,
replay-playback UI. The architecture leaves room for each; persistence swaps behind
`state/persistence.ts`.

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

### Beginner tutorial / onboarding (planned)
Resurface first-run guidance (e.g. the in-battle "tap to deploy" hint we removed) only
for new players.

---

## Open questions / design notes
- **Items + determinism:** decide where rolls happen (meta layer, seeded) so battles stay
  replayable.
- **PvE structure:** campaign vs. endless ladder vs. roguelike run — pick one to prototype.
- **Balance:** the Druid is intentionally dominant; revisit if it blocks PvP fairness.

---

## Keeping this fresh
Forward-looking only. When something ships, delete it here (git history records it).
Update this file + relevant memories before a context reset so the next session picks up
cleanly.
