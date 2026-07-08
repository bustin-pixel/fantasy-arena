import type { Team, Unit, Vec2 } from "@/types";
import { getUnitDef } from "@/data/units";
import { levelStatMultipliers } from "@/meta/leveling";
import { UNIT_RADIUS } from "@/utils/constants";

// Deterministic uid counter — reset at the start of each match so a given seed
// + deployment order always yields identical uids (important for replays).
let uidCounter = 0;

export function resetUidCounter(): void {
  uidCounter = 0;
}

export function createUnit(
  defId: string,
  team: Team,
  pos: Vec2,
  level = 1
): Unit {
  const def = getUnitDef(defId);
  const uid = `u${uidCounter++}`;
  // Level bake — the ONLY place player-side level scaling touches stats.
  // Level 1 is the exact identity (round(x*1) === x). Enemy floor/wave
  // scaling is a separate post-bake in the wave controllers; never merge them.
  const mult = levelStatMultipliers(level);
  const hp = Math.round(def.hp * mult.hp);
  return {
    uid,
    defId,
    team,
    state: "idle",
    pos: { x: pos.x, y: pos.y },
    facing: team === "player" ? -1 : 1, // player faces up, enemy faces down
    hp,
    maxHp: hp,
    level,
    damage: Math.round(def.damage * mult.dmg),
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
    lastStandUsed: false,
    cheatDeathReady: false,
    splitsSpawned: 0,
    rebornStage: 0,
    homeAnchor: null,
    mysticForm: "light",
    momentumStacks: 0,
    lightStacks: 0,
    darkStacks: 0,
    blinkCooldown: 0,
    shadowCooldown: 0,
    recloakTimer: 0,
    curseCooldown: 0,
    rejuvCooldown: 0,
    bearGuardTimer: 0,
    boarCooldown: 0,
    trapCooldown: 0,
    barrageShots: 0,
    barrageTimer: 0,
    barrageTargetUid: null,
    castTicks: 0,
    castTicksMax: 0,
    castTargetUid: null,
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
