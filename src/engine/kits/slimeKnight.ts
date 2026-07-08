// Slime Knight (defId "slime_knight") & Slime Blob (defId "slime_squire") — a
// legendary "undying" bruiser. While alive it plays like a knight: Gelatinous
// Guard sheathes it in an absorb shield off cooldown (fireAbility), its acid
// body ticks Caustic Aura damage on everything nearby (onTick), and enemy
// skeletons dying in that aura are slurped up for health — Absorb Bones
// (onUnitDeath, the anti-horde tech for The Bonefields). Its death is the real
// trick — Divide & Reconvene:
//   • On death it bursts (AoE) and FLINGS a shrinking squad of Slime Blobs outward
//     (4 at stage 0, one fewer each rebirth). The blobs ignore combat entirely and
//     ooze straight back toward the corpse — homeAnchor drives their movement
//     (MovementSystem) and the TargetingSystem suppresses their aggro.
//   • The first blob to reach the corpse is consumed and REINCARNATES the knight at
//     half HP, one rebirth-stage higher (so it flings fewer blobs next time). The
//     rest of the squad dissolves into it — no burst, they "merged".
//   • A blob KILLED en route bursts weakly instead. If every blob is intercepted
//     before one arrives, the knight stays dead — that's the whole counterplay.
// Determinism: fixed fling offsets (no RNG); spawns route through the same-tick
// damageSpawns queue; siblings are matched by their shared (value-identical) corpse
// anchor and the earliest-uid blob resolves first — byte-identical across replays.
import type { UnitKit, KitCtx } from "./UnitKit";
import type { Unit, Vec2 } from "@/types";
import { getUnitDef } from "@/data/units";
import { isIncapacitated } from "../StatusEffectSystem";
import {
  secToTicks,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  UNIT_RADIUS,
} from "@/utils/constants";
import { clamp, dist } from "@/utils/math";

const GUARD_SHIELD = 45; // Gelatinous Guard absorb granted per cast
// Caustic Aura + Absorb Bones — the anti-horde package (built as the skeleton
// counter for The Bonefields; see UnitDef.tags).
const AURA_RADIUS = 90; // matches the death-burst radius — one visual language
const AURA_DMG_FRAC = 0.3; // of its damage stat, dealt to each enemy per beat
const AURA_BONE_MELT_FRAC = 0.9; // skeletons lose this share of REMAINING hp per beat
const AURA_INTERVAL_TICKS = secToTicks(1); // one acid beat per second
const ABSORB_HEAL = 20; // HP slurped per enemy skeleton dying in the aura
const BASE_BLOBS = 3; // blobs flung at rebornStage 0 (decays by stage → 3/2/1)
const FLING_DIST = 110; // how far outward blobs spawn from the corpse
const KNIGHT_BURST = 30; // the knight's own death burst
const KNIGHT_BURST_RADIUS = 90;
const BLOB_BURST = 18; // a blob's burst when killed en route
const BLOB_BURST_RADIUS = 84;
const REFORM_RADIUS = 32; // must ooze to ~a body-width (one unit radius) of the corpse
const REBORN_HP_FRAC = 0.5; // reincarnate at half HP
// Base fling direction — a diagonal, so reflecting an opposite pair off a wall can't
// collapse the two onto each other. The squad is spread evenly around the circle from
// here, and any blob that would land off-field is reflected back to the open side (see
// onDeath), so it always spawns a full FLING_DIST from the grave — never clamped onto
// it against a wall, which used to reincarnate the knight instantly.
const BASE_FLING_ANGLE = -Math.PI / 3;

function anchorsEqual(a: Vec2 | null | undefined, b: Vec2): boolean {
  return !!a && a.x === b.x && a.y === b.y;
}

// AoE burst shared by the knight's death and a blob dying en route.
function burst(unit: Unit, ctx: KitCtx, damage: number, radius: number): void {
  for (const e of ctx.enemies) {
    if (e.state === "dead") continue;
    if (dist(unit.pos, e.pos) <= radius) ctx.dealDamage(e, damage, unit);
  }
  ctx.spawnVfx({
    kind: "slam",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.45),
    maxLife: secToTicks(0.45),
    color: getUnitDef(unit.defId).accent,
  });
}

