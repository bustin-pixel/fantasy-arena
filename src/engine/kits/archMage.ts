// Archmage (defId "archmage") — the Sealed Vault's rare catalyst AND a playable
// legendary. Master of every mage's book:
//   Grand Grimoire — its active cast (0.8s, 6s cooldown) rolls ONE random spell
//                    from the pool below via ctx.rng (seeded — replays stay
//                    byte-identical). Only currently-USABLE spells are rolled
//                    (no sheep with nothing to sheep, no second Mirror Image),
//                    so a completed cast never fizzles into nothing:
//                      Fireball / Frost Blast — the mages' projectiles, resolved
//                        by the shared onProjectileHit resolver (same tags).
//                      Chain Lightning — the Electric Mage's bolt (shared cast).
//                      Arcane Barrage — arms the 3-missile volley; the engine's
//                        stepArcaneBarrage streams it (shared arm).
//                      Polymorph — the Mage's sheep (shared cast).
//                      Mirror Image — summons ONE fragile illusion double that
//                        basic-attacks until it dissolves (~8s; kit below).
//                      Twincast — the jackpot: immediately resolves TWO distinct
//                        other usable spells back to back.
//   Blink — the Arcane Mage's reactive escape, shared verbatim.
// Every spell body is REUSED from its donor kit — this file only owns the roll.
import type { Unit } from "@/types";
import type { KitCtx, UnitKit } from "./UnitKit";
import { getUnitDef } from "@/data/units";
import { secToTicks } from "@/utils/constants";
import { armArcaneBarrage, reactiveBlink } from "./arcaneMage";
import { castChainLightning } from "./electricMage";
import { castPolymorph, polymorphTarget } from "./mage";

const MIRROR_IMAGE_LIFESPAN_SEC = 8;

type GrimoireSpell =
  | "fireball"
  | "frost_blast"
  | "chain_lightning"
  | "arcane_barrage"
  | "polymorph"
  | "mirror_image"
  | "twincast";

// Flavor label floated over the Archmage when a page is ripped (presentation
// only — floating texts never touch the digest).
const SPELL_LABELS: Record<GrimoireSpell, string> = {
  fireball: "Fireball!",
  frost_blast: "Frost Blast!",
  chain_lightning: "Chain Lightning!",
  arcane_barrage: "Arcane Barrage!",
  polymorph: "Polymorph!",
  mirror_image: "Mirror Image!",
  twincast: "TWINCAST!",
};

function liveTarget(ctx: KitCtx): Unit | null {
  const t = ctx.unit.targetUid ? ctx.unitsByUid.get(ctx.unit.targetUid) : null;
  return t && t.state !== "dead" ? t : null;
}

function hasLiveEnemy(ctx: KitCtx): boolean {
  return ctx.enemies.some((e) => e.state !== "dead");
}

function hasLivingImage(ctx: KitCtx): boolean {
  return ctx.allies.some(
    (a) => a.defId === "mirror_image" && a.state !== "dead"
  );
}

/** The spells the grimoire can legally open to THIS tick, in stable declaration
 *  order (the rng.pick index is what varies, never the candidate order). */
function usableSpells(ctx: KitCtx): GrimoireSpell[] {
  const pool: GrimoireSpell[] = [];
  const targeted = liveTarget(ctx) != null;
  if (targeted) pool.push("fireball", "frost_blast");
  if (hasLiveEnemy(ctx)) pool.push("chain_lightning");
  if (targeted) pool.push("arcane_barrage");
  if (polymorphTarget(ctx.unit, ctx.enemies)) pool.push("polymorph");
  if (!hasLivingImage(ctx)) pool.push("mirror_image");
  // Twincast needs two OTHER usable spells to resolve into.
  if (pool.length >= 2) pool.push("twincast");
  return pool;
}

