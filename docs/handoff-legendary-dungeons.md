# Handoff — Themed Legendary Dungeons (+ bespoke sprites)

**Status:** ✅ Feature + art complete on branch `feat/legendary-dungeons`. **NOT
pushed, NOT merged** — `master` is untouched at `417f5f2`, so nothing has
deployed. Working tree is clean.

**Two commits atop `master`:**
- `0843095` — the six themed dungeons (framework + content).
- `962357a` — **bespoke animated sprites for every dungeon monster + waves
  aligned to the Depths** (this session).

**Verified** at `962357a`: `npm run typecheck` ✓, `npm run build` ✓, `npm test` ✓
(**207 pass, 1 skipped**). Sprites checked in-browser (see *Verify* below).

**What it is:** six themed, self-contained PvE dungeons, each unlocking one
existing legendary via a rare-spawn "fusion" quest (the Slime Knight pattern,
generalized). Each legendary is **quest-exclusive** (never chest-dropped, not
buyable until the quest is done; unlocks at a 2500g discount). Every dungeon
monster now has its **own bespoke, animated sprite** (no arena-unit reskins).

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

Shared shape for all six: **5 floors** (boss + rare catalyst on floor 5),
`gate: {depthsFloor: 5}`, `price: 2500`, `chance: 0.15`, budget **`25 + 3×floor`**
(aligned to the Depths in `962357a`), boss floor drops a **gold** chest. The
Depths is `DUNGEONS.depths` and still owns the Slime Knight quest.
(Note `id ≠ display name`: `summoner`=Druid, `healer`=Cleric.)

---

## Sprites — the "Dungeon bestiary" (the `962357a` work)

The original commit shipped monsters as **reskins** (each `switch(def.id)` case in
`src/assets/sprites.ts` aliased an arena unit's `draw*`). That's gone. Now:

- **29 bespoke `draw*` functions** in a grouped **"Dungeon bestiary"** section at the
  **end of `src/assets/sprites.ts`**, one per dungeon, in dungeon order. Every
  `switch(def.id)` case calls its own draw. `skeleton` + `spore_pod` already had
  bespoke art and were kept. The old shared `drawWisp` was **deleted** (both wisps are
  bespoke now → else `tsc noUnusedLocals` fires); `drawTreant` was renamed/rebuilt into
  `drawElderTreant`.
- **Conventions are written into the bestiary section header — READ THEM before adding a
  monster.** Two rules: (1) **lively** — every sprite carries ≥1 `A`-driven ambient (an
  `A.glow` pulse, a `rising()` mote emitter, an orbit/drift, or a hover; gate motion-only
  bits on `A.live` so hub portraits freeze cleanly); (2) **rare catalysts get a signature
  themed aura** (lich crystal-staff, apex_beast amber aura, archmage orbiting runes,
  wildheart golden heart-core, eclipse_herald light/dark wings + sun/moon orbs,
  ancient_automaton floating-segment energy spine).
- **Design directions the user drove** (each animated): **Elder Treant = "Gnarled
  Guardian"** (stern face carved into the bark; 3 alternate directions saved in
  `docs/elder-treant-mockups.md`); **Shadow Wraith = "Winged Nightmare"** (no arms, a
  pulsing dark aura); **Forge Golem = "Furnace Titan"** (glowing furnace-maw in the
  chest, flickering fire behind a grate); **Ancient Automaton = "Floating Segments"**
  (angular carved plates on a glowing energy spine that **stops at the waist** — no bar
  under the pelvis).
- **Fixes in the same commit:** both wolves (`dire_wolf`/`dire_alpha`) had legs drawn
  *over* the body — reordered to draw legs first (behind), with hocks + paws; both bears
  (`grizzly`/`apex_beast`) were a blob-with-a-side-head — rebuilt as proper **front-facing**
  anatomy with a **centred** head; `spore_pod` made lively (breathing cap, pulsing
  glow-spots, rising spores).
- **New helper:** `poly(ctx, pts)` (near `withAlpha`) builds a closed polygon path for
  angular, non-rounded shapes.
- **Kits/data unchanged** — behavior still comes from the reused kits (below); only the
  *art* changed. Sprites are presentation-only (Renderer reads snapshots), so none of this
  touches determinism or the engine tests.

