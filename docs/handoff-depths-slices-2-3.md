# Handshake — Depths slice 2 (content) + slice 3 (bestiary rewards & Soul Shards)

A build-ready handoff for the next session. Slice 1 (the economy core loop) shipped
in PR #44 (`a0ec2fe`, merged 2026-07-04). This picks up the roadmap in
[`progress.md`](../progress.md) — read that section first; this doc turns slices 2 & 3
into concrete anchors, sequencing, and open decisions.

**Ground rules that still hold** (don't relearn the hard way):
- The **engine never learns about rewards** — all economy logic is meta-layer
  (`src/meta/`, `src/state/`). `src/meta/` imports only from `data/` + types.
- **No `Math.random()`** anywhere in sim or reward rolls — seeded `RNG`
  (`src/utils/rng.ts`); reward rolls use a drop-time seed stored on the result.
- **Every tunable number** lives in one file: `src/meta/economy.ts`.
- Gate **every commit**: `npm run typecheck && npm run build && npm test`. Batch onto
  **one** branch/PR; **never merge without the user's OK** (each merge = a Netlify
  deploy). See `WORKFLOW.md`.
- Adding a monster = one `UnitDef` + (if it does more than attack/move) one kit. See
  the checklist in `NOTES.md` and the add-a-unit docs.

---

## Slice 2 — Depths content (undead tier 6–10, then 11–15, 16–20)

**Goal:** extend the campaign past floor 5 by building the approved monsters and adding
tiers to the data table. Pure content on top of shipped systems — no new architecture.

### What already carries this
- `src/data/depths.ts` — `DEPTHS_TIERS` (one tier today: floors 1–5), `tierForFloor`,
  `waveBudget(floor) = 10 + floor*3`, `isBossFloor` (every 5th), `BOSS_FLOOR_INTERVAL`.
  **Adding a tier is just a new `DepthsTier` entry** `{ floors: [6,10], monsters: {...},
  boss: "abomination" }`.
- `src/engine/WaveController.ts` reads the tiers and builds each floor's horde
  deterministically from seed + floor (private RNG stream — never perturbs Arena).
- The **floor picker auto-extends**: `FloorPickerSheet` caps selectable floors at
  `MAX_FLOOR_WITH_DATA = DEPTHS_TIERS[last].floors[1]`. Add tier 6–10 → floors 6–10
  become reachable with zero UI work.
- The **Compendium auto-grows**: its "Monsters of the Depths" roster derives from
  `DEPTHS_TIERS`, so new monster ids appear there automatically (needs their
  `traits`/ability data to render the lore page — same as any unit).

### The approved monster list (from progress.md, user-greenlit 2026-07-01)
Non-deckable → add each id to `NON_DECK_UNITS` in `src/data/units.ts`. Several can
recolor existing sprites (skeleton/wolf/slime — the fodder tier did exactly this).
Fodder stat band ≈ Skeleton `45hp/8dmg` … Boar `140hp`.

- **6–10 undead → boss Abomination:** Skeleton Archer (plain arrows), Ghoul (haste on
  ally death), Bonecaller (raises skeletons — reuse Necromancer's Raise Dead). Boss
  **Abomination** (huge HP, slam + one revive — reuse Ogre slam + Second Wind).
- **11–15 deep crypt → boss Gargoyle:** Spider (poison glob), Imp (burn bolts), Banshee
  (fear-wail + stealth), Plague Shaman (heal + haste the horde). Boss **Gargoyle**
  (heavy damage reduction).
- **16–20 the throne → boss Lich:** elite mixes, Spore Pod (spawns sporelings on death),
  Bat Swarm. Boss **Lich** (curse DoT + raise dead).

These wake the dormant statuses PvE should use: `fear`, `haste`, `stealth` (`poison`
already woke with the fodder slice). Most mechanics already exist as kit hooks — grep
the matching hero kit and reuse (`kits/necromancer.ts` Raise Dead, `kits/ogre.ts`
Second Wind, etc.). A monster's real kit lives in `traits` for the Compendium; the
`ability: "lifesteal"` slot is the never-casts filler for pure-stat monsters (see
`giant_rat` at `data/units.ts:589` as the template).

### Difficulty pass (do it as floors become reachable)
Floor 1 clears in ~15s for a full warband — fine as an opener, but tune `waveBudget` /
`WAVE_SPAWN_INTERVAL_SEC` / per-monster costs in `data/depths.ts` as the curve extends.
**Profile before** pushing the enemy active cap past 8 (`DEPTHS_ENEMY_ACTIVE` / the
`activeCaps` set in `MatchController` depths mode) — NOTES.md hazard 4 targets ~8 active
units / 60fps on mobile and Depths already runs right at it.

### Chests get richer with depth
Gold-tier chest data already exists (`CHEST_GOLD_RANGE.gold`, `CHEST_UNIT_CHANCE.gold`).
Wire `chestTierFor` in `src/meta/rewards.ts` (currently silver on any boss floor) so
**deep bosses drop gold-tier chests** — e.g. gold on floor ≥ 15, silver on 5/10. One
function, covered by the existing rewards specs.

### Suggested commit sequence (slice 2)
Build **one tier at a time**, each shippable on its own:
1. `feat(depths): undead tier monsters — Skeleton Archer, Ghoul, Bonecaller` (+ per-unit
   engine specs; recolor sprites where noted).
2. `feat(depths): Abomination boss + tier 6–10 in DEPTHS_TIERS` (floors 6–10 reachable).
3. `feat(depths): difficulty tuning for floors 6–10` (+ chestTierFor gold-tier bump).
4. Repeat 1–3 for 11–15 (Gargoyle) and 16–20 (Lich) as separate later batches.

### Verify (slice 2)
- `npm test` — the `invariants` spec runs **every** `DECKABLE_UNIT_IDS` unit to a
  finished match; add new **monster** ids to whatever drives the depths spec so a horde
  including them completes without crashing (see `engine/__tests__/depths.test.ts`).
- In-browser (Vitest is engine-only): open each new monster's Compendium page (confirm
  traits/ability render, no ErrorBoundary — the portrait-stub trap, NOTES hazard 6), then
  descend the new floors and watch a horde resolve. Use the `preview` launch config
  (port 5250) if 5173 is taken; drive the frozen-tab battle via the rAF-worker trick in
  the `verify-in-browser-render` memory.

