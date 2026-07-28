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
// mechanic, epic = build-defining (may bundle two effects).
//
// EVERY BOON COMPLETES. A boon is bought in `maxStacks` RANKS, each buying an
// ascending share of the headline written on its card, and the copy that reaches
// 100% is the last one ever offered. Legendary and mythic go further: one boon of
// each tier per run, full stop. Both rules exist to make total player power
// BOUNDED, which is the only reason the wave curve in `endless.ts` can be gentle
// enough to keep deep-wave numbers readable and still guarantee every run ends.
// Read the curve preamble there before loosening anything here.
// ============================================================================

import { RNG } from "@/utils/rng";
import type { StatusEffectType } from "@/types";
import {
  BOUNTY_TOTAL_CAP_FRAC,
  ENDLESS_INTERMISSION_HEAL,
  endlessBoonDefenseScale,
  endlessBoonOffenseScale,
} from "./endless";

export type BoonRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

/** Wave from which legendary boons — the deep-run payoffs — start appearing at all.
 *  Individual boons gate themselves further with `minWave`.
 *
 *  Legendary and mythic are EXCLUSIVE SLOTS: a run may own one boon of each tier
 *  and no more, ever. Once one is taken its whole tier stops being offered — the
 *  weight is zeroed and redistributed, not merely filtered, or the offer roller's
 *  empty-candidates fallback would quietly hand the freed weight to a uniform
 *  draw over everything else (which could even deal out a mythic on a legendary
 *  roll). See boonSlotsUsed / boonRarityWeights. */
export const ENDLESS_LEGENDARY_WAVE = 20;

/** Wave from which MYTHIC boons can appear. The rarest tier in the game and the
 *  only one designed against a measured target rather than a feel: they exist to
 *  lift the odds of actually reaching ENDLESS_FINAL_WAVE by roughly ten
 *  percentage points (see NOTES 4j — the endlessSweep ceiling probe prints the
 *  reach odds these were tuned against). Deliberately late and deliberately thin
 *  in the offer table: a run that draws one should feel like it was chosen. */
export const ENDLESS_MYTHIC_WAVE = 35;

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
  // --- legendary / deep tier ---
  /** Ascendant: an immediate bump, plus MORE of it every wave cleared after. The
   *  only boon whose RATE improves rather than its level — see BOONS below.
   *
   *  `capPct` is the TOTAL the per-wave part may ever accrue, and it is not
   *  optional: an uncapped compounding rate is unbounded player growth, which no
   *  enemy curve gentle enough to keep numbers readable can ever out-run. Once the
   *  cap is reached the warband stops growing and the horde does not. */
  | { type: "ascendant"; basePct: number; perWavePct: number; capPct: number }
  /** Warlord's Horn: the commander's battle spell recharges every wave. */
  | { type: "spellRecharge" }
  /** Phoenix Pact / Undying Legion: fallen allies return when the wave ends.
   *  `all` raises EVERY corpse rather than one. */
  | { type: "phoenix"; hpPct: number; all?: boolean }
  /** Siege Train: outgoing damage climbs the longer the current wave lasts. */
  | { type: "siege"; pctPer30Sec: number }
  /** Soul Harvest: each kill adds outgoing damage for the rest of the wave. */
  | { type: "killStack"; dmgPct: number }
  // --- mythic ---
  /** Worldbreaker: every hit also tears out a fraction of the target's MAX HP.
   *  The one effect in the game that does NOT care how fat the horde has got —
   *  which is precisely why it moves the odds of reaching the final wave. */
  | { type: "maxHpRend"; frac: number };

export interface BoonDef {
  id: string;
  name: string;
  rarity: BoonRarity;
  /** Card text for a COMPLETED boon — every number here is the headline total,
   *  what you own once all `maxStacks` ranks are bought. The Book of Boons quotes
   *  this; an offer card quotes `describe` with the rank's own share instead. */
  description: string;
  /** Live card text for a given wave and a given share of the headline. `step` is
   *  the slice of the headline this card is talking about — the rank's own
   *  increment on an offer card, the whole thing (`FULL_STACK_STEP`) for a
   *  completed boon. Present on every boon carrying a number; `boonDescription`
   *  falls back to `description` otherwise. */
  describe?: (wave: number, step: BoonStackStep) => string;
  effects: BoonEffect[];
  /** Offer gate. "allyDead" boons are only offered when a warband unit is down
   *  (and never appear otherwise); "hasSpell" ones only when the commander
   *  actually has a battle spell equipped, since they'd be a dead card without. */
  offerIf?: "allyDead" | "hasSpell";
  /** One-time switches (booleans / overwrites in TeamMods): a second copy does
   *  nothing at all, so once owned the boon is excluded from future offers.
   *  Implies `maxStacks: 1`. */
  unique?: boolean;
  /** How many copies of this boon a run may own — its RANKS. Each rank buys a
   *  share of the headline (see STACK_SCHEDULES); the last one completes it at
   *  exactly 100% and the boon leaves the offer pool for good. Defaults to 1.
   *
   *  This cap is not a balance tweak, it is the load-bearing half of a proof: the
   *  wave curve only guarantees that runs END because total player power is
   *  BOUNDED. Every boon completes, every rate boon has a `capPct`, and after that
   *  a warband stops growing while the horde never does. Raising a cap (or adding
   *  an uncapped growth channel) re-opens the immortal-run hole — see NOTES 4l. */
  maxStacks?: number;
  /** Earliest wave this boon may be offered. THIS is the real gate for the deep
   *  tier — rarity only sets presentation and weighting. */
  minWave?: number;
}

