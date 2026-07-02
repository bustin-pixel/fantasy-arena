# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

**Current state:** deterministic 4v4 auto-battler, 20 deckable units, a swipeable
3-page app shell (Collection / Home / Compendium) over a scrolling dungeon-crypt
background, click-to-inspect detail panel, in-battle tooltips, 2v2 + countdown start.
Solo ("Arena") battles only. Deployed to Netlify (auto-deploys on merge to `master`).

---

## Game modes

### PvE mode — "The Depths" (design locked 2026-07-01)
A floor-based descent through the dungeon — the Home screen's gate is literally the
entrance. Each floor is a **Swarm encounter** (rolling-window horde, below); every
**5th floor is a boss floor**. Deeper = bigger **wave budget**, reusing the AIDeck
cost model (rare 1 / epic 2 / legendary 4 in `rarities.ts`; give monsters costs too —
`generateEnemyDeck`'s `budget` param is the difficulty-dial precedent). Floor themes
roll out the approved bestiary in tiers:
- **1–5** fodder: Giant Rats, Zombie Shamblers, Skeletons → boss **Bloater**
- **6–10** undead: Skeleton Archers, Ghouls, Bonecaller → boss **Abomination**
- **11–15** deep crypt: Spiders, Imps, Banshee, Plague Shaman → boss **Gargoyle**
- **16–20** the throne: elite mixes, Spore Pods, Bat Swarms → boss **Lich**
Extras: **3-star floors** (clear without losing a unit → bonus gold) for cheap replay
depth; **boss first-kills unlock their Compendium page**; **Endless mode** comes after
the campaign works (personal-best waves shown on Home). First-clear rewards ≫ replay
rewards so farming is possible but descent is always optimal. Home's "Swarm · PvE"
card becomes "The Depths" with a floor picker.

### Progression & economy (design locked 2026-07-01)
The loop: battle (any mode) → **chest + gold** → unlock units / equip items → stronger
warband → deeper floors & better Arena. All meta-layer — the sim never learns about
rewards; chest contents roll from a **seed stored at drop time** (deterministic,
server-verifiable later).
- **Gold** (straw-man numbers): PvE first clear `50 + 10×floor` **+ chest** (boss
  floors drop a better tier); floor replays ~15, no chest; **PvP win 40 + chest**;
  PvP loss 10 (never zero).
- **Chests:** **instant-open** at the results screen (a quick reveal ceremony — no
  timers, no queue). Tiers wooden/silver/gold: gold + 1–2 items + a small chance of a
  unit unlock; **duplicate unit drops convert to gold**.
- **Unit unlocks:** new players start with the **starter deck 4** (Ogre, Archer,
  Knight, Fire Mage); key units unlock **free at floor milestones** (designer-controlled
  curve); the rest are **gold purchases** (straw-man: rare 400 / epic 1200 / legendary
  4000). **Existing saves are grandfathered** — a save from an older version keeps every
  unit (migration: version < N ⇒ all current units unlocked). `sanitizeDeck` must also
  enforce deck ⊆ unlocked.
- **Items (v1 small):** 3 slots — weapon (+dmg) / armor (+HP) / trinket (special) —
  × 3 tiers, from chests only; modifiers applied at `createUnit` per the items design
  below; surfaced in the (data-driven) detail panel + a loadout UI.
- **Save growth:** `gold`, `unlockedUnits`, `items` inventory, per-unit `loadouts`,
  `depths` progress (highest floor, stars) — versioned-merge pattern in
  `persistence.ts`, same as the Compendium save-v2 plan.
- **Arena tie-in:** once trophies/ranks exist, Arena's enemy-deck budget scales with
  player progress via the existing `budget` param.

#### Swarm mode — the rolling-window horde (design locked)
Enemies creep in from the **top edge** and march down; as they die, more trickle in
from an off-screen queue. Key realization: this is the **existing deployment loop**
with the numbers turned up — the sim already refills freed field slots as units die
([MatchController.ts:462](src/engine/MatchController.ts)) and the win-condition already
treats a momentarily-empty field as *not* a win while reserves remain
(`enemyOut = enemies.length === 0 && enemyReserves <= 0`,
[CombatSystem.ts:1479](src/engine/CombatSystem.ts:1479)). So the *simultaneous* unit
count (the perf lever) stays bounded no matter how big the total wave is.

Three caps to make **mode-aware** (only the first touches the frame budget):
1. **Concurrent on-field, per side** — `MAX_ACTIVE_UNITS_PER_SIDE` (today a shared `2`).
   **Locked target: enemy 8, player 4** (player deploys the whole warband at once in
   PvE). Start at the proven ~8-unit/60fps-mobile ceiling; profile and push enemy to
   **10–12** only if mobile holds.
2. **Summon safety-net** — the hard `cap = 5/7` in the CombatSystem spawn flush
   ([CombatSystem.ts:1039](src/engine/CombatSystem.ts:1039)); raise it for the enemy in
   PvE or it clamps the horde below the concurrent cap. (Also: change overflow from
   *drop* to *hold* so no queued monster is lost.)
3. **Reserve pool** — `enemyReserves` becomes the **wave queue** (30+/endless) instead
   of a 4-card deck.

New piece: a seeded **`WaveController`** (meta layer) that trickles spawns into
`pendingSpawns` at the top edge (nudge spawn `y` slightly off-screen so they visibly
creep in). Free wins already in the engine: `MAX_MELEE_SURROUND = 3` stops the horde
dogpiling one hero (extras queue → looks like swarming *and* bounds collision cost).

#### PvE monster bestiary — APPROVED (build ALL of these for Swarm mode)
User greenlit the full list below (2026-07-01). Non-deckable — add ids to
`NON_DECK_UNITS`. Reuse shipped systems so each stays deterministic; several can
recolor existing sprites (skeleton/wolf/slime). Fodder stat band ≈ Skeleton
`45hp/8dmg` … Boar `140hp`.
- **Fodder:** Zombie Shambler (slow-on-bite), Giant Rat (tiny/fast/swarm), Skeleton (exists).
- **Runners:** Ghoul (haste on ally death), Bat Swarm.
- **Ranged:** Skeleton Archer (plain arrows), Spider (poison glob), Imp (burn bolts).
- **Exploders/splitters:** Bloater (poison cloud on death — slime death-burst + poison),
  Ooze (splits, exists), Spore Pod (spawns sporelings on death).
- **Support (priority kills):** Bonecaller (raises skeletons — Necro's Raise Dead),
  Banshee (fear-wail + stealth), Plague Shaman (heal + haste the horde).
- **Elites/bosses:** Abomination (huge HP, slam, one revive — Ogre slam + Second Wind),
  Gargoyle (heavy damage reduction), Lich (curse DoT + raise dead).
Good home for the dormant statuses PvE should wake: `fear`, `haste`, `poison`, `stealth`.

### PvP mode (scaffolded)
Real-time 1v1. `BattleMode "pvp"` already exists (hides fast-forward, locks the sim to
1×). Remaining work is the server-authoritative model in README "Path to multiplayer":
run `MatchController` + `CombatSystem` on Node, send deploy inputs to the server,
broadcast snapshots, keep `Renderer` client-side. The engine is already React/DOM-free
for exactly this.

---

## Systems

### Compendium — slice 2 (the shell + dungeon background SHIPPED in #35)
Built & merged (#35): the swipeable pager (`AppShell.tsx`; Collection ← Home →
Compendium, Home landing), desktop click-drag to swipe, vector mode icons
(`ModeIcons.tsx`), and the scrolling dungeon-crypt **hall** — one seamless brick
surface + `DungeonGate` with flickering torches, panned 1:1 with the pager so swiping
feels like walking down a corridor. Home has Arena (playable vs AI) + Swarm·PvE
("Coming soon"). The **Compendium page is still a placeholder** — slice 2 fills it in:
- **Save v2:** add `bestiary: Record<defId, { encountered: boolean; defeated: boolean }>`
  (+ optional `lastPage`). Bump `version` to 2; `loadSave` already merges defaults.
- **Recording (sim stays pure):** on battle exit the Shell reads the final snapshot's
  enemy units → new `recordEncounter(defIds)` / `recordDefeated(defIds)` on
  `GameStateContext`. Present → encountered; died → defeated. The engine never learns
  about the bestiary.
- **The page:** all units, **3-tier reveal** — Undiscovered (dark silhouette + `???`) →
  Encountered (name + silhouette) → Defeated (full info via `UnitDetail`). Silhouette =
  `drawUnitSprite` tinted dark. Real content now via AI hero opponents; monsters slot in
  when PvE ships.
- Still open: a **dedicated desktop battle/layout** — the shell is phone-first (gate
  tuned so torches flank on narrow screens; the battle canvas is capped at 480px, safe
  to scale up on desktop since the 480×720 sim is display-independent).

### Items / equipment for units (planned)
Gear that modifies a unit's stats or kit (weapon → +damage, armor → +HP / damage
reduction, trinket → a small effect or extra trait). Design notes:
- Layer item modifiers onto `UnitDef` stats at unit creation (like a buff applied in
  `entities/createUnit.ts`) so the engine stays data-driven.
- **Must stay deterministic** — no random drops mid-battle; any rolls happen in the meta
  layer with a stored seed, never inside the sim.
- Surface equipped items in the hub detail panel (already data-driven) and a new loadout
  UI. Ties into PvE rewards and the rarity model.

### Anticipated meta systems (out of scope today, per README)
Shop, chests, currencies, trophies / ranks, accounts / auth, progression / upgrades,
replay-playback UI. The architecture leaves room for each; persistence swaps behind
`state/persistence.ts`.

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
- **Items + determinism:** decide where rolls happen (meta layer, seeded) so battles stay
  replayable.
- **PvE structure:** campaign vs. endless ladder vs. roguelike run — pick one to prototype.
- **Balance:** the Druid is intentionally dominant; revisit if it blocks PvP fairness.

---

## Keeping this fresh
Forward-looking only. When something ships, delete it here (git history records it).
Update this file + relevant memories before a context reset so the next session picks up
cleanly.
