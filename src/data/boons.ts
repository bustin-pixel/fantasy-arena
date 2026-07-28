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
import {
  ENDLESS_INTERMISSION_HEAL,
  endlessBoonDefenseScale,
  endlessBoonOffenseScale,
} from "./endless";

export type BoonRarity = "common" | "rare" | "epic" | "mythic";

/** Wave from which mythic boons — the deep-run payoffs — start appearing at all.
 *  Individual boons gate themselves further with `minWave`. */
export const ENDLESS_MYTHIC_WAVE = 20;

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
  /** Bounty Hunter: each kill grants the killer this FRACTION of its own max HP,
   *  permanently (capped per wave by BOUNTY_WAVE_CAP_FRAC). A fraction rather than
   *  a flat number so it keeps pace deep in a run without compounding a warband
   *  into invulnerability — see EndlessController.applyBoon. */
  | { type: "bounty"; pctOfMax: number }
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
  | { type: "waveSummon"; defId: string; count: number }
  // --- mythic / deep tier ---
  /** Ascendant: an immediate bump, plus MORE of it every wave cleared after. The
   *  only boon whose RATE improves rather than its level — see BOONS below. */
  | { type: "ascendant"; basePct: number; perWavePct: number }
  /** Warlord's Horn: the commander's battle spell recharges every wave. */
  | { type: "spellRecharge" }
  /** Phoenix Pact: the first ally to fall each wave returns when it ends. */
  | { type: "phoenix"; hpPct: number }
  /** Siege Train: outgoing damage climbs the longer the current wave lasts. */
  | { type: "siege"; pctPer30Sec: number }
  /** Soul Harvest: each kill adds outgoing damage for the rest of the wave. */
  | { type: "killStack"; dmgPct: number };

export interface BoonDef {
  id: string;
  name: string;
  rarity: BoonRarity;
  /** One-line card text. For a wave-scaled boon this is the wave-1 wording and
   *  would be a lie later, so those boons supply `describe` too. */
  description: string;
  /** Live card text for a given wave. Present only on the wave-scaled boons;
   *  `boonDescription` falls back to `description` otherwise. */
  describe?: (wave: number) => string;
  effects: BoonEffect[];
  /** Offer gate. "allyDead" boons are only offered when a warband unit is down
   *  (and never appear otherwise); "hasSpell" ones only when the commander
   *  actually has a battle spell equipped, since they'd be a dead card without. */
  offerIf?: "allyDead" | "hasSpell";
  /** One-time switches (booleans / overwrites in TeamMods): a second copy does
   *  nothing, so once owned the boon is excluded from future offers. */
  unique?: boolean;
  /** Earliest wave this boon may be offered. THIS is the real gate for the deep
   *  tier — rarity only sets presentation and weighting. */
  minWave?: number;
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
    describe: (w) =>
      `The warband regenerates ${Math.round(3 * endlessBoonDefenseScale(w))} HP/sec in combat.`,
    effects: [{ type: "regen", hpPerSec: 3 }],
  },

  // -- Rare: one meaningful mechanic each. ---------------------------------
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    rarity: "rare",
    description: "The warband starts each wave with a 60 HP shield.",
    describe: (w) =>
      `The warband starts each wave with a ${Math.round(60 * endlessBoonDefenseScale(w))} HP shield.`,
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
    description: "+20% attack speed and 10% melee lifesteal.",
    effects: [
      { type: "teamMod", field: "atkDelayMult", value: 0.2 },
      { type: "teamMod", field: "lifestealBonus", value: 0.1 },
    ],
  },
  aegis: {
    id: "aegis",
    name: "Aegis",
    rarity: "epic",
    description: "The warband takes 20% less damage.",
    effects: [{ type: "teamMod", field: "damageTakenMult", value: 0.2 }],
  },
  overwhelm: {
    id: "overwhelm",
    name: "Overwhelm",
    rarity: "epic",
    description: "+35% attack damage to the whole warband.",
    effects: [{ type: "teamMod", field: "dmgMult", value: 0.35 }],
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
    describe: (w) =>
      `Every 2nd attack poisons the target (${Math.round(6 * endlessBoonOffenseScale(w))} dmg/sec for 4s).`,
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
    describe: (w) =>
      `Each kill heals the whole warband for ${Math.round(12 * endlessBoonDefenseScale(w))} HP.`,
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
    description: "Each kill permanently grows the slayer's max HP.",
    effects: [{ type: "bounty", pctOfMax: 0.0015 }],
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

  // -- Mythic: the deep-run payoffs. ---------------------------------------
  // Gated behind `minWave` so they never dilute the early pool. These exist to
  // give a strong, well-drafted run a genuine TAIL — before them every boon was
  // a one-time multiplier, so a great run and an average one diverged only in
  // where they started, never in how fast they grew.
  soul_harvest: {
    id: "soul_harvest",
    name: "Soul Harvest",
    rarity: "epic",
    minWave: 15,
    description: "Each kill grants +1% warband damage for the rest of the wave.",
    effects: [{ type: "killStack", dmgPct: 0.01 }],
  },
  warlords_horn: {
    id: "warlords_horn",
    name: "Warlord's Horn",
    rarity: "mythic",
    minWave: 20,
    unique: true,
    // Answers a genuine structural oddity: spellChargeUsed is per-BATTLE and an
    // endless run is one battle, so a 40-wave run otherwise got exactly one cast.
    description: "Your commander's battle spell recharges at the start of every wave.",
    effects: [{ type: "spellRecharge" }],
    offerIf: "hasSpell",
  },
  ascendant: {
    id: "ascendant",
    name: "Ascendant",
    rarity: "mythic",
    minWave: 25,
    // THE TAIL-MAKER. Every other boon raises the warband's LEVEL once; this
    // raises its RATE. Two copies lift per-wave player growth from roughly +11%
    // to +19%, which is worth many extra waves against a curve whose own rate
    // climbs — and it is still safely terminating, because a fixed per-wave gain
    // always loses in the end to a growth rate that keeps accelerating.
    description:
      "+12% max HP and damage now — and +2% more of each for every wave you clear afterward.",
    effects: [{ type: "ascendant", basePct: 0.12, perWavePct: 0.02 }],
  },
  phoenix_pact: {
    id: "phoenix_pact",
    name: "Phoenix Pact",
    rarity: "mythic",
    minWave: 25,
    unique: true,
    // Attacks the permanent-attrition problem: losing a unit at wave 25 otherwise
    // means fighting the steepest part of the curve at three-quarter strength.
    description: "The first ally to fall each wave returns at 35% HP when the wave ends.",
    effects: [{ type: "phoenix", hpPct: 0.35 }],
  },
  siege_train: {
    id: "siege_train",
    name: "Siege Train",
    rarity: "mythic",
    minWave: 30,
    unique: true,
    description:
      "+15% damage for every 30 seconds the current wave has lasted. Resets each wave.",
    effects: [{ type: "siege", pctPer30Sec: 0.15 }],
  },
};

