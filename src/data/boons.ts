// ============================================================================
// ENDLESS MODE — warband boons
// The party-wide upgrades offered after each endless wave. Pure data + a pure,
// seeded offer roller (no engine / React / DOM). The EndlessController applies a
// chosen boon's `effects`; the overlay renders its name/description/rarity.
//
// A boon's `effects` compose from a small closed set the controller knows how to
// apply. Most stat boons fold into SimState.teamMods (read at the combat funnels,
// so they survive kits that recompute unit stats every tick and cover summons for
// free). maxHp/regen/waveShield/revive are one-shot events on the warband units.
//
// Rarity follows the house rule: common = one small stat %, rare = one meaningful
// mechanic, epic = build-defining (may bundle two effects). Boons stack; the same
// boon can be offered again — EXCEPT `unique` boons (pure on/off switches like
// Momentum), which leave the offer pool once owned since a second copy is a no-op.
// ============================================================================

import { RNG } from "@/utils/rng";
import type { StatusEffectType } from "@/types";
import { ENDLESS_INTERMISSION_HEAL } from "./endless";

export type BoonRarity = "common" | "rare" | "epic";

/** Enemies at or below this HP fraction take the Executioner bonus. */
export const EXECUTE_THRESHOLD = 0.25;

/** SimState.teamMods fields a boon can move. `value` is always the buff MAGNITUDE
 *  (a positive fraction); the controller knows the correct fold per field (e.g.
 *  attack-speed shrinks the delay, damage-reduction shrinks the taken-mult). A
 *  NEGATIVE value flips the direction — Reckless raises damage-taken with a
 *  negative reduction. */
export type TeamModField =
  | "dmgMult"
  | "atkDelayMult"
  | "moveSpeedMult"
  | "damageTakenMult"
  | "lifestealBonus";

export type BoonEffect =
  | { type: "teamMod"; field: TeamModField; value: number }
  | { type: "maxHp"; pct: number }
  | { type: "intermissionHeal"; addPct: number }
  | { type: "regen"; hpPerSec: number }
  | { type: "waveShield"; amount: number }
  | { type: "revive"; hpPct: number }
  // --- proc / mechanic effects (slice 2) ---
  /** Executioner: +frac damage vs enemies below EXECUTE_THRESHOLD. */
  | { type: "execute"; bonus: number }
  /** Thornmail: reflect `frac` of incoming damage back at the attacker. */
  | { type: "thorns"; frac: number }
  /** Bloodfeast: each kill heals the whole warband this many HP. */
  | { type: "killHeal"; amount: number }
  /** Bounty Hunter: each kill grants the killer this much permanent max HP. */
  | { type: "bounty"; hp: number }
  /** Overheal Ward: healing past max HP banks as shield. */
  | { type: "overheal" }
  /** Last Breath: once per wave, a fatal blow leaves the unit at 1 HP. */
  | { type: "lastBreath" }
  /** Overkill: every Nth attack deals double. */
  | { type: "crit"; everyNth: number }
  /** Marksman's Focus: ranged basic attacks lifesteal this fraction. */
  | { type: "rangedLifesteal"; frac: number }
  /** Berserker's Rhythm: attack speed ramps over a wave, resets each wave. */
  | { type: "rhythm" }
  /** Momentum: +5% damage for the run each wave cleared with no death. */
  | { type: "momentum" }
  /** Thunderclap / Venom Coating: every Nth attack plants a status rider. */
  | {
      type: "onHitRider";
      effectType: StatusEffectType;
      everyNth: number;
      durationSec: number;
      magnitude?: number;
      damagePerTick?: number;
      tickIntervalSec?: number;
    }
  /** Kennel Master / War Machine: summon companions at the start of each wave. */
  | { type: "waveSummon"; defId: string; count: number };

export interface BoonDef {
  id: string;
  name: string;
  rarity: BoonRarity;
  /** One-line card text. */
  description: string;
  effects: BoonEffect[];
  /** Offer gate. "allyDead" boons are only offered when a warband unit is down
   *  (and never appear otherwise). */
  offerIf?: "allyDead";
  /** One-time switches (booleans / overwrites in TeamMods): a second copy does
   *  nothing, so once owned the boon is excluded from future offers. */
  unique?: boolean;
}

