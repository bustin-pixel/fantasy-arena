# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

**Current state:** deterministic 4v4 auto-battler, 24 deckable units (engine fully
kit-based — see `docs/adr/0001-unitkit-seam.md`), a swipeable 3-page app shell
(Collection / Home / Compendium) over a scrolling dungeon-crypt background,
click-to-inspect detail panel, in-battle tooltips, 2v2 + countdown start.
Arena (vs AI deck) + The Depths slice 1 (PvE floors 1–5 behind a floor picker —
seeded WaveController horde, fodder tier, Bloater boss on 5) + a live Compendium
(3-tier bestiary reveal) + **Economy slice 1** (save v3: gold + chests with unit
drops, locked Collection with gold purchases, floor-milestone unlocks; pure seeded
rewards module in `src/meta/`). Deployed to Netlify (auto-deploys on merge to
`master`).

---

## Game modes

### PvE mode — "The Depths" (design locked 2026-07-01; slice 1 BUILT)
A floor-based descent through the dungeon — the Home screen's gate is literally the
entrance. Each floor is a Swarm encounter; every **5th floor is a boss floor**.

**Slice 1 shipped** (see the PR / git log): seeded `WaveController` + `"depths"`
`MatchMode` (per-side `activeCaps`: player 4 / enemy 8), `data/depths.ts` tier +
budget tables, the fodder tier (Giant Rat, Zombie Shambler, + existing Skeleton;
boss **Bloater** with Putrid Burst). The floor picker + persisted progress
(`depths.highestClearedFloor`, save v3) shipped with Economy slice 1.

**Still to build:**
- **Remaining bestiary tiers** (each needs its monsters built first):
  - **6–10** undead: Skeleton Archers, Ghouls, Bonecaller → boss **Abomination**
  - **11–15** deep crypt: Spiders, Imps, Banshee, Plague Shaman → boss **Gargoyle**
  - **16–20** the throne: elite mixes, Spore Pods, Bat Swarms → boss **Lich**
- **Difficulty pass** once floors 2+ are reachable: floor 1 clears in ~15s for a
  full warband (fine for the opener, but tune `waveBudget` / spawn interval /
  monster costs in `data/depths.ts` as the curve extends). Profile before pushing
  the enemy cap to 10–12 (`DEPTHS_ENEMY_ACTIVE`).
- Extras: **3-star floors** (clear without losing a unit → bonus gold, slice 3);
  **boss first-kills unlock their Compendium page**; **Endless mode** after the
  campaign works (personal-best waves on Home).

### Progression & economy — SLICE 1 SHIPPED; remaining slices below
The loop is live: battle → **gold + chest** → unlock units → stronger warband →
deeper floors. All meta-layer — the sim never learns about rewards; chest contents
roll from a **drop-time seed stored on the result** (deterministic,
server-verifiable). Every tunable number lives in `src/meta/economy.ts`; the pure
reward matrix + chest roller are `src/meta/rewards.ts` (headless specs alongside).
Shipped in slice 1: save v3 (`gold`, `unlockedUnits`, `depths` progress, v2 saves
grandfathered with everything unlocked), the floor picker, instant-open chests
(wooden/silver; gold-tier data exists but drops start with deeper bosses), locked
Collection + gold purchases, milestone unlocks (floors 2–5 → Warrior/Mage/Cleric/
Berserker), duplicate drops → gold.

**Remaining economy/PvE slices, in order:**
1. ~~Core loop~~ — SHIPPED (this slice).
2. **Depths content:** bestiary tiers 6–10 (undead → Abomination), 11–15 (deep
   crypt → Gargoyle), 16–20 (the throne → Lich) per the approved monster list
   below; difficulty pass as the curve extends; gold-tier chests on deep bosses.
   Content work — interleaves with slices 3+.