/** What share of a boon's headline each rank has bought, cumulatively. The last
 *  entry is always exactly 1 — a completed boon is its headline, never more.
 *
 *  Increments ASCEND (25 / 35 / 40): the first copy is a down-payment and the one
 *  that completes it pays the most. That is the deliberate inverse of the usual
 *  diminishing-returns stack — repeat-picking is meant to read as committing to a
 *  build, not as scraping the barrel, and it makes a finished boon feel finished. */
const STACK_SCHEDULES: Record<number, readonly number[]> = {
  1: [1],
  2: [0.4, 1],
  3: [0.25, 0.6, 1],
};

/** Copies of this boon a run may own. `unique` is the old spelling of `1`. */
export function boonMaxStacks(boon: BoonDef): number {
  if (boon.unique) return 1;
  return boon.maxStacks ?? 1;
}

/** How many copies of `id` sit in a run's pick log. */
export function boonCopiesOwned(owned: Iterable<string>, id: string): number {
  let n = 0;
  for (const picked of owned) if (picked === id) n++;
  return n;
}

/** One rank's slice of a boon's headline: the share it adds (`frac`), and the
 *  cumulative shares either side of it — which integer-valued effects need, since
 *  they must be rounded from the running total or N ranks won't sum to N. */
export interface BoonStackStep {
  frac: number;
  cumBefore: number;
  cumAfter: number;
}

/** The whole headline in one slice — a completed boon, as the Book quotes it. */
export const FULL_STACK_STEP: BoonStackStep = {
  frac: 1,
  cumBefore: 0,
  cumAfter: 1,
};

/** An integer effect's contribution for one rank. Rounded off the CUMULATIVE
 *  total on both sides, so the ranks always sum to exactly `total` — rounding each
 *  increment on its own is how you end up with three wolves from a two-wolf boon. */
export const boonIntStep = (total: number, step: BoonStackStep): number =>
  Math.round(total * step.cumAfter) - Math.round(total * step.cumBefore);

/** One rank's share of the headline. `copyIndex` is 0-based: the copy about to be
 *  bought, given `copyIndex` are already owned.
 *
 *  Out-of-range copies pay the FULL headline. That case is reachable by exactly
 *  one boon — Second Chance, which the caller force-offers whenever an ally is
 *  down and which is deliberately repeatable: every revive is a whole revive. No
 *  pool boon can get here, because the offer filter drops it at `maxStacks`. */
export function boonStackStep(boon: BoonDef, copyIndex: number): BoonStackStep {
  const schedule = STACK_SCHEDULES[boonMaxStacks(boon)] ?? STACK_SCHEDULES[1];
  if (copyIndex < 0 || copyIndex >= schedule.length) return FULL_STACK_STEP;
  const cumBefore = copyIndex === 0 ? 0 : schedule[copyIndex - 1];
  const cumAfter = schedule[copyIndex];
  return { frac: cumAfter - cumBefore, cumBefore, cumAfter };
}

/** Cumulative share owned after `copies` picks (1 once complete). */
export function boonStackFraction(boon: BoonDef, copies: number): number {
  const schedule = STACK_SCHEDULES[boonMaxStacks(boon)] ?? STACK_SCHEDULES[1];
  if (copies <= 0) return 0;
  return schedule[Math.min(copies, schedule.length) - 1];
}

const asPct = (x: number): string => `${Math.round(x * 100)}%`;

/** Percent that keeps one decimal only when rounding would lie about it — rank
 *  increments land on numbers like 6.5% far more often than round ones. */
const pctFine = (x: number): string => {
  const v = x * 100;
  return Math.abs(v - Math.round(v)) < 0.05
    ? `${Math.round(v)}%`
    : `${v.toFixed(1)}%`;
};

/** Round a wave-scaled flat number for card text, never below 1 — a rank that
 *  reads "0 HP/sec" is worse than useless, it looks broken. */
const flat = (base: number, frac: number, scale: number): number =>
  Math.max(1, Math.round(base * frac * scale));

/** HEADLINE VALUES — a completed boon, all ranks bought. THE tuning surface.
 *
 *  Gathered here rather than inlined because they are retuned as a SET: they have
 *  to add up to a warband that the wave curve can still eventually out-grow, and
 *  the sweep measures the sum, not any one line. The first pass at this economy
 *  set them ~2.5x their old per-copy values and the ceiling probe was unambiguous
 *  — every seed, every power tier, even the deliberately-bad `first` drafting
 *  policy, ran to the harness cap without dying. A bounded warband still has to
 *  be bounded by a number the curve can pass.
 *
 *  Rule of thumb when retuning: a COMPLETE build is worth roughly e^4 combined
 *  (offence x defence) on top of meta progression, and the curve reaches that
 *  around wave 75. Move these and you move the median; re-run the ceiling probe.
 *  Each is spent over `maxStacks` ranks (25/35/40), so a first rank is a quarter
 *  of what you see here. */
