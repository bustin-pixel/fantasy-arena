# The Hunter's Library — five-system meta expansion (concept, approved 2026-07-07)

Five systems, one loop: **the Library tells you what to hunt, the hunt makes you a
master, mastery fills the Library.** All five were designed together so each feeds
the next (see the interlock map, section F). Build order is section G — meta-first,
engine-touching changes last and isolated.

Decisions locked with the user up front:

- **Tendencies are fixed per unit**, surfaced as a trait line in the hub detail panel.
- **Taunt stays absolute** — tendencies never override taunt or retaliation.
- **Mastery bonus is small and capped** (+2% per rank, cap +10%) plus cosmetic
  rewards, gold, and lore — a collection reward, not a power system.
- Mastery bonus applies to **all player-team units** (summons included), keyed off
  the *target's* defId.
- Relics are tappable **any time, mid-combat**, via **animated floor zones that
  open up and expose the relic for a short tap window before closing again**.

---

## A. Tendencies — every warrior has a nature

A fixed, per-unit targeting personality, visible in the detail panel, that makes
fights *readable*: you learn that the Rogue dives the archer, so you screen with a
Knight. This is deliberately the only feature here that changes fight outcomes.

**Guardrails (untouched):** taunt (absolute), in-range-aggressor retaliation, and
`updateTarget`'s commit/no-flip-flop logic all stay exactly as they are today.
Tendencies only reorder *candidate preference* inside `acquireTarget`'s
"lowest-HP in range" and "nearest" steps. Every comparison still ends in the
existing `uid` tie-break, so determinism is preserved.

### Taxonomy (6, including the default)

| Tendency | Trait line | Rule |
|---|---|---|
| **Brawler** *(default)* | *(no line shown)* | Today's exact behavior — lowest-HP in range, else nearest. |
| **Backline Stalker** | "Hunts the Backline — seeks out ranged foes and casters lurking behind the line." | Prefer ranged/support roleClass, then longest `range` stat, then lowest HP. |
| **Executioner** | "Smells Blood — runs down the most wounded enemy on the field." | Seeks the lowest-HP enemy *anywhere*, not just the nearest. |
| **Bodyguard** | "Answers for Allies — turns on whoever is harming its companions." | Prefer enemies whose current target is an ally (not itself). |
| **Spellwrath** | "Hates Casters — magic-wielders die first." | Prefer enemies with `school === "magic"`. |
| **Big-Game Hunter** | "Stalks the Largest — always squares up to the biggest beast." | Prefer highest `maxHp` — naturally farms boss mastery. |

### Roster assignment

- **Backline Stalker:** rogue, assassin (their whole identity).
- **Executioner:** berserker (Bloodthirst flavor).
- **Spellwrath:** trickster (matches its anti-caster kit), aegis_knight (turns its
  magic soak into aggression).
- **Bodyguard:** knight, holy_knight.
- **Big-Game Hunter:** hunter, ogre ("picks on something its own size").
- **Brawler:** everyone else — and **all monsters, for now**. Giving Depths hordes
  tendencies later (e.g. Ghouls as Executioners) is a separate, sweep-verified
  difficulty lever.

### Data shape

`UnitDef.tendency?: TendencyId` — declarative data like `wardedAgainst` /
`basicShotRider`, **not** a kit hook (kits are behavior code; this is a data flag
the targeting system reads). A `data/tendencies.ts` registry holds
`{ name, blurb }` per id. `createUnit` copies the id onto the `Unit` so
`acquireTarget` reads `unit.tendency` with no registry lookup in the hot path.
`UnitDetail` renders the trait chip *derived* from the registry — never duplicated
into each unit's `traits` array, so the text can't drift.

### Balance risk & test plan

- **Digest baselines in `invariants.test.ts` legitimately change** — re-baseline
  loudly in the same PR with a commit message saying why.