export const BOONS: Record<string, BoonDef> = {
  // -- Common: one small stat bump each. -----------------------------------
  hardy: {
    id: "hardy",
    name: "Hardy",
    rarity: "common",
    description: "+10% max HP to the whole warband (and heal the gain).",
    effects: [{ type: "maxHp", pct: 0.1 }],
  },
  sharpened: {
    id: "sharpened",
    name: "Sharpened Steel",
    rarity: "common",
    description: "+10% attack damage to the whole warband.",
    effects: [{ type: "teamMod", field: "dmgMult", value: 0.1 }],
  },
  quickened: {
    id: "quickened",
    name: "Quickened",
    rarity: "common",
    description: "+10% attack speed to the whole warband.",
    effects: [{ type: "teamMod", field: "atkDelayMult", value: 0.1 }],
  },
  fleetfoot: {
    id: "fleetfoot",
    name: "Fleetfoot",
    rarity: "common",
    description: "+10% move speed to the whole warband.",
    effects: [{ type: "teamMod", field: "moveSpeedMult", value: 0.1 }],
  },
  stoneskin: {
    id: "stoneskin",
    name: "Stoneskin",
    rarity: "common",
    description: "The warband takes 8% less damage.",
    effects: [{ type: "teamMod", field: "damageTakenMult", value: 0.08 }],
  },
  field_medicine: {
    id: "field_medicine",
    name: "Field Medicine",
    rarity: "common",
    description: "Heal an extra 15% of missing HP between waves.",
    effects: [{ type: "intermissionHeal", addPct: 0.15 }],
  },
  mending_aura: {
    id: "mending_aura",
    name: "Mending Aura",
    rarity: "common",
    description: "The warband regenerates 3 HP/sec in combat.",
    effects: [{ type: "regen", hpPerSec: 3 }],
  },

  // -- Rare: one meaningful mechanic each. ---------------------------------
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    rarity: "rare",
    description: "The warband starts each wave with a 60 HP shield.",
    effects: [{ type: "waveShield", amount: 60 }],
  },
  vampirism: {
    id: "vampirism",
    name: "Vampirism",
    rarity: "rare",
    description: "Melee attacks heal for 8% of the damage dealt.",
    effects: [{ type: "teamMod", field: "lifestealBonus", value: 0.08 }],
  },
  war_banner: {
    id: "war_banner",
    name: "War Banner",
    rarity: "rare",
    description: "+20% attack damage to the whole warband.",
    effects: [{ type: "teamMod", field: "dmgMult", value: 0.2 }],
  },
  juggernaut: {
    id: "juggernaut",
    name: "Juggernaut",
    rarity: "rare",
    description: "+20% max HP to the whole warband (and heal the gain).",
    effects: [{ type: "maxHp", pct: 0.2 }],
  },
  second_chance: {
    id: "second_chance",
    name: "Second Chance",
    rarity: "rare",
    description: "Revive a fallen ally at 50% HP.",
    effects: [{ type: "revive", hpPct: 0.5 }],
    offerIf: "allyDead",
  },

  // -- Epic: build-defining (may bundle two effects). ----------------------
  titans_blood: {
    id: "titans_blood",
    name: "Titan's Blood",
    rarity: "epic",
    description: "+30% max HP and +10% damage to the whole warband.",
    effects: [
      { type: "maxHp", pct: 0.3 },
      { type: "teamMod", field: "dmgMult", value: 0.1 },
    ],
  },
  bloodlust: {
    id: "bloodlust",
    name: "Bloodlust",
    rarity: "epic",
    description: "+15% attack speed and 8% melee lifesteal.",
    effects: [
      { type: "teamMod", field: "atkDelayMult", value: 0.15 },
      { type: "teamMod", field: "lifestealBonus", value: 0.08 },
    ],
  },
  aegis: {
    id: "aegis",
    name: "Aegis",
    rarity: "epic",
    description: "The warband takes 15% less damage.",
    effects: [{ type: "teamMod", field: "damageTakenMult", value: 0.15 }],
  },
  overwhelm: {
    id: "overwhelm",
    name: "Overwhelm",
    rarity: "epic",
    description: "+25% attack damage to the whole warband.",
    effects: [{ type: "teamMod", field: "dmgMult", value: 0.25 }],
  },

  // -- Slice 2: proc / mechanic boons (build-defining). --------------------
  // Rare — one mechanic each.
  marksmans_focus: {
    id: "marksmans_focus",
    name: "Marksman's Focus",
    rarity: "rare",
    description: "Ranged attacks heal for 8% of the damage dealt.",
    effects: [{ type: "rangedLifesteal", frac: 0.08 }],
  },
  venom_coating: {
    id: "venom_coating",
    name: "Venom Coating",
    rarity: "rare",
    description: "Every 2nd attack poisons the target (6 dmg/sec for 4s).",
    effects: [
      {
        type: "onHitRider",
        effectType: "poison",
        everyNth: 2,
        durationSec: 4,
        damagePerTick: 6,
        tickIntervalSec: 1,
      },
    ],
  },
  bloodfeast: {
    id: "bloodfeast",
    name: "Bloodfeast",
    rarity: "rare",
    description: "Each kill heals the whole warband for 12 HP.",
    effects: [{ type: "killHeal", amount: 12 }],
  },
  thornmail: {
    id: "thornmail",
    name: "Thornmail",
    rarity: "rare",
    description: "Reflect 20% of the damage your warband takes back at attackers.",
    effects: [{ type: "thorns", frac: 0.2 }],
  },
  reckless: {
    id: "reckless",
    name: "Reckless",
    rarity: "rare",
    description: "+30% damage, but your warband takes 15% more damage.",
    effects: [
      { type: "teamMod", field: "dmgMult", value: 0.3 },
      { type: "teamMod", field: "damageTakenMult", value: -0.15 },
    ],
  },
  overkill: {
    id: "overkill",
    name: "Overkill",
    rarity: "rare",
    unique: true,
    description: "Every 4th attack strikes for double damage.",
    effects: [{ type: "crit", everyNth: 4 }],
  },
  kennel_master: {
    id: "kennel_master",
    name: "Kennel Master",
    rarity: "rare",
    description: "Start each wave with two spirit wolves at your side.",
    effects: [{ type: "waveSummon", defId: "wolf", count: 2 }],
  },

  // Epic — build payoffs.
  thunderclap: {
    id: "thunderclap",
    name: "Thunderclap",
    rarity: "epic",
    description: "Every 5th attack stuns the target.",
    effects: [
      { type: "onHitRider", effectType: "stun", everyNth: 5, durationSec: 0.6 },
    ],
  },
  executioner: {
    id: "executioner",
    name: "Executioner",
    rarity: "epic",
    description: "+40% damage to enemies below 25% HP.",
    effects: [{ type: "execute", bonus: 0.4 }],
  },
  bounty_hunter: {
    id: "bounty_hunter",
    name: "Bounty Hunter",
    rarity: "epic",
    description: "Each kill grants the slayer +2 permanent max HP.",
    effects: [{ type: "bounty", hp: 2 }],
  },
  last_breath: {
    id: "last_breath",
    name: "Last Breath",
    rarity: "epic",
    unique: true,
    description: "Once per wave, a fatal blow leaves a unit at 1 HP instead.",
    effects: [{ type: "lastBreath" }],
  },
  overheal_ward: {
    id: "overheal_ward",
    name: "Overheal Ward",
    rarity: "epic",
    unique: true,
    description: "Healing beyond max HP banks as a damage-soaking shield.",
    effects: [{ type: "overheal" }],
  },
  berserkers_rhythm: {
    id: "berserkers_rhythm",
    name: "Berserker's Rhythm",
    rarity: "epic",
    unique: true,
    description: "Attack speed climbs the longer a wave lasts, resetting each wave.",
    effects: [{ type: "rhythm" }],
  },
  momentum: {
    id: "momentum",
    name: "Momentum",
    rarity: "epic",
    unique: true,
    description: "+5% damage for the rest of the run each wave cleared with no death.",
    effects: [{ type: "momentum" }],
  },
  war_machine: {
    id: "war_machine",
    name: "War Machine",
    rarity: "epic",
    description: "Deploy an automated turret at the start of each wave.",
    effects: [{ type: "waveSummon", defId: "turret", count: 1 }],
  },
};