const H = {
  hardy: 0.12,
  sharpened: 0.12,
  quickened: 0.12,
  fleetfoot: 0.12,
  stoneskin: 0.1,
  fieldMedicine: 0.18,
  mendingAura: 4,
  bulwark: 75,
  vampirism: 0.1,
  warBanner: 0.24,
  juggernaut: 0.24,
  marksmans: 0.1,
  venom: 6,
  bloodfeast: 15,
  thornmail: 0.22,
  recklessDmg: 0.34,
  recklessTax: 0.17,
  kennel: 2,
  titansHp: 0.34,
  titansDmg: 0.12,
  bloodlustSpeed: 0.24,
  bloodlustLifesteal: 0.12,
  aegis: 0.22,
  overwhelm: 0.4,
  executioner: 0.45,
  bounty: 0.0018,
  warMachine: 2,
  soulHarvest: 0.012,
} as const;

export const BOONS: Record<string, BoonDef> = {
  // -- Common: one small stat bump each. -----------------------------------
  // Every number below is a COMPLETED boon — three ranks of Hardy is +12% max HP,
  // and there is no fourth. That is the same figure the old single copy gave, but
  // where the old one was +10% PER COPY FOREVER, this one is the whole account.
  hardy: {
    id: "hardy",
    name: "Hardy",
    rarity: "common",
    maxStacks: 3,
    description: `+${asPct(H.hardy)} max HP to the whole warband (and heal the gain).`,
    describe: (_w, s) =>
      `+${pctFine(H.hardy * s.frac)} max HP to the whole warband (and heal the gain).`,
    effects: [{ type: "maxHp", pct: H.hardy }],
  },
  sharpened: {
    id: "sharpened",
    name: "Sharpened Steel",
    rarity: "common",
    maxStacks: 3,
    description: `+${asPct(H.sharpened)} attack damage to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.sharpened * s.frac)} attack damage to the whole warband.`,
    effects: [{ type: "teamMod", field: "dmgMult", value: H.sharpened }],
  },
  quickened: {
    id: "quickened",
    name: "Quickened",
    rarity: "common",
    maxStacks: 3,
    description: `+${asPct(H.quickened)} attack speed to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.quickened * s.frac)} attack speed to the whole warband.`,
    effects: [{ type: "teamMod", field: "atkDelayMult", value: H.quickened }],
  },
  fleetfoot: {
    id: "fleetfoot",
    name: "Fleetfoot",
    rarity: "common",
    maxStacks: 3,
    description: `+${asPct(H.fleetfoot)} move speed to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.fleetfoot * s.frac)} move speed to the whole warband.`,
    effects: [{ type: "teamMod", field: "moveSpeedMult", value: H.fleetfoot }],
  },
  stoneskin: {
    id: "stoneskin",
    name: "Stoneskin",
    rarity: "common",
    maxStacks: 3,
    description: `The warband takes ${asPct(H.stoneskin)} less damage.`,
    describe: (_w, s) => `The warband takes ${pctFine(H.stoneskin * s.frac)} less damage.`,
    effects: [{ type: "teamMod", field: "damageTakenMult", value: H.stoneskin }],
  },
  field_medicine: {
    id: "field_medicine",
    name: "Field Medicine",
    rarity: "common",
    maxStacks: 3,
    description: `Heal an extra ${asPct(H.fieldMedicine)} of missing HP between waves.`,
    describe: (_w, s) =>
      `Heal an extra ${pctFine(H.fieldMedicine * s.frac)} of missing HP between waves.`,
    effects: [{ type: "intermissionHeal", addPct: H.fieldMedicine }],
  },
  mending_aura: {
    id: "mending_aura",
    name: "Mending Aura",
    rarity: "common",
    maxStacks: 3,
    description: `The warband regenerates ${H.mendingAura} HP/sec in combat.`,
    describe: (w, s) =>
      `The warband regenerates ${flat(H.mendingAura, s.frac, endlessBoonDefenseScale(w))} HP/sec in combat.`,
    effects: [{ type: "regen", hpPerSec: H.mendingAura }],
  },

  // -- Rare: one meaningful mechanic each. ---------------------------------
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    rarity: "rare",
    maxStacks: 3,
    description: `The warband starts each wave with a ${H.bulwark} HP shield.`,
    describe: (w, s) =>
      `The warband starts each wave with a ${flat(H.bulwark, s.frac, endlessBoonDefenseScale(w))} HP shield.`,
    effects: [{ type: "waveShield", amount: H.bulwark }],
  },
  vampirism: {
    id: "vampirism",
    name: "Vampirism",
    rarity: "rare",
    maxStacks: 3,
    description: `Melee attacks heal for ${asPct(H.vampirism)} of the damage dealt.`,
    describe: (_w, s) =>
      `Melee attacks heal for ${pctFine(H.vampirism * s.frac)} of the damage dealt.`,
    effects: [{ type: "teamMod", field: "lifestealBonus", value: H.vampirism }],
  },
  war_banner: {
    id: "war_banner",
    name: "War Banner",
    rarity: "rare",
    maxStacks: 3,
    description: `+${asPct(H.warBanner)} attack damage to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.warBanner * s.frac)} attack damage to the whole warband.`,
    effects: [{ type: "teamMod", field: "dmgMult", value: H.warBanner }],
  },
  juggernaut: {
    id: "juggernaut",
    name: "Juggernaut",
    rarity: "rare",
    maxStacks: 3,
    description: `+${asPct(H.juggernaut)} max HP to the whole warband (and heal the gain).`,
    describe: (_w, s) =>
      `+${pctFine(H.juggernaut * s.frac)} max HP to the whole warband (and heal the gain).`,
    effects: [{ type: "maxHp", pct: H.juggernaut }],
  },
  second_chance: {
    id: "second_chance",
    name: "Second Chance",
    rarity: "rare",
    // The one boon with no rank cap, and it needs none: it is never in the offer
    // pool (the caller forces the slot whenever an ally is down) and it buys no
    // permanent power, only a body back. Every copy is a whole revive.
    description: "Revive a fallen ally at 50% HP.",
    effects: [{ type: "revive", hpPct: 0.5 }],
    offerIf: "allyDead",
  },

  // -- Epic: build-defining (may bundle two effects). ----------------------
  titans_blood: {
    id: "titans_blood",
    name: "Titan's Blood",
    rarity: "epic",
    maxStacks: 2,
    description: `+${asPct(H.titansHp)} max HP and +${asPct(H.titansDmg)} damage to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.titansHp * s.frac)} max HP and +${pctFine(H.titansDmg * s.frac)} damage to the whole warband.`,
    effects: [
      { type: "maxHp", pct: H.titansHp },
      { type: "teamMod", field: "dmgMult", value: H.titansDmg },
    ],
  },
  bloodlust: {
    id: "bloodlust",
    name: "Bloodlust",
    rarity: "epic",
    maxStacks: 2,
    description: `+${asPct(H.bloodlustSpeed)} attack speed and ${asPct(H.bloodlustLifesteal)} melee lifesteal.`,
    describe: (_w, s) =>
      `+${pctFine(H.bloodlustSpeed * s.frac)} attack speed and ${pctFine(H.bloodlustLifesteal * s.frac)} melee lifesteal.`,
    effects: [
      { type: "teamMod", field: "atkDelayMult", value: H.bloodlustSpeed },
      { type: "teamMod", field: "lifestealBonus", value: H.bloodlustLifesteal },
    ],
  },
  aegis: {
    id: "aegis",
    name: "Aegis",
    rarity: "epic",
    maxStacks: 2,
    description: `The warband takes ${asPct(H.aegis)} less damage.`,
    describe: (_w, s) => `The warband takes ${pctFine(H.aegis * s.frac)} less damage.`,
    effects: [{ type: "teamMod", field: "damageTakenMult", value: H.aegis }],
  },
  overwhelm: {
    id: "overwhelm",
    name: "Overwhelm",
    rarity: "epic",
    maxStacks: 2,
    description: `+${asPct(H.overwhelm)} attack damage to the whole warband.`,
    describe: (_w, s) =>
      `+${pctFine(H.overwhelm * s.frac)} attack damage to the whole warband.`,
    effects: [{ type: "teamMod", field: "dmgMult", value: H.overwhelm }],
  },

  // -- Slice 2: proc / mechanic boons (build-defining). --------------------
  // Rare — one mechanic each.
  marksmans_focus: {
    id: "marksmans_focus",
    name: "Marksman's Focus",
    rarity: "rare",
    maxStacks: 3,
    description: `Ranged attacks heal for ${asPct(H.marksmans)} of the damage dealt.`,
    describe: (_w, s) =>
      `Ranged attacks heal for ${pctFine(H.marksmans * s.frac)} of the damage dealt.`,
    effects: [{ type: "rangedLifesteal", frac: H.marksmans }],
  },
  venom_coating: {
    id: "venom_coating",
    name: "Venom Coating",
    rarity: "rare",
    maxStacks: 2,
    description: `Every 2nd attack poisons the target (${H.venom} dmg/sec for 4s).`,
    describe: (w, s) =>
      `Every 2nd attack poisons the target (${flat(H.venom, s.frac, endlessBoonOffenseScale(w))} dmg/sec for 4s).`,
    effects: [
      {
        type: "onHitRider",
        effectType: "poison",
        everyNth: 2,
        durationSec: 4,
        damagePerTick: H.venom,
        tickIntervalSec: 1,
      },
    ],
  },
  bloodfeast: {
    id: "bloodfeast",
    name: "Bloodfeast",
    rarity: "rare",
    maxStacks: 3,
    description: `Each kill heals the whole warband for ${H.bloodfeast} HP.`,
    describe: (w, s) =>
      `Each kill heals the whole warband for ${flat(H.bloodfeast, s.frac, endlessBoonDefenseScale(w))} HP.`,
    effects: [{ type: "killHeal", amount: H.bloodfeast }],
  },
  thornmail: {
    id: "thornmail",
    name: "Thornmail",
    rarity: "rare",
    maxStacks: 2,
    description: `Reflect ${asPct(H.thornmail)} of the damage your warband takes back at attackers.`,
    describe: (_w, s) =>
      `Reflect ${pctFine(H.thornmail * s.frac)} of the damage your warband takes back at attackers.`,
    effects: [{ type: "thorns", frac: H.thornmail }],
  },
  reckless: {
    id: "reckless",
    name: "Reckless",
    rarity: "rare",
    maxStacks: 2,
    description: `+${asPct(H.recklessDmg)} damage, but your warband takes ${asPct(H.recklessTax)} more damage.`,
    describe: (_w, s) =>
      `+${pctFine(H.recklessDmg * s.frac)} damage, but your warband takes ${pctFine(H.recklessTax * s.frac)} more damage.`,
    effects: [
      { type: "teamMod", field: "dmgMult", value: H.recklessDmg },
      { type: "teamMod", field: "damageTakenMult", value: -H.recklessTax },
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
    maxStacks: 2,
    description: `Start each wave with ${H.kennel} spirit wolves at your side.`,
    describe: (_w, s) => {
      const n = boonIntStep(H.kennel, s);
      return `Start each wave with ${n === 1 ? "a spirit wolf" : `${n} spirit wolves`} at your side.`;
    },
    effects: [{ type: "waveSummon", defId: "wolf", count: H.kennel }],
  },

  // Epic — build payoffs.
  thunderclap: {
    id: "thunderclap",
    name: "Thunderclap",
    rarity: "epic",
    // everyNth is an integer cadence with nothing sensible between 5 and 4, so
    // this is one rank and done rather than a fractional rank of a stun.
    unique: true,
    description: "Every 5th attack stuns the target.",
    effects: [
      { type: "onHitRider", effectType: "stun", everyNth: 5, durationSec: 0.6 },
    ],
  },
  executioner: {
    id: "executioner",
    name: "Executioner",
    rarity: "epic",
    maxStacks: 2,
    description: `+${asPct(H.executioner)} damage to enemies below ${asPct(EXECUTE_THRESHOLD)} HP.`,
    describe: (_w, s) =>
      `+${pctFine(H.executioner * s.frac)} damage to enemies below ${asPct(EXECUTE_THRESHOLD)} HP.`,
    effects: [{ type: "execute", bonus: H.executioner }],
  },
  bounty_hunter: {
    id: "bounty_hunter",
    name: "Bounty Hunter",
    rarity: "epic",
    maxStacks: 2,
    description: "Each kill permanently grows the slayer's max HP.",
    effects: [{ type: "bounty", pctOfMax: H.bounty }],
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
    maxStacks: 2,
    description: `Deploy ${H.warMachine} automated turrets at the start of each wave.`,
    describe: (_w, s) => {
      const n = boonIntStep(H.warMachine, s);
      return `Deploy ${n === 1 ? "an automated turret" : `${n} automated turrets`} at the start of each wave.`;
    },
    effects: [{ type: "waveSummon", defId: "turret", count: H.warMachine }],
  },

  // -- Legendary: the deep-run payoffs. ---------------------------------------
  // Gated behind `minWave` so they never dilute the early pool. These exist to
  // give a strong, well-drafted run a genuine TAIL — before them every boon was
  // a one-time multiplier, so a great run and an average one diverged only in
  // where they started, never in how fast they grew.
  //
  // ONE PER RUN, EVER. Taking any legendary closes the tier for the rest of the
  // run (and the same goes for mythic, separately) — see boonSlotsUsed. So this
  // is not "which legendaries did I collect", it is a single irreversible choice
  // between a recharging spell, a growth rate, a body back, and a damage ramp.
  // Every one of them is `unique` or capped for the reason spelled out on
  // Ascendant: the curve can only stay gentle if player power stops somewhere.
  soul_harvest: {
    id: "soul_harvest",
    name: "Soul Harvest",
    rarity: "epic",
    minWave: 15,
    maxStacks: 2,
    description: `Each kill grants +${pctFine(H.soulHarvest)} warband damage for the rest of the wave.`,
    describe: (_w, s) =>
      `Each kill grants +${pctFine(H.soulHarvest * s.frac)} warband damage for the rest of the wave.`,
    effects: [{ type: "killStack", dmgPct: H.soulHarvest }],
  },
  warlords_horn: {
    id: "warlords_horn",
    name: "Warlord's Horn",
    rarity: "legendary",
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
    rarity: "legendary",
    minWave: 25,
    // THE TAIL-MAKER. Every other boon raises the warband's LEVEL once; this
    // raises its RATE, and a rate is worth many extra waves.
    //
    // `capPct` is what keeps that honest. A rate that ran forever would eventually
    // beat any curve flat enough to keep wave-100 numbers readable — that is not a
    // tuning opinion, it is arithmetic, and it is what produced the immortal runs
    // this mode has twice had to dig itself out of. Thirty waves of growth, then
    // you have what you have.
    description:
      "+12% max HP and damage now — and +2% more of each per wave cleared, up to +35%.",
    effects: [
      { type: "ascendant", basePct: 0.12, perWavePct: 0.02, capPct: 0.35 },
    ],
  },
  phoenix_pact: {
    id: "phoenix_pact",
    name: "Phoenix Pact",
    rarity: "legendary",
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
    rarity: "legendary",
    minWave: 30,
    unique: true,
    description:
      "+15% damage for every 30 seconds the current wave has lasted. Resets each wave.",
    effects: [{ type: "siege", pctPer30Sec: 0.15 }],
  },

  // -- Mythic: the rarest tier, tuned against a measured target. -----------
  // ONE PER RUN, EVER, on its own slot separate from legendary's — so a complete
  // deep build is exactly one of these plus exactly one legendary.
  //
  // These exist to lift the odds of actually REACHING wave 100 by roughly ten
  // percentage points, and each attacks a different reason deep runs end:
  // Apotheosis outgrows the curve, Undying Legion refuses to lose bodies to it,
  // Worldbreaker ignores how fat it has made the horde. Their numbers were
  // sweep-calibrated, not eyeballed — see NOTES 4j.
  apotheosis: {
    id: "apotheosis",
    name: "Apotheosis",
    rarity: "mythic",
    minWave: ENDLESS_MYTHIC_WAVE,
    // Ascendant's big sibling: the same rate mechanic, twice the slope and two
    // and a half times the ceiling. Since the run's ending wave is governed by the
    // NET growth rate, a rate boon is the single most efficient way to buy depth —
    // and since one legendary and one mythic is the whole allowance, owning this
    // AND Ascendant is the deepest a warband can ever grow.
    description:
      "+18% max HP and damage now — and +4.2% more of each per wave cleared, up to +80%.",
    effects: [
      { type: "ascendant", basePct: 0.18, perWavePct: 0.042, capPct: 0.8 },
    ],
  },
  undying_legion: {
    id: "undying_legion",
    name: "Undying Legion",
    rarity: "mythic",
    minWave: 40,
    unique: true,
    // Attrition is what actually ends most deep runs: you lose one unit at wave
    // 60 and fight the rest at three-quarter strength. This ends that entirely.
    description: "Every fallen ally rises again at the end of each wave.",
    effects: [{ type: "phoenix", hpPct: 0.5, all: true }],
  },
  worldbreaker: {
    id: "worldbreaker",
    name: "Worldbreaker",
    rarity: "mythic",
    minWave: 45,
    unique: true,
    // The answer to HP sponges. Every other damage boon is a multiplier on YOUR
    // numbers and so loses to an exponential; this one scales with the ENEMY, so
    // a wave-90 monster takes the same number of hits as a wave-9 one. It is also
    // the direct cure for the stall-clock deaths that end late runs.
    description: "Every hit also rends 2% of the target's maximum health.",
    effects: [{ type: "maxHpRend", frac: 0.02 }],
  },
};

