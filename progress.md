# Progress & Roadmap

Forward-looking only — what's planned, deferred, and open. For what's already
**done** and why, read the git history (`git log --oneline`, `gh pr list`) — that's
the source of truth, so this file deliberately doesn't duplicate it.

**Current state:** deterministic 4v4 auto-battler, 15 deckable units, hub deck-builder
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

### PvP mode (scaffolded)
Real-time 1v1. `BattleMode "pvp"` already exists (hides fast-forward, locks the sim to
1×). Remaining work is the server-authoritative model in README "Path to multiplayer":
run `MatchController` + `CombatSystem` on Node, send deploy inputs to the server,
broadcast snapshots, keep `Renderer` client-side. The engine is already React/DOM-free
for exactly this.

---

## Systems

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
