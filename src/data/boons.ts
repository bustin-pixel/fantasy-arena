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
// boon can be offered again.
// ============================================================================

import { RNG } from "@/utils/rng";

export type BoonRarity = "common" | "rare" | "epic";

/** SimState.teamMods fields a boon can move. `value` is always the buff MAGNITUDE
 *  (a positive fraction); the controller knows the correct fold per field (e.g.
 *  attack-speed shrinks the delay, damage-reduction shrinks the taken-mult). */
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
  | { type: "revive"; hpPct: number };

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
};

/** Stable insertion order — the offer roller iterates this deterministically. */
export const ALL_BOON_IDS: string[] = Object.keys(BOONS);

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
 * none is dead, offer-gated boons are excluded entirely.
 */
export function rollBoonOffers(wave: number, rng: RNG, hasDead: boolean): string[] {
  const pool = ALL_BOON_IDS.filter((id) => BOONS[id].offerIf == null);
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