/** Stable insertion order — the offer roller iterates this deterministically. */
export const ALL_BOON_IDS: string[] = Object.keys(BOONS);

/** A boon's card text for the wave it is about to apply on, and for the slice of
 *  its headline being talked about. The wave-scaled boons quote their live number
 *  here so the card can't promise "155 HP" when the controller is about to stamp
 *  620; passing the rank's own `step` likewise stops an offer card quoting the
 *  completed boon when this pick only buys a quarter of it.
 *
 *  Defaults to the whole headline, which is what the Book of Boons wants. */
export function boonDescription(
  id: string,
  wave: number,
  step: BoonStackStep = FULL_STACK_STEP
): string {
  const b = BOONS[id];
  if (!b) return "";
  return b.describe ? b.describe(wave, step) : b.description;
}

/** Roman rank numeral for the boon chips and offer cards (ranks never exceed 3). */
export function boonRankLabel(rank: number): string {
  return ["I", "II", "III", "IV", "V"][rank - 1] ?? String(rank);
}

// -- Stack math (info panel) --------------------------------------------------
// What `count` ranks of a boon amount to, as human-readable lines. The math
// mirrors EXACTLY how each effect folds in the EndlessController/CombatSystem:
// team multipliers and maxHp compound multiplicatively per rank; lifesteal,
// thorns, execute, heals and shields add. Ranks buy SHARES of the headline
// (STACK_SCHEDULES), so a completed boon reads exactly as its card does.

