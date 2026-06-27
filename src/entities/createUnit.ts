import type { Team, Unit, Vec2 } from "@/types";
import { getUnitDef } from "@/data/units";
import { UNIT_RADIUS } from "@/utils/constants";

// Deterministic uid counter — reset at the start of each match so a given seed
// + deployment order always yields identical uids (important for replays).
let uidCounter = 0;

export function resetUidCounter(): void {
  uidCounter = 0;
}

export function createUnit(defId: string, team: Team, pos: Vec2): Unit {
  const def = getUnitDef(defId);
  const uid = `u${uidCounter++}`;
  return {
    uid,
    defId,
    team,
    state: "idle",
    pos: { x: pos.x, y: pos.y },
    facing: team === "player" ? -1 : 1, // player faces up, enemy faces down
    hp: def.hp,
    maxHp: def.hp,
    damage: def.damage,
    attackSpeed: def.attackSpeed,
    moveSpeed: def.moveSpeed,
    range: def.range,
    radius: UNIT_RADIUS,
    ability: def.ability,
    damageTakenMult: 1,
    transformed: false,
    vanishUsed: false,
    ambushReady: def.ability === "ambush",
    secondWindUsed: false,
    splitsSpawned: 0,
    mysticForm: "light",
    lightStacks: 0,
    darkStacks: 0,
    blinkCooldown: 0,
    attackCooldown: 0,
    abilityCooldown: 0, // abilities can fire as soon as their interval elapses
    actionTimer: 0,
    attackCount: 0,
    targetUid: null,
    attackedByUid: null,
    tauntedByUid: null,
    chargeTicks: 0,
    chargeTargetUid: null,
    shieldHp: 0,
    shieldHpMax: 0,
    effects: [],
    hitFlash: 0,
    animTime: 0,
    animState: "idle",
    deathFade: 0,
  };
}