// Lob a donor-mage projectile (Fireball / Frost Blast) at the current target;
// impact resolves in the shared AbilitySystem.onProjectileHit, keyed on the tag.
function castProjectile(
  ctx: KitCtx,
  ability: "fireball" | "frost_blast"
): boolean {
  const target = liveTarget(ctx);
  if (!target) return false;
  const { unit } = ctx;
  ctx.spawnProjectile({
    pos: { x: unit.pos.x, y: unit.pos.y },
    target: { x: target.pos.x, y: target.pos.y },
    targetUid: target.uid,
    speed: ability === "fireball" ? 300 : 320,
    damage: ability === "fireball" ? 25 : 20,
    team: unit.team,
    sourceUid: unit.uid,
    ability,
    color: ability === "fireball" ? "#fb923c" : "#7dd3fc",
    angle: 0,
  });
  return true;
}

function summonMirrorImage(ctx: KitCtx): boolean {
  const { unit } = ctx;
  ctx.spawnUnit(
    "mirror_image",
    unit.team,
    { x: unit.pos.x, y: unit.pos.y + (unit.team === "player" ? -24 : 24) },
    (img) => {
      img.lifespanTicks = secToTicks(MIRROR_IMAGE_LIFESPAN_SEC);
    }
  );
  ctx.spawnVfx({
    kind: "frost",
    pos: { x: unit.pos.x, y: unit.pos.y },
    life: secToTicks(0.4),
    maxLife: secToTicks(0.4),
    color: getUnitDef("mirror_image").accent,
  });
  return true;
}

function castSpell(ctx: KitCtx, spell: GrimoireSpell): boolean {
  switch (spell) {
    case "fireball":
    case "frost_blast":
      return castProjectile(ctx, spell);
    case "chain_lightning":
      return castChainLightning(ctx);
    case "arcane_barrage":
      return armArcaneBarrage(ctx);
    case "polymorph":
      return castPolymorph(ctx);
    case "mirror_image":
      return summonMirrorImage(ctx);
    case "twincast": {
      // Resolve TWO distinct other spells, re-checking usability between them
      // (the first pick may consume its own legality, e.g. Mirror Image).
      let fired = false;
      const used = new Set<GrimoireSpell>(["twincast"]);
      for (let i = 0; i < 2; i++) {
        const pool = usableSpells(ctx).filter(
          (s) => s !== "twincast" && !used.has(s)
        );
        if (pool.length === 0) break;
        const sub = ctx.rng.pick(pool);
        used.add(sub);
        ctx.spawnFloatingText(ctx.unit, SPELL_LABELS[sub], "crit");
        fired = castSpell(ctx, sub) || fired;
      }
      return fired;
    }
  }
}

export const archMageKit: UnitKit = {
  roleClass: "ranged",

  // Blink: the Arcane Mage's reactive escape, shared verbatim (170px / own 5s cd).
  onReactTick: reactiveBlink,

  // Don't commit the 0.8s wind-up unless the grimoire has at least one legal page.
  wantsToCast(ctx) {
    return usableSpells(ctx).length > 0;
  },

  // Grand Grimoire (fired on cast completion): roll one usable spell and cast it.
  // The single ctx.rng.pick over a stable candidate list is the ONLY randomness.
  fireAbility(ctx) {
    const pool = usableSpells(ctx);
    if (pool.length === 0) return false;
    const spell = ctx.rng.pick(pool);
    ctx.spawnFloatingText(ctx.unit, SPELL_LABELS[spell], "crit");
    return castSpell(ctx, spell);
  },
};

// Mirror Image (defId "mirror_image") — the Archmage's illusion double. A plain
// ranged basic-attacker with one twist: it dissolves when its stamped lifespan
// runs out (through the damage funnel, so death/cleanup stays on the one path).
export const mirrorImageKit: UnitKit = {
  roleClass: "ranged",

  onTick(unit, ctx) {
    if (unit.state === "dead" || unit.lifespanTicks == null) return;
    unit.lifespanTicks--;
    if (unit.lifespanTicks <= 0) {
      unit.lifespanTicks = undefined; // dissolve exactly once
      ctx.spawnVfx({
        kind: "frost",
        pos: { x: unit.pos.x, y: unit.pos.y },
        life: secToTicks(0.4),
        maxLife: secToTicks(0.4),
        color: getUnitDef(unit.defId).accent,
      });
      ctx.dealDamage(unit, unit.hp + unit.shieldHp + 999, unit);
    }
  },
};
