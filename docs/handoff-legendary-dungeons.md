# Handoff — Themed Legendary Dungeons

**Status:** ✅ Feature complete, committed on branch `feat/legendary-dungeons`
(commit `0843095`, 26 files, +2141/−142). **NOT pushed, NOT merged** — `master`
is untouched at `417f5f2`, so nothing has deployed. Working tree is clean.

**What it is:** six themed, self-contained PvE dungeons, each unlocking one existing
legendary via a rare-spawn "fusion" quest (the Slime Knight pattern, generalized).
Each legendary is now **quest-exclusive** (pulled from chests + the standard gold
purchase; the quest is the only way to unlock buying it, at a 2500g discount).

Verified: `npm run typecheck` ✓, `npm run build` ✓, `npm test` ✓ (**207 pass**),
and an in-browser pass (all 7 dungeons in the map, each battle renders error-free,
gating surfaces correctly in the Collection).

---

## Follow-up — bespoke sprites + wave alignment (2026-07-06, UNCOMMITTED, on top of `0843095`)

The original commit shipped the monsters as **reskins** (each `switch(def.id)` case
aliased an arena unit's `draw*`). Per user direction, that was replaced:

- **Every dungeon monster now has its OWN bespoke sprite** — 29 new `draw*` functions
  in a grouped "Dungeon bestiary" section at the end of `src/assets/sprites.ts`
  (`skeleton` + `spore_pod` were already bespoke and kept; the old shared `drawWisp`
  was deleted since both wisps are bespoke now). All `switch(def.id)` cases rewired.
- **Every sprite is "lively"** (≥1 `A`-driven ambient — glow/`rising()` motes/hover),
  and **each rare catalyst has a signature themed aura** (lich crystal-staff, apex_beast
  amber aura, archmage orbiting runes, wildheart golden heart-core, eclipse_herald
  light/dark wings + sun/moon orbs, ancient_automaton hex ward + core). Conventions are
  written into the bestiary section header — follow them for any new dungeon monster.
- **Waves:** the WaveController + per-floor HP/dmg scaling were already identical to the
  Depths; the only gap was the budget dial, so all six themed dungeons were aligned
  `18 + 4×floor → 25 + 3×floor` to match. (So the `budget 18 + 4×floor` note below is now
  `25 + 3×floor`.)

Re-verified: `typecheck` ✓ `build` ✓ `npm test` ✓ (207 pass). Sprites checked in-browser by
rendering each set via `drawUnitSprite` (the real draw path). **Preview quirk:** the `dev`
launch config auto-ports and the harness proxy 404s — use the **`preview`** config
(port 5250, `strictPort`).

---

## The six dungeons

| id | Name | Unlocks (defId) | Theme | Field (`requires`) | Rare catalyst (`spawnId`) | Boss |
|---|---|---|---|---|---|---|
| `bonefields` | The Bonefields | `necromancer` | `dungeon` | `fire_mage` | `lich` | `abomination` |
| `wilds` | The Wilds | `hunter` | `glade` | `archer` | `apex_beast` | `dire_alpha` |
| `sealed_vault` | The Sealed Vault | `aegis_knight` | `sanctum` | `knight` | `archmage` | `rune_golem` |
| `overgrowth` | The Overgrowth | `summoner` (Druid) | `glade` | `healer` (Cleric) | `wildheart` | `elder_treant` |
| `eclipse_spire` | The Eclipse Spire | `mystic_archer` | `sanctum` | `mage` | `eclipse_herald` | `eclipse_warden` |
| `deep_forge` | The Deep Forge | `engineer` | `forge` | `ogre` | `ancient_automaton` | `forge_golem` |

Shared shape for all six: **5 floors** (boss + rare catalyst on floor 5), `gate: {depthsFloor: 5}`,
`price: 2500`, `chance: 0.15`, budget `18 + 4×floor`, boss floor drops a **gold** chest.
The Depths is now just `DUNGEONS.depths` and still owns the Slime Knight quest.
(Note `id ≠ display name`: `summoner`=Druid, `healer`=Cleric.)

---

## Architecture — where everything lives

The one-time framework (built in "Slice A", then B–F were pure content):

- **`src/data/dungeons.ts`** — the `Dungeon` interface + `DUNGEONS` registry (incl. `depths`).
  Home of the dungeon-scoped wave helpers (`tierForFloorIn`, `isBossFloorIn`,
  `waveBudgetIn`, `floorStatMultipliersIn`, `questForFloorIn`, `getDungeon`) and the
  **cross-dungeon** quest derivations `QUEST_LOCKED_UNITS` / `questForUnlock` / `ALL_QUESTS`
  (these moved OUT of `depths.ts` so they span every dungeon). `depths.ts` still holds the
  shared shapes (`DepthsTier`, `RareSpawnQuest`) + the Depths' own tuning (kept so its waves
  stay byte-identical).