### Sprite conventions / gotchas (for the next monster)
- Author facing **right** (heads/weapons to the right) — the Renderer mirrors for facing.
- Draw quadruped **legs before the body** so the torso overlaps their tops.
- Front-facing creatures (bears) read best with a **centred** head, not a side-stuck one.
- Bosses/catalysts are **scaled at the call site** (`ctx.scale(...)` before the draw) — if
  a scaled sprite's feet punch through its shadow, add a `SHADOW_BY_ID` entry (see the
  `abomination` one).

---

## Waves — already like the Depths

The `WaveController` (`src/engine/WaveController.ts`, ctor `(seed, dungeon, floor)`) and
the per-floor stat scaling (`DEPTHS_HP_PER_FLOOR` +8%/floor, `DEPTHS_DMG_PER_FLOOR`
+5%/floor) are **shared and identical** across every dungeon. The only prior difference
was the wave-**size** budget (`18 + 4×floor`); `962357a` aligned all six themed dungeons
to the Depths' `25 + 3×floor`. So every dungeon now ramps floor-by-floor like the Depths.
Tests are structural (boss-last, catalyst-before-boss, determinism), so this stayed green.

---

## Architecture — where everything lives

- **`src/data/dungeons.ts`** — the `Dungeon` interface + `DUNGEONS` registry (incl.
  `depths`). Dungeon-scoped wave helpers (`tierForFloorIn`, `isBossFloorIn`,
  `waveBudgetIn`, `floorStatMultipliersIn`, `questForFloorIn`, `getDungeon`) + the
  **cross-dungeon** quest derivations `QUEST_LOCKED_UNITS` / `questForUnlock` /
  `ALL_QUESTS`. `depths.ts` holds the shared shapes (`DepthsTier`, `RareSpawnQuest`) + the
  Depths' own tuning.
- **`src/engine/MatchController.ts`** — `MatchOptions.dungeonId` (defaults `"depths"`);
  resolves via `getDungeon` and hands the dungeon to the WaveController.
- **`src/meta/rewards.ts`** — `computeBattleRewards(dungeonId, …)`; boss chest = `silver`
  for depths, `gold` else.
- **`src/state/persistence.ts`** — **save v6**: `save.dungeons: Record<id,
  {highestClearedFloor}>`; `migrateSave` copies legacy `depths`; `highestClearedFloorOf`.
- **`src/state/GameStateContext.tsx`** — `grantBattleRewards` ctx gains `dungeonId`.
- **UI** — `src/components/DungeonMapSheet.tsx` (dungeon select), `FloorPickerSheet.tsx`
  (takes a `Dungeon`); `dungeonId` threads `App` → `AppShell` → `HomeScreen` →
  `BattleScreen` → `useBattleEngine` (backdrop = `getDungeon(id).theme`).
- **`src/screens/CompendiumScreen.tsx`** — bestiary aggregates ALL dungeons' tiers + each
  dungeon's non-deckable catalyst. Reveal tiers come from `save.bestiary`
  (undiscovered → encountered → **defeated** = full art).

### Kit / data reuse (behavior — unchanged by the sprite work)
- Reused kits: `ogreKit` → abomination/apex_beast/elder_treant/forge_golem; `berserkerKit`
  → dire_alpha/wildheart; `necromancerKit` → lich; `arcaneMageKit` → archmage/eclipse_herald;
  `mysticArcherKit` → eclipse_warden; `clericKit` → dryad.
- New kits (2): `engine/kits/bonecaller.ts` (Raise Dead), `engine/kits/runeGolem.ts` (halves
  incoming damage — also on `ancient_automaton`).
- Monsters live in `src/data/units.ts` (grouped by dungeon, after the Depths block), all in
  `NON_DECK_UNITS`. No new abilities — reused `crushing_slam`/`curse`/`fear_aura`/`mend`/
  `momentum`/`arcane_barrage`/`bloodrage`/`lifesteal`.

---

## How to add or change a dungeon / monster

1. `RareSpawnQuest` const + `DUNGEONS` row in `data/dungeons.ts`. The `unlocks` id
   auto-joins `QUEST_LOCKED_UNITS`.
2. Monsters in `data/units.ts` (+ `NON_DECK_UNITS`); reuse an ability id (a missing one
   crashes the panel) + `traits` for the detail panel.
