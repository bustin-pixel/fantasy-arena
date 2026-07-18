# Developer Notes & Audit Findings

A running record of the codebase's state, gotchas, and things to watch when
extending the game. Last full audit: all 7 integrity checks passing, engine
type-clean under strict mode, determinism verified across every unit type.

---

## ✅ Checklist for adding a new unit

Two parts: **data** (stats + what the hub detail panel shows) and **behavior** (a
*kit*, if the unit does anything beyond attack + move). The hub detail panel
(`components/UnitDetail.tsx`) is data-driven, so every unit must surface fully there.

1. **Stats** — define it in `data/units.ts` with full stats (hp, damage,
   attackSpeed, moveSpeed, range, role, color, accent). These render in the panel
   automatically. *Optional data-driven behavior* (no code): `basicShotRider` (an
   every-Nth-attack on-hit rider, like the Fire/Ice mages), `wardedAgainst`
   (status immunities, like the Aegis Knight), and `tags` (creature types —
   `"undead"`/`"skeleton"`; a skeleton carries BOTH. Tribal mechanics key on
   these — the Slime Knight's Absorb Bones eats `"skeleton"`-tagged enemies —
   so tag any new undead/skeletal monster or summon accordingly).
2. **Ability** — its `ability` MUST have a matching entry in `data/abilities.ts`
   (name / description / cooldown / `castTimeSec`). The panel reads
   `ABILITIES[def.ability]` (a missing entry crashes it), and the engine reads the
   cooldown + cast-time from it.
3. **Behavior — the kit.** If the unit does anything beyond a plain attack + move,
   write `engine/kits/<unit>.ts` and register it in `kits/UnitKit.ts` (keyed by
   `defId`). Implement **only** the hooks it needs and declare `roleClass`. The
   hooks: `onTick` / `onActTick` / `onReactTick`, `fireAbility` / `wantsToCast`, the
   HP-funnel hooks (`onDamaged` / `onWouldDie` / `onKill` / `modifyIncoming*`), the
   attack split (`onBeforeAttack` / `onBasicAttack` / `onAfterAttack`),
   `onProjectileHit`, `onChargeContact`, `onSpawn` / `onDeath`, and the death
   OBSERVER `onUnitDeath` (fired on every other living unit when anyone dies —
   the Slime Knight's Absorb Bones; the observer filters team/tags/radius itself). **Never edit
   `CombatSystem`/`AbilitySystem` per-unit** — they have no `defId` branches, and
   there is **no** `PASSIVE_ABILITIES` list: "passive" just means the kit defines no
   `fireAbility`. A pure-stat unit needs no kit at all. Copy an existing kit as a
   template; the interface lives in `kits/UnitKit.ts`, the design in `docs/adr/0001`.
4. **Traits** — add a `traits: [{ name, description }]` array so any passive/hidden
   behavior shows in the panel (e.g. Second Wind, Vanish, Frostbite). Pure-stat
   units can omit it.
5. **Test** — add or extend a spec in `engine/__tests__/<unit>.test.ts`.
6. **Visibility** — non-summon units appear in the hub automatically via
   `DECKABLE_UNIT_IDS` (everything not in `NON_DECK_UNITS`).
7. **Verify** — `npm run typecheck` + `npm test`, then open the unit's card in the
   hub and confirm stats, ability, and traits all show.

## ⚠️ Maintenance hazards (read before adding code)

### 1. Unit id ≠ display name for two units
The internal `id` and the player-facing `name` diverge here:

| internal id   | display name |
|---------------|--------------|
| `summoner`    | **Druid**    |
| `healer`      | **Cleric**   |

These were renamed in the UI but kept their original ids so saved decks
wouldn't break. **Always reference units by their `id`** (`"summoner"`,
`"healer"`), never by the display name. Several pieces of engine logic key off
the id literal (e.g. the UnitKit registry maps `"summoner"` → the Druid's kit).
If you ever add a unit, make the id match the name to avoid extending this trap.

### 2. Hardcoded unit-id checks in CombatSystem
**✅ MIGRATION COMPLETE** (`docs/adr/0001-unitkit-seam.md`): every unit's mechanics
moved into one kit under `src/engine/kits/` (or, for the Fire/Ice riders, into
`UnitDef` data) — **the whole list below is struck, and the cleanup shipped**: the
`dispatchAbility` switch, `tryCastAbility`/`fireCastAbility`, `PASSIVE_ABILITIES` /
`isActiveAbility`, the `AbilitySystem.wantsToCast` fallback, and `unitRoleClass`'s
ability heuristic are all deleted. Whether a unit has an active cast is now "its kit
defines `fireAbility`"; each kit declares its `roleClass`. Kept as engine plumbing
(field-gated, not `defId`): `stepCharge`, `stepArcaneBarrage`, and the free
`onProjectileHit` projectile resolver. All commits stayed digest-byte-identical.

Formerly gated by `defId` string literals in `CombatSystem.ts` (all now migrated):
- ~~`"summoner"` → Druid bear transform at 30% HP~~ — **migrated** to
  `kits/druid.ts` (onTick bear transform + guard-timer countdown, onActTick
  Rejuvenation, modifyIncomingHeal bear +50%, fireAbility Summon Wolves). First
  `onActTick` user: the seam now fires **post-idle** (after the target-dead
  idle-out, where an instant act needs a live target); the reactive **pre-idle**
  slot (Blink / Shadow Step) is a reserved call site, wired when Arcane/Trickster
  migrate.
- ~~`"ogre"` → Second Wind full-heal at 25% HP~~ — **migrated** to `kits/ogre.ts`
  (onDamaged + onWouldDie; Crushing Slam → fireAbility)
- ~~`"berserker"` → Bloodrage damage/speed scaling + melee Cleave (AoE swing)~~ —
  **migrated** to `kits/berserker.ts` (onTick Bloodrage, onWouldDie Last Stand,
  onKill Bloodthirst, onAfterAttack Cleave)
- ~~`"assassin"` → Vanish death-cheat~~ — **migrated** to `kits/assassin.ts`
  (onSpawn opening stealth + onBeforeAttack Ambush + onWouldDie Vanish). First
  `onSpawn` user — the hook is now wired in `MatchController.deploy` + the summon flush.
- ~~`"slime"` / `"slime_clone"` → split-on-damage and death explosion~~ —
  **migrated** to `kits/slime.ts` (onDamaged split → damageSpawns; onDeath burst)
- ~~`"aegis_knight"` → soaks magic, Backlash AoE, Warded~~ — **migrated** to
  `kits/aegisKnight.ts` (two-phase `modifyIncomingDamage` soak + `onDamaged` bank +
  `onAfterAttack` Backlash; `isMagicSource` moved into the kit). **Warded is now
  data-driven**: `UnitDef.wardedAgainst: StatusEffectType[]`, read in
  `StatusEffectSystem.applyEffect` — a static resistance, like `school`/`lifesteal`.
- ~~`"engineer"` → Field Repairs (defId-gated periodic heal of itself + nearby
  turrets)~~ — **migrated** to `kits/engineer.ts` (onTick Field Repairs on the 2s
  cadence + fireAbility Deploy Turret; covered by the digest guard via seeds
  777/999). `"turret"` → stationary (moveSpeed 0) ranged construct, summoned via
  Deploy Turret (a non-deck summon, like `skeleton`/`wolf`) — no kit of its own.
- ~~`"necromancer"` → custom dual-cast (Curse DoT / Terrify fear on one cast bar) +
  Raise Dead~~ — **migrated** to `kits/necromancer.ts` (onTick Raise Dead every 5s;
  onActTick runs the dual Curse/Terrify cast bar). The Necromancer OWNS its cast
  pipeline: its `onActTick` returns `true`, so the engine bypasses the standard
  cast-handling chain (and locks the unit while `castTicks > 0`) — the mechanism
  that lets `onActTick` serve both an instant act (Druid) and a full custom pipeline.
  Added `ctx.tick` to the AbilityContext (Raise Dead is synced to the global tick).
- ~~`"rogue"`~~ — **migrated** to `kits/rogue.ts` (onSpawn stealth + onBeforeAttack
  reveal + onAfterAttack Venom).
- ~~`"trickster"` → opening stealth + reveal-on-strike + re-cloak + Shadow Step~~ —
  **migrated** to `kits/trickster.ts` (onSpawn stealth, onTick re-cloak, onBeforeAttack
  reveal + re-cloak restart, **onReactTick** Shadow Step). Added the `onReactTick` hook
  — the **pre-idle reactive act slot** (fires before the target-dead idle-out, so it
  interrupts any nearby caster even when its own target just died), the first user of the
  slot reserved at the Druid. (The Arcane Mage's Blink later joined this same seam —
  `kits/arcaneMage.ts`.) The Trickster was the last stealther (Rogue
  already migrated), so the deploy-stealth `defId` branch in `MatchController` is now gone.
- ~~`"warrior"` → Whirlwind: its melee swing is replaced by an AoE spin — hits every
  enemy within melee reach (`range + radius`) for its damage and applies a
  refreshing bleed (poison-type DoT, non-stacking)~~ — **migrated** to
  `kits/warrior.ts` (onBasicAttack → true, replacing the swing with the spin + bleed;
  no lifesteal). `ability` slot stays the passive `whirlwind`.
- ~~`"ranger"` → Multishot: every second basic attack looses three arrows at once,
  each locked onto a different enemy in range (committed target + the two nearest
  others, nearest-first with a uid tiebreak). Against a lone foe only one arrow
  spawns, so it's an anti-swarm spread~~ — **migrated** to `kits/ranger.ts`
  (onBasicAttack → true, the every-2nd-shot spread). `ability` slot stays the
  passive `multishot`.
- ~~`"mystic_archer"` → Light/Dark form-tagged shots + on-hit stack/detonate
  resolution (`resolveMysticHit`) + Momentum~~ — **migrated** to
  `kits/mysticArcher.ts` (onTick Momentum recompute, onBasicAttack form shot,
  **onProjectileHit** Light/Dark stack+detonate+flip). Introduced the
  `onProjectileHit` kit hook — the *code-hook* half of projectile-on-hit,
  dispatched from `stepProjectiles` via the SOURCE unit's kit (keyed on the
  `mystic_shift` tag; the Ice/Fire *data-descriptor* half stays deferred to
  ADR-candidate 3). The Light/Dark stacks stay FLAT on the victim
  (`lightStacks`/`darkStacks`) — cross-unit state kept flat per the ADR's
  opportunistic fallback, not a `unit.kit` namespace. `ability` slot stays
  `momentum` (the headline passive in the UI; still explained by the Light Form /
  Dark Form *traits*).