/** What `count` ranks of a multiplicative effect actually fold to. Deliberately
 *  not (1+v)^n: the controller folds each rank's own share separately, and this
 *  panel exists to mirror the controller rather than to idealise it. */
function foldedGain(value: number, boon: BoonDef, count: number): number {
  let mult = 1;
  for (let i = 0; i < count; i++) mult *= 1 + value * boonStackStep(boon, i).frac;
  return mult - 1;
}

/** Same, for the fields that fold DOWNWARD (damage taken): total reduction. */
function foldedReduction(value: number, boon: BoonDef, count: number): number {
  let mult = 1;
  for (let i = 0; i < count; i++) mult *= 1 - value * boonStackStep(boon, i).frac;
  return 1 - mult;
}

export function boonStackSummary(
  id: string,
  count: number,
  wave = 1
): string[] {
  const boon = BOONS[id];
  if (!boon) return [];
  const maxStacks = boonMaxStacks(boon);
  const lines: string[] = [];
  // Rank status first — under a stack-to-cap economy "how much of this do I still
  // have to buy" is the question the panel is opened to answer.
  if (boon.offerIf === "allyDead") {
    lines.push(count === 1 ? "Taken once." : `Taken ${count} times.`);
  } else if (maxStacks === 1) {
    lines.push("One per run.");
  } else if (count >= maxStacks) {
    lines.push(`Complete — rank ${boonRankLabel(maxStacks)} of ${boonRankLabel(maxStacks)}.`);
  } else {
    lines.push(
      `Rank ${boonRankLabel(count)} of ${boonRankLabel(maxStacks)} — ${
        maxStacks - count === 1 ? "one more copy completes it" : `${maxStacks - count} more copies complete it`
      }.`
    );
  }
  // Everything below is the CUMULATIVE total owned, not one rank's share.
  const frac = boonStackFraction(boon, count);
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
            lines.push(`+${asPct(foldedGain(v, boon, count))} attack damage`);
            break;
          case "atkDelayMult":
            lines.push(`+${asPct(foldedGain(v, boon, count))} attack speed`);
            break;
          case "moveSpeedMult":
            lines.push(`+${asPct(foldedGain(v, boon, count))} move speed`);
            break;
          case "damageTakenMult":
            // Positive = reduction (folds down); negative = Reckless's tax
            // (folds up).
            lines.push(
              v >= 0
                ? `−${asPct(foldedReduction(v, boon, count))} damage taken`
                : `+${asPct(foldedGain(-v, boon, count))} damage taken`
            );
            break;
          case "lifestealBonus":
            lines.push(`${asPct(v * frac)} melee lifesteal`);
            break;
        }
        break;
      }
      case "maxHp":
        lines.push(`+${asPct(foldedGain(eff.pct, boon, count))} max HP`);
        break;
      case "intermissionHeal":
        lines.push(
          `heal ${asPct(
            Math.min(0.9, ENDLESS_INTERMISSION_HEAL + eff.addPct * frac)
          )} of missing HP between waves`
        );
        break;
      case "regen":
        lines.push(
          `${flat(eff.hpPerSec, frac, def)} HP/sec regeneration in combat (scales with the wave)`
        );
        break;
      case "waveShield":
        lines.push(
          `${flat(eff.amount, frac, def)} HP shield at each wave start (scales with the wave)`
        );
        break;
      case "revive":
        lines.push(`revived ${count === 1 ? "an ally" : `${count} allies`} at ${asPct(eff.hpPct)} HP`);
        break;
      case "execute":
        lines.push(
          `+${asPct(eff.bonus * frac)} damage vs enemies below ${asPct(EXECUTE_THRESHOLD)} HP`
        );
        break;
      case "thorns":
        lines.push(`reflect ${asPct(eff.frac * frac)} of damage taken`);
        break;
      case "killHeal":
        lines.push(
          `${flat(eff.amount, frac, def)} HP to the warband per kill (scales with the wave)`
        );
        break;
      case "bounty":
        lines.push(
          `+${(eff.pctOfMax * frac * 100).toFixed(2)}% permanent max HP to the slayer per kill`,
          `capped at +${asPct(BOUNTY_TOTAL_CAP_FRAC)} max HP over the whole run`
        );
        break;
      case "rangedLifesteal":
        lines.push(`${asPct(eff.frac * frac)} ranged lifesteal`);
        break;
      case "onHitRider":
        lines.push(
          eff.damagePerTick != null
            ? `every ${nth(eff.everyNth)} attack: ${eff.effectType} for ${flat(
                eff.damagePerTick,
                frac,
                off
              )} dmg/sec (${eff.durationSec}s, scales with the wave)`
            : `every ${nth(eff.everyNth)} attack: ${eff.effectType} (${eff.durationSec}s)`
        );
        break;
      case "waveSummon": {
        const n = Math.round(eff.count * frac);
        lines.push(`${n} compan${n === 1 ? "ion" : "ions"} at each wave start`);
        break;
      }
      // crit / overheal / lastBreath / rhythm / momentum are all `unique`, so the
      // early return above already handled them — but they must still be listed
      // for the switch to be exhaustive. NO `default` CASE ON PURPOSE: this
      // function is a hand-maintained mirror of how EndlessController folds each
      // effect, and a silent default is exactly how the two drift apart. Adding a
      // BoonEffect variant should be a compile error here.
      case "ascendant":
        lines.push(
          `+${asPct(foldedGain(eff.basePct, boon, count))} max HP and damage banked`,
          `+${asPct(eff.perWavePct * frac)} more of each per wave cleared`,
          `growth stops at +${asPct(eff.capPct * frac)}`
        );
        break;
      case "killStack":
        lines.push(`+${asPct(eff.dmgPct * frac)} damage per kill, resets each wave`);
        break;
      case "maxHpRend":
        lines.push(
          `every hit rends ${asPct(eff.frac * frac)} of the target's max HP`
        );
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

