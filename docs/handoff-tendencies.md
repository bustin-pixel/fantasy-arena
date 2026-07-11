# Handoff — Tendencies (per-unit targeting personalities)

**Status:** ✅ BUILT 2026-07-11 on `feat/tendencies` (this document rides the same
PR as the design record). Originally approved by the user 2026-07-07 as one feature
of a larger "Hunter's Library" concept; the rest of that concept was **scrapped**,
but Tendencies survived on its own. Specs live in
`src/engine/__tests__/targeting.test.ts`; the registry in `src/data/tendencies.ts`.

## What it is

A **Tendency** is a fixed, per-unit targeting personality that makes fights
*readable*: you learn the Rogue dives your backline caster, so you screen it with a
Knight. It is the only mechanic here that changes fight outcomes — treat it as a
deliberate, digest-affecting balance change (test plan below).

### Decisions already locked (do not re-litigate)

- **Fixed per unit** — not swappable/unlockable. A unit *is* its tendency.
- **Surfaced in the hub detail panel** as a trait-style line.
- **Taunt stays absolute.** Tendencies never override taunt or the retaliation
  rules — they only reorder *candidate preference* within the existing priority
  chain. (This was an explicit user choice; a Rogue must NOT be able to ignore a
  Knight's taunt to chase the archer, or taunts stop being reliable protection.)

## Where it hooks in — the one seam

Everything lives in [`acquireTarget()`](../src/engine/TargetingSystem.ts) (currently
`TargetingSystem.ts:28`). The chain today is:

```
0. Taunt (forced)                    ← UNTOUCHED
1. In-range attacker (retaliation)   ← UNTOUCHED
2. Lowest-HP enemy within range      ← tendency reorders the *preference* here
3. Out-of-range attacker (retaliate) ← UNTOUCHED
4. Nearest enemy (move to engage)    ← tendency reorders the *preference* here
```

Tendencies **only** change the candidate-selection inside steps **2** and **4**
(the two `for` loops that currently pick "lowest HP in range" and "nearest"). Every
comparison must still end in the existing `uid` tie-break (`e.uid < best.uid`) so
determinism holds. `updateTarget()` (`TargetingSystem.ts:90`) stays exactly as-is —
its commit/no-flip-flop logic already does the right thing (a Backline Stalker that
acquires the archer keeps chasing it when the archer kites out of range).

> ⚠️ Both steps matter. Reordering only step 4 (seeking) but not step 2 (in-range)
> means a Backline Stalker standing next to a frontliner just hits the frontliner.
> The "prefer" ordering must apply in *both* loops.

## Taxonomy (6, including the default)

| Tendency | Trait line | Rule (applied in steps 2 & 4) |
|---|---|---|
| **Brawler** *(default)* | *(none shown)* | Today's exact behavior — lowest-HP in range, else nearest. Absence of a tendency = Brawler. |
| **Backline Stalker** | "Hunts the Backline — seeks out ranged foes and casters behind the line." | Prefer `roleClass` ∈ {ranged, support}, then longest `range` stat, then lowest HP, then uid. |
| **Executioner** | "Smells Blood — runs down the most wounded enemy on the field." | Seek the lowest-HP enemy *anywhere* (step 4 ignores distance), not the nearest. |
| **Bodyguard** | "Answers for Allies — turns on whoever is harming its companions." | Prefer enemies whose `targetUid` resolves to one of MY allies, then lowest HP, then uid. |
| **Spellwrath** | "Hates Casters — magic-wielders die first." | Prefer enemies with `school === "magic"`, then lowest HP, then uid. |
| **Big-Game Hunter** | "Stalks the Largest — always squares up to the biggest beast." | Prefer highest `maxHp`, then uid. (Naturally farms bosses.) |

### Roster assignment (deckables)

- **Backline Stalker:** `rogue`, `assassin`
- **Executioner:** `berserker`
- **Spellwrath:** `trickster`, `aegis_knight`
- **Bodyguard:** `knight`, `holy_knight`
- **Big-Game Hunter:** `hunter`, `ogre`
- **Brawler (default):** everyone else — and **all monsters, for now.** Giving Depths
  hordes tendencies later is a separate, sweep-verified difficulty lever; out of
  scope here.

## Data shape

**Add `tendency?: TendencyId` to `UnitDef`** (`src/types/index.ts:90`, the
`UnitDef` interface) — declarative data exactly like `school` / `wardedAgainst`,
**not** a kit hook. Absent ⇒ Brawler.

New registry `src/data/tendencies.ts`:
```ts
export type TendencyId =
  | "brawler" | "backline_stalker" | "executioner"
  | "bodyguard" | "spellwrath" | "big_game";
export const TENDENCIES: Record<TendencyId, { name: string; blurb: string }> = { … };
```

### ⚠️ The `roleClass` / `school` wrinkle (confirmed against the code)

`acquireTarget` receives runtime `Unit` objects, but the data the rules key off is
**not all on the `Unit`**:

- **`roleClass`** lives on the **kit**, not on `UnitDef` or `Unit` — look it up per
  candidate via `getKit(enemy.defId)?.roleClass` (`kits/UnitKit.ts:62`, values are
  `"melee" | "ranged" | "support" | "assassin"`). The MatchController already does
  exactly this lookup at `MatchController.ts:524`.
- **`school`** lives on `UnitDef` (`getUnitDef(enemy.defId).school`, `"magic"` for
  casters), not on the `Unit`.
- **The acting unit's own `tendency`**: either look it up via
  `getUnitDef(unit.defId).tendency`, or (cleaner for the hot path) **copy it onto
  the `Unit` in `createUnit()`** alongside `range`/`ability`
  (`entities/createUnit.ts:51`). Recommend copying it on — `acquireTarget` runs per
  unit per tick, and it keeps the targeting module from importing the data layer for
  the acting unit. Candidate lookups (`roleClass`/`school` of *enemies*) still need
  `getKit`/`getUnitDef`, which is fine — those are plain map/object indexes.

Decide the import direction deliberately: `TargetingSystem` is pure engine; pulling
in `getKit`/`getUnitDef` is acceptable (CombatSystem already imports kits), but keep
it to these two read-only lookups.

## Panel surfacing

`UnitDetail` renders the trait chip **derived** from `TENDENCIES[def.tendency]` —
do **not** duplicate the text into each unit's `traits` array (it would drift).
Brawler renders no chip. Find the trait-list render in the detail panel component
(`src/components/UnitDetail.tsx`) and add a derived line above/among the existing
`def.traits` chips.

## Test & balance plan (this is the digest-affecting part)

1. **Re-baseline `invariants.test.ts` digests in the same PR**, loudly — the commit
   message must say the digest changed *because targeting changed*, not by accident.
   The determinism invariant itself (two runs, same seed → identical digest) and the
   no-crash roster sweep stay green; it's the golden fingerprint values that move.
2. **New `src/engine/__tests__/targeting.test.ts`** — hand-built scenarios per
   tendency using the `battleState`/`place`/`makeDummy` drivers in
   `__tests__/helpers.ts`:
   - Backline Stalker: tank wall in front + archer placed deep → assert first
     acquired target is the archer.
   - Bodyguard: an enemy attacking my ally → assert I swing to that enemy.
   - Spellwrath: a mage + a warrior both in range → assert the mage.
   - Big-Game Hunter: two enemies, one high-`maxHp` → assert the big one.
   - **Taunt-still-wins:** a Backline Stalker taunted by a frontline Knight →
     assert it targets the Knight, not the deep archer (guards the locked decision).
   - `makeDummy` gotcha (from CLAUDE.md): pick a `defId` whose ability grants **no
     shield** — the Knight's Taunting Roar / Ogre slam mask measured behavior. Use
     skeleton/wolf-type dummies.
3. **Re-run the balance harness** (`balanceAudit.test.ts`, ~300 matches) and the
   Depths headless winrate sweep (method in NOTES §4b). Assassins diving backlines
   *will* shift Arena and floor winrates — document the deltas in the PR. Target
   bands to preserve: starter-deck-vs-AI ≈ 80–90%, floors 1–3 stay comfortable.
   **Do NOT re-run the reverted number-retune sweep** (standing instruction from the
   legendary-dungeons work) — this is a mechanical change; only retune numbers if the
   user asks.

### Known risk

Backline Stalkers can tunnel past a frontline and die instantly. Mitigation already
exists in the roster: `rogue`/`assassin`/`trickster` open **stealthed** (their
`onSpawn` hook), which carries them through, and the retaliation rules (steps 1 & 3,
untouched) let them fight back once engaged. If it's still too fragile in the sweep,
the lever is roster assignment (fewer stalkers), not new targeting exceptions.

## Build checklist

1. `src/data/tendencies.ts` — `TendencyId` + `TENDENCIES` registry.
2. `src/types/index.ts` — add `tendency?: TendencyId` to `UnitDef`.
3. `src/data/units.ts` — set `tendency` on the 9 assigned units (leave the rest).
4. `src/entities/createUnit.ts` — copy `tendency` onto the `Unit` (recommended).
5. `src/engine/TargetingSystem.ts` — reorder candidate preference in steps 2 & 4 of
   `acquireTarget` by the acting unit's tendency; keep uid tie-breaks; keep steps
   0/1/3 and all of `updateTarget` untouched.
6. `src/components/UnitDetail.tsx` — derived tendency chip.
7. `src/engine/__tests__/targeting.test.ts` — the per-tendency + taunt-wins specs.
8. Re-baseline `invariants.test.ts`; run `npm test`, `npm run typecheck`,
   `npm run build`; run the balance sweeps and paste deltas into the PR.

Ships as its own PR per `WORKFLOW.md` (verify → batch → **user approves the merge**;
each merge is a Netlify deploy). Keep it isolated so the one digest change is
auditable alone.