- ~~`"hunter"` → Boar Companion (auto-summon) + Scatter Trap laying + Mend Beast~~ —
  **migrated** to `kits/hunter.ts` (onTick boar re-summon + trap laying via the new
  `ctx.spawnTrap`; fireAbility Mend Beast). Added `spawnTrap` to the ctx spawn family;
  the generic trap TRIGGER (stun on step-on) stays plumbing in CombatSystem over
  `state.traps`. **The Boar is now migrated too** (`kits/boar.ts`, below).
- ~~`"orc"` → Charge (arm) + `"boar"` → guard-charge (arm) + the `stepCharge`
  contact effect (Orc slam / Boar taunt)~~ — **migrated** via a charge-system refactor:
  `stepCharge` is now the shared, **defId-free** dash driver (field-gated on
  `chargeTicks`, like `stepArcaneBarrage`); the kits arm the rush (`kits/orc.ts`
  fireAbility / `kits/boar.ts` onTick, guarded to keep its old post-gate spot) and
  resolve the impact via the new **`onChargeContact`** hook. Orc `castCharge` left the
  dispatch switch. Guard-covered (Orc seed 20260626, Boar via the Hunter in 777/999);
  `orc.test.ts` + `boar.test.ts` added.
- ~~`"zombie_shambler"` → Numbing Bite~~ — **migrated** to `kits/zombieShambler.ts`
  (onAfterAttack: 30% move+attack slow for 2s). First UnitKit migration.
- ~~`"bloater"` → Putrid Burst: on death it ruptures — 30 AoE damage + a poison
  DoT to every enemy within 110px (same one-shot safety as the slime burst)~~ —
  **migrated** to `kits/bloater.ts` (onDeath, fired by the same seam as the Slime
  burst; not in the digest guard, so `bloater.test.ts` is its safety net). Depths
  tier-1 boss, never in a deck. (The Giant Rat is pure stats — no gate.)
- ~~`"arcane_mage"` → the Blink defensive teleport + the Arcane Barrage arm~~ —
  **migrated** to `kits/arcaneMage.ts` (onReactTick Blink on its own `blinkCooldown`;
  fireAbility ARMS the 3-shot volley). The Arcane Barrage **streamer**
  (`stepArcaneBarrage`, firing the queued missiles via `barrageShots`/`barrageTimer`/
  `barrageTargetUid`) **stays in CombatSystem** — it's field-gated on `barrageShots`,
  not `defId`, so like `stepCharge` it's engine plumbing the kit only arms (the same
  split as the Hunter's traps). Basic attack is the default ranged shot.
- ~~`"fire_mage"` / `"ice_mage"` → every-Nth-attack burn/freeze riders (the
  `onHitStunSec`/`onHitBurn` projectile fields set via `defId` in performBasicAttack)~~
  — **migrated**: the casts (`fireball`/`frost_blast`) moved to `kits/fireMage.ts` /
  `kits/iceMage.ts` (fireAbility), and the riders became **pure `UnitDef` data**
  (`basicShotRider: { everyNthAttack, rider }`, like `wardedAgainst`). The projectile now
  carries a generic `rider: ShotRider` descriptor — the DATA half of projectile-on-hit
  (the Mystic's `onProjectileHit` kit hook is the CODE half) — applied generically in
  `stepProjectiles`. The `fireball`/`frost_blast` impacts still resolve in the shared
  `onProjectileHit` resolver, keyed on the ability tag (like `arcane_barrage`). **This was
  the last per-unit `defId` branch — the migration is complete.**

This worked but wasn't data-driven — hence the UnitKit migration above (ADR
0001), which replaces the "consider a per-unit passive-traits field" idea with
one stateless kit per `defId` behind a seam.