/** Rarity odds by wave — deeper runs weight harder toward rare/epic/legendary.
 *
 *  These used to FREEZE at wave 11: a wave-40 offer had exactly the same odds as
 *  a wave-11 one, so 45% of deep picks were still +10% commons while the horde's
 *  growth rate was accelerating. The player's rate of gain stopped improving at
 *  precisely the wave the enemy's started to. They now keep climbing, which is
 *  half of what gives a strong run its tail.
 *
 *  Anchored so wave 11 is unchanged (45/38/17) and nothing regresses below it. */
export function boonRarityWeights(
  wave: number,
  closed?: TierSlots
): Record<BoonRarity, number> {
  const w = baseRarityWeights(wave);
  if (!closed || (!closed.legendary && !closed.mythic)) return w;
  // A spent slot's weight must be REDISTRIBUTED, not just skipped. Merely
  // filtering the pool would leave the weight in the table, where every roll that
  // landed on the dead tier fell through to rollBoonOffers' empty-candidates
  // fallback — a flat draw over the whole pool that ignores the rarity curve
  // entirely and can even deal a mythic on a legendary roll.
  if (closed.legendary) w.legendary = 0;
  if (closed.mythic) w.mythic = 0;
  const subtotal = w.common + w.rare + w.epic + w.legendary + w.mythic;
  // common/rare/epic are never all zero at any wave, so this can't divide by 0.
  const k = 100 / subtotal;
  return {
    common: w.common * k,
    rare: w.rare * k,
    epic: w.epic * k,
    legendary: w.legendary * k,
    mythic: w.mythic * k,
  };
}

