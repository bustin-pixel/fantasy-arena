// Shared helpers for the engine tests. The simulation is pure and deterministic,
// so it can be driven entirely headlessly under Vitest's node environment — no
// DOM, no React, no randomness outside the seeded RNG.
import {
  createSimState,
  stepSimulation,
  type SimState,
} from "@/engine/CombatSystem";
import {
  MatchController,
  type MatchOptions,
} from "@/engine/MatchController";
import {
  createUnit,
  resetUidCounter,
  type ItemCarry,
} from "@/entities/createUnit";
import { MATCH_TIME_SEC } from "@/utils/constants";
import type { Team, Unit } from "@/types";

/** Run a full match (both sides auto-played) to a terminal phase or a tick cap. */
export function runMatch(
  seed: number,
  player: string[],
  enemy: string[],
  opts?: MatchOptions
): MatchController {
  const mc = new MatchController(seed, player, enemy, opts);
  let guard = 0;
  while (
    mc.phase !== "victory" &&
    mc.phase !== "defeat" &&
    mc.phase !== "draw" &&
    guard < 3400
  ) {
    mc.tick();
    guard++;
  }
  return mc;
}

/** A stable, order-independent fingerprint of the whole sim state. Two runs from
 *  the same seed + inputs must produce byte-identical digests. */
export function digest(s: SimState): string {
  const parts = [`t${s.tick}`, `p${s.phase}`, `c${s.clockTicks}`];
  for (const u of [...s.units].sort((a, b) => (a.uid < b.uid ? -1 : 1))) {
    parts.push(
      `${u.uid}:${u.defId}:${u.state}:${u.hp.toFixed(2)}:` +
        `${u.pos.x.toFixed(3)},${u.pos.y.toFixed(3)}:b${u.blinkCooldown}`
    );
  }
  return parts.join("|");
}

/** A battle-phase SimState with a reset uid counter, ready for hand-placed units. */
export function battleState(seed: number): SimState {
  resetUidCounter();
  const s = createSimState(seed, MATCH_TIME_SEC);
  s.phase = "battle";
  return s;
}

/** Place a unit directly on the field (bypassing the deployment flow).
 *  `items` carries resolved equipment like MatchController.deploy does —
 *  it activates only when its owner matches `defId`. */
export function place(
  s: SimState,
  defId: string,
  team: Team,
  x: number,
  y: number,
  level = 1,
  items?: ItemCarry
): Unit {
  const u = createUnit(defId, team, { x, y }, level, items);
  s.units.push(u);
  return u;
}

/** Turn a placed unit into a stationary, harmless practice dummy: it never moves
 *  (so it won't trigger a ranged unit's kiting/Blink) and deals no damage (so any
 *  HP loss is self-inflicted). NOTE: pick a defId whose ability neither grants a
 *  shield (the Knight's Taunting Roar soaks hits and masks damage) nor deals
 *  damage on cast (the Ogre's Crushing Slam hits for a hardcoded 25 regardless of
 *  `damage`). The Skeleton / Wolf (passive filler) are universally safe dummies;
 *  the Ogre is fine only when it can't reach its target in melee. */
export function makeDummy(u: Unit): Unit {
  u.moveSpeed = 0;
  u.damage = 0;
  u.hp = u.maxHp = 100000;
  return u;
}
