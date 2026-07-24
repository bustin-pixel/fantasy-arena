// ============================================================================
// Encounters — what a dungeon floor can BE beyond a plain fight, and the
// "which way?" omen the three post-victory arrows show. A leaf data module
// (engine/React-free, like dungeons.ts): the WaveController + rewards read the
// kind, BattleScreen renders the omens.
//
// Determinism: the omen roll draws a FRESH seeded RNG (a meta stream, never the
// sim RNG), so it can never perturb combat. The next floor's combat still gets
// its own fresh seed — the omen only decides which modifiers that floor carries.
// ============================================================================

import { RNG } from "@/utils/rng";
import { isBossFloorIn, type Dungeon } from "@/data/dungeons";
import type { IconName } from "@/components/icons/GameIcon";

export type EncounterKind =
  | "normal" // a standard floor (the default everywhere)
  | "cursed" // a harder floor (bigger horde + tougher monsters); richer chest
  | "rare_spawn" // the dungeon's fusion-quest RARE lurks here (no dungeon boss)
  //              — an ambush the arrows never reveal, see assignOmens
  | "treasure_vault" // a normal fight, but the end-chest is bumped a tier
  | "treasure_room"; // NO combat: a banner, gold on the floor, three chests
//
// NOTE: there is deliberately no "elite ambush" kind. It used to promote a
// floor's priciest ORDINARY monster (the Depths' Zombie Shambler) to rare level
// behind a rare telegraph — a "rare Zombie Shambler". Per the user, the ONLY
// monster that may ever wear the rare banner is the dungeon's fusion-quest rare
// (see rare_spawn / the boss floor's catalyst), so that kind is gone; "a harder
// floor" is what `cursed` is for.

/** The three exit-arrow directions (structurally OutroDir, kept local so this
 *  leaf never imports from hooks). */
export type OmenDir = "up" | "left" | "right";

/** What an arrow's omen reads as — drives its glyph + label. There is
 *  deliberately NO "rare" omen: the fusion-quest rare always hides behind one
 *  of these three (assignOmens), so nothing on the arrows can telegraph it. */
export type Omen = "safe" | "ominous" | "treasure";

/** The omen a kind NATURALLY reads as. A rare quarry never shows its own read —
 *  it wears its host arrow's omen instead (assignOmens) — so its "ominous" here
 *  is only an honest fallback, never what the player sees. */
export function omenFor(kind: EncounterKind): Omen {
  switch (kind) {
    case "cursed":
    case "rare_spawn":
      return "ominous";
    case "treasure_vault":
    case "treasure_room":
      return "treasure";
    default:
      return "safe";
  }
}

export const OMEN_META: Record<Omen, { glyph: IconName; label: string }> = {
  safe: { glyph: "omenSafe", label: "The safe road" },
  ominous: { glyph: "omenOminous", label: "An ominous path" },
  treasure: { glyph: "omenTreasure", label: "Glinting treasure" },
};

/** Chance a RARE QUARRY (the fusion-quest rare) lurks behind ONE of the three
 *  arrows — only in dungeons that HAVE a quest, and only when the run hasn't
 *  already met its rare (see assignOmens `allowRareSpawn`). */
export const RARE_QUARRY_CHANCE = 0.28;

/** One exit arrow: what it LEADS to, and what it SHOWS. The two differ only for
 *  a rare quarry, which wears its host arrow's omen — you can never tell it's
 *  coming, so it may lurk behind the safe road as readily as an ominous path. */
export interface OmenArrow {
  kind: EncounterKind;
  omen: Omen;
}

// --- Tuning: how a special encounter reshapes a floor. ----------------------

/** Cursed floors throw a bigger, tougher horde (for a richer chest). Applied
 *  ONLY on the cursed path, so a normal floor's wave stays byte-identical. */
export const CURSED_BUDGET_MULT = 1.5;
export const CURSED_HP_MULT = 1.15;
export const CURSED_DMG_MULT = 1.12;

/** Fraction of a normal floor's budget a rare-quarry floor spends on lead-in
 *  fodder before the telegraphed rare (mirrors a boss floor's fodder share). */