3. Behavior: reuse a kit in `kits/UnitKit.ts` or write a tiny one; pure-stat fodder needs none.
4. **Sprite: write a bespoke `draw*` in the "Dungeon bestiary" section** (follow the header
   conventions — lively + catalyst aura) and wire the `switch(def.id)` case. No more reskins.
5. Test: add a `describe` block in `src/engine/__tests__/depths.test.ts` (copy an existing
   dungeon's — determinism, boss-last, catalyst-before-boss, full descent). Quest invariants
   in `rewards.test.ts` auto-cover any new `DUNGEONS` row.

---

## Verify

`npm run typecheck` AND `npm run build` (build does NOT type-check) AND `npm test`.

**In-browser sprite check (how it was done this session):** the themed dungeons are gated
(Depths floor 5) and bosses/catalysts show as **silhouettes** in the Compendium until
defeated, so sprites were verified by rendering them directly via the real draw path:
- Start the **`preview`** launch config (port 5250, `strictPort`). ⚠ The **`dev`** config
  auto-ports and the harness proxy then 404s the tab — use `preview`.
- `preview_eval` an overlay canvas that `await import('/src/assets/sprites.ts?v='+Date.now())`
  (cache-bust) and calls `drawUnitSprite(ctx, {defId, uid, facing:1, animState:'idle',
  animTime:0, attackSpeed:1.5, effects:[]}, cx, cy, {scale})`.
- To browse ALL sprites in the real Compendium UI, temporarily patch `tierOf` in
  `CompendiumScreen.tsx` to `return "defeated"` (a dev-only reveal-all) — **and revert it
  before committing** (it was reverted in `962357a`).
- ⚠ **A `requestAnimationFrame` animation loop in the overlay saturates the renderer and
  TIMES OUT `preview_screenshot`.** For animated mockups, either pause/cancel the rAF, or
  draw a single **static** frame, before screenshotting.

---

## Gotchas / invariants

- **Quest-exclusive ripple:** a legendary's `unlocks` id joining `QUEST_LOCKED_UNITS` pulls it
  from chests + grandfather grant + gold purchase. It once broke a `persistence.test.ts`
  fixture assuming a grandfathered deck kept `summoner` — watch this when a new legendary
  becomes quest-locked.
- **`rewards.test.ts` invariants:** each dungeon's `quest.floor ≤ dungeon.floors`; `spawnId`
  real; `requires` + `unlocks` deckable; `unlocks` a non-starter AND in `QUEST_LOCKED_UNITS`.
  Keep `requires` a starter / early-Depths unit (never quest-locked → no chicken-and-egg).
- **Determinism preserved:** WaveController seed formula unchanged; the Depths' waves stay
  byte-identical (`invariants.test` digest green). Sprites are presentation-only.

---

## Open items / suggested next steps

- **Push + PR** when ready (local commits only; nothing deployed). Merging to `master`
  auto-deploys via Netlify — the user's explicit call.
- **See the new sprites in a live battle** — this session verified them via the overlay +
  Compendium cards (the same `drawUnitSprite` path), not a played-through gated dungeon.
  Optionally play a Depths→themed run (or temp-unlock via `save.dungeons`) to eyeball them
  fighting/attacking/dying.
- **Balance pass** — floors are first-pass numbers. Headless winrate sweep (NOTES.md hazard
  4b). Knobs (`data/dungeons.ts`): `budgetBase`/`budgetPerFloor`, boss HP (`units.ts`), the
  Rune-Golem/Automaton `WARD_MULT` (0.5), `chance`, `price`, `gate`.
- **`slime` special case** — deckable legendary AND the Slime Knight catalyst; left
  buyable/chest as-is. A future "Sludge Pits" ooze dungeon could quest-lock it.
- **Optional polish** — dedicated backdrops for grove/spire (reuse `glade`/`sanctum`);
  `pickDepthsTrack` is floor-based, not dungeon-aware (boss music lands on floor 5, fine
  for these). Alternate Elder Treant art in `docs/elder-treant-mockups.md` if you want a
  different treant later.

## Git state

- Branch `feat/legendary-dungeons` @ `962357a` (2 commits atop `master` `417f5f2`).
- `master` untouched; nothing pushed/merged/deployed; working tree clean.
- Continuity also in the `themed-legendary-dungeons` memory + `progress.md` + `NOTES.md`.