- **`src/engine/WaveController.ts`** — constructor is `(seed, dungeon, floor)`; reads the
  dungeon's tiers/boss/budget/scaling/quest.
- **`src/engine/MatchController.ts`** — `MatchOptions.dungeonId` (defaults `"depths"`); resolves
  the dungeon via `getDungeon` and hands it to the WaveController.
- **`src/meta/rewards.ts`** — `computeBattleRewards` takes `dungeonId`; looks up the quest via
  `questForFloorIn(getDungeon(dungeonId), floor)`; boss chest = `silver` for depths, `gold` else.
- **`src/state/persistence.ts`** — **save v6**: `save.dungeons: Record<id, {highestClearedFloor}>`
  replaced the single `save.depths`. `migrateSave` copies the legacy `depths` field into
  `dungeons.depths`. Helper `highestClearedFloorOf(save, id)`.
- **`src/state/GameStateContext.tsx`** — `grantBattleRewards` ctx gains `dungeonId`; writes the
  per-dungeon map; milestone unlocks stay Depths-only.
- **UI** — new **`src/components/DungeonMapSheet.tsx`** (dungeon select: name, lore, the legendary
  it unlocks, gate lock). **`FloorPickerSheet.tsx`** generalized to take a `Dungeon`. `dungeonId`
  threads `App.tsx` → `AppShell` → `HomeScreen` (`onBattle(mode, floor?, dungeonId?)`) and
  `BattleScreen` → `useBattleEngine` (reads `getDungeon(id).theme` for the backdrop).