export const slimeKnightKit: UnitKit = {
  roleClass: "melee",

  // Caustic Aura: once a second (tick-synced, like Raise Dead), its acid body
  // burns every enemy within reach for a fraction of its damage stat — so the
  // aura scales with unit level. Pre-gate slot, so it must self-gate: silent
  // while dead or incapacitated (stun/fear/polymorph), matching the other
  // periodic passives.
  onTick(unit, ctx) {
    if (unit.state === "dead" || isIncapacitated(unit)) return;
    if (ctx.tick % AURA_INTERVAL_TICKS !== 0) return;
    const acid = Math.max(1, Math.round(unit.damage * AURA_DMG_FRAC));
    for (const e of ctx.enemies) {
      if (e.state === "dead") continue;
      if (dist(unit.pos, e.pos) > AURA_RADIUS) continue;
      // Skeletons dissolve outright: each beat strips 90% of their REMAINING
      // hp (percentage-of-current, so leveled / floor-scaled bones melt just
      // as fast — two beats and they're gone), then Absorb Bones slurps them.
      const isBones = getUnitDef(e.defId).tags?.includes("skeleton");
      const dmg = isBones
        ? Math.max(1, Math.round(e.hp * AURA_BONE_MELT_FRAC))
        : acid;
      ctx.dealDamage(e, dmg, unit);
    }
  },

  // Absorb Bones: any ENEMY skeleton (UnitDef.tags) dying inside the aura —
  // whoever landed the kill — is slurped up and heals the knight. Fired from
  // the death-observer seam; heals through the funnel (clamps at maxHp).
  onUnitDeath(unit, victim, _killer, ctx) {
    if (isIncapacitated(unit)) return;
    if (victim.team === unit.team) return;
    if (!getUnitDef(victim.defId).tags?.includes("skeleton")) return;
    if (dist(unit.pos, victim.pos) > AURA_RADIUS) return;
    ctx.heal(unit, ABSORB_HEAL);
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: unit.pos.x, y: unit.pos.y - 4 },
      life: secToTicks(0.35),
      maxLife: secToTicks(0.35),
      color: getUnitDef(unit.defId).accent,
    });
  },

  // Gelatinous Guard: top the absorb shield up to GUARD_SHIELD each time the
  // cooldown is up. Instant (no cast time) → fires through the instant-cast seam
  // while it has a live target. Doesn't stack past the cap.
  fireAbility(ctx) {
    const { unit } = ctx;
    unit.shieldHp = Math.max(unit.shieldHp, GUARD_SHIELD);
    unit.shieldHpMax = Math.max(unit.shieldHpMax, unit.shieldHp);
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: unit.pos.x, y: unit.pos.y - 4 },
      life: secToTicks(0.5),
      maxLife: secToTicks(0.5),
      color: getUnitDef(unit.defId).accent,
    });
    return true;
  },

  // Divide & Reconvene: burst, then fling (BASE_BLOBS - rebornStage) blobs outward,
  // each stamped with the corpse anchor and the NEXT rebirth stage. At the final
  // stage there are no blobs left to fling — the knight is simply, finally dead.
  onDeath(unit, ctx) {
    burst(unit, ctx, KNIGHT_BURST, KNIGHT_BURST_RADIUS);

    const count = Math.max(0, BASE_BLOBS - unit.rebornStage);
    if (count === 0) return;
    const corpse: Vec2 = { x: unit.pos.x, y: unit.pos.y };
    const nextStage = unit.rebornStage + 1;
    for (let i = 0; i < count; i++) {
      // Spread the squad evenly around the corpse from the base angle, then reflect
      // any blob that would land off-field back to the open side — so it always
      // spawns a full FLING_DIST from the grave (never clamped onto it by a wall).
      const a = BASE_FLING_ANGLE + (i * 2 * Math.PI) / count;
      const ox = Math.cos(a) * FLING_DIST;
      const oy = Math.sin(a) * FLING_DIST;
      let px = corpse.x + ox;
      let py = corpse.y + oy;
      if (px < UNIT_RADIUS || px > FIELD_WIDTH - UNIT_RADIUS) px = corpse.x - ox;
      if (py < UNIT_RADIUS || py > FIELD_HEIGHT - UNIT_RADIUS) py = corpse.y - oy;
      px = clamp(px, UNIT_RADIUS, FIELD_WIDTH - UNIT_RADIUS);
      py = clamp(py, UNIT_RADIUS, FIELD_HEIGHT - UNIT_RADIUS);
      ctx.spawnUnit(
        "slime_squire",
        unit.team,
        { x: px, y: py },
        (blob) => {
          blob.homeAnchor = { x: corpse.x, y: corpse.y };
          blob.rebornStage = nextStage;
        }
      );
    }
  },
};

// Slime Blob — the homing runner. Its movement and aggro-suppression live in the
// shared systems (both keyed on homeAnchor); the kit only resolves arrival and the
// killed-en-route burst.
export const slimeBlobKit: UnitKit = {
  roleClass: "melee",

  // Reached the corpse → reincarnate the knight and dissolve the whole squad. Runs
  // in the pre-gate maintenance slot (before movement), so arrival is caught the
  // tick the blob is within REFORM_RADIUS, never overshooting.
  onTick(unit, ctx) {
    if (unit.state === "dead" || !unit.homeAnchor) return;
    const corpse = unit.homeAnchor;
    if (dist(unit.pos, corpse) > REFORM_RADIUS) return;

    const stage = unit.rebornStage;
    // Reincarnate at reduced HP, carrying the stage forward (fewer blobs next death).
    ctx.spawnUnit("slime_knight", unit.team, { x: corpse.x, y: corpse.y }, (k) => {
      k.hp = Math.max(1, Math.round(k.maxHp * REBORN_HP_FRAC));
      k.rebornStage = stage;
    });
    ctx.spawnVfx({
      kind: "shield_pop",
      pos: { x: corpse.x, y: corpse.y - 4 },
      life: secToTicks(0.7),
      maxLife: secToTicks(0.7),
      color: getUnitDef(unit.defId).accent,
    });

    // Dissolve every blob of THIS lineage (siblings share the exact corpse anchor),
    // self included, WITHOUT bursting — they merged into the reborn knight. Set
    // state directly (not through the funnel) so no onDeath burst fires. Distinct
    // knights die at distinct points, so the anchor match never crosses lineages;
    // and the earliest-uid blob resolves first, so exactly one knight is spawned
    // even though the whole squad converges on the same tick.
    for (const sib of [unit, ...ctx.allies]) {
      if (sib.defId === "slime_squire" && anchorsEqual(sib.homeAnchor, corpse)) {
        sib.homeAnchor = null;
        sib.hp = 0;
        sib.state = "dead";
      }
    }
  },

  // Killed en route → weak burst. A blob consumed by a rebirth had its state set to
  // "dead" directly (above), bypassing the funnel, so this never fires for those.
  onDeath(unit, ctx) {
    burst(unit, ctx, BLOB_BURST, BLOB_BURST_RADIUS);
  },
};