/** Stable insertion order — the offer roller iterates this deterministically. */
export const ALL_BOON_IDS: string[] = Object.keys(BOONS);

/** A boon's card text for the wave it is about to apply on. The wave-scaled boons
 *  quote their live number here so the card can't promise "60 HP" when the
 *  controller is about to stamp 246. */
export function boonDescription(id: string, wave: number): string {
  const b = BOONS[id];
  if (!b) return "";
  return b.describe ? b.describe(wave) : b.description;
}

// -- Stack math (info panel) --------------------------------------------------
// What `count` copies of a boon amount to, as human-readable lines. The math
// mirrors EXACTLY how each effect folds in the EndlessController/CombatSystem:
// team multipliers and maxHp compound multiplicatively per copy; lifesteal,
// thorns, execute, heals and shields add; unique boons don't stack at all.

const asPct = (x: number): string => `${Math.round(x * 100)}%`;

/** Total gain of a per-copy multiplier applied `n` times: (1+v)^n - 1. */
const compounded = (v: number, n: number): number => Math.pow(1 + v, n) - 1;

export function boonStackSummary(
  id: string,
  count: number,
  wave = 1
): string[] {
  const boon = BOONS[id];
  if (!boon) return [];
  if (boon.unique) return ["Unique — one copy per run."];
  const lines: string[] = [];
  // The wave-scaled family reports its LIVE value at `wave` (see
  // endlessBoonDefenseScale) — a flat "60 HP shield" would be a lie by wave 40.
  const def = endlessBoonDefenseScale(wave);
  const off = endlessBoonOffenseScale(wave);
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
        lines.push(
          `${Math.round(eff.hpPerSec * count * def)} HP/sec regeneration in combat (scales with the wave)`
        );
        break;
      case "waveShield":
        lines.push(
          `${Math.round(eff.amount * count * def)} HP shield at each wave start (scales with the wave)`
        );
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
        lines.push(
          `${Math.round(eff.amount * count * def)} HP to the warband per kill (scales with the wave)`
        );
        break;
      case "bounty":
        lines.push(
          `+${(eff.pctOfMax * count * 100).toFixed(2)}% permanent max HP to the slayer per kill`
        );
        break;
      case "rangedLifesteal":
        lines.push(`${asPct(eff.frac * count)} ranged lifesteal`);
        break;
      case "onHitRider":
        lines.push(
          eff.damagePerTick != null
            ? `every ${nth(eff.everyNth)} attack: ${eff.effectType} for ${Math.round(
                eff.damagePerTick * count * off
              )} dmg/sec (${eff.durationSec}s, scales with the wave)`
            : `every ${nth(eff.everyNth)} attack: ${eff.effectType} (${eff.durationSec}s)`
        );
        break;
      case "waveSummon":
        lines.push(
          `${eff.count * count} compan${eff.count * count === 1 ? "ion" : "ions"} at each wave start`
        );
        break;
      // crit / overheal / lastBreath / rhythm / momentum are all `unique`, so the
      // early return above already handled them — but they must still be listed
      // for the switch to be exhaustive. NO `default` CASE ON PURPOSE: this
      // function is a hand-maintained mirror of how EndlessController folds each
      // effect, and a silent default is exactly how the two drift apart. Adding a
      // BoonEffect variant should be a compile error here.
      case "ascendant":
        lines.push(
          `+${asPct(compounded(eff.basePct, count))} max HP and damage banked`,
          `+${asPct(eff.perWavePct * count)} more of each per wave cleared`
        );
        break;
      case "killStack":
        lines.push(`+${asPct(eff.dmgPct * count)} damage per kill, resets each wave`);
        break;
      case "crit":
      case "overheal":
      case "lastBreath":
      case "rhythm":
      case "momentum":
      case "spellRecharge":
      case "phoenix":
      case "siege":
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

/** Rarity odds by wave — deeper runs weight harder toward rare/epic/mythic.
 *
 *  These used to FREEZE at wave 11: a wave-40 offer had exactly the same odds as
 *  a wave-11 one, so 45% of deep picks were still +10% commons while the horde's
 *  growth rate was accelerating. The player's rate of gain stopped improving at
 *  precisely the wave the enemy's started to. They now keep climbing, which is
 *  half of what gives a strong run its tail.
 *
 *  Anchored so wave 11 is unchanged (45/38/17) and nothing regresses below it. */
export function boonRarityWeights(wave: number): Record<BoonRarity, number> {
  if (wave < 6) return { common: 75, rare: 22, epic: 3, mythic: 0 };
  if (wave < 11) return { common: 60, rare: 30, epic: 10, mythic: 0 };
  // Anchored at wave 11 (over = 0 there), so the old freeze point keeps exactly
  // its old odds and nothing below it regresses.
  const over = wave - 11;
  const mythic = Math.min(22, Math.max(0, (wave - ENDLESS_MYTHIC_WAVE) * 0.8));
  const epic = Math.min(42, 17 + over * 0.75);
  // Rare's cap is aligned with epic's (both land at wave ~44). Letting rare keep
  // climbing after epic had capped stole share back from the deep tiers and made
  // the epic+mythic share dip slightly — the one thing this curve must not do.
  const rare = Math.min(43, 38 + over * 0.15);
  const nonCommon = mythic + epic + rare;
  // Commons never vanish entirely — a floor of COMMON_FLOOR keeps the small
  // steady picks in the pool. Squeeze the others PROPORTIONALLY to make room
  // rather than clamping common, so the four always total exactly 100 and the
  // deep-tier share stays monotonically increasing (clamping made it dip right
  // at the boundary, since the implied total drifted past 100).
  const COMMON_FLOOR = 8;
  if (nonCommon <= 100 - COMMON_FLOOR) {
    return { common: 100 - nonCommon, rare, epic, mythic };
  }
  const k = (100 - COMMON_FLOOR) / nonCommon;
  return {
    common: COMMON_FLOOR,
    rare: rare * k,
    epic: epic * k,
    mythic: mythic * k,
  };
}

function rollRarity(wave: number, rng: RNG): BoonRarity {
  const w = boonRarityWeights(wave);
  const total = w.common + w.rare + w.epic + w.mythic;
  let r = rng.next() * total;
  if (r < w.common) return "common";
  r -= w.common;
  if (r < w.rare) return "rare";
  r -= w.rare;
  if (r < w.epic) return "epic";
  return "mythic";
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
  owned: ReadonlySet<string> = new Set(),
  hasSpell = false
): string[] {
  const pool = ALL_BOON_IDS.filter((id) => {
    const b = BOONS[id];
    if (b.unique && owned.has(id)) return false;
    if ((b.minWave ?? 0) > wave) return false;
    // "allyDead" boons never come from the pool (the caller forces the slot);
    // "hasSpell" ones DO, but only when a spell is actually equipped.
    if (b.offerIf === "allyDead") return false;
    if (b.offerIf === "hasSpell") return hasSpell;
    return true;
  });
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
