// ============================================================================
// Equipment swing effects — the seam ADR-0001 built for units, applied to gear.
//
// These fire on a DEFAULT basic attack (a kit-replaced swing returns before
// them) and all share the unit's `attackCount` cadence counter.
//
// ORDER IS LOAD-BEARING. The list below runs top-to-bottom, and that sequence
// is part of the simulation: two of these legendaries worn together resolve
// twin → chain → eclipse → spread, every time. It deliberately does NOT iterate
// `unit.itemMods.effects` — that array is in EQUIP order, so looping it would
// make combat depend on which slot a player happened to fill first, and the
// digest would shift the moment anyone re-equipped. Add new swing effects at
// the END unless you intend a combat change, and re-run the digest either way.
// ============================================================================

import type { ItemEffect, ShotRider, Unit, Vfx } from "@/types";
import type { KitCtx } from "@/engine/kits/UnitKit";
import { applyEffect, makeEffect } from "@/engine/StatusEffectSystem";
import { secToTicks } from "@/utils/constants";
import { dist } from "@/utils/math";

/** What a swing effect gets to work with. `ctx` is the same KitCtx the unit
 *  kits use (dealDamage / heal / spawnVfx / spawnProjectile / enemies), so gear
 *  and unit mechanics mutate the sim through exactly one set of funnels. */
export interface SwingArgs {
  ctx: KitCtx;
  unit: Unit;
  target: Unit;
  /** 2 when this swing crits (team Overkill or the item's own cadence). */
  critMult: number;
  ranged: boolean;
  /** The wearer's accent colour, for the twin shot's projectile. */
  accent: string;
  /** Total lifesteal fraction (team boon + item), for the twin melee hit. */
  lifestealFrac: number;
  /** Lifesteal application — owned by CombatSystem's HP funnel. */
  applyLifesteal: (unit: Unit, damage: number, frac: number) => void;
}

/** Apply an item rider's status + impact vfx to a target. Melee hits, item
 *  projectile riders, and detonation novae all funnel through here. */
export function applyItemRider(
  target: Unit,
  sourceUid: string,
  r: ShotRider,
  spawnVfx: (v: Omit<Vfx, "id">) => void
): void {
  applyEffect(
    target,
    makeEffect(r.effectType, {
      source: sourceUid,
      durationSec: r.durationSec,
      damagePerTick: r.damagePerTick,
      tickIntervalSec: r.tickIntervalSec,
      magnitude: r.magnitude,
    })
  );
  spawnVfx({
    kind: r.vfxKind,
    pos: { x: target.pos.x, y: target.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: r.color,
  });
}

/** One entry per swing effect: which `ItemEffect.kind` it reads, and what it
 *  does. `gate` decides whether it fires at all (most are an every-Nth cadence
 *  on attackCount; Venom Fang keys off the target's poison instead). */
interface SwingEffect<K extends ItemEffect["kind"] = ItemEffect["kind"]> {
  kind: K;
  gate: (e: Extract<ItemEffect, { kind: K }>, a: SwingArgs) => boolean;
  run: (e: Extract<ItemEffect, { kind: K }>, a: SwingArgs) => void;
}

const everyNth = (
  e: { everyNth: number },
  a: SwingArgs
): boolean => a.unit.attackCount % e.everyNth === 0;

/** Twinfang: every Nth attack strikes twice (a second full swing). */
const twinfang: SwingEffect<"doubleStrikeNth"> = {
  kind: "doubleStrikeNth",
  gate: everyNth,
  run: (_e, a) => {
    const { ctx, unit, target, critMult } = a;
    if (a.ranged) {
      ctx.spawnProjectile({
        pos: { x: unit.pos.x, y: unit.pos.y },
        target: { x: target.pos.x, y: target.pos.y },
        targetUid: target.uid,
        speed: 380,
        damage: unit.damage * critMult,
        team: unit.team,
        sourceUid: unit.uid,
        ability: "lifesteal",
        color: a.accent,
        angle: 0,
      });
    } else {
      ctx.dealDamage(target, unit.damage * critMult, unit);
      a.applyLifesteal(unit, unit.damage * critMult, a.lifestealFrac);
    }
  },
};

/** Stormpiercer: every Nth attack arcs to the nearest OTHER enemy. */
const stormpiercer: SwingEffect<"chainNth"> = {
  kind: "chainNth",
  gate: everyNth,
  run: (e, a) => {
    const { ctx, unit, target } = a;
    let nearest: Unit | null = null;
    let nd = Infinity;
    for (const foe of ctx.enemies) {
      if (foe === target || foe.state === "dead") continue;
      const d = dist(unit.pos, foe.pos);
      if (d < nd) {
        nd = d;
        nearest = foe;
      }
    }
    if (!nearest) return;
    ctx.spawnVfx({
      kind: "lightning",
      pos: { x: target.pos.x, y: target.pos.y },
      to: { x: nearest.pos.x, y: nearest.pos.y },
      life: secToTicks(0.3),
      maxLife: secToTicks(0.3),
      color: "#38bdf8",
    });
    ctx.dealDamage(nearest, Math.round(unit.damage * e.frac), unit);
  },
};

/** Eclipse Pendant: every Nth hit lands bonus shadow damage (+ legendary stun). */
const eclipsePendant: SwingEffect<"nthBonusDamage"> = {
  kind: "nthBonusDamage",
  gate: everyNth,
  run: (e, a) => {
    const { ctx, unit, target } = a;
    ctx.spawnVfx({
      kind: "burn_burst",
      pos: { x: target.pos.x, y: target.pos.y },
      life: secToTicks(0.35),
      maxLife: secToTicks(0.35),
      color: "#facc15",
    });
    ctx.dealDamage(target, e.bonus, unit);
    if (e.stunSec) {
      applyEffect(
        target,
        makeEffect("stun", { source: unit.uid, durationSec: e.stunSec })
      );
    }
  },
};

/** Venom Fang: hits on a POISONED target splash the poison to nearby enemies. */
const venomFang: SwingEffect<"spreadPoisonOnAttack"> = {
  kind: "spreadPoisonOnAttack",
  gate: (_e, a) => a.target.effects.some((x) => x.type === "poison"),
  run: (e, a) => {
    const { ctx, unit, target } = a;
    for (const foe of ctx.enemies) {
      if (foe === target || foe.state === "dead") continue;
      if (dist(foe.pos, target.pos) > e.radius) continue;
      applyItemRider(foe, unit.uid, e.rider, ctx.spawnVfx);
    }
  },
};

/** THE ORDER. See the header — this sequence is simulation, not layout. */
const SWING_EFFECTS = [
  twinfang,
  stormpiercer,
  eclipsePendant,
  venomFang,
] as SwingEffect[];

/** Run every equipped swing effect, in the fixed order above. */
export function runSwingEffects(a: SwingArgs): void {
  const effects = a.unit.itemMods?.effects;
  if (!effects) return;
  for (const slot of SWING_EFFECTS) {
    const e = effects.find((x) => x.kind === slot.kind);
    if (e && slot.gate(e, a)) slot.run(e, a);
  }
}