### 3. Ability slot vs. passive properties
`lifesteal` started as an *ability* but is now also a unit *property*
(`def.lifesteal: number`). The Orc has `ability: "charge"` AND `lifesteal: 0.4`.
**Passive vs. active is now decided by the kit, not an allowlist:** a unit has an
active cast *iff* its kit defines `fireAbility`. The old `PASSIVE_ABILITIES` set /
`isActiveAbility` footgun (remember-to-add-your-passive-or-it-wastes-cycles) is
GONE — a passive unit simply has no `fireAbility`, so the cast seam skips it. (The
Arcane Mage is an example of a unit with two abilities: an *active* slot — Arcane
Barrage via `fireAbility` — plus a *second* one, Blink, that runs off its own
`blinkCooldown` in `onReactTick`.)

**The `lifesteal` filler convention is display-load-bearing:** summons and Depths
monsters use `ability: "lifesteal"` as a "never casts" placeholder, and
`UnitDetail` HIDES that slot unless the unit actually sets `def.lifesteal` (only
the Orc does). So a monster's real kit must live in `traits` — which the
Compendium's lore page shows — and giving a unit the lifesteal slot without
`def.lifesteal` means it displays no ability at all (correct for monsters,
a bug for a deckable hero).

### 4. Summon caps protect the frame-budget ceiling
`CombatSystem` enforces a per-team live-unit cap when flushing spawns, derived
from `state.activeCaps` (the per-side concurrent caps): `activeCaps[team] + 3`,
or `+ 5` for slime clones. Arena (caps 2/2) keeps its proven 5/7 ceiling; The
Depths (player 4 / enemy 12, set by MatchController in `"depths"` mode) scales
to 7/15. The enemy cap was raised 8 → 12 in the floor rebalance — desktop
preview profiled ~357fps with the horde active; re-profile on real mobile
hardware if frame drops get reported, and drop toward 10 if needed.

### 4b. Depths floor rebalance (2026-07-05) — how the difficulty is tuned
Two dials in `data/depths.ts`: `waveBudget` (25 + 3×floor — LENGTH) and
`floorStatMultipliers` (+8% HP / +5% dmg per floor past 1, linear — DIFFICULTY;
applied at spawn in `WaveController`, bosses included, so bestiary stats stay
floor-1-true). Boss floors keep 70% of budget as fodder (halving it made floor
5 EASIER than floor 4). Depths runs on `DEPTHS_MATCH_TIME_SEC` (300s) because
timeout-while-outnumbered = defeat. Headless winrate sweep (starter deck,
30 seeds/floor, harness pattern: deploy 4 + tick to terminal): floor 1
100%/82%HP → floor 3 100%/63% → floor 4 77%/34% → floor 5 80% (starter) but
37% (knight/warrior/healer/fire_mage) — deck choice brackets the boss coin
flip. Bloater was buffed 380hp/16 → 800hp/28 as part of this. If you retune,
re-run a sweep like that rather than eyeballing. The reusable harness now lives
at `engine/__tests__/winrateSweep.test.ts` (SKIPPED by default; `SWEEP=1 npm
test -- winrateSweep`) — it sweeps every dungeon×floor at a chosen level/gear
tier and prints winrate tables. Prefer it over hand-run drivers.

Sloughing Mass (2026-07-05): the Bloater then gained the Slime's split — a
Bloatling (200hp/14dmg, `bloatling`, weaker Putrid Burst) sloughs off at each
25% HP threshold, up to 3. That's ~600 effective HP + 3 extra bursts on top of
the numbers above, so the floor-5 winrates in the sweep are now stale — re-run
before retuning anything in this tier. Bloatlings spawn at BASE stats (no
floor multiplier — the kit's `spawnUnit` path is floor-blind, same as every
summon), and they share the slime-clone's raised summon-cap headroom (+5) in
CombatSystem so splits aren't swallowed on a crowded boss floor.

### 4c. Boss-floor wave gating (2026-07-06) — the boss is a climax, not a swarm
On a boss floor the fodder no longer shares the field with the boss. The
`WaveController` (`engine/WaveController.ts`) is a small state machine for boss
floors: the whole fodder pool must be fully CLEARED (no living enemies) before
anything else; then the rare quest catalyst (if it rolled) enters ALONE, then the
boss. The rare
and the boss are each preceded by a ~2s telegraph banner (`BOSS_TELEGRAPH_SEC` /
`BOSS_BANNER_SEC`, `data/depths.ts`): `state.waveBanner` (a `WaveBanner`) rides the
snapshot to `BattleHud`'s centered `.wave-banner` overlay. Non-boss floors keep the
continuous trickle (`stepTrickle`). Invariants preserved: monster composition +
spawn positions are byte-identical to the old single-queue build (SAME RNG call
order — only the pacing changed), and the un-spawned boss still counts as an
`enemyReserve`, so the win check never fires during the telegraph lull. Applies to
every dungeon's boss floors, the Depths included. Knobs: `BOSS_TELEGRAPH_SEC` /
`BOSS_BANNER_SEC`. Tests: the `depths.test.ts` boss-floor drain helpers now CLEAR
the field each step so the gated fodder pool / rare / boss advance (a static drain
stalls forever); the "boss-floor pacing" describe covers the gated pool +
rare→boss telegraph order. ⚠ Banner display is timed in SIM TICKS, so at
3× the on-screen flash is ~1/3 the wall-clock time (a screenshot-capture gotcha).

### 4d. Progression retune (2026-07-13) — the whole chain is now winnable
The `winrateSweep` harness revealed the post-Depths chain was tuned for a
near-max warband: at "just-arrived" power every themed dungeon swept **0–6%**,
and **every boss floor swept 0%** — a 4-unit deck cannot beat a sustained cap-12
swarm below legendary gear. (The old Depths-only sweep never caught this.) The
retune brings the chain to a smooth, monotonic-ish ramp that a leveled/geared
warband clears, keeping the swarm feel and a real grind. Levers pulled (all
sweep-tuned — re-run `SWEEP=1 npm test -- winrateSweep` before touching them):

- **Enemy active cap `12 → 7`** (`constants.ts` `DEPTHS_ENEMY_ACTIVE`) — the
  single biggest lever. 4-vs-12 was unwinnable at mid power regardless of level;
  4-vs-7 keeps the horde feel and is beatable. (Summon-cap headroom rides it:
  `flushSpawns` cap = `activeCaps + 3` = 10, so Bloater/Slime splits still fit.)
- **Wave budget `25 + 3f → 20 + 2f`** (all dungeons' `budgetBase`/`budgetPerFloor`
  in `dungeons.ts`) — shorter floors, so a 4-deck isn't grinding a sustained swarm
  long enough to lose the attrition war on F2–F4.
- **Floor scaling `0.08hp/0.05dmg → 0.06hp/0.04dmg`** (`depths.ts`
  `DEPTHS_HP_PER_FLOOR`/`DMG`) — the per-floor multiplier compounds with the
  elite-level bake on bosses; at 0.08 deep-floor boss HP was inflated so far that
  mid-tier boss floors were 0% even at their intended gear.