function baseRarityWeights(wave: number): Record<BoonRarity, number> {
  if (wave < 6) {
    return { common: 75, rare: 22, epic: 3, legendary: 0, mythic: 0 };
  }
  if (wave < 11) {
    return { common: 60, rare: 30, epic: 10, legendary: 0, mythic: 0 };
  }
  // Anchored at wave 11 (over = 0 there), so the old freeze point keeps exactly
  // its old odds and nothing below it regresses.
  const over = wave - 11;
  const legendary = Math.min(22, Math.max(0, (wave - ENDLESS_LEGENDARY_WAVE) * 0.8));
  // Mythic starts later and climbs slower than anything else, and caps low — it
  // is meant to be the tier you remember drawing, not one you plan around.
  const mythic = Math.min(12, Math.max(0, (wave - ENDLESS_MYTHIC_WAVE) * 0.55));
  const epic = Math.min(42, 17 + over * 0.75);
  // Rare's cap is aligned with epic's (both land at wave ~44). Letting rare keep
  // climbing after epic had capped stole share back from the deep tiers and made
  // the deep share dip slightly — the one thing this curve must not do.
  const rare = Math.min(43, 38 + over * 0.15);
  const nonCommon = mythic + legendary + epic + rare;
  // Commons never vanish entirely — a floor of COMMON_FLOOR keeps the small
  // steady picks in the pool. Squeeze the others PROPORTIONALLY to make room
  // rather than clamping common, so the five always total exactly 100 and the
  // deep-tier share stays monotonically increasing (clamping made it dip right
  // at the boundary, since the implied total drifted past 100).
  const COMMON_FLOOR = 8;
  if (nonCommon <= 100 - COMMON_FLOOR) {
    return { common: 100 - nonCommon, rare, epic, legendary, mythic };
  }
  const k = (100 - COMMON_FLOOR) / nonCommon;
  return {
    common: COMMON_FLOOR,
    rare: rare * k,
    epic: epic * k,
    legendary: legendary * k,
    mythic: mythic * k,
  };
}

