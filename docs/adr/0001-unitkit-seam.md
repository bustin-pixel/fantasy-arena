# ADR 0001 — Collapse per-unit mechanics into a UnitKit seam

- **Status:** Accepted — design only, no code yet. Implementation tracked in `progress.md`.
- **Date:** 2026-07-02
- **Supersedes:** the "consider moving these into a per-unit passive-traits field … Not
  urgent at current scale" note in `NOTES.md §2`. This ADR is that move — done as a deep
  module behind a seam rather than a flat data table.

---

## Context

A unit's behavior is smeared across **five files, keyed two different ways**:

- ~38 `defId` / `ability` string branches in `engine/CombatSystem.ts`
- an `AbilityId`-keyed `dispatchAbility` switch **plus** a `PASSIVE_ABILITIES` set in
  `engine/AbilitySystem.ts`
- `ability` / `hp` role heuristics in `engine/MatchController.ts`
  (`unitRoleClass`, `chooseEnemyCard`)
- ~27 kit-specific fields on the shared `Unit` struct (`types/index.ts`), every one
  initialized for every unit in `entities/createUnit.ts`

Adding a unit therefore costs edits in five files (the `NOTES.md` checklist). The friction
grows linearly with the roster, and the roadmap adds a lot of units (the Depths bestiary).

### Load-bearing constraints the design had to respect

- **Determinism / the digest.** `engine/__tests__/invariants.test.ts` asserts *same seed +
  inputs → byte-identical end state* via the `digest()` fingerprint. Any change to iteration
  order, tie-breaks (resolved by `uid`), field-init order, or **hook call-site order** can
  break it. This is the hard guardrail on every step.
- **React-free / DOM-free engine.** Server re-simulation from seed is a stated goal
  (`CLAUDE.md` "Path to multiplayer"); the design must stay plain-data + pure-function so
  state serializes and re-sims.
- **Single HP funnel** (`dealDamage`/`heal`) and **single targeting funnel**
  (`TargetingSystem`). Kit hooks mutate *through* these, never around them.
- **`id ≠ display name`** (`summoner` = "Druid", `healer` = "Cleric"). The kit registry keys
  on `defId`, never on the display name.

---

## Decision

Introduce a **`UnitKit`** seam: one stateless kit per `defId` in a static registry.
`CombatSystem` loops over the kit's hooks instead of testing names; the AI and the cast
pipeline read the same kit. Eight decisions, walked as a design tree (each stress-tested
against the constraints above):

1. **A kit is stateless, one per `defId`, in a static registry** (`Record<defId, UnitKit>`)
   — *not* a per-unit instance. No per-unit object lifecycle to recreate deterministically
   or serialize; matches the existing `AbilityContext`-passing, data+pure-function grain.
   The "born / dies" ergonomics come from `onSpawn` / `onDeath` **hooks**, not object
   construction/destruction.

2. **Hooks are optional named methods** in three kinds:
   *event* (fire + mutate via `ctx`), *modifier* (return a transformed value),
   *override* (replace a default behavior when present). A kit implements only what it needs.

