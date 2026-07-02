# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fantasy Arena — a deterministic 4v4 high-fantasy auto-battler (React + TypeScript + HTML5 Canvas). You build a deck of up to 4 units (one Legendary max), deploy two at a time, and watch a fully simulated fight resolve. The simulation core is framework-free and built to lift onto a server later.

## Where we're going

See **`progress.md`** for the roadmap — planned features (PvE mode, PvP, an items/equipment system), brainstormed unit ideas, and open design questions. It's forward-looking; `git log --oneline` / `gh pr list` is the source of truth for what's already shipped. Update `progress.md` (and memories) before a context reset so the next session picks up cleanly.

## Commands

```bash
npm run dev         # Vite dev server (http://localhost:5173)
npm run build       # production build -> dist/  (Vite ONLY — does NOT type-check)
npm run typecheck   # tsc --noEmit, strict mode — run this separately
npm test            # Vitest (engine specs, headless) — run after any engine change
npm run test:watch  # Vitest in watch mode
npm run preview     # serve the built dist/
```

- **`build` does not type-check.** This is deliberate (a stray React-types issue shouldn't block a deploy). Always run `npm run typecheck` AND `npm run build` before considering a change done.
- Path alias: `@/*` → `src/*` (see `tsconfig.json` `paths`).
- Deploy: static `dist/` to Netlify (see `DEPLOY.md` / `netlify.toml`). The repo is GitHub-connected, so merging to `master` auto-deploys.
- **How we build & ship (verify → batch on one PR → ask before merging; merges are infrequent because each one is a Netlify deploy/credits):** see `WORKFLOW.md`.

## Testing (Vitest)

The engine is pure and deterministic, so it's tested **headlessly** with Vitest (node environment — no DOM/React). Run `npm test`. Specs live in `src/engine/__tests__/`:

- **`invariants.test.ts`** — the contract every combat change must uphold: **determinism** (same seed + inputs → byte-identical end state across two runs, via the `digest()` fingerprint) and **no crashes** (every unit in `DECKABLE_UNIT_IDS` completes a match).
- **`arcaneMage.test.ts`** — a per-unit behavior spec; a good template for testing a new unit's mechanics in isolation.
- **`helpers.ts`** — shared drivers: `runMatch` (full auto-played match), `digest`, and `battleState`/`place`/`makeDummy` for hand-built scenarios. `makeDummy` gotcha: pick a `defId` whose ability grants **no shield** (the Knight's Taunting Roar soaks hits and will mask incoming damage).

Vitest auto-resolves the `@/` alias from `vite.config.ts`. After any engine change, run `npm test`, and add/extend a spec for the specific behavior you touched. Tests live under `src/` so `tsc --noEmit` type-checks them; they're excluded from the production build (nothing imports them).

## Architecture — the big picture

The defining decision: **the simulation is a pure, deterministic, React-free engine. React never holds simulation state.** Understanding the boundary requires reading three things together: `engine/CombatSystem.ts`, `engine/MatchController.ts`, and `hooks/useBattleEngine.ts`.

- **`src/engine/`** — the simulation. Zero React, zero DOM (except `Renderer.ts`, which only reads), never calls `Math.random()`.
  - **`CombatSystem.ts`** — orchestrator. `stepSimulation(state)` advances one tick (status effects → targeting → per-unit state machine → attacks/abilities → movement → projectiles → win/loss). It owns the **single HP funnel**: `dealDamage` / `heal` are the *only* places HP changes, so shields, lifesteal, damage school, death/Vanish/Second Wind, and floating numbers stay consistent. `performBasicAttack` lives here too. Many per-unit special mechanics are gated by `defId` string literals in this file.
  - **`MatchController.ts`** — owns one `SimState` and exposes the API the UI (or a future server) calls: `deploy`, `tick`, `runAI`, `snapshot`, `pick/inspect` helpers. **Deployment-phase and meta logic live here, not in CombatSystem**: the placement timer, the 2v2 start countdown, deterministic enemy deck generation + tactical positioning, and player auto-fill. Its `state` field is public for read-only access.
  - Other systems: `MovementSystem` (movement, collision with slop, melee surround cap, ranged kiting), `TargetingSystem` (priority: taunt → in-range attacker → lowest-HP in range → out-of-range attacker → nearest; commits to a target so units don't flip-flop), `StatusEffectSystem` (timed effects framework: burn/slow/stun/shield/haste/poison/silence/stealth/death_immune/taunt/fear), `AbilitySystem` (each ability's implementation + `PASSIVE_ABILITIES`), `AnimationSystem` (presentation-only timers), `Renderer` (snapshot → canvas, never mutates), `AIDeck`.
- **`src/hooks/useBattleEngine.ts`** — the React↔engine bridge. The `MatchController` and the render loop live in **refs**, not state. Two independent loops run: a fixed-timestep accumulator advancing the sim at `TICK_RATE` (20/s), and a `requestAnimationFrame` loop painting the latest snapshot. The only React state it exposes is a **throttled `ui` snapshot (~6/s)** plus callbacks (`deployAt`, `pickUnitAt`, `inspectUnit`, …). The canvas hot path triggers **zero re-renders**.
- **`src/data/`** — `units.ts`, `abilities.ts`, `rarities.ts`. All stats/tuning are data-driven; the engine reads these. The only thing hardcoded in the engine is per-unit *behavior* (gated by `defId`).
- **`src/state/`** — `persistence.ts` (localStorage, key `fantasy-arena/save/v1`) + `GameStateContext.tsx`, the **only** long-lived React state (deck, W/L).
- **`src/screens/`** + **`src/components/`** — `HubScreen` (deck building, detail panel), `BattleScreen` (canvas + tap routing). `entities/createUnit.ts` is the unit factory; `utils/rng.ts` holds the seeded Mulberry32 RNG.

## Determinism rules (do not break these)

- The engine **never** calls `Math.random()`. All randomness flows through the seeded `RNG` in `utils/rng.ts`. (`generateSeed()` uses `Math.random` only to pick a match seed — outside the simulation.)
- Combat runs at a fixed 20 ticks/s via the accumulator in `useBattleEngine`, decoupled from rendering.
- Tie-breaks (targeting, collisions) resolve by `uid` ordering, never randomly.
- All HP changes go through `dealDamage` / `heal`; all target changes go through `TargetingSystem`. Same seed + same deployments ⇒ identical battle (this is what makes replays and future server-authority possible).

## Conventions when editing

- **Designing a unit (from a loose idea):** follow `UNIT_DESIGN.md` — the brainstorm→spec playbook (identity & niche → kit grounded in existing systems → mechanic-interaction answers → real decisions → concrete numbers → confirm before building). Then build it via the checklist below.
- **Adding a unit:** follow the checklist in `NOTES.md`. The hub detail panel and in-battle tooltip are data-driven, so a new unit needs full stats in `data/units.ts`, an `ABILITIES` entry in `data/abilities.ts` (a missing one crashes the panel), and a `traits: [{name, description}]` array for any passive/hidden behavior. Passive abilities must also be added to `PASSIVE_ABILITIES` in `AbilitySystem.ts` or the unit wastes ticks trying to cast nothing.
- **Rarity convention:** rare = 1 special mechanic, epic = 2+, legendary = top tier (one-per-deck, enforced in the hub).
- **Damage school:** `UnitDef.school` (`"magic"` for the casters) is read off the *source* in `dealDamage`; used by the Aegis Knight's magic soak. Reusable for future armor-type units.
- **id ≠ display name** for two units: `summoner` shows as "Druid", `healer` as "Cleric". Engine logic keys off the id literal — always reference units by `id`.
- `NOTES.md` is the living developer-notes / gotchas doc (hardcoded `defId` mechanics list, balance snapshot, maintenance hazards). Keep it honest after renames/balance changes.

## Path to multiplayer

`engine/` imports nothing from React or the DOM (except the read-only `Renderer`). To go server-authoritative: run `MatchController` + `CombatSystem` on Node, send deploy inputs to the server, broadcast snapshots, and keep `Renderer` client-side. Swap `state/persistence.ts`'s backend. Never trust client values — the deterministic core lets the server re-simulate from the seed to validate any outcome.