3. **Bestiary rewards + Soul Shard earn-side:** one-time gold on first
   encounter/defeat (hook into the `recordBestiary` tier-upgrade write —
   inherently unfarmable); boss first-kills + section completions grant **Soul
   Shards** (save v4: `soulShards`, `bossFirstKills`); 3-star floors. Soul
   Shards are scarce by design — never from replays/farming.
4. **Items v1:** 3 slots (weapon +dmg / armor +HP / trinket special) × 3 tiers,
   chest-only drops (a `kind: "item"` entry joins the chest-content union — no
   migration needed); modifiers applied at `createUnit`; loadout UI + detail
   panel surfacing. Save v5: `items`, `loadouts`.
5. **Soul Shop — sells distinction, never battle power** (no stat boosts, no
   revives, no timers): unit skins (palette swaps — mostly cheap via
   `color`/`accent`, but the sprite glow-up added hardcoded literals — knight
   `KnightLivery` heraldry, per-mage element tints, bone/flame/steel material
   colours — that a skin for those units must also recolour); titles/flair
   ("Lichslayer", pairs with boss first-kills); legendary unlock alt-path;
   premium chest + reroll token.
6. **Later:** Endless mode, per-monster kill crests, trophies/ranks → Arena
   enemy-deck budget scaling via the existing `budget` param, PvP rewards
   (server-side — PvP pays nothing today by design).

#### PvE monster bestiary — APPROVED (fodder tier BUILT; build the rest)
User greenlit the full list (2026-07-01). Non-deckable — add ids to
`NON_DECK_UNITS`. Reuse shipped systems so each stays deterministic; several can
recolor existing sprites (skeleton/wolf/slime — the fodder tier did exactly this).
Fodder stat band ≈ Skeleton `45hp/8dmg` … Boar `140hp`. ~~Struck~~ = shipped:
- **Fodder:** ~~Zombie Shambler~~, ~~Giant Rat~~, ~~Skeleton~~ (all in).
- **Runners:** Ghoul (haste on ally death), Bat Swarm.
- **Ranged:** Skeleton Archer (plain arrows), Spider (poison glob), Imp (burn bolts).
- **Exploders/splitters:** ~~Bloater~~ (in — tier-1 boss), Ooze (splits, exists),
  Spore Pod (spawns sporelings on death).
- **Support (priority kills):** Bonecaller (raises skeletons — Necro's Raise Dead;
  the summon-flush cap already scales with the Depths caps, so it won't be starved),
  Banshee (fear-wail + stealth), Plague Shaman (heal + haste the horde).
- **Elites/bosses:** Abomination (huge HP, slam, one revive — Ogre slam + Second Wind),
  Gargoyle (heavy damage reduction), Lich (curse DoT + raise dead).
Good home for the dormant statuses PvE should wake: `fear`, `haste`, `stealth`
(`poison` woke up with the Bloater/fodder slice).

### PvP mode (scaffolded)
Real-time 1v1. `BattleMode "pvp"` already exists (hides fast-forward, locks the sim to
1×). Remaining work is the server-authoritative model in README "Path to multiplayer":
run `MatchController` + `CombatSystem` on Node, send deploy inputs to the server,
broadcast snapshots, keep `Renderer` client-side. The engine is already React/DOM-free
for exactly this.

---

## Systems

### Compendium — slice 2 BUILT (with the Depths batch; shell shipped in #35)
The bestiary page is real now: save v2 (`bestiary` map, versioned merge in
`persistence.ts`), meta-layer recording on battle end (`enemyLedger` in
`useBattleEngine` → `recordBestiary` on `GameStateContext`; the sim never learns),
and the 3-tier reveal (Undiscovered `???` silhouette → Encountered/Sighted named
silhouette → Defeated full lore via read-only `UnitDetail`). Two sections:
Monsters of the Depths (roster derives from `data/depths.ts` tiers, so it grows
automatically) and Heroes of the Arena (all deckables).
- Still open: **per-monster kill counters** (v2 idea, parked with the bestiary
  rewards), and Compendium `lastPage` persistence if it ever gets sub-pages.
- Still open: a **dedicated desktop battle/layout** — the shell is phone-first (gate
  tuned so torches flank on narrow screens; the battle canvas is capped at 480px, safe
  to scale up on desktop since the 480×720 sim is display-independent).

### Engine architecture — UnitKit seam ✅ SHIPPED (PR #41 merged 2026-07-03)
All per-unit behavior lives in one stateless kit per `defId` under
`src/engine/kits/` (registry `kits/UnitKit.ts`); zero `defId` branches remain in
the engine. Adding a unit is one kit file + data. Full design + hook contracts in
**`docs/adr/0001-unitkit-seam.md`**; history in the PR. Nothing left to build here —
future balance passes just use the seam (e.g. the shipped `isIncapacitated` upkeep
suppression).

### Items / equipment for units (planned — economy slice 4)
Gear that modifies a unit's stats or kit (weapon → +damage, armor → +HP / damage
reduction, trinket → a small effect or extra trait). Design notes:
- Layer item modifiers onto `UnitDef` stats at unit creation (like a buff applied in
  `entities/createUnit.ts`) so the engine stays data-driven.