- **Boss-floor fodder share `0.7 → 0.45`** (`depths.ts` `BOSS_FLOOR_FODDER_SHARE`)
  — the boss is the climax, not a fodder slog; the warband reaches it fresher with
  time to burn its HP. (This re-introduces the "boss floor can be easier than the
  floor before it" the old note warned about — accepted: the boss, not the horde,
  is the point.)
- **Bonefields roster thinned** (`skeleton_archer 2→3`, `bonecaller 4→5` cost) —
  it was a pathological outlier (cheap ranged + raise-dead = a self-replenishing
  kiting swarm, harder than the all-melee Wilds after it).
- **Two Stage-B boss mechanics softened** as over-tuned initials: Dire Alpha howl
  fear `1s → 0.5s` (a full fear chain-locked the player out of damaging it),
  Elder Treant Regrowth `2.5%/s → 1.5%/s` (was an un-burstable wall; burning still
  stops it entirely).

Post-retune sweep (representative deck knight/fire_mage/berserker/healer, level
descent-modeled `min(10, monsterLv+1+floor)`, gear per tier; 16 seeds/cell —
winrates, not exact):

| dungeon (gear) | F1 | F2 | F3 | F4 | F5 boss |
|---|---|---|---|---|---|
| depths (none) | 100 | 100 | 100 | 100 | 100 |
| bonefields (none) | 94 | 69 | 63 | 56 | 94 |
| wilds (none) | 100 | 100 | 75 | 31 | ~20* |
| overgrowth (rare2) | 100 | 100 | 88 | 63 | ~20* |
| sealed_vault (rare2) | 94 | 75 | 31 | 6 | 63 |
| deep_forge (epic1) | 100 | 75 | 63 | 13 | 31 |
| eclipse_spire (epic1) | 100 | 88 | 50 | 13 | ~10* |
| fallen_cathedral (leg1) | 100 | 100 | 100 | 100 | 75 |
| rogues_den (leg1) | 100 | 100 | 100 | 94 | 31 |

