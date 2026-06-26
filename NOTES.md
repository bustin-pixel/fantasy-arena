# Developer Notes & Audit Findings

A running record of the codebase's state, gotchas, and things to watch when
extending the game. Last full audit: all 7 integrity checks passing, engine
type-clean under strict mode, determinism verified across every unit type.

---

## ✅ Checklist for adding a new unit

Every playable unit must surface fully in the hub click-to-view detail panel
(`components/UnitDetail.tsx`), which is data-driven. When adding one:

1. **Stats** — define it in `data/units.ts` with full stats (hp, damage,
   attackSpeed, moveSpeed, range, role, color, accent). These render in the panel
   automatically.
2. **Ability** — its `ability` MUST have a matching entry in `data/abilities.ts`
   (name / description / cooldown). The panel reads `ABILITIES[def.ability]`, so a
   missing entry crashes it. If the ability is passive (no active cast), also add
   it to `PASSIVE_ABILITIES` in `engine/AbilitySystem.ts`.
3. **Traits** — add a `traits: [{ name, description }]` array for any passive or
   hidden behavior (anything gated by `defId` in `CombatSystem.ts`, e.g. Second
   Wind, Vanish, Frostbite) so the panel lists it. Pure-stat units can omit it.
4. **Visibility** — non-summon units appear in the hub automatically via
   `DECKABLE_UNIT_IDS` (everything not in `NON_DECK_UNITS`).
5. **Verify** — open the unit's card in the hub and confirm stats, ability, and
   traits all show.

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
the id literal (e.g. `unit.defId === "summoner"` triggers the bear transform).
If you ever add a unit, make the id match the name to avoid extending this trap.

### 2. Hardcoded unit-id checks in CombatSystem
Special mechanics are gated by `defId` string literals in `CombatSystem.ts`:
- `"summoner"` → Druid bear transform at 30% HP
- `"ogre"` → Second Wind full-heal at 25% HP
- `"berserker"` → Bloodrage damage/speed scaling + melee Cleave (AoE swing)
- `"assassin"` → Vanish death-cheat
- `"slime"` / `"slime_clone"` → split-on-damage and death explosion
- `"aegis_knight"` → soaks magic into a shield, Backlash AoE, Warded (immune
  to burn/slow/poison). Magic is identified by the source unit's `school: "magic"`
  field (the casters) — see `isMagicSource` in CombatSystem.
- `"mystic_archer"` → Light/Dark form-tagged shots + on-hit stack/detonate
  resolution (`resolveMysticHit`).
- `"arcane_mage"` → Arcane Barrage ramp (Instability scales fire rate, adds
  missile splash + minor self-damage past a threshold; decays while not
  attacking) and the Blink defensive teleport. Blink runs on its own
  `blinkCooldown` field, independent of the ability slot (which holds the passive
  `arcane_barrage`).

This works but isn't data-driven. If the roster grows a lot, consider moving
these into a per-unit "passive traits" field in the unit data so the engine
loops over traits instead of hardcoding ids. Not urgent at current scale.

### 3. Ability slot vs. passive properties
`lifesteal` started as an *ability* but is now also a unit *property*
(`def.lifesteal: number`). The Orc has `ability: "charge"` AND
`lifesteal: 0.4`. The `PASSIVE_ABILITIES` set in `AbilitySystem.ts` lists
abilities that never "cast" (`lifesteal`, `bloodrage`, `slime_split`,
`mystic_shift`, `arcane_barrage`, `ambush`, `aegis`). When adding a passive
ability, remember to add it to that set or the unit will waste cycles trying to
cast nothing. (The Arcane Mage is an example of a unit whose ability slot is a
passive while a *second* ability — Blink — runs off its own cooldown field.)

### 4. Summon caps protect the 8-unit ceiling
`CombatSystem` enforces a per-team live-unit cap (5 normal, 7 for slime clones)
when flushing spawns. Audit confirmed peak simultaneous units stays at 8 even in
summon-heavy matches. If you add more summoners, re-check this peak — the spec
targets 8 active units / 60fps on mobile.

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
- **Status effect framework** (StatusEffectSystem): burn, slow, stun, shield,
  haste, poison, silence, stealth, death_immune, taunt, fear. Adding a new
  status is a one-line type addition + handling where it matters.
- **Summoning** (spawnUnit / pendingSpawns + damageSpawns queues) — proven by
  wolves, skeletons, slime clones.
- **Absorb shield / overhealth** (shieldHp / shieldHpMax) — silver health-bar
  segment, soaks before HP. Currently only the Knight uses it; any unit can.
- **Corpse tracking** (state.corpses) — for raise-from-the-dead style effects.
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

## Testing approach
There's no test runner installed, but the engine can be exercised headlessly by
transpiling to CommonJS and running under Node (the chat assistant has done this
throughout). The key invariants to re-verify after any combat change:
1. Determinism — same seed + inputs ⇒ identical result, run twice.
2. No crashes — every unit can fight.
3. Unit cap holds — peak simultaneous units ≤ 8-ish.