- **`src/screens/CompendiumScreen.tsx`** — the bestiary roster now aggregates ALL dungeons' tiers
  (+ each dungeon's non-deckable catalyst).

## Content reuse map (why it was cheap)

- **Reused kits** (all defId-agnostic): `ogreKit` → abomination/apex_beast/elder_treant/forge_golem;
  `berserkerKit` → dire_alpha/wildheart; `necromancerKit` → lich; `arcaneMageKit` →
  archmage/eclipse_herald; `mysticArcherKit` → eclipse_warden; `clericKit` → dryad.
- **New kits (2):** `src/engine/kits/bonecaller.ts` (Raise Dead), `src/engine/kits/runeGolem.ts`
  (halves all incoming damage — also on `ancient_automaton`).
- **New sprites (3) in `src/assets/sprites.ts`:** `drawWisp`, `drawTreant`, `drawSporePod`. Everything
  else is a reskin (`switch(def.id)` case aliasing an existing draw + the unit's color/accent).
  New sprites `void A` (the SpriteAnim) so they're portrait-stub safe.
- **Monsters** live in `src/data/units.ts` (grouped by dungeon, after the Depths block) and are all
  added to `NON_DECK_UNITS`. **No new abilities were needed** — reused `crushing_slam`/`curse`/
  `fear_aura`/`mend`/`momentum`/`arcane_barrage`/`bloodrage`/`lifesteal`.

---

## How to add or change a dungeon (the pattern)

1. Add a `RareSpawnQuest` const + a `DUNGEONS` row in `data/dungeons.ts` (theme, tiers, boss, quest,
   `gate`, `entryHint`). The `unlocks` id auto-joins `QUEST_LOCKED_UNITS`.
2. Add its monsters to `data/units.ts` (+ `NON_DECK_UNITS`); reuse an ability id (a missing one
   crashes the panel).
3. Behavior: reuse a kit in `kits/UnitKit.ts` (register `defId: someKit`) or write a tiny kit;
   pure-stat fodder needs none.
4. Sprite: add a `case` in `sprites.ts` aliasing an existing `draw*` (recolor via color/accent), or
   write a new `draw*` if no base fits.
5. Test: add a `describe` block in `src/engine/__tests__/depths.test.ts` (copy an existing dungeon's
   block — determinism, boss-last, catalyst-before-boss, full descent). The quest invariants in
   `rewards.test.ts` auto-cover any new `DUNGEONS` row.

## Verify

`npm run typecheck` AND `npm run build` (build does NOT type-check) AND `npm test`. For UI, run
`npm run dev`, open **Dungeons** (themed dungeons are `🔒` until Depths floor 5 is cleared), descend,
and confirm the backdrop + sprites + the legendary flipping to buyable in the Collection.

---

## Gotchas / invariants (learned building this)

- **Quest-exclusive ripple:** making a legendary's `unlocks` id join `QUEST_LOCKED_UNITS` pulls it from
  chests + the grandfather grant + gold purchase. It also broke a `persistence.test.ts` fixture that
  assumed a grandfathered deck kept `summoner` — fixed by swapping that fixture deck off legendaries.
  **Watch this** whenever a new legendary becomes quest-locked.
- **Test invariants** (rewards.test.ts): each dungeon's `quest.floor ≤ dungeon.floors`; `spawnId` is a
  real def; `requires` + `unlocks` are deckable; `unlocks` is a non-starter AND in `QUEST_LOCKED_UNITS`.
  Keep `requires` a starter or early Depths-milestone unit (never a quest-locked one → no chicken-and-egg).
- **Determinism preserved:** the WaveController seed formula is unchanged, so The Depths' waves stay
  byte-identical (invariants.test digest still green).
- **Preview screenshots glitched this session** (captured a thin strip during battle) — verification
  fell back to `preview_console_logs` (no render errors) + DOM `eval` (enemy counts, floor-picker text,
  card lock labels). Not a code issue; if it recurs, trust the console/DOM signals.

## Open items / suggested next steps

- **Push + PR** when ready (this is a local branch commit; nothing has deployed). Merging to `master`
  auto-deploys via Netlify.
- **Balance pass** — the new floors are first-pass numbers. Do a headless winrate sweep (see NOTES.md
  hazard 4b for the Depths method). Knobs (all in `data/dungeons.ts`): per-dungeon `budgetBase`/
  `budgetPerFloor`, boss HP (in `units.ts`), the Rune-Golem/Automaton `WARD_MULT` (0.5), `chance`,
  `price`, `gate`.
- **`slime` special case:** it's a deckable legendary AND the Slime Knight's catalyst — left buyable/
  chest as-is (out of scope). A future "Sludge Pits" ooze dungeon could unlock it.
- **Optional polish:** dedicated backdrops for the grove/spire (currently reuse `glade`/`sanctum`,
  shared with Wilds/Sealed Vault); `pickDepthsTrack` is floor-based (boss music lands on floor 5, which
  works for these, but it isn't dungeon-aware).

## Git state

- Branch `feat/legendary-dungeons` @ `0843095` (1 commit atop `master` `417f5f2`).
- `master` untouched; nothing pushed/merged/deployed; working tree clean.
- Continuity also captured in the `themed-legendary-dungeons` memory + `progress.md` + `NOTES.md`
  (the "Dungeons are data" hazard).