Still-open tuning (left for the next sweep pass — the harness is the tool): a few
boss floors (*wilds/overgrowth/eclipse_spire, Rogue's Den's Bandit King) are a
notch too hard for their intended gear tier — they read as a "farm one more gear
tier" gate rather than a coin-flip, which is a legit grind gate (replay chests +
shop + quest board feed the gear), but ~40–50% would be nicer. Sealed Vault's
F3–F4 dip is partly intended matchup (its horde is all `school:"magic"` — the
Aegis Knight's soak is the answer, which a generic sweep deck lacks).

### 4e. Economy + acquisition retune (2026-07-13)
- **Replay gold scales with dungeon depth** (`economy.ts` `replayGoldFor` =
  `20 + 4·monsterLevel`; Depths 24 → forks 60) — replaces the flat 30, so farming
  the late chain stays worthwhile.
- **Boss-replay chests** (`economy.ts` `BOSS_REPLAY_CHEST_CHANCE = 0.4`): a boss
  *replay* (re-clearing a beaten boss) can drop a chest one tier below its
  first-clear tier, signature-line roll intact — the "farm this boss for gear"
  loop. Rolled on a derived stream `RNG(chestSeed ^ BOSS_REPLAY_CHEST_SALT)` so
  first-clear seeds stay byte-stable (`rewards.ts`). Cathedral/Den first-clears
  bumped to `arcane` so their replay chests are `gold`.
- **Fork elites out-level the player at every tier**: `MONSTER_LEVEL_CAP` (41)
  in `dungeons.ts` is now the ELITE band's ceiling (`TIER_BANDS.elite[1] +
  ELITE_LEVEL_BONUS`), **no longer derived from the player's LEVEL_CAP** — the
  fork bosses/rares land one notch over each band's top (Normal 21, Hard 31,
  Elite **41**, eleven past a maxed Lv-30 warband). A future player-cap change
  must retune `TIER_BANDS` (data/tiers.ts), not this clamp.
- **Starter is all-rare** (`STARTER_UNIT_IDS` knight/archer/warrior/mage) and
  **every dungeon gifts a unit on a first clear** (`Dungeon.milestoneUnlocks`,
  `floor → unitId`, read via `milestoneUnlocksFor` — a dungeon owns its own
  facets). INVARIANT (rewards.test): a unit a dungeon's fusion quest REQUIRES is
  a starter or gifted at/before that dungeon's quest — you always own the key
  before the lock. Save **v12** retro-grants gifts for cleared floors
  (`persistence.migrateSave`).
- **A dungeon owns its facets** (`data/dungeons.ts`): `bossChestTier`,
  `capstone`, and `milestoneUnlocks` live on the def (they used to be parallel
  `Record<dungeonId, …>` maps in `meta/rewards` + `meta/economy`). The facets
  that CAN'T move — `DUNGEON_TRACKS` (audio/music), the splash `SCENES`
  (compendium), `WORLD_POINTS`/`ATLAS_BIOMES` (atlas) — all sit in layers that
  import `data/dungeons`, so moving them would cycle. Every one of those lookups
  **falls back silently** (Depths music, armory still-life, no pin), so
  `data/__tests__/dungeonFacets.test.ts` asserts each dungeon has an entry.
  **Adding a dungeon? A red line there is the checklist.**

### 4f. Bespoke boss kits (2026-07-13) — engine-contract changes
The 10 copy-paste boss/rare kits (`abomination`/`dire_alpha`/`elder_treant`/
`rune_golem`/`forge_golem`/`bandit_king` bosses + `apex_beast`/`wildheart`/
`ancient_automaton`/`eclipse_herald` rares) each got a purpose-built kit
(`engine/kits/*.ts`, registered in `UnitKit.ts`). Three contract changes worth
knowing:
- **Traps carry a rider now.** `Trap` gained `rider?: ShotRider` + `sourceUid?`
  (`types/index.ts`); the trigger in `CombatSystem` applies the rider via the
  shared `applyItemRider` when present, else the default 7s stun. Absent field ⇒
  the Hunter's stun trap is byte-identical. Lets the Forge Golem lay burn vents
  with no defId branch.
- **Two new flat Unit fields**: `bossPhase` (HP-threshold phases fired — Dire Alpha
  howls, Rune Golem plate shatters, Bandit King smoke, Apex Beast one-shot Pounce
  marker) and `bossStacks` (Apex Frenzy per-kill ramp). Init 0 in `createUnit`;
  the ADR's opportunistic-flat-field convention.
- **Seraph resurrection widened**: `fallenHero()` now skips only `SUMMONED_UNIT_IDS`
  (was deckable-only), so the `fallen_seraph` boss revives its fallen MONSTER
  wave-mates (its signature moment) while the player Seraph is unchanged in
  practice. `bossRevamp.test.ts` covers all 10 kits + the trap rider + the rez.
- **`onSpawn` gotcha**: `WaveController.spawnMonster` does NOT call `kit.onSpawn`
  (only deploy / summon-flush / endless do). Dungeon boss/rare openers must arm
  themselves elsewhere (Apex Beast's Pounce uses a `bossPhase` one-shot in
  `onBeforeAttack`, not `onSpawn`). The Silencer's opening stealth is a
  pre-existing casualty of this — unrelated to the revamp.

### 5. The Depths spawns bypass the deploy() path
`WaveController` (the PvE horde director) pushes monsters into `state.units`
directly — no deck bookkeeping, no deployment records (waves rebuild
deterministically from seed + floor, so replays don't need them). Its queue
doubles as `enemyReserves`, which is what keeps a momentarily-cleared board
from counting as victory while monsters are still waiting off-screen. It owns
a private RNG stream, so Depths never perturbs Arena determinism.

### 6. Sprite art is presentation-only and portrait-stub-safe
`assets/sprites.ts` draws every unit procedurally (no art assets), consumed only by
the read-only `Renderer`. Sprite edits are pure presentation — they never touch
determinism or the test surface (nothing under test imports it). Two traps when
editing a draw routine:
- **Portraits pass a minimal `Unit` stub.** `renderPortrait` (`Renderer.ts`) fakes a
  unit with only `defId`/`facing`/`animState`/`animTime`/`attackSpeed`/`state` — no
  `uid`, `effects`, `transformed`, or `mysticForm`. Guard every such read
  (`unit.effects?.…`, `unit.mysticForm` defaulting, hashed-uid phase falling back to
  0), or the hub/Compendium card throws and trips the app ErrorBoundary. Any new
  per-unit field a sprite reads needs the same guard.
- **Ambient loops use a wall clock, not `unit.animTime`.** `animTime` resets to 0 on
  every state change (AnimationSystem), which would pop looping embers/wisps/gleams.
  `drawUnitSprite` builds a presentation-only clock from `performance.now()` + a
  per-unit phase hashed off `uid`; static portraits pass `live:false` to freeze it and
  skip the particle emitters. Wall time is fine here — it never feeds back into the sim.
- **Bodies must be authored facing right (+x).** `drawUnitSprite` flips via
  `ctx.scale(unit.facing, …)` where `facing = 1` means "my target is to my right" —
  a body drawn head-left shows its target its tail (and its attack lunge goes
  backwards). The giant rat is authored head-left and corrected with a
  `ctx.scale(-1, 1)` mirror at the top of its draw fn (the wolf/boar were rebuilt
  head-right in their glow-ups); draw new bodies facing right, or add the same
  mirror.

Per-unit variation is data-in-code, not forked draw fns: the two knights share
`drawKnight` + a `KnightLivery` colour set; the five mages share `drawMage` + an
element tag; the Mystic Archer reads `unit.mysticForm` for its gold/violet aura.
Shared body, per-unit colour — keep it that way.

### 7. The economy is meta-layer only (and its invariants)
Rewards/chests/unlocks (Economy slice 1) never touch the sim. Rules that keep it
sound:
- **Every number lives in `src/meta/economy.ts`** — prices, gold rewards, chest
  odds, milestone unlocks. Tune there, nowhere else. `src/meta/` must never
  import from `state/`, `engine/`, or React (types-only imports are fine).
- **Chest rolls are pure + seeded** (`src/meta/rewards.ts`): the drop-time seed
  is stored on the `ChestResult`, so a server can re-roll and verify. Never
  `Math.random()` in reward logic.
- **Grants happen exactly once**: BattleScreen's `recordedRef` guards the
  battle-end effect, and `grantBattleRewards` folds EVERYTHING (gold, chest
  contents, floor progress, milestone) into ONE `setSave`. Keep `setSave`
  updaters pure — StrictMode runs them twice in dev; roll first, then fold.
- **deck ⊆ unlockedUnits** is enforced in `sanitizeDeck` (persistence) AND
  `setDeck` routes through it. New units added post-v3 arrive locked for
  everyone — only the one-time v2→v3 migration grandfathers everything.
- **Grant-then-reveal**: rewards are committed before the results overlay
  animates; the chest tap is ceremony, so leaving early can't lose loot.
- **Quest-locked units** (`QUEST_LOCKED_UNITS`, in `data/dungeons.ts`, derived
  from EVERY dungeon's `quest` — data files so the engine can read them too) are a
  THIRD ownership state between locked and owned: `save.questUnlocks` (v5) means "the
  quest is done → the unit is now BUYABLE" (at the quest's discounted `price`),
  distinct from `unlockedUnits` ("owned"). They're withheld from chest drops
  (`CHEST_POOL` filter in rewards.ts), from the grandfather grant, and from
  `purchaseUnit` until earned. The earn signal rides the existing reward fold:
  `computeBattleRewards` sets `questUnlock` when the fielded `deck` + battle
  `slain` satisfy a floor's quest (Slime Knight = beat the rare Floor-5 Slime
  with a Knight). Three UI surfaces read the state: the card badge + the detail
  footer (`HubScreen` → `CardPortrait.lockLabel` / `UnitDetail.lockHint`+
  `unlockPrice`) and the results callout (`RewardPanel`).
- **Dungeons are data** (`data/dungeons.ts`): a `Dungeon` owns its tiers/boss/
  scaling/budget/theme/floors + one rare-spawn `quest`. The Depths is
  `DUNGEONS.depths` (wraps the legacy `depths.ts` tuning unchanged → byte-identical
  waves; that's why `depths.ts` still exports the Depths globals + the shared
  `DepthsTier`/`RareSpawnQuest` shapes). WaveController, MatchController (`dungeonId`
  opt), `computeBattleRewards` (`dungeonId`), `FloorPickerSheet`, and the new
  `DungeonMapSheet` are all dungeon-driven; the depths branch reads `dungeon.theme`.
  **Save v6**: `save.dungeons` (per-dungeon `{highestClearedFloor}` map, via
  `highestClearedFloorOf`) replaced the single `save.depths`; `migrateSave` copies the
  legacy field into `dungeons.depths`. Adding a themed dungeon = a `DUNGEONS` row
  (incl. its `monsterLevel` + `gate` link into the chain — see §8) + its
  monsters (kits/sprites reuse existing draws) + a `quest` row (auto-joins
  `QUEST_LOCKED_UNITS`, so the reward legendary becomes quest-exclusive for free).
  All six themed dungeons are built (PR #50). **The dungeons form a gated chain**
  (registry order = chain order: Depths → Bonefields → Wilds → Overgrowth →
  Sealed Vault → Deep Forge → Eclipse Spire), each `gate: {dungeonId, floor}`
  requiring the previous dungeon's floor 5. `isDungeonUnlocked` NEVER re-locks a
  dungeon that has its own cleared progress (pre-chain saves may hold
  out-of-order clears). Boss-floor first-clear chests grade up the chain via
  `bossChestTierFor` (rewards.ts): Depths silver → themed gold → Deep Forge
  arcane → Eclipse Spire dragon — then the difficulty tier bumps that grade up
  the ladder (`effectiveBossChestTier`: Hard +1, Elite +2, clamped at dragon),
  so arcane/dragon also drop from Hard/Elite runs and deep endless milestones.

### 8. Unit levels are a match INPUT; summons inherit via the spawn queue

Unit XP/levels (save v8, `save.unitXp` — TOTAL XP per defId; the level is ALWAYS
derived via `meta/leveling.levelFromXp`, never stored) scale hp/damage only.
Rules that keep the system sound:

- **Every number lives in `src/meta/leveling.ts`** (cap, +5%HP/+3%DMG per level,
  XP rewards, the 25·(L−1)·L cost curve). The pacing targets are an executable
  spec in `meta/__tests__/leveling.test.ts` — a retune must keep them true (or
  consciously change them).
- **The bake happens in ONE place**: `createUnit(defId, team, pos, level)`.
  Level 1 is the exact identity, so unleveled sims are byte-identical to
  pre-leveling builds. Levels are a deterministic match input (like the seed):
  `MatchOptions.unitLevels`, frozen by BattleScreen at mount (useState
  initializer — re-deriving from live save after the grant would re-create the
  match under the results screen) and recorded in `ReplayData.unitLevels`.
- **Summons inherit their creator's level via the spawn-queue `level` stamp**
  (both `pendingSpawns` and `state.damageSpawns` in CombatSystem carry it;
  `flushSpawns` bakes it before `init` runs, so inits that derive from maxHp —
  Slime Knight rebirth — scale correctly). This is FREE for any kit using
  `ctx.spawnUnit`. A NEW spawn path that calls `createUnit` directly must
  choose a level explicitly (endless boon pets deliberately stay level 1 —
  they scale by the wave curve instead).
- **Dungeon monsters have REAL levels too** (the counter-curve made visible):
  WaveController spawns everything at the dungeon's tier-banded level — bosses
  and rare quest catalysts at +1 via `monsterLevelFor(dungeon, kind, tier)` —
  through the same `createUnit` bake, so badges/tooltips render and their
  summons inherit for free. The Normal ladder (1/4/7/9/11/14/17 along the gate
  chain, then 20/20 at the fork; Eclipse Warden Lv 18) IS the 1–20 band and
  tracks the player's expected arrival level toward the Lv-30 cap; both sides
  ride the same +5%/+3% curve, so "monster Lv = your Lv" reproduces the tuned
  difficulty. The per-floor multiplier stays a SEPARATE post-bake layered on
  top (nested rounding: `round(round(def × lvlMult) × floorMult)` — tests
  asserting exact stats must nest, not flatten). The two mechanisms compose
  but never merge. **Endless monsters stay level 1 on purpose** (its own
  compounding wave curve is the difficulty; a leak would double-dip), and the
  **arena mirror** is unchanged: arena AI spawns at the player's average deck
  level (`MatchController.enemyLevel`) so the fair-fight mode stays fair.
- **The difficulty TIER is the third frozen match input** (save v14): picked on
  the atlas sheet (`FloorInfoPanel` pills), stamped into `DungeonRun.tier`, and
  plumbed `MatchOptions.tier → WaveController → monsterLevelFor` exactly like
  `unitLevels` — it never draws RNG, so one seed spawns the identical
  composition/positions at every tier (spec-guarded). `data/tiers.ts` owns the
  BANDS (`tierMonsterLevel` maps a dungeon's chain position into Hard 25–30 /
  Elite 30–40 — Elite deliberately past the player cap); `TIER_REWARDS`
  (economy.ts) owns every tier reward number (xp/gold mults ×2/×3, chest bumps
  +1/+2, per-tier boss first-clear shards). The per-dungeon ladder (clear
  Normal → its Hard → its Elite) persists as `DungeonProgress.clearedTiers`
  monotonic flags (`isTierCleared`/`highestUnlockedTier`); Normal's cleared
  signal stays `highestClearedFloor` — the gate chain, world map, and endless
  gate never read tiers. Milestone gifts grant on the NORMAL fold branch only;
  `replayGoldFor` keeps reading the BASE `monsterLevel` (the tier's goldMult
  layers on top — feeding the banded level would double-dip). `ReplayData` is
  deliberately NOT extended with tier: depths runs already aren't
  replay-reconstructable (it omits dungeonId/floor/encounter too).
- **XP rides the reward fold**: `computeBattleRewards().xp` → whole-deck fold
  in `grantBattleRewards` via `addXp` (the SAME clamp the RewardPanel preview
  uses — preview must always equal the persisted value). Tier multipliers
  apply inside `computeBattleRewards` as `round(base × xpMult)` FIRST (identity
  at Normal), then the loss fraction rounds off that.

### 9. Items are a match INPUT; the inventory is stack counts

Equipment (save v9: `soulShards`, `items`, `loadouts`) follows the leveling
playbook — one bake point, deterministic match input — plus its own invariants:

- **The inventory is STACK COUNTS**, `save.items[ItemKey]` where `ItemKey` is
  `"lineId:quality:star"`; instances are fungible, and `save.loadouts`
  REFERENCE keys. The one invariant everything preserves:
  `references(loadouts, K) ≤ items[K]` (equipped copies stay inside the
  counts). Every mutation is a pure fold in `meta/inventory.ts`
  (`combineFold`'s repair pass keeps the merged result equipped on the first
  orphaned unit, sorted-defId order); `migrateSave` re-enforces it via
  `sanitizeItems`/`sanitizeLoadouts`. Don't add per-instance state — that's a
  schema migration and a new invariant surface.
- **The numbers are split on purpose**: item POWER (ladders, effects,
  `resolveItemMods`) lives in `data/items.ts`; item ACQUISITION (drop odds,
  quality weights, merge costs, shard rewards/drip) lives in
  `meta/economy.ts`. Tune in the right file.
- **Every weapon/armor line carries a fixed SUB-STAT** (the `SUB` table in
  `data/items.ts`) at ALL qualities, kept at legendary alongside the
  signature — that's what makes rare/epic picks distinct (trinkets have
  none; they're already unique per tier). A sub must never share a field
  with its own line's signature (`mods()` returns a plain object — a shared
  field silently OVERWRITES via spread, it doesn't fold), and its ladder
  must be non-decreasing along the 9-step merge path (flat seams ok). The
  sub-stats spec block in `items.test.ts` enforces both, plus "no two
  same-slot lines read identically at rare 1★" — a new line can't ship as
  a clone.
- **Items bake at `createUnit` only** — nested rounding, LEVEL FIRST:
  `round(round(def × lvlMult) × itemMult)`. UnitDetail mirrors this exact
  math so the panel equals the battlefield. No loadout = no `latentItems`/
  `itemMods` fields at all ⇒ an itemless sim is byte-identical to pre-items
  builds (`items.test.ts` digest-identity specs guard this).
- **Loadouts ride the level channel**: `MatchOptions.itemLoadouts`, frozen by
  BattleScreen at mount, resolved ONCE in the MatchController constructor,
  recorded in `ReplayData.itemLoadouts`.
- **Gear does NOT inherit; identity does.** Spawn queues carry the creator's
  `latentItems` pair `{mods, owner}` inert; `createUnit` activates it only
  when `owner === defId` — that's how the Slime Knight's rebirth keeps its
  sword through the blob hop while skeletons/wolves/turrets stay bare. The
  ONE deliberate exception is the Summoner's Sigil (`sigilPct` on the spawn
  entry → flat stat bump in `flushSpawns`, before `init`, skipped for
  self-respawns).
- **Funnel reads mirror the TeamMods list** (all `?.`-guarded on
  `unit.itemMods`): dealDamage (execute/giant-slayer/pack-tactics ×,
  damage/magic taken ×, thorns, spell feedback, kill heal/haste, elemental
  detonations off the dying unit's status SOURCES), attack cooldown
  (`atkDelayMult` + Tempo stacks), performBasicAttack (crit cadence, riders —
  ranged via `Projectile.itemRider`, a SECOND slot so innate `basicShotRider`s
  are never displaced — double strike, chain, Nth bonus, poison spread),
  per-tick upkeep (regen/runic barrier, pre-gate so they tick while stunned),
  cast sites (`cooldownMult`, `abilityStartsReady` bypasses the opening
  grace), MovementSystem (`moveSpeedMult`). Item on-hit/swing effects apply to
  DEFAULT swings only — a kit that replaces its swing (Mystic Archer) gets
  stat mults but not procs.
- **AoE radii must clear unit bodies**: units are 32px-radius circles parked
  ~64–72px apart center-to-center, so any item nova/splash radius under ~80px
  can NEVER reach an adjacent enemy (the detonation radii are 90–100 for this
  reason).
- **Shards are monotonic first-time signals, no claims ledger**: depths
  `firstClear` per floor/boss/capstone + fresh endless 5-wave milestones
  (`freshMilestonesCrossed`), all computed inside `computeBattleRewards`; the
  repeatable drip is a seeded `{kind:"shards"}` chest roll. Don't add a
  claimed-grants ledger — the high-water marks already make the fold
  exactly-once.
- **`rollChest` appends its item-era rolls AFTER the legacy gold/unit rolls**,
  so any pre-items seed still produces its old contents byte-identically
  (rewards.test.ts asserts this). New chest content kinds must keep appending.
- **The arena item mirror is enemy-side only** (`arenaMirrorMultipliers` →
  flat hp/dmg mods with `owner = defId`, so the normal bake applies): derived
  purely from the replay inputs, identity when nothing is equipped. PvE enemy
  tuning is untouched by design — the player's own gear DOES apply everywhere.
  Only stat-shaped mods mirror (hp, damage, attack speed, damage taken);
  weapon/armor sub-stats outside those four (execute, giant-slayer, magic
  resist, move, lifesteal, kill heal, CDR, summon stats, crit cadence) are
  accepted drift — the mirror approximates, like `TRINKET_MIRROR_PCT`.
- **The Lucky Coin is the ONLY meta-read item**: `computeBattleRewards` takes
  `itemLoadouts` just for it (gold boost + a chest-tier upgrade rolled on a
  SEPARATE seeded stream, `RNG(chestSeed ^ 0x5eed)`, so chest contents stay
  stable). Combat never sees it.

### 10. The shop's stock is DERIVED, never stored

Grubbins' shop (save v10: `shop: { day, rerolls, bought }`) sells a daily
shelf that is re-rolled from its inputs everywhere it's needed:

- **Never persist the stock.** `rollDailyStock(dayIndex, rerolls)`
  (`meta/shop.ts`) is pure/seeded; the UI renders it and `applyShopPurchase`
  re-derives it, so what you see is exactly what the fold grants — no second
  source of truth, no claims ledger (hazard 9's shard rule, same reasoning).
- **Dungeon-signature exclusion is by pool construction, not a filter**:
  the roll draws from `BASE_LINES_BY_SLOT`, which already omits every
  `dungeonId` line.
- **The quality ceiling is epic ON PURPOSE** (user-locked design decision):
  legendary quality stays a merge/dungeon achievement. `ShopQuality` is
  `"rare" | "epic"` — widening it is a design change, not a refactor.
- **`bought[]` indexes into the CURRENT (day, rerolls) stock** — that's why
  `applyShopReroll` refuses after the day's first purchase (a reroll would
  relabel what "sold" points at). Keep that guard.
- **The impure edge is `dayIndexLocal()`** (local calendar day → integer),
  computed by CALLERS like `generateSeed()`; the folds take `todayIdx` as an
  argument so the specs stay clock-free. Clock changes re-roll the shelf —
  accepted for a local solo game whose save is hand-editable anyway.
- **Prices live in `meta/economy.ts`** (`SHOP_PRICES` / `SHOP_REROLL_COST` /
  `SHOP_EPIC_CHANCE`), per the hazard-9 power/acquisition split, deliberately
  ABOVE `DUPLICATE_GOLD` so a shop buy never undercuts a chest dupe. The
  premium shelf (`SHOP_PREMIUM_PACKS`) is a DISPLAY-ONLY coming-soon stub —
  no grant path exists on purpose; real payments arrive with accounts.

Specs: `meta/__tests__/shop.test.ts`; v10 migration cases in
`state/__tests__/persistence.test.ts`.

**The NPC set pieces are PixiJS (the app's only WebGL surfaces).**
`components/GrubbinsScene.tsx` ("Gilded Baron", 2026-07-10) and
`components/BlacksmithScene.tsx` (the Forge) own the repo's only
`pixi.js`/`pixi-filters` imports — battle canvas is still plain 2D. Shared
gotchas live in both component headers: `Application.init()` is async (the
`disposed` guard covers unmount/StrictMode races), and the canvas-generated
textures (`texCache`, and the smith's `iconTexCache`) are module-scope +
shared across mounts, so `app.destroy` must NOT pass `texture: true`.

### 11. The Blacksmith is stateless meta

The Forge (BlacksmithScreen + `meta/blacksmith.ts`) replaced the Bag as the
items home and added Salvage / Commission / Forge All. Its whole design is
that it adds NO save state:

- **Every fold operates on existing fields only** (`gold`, `soulShards`,
  `items`, `loadouts`) — no BlacksmithState, no version bump, nothing for
  `migrateSave` to do. If a future smith feature wants daily deals, limits,
  or smith XP, THAT is the moment a schema migration arrives; don't add one
  casually.
- **Salvage yields gold ONLY, never shards** (a shard yield would be a
  gold→shards pump on the premium currency), and only a FREE copy melts
  (`availableCount ≥ 1` — the smith never strips worn gear). The `SALVAGE_GOLD`
  table's rules are executable spec in `meta/__tests__/blacksmith.test.ts`:
  monotone in power order, strictly below every acquisition price, and
  `salvage(next) ≤ 2·salvage(cur) + goldFee(cur)` on every merge rung (gold-
  equality tolerated only where shards burn) so merge fees always evaporate.
- **Forge All is gold-only by design** — any rung whose fee has `shards > 0`
  (epic 3★→legendary, legendary star-ups) is skipped, so the player's premium
  currency is never auto-spent; legendary work stays a manual act. It walks
  keys in CANONICAL order (quality ↑ → star ↑ → line declaration order, never
  `Object.keys` insertion order) to fixpoint, and `planForgeAll`/`forgeAllFold`
  share one private walk so the preview always equals the commit.
- **Commission is RNG-free** (chosen line, flat `COMMISSION_PRICE`, rare 1★,
  base pool only — dungeon-signature lines refused like the shop's pool), so
  there's no roll-before-fold dance.
- **Commit-first-then-theater still holds**: the fold lands, then the
  `BlacksmithScene` act plays and one scheduled timeout fires the reveal cues
  at the scene's exported beats (`CRAFT_REVEAL_MS` etc.). The SCENE owns
  frame-synced anvil/quench clangs; the SCREEN owns transactional cues.
- The Home FAB pip is `forgeableStackCount` — stacks with an OK merge right
  now (any currency), so it self-clears; it deliberately counts shard-fee
  merges that Forge All would skip.

Specs: `meta/__tests__/blacksmith.test.ts`.

---

## Architecture reminders (the good patterns to preserve)

- **The engine is React-free and deterministic.** Everything under `src/engine`,
  `src/data`, `src/utils`, `src/entities` has zero React imports and never calls
  `Math.random()` (all randomness flows through the seeded `RNG`). This is what
  makes headless testing and future server-authority possible. Keep it that way.
- **All HP changes funnel through `dealDamage` / `heal`** in CombatSystem. Shields,
  lifesteal, damage reduction, death triggers, floating numbers — one place.
  Add new on-damage/on-death effects there, not scattered around.
- **All target changes go through TargetingSystem.** Priority favours a target
  we can hit *now*: taunt → in-range attacker → lowest-HP in range → out-of-range
  attacker → nearest. Units re-acquire when a target dies/stealths; if it only
  drifts out of range they switch only when another enemy is in range, else they
  commit to chasing it (no flip-flop between two far targets). Fear is handled
  separately (feared units flee in MovementSystem, can't acquire targets).
- **The renderer only reads state, never mutates it.** Presentation-only fields
  (hitFlash, animTime, deathFade) are advanced by AnimationSystem.

## Reusable systems now available for future units
- **Cast-time abilities** (the cast bar): give an active ability `castTimeSec` in
  `data/abilities.ts` and CombatSystem winds up a cast before the effect fires —
  the unit locks in place (vulnerable), a stun/fear interrupts it (fizzle), and
  the Renderer draws a cast bar from `castTicks`/`castTicksMax`. The effect is
  fired via `fireCastAbility` on completion (same cast function as instant casts).
  Used by all four mages (fireball, frost_blast, arcane_barrage, chain_lightning).
- **Status effect framework** (StatusEffectSystem): burn, slow, stun, shield,
  haste, poison, silence, stealth, death_immune, taunt, fear. Adding a new
  status is a one-line type addition + handling where it matters.
- **Summoning** (spawnUnit / pendingSpawns + damageSpawns queues) — proven by
  wolves, skeletons, slime clones.
- **Absorb shield / overhealth** (shieldHp / shieldHpMax) — silver health-bar
  segment, soaks before HP. Currently only the Knight uses it; any unit can.
- **Forced targeting** (tauntedByUid) and **flee behavior** (fear) — reusable
  crowd control.
- **One-time passives** (vanishUsed, secondWindUsed, splitsSpawned, transformed)
  — pattern for "happens once per match at a threshold."

## Known cosmetic-only items (not bugs)
- `sprites.ts` has a few unused color params in draw functions — intentional
  uniform signatures for readability; harmless, won't error under the project's
  real tsconfig.
- `shield_block` ability is currently UNUSED — no unit has it (the Knight moved
  to `taunt_roar`). It's kept as clean, reusable logic for a future tank, and is
  clearly marked as unused in both AbilitySystem.ts and abilities.ts. If a unit
  ever claims it, just set `ability: "shield_block"` in data. If you'd rather
  drop it, remove the type entry, the dispatch case, the cast function, and the
  ability definition together.
- Build script is `vite build` only (no `tsc` gate) so a stray React-types issue
  can't block a deploy. Run `npm run typecheck` separately for strict checking.

## Keeping the code fresh (avoid stale references)
When changing a value or renaming something, grep for it across `src/` and fix
the *comments and section headers* too, not just the logic. Past stale traps
that were cleaned up: "Beastmaster" (renamed to Druid), bear "takes half damage"
(it's 80% reduction now), and the orphaned `shield_block`. A quick sweep after
any balance/rename change keeps comments honest so future edits aren't misled.

## Balance snapshot (1v1, last audit)
Druid is intentionally dominant (~100%, "balance be damned" per design choice).
The rest cluster reasonably. The Druid, Necromancer and Berserker are
scaling/situational units that the quick-resolution audits tend to *under*-rate;
they perform better in long, messy fights than 1v1 numbers suggest. Re-audit
2v2 after any balance change — it's closer to real play than 1v1.

### Arena pacing + AI decks (full-match audit, 2026-07)
Measured historically with a 300-auto-played-match arena harness (that
`balanceAudit.test.ts` file no longer exists; the live headless sweeper is
`engine/__tests__/winrateSweep.test.ts`, PvE-focused but the same deploy-and-
tick-to-terminal pattern — extend it if you need the arena numbers again):
- **Reinforcement pacing is symmetric** via `REINFORCE_GRACE_SEC` (1.2s): both the
  player's mid-battle auto-deploy grace and the AI's redeploy cooldown. The old
  split (player 2.5s / AI 0.7s) let the AI snowball every player death 2-v-1 —
  mirror matches (identical decks) were 29% player win; symmetric 1.2s → 36%,
  0.7s → 41%. The residual gap is AI counter-picking + tactical positioning.
- **AI decks are budget-generated** (`generateEnemyDeck`): rare 1 / epic 2 /
  legendary 4 (`cost` in rarities.ts), budget band 5/6/7 weighted toward 6 (the
  starter deck's cost). Legendaries only fit at budget 7 escorted by three rares
  (~9% of decks, down from 32% unbounded); the **Druid is priced out** (cost 5 in
  `UNIT_COST_OVERRIDES`) until a progression layer passes bigger budgets.
  Starter-deck win rate vs AI went 72.7% → 88% with the boss-fight lottery gone
  (vs-legendary bucket: 43% → 82%).
- Ranger/Warrior are structurally Arena-weak (anti-swarm kits capped by the
  2-concurrent-enemy field): their deck audits 40% vs AI post-fix (was 25%).
  Accepted as PvE-swarm specialists — their kits pay off at Swarm's enemy-8 cap.

## Testing approach
The engine is tested with **Vitest** — run `npm test`. Specs live in
`src/engine/__tests__/` (`invariants.test.ts`, `arcaneMage.test.ts`, plus shared
`helpers.ts`). They run headlessly (node env, no DOM/React) and exploit the pure,
deterministic engine. The key invariants to re-verify after any combat change:
1. Determinism — same seed + inputs ⇒ identical result, run twice (the
   `digest()` fingerprint in `helpers.ts` makes this a one-line assert).
2. No crashes — every unit in `DECKABLE_UNIT_IDS` can fight (covered by a
   table-driven `it.each`).
3. Unit cap holds — peak simultaneous units ≤ 8-ish (not yet asserted; add a
   spec if you touch summoning).

When testing a new unit, copy the `arcaneMage.test.ts` pattern: build a
`battleState`, `place` the unit + a `makeDummy` target, step, and assert. Dummy
gotcha: don't use a unit whose ability grants a shield (e.g. the Knight) — the
shield silently soaks the damage you're trying to measure.
