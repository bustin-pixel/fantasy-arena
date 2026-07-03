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
   every-Nth-attack on-hit rider, like the Fire/Ice mages) and `wardedAgainst`
   (status immunities, like the Aegis Knight).
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
   `onProjectileHit`, `onChargeContact`, `onSpawn` / `onDeath`. **Never edit
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
Depths (player 4 / enemy 8, set by MatchController in `"depths"` mode) scales
to 7/11. Audit confirmed Arena peak simultaneous units stays at 8 in
summon-heavy matches. If you add more summoners or raise the Depths enemy cap
(10–12 is the stretch goal), re-profile — the spec targets ~8 active units /
60fps on mobile, and Depths already runs right at it.

### 5. The Depths spawns bypass the deploy() path
`WaveController` (the PvE horde director) pushes monsters into `state.units`
directly — no deck bookkeeping, no deployment records (waves rebuild
deterministically from seed + floor, so replays don't need them). Its queue
doubles as `enemyReserves`, which is what keeps a momentarily-cleared board
from counting as victory while monsters are still waiting off-screen. It owns
a private RNG stream, so Depths never perturbs Arena determinism.

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
Measured with the (skipped) `balanceAudit.test.ts` harness — 300 auto-played
matches per experiment; re-run it after any tuning:
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