3. **The engine owns the tick *skeleton*; the kit gets two ordered tick *slots*.**
   Skeleton (stays engine): stun/fear/polymorph gate, targeting, cast pipeline, movement,
   summon-flush. Kit slots:
   - `onTick` — **pre-gate maintenance**, runs *every tick even while stunned* (timers,
     periodic passives, per-tick stat recompute, threshold transforms).
   - `onActTick` — **post-target**, runs only when the unit can act (Blink, Shadow Step,
     Rejuvenation, the Necromancer's custom cast).

   *Two slots are forced by determinism.* A stunned Necromancer today still raises skeletons
   (`Raise Dead` fires before the stun `continue`); a stunned Engineer still repairs. Those
   summons/heals land in `digest()`. Funnelling them into a single post-gate hook would
   change combat → digest goes red. So maintenance must stay pre-gate; actions that need a
   resolved target go post-target.

4. **The kit owns ability *effects*; the engine keeps the cast *pipeline*; data keeps ability
   *metadata*.** New hooks `fireAbility?(ctx)` and `wantsToCast?(ctx)`. The engine reads
   cooldown/`castTimeSec` from `ABILITIES[unit.ability]` (data, keyed by `AbilityId`), drives
   the cast bar + interrupt, and calls `kit.fireAbility` on completion. This **retires**:
   - the `dispatchAbility` switch (the second key), and
   - `PASSIVE_ABILITIES` / `isActiveAbility` — the new rule is *has-an-active-cast ⇔ the kit
     defines `fireAbility`*, killing the `NOTES.md §3` "remember to add it to the set" footgun.

   The unit still declares `ability: AbilityId` (for cooldown/castTime lookup + the
   data-driven detail panel). **Metadata by `AbilityId`, behavior by `defId`** — no longer two
   keys for one thing. The Necromancer (only unit that overrides the *pipeline*) implements no
   `fireAbility` and drives its dual-spell cast from `onActTick`.

5. **Private per-unit kit state moves to a single flat, typed `unit.kit` namespace**
   (an interface of all-optional fields; `createUnit` inits it to `{}`), folded in
   **per-unit during migration**. Genuinely universal fields **stay top-level**:
   `damageTakenMult` (read by every `dealDamage`), `shieldHp`/`shieldHpMax`, `attackCount`,
   the cast-pipeline fields (`castTicks`/`castTicksMax`/`castTargetUid`), and `chargeTicks`/
   `chargeTargetUid` (shared "charge mode", Orc + Boar).
   - **Cross-unit state forces this shape.** `lightStacks`/`darkStacks` are written by the
     Mystic Archer onto *its target* (any unit). So state **cannot** be private to the owning
     unit's kit; it lives in the victim's `.kit`. This rules out an existential per-kit-typed
     slot.
   - An opaque `Record<string, unknown>` bag is rejected — it throws away strict typing.
   - `unit.kit` is **opportunistic only** (never a standalone slice): the deletion test shows
     it *relocates* complexity rather than *hiding* it. "Leave that unit's state flat" is a
     valid per-unit fallback.

6. **`roleClass` moves onto the kit; counter-pick scoring stays in `MatchController`.**
   The kit owns *facts* about a unit (its tactical class); the AI owns *opinions* about
   matchups (`playerHasTank`/`hp >= 200`, `fireball` DoT-vs-tank, "don't lead with support").
   Folding scoring into kits would scatter AI strategy across the roster — the opposite of
   locality.

7. **Migration is strangler-fig, incremental, digest-green at every commit.** Every seam call
   *prefers the kit and falls back to the old path* for un-migrated units
   (`if (kit?.onDamaged) …`, `kit?.fireAbility ?? dispatchAbility`, `kit?.roleClass ??
   unitRoleClass`). A unit's old branches are deleted **in the same commit** its kit is born,
   so no double-fire. Sequence: **scaffolding commit** (interface + empty registry + no-op /
   identity hook sites ⇒ digest byte-identical) → **per-unit commits** → **cleanup commit**
   (delete the switch, the set, `unitRoleClass` internals, all fallbacks). *Commit = one unit*
   (the verify unit); *PR = a batch* (the deploy unit); a partial migration is safe to merge
   because coexistence is behavior-identical.

8. **Deletion test — how load-bearing each piece is** (most → least):
   `UnitKit` seam ▸ `fireAbility`/`wantsToCast` (kills the 2nd key + the footgun) ▸
   event/modifier/override hooks ▸ `onTick`/`onActTick` (phase-encoding for determinism, not
   complexity-hiding; `onActTick` is the weakest slot, justified by 3 units needing exactly
   that timing) ▸ `kit.roleClass` (small win) ▸ **`unit.kit`** (relocates, doesn't hide —
   hence "opportunistic only").

### The interface this produced

```ts
type UnitKitRegistry = Record<string /*defId*/, UnitKit>;

interface UnitKit {
  roleClass?: "melee" | "ranged" | "support" | "assassin";     // Q6: a fact, not an opinion

  // lifecycle
  onSpawn?(unit: Unit, ctx: KitCtx): void;                     // opening stealth, boar/trap at deploy
  onDeath?(unit: Unit, ctx: KitCtx): void;                     // bloater/slime burst (may re-enter dealDamage)

  // tick — engine owns the skeleton; these are its two ordered slots (Q3)
  onTick?(unit: Unit, ctx: KitCtx): void;                      // pre-gate: timers, periodic passives, recompute, transforms
  onActTick?(unit: Unit, ctx: KitCtx): void;                   // post-target, un-stunned: blink, shadowstep, rejuv, necro cast

  // HP funnel (Q2 modifier/event kinds)
  modifyIncomingHeal?(unit: Unit, amount: number, ctx: KitCtx): number;      // druid bear 1.5x
  onDamaged?(unit: Unit, amount: number, source: Unit, ctx: KitCtx): void;   // slime split
  onWouldDie?(unit: Unit, source: Unit, ctx: KitCtx): boolean;               // veto -> "survived?"
  onKill?(source: Unit, victim: Unit, ctx: KitCtx): void;                    // berserker bloodthirst

  // ability (Q4) — has-an-active-cast <=> fireAbility is defined
  fireAbility?(ctx: KitCtx): boolean;
  wantsToCast?(ctx: KitCtx): boolean;

  // + the three contracts still open below (damage-modify, basic-attack timing)
}
```

`KitCtx` is the existing `AbilityContext` (already carries `dealDamage`, `heal`,
`spawnProjectile`, `spawnVfx`, `spawnUnit`, `unitsByUid`, `enemies`, `allies`).

---

## Open contracts (pin these at the scaffolding step, where the call sites make them obvious)

1. **Two-phase `modifyIncomingDamage`** (Aegis Knight): it both *reduces* the hit (0.25×) and
   *banks a shield after* HP is applied. It is not a pure `(amount) => amount`. **Lean:**
   `modifyIncomingDamage?(…): number` for the reduction + reuse **`onDamaged`** for the
   post-hit bank.
2. **`onBasicAttack` timing split** — three real moments: **before** (Ambush stun/reveal),
   **replace** (Mystic/Ranger/Warrior do their own thing), **after** (Venom/Cleave/Backlash/
   Numbing-slow). **Lean:** `onBeforeAttack` / `onBasicAttack → boolean (replaced?)` /
   `onAfterAttack`. **Note:** the Ice/Fire *ranged* riders (`onHitStunSec`/`onHitBurn`) belong
   to **ADR-candidate 3's projectile on-hit descriptor**, not here — this is where candidates 1
   and 3 touch.
3. **`onWouldDie` vs the generic `death_immune` path** — confirm the veto runs *before* the
   existing `death_immune` effect check and returns "survived?", matching today's order.

---

## Migration order (per decision 7)

1. **Scaffolding** — interface + empty registry + no-op/identity hook sites. Digest identical.
2. **Zombie Shambler** — single `onBasicAttack` augment, no state, Depths-only (not deckable):
   lowest blast radius. Add a spec.
3. **Knight (`taunt_roar`)** — a simple instant active: proves the `fireAbility` + pipeline path.
   *(2 + 3 = PR 1: exercises both halves of the seam on low-risk units.)*
4. Ice/Fire Mage (attack riders) → Rogue (stealth + venom).
5. Slime (`onDamaged` split + `onDeath` AoE re-entry).
6. `onWouldDie` trio: Ogre → Assassin → Berserker (also `onKill` + `onTick` recompute + cleave).
7. Aegis Knight (two-phase damage-modify) → Druid (transform + heal-modifier + `onActTick` rejuv).
8. Mystic (cross-unit `.kit` state) → Hunter (boar/trap + boar-guard cross-unit reaction) →
   **Necromancer last** (`onActTick` custom dual-cast — most bespoke).
9. **Cleanup** — delete `dispatchAbility`, `PASSIVE_ABILITIES`, `isActiveAbility`,
   `unitRoleClass` internals, all fallbacks.

Rule at every commit: `npm run typecheck` + `npm run build` + `npm test`, with `digest()`
byte-identical. Hard units (5–8) only after 1–3 prove the pattern.

---

## Consequences

**Positive**
- **Locality:** a unit's whole kit lives in one file.
- **Leverage:** adding a unit becomes *write one kit + data entries*, zero engine edits.
- **Interface shrinks:** `CombatSystem` stops hardcoding ~20 unit names; core `Unit` narrows.
- **Test surface:** a kit is testable in isolation (the `arcaneMage.test.ts` pattern).
- **Two known footguns retire:** the `AbilityId`↔`defId` double-keying, and the
  `PASSIVE_ABILITIES` sync burden.

**Costs / trade-offs**
- The kit interface carries ~a dozen optional hooks; the two tick slots and the
  before/replace/after attack hooks are "name the implicit phase" surface (honest, but real).
- Per-unit migration PRs touch `CombatSystem` **and** the `Unit` type + `createUnit`.
- Determinism must be re-verified per commit — the digest is the gate, not a nicety.

**Parked / follow-on (explicitly *not* part of this refactor)**
- **First balance dividend:** *stun should suppress Raise Dead* (and likely Engineer repair,
  Hunter traps). Post-refactor this is a one-line hook move (pre-gate `onTick` → post-gate),
  its own commit + spec, with an intentional digest change. Captured as intent here.
- `lightStacks`/`darkStacks` are really *stacking status effects* wearing bespoke-field
  clothes; a later refactor could model them as `ActiveStatusEffect`s. `.kit` is their home
  until then.
- **ADR-candidate 3** (explicit projectile on-hit descriptor) intersects the `onBasicAttack`
  ranged riders; sequence it near the Ice/Fire migration.
