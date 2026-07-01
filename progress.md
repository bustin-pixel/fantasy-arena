# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

**Current state:** deterministic 4v4 auto-battler, 18 deckable units, hub deck-builder
with a click-to-inspect detail panel, in-battle unit tooltips, and a 2v2 + countdown
start. Solo battles only. Deployed to Netlify (auto-deploys on merge to `master`).

---

## Game modes

### PvE mode (planned)
A single-player progression mode: fight a series of AI encounters (waves / a short
campaign / an endless ladder), earn rewards, and unlock units or items between fights.
- Reuses the existing solo battle loop + `engine/AIDeck.ts` for opponents; difficulty
  scales by giving the AI stronger/larger decks per stage.
- Needs a **meta/run layer outside the battle sim** (encounter list, rewards, run state)
  persisted via `state/persistence.ts`. Keep the battle sim itself unchanged and
  deterministic.
- Natural home for the items system below (items as fight rewards).

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

#### PvE monster bestiary (brainstormed, non-deckable — add ids to `NON_DECK_UNITS`)
Reuse shipped systems so each stays deterministic; several can recolor existing sprites
(skeleton/wolf/slime). Fodder stat band ≈ Skeleton `45hp/8dmg` … Boar `140hp`.
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

### App shell — swipeable pages + Compendium (design locked)
Turn the app into a mobile-style **pager of three pages** with battle as a full-screen
overlay. All UI/meta — **zero engine changes**; the sim stays pure.

- **Shell state:** replace [App.tsx](src/App.tsx)'s `screen: "hub" | "battle"` enum with
  two concepts: `page: "collection" | "home" | "compendium"` (pager position; persist as
  `lastPage`) and `view: "shell" | "battle"` + `battleMode: "pve" | "pvp"`.
  **Battle is an overlay, NOT a swipe page** (keeps the canvas isolated, stops the pager
  fighting the finger mid-fight).
- **Layout (Clash-Royale style):** `[Collection] ← [Home/Modes] → [Compendium]`, **Home is
  the landing/center.** Tab-dots indicator.
- **Swipe = CSS scroll-snap:** horizontal `overflow-x` track, `scroll-snap-type: x
  mandatory`; each page `width:100vw; scroll-snap-align:start`. Programmatic nav via
  `scrollIntoView`; active page from scroll position / IntersectionObserver. Native mobile
  momentum, near-zero JS.
- **Home page:** two mode cards — **PvE (Swarm)** (not built → "Coming Soon"/prototype) and
  **Arena/PvP** (scaffolded, not server-ready → local-AI now or "Coming Soon") — plus W/L +
  username (already in the save). Today's "BATTLE" maps to a mode.
- **Collection page:** today's `HubScreen` (deck builder), unchanged.
- **Compendium page:** **all units**, **3-tier reveal** — Undiscovered (dark silhouette +
  `???`) → Encountered (name + silhouette, seen in battle) → Defeated (full info, killed
  one). Reuse [UnitDetail.tsx](src/components/UnitDetail.tsx) for unlocked entries;
  silhouette = `drawUnitSprite` tinted dark. Has real content NOW via AI hero opponents;
  monsters slot in when PvE ships.
- **Persistence (save → v2):** add `bestiary: Record<defId, { encountered: boolean;
  defeated: boolean }>` (+ optional `lastPage`). Bump `version` to 2; `loadSave` already
  merges defaults (backward-safe) — sanitize drops unknown ids.
- **Recording (sim stays pure):** on **battle exit**, the Shell reads the final snapshot's
  enemy units and calls new `recordEncounter(defIds)` / `recordDefeated(defIds)` on
  `GameStateContext` (sibling to `recordResult`). Present → encountered; died → defeated.
  The engine never learns about the bestiary.

#### Dungeon-crypt page backgrounds (design locked, not built)
Give the pager a themed backdrop, all vector SVG (matches the drawn aesthetic —
no image assets), themeable + crisp + animatable.
- **Look:** cold damp crypt — grey-blue brick, heavy green moss, draping vines,
  dim **flickering torches** (flame wobble + glow pulse via CSS `@keyframes`,
  disabled under `prefers-reduced-motion`).
- **Vines:** drape from the top corners + over the arch only. No wall moss, no
  ground-climbing vines, no floor debris (skulls/weapons were tried and cut).
- **Home slice:** the arched gate with iron portcullis + pitch-black interior,
  flanked by the two torches; the Home UI composites on top — title + stat pill up
  high, the two mode cards centered over the gate mouth ("at the threshold"), tab
  bar at the bottom. Card backgrounds darkened (~90% opaque) for contrast against
  the dark gate. (Optional: swap the mode-card emoji for the vector crossed-swords
  / skull icons from the mockup.)
- **Collection / Compendium slices:** the same crypt wall + vines (shared base so
  it flows seamlessly across swipes), no gate/torches — plain enough not to fight
  the deck grid / bestiary content.
- **Build shape:** a shared `DungeonWall` SVG layer (brick + vines) behind every
  page + a `DungeonGate` SVG (arch + portcullis + torches) behind Home's content
  only.

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