function rollRarity(wave: number, rng: RNG, closed?: TierSlots): BoonRarity {
  const w = boonRarityWeights(wave, closed);
  const total = w.common + w.rare + w.epic + w.legendary + w.mythic;
  let r = rng.next() * total;
  if (r < w.common) return "common";
  r -= w.common;
  if (r < w.rare) return "rare";
  r -= w.rare;
  if (r < w.epic) return "epic";
  r -= w.epic;
  if (r < w.legendary) return "legendary";
  return "mythic";
}

/** Which exclusive tier slots a run has already spent. Derived from the pick log
 *  rather than latched, so it stays a pure function of the run's inputs — the
 *  same property that lets a run be replayed from (seed, ordered actions). */
export interface TierSlots {
  legendary: boolean;
  mythic: boolean;
}

export function boonSlotsUsed(owned: Iterable<string>): TierSlots {
  const slots: TierSlots = { legendary: false, mythic: false };
  for (const id of owned) {
    const rarity = BOONS[id]?.rarity;
    if (rarity === "legendary") slots.legendary = true;
    else if (rarity === "mythic") slots.mythic = true;
  }
  return slots;
}

/**
 * The three boon ids offered after clearing `wave`. Fully seeded from `rng`
 * (never Math.random) so an offer sequence is replayable. Slots are distinct.
 * When a warband unit is dead the third slot is forced to the revive boon; when
 * none is dead, offer-gated boons are excluded entirely.
 *
 * `owned` is the run's ORDERED pick log, not a set: ranks are counted from it, so
 * a boon leaves the pool once its `maxStacks` copies are bought (and a spent
 * legendary/mythic slot closes its whole tier). Two independent exclusions, and
 * both are also applied to the rarity WEIGHTS in boonRarityWeights — the pool
 * filter alone would leak the dead tier's weight into the fallback draw below.
 *
 * A very deep run can genuinely exhaust this pool — every boon completed is the
 * intended terminal state of a bounded economy, not a bug — in which case fewer
 * than `slots` offers come back and the intermission is a heal-and-move-on. The
 * UI has an empty state for exactly this.
 */
export function rollBoonOffers(
  wave: number,
  rng: RNG,
  hasDead: boolean,
  owned: readonly string[] = [],
  hasSpell = false
): string[] {
  const closed = boonSlotsUsed(owned);
  const pool = ALL_BOON_IDS.filter((id) => {
    const b = BOONS[id];
    if (boonCopiesOwned(owned, id) >= boonMaxStacks(b)) return false;
    if (b.rarity === "legendary" && closed.legendary) return false;
    if (b.rarity === "mythic" && closed.mythic) return false;
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
    const rarity = rollRarity(wave, rng, closed);
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
