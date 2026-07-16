# Handoff — On-Floor Chest + Omen Paths + Random Encounters (2026-07-15)

**Status: BUILT, static-verified, 2 runtime bugs fixed. Committed 2026-07-16 onto the batch branch `feat/atlas-descent-chest-corpses-batch`.**
Gate is green: `npm run typecheck` + `npm run build` + `npm test` (**602 pass / 2 skip**, incl. 15 new in `src/engine/__tests__/encounters.test.ts`).

> ⚠️ **This is ONE big batch stacked on the prior session's Dungeon Atlas / Continue-Deeper work** (see `memory/dungeon-atlas-built.md` — the atlas, the campfire outro, the painted biome layer), and joined by the RNG boss-hunt descent and the per-unit corpse decals. They ship together.

---

## What was added THIS session (on top of the atlas)

The post-victory descent got a lot richer. Three phases, all landed:

### 1 · On-floor reward chest
The Depths "continue-deeper" reward chest now opens **on the arena floor** instead of only in the pop-up panel. New outro sequence in `BattleScreen.tsx`: `chest → camp → choice → walkout` (was `gather → choice → walkout`).
- Chest materializes up-field at `CHEST_POINT = {240, ~316}` (above `CAMP_POINT {240,396}`), the warband gathers **in front** of it (`OutroCinematic.gatherAtChest` + `arcBefore`), you **tap it** to open, gold counts up + the item **rises forge-style**, then the band walks **down** to the campfire and the omen arrows appear.
- **Chest BODY = canvas** (drawn in `Renderer.ts`, `RenderExtras.chests` is an **array** so a treasure room fields 3) so it y-sorts with the heroes + is world-hit-testable. **Loot REVEAL = HTML overlay** (`FloorLootReveal.tsx`, anchored via `fieldTransform` like `BattleUnitTip`).
- Shared draw core extracted to **`src/assets/chestArt.ts`** (SFX-FREE — the driver owns the beats); `useCountUp` extracted to **`src/hooks/useCountUp.ts`**. Old `ChestSprite`/`RewardPanel` re-import them.
- `RewardPanel` gained `hideChest` — for depths continue-deeper (full motion) the pop-up chest is suppressed (opens on the floor instead); **reduced-motion AND Return-to-Hub keep the pop-up chest** (their only reveal).

### 2 · Meaningful omen paths
The three exit arrows now show an omen — 🌿 safe / ☠ ominous / 💰 treasure — and the pick sets the **next** floor's `EncounterKind`. New leaf module **`src/data/encounters.ts`**: `EncounterKind`, `omenFor`, `OMEN_META`, `assignOmens(seed, dungeon, nextFloor)`.
- `assignOmens` is **seeded + frozen** (a `new RNG` meta stream, computed once in a `useState` initializer in `BattleScreen`) and **boss-floor-aware** (all-normal when the next floor is a boss). One arrow is always a plain road; the other two each *roll* (often normal, sometimes an omen).
- Threaded, default `"normal"` at every hop: `BattleScreen.chooseExit → onContinueDeeper(id, encounter) → App.pendingAtlas → AppShell → DungeonAtlas.initialFocus → onEnterFloor → onBattle → useBattleEngine → MatchController(MatchOptions.encounter) → WaveController`.

### 3 · The encounters
- **`ambush`** — ❌ **REMOVED 2026-07-16.** It promoted the floor's *priciest ordinary* monster to rare level behind a rare telegraph — i.e. a "rare Zombie Shambler" in the Depths. Per the user, **only the fusion-quest rare may ever wear the rare banner**, and since the elite *was* the whole encounter, the kind is gone (`buildAmbushPlan`, `priciestMonster`, `AMBUSH_SALT` deleted; `AMBUSH_FODDER_SHARE` → `QUARRY_FODDER_SHARE`, still used by the rare-quarry plan). The ☠ slot's danger odds are unchanged — it's just always `cursed` now.
- **`cursed`** — bigger horde (`CURSED_BUDGET_MULT`) + tougher stats (`CURSED_HP/DMG_MULT`), guarded to the cursed path only. Better chest. **The only "ominous" danger.**
- **`rare_spawn`** — the dungeon's fusion-quest rare, guaranteed + telegraphed, no boss. **Never announced**: it hides behind a random arrow wearing that arrow's omen (see `OmenArrow`).
- **`treasure_vault`** — normal fight, wave byte-identical to normal; **only** the end-chest tier bumps (in `rewards.ts`).
- **`treasure_room`** — NO combat: banner + gold on the floor + **3 openable chests** + reduced XP. See the trap below.