export const QUARRY_FODDER_SHARE = 0.6;

/** How many chest tiers a "rich" encounter bumps the floor's end chest. */
export function richChestBump(kind: EncounterKind): number {
  return kind === "cursed" || kind === "treasure_vault" || kind === "rare_spawn"
    ? 1
    : 0;
}

/** The three chests a treasure room drops — a hoard with one standout. */
export const TREASURE_ROOM_TIERS = ["silver", "gold", "silver"] as const;

/** XOR salt so the omen roll is its own stream, distinct from every other. */
const OMEN_SALT = 0x0e17;

/** Assign an encounter to each of the three exit arrows, deterministically from
 *  `seed`. One arrow is always the plain road; the other two each ROLL — often
 *  normal, sometimes an omen — so a special floor is a chance, not a given, and
 *  there's always a safe-LOOKING way down. On a floor whose next step is a BOSS
 *  floor, every arrow is normal (never drop a no-combat room or an ambush where
 *  a scripted boss belongs). Pure + seeded, so re-renders can't reshuffle it.
 *
 *  The rare quarry is the one thing the arrows LIE about: it seizes a random
 *  arrow and keeps that arrow's omen, so the fusion-quest rare is never
 *  telegraphed — the safe road can turn out to be the hunt. */
export function assignOmens(
  seed: number,
  dungeon: Dungeon,
  nextFloor: number,
  /** Whether the next floor is the boss lair. In the RNG "hunt for the boss"
   *  descent the boss sits at a run-seeded depth, so the caller passes it
   *  explicitly; omitted, it falls back to the every-Nth-floor rule. A boss
   *  floor forces all-normal omens (a scripted boss, never a room/ambush). */
  nextIsBoss?: boolean,
  /** Whether a RARE QUARRY (the fusion-quest rare) may lurk behind this pick.
   *  The caller passes false once the run has already met its rare, so at most
   *  one rare quarry appears per run. Omitted = allowed (still gated on the
   *  dungeon actually having a quest). */
  allowRareSpawn: boolean = true
): Record<OmenDir, OmenArrow> {
  /** An honest arrow: it shows exactly what it leads to. */
  const shown = (kind: EncounterKind): OmenArrow => ({
    kind,
    omen: omenFor(kind),
  });

  if (nextIsBoss ?? isBossFloorIn(dungeon, nextFloor)) {
    return { up: shown("normal"), left: shown("normal"), right: shown("normal") };
  }
  const rng = new RNG((seed ^ OMEN_SALT) >>> 0);

  // The "ominous" slot: a coin-flip-ish chance of danger, else a plain road.
  // Danger is always a CURSED gauntlet now — the elite-ambush kind it used to
  // share this slot with manufactured a fake rare (a "rare Zombie Shambler"),
  // so it's gone. The odds of the slot being dangerous at all are unchanged.
  const rOm = rng.next();
  const ominous: EncounterKind = rOm < 0.66 ? "cursed" : "normal";

  // The "treasure" slot: a rarer treasure ROOM, an uncommon vault, else plain.
  const rTr = rng.next();
  const treasure: EncounterKind =
    rTr < 0.28 ? "treasure_room" : rTr < 0.52 ? "treasure_vault" : "normal";

  const [up, left, right] = rng.shuffle<EncounterKind>([
    "normal",
    ominous,
    treasure,
  ]);
  const arrows: Record<OmenDir, OmenArrow> = {
    up: shown(up),
    left: shown(left),
    right: shown(right),
  };

  // The rare quarry HIDES. It takes over one arrow at random and keeps that
  // arrow's omen, so no glyph, tint or label can give it away — it lurks behind
  // the safe road as readily as an ominous path, and the treasure it disguises
  // itself as never arrives. (Drawn last so the visible omens above stay a pure
  // function of the first rolls.)
  if (allowRareSpawn && dungeon.quest != null && rng.next() < RARE_QUARRY_CHANCE) {
    const host = rng.pick<OmenDir>(["up", "left", "right"]);
    arrows[host] = { kind: "rare_spawn", omen: arrows[host].omen };
  }
  return arrows;
}