/** Stable insertion order — the offer roller iterates this deterministically. */
export const ALL_BOON_IDS: string[] = Object.keys(BOONS);

// -- Stack math (info panel) --------------------------------------------------
// What `count` copies of a boon amount to, as human-readable lines. The math
// mirrors EXACTLY how each effect folds in the EndlessController/CombatSystem:
// team multipliers and maxHp compound multiplicatively per copy; lifesteal,
// thorns, execute, heals and shields add; unique boons don't stack at all.

const asPct = (x: number): string => `${Math.round(x * 100)}%`;

/** Total gain of a per-copy multiplier applied `n` times: (1+v)^n - 1. */
const compounded = (v: number, n: number): number => Math.pow(1 + v, n) - 1;

export function boonStackSummary(id: string, count: number): string[] {
  const boon = BOONS[id];
  if (!boon) return [];
  if (boon.unique) return ["Unique — one copy per run."];
  const lines: string[] = [];
  for (const eff of boon.effects) {
    switch (eff.type) {
      case "teamMod": {
        const v = eff.value;
        switch (eff.field) {
          case "dmgMult":
            lines.push(`+${asPct(compounded(v, count))} attack damage`);
            break;
          case "atkDelayMult":
            lines.push(`+${asPct(compounded(v, count))} attack speed`);
            break;
          case "moveSpeedMult":
            lines.push(`+${asPct(compounded(v, count))} move speed`);
            break;
          case "damageTakenMult":
            // Positive = reduction (compounds down); negative = Reckless's tax
            // (compounds up).
            lines.push(
              v >= 0
                ? `−${asPct(1 - Math.pow(1 - v, count))} damage taken`
                : `+${asPct(compounded(-v, count))} damage taken`
            );
            break;
          case "lifestealBonus":
            lines.push(`${asPct(v * count)} melee lifesteal`);
            break;
        }
        break;
      }
      case "maxHp":
        lines.push(`+${asPct(compounded(eff.pct, count))} max HP`);
        break;
      case "intermissionHeal":
        lines.push(
          `heal ${asPct(
            Math.min(0.9, ENDLESS_INTERMISSION_HEAL + eff.addPct * count)
          )} of missing HP between waves`
        );
        break;
      case "regen":
        lines.push(`${eff.hpPerSec * count} HP/sec regeneration in combat`);
        break;
      case "waveShield":
        lines.push(`${eff.amount * count} HP shield at each wave start`);
        break;
      case "revive":
        lines.push(`revived ${count === 1 ? "an ally" : `${count} allies`} at ${asPct(eff.hpPct)} HP`);
        break;
      case "execute":
        lines.push(
          `+${asPct(eff.bonus * count)} damage vs enemies below ${asPct(EXECUTE_THRESHOLD)} HP`
        );
        break;
      case "thorns":
        lines.push(`reflect ${asPct(eff.frac * count)} of damage taken`);
        break;
      case "killHeal":
        lines.push(`${eff.amount * count} HP to the warband per kill`);
        break;
      case "bounty":
        lines.push(`+${eff.hp * count} permanent max HP to the slayer per kill`);
        break;
      case "rangedLifesteal":
        lines.push(`${asPct(eff.frac * count)} ranged lifesteal`);
        break;
      case "onHitRider":
        lines.push(
          eff.damagePerTick != null
            ? `every ${nth(eff.everyNth)} attack: ${eff.effectType} for ${
                eff.damagePerTick * count
              } dmg/sec (${eff.durationSec}s)`
            : `every ${nth(eff.everyNth)} attack: ${eff.effectType} (${eff.durationSec}s)`
        );
        break;
      case "waveSummon":
        lines.push(
          `${eff.count * count} compan${eff.count * count === 1 ? "ion" : "ions"} at each wave start`
        );
        break;
      // crit / overheal / lastBreath / rhythm / momentum are all `unique` and
      // returned above.
      default:
        break;
    }
  }
  return lines;
}