---

## Determinism (held) + save version (unchanged)

- Every new roll is a **guarded, seeded meta-stream** (omen `^0x0e17`, treasure chests `^0x77a1/^0x77b2`, off the drop-time `chestSeed`). The `"normal"` path runs the **exact old RNG call order** → the 567 pre-existing tests are still byte-identical (`encounters.test.ts` asserts `drain(seed,floor,"normal") === drain(seed,floor)` and vault === normal).
- **No save-version bump** (stays v13). Chest contents are granted-then-revealed and never persisted; `EncounterKind`/omens are transient runtime state.
- Tunables live in `src/data/encounters.ts` (`CURSED_*`, `QUARRY_FODDER_SHARE`, `RARE_QUARRY_CHANCE`, `TREASURE_ROOM_TIERS = ["silver","gold","silver"]`, `richChestBump`). **Numbers are first-pass / un-swept** — per `memory/themed-legendary-dungeons.md` the user reverted a sweep-based retune once; don't run a winrate sweep without asking.

---

## ⚠️ THE TWO RUNTIME BUGS FIXED THIS SESSION (both StrictMode/timing — read before touching the outro)

Both slipped past the static gate; the user caught them playing on device. Lesson: **this outro/chest flow can't be exercised in the in-app Browser pane** (see verification note).

1. **"Stuck at the chest, no arrows."** `FloorLootReveal`'s auto-dismiss `useEffect(setTimeout(onDismiss, 2800), [onDismiss])` had `onDismiss` (a fresh closure each render) in its deps. `BattleScreen` re-renders ~6×/s (throttled UI sync fires even post-victory), so the timer was cleared+restarted every frame and **never fired** → never advanced chest→camp→arrows. **Fix:** mount-only timer reading `onDismissRef.current` (`[]` deps) + a "tap to continue" hint (`.floor-loot-hint`).