- **Must stay deterministic** — no random drops mid-battle; rolls happen in the meta
  layer with a stored seed (the shipped chest roller in `src/meta/rewards.ts` is the
  pattern: item drops become a new `ChestContent` kind).
- Surface equipped items in the hub detail panel (already data-driven) and a new loadout
  UI. Ties into PvE rewards and the rarity model.

### Anticipated meta systems (still out of scope)
Trophies / ranks, accounts / auth, replay-playback UI. (Gold, chests, and unit
unlocks shipped with Economy slice 1; the Soul Shop is slice 5.) The architecture
leaves room for each; persistence swaps behind `state/persistence.ts`.

---

## Content

### New unit ideas (brainstormed, not built)
Lean on the dormant `haste` / `poison` / `silence` status effects and add counterplay the
roster lacks. Follow the rarity rule (rare = 1 mechanic, epic = 2, legendary = capstone)
and the "adding a unit" checklist in `NOTES.md`.
- **Spearman** (rare) — Skewer: a thrust that pierces to the enemy behind.
- **Arbalest** (rare) — armor-piercing bolts; counters high-reduction units (Druid bear).
- **Witch Hunter** (rare) — Disrupt: every 3rd basic attack briefly Silences the
  target. Accessible anti-caster that wakes the dormant `silence` status; keep the
  silence short / single-target so it stays under the planned epic Spellbreaker.
- **Stalker** (rare) — First Strike: deploys Stealthed; its opening attack deals
  bonus damage, then it's revealed. A rare backline threat that wakes the `stealth`
  status — lighter than the epic Assassin's Vanish.
- **Marksman** (rare) — Execute: bonus damage to enemies below ~35% HP. A focus-fire
  ranged finisher; reuses the target-HP read already in the damage calc.
- **Plague Doctor** (epic) — stacking, spreading poison; shreds swarms.
- **Warlord** (epic) — War Horn grants allies haste; the first offensive support.
- **Spellbreaker** (epic) — silences casters; anti-mage.
- **Phoenix** (legendary) — immolation aura + a once-per-match rebirth.

### Beginner tutorial / onboarding (planned)
Resurface first-run guidance (e.g. the in-battle "tap to deploy" hint we removed) only
for new players.

---

## Open questions / design notes
- **Balance:** the Druid is intentionally dominant; revisit if it blocks PvP fairness.
- **Arena farming:** Arena pays 40g + a wooden chest on every win (accepted for
  slice 1 — all numbers in `src/meta/economy.ts` if it needs tuning).
- **Economy numbers are straw-men** — first-pass values; tune once floors 6+ give
  the gold curve room to breathe.

---

## Keeping this fresh
Forward-looking only. When something ships, delete it here (git history records it).
Update this file + relevant memories before a context reset so the next session picks up
cleanly.
