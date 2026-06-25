# Fantasy Arena — Auto-Battler (Combat Slice)

A deterministic 4v4 high-fantasy auto-battler. Deploy units, watch them fight
automatically, win or lose. Built with **React + TypeScript + HTML5 Canvas**
and a framework-free simulation core designed to lift onto a server later.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. Pick at least 2 units, press **Battle**, tap your
(bottom) half of the field to deploy, and watch the fight.

## What's in this slice

This build focuses entirely on **combat**, per scope. Included:

- Deployment phase (max 2 of your units active; deploy more as slots free up)
- Deterministic AI opponent (deck generated from the match seed)
- All 6 units with full stats from data files
- All 6 abilities (Crushing Slam, Lifesteal, Kiting Leap, Shield Block,
  Fireball + Burn, Frost Blast + Slow)
- Status-effect framework (Burn / Slow / Stun / Shield live; Haste / Poison /
  Silence wired for expansion)
- Targeting priority, collision, melee surround cap (max 3)
- Procedural canvas sprites with idle / move / attack / cast / hit / death
  animation, damage & heal numbers, effect icons, projectiles, VFX
- Win / loss / timeout (most survivors → most HP → draw)
- Local persistence (selected deck + W/L record)

**Deliberately out of scope** (architecture leaves room for each): shop, chests,
currencies, trophies, ranks, authentication, progression/upgrades, replay
playback UI.

## Architecture

The simulation is **fully deterministic** and lives outside React. Same seed +
same deployments ⇒ identical battle, every time (verified: a given seed
reproduces the exact winner, tick count, and surviving HP across repeated runs).
This is the foundation for replays and a future server-authoritative model.

```
src/
├─ engine/              ← pure simulation, no React, no Math.random
│  ├─ CombatSystem.ts       orchestrator + state machine + HP funnel
│  ├─ MovementSystem.ts     movement, collision, melee queueing
│  ├─ AbilitySystem.ts      all six abilities + projectile impacts
│  ├─ TargetingSystem.ts    target priority (attacker → low HP → nearest)
│  ├─ StatusEffectSystem.ts reusable timed-effect framework
│  ├─ AnimationSystem.ts    presentation-only timers (no logic impact)
│  ├─ Renderer.ts           reads snapshot → paints canvas (no mutation)
│  ├─ MatchController.ts     deploy / AI / tick + replay record
│  └─ AIDeck.ts             seeded enemy deck generation
├─ data/                ← units, abilities, rarities (no hardcoded stats)
├─ entities/            ← unit factory
├─ types/              ← shared, framework-agnostic types
├─ utils/              ← seeded RNG, constants, math
├─ state/              ← localStorage persistence + GameState context
├─ hooks/              ← useBattleEngine: fixed-tick sim + rAF render bridge
├─ components/         ← CardPortrait, BattleHud
├─ screens/            ← HubScreen (deck), BattleScreen (canvas)
└─ assets/             ← procedural sprite drawing
```

### Determinism rules

- The engine **never** calls `Math.random()`. All randomness flows through the
  seeded `RNG` (Mulberry32) in `utils/rng.ts`.
- Combat runs at a **fixed 20 ticks/sec** via an accumulator in
  `useBattleEngine`, fully decoupled from `requestAnimationFrame` rendering.
- Tie-breaks (targeting, collisions) resolve by `uid` ordering, never randomly.
- All HP changes funnel through one place (`dealDamage` / `heal` in
  `CombatSystem`) so shields, lifesteal, flashes, and death stay consistent.

### Path to multiplayer

The `engine/` folder imports nothing from React or the DOM (except the optional
`Renderer`, which is read-only). To go server-authoritative:

1. Run `MatchController` + `CombatSystem` on Node.js (e.g. Colyseus room).
2. Send client inputs (deploy commands) to the server; the server ticks the sim.
3. Broadcast snapshots; the client keeps `Renderer` and discards its local sim.
4. Persist progression server-side (swap `state/persistence.ts`'s backend).

Never trust client values for stats/rewards — the deterministic core means the
server can validate any client-claimed outcome by re-simulating from the seed.
```