2. **"Treasure room, no chests spawn."** StrictMode (`main.tsx` wraps `<App/>`) double-invokes mount effects. The treasure cinematic was kicked off from a BattleScreen `[]` mount effect (`startOutroChests` → sets `outroRef`, guarded once by `treasureStartedRef`), but `useBattleEngine`'s init effect re-runs on StrictMode's 2nd pass and resets `outroRef.current = null` **after** the guarded setup → `outroRef` orphaned, `chests()` null, no chests. **Fix:** create the treasure outro **inside `useBattleEngine`'s init effect** (inline `new OutroCinematic(...).gatherAtChests([...TREASURE_ROOM_TIERS])`), in lockstep with the controller, so a re-init recreates both together. BattleScreen's treasure effect now only grants + `setOutroStage("chest")`. (The single reward chest was fine — it's kicked off by a *click*, not a mount effect.)

**Treasure-room "instant-victory trap":** a monsterless floor modeled as a normal battle would fire `phase="victory"` on tick 1 (`CombatSystem.ts` `enemyOut`). So `MatchController` for `treasure_room` builds **no** WaveController, **auto-fills the warband**, sets `phase="battle"`, and `tick()` **returns early** (frozen). BattleScreen detects `encounter==="treasure_room"` from its PROP, grants `computeTreasureRewards` (3 independent chest seeds folded into ONE `grantBattleRewards`), and drives the 3-chest cinematic. Reveals + goToCamp use `outroChestPoints()`/`openOutroChestAt`; goToCamp fires 3.4s after the last chest opens.

---

## Files

**New:** `src/data/encounters.ts` · `src/assets/chestArt.ts` · `src/hooks/useCountUp.ts` · `src/components/FloorLootReveal.tsx` · `src/engine/__tests__/encounters.test.ts`

**Modified:** `src/hooks/OutroCinematic.ts` (chest gather/open, multi-chest `chestList`, `arcBefore`, `facePoint`) · `src/engine/Renderer.ts` (`RenderExtras.chests` array + `drawFloorChest*`) · `src/screens/BattleScreen.tsx` (outro stages, chest tap hit-test, omens, treasure-room flow, `hideChest`) · `src/hooks/useBattleEngine.ts` (chest callbacks, `encounter` param, treasure gather in init effect) · `src/engine/MatchController.ts` (`MatchOptions.encounter`, `isTreasureRoom` no-combat path) · `src/engine/WaveController.ts` (`encounter` ctor arg, ambush/cursed) · `src/meta/rewards.ts` (encounter tier bump, `computeTreasureRewards`) · `src/components/ExitChoiceOverlay.tsx` (omen glyphs) · `src/components/ChestSprite.tsx` + `src/components/RewardPanel.tsx` (re-import extracted helpers; `hideChest`) · `src/App.tsx` · `src/screens/AppShell.tsx` · `src/components/atlas/DungeonAtlas.tsx` (encounter threading) · `src/styles.css` (floor-loot, omen, treasure-banner CSS).

---

## Verification status — READ THIS

- ✅ **Static:** typecheck + build + 582 tests (incl. no-regression + per-encounter specs + treasure-room MatchController path + `assignOmens`).
- ✅ **Runtime, HTML-observable:** app boots clean; drove Dungeons → Atlas → The Depths → Floor 1 → **Enter → battle mounts → Leave → hub** with no crashes (validates the whole encounter-threading chain + engine wiring).
- ❌ **NOT verified (needs a device eyeball):** the on-canvas cinematics — chest gather/open/reveal, campfire, omen arrows, and the treasure-room 3-chest scene. **The in-app Browser pane can't do it:** screenshots time out on this canvas/rAF app (so coordinate clicks — needed to *tap a chest* — are blocked), and the canvas isn't in the a11y tree. This is the documented "verify on phone" pattern. **Both bugs above lived in exactly this blind spot.**

---

## What's left / next steps

1. **OFFERED, awaiting yes: a dev-panel "Force next encounter" control** (normal / cursed / rare_spawn / treasure_vault / **treasure_room**), dev-only (tree-shaken from prod). Lets the user jump straight into any encounter instead of fishing for a random omen — high value for finishing this shakedown. Wiring sketch: a dev override read in `App.onBattle` (or the omen path) that forces `encounter`. **Build this next if the user confirms.**
2. **Device QA the full flow:** win a floor → Continue Deeper → tap chest → loot → campfire → arrows; then each encounter (treasure room = 3 chests, cursed = harder+richer, vault = bumped chest, rare quarry = the quest rare telegraphed). Expect more small runtime bugs in the canvas cinematics — I'm blind to them.
3. **Ship** (per `WORKFLOW.md` / `ship` skill: verify → batch on ONE PR → **ask before merge**; user does the git/GitHub). This batch = atlas + on-floor chest + encounters together. `/ship` writes patch notes.
4. **Carry-overs from the atlas session** (still true): the 3 new map SFX + campfire sting are ear-unchecked (user should LISTEN before ship — taste: no square leads, no low drones); the "doors with teeth" per-door-modifier idea is deferred as its own slice.

**Minor polish (noted, not blocking):** the treasure room keeps the frozen combat top-bar (0 enemies / full clock — cosmetic); no dedicated treasure-room music (borrows the dungeon track).

## Memory
`memory/on-floor-chest-encounters-built.md` (this session, incl. both bug fixes) + `memory/dungeon-atlas-built.md` (prior session), indexed in `MEMORY.md`.