- New `targeting.test.ts`: hand-built scenarios per tendency (tank wall + deep
  archer → assert the Rogue's first acquired target is the archer; assert a
  Bodyguard swings to its ally's attacker; etc.).
- Determinism invariant (two runs, same digest) and the no-crash roster sweep are
  unchanged.
- Re-run the balance harness + the Depths headless winrate sweep and document the
  shifts in the PR. **Do not re-run the reverted number-retune sweep without
  asking** (standing instruction from the legendary-dungeons work).
- Biggest risk: Backline Stalkers tunneling past a frontline and dying instantly.
  Mitigation is already built in: their opening stealth carries them through, and
  the retaliation rule still lets them fight back once engaged.

---

## B. Daily Quests — the Huntmaster's Board

A notice board on the Home screen: **3 writs per day**, pool 100% derived from the
`DUNGEONS` registry so new dungeons auto-feed it. Only dungeons/monsters the player
has actually reached are eligible — every writ is always completable.

| Slot | Template | Reward |
|---|---|---|
| **Cull** | "Cull 12–18 ⟨fodder⟩ in ⟨dungeon⟩" (count seeded) | 40 gold |
| **Hunt** | "Hunt 4–6 ⟨elite⟩ in ⟨dungeon⟩" — 1 day in 4, replaced by "Recover a Relic from any dungeon" | 80 gold |
| **Trophy** | "Fell the ⟨boss⟩ of ⟨dungeon⟩" | 150 gold |
| **All-clear** | complete all three | +40 gold + 1 relic |

Max ~310 gold/day against the `depthsReplay` 30-gold baseline — generous but
hard-capped, and it *directs* play toward mastery targets. Numbers live in
`economy.ts` as `DAILY_QUEST_REWARDS`; revisit if the total erodes the
unlock-price curve (rare 400 / epic 1200).

**Reset & seeding (not save-scummable):**
`save.daily = { date: "YYYY-MM-DD" (local), quests, allClearClaimed }`. On app
load / hub focus, a date mismatch rerolls the board. Roll seed =
`hash(date) ^ save.dailySalt`, where `dailySalt` is rolled once at migration —
same board all day no matter how often you reload; you can't reroll without
nuking your whole save. The roll is a pure `rollDailyQuests()` in
`src/meta/dailies.ts`, spec'd headlessly like `rollChest`.

**Progress & claiming:** kill counting rides the same per-defId ledger as mastery
(section E), incremented inside the existing single `grantBattleRewards` setSave
fold (StrictMode-safe). Claim = tap the completed writ (small ceremony, gold
flies). Unclaimed-but-complete writs **auto-bank at the daily reset** — loot is
never losable (house rule).

UI: a `QuestBoardPanel` on Home with a badge count; writs show the monster
portrait (`renderPortrait`), progress pips, and a gold stamp.

---

## C. The Library — Compendium as a bookshelf

Pure UI reskin; zero new data-model work. `CompendiumScreen.tsx`'s `MONSTER_IDS`
builder already walks the `DUNGEONS` registry per dungeon — it just flattens the
result today. Stop flattening it.

- **Shelf:** a candle-lit bookcase — one leather tome per dungeon (spine colored
  from `dungeon.theme`, name embossed vertically, a discovered/total ribbon, and a
  gilt gem once every monster in the book hits mastery rank 5) plus the
  **"Heroes of the Arena"** folio. Gated dungeons (`gate.depthsFloor`) show a
  chained, clasped book with the unlock hint.
- **Open book — two-page spread:** left page = the dungeon's lore (`entryHint`),
  boss portrait, completion stats, and the **sealed appendix pages** (relic-gated,
  section D). Right page = the monster index using the existing 3-tier reveal
  (`???` silhouette → Sighted → full entry), one row per monster with its mastery
  pips.
- **Monster page:** portrait, stats, traits, tendency line (if any), mastery bar +
  5 rank pips, lore lines unlocking at ranks 1 and 3, and at rank 5 a gilded page
  border + wax **"Slain: N"** seal. Boss pages flag an active Trophy writ ("The
  Huntmaster seeks this beast").
- **Navigation:** shelf → book → page; page-turn chevrons step through monsters in
  tier order; back closes the book to the shelf. No save fields needed.

> Implementation note for PR 1: `CompendiumScreen.tsx` currently carries a
> `TEMP reveal-all — revert before commit` debug line (`tierOf`, line 20). Revert
> it as part of the bookshelf PR.

---

## D. Relics — hidden collectables in opening floor zones

Sparkling curios half-buried in the dungeon floor. Strictly **UI/meta-layer** —
the combat digest is untouched, ever.

- **Roll:** at match start, `BattleScreen` draws its own `relicSeed`
  (`generateSeed()`, stored in a ref — the `chestSeed` precedent). A pure
  `rollRelicSpawn(relicSeed, dungeonId, floor)` in `src/meta/relics.ts` returns
  `null` or a spawn spec. **~35% of dungeon-mode runs, 50% on boss floors, max 1
  per run, never in Arena.**
- **The floor-zone mechanic:** the relic sits under an **animated floor
  hatch/crack that periodically opens** on a seeded schedule — first opening at
  15–45s, open ~6s, closed ~15s, repeating until battle end. While open, the relic
  sparkles and is tappable; while closed, a visible seam in the floor marks where
  to watch. Missing a window isn't punitive — it reopens. Uncollected at battle
  end = left behind (rerunning the floor rerolls the spawn).
- **Render:** a read-only overlay pass in `Renderer` (the trap draw-pass pattern),
  driven by battle elapsed time for the open/close schedule and wall-clock for the
  sparkle. Open/collected state lives in React state in `BattleScreen` — **never
  in `SimState`**.
- **Tap:** a new first check in the existing tap fall-through chain (before unit
  inspect), generous ~28px radius, only registers while the zone is open. Pop
  animation + "+1 Relic" float + a soft chime.
- **Grant:** folded into `grantBattleRewards`. **Kept even on defeat** — you
  grabbed it, it's yours (rewards the risky mid-fight tap, softens losses).
- **What they're for:** (1) the "Recover a Relic" daily writ; (2) **unsealing each
  book's 2 appendix pages** at 3 relics each (deep lore, the boss's tale, a
  concept-sketch page). Relics are tagged to the dungeon they dropped in and
  unseal *that dungeon's* book — thematic, and no chooser UI needed. Future: soft
  currency for Soul-Shop cosmetics (count is there; out of scope).

Expected income ≈ 1 per 3 runs, so a book fully unseals in a couple weeks of
casual play.

---

## E. Monster Mastery — the Slayer's Ledger

### Tracking

- `useBattleEngine.enemyLedger()` upgrades `slain: Set<defId>` → **per-defId
  counts** (count dead enemy units per defId; `seen` unchanged). The rare-spawn
  quest check reads the keys — behavior preserved.
- `BestiaryEntry` gains `kills: number` (save v7; migration seeds
  `kills = defeated ? 1 : 0`). `recordBestiary` adds the counts in the same fold.

### Ranks

5 ranks, thresholds banded by a new `masteryBand: "fodder" | "elite" | "boss"` on
monster UnitDefs (bosses/elites flagged by hand, default `"fodder"`); curve and
rewards live in `src/meta/mastery.ts`:

| Band | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| fodder | 10 | 25 | 50 | 100 | 200 |
| elite | 4 | 10 | 20 | 40 | 75 |
| boss | 1 | 3 | 7 | 15 | 25 |

### The damage bonus — deploy-time static, one engine seam

**+2% damage dealt per rank vs that defId, cap +10% at rank 5.** Delivery:
`MatchOptions.masteryBonus?: Record<defId, number>` computed from the save at
match launch, copied **frozen** onto `SimState` at construction, applied in the
`dealDamage` funnel when `source.team === "player"` (summons included, per
decision). Deterministic (static input, no RNG) and server-verifiable — the map
is match input, like decks. Existing invariants tests pass an empty map and stay
byte-identical; **digest changes only when a bonus is actually present.** One new
spec: known-HP dummy + `{dummy: 0.10}` → assert damage = base × 1.10 and
identical digests across two runs. Arena heroes grant no mastery — monsters only.

### Rewards per rank

- **Gold:** 10 / 20 / 30 / 50 / 100 (210 per monster lifetime; ~35 monsters ≈ 7k
  gold of long-tail).
- **Lore:** ranks 1 & 3 unlock the book-page lore lines (section C).
- **Cosmetic:** rank 5 gilds the book page + wax seal. *Stretch (flagged, not
  built):* boss rank-5 titles ("Ratsbane", "Lichslayer") joining the planned
  Soul-Shop title system.
- Rank-up detection: compare `rankOf(kills)` before/after inside the fold —
  inherently unfarmable.

---

## F. Interlock map

The **Board** (B) names today's prey → **Tendencies** (A) let you build a warband
that reliably reaches it (Big-Game Hunter for the Trophy writ, Backline Stalkers
for caster monsters) → every kill lands in the **Slayer's Ledger** (E), ticking
both the writ and the mastery bar → ranks pay gold, a small permanent edge against
exactly the monsters the board keeps sending you at, and lore that physically
fills the **Library's** books (C) → mid-run, **Relic** hatches (D) complete the
relic writ and unseal the books' appendix pages → the finished, gilded book is the
trophy case that makes tomorrow's board worth opening. One loop:
**hunt → record → collect → display.**

---

## G. Build order — 5 PRs, meta-first, engine last

Per `WORKFLOW.md`: each slice verified with `npm run typecheck` + `npm run build`
+ `npm test`, batched on PRs, **user approves every merge**.

1. **PR 1 — Save v7 + kill ledger + mastery ranks + Library bookshelf**
   *(meta-only, no digest risk).* The consolidated migration (section H),
   `enemyLedger` counts, `mastery.ts` ranks/rewards, bookshelf reskin with mastery
   bars + lore lines. Revert the TEMP reveal-all line in `CompendiumScreen.tsx`
   here. Every later slice depends on v7.
2. **PR 2 — Daily quests** *(meta-only).* `dailies.ts` roll + reset +
   `QuestBoardPanel`; the relic writ ships dormant behind the pool filter until
   PR 3.
3. **PR 3 — Relics** *(meta/UI; renderer overlay is read-only).* Floor-zone
   spawn/schedule, overlay draw pass, tap chain, per-dungeon inventory, sealed
   appendix pages, enable the relic writ.
4. **PR 4 — Tendencies** *(ENGINE, digest-affecting — the deliberate one; ships
   alone).* `tendencies.ts` registry, `UnitDef.tendency` fields, the
   `acquireTarget` seam, panel chip, `targeting.test.ts`, re-baselined digests,
   balance re-runs documented in the PR.
5. **PR 5 — Mastery damage bonus** *(ENGINE, digest-affecting only when
   present).* `MatchOptions.masteryBonus` → `dealDamage` multiplier + spec. Kept
   separate from PR 4 so each digest-relevant change is auditable alone.

---

## H. Save schema v7 — one migration covers everything

```ts
interface BestiaryEntry { encountered; defeated; kills: number }        // + kills

// PlayerSave additions:
daily: { date: string; quests: DailyQuest[]; allClearClaimed: boolean } | null;
dailySalt: number;                       // rolled once at migration
relics: Record<string, number>;          // dungeonId → relic count
bookPages: Record<string, number>;       // dungeonId → appendix pages unsealed (0–2)
```

`migrateSave` (pure, tested in `persistence.test.ts`): default-fill the new
fields; seed `kills` from `defeated`; clamp `relics`/`bookPages` to known dungeon
ids; `daily: null` — date-dependent rolling stays OUT of the pure migration
(`GameStateContext` rolls lazily on first hub render); bump to 7. Ships in PR 1
so PRs 2–5 are field-consumers, not version bumps.

```ts
interface DailyQuest {
  id: string;                    // "2026-07-07:cull:giant_rat"
  kind: "hunt" | "relic";
  dungeonId?: string; monsterId?: string;
  need: number; have: number;
  gold: number; claimed: boolean;
}
```

---

## Open items (defaults chosen; user can override later)

- Monsters stay Brawler for now; monster tendencies = a future difficulty lever.
- Trickster = Spellwrath (matches its anti-caster kit).
- Daily gold ~310/day; revisit if it erodes the unlock-price curve.
- All-clear bonus = flat gold + relic (a chest would need the chest ceremony
  hosted outside battle results — a bigger slice).
- Rank-5 boss titles on the profile plate = stretch, alongside the planned title
  system.