function nth(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

/** Rarity odds by wave band — deeper runs weight toward rare/epic. */
export function boonRarityWeights(wave: number): Record<BoonRarity, number> {
  if (wave >= 11) return { common: 45, rare: 38, epic: 17 };
  if (wave >= 6) return { common: 60, rare: 30, epic: 10 };
  return { common: 75, rare: 22, epic: 3 };
}

function rollRarity(wave: number, rng: RNG): BoonRarity {
  const w = boonRarityWeights(wave);
  const total = w.common + w.rare + w.epic;
  let r = rng.next() * total;
  if (r < w.common) return "common";
  r -= w.common;
  if (r < w.rare) return "rare";
  return "epic";
}

/**
 * The three boon ids offered after clearing `wave`. Fully seeded from `rng`
 * (never Math.random) so an offer sequence is replayable. Slots are distinct.
 * When a warband unit is dead the third slot is forced to the revive boon; when
 * none is dead, offer-gated boons are excluded entirely. `owned` (the run's
 * picks so far) removes already-owned `unique` boons — a second copy of those
 * is a no-op, so re-offering one would be a dead card.
 */
export function rollBoonOffers(
  wave: number,
  rng: RNG,
  hasDead: boolean,
  owned: ReadonlySet<string> = new Set()
): string[] {
  const pool = ALL_BOON_IDS.filter(
    (id) =>
      BOONS[id].offerIf == null && !(BOONS[id].unique && owned.has(id))
  );
  const offers: string[] = [];
  const slots = hasDead ? 2 : 3;
  let guard = 0;
  while (offers.length < slots && guard < 100) {
    guard++;
    const rarity = rollRarity(wave, rng);
    let cands = pool.filter(
      (id) => BOONS[id].rarity === rarity && !offers.includes(id)
    );
    if (cands.length === 0) cands = pool.filter((id) => !offers.includes(id));
    if (cands.length === 0) break;
    offers.push(rng.pick(cands));
  }
  if (hasDead) offers.push("second_chance");
  return offers;
}