---

## Slice 3 — Bestiary rewards + Soul Shard earn-side

**Goal:** give the meta-loop a second, scarcer currency and reward *discovery*, not just
winning. All meta-layer. Depends on nothing from slice 2 except that more monsters/bosses
existing makes the rewards meaningful — **the two slices interleave**.

### Save v4 (additive versioned-merge, exactly like v2→v3)
Add to `PlayerSave` in `src/state/persistence.ts`:
- `soulShards: number` — the premium currency (scarce by design).
- `bossFirstKills: string[]` — boss defIds first-killed (drives Soul Shard grants + later
  the "Lichslayer"-style titles in slice 5).

`migrateSave`: default both for pre-v4 saves (`soulShards: 0`, `bossFirstKills: []`);
bump `DEFAULT_SAVE.version` to 4. Since floors are linear, a v3→v4 migration **can
backfill** `bossFirstKills` from `depths.highestClearedFloor` (≥5 ⇒ Bloater killed, ≥10 ⇒
Abomination, …) — noted as a v3 headroom item. Add a `persistence.test.ts` case.

### One-time bestiary rewards — hook `recordBestiary`
`recordBestiary(seen, slain)` in `GameStateContext.tsx:70` currently just sets the
`encountered`/`defeated` flags. It is the **exact transition point**: detect the
`false → true` edge per id inside that same `setSave` fold and grant gold then. Because it
only ever fires on the upgrade write, the reward is **inherently unfarmable** (replaying a
known monster is a no-op). Straw-man numbers → `src/meta/economy.ts`:
- First **encounter**: 10–15 gold. First **defeat**: 40–60 gold.
- **Boss/legendary first defeat** also grants Soul Shards + records `bossFirstKills`.
- **Section complete** (all monsters of a floor tier defeated — derive the tier roster
  from `DEPTHS_TIERS`): Soul Shards + gold. **Full Compendium**: a big Soul payout (+ a
  title, once slice 5 exists).

Keep the grant pure and inside the single `setSave` (StrictMode runs updaters twice —
same discipline as `grantBattleRewards`). Consider a small pure helper
`bestiaryRewardFor(prev, next)` in `src/meta/rewards.ts` so it's headlessly testable, and
have `recordBestiary` apply its result — mirrors the slice-1 compute/grant split.

### 3-star floors (clear without losing a unit → bonus gold)
Needs a signal the meta layer doesn't have yet: **did the player lose any unit this
match?** `enemyLedger()` in `useBattleEngine` surfaces enemy `seen`/`slain`; add a
parallel read for the player side (e.g. `playerLosses()` or fold a `lostUnit` boolean into
the battle-end payload). Then in `computeBattleRewards`, a flawless Depths first clear pays
a bonus. Persist per-floor stars if you want to show them in the picker (extends
`DepthsProgress` — additive). **Open decision:** star tracking (bonus-gold-only vs. a
persisted star map shown on the floor picker) — ask the user before building the heavier
option.

### Soul Shard sink
Soul Shards earned in slice 3 have **no spend yet** — that's the slice 5 Soul Shop. That's
fine (players accumulate first), but **confirm with the user** they're OK earning a
currency before it's spendable, or pull one cheap sink forward. Design rule to preserve:
**the Soul Shop sells distinction, never battle power** — no stat boosts, revives, or
timers.

### Suggested commit sequence (slice 3)
1. `feat(save): v4 — soulShards + bossFirstKills (+ backfill migration, specs)`.
2. `feat(meta): bestiaryRewardFor pure helper + economy numbers (specs)`.
3. `feat(state): grant bestiary rewards on the recordBestiary transition`.
4. `feat(battle): player-loss signal + 3-star flawless-clear bonus`.
5. Surface Soul Shards in the shell (a second pill by the gold pill in `AppShell`).

### Verify (slice 3)
- Headless specs for `migrateSave` v4 (defaults + backfill) and `bestiaryRewardFor`
  (encounter/defeat edges, boss shards, section-complete, idempotence on a repeat).
- In-browser: fresh save → first-encounter and first-defeat gold pop once and not on
  replay; kill a boss → Soul Shard pill increments + `bossFirstKills` records; flawless
  clear → star/bonus. Confirm the grant is exactly-once under StrictMode.

---

## Open decisions to raise with the user (before building)
1. **3-star tracking depth** — bonus-gold-only, or a persisted per-floor star map shown on
   the floor picker?
2. **Soul Shard timing** — earn them in slice 3 with no sink until slice 5, or pull one
   cheap sink forward?
3. **Tier cadence** — ship undead (6–10) as its own PR/deploy, or hold and batch it with
   deep-crypt (11–15)? (Merges are infrequent by design.)
4. **Difficulty target** — how punishing should floors 6+ be? (Sets the `waveBudget` curve
   and whether the enemy cap rises past 8, which needs a perf profile.)
