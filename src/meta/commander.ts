// ============================================================================
// Commander data — every tunable number for the Commander (the player's own
// account-wide progression) lives here. Pure data + pure math: imports nothing
// (like leveling.ts / slayer.ts), so persistence, the engine wiring, and the
// UI can all read it without cycles.
//
// The Commander sits ABOVE the deck: battles feed one account-wide XP pool,
// each level grants a talent point, and points spent in the three archetype
// branches (Warlord / Guardian / Arcanist) resolve to a CommanderMods object —
// a deterministic match input (MatchOptions.commanderMods) folded onto
// state.teamMods.player at construction, exactly like slayerBonuses.
// LEVEL IS ALWAYS DERIVED from commanderXp — never stored (the unitXp rule).
// ============================================================================

export const COMMANDER_LEVEL_CAP = 20;

/** XP to go from level L to L+1 costs 100×L, so the cumulative total to REACH
 *  level L is 50·(L−1)·L. Waypoints: Lv 5 = 1,000, Lv 10 = 4,500, Lv 20 (the
 *  cap) = 19,000. The pool is fed the same per-battle XP the deck earns
 *  (rewards.xp — see battleGrant), so maxing the Commander lands on roughly
 *  the same horizon as maxing a unit: a long, steady account chase. */
export function totalCommanderXpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export const COMMANDER_XP_CAP = totalCommanderXpForLevel(COMMANDER_LEVEL_CAP); // 19,000

/** Commander level for a total-XP amount, clamped to [1, cap]. */
export function commanderLevelFromXp(totalXp: number): number {
  let level = 1;
  while (
    level < COMMANDER_LEVEL_CAP &&
    totalXp >= totalCommanderXpForLevel(level + 1)
  ) {
    level++;
  }
  return level;
}

/** The shared clamp for the grant fold and the RewardPanel preview. */
export function addCommanderXp(total: number, gained: number): number {
  return Math.min(COMMANDER_XP_CAP, Math.max(0, total) + Math.max(0, gained));
}

/** XP progress within the current level (0 at a fresh level-up). */
export function commanderXpIntoLevel(totalXp: number): number {
  return Math.max(
    0,
    totalXp - totalCommanderXpForLevel(commanderLevelFromXp(totalXp))
  );
}

/** XP needed to fill the current level's bar, or null at the cap. */
export function commanderXpForNext(totalXp: number): number | null {
  const level = commanderLevelFromXp(totalXp);
  if (level >= COMMANDER_LEVEL_CAP) return null;
  return (
    totalCommanderXpForLevel(level + 1) - totalCommanderXpForLevel(level)
  );
}

/** Talent points: exactly one per level PAST 1 — a fresh commander has zero,
 *  the capped commander has 19. (Level 1 is the identity state, the same
 *  convention as unit levels.) */
export function talentPointsForLevel(level: number): number {
  return Math.max(0, Math.min(level, COMMANDER_LEVEL_CAP) - 1);
}

/** Gold fee to refund every spent point. Flat and cheap-ish on purpose —
 *  experimenting with routes should feel inviting, not punished. */
export const RESPEC_GOLD = 150;

// ---------------------------------------------------------------------------
// The talent tree — three archetype branches, ~5 tiers each, keystone at the
// bottom. A node is buyable when the points ALREADY SPENT in its branch reach
// its tier gate. Magnitudes stay in the item/level power band (a few % per
// rank) so the PvE tuning survives; keystones are transformative one-pointers.
// ---------------------------------------------------------------------------

export type BranchId = "warlord" | "guardian" | "arcanist";

export const BRANCHES: Record<
  BranchId,
  { label: string; blurb: string; color: string; spell: SpellId }
> = {
  warlord: {
    label: "Warlord",
    blurb: "Aggression — hit harder, faster, and finish what you start.",
    color: "#e05038",
    spell: "rally",
  },
  guardian: {
    label: "Guardian",
    blurb: "Protection — your warband endures what should kill it.",
    color: "#3f8ee0",
    spell: "bulwark",
  },
  arcanist: {
    label: "Arcanist",
    blurb: "Sorcery — quicken spells, empower summons, bend the fight.",
    color: "#9b5de0",
    spell: "arcane_storm",
  },
};

export const BRANCH_IDS: BranchId[] = ["warlord", "guardian", "arcanist"];

/** Points spent in a branch required before each tier's nodes unlock. */
export const TIER_GATES = [0, 2, 5, 8] as const;

/** Points-in-branch at which the branch's signature SPELL unlocks (equipping
 *  it is a separate choice — see spellsUnlocked / PlayerSave.equippedSpell). */
export const SPELL_UNLOCK_POINTS = 8;

/** A talent's mechanical effect, per rank — a serializable tag, not a closure,
 *  so the tree is pure data. MatchController translates the resolved totals
 *  onto TeamMods (resolveCommanderMods below does the folding math). */
export type TalentEffect =
  | { kind: "dmgMult"; perRank: number } // +frac outgoing damage
  | { kind: "atkDelayMult"; perRank: number } // −frac attack cooldown
  | { kind: "moveSpeedMult"; perRank: number } // +frac move speed
  | { kind: "damageTakenMult"; perRank: number } // −frac incoming damage
  | { kind: "lifestealBonus"; perRank: number } // +frac melee lifesteal
  | { kind: "executeBonus"; perRank: number } // +frac vs low-HP enemies
  | { kind: "killHeal"; perRank: number } // team HP per kill
  | { kind: "deployShieldFrac"; perRank: number } // shield on deploy, frac of max HP
  | { kind: "thornsFrac"; perRank: number } // reflect frac of incoming
  | { kind: "overheal" } // overheal banks as shield
  | { kind: "lastBreath" } // once-per-battle cheat death
  | { kind: "critEveryNth"; n: number } // every Nth attack ×2
  | { kind: "abilityCooldownMult"; perRank: number } // −frac ability cooldowns
  | { kind: "summonStatPct"; perRank: number } // +frac summon stats (additive)
  | { kind: "magicDmgMult"; perRank: number } // +frac magic-school damage
  | { kind: "rangedLifesteal"; perRank: number } // ranged basics lifesteal
  | { kind: "abilitiesStartReady" }; // abilities begin the battle ready

export interface TalentDef {
  id: string;
  branch: BranchId;
  /** Tier row (index into TIER_GATES). The keystone is the last tier. */
  tier: number;
  name: string;
  description: string;
  maxRanks: number;
  effect: TalentEffect;
  /** Keystones render big and cap the branch. */
  keystone?: boolean;
}

export const TALENTS: TalentDef[] = [
  // --- Warlord -------------------------------------------------------------
  {
    id: "sharpened_steel",
    branch: "warlord",
    tier: 0,
    name: "Sharpened Steel",
    description: "Your units deal +2% damage per rank.",
    maxRanks: 3,
    effect: { kind: "dmgMult", perRank: 0.02 },
  },
  {
    id: "drill_sergeant",
    branch: "warlord",
    tier: 0,
    name: "Drill Sergeant",
    description: "Your units attack 2% faster per rank.",
    maxRanks: 3,
    effect: { kind: "atkDelayMult", perRank: 0.02 },
  },
  {
    id: "forced_march",
    branch: "warlord",
    tier: 1,
    name: "Forced March",
    description: "Your units move +3% faster per rank.",
    maxRanks: 2,
    effect: { kind: "moveSpeedMult", perRank: 0.03 },
  },
  {
    id: "bloodlust",
    branch: "warlord",
    tier: 1,
    name: "Bloodlust",
    description: "Every enemy kill heals your whole warband 6 HP per rank.",
    maxRanks: 2,
    effect: { kind: "killHeal", perRank: 6 },
  },
  {
    id: "executioners_eye",
    branch: "warlord",
    tier: 2,
    name: "Executioner's Eye",
    description: "+6% damage per rank against enemies below 25% HP.",
    maxRanks: 2,
    effect: { kind: "executeBonus", perRank: 0.06 },
  },
  {
    id: "warpath",
    branch: "warlord",
    tier: 3,
    name: "Warpath",
    description: "Keystone: every 4th basic attack strikes for double damage.",
    maxRanks: 1,
    effect: { kind: "critEveryNth", n: 4 },
    keystone: true,
  },
  // --- Guardian ------------------------------------------------------------
  {
    id: "tempered_plate",
    branch: "guardian",
    tier: 0,
    name: "Tempered Plate",
    description: "Your units take −2% damage per rank.",
    maxRanks: 3,
    effect: { kind: "damageTakenMult", perRank: 0.02 },
  },
  {
    id: "blood_of_the_line",
    branch: "guardian",
    tier: 0,
    name: "Blood of the Line",
    description: "Your melee units heal for +2% of damage dealt per rank.",
    maxRanks: 2,
    effect: { kind: "lifestealBonus", perRank: 0.02 },
  },
  {
    id: "bulwark_training",
    branch: "guardian",
    tier: 1,
    name: "Bulwark Training",
    description:
      "Units you deploy arrive with a shield worth 5% of their max HP per rank.",
    maxRanks: 2,
    effect: { kind: "deployShieldFrac", perRank: 0.05 },
  },
  {
    id: "thorned_bulwarks",
    branch: "guardian",
    tier: 1,
    name: "Thorned Bulwarks",
    description: "Attackers take back 3% of the damage they deal per rank.",
    maxRanks: 2,
    effect: { kind: "thornsFrac", perRank: 0.03 },
  },
  {
    id: "overheal_ward",
    branch: "guardian",
    tier: 2,
    name: "Overheal Ward",
    description: "Healing past full HP banks as a shield.",
    maxRanks: 1,
    effect: { kind: "overheal" },
  },
  {
    id: "undying_will",
    branch: "guardian",
    tier: 3,
    name: "Undying Will",
    description:
      "Keystone: once per battle, each of your units survives a killing blow at 1 HP.",
    maxRanks: 1,
    effect: { kind: "lastBreath" },
    keystone: true,
  },
  // --- Arcanist ------------------------------------------------------------
  {
    id: "keen_focus",
    branch: "arcanist",
    tier: 0,
    name: "Keen Focus",
    description: "Your units' ability cooldowns are 3% shorter per rank.",
    maxRanks: 3,
    effect: { kind: "abilityCooldownMult", perRank: 0.03 },
  },
  {
    id: "empowered_bindings",
    branch: "arcanist",
    tier: 0,
    name: "Empowered Bindings",
    description: "Your summons gain +10% stats per rank.",
    maxRanks: 2,
    effect: { kind: "summonStatPct", perRank: 0.1 },
  },
  {
    id: "arcane_infusion",
    branch: "arcanist",
    tier: 1,
    name: "Arcane Infusion",
    description: "Your magic damage is +3% per rank.",
    maxRanks: 2,
    effect: { kind: "magicDmgMult", perRank: 0.03 },
  },
  {
    id: "marksmans_guile",
    branch: "arcanist",
    tier: 1,
    name: "Marksman's Guile",
    description: "Your ranged basic attacks heal for 2% of damage per rank.",
    maxRanks: 2,
    effect: { kind: "rangedLifesteal", perRank: 0.02 },
  },
  {
    id: "chronomancer",
    branch: "arcanist",
    tier: 3,
    name: "Chronomancer",
    description: "Keystone: your units' abilities begin the battle ready.",
    maxRanks: 1,
    effect: { kind: "abilitiesStartReady" },
    keystone: true,
  },
];

export const TALENTS_BY_ID: Record<string, TalentDef> = Object.fromEntries(
  TALENTS.map((t) => [t.id, t])
);

/** Player allocation: talentId → ranks bought. Missing id = 0. This is the
 *  persisted shape (PlayerSave.talents); sanitizeTalentAllocation rebuilds it
 *  defensively on load. */
export type TalentAllocation = Record<string, number>;

export function pointsSpent(alloc: TalentAllocation): number {
  return Object.values(alloc).reduce((a, n) => a + n, 0);
}

export function pointsSpentInBranch(
  alloc: TalentAllocation,
  branch: BranchId
): number {
  return Object.entries(alloc).reduce(
    (a, [id, n]) => a + (TALENTS_BY_ID[id]?.branch === branch ? n : 0),
    0
  );
}

/** Whether one more rank of `talentId` can be bought: the talent exists, has
 *  ranks left, a point is available, and its tier gate is met by points
 *  ALREADY spent in its branch. */
export function canBuyTalent(
  alloc: TalentAllocation,
  talentId: string,
  totalPoints: number
): boolean {
  const def = TALENTS_BY_ID[talentId];
  if (!def) return false;
  if ((alloc[talentId] ?? 0) >= def.maxRanks) return false;
  if (pointsSpent(alloc) >= totalPoints) return false;
  return pointsSpentInBranch(alloc, def.branch) >= TIER_GATES[def.tier];
}

/** Fold one more rank in (assumes canBuyTalent said yes). */
export function buyTalent(
  alloc: TalentAllocation,
  talentId: string
): TalentAllocation {
  return { ...alloc, [talentId]: (alloc[talentId] ?? 0) + 1 };
}

/** Defensive rebuild of a persisted allocation: unknown ids drop, ranks clamp
 *  to [0, maxRanks], zero-rank entries drop, and the whole thing is replayed
 *  through the gate rules so a hand-edited save can't hold an unreachable
 *  tree. `totalPoints` caps the sum (points from the CURRENT level, so an
 *  XP rollback also self-heals). */
export function sanitizeTalentAllocation(
  raw: unknown,
  totalPoints: number
): TalentAllocation {
  if (!raw || typeof raw !== "object") return {};
  const wanted: [TalentDef, number][] = [];
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    const def = TALENTS_BY_ID[id];
    if (!def || typeof n !== "number" || !Number.isFinite(n)) continue;
    const ranks = Math.min(def.maxRanks, Math.max(0, Math.floor(n)));
    if (ranks > 0) wanted.push([def, ranks]);
  }
  // Replay in tier order (then id, for determinism): lower tiers first so
  // gates are met the same way the player necessarily met them.
  wanted.sort(
    ([a], [b]) => a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  let alloc: TalentAllocation = {};
  for (const [def, ranks] of wanted) {
    for (let i = 0; i < ranks; i++) {
      if (!canBuyTalent(alloc, def.id, totalPoints)) break;
      alloc = buyTalent(alloc, def.id);
    }
  }
  return alloc;
}

// ---------------------------------------------------------------------------
// CommanderMods — the resolved, serializable match input. A plain object of
// identity-defaulted fields (NOT a TeamMods import — meta stays engine-free);
// MatchController folds it onto state.teamMods.player at construction.
// ---------------------------------------------------------------------------

export interface CommanderMods {
  dmgMult: number;
  atkDelayMult: number;
  moveSpeedMult: number;
  damageTakenMult: number;
  lifestealBonus: number;
  executeBonus: number;
  killHeal: number;
  deployShieldFrac: number;
  thornsFrac: number;
  overheal: boolean;
  lastBreath: boolean;
  critEveryNth: number;
  abilityCooldownMult: number;
  summonStatPct: number;
  magicDmgMult: number;
  rangedLifesteal: number;
  abilitiesStartReady: boolean;
}

/** Resolve an allocation into the match input, or NULL for an empty/identity
 *  allocation — commander-less matches must stay byte-identical to
 *  pre-feature sims, and null is the unambiguous "not present" signal. */
export function resolveCommanderMods(
  alloc: TalentAllocation
): CommanderMods | null {
  let any = false;
  const mods: CommanderMods = {
    dmgMult: 1,
    atkDelayMult: 1,
    moveSpeedMult: 1,
    damageTakenMult: 1,
    lifestealBonus: 0,
    executeBonus: 0,
    killHeal: 0,
    deployShieldFrac: 0,
    thornsFrac: 0,
    overheal: false,
    lastBreath: false,
    critEveryNth: 0,
    abilityCooldownMult: 1,
    summonStatPct: 0,
    magicDmgMult: 1,
    rangedLifesteal: 0,
    abilitiesStartReady: false,
  };
  for (const [id, ranks] of Object.entries(alloc)) {
    const def = TALENTS_BY_ID[id];
    if (!def || ranks <= 0) continue;
    const e = def.effect;
    any = true;
    switch (e.kind) {
      case "dmgMult":
        mods.dmgMult *= 1 + e.perRank * ranks;
        break;
      case "atkDelayMult":
        mods.atkDelayMult *= 1 - e.perRank * ranks;
        break;
      case "moveSpeedMult":
        mods.moveSpeedMult *= 1 + e.perRank * ranks;
        break;
      case "damageTakenMult":
        mods.damageTakenMult *= 1 - e.perRank * ranks;
        break;
      case "lifestealBonus":
        mods.lifestealBonus += e.perRank * ranks;
        break;
      case "executeBonus":
        mods.executeBonus += e.perRank * ranks;
        break;
      case "killHeal":
        mods.killHeal += e.perRank * ranks;
        break;
      case "deployShieldFrac":
        mods.deployShieldFrac += e.perRank * ranks;
        break;
      case "thornsFrac":
        mods.thornsFrac += e.perRank * ranks;
        break;
      case "overheal":
        mods.overheal = true;
        break;
      case "lastBreath":
        mods.lastBreath = true;
        break;
      case "critEveryNth":
        mods.critEveryNth = e.n;
        break;
      case "abilityCooldownMult":
        mods.abilityCooldownMult *= 1 - e.perRank * ranks;
        break;
      case "summonStatPct":
        mods.summonStatPct += e.perRank * ranks;
        break;
      case "magicDmgMult":
        mods.magicDmgMult *= 1 + e.perRank * ranks;
        break;
      case "rangedLifesteal":
        mods.rangedLifesteal += e.perRank * ranks;
        break;
      case "abilitiesStartReady":
        mods.abilitiesStartReady = true;
        break;
    }
  }
  return any ? mods : null;
}

// ---------------------------------------------------------------------------
// Commander spells — the castable (slice 2). One charge per battle; which
// spells are UNLOCKED derives from branch investment, which one is EQUIPPED
// is the player's persisted pick (cleared on load if no longer unlocked —
// the title rule).
// ---------------------------------------------------------------------------

export type SpellId = "rally" | "bulwark" | "arcane_storm";

export const SPELLS: Record<
  SpellId,
  { name: string; description: string; branch: BranchId }
> = {
  rally: {
    name: "Rally",
    description:
      "For 5 seconds your whole warband moves faster and deals +25% damage.",
    branch: "warlord",
  },
  bulwark: {
    name: "Bulwark",
    description: "Every living unit gains a shield worth 25% of its max HP.",
    branch: "guardian",
  },
  arcane_storm: {
    name: "Arcane Storm",
    description: "A burst of arcane force deals 40 damage to every enemy.",
    branch: "arcanist",
  },
};

/** Rally: duration (seconds), move-speed haste magnitude, and the outgoing
 *  damage surge while it lasts. */
export const RALLY_SEC = 5;
export const RALLY_HASTE_MAG = 0.3;
export const RALLY_SURGE_FRAC = 0.25;
/** Bulwark's shield, as a fraction of each unit's max HP. */
export const BULWARK_SHIELD_FRAC = 0.25;
/** Arcane Storm's flat damage to every living enemy. */
export const ARCANE_STORM_DAMAGE = 40;

/** Spells whose branch has enough points invested. ALWAYS DERIVED (the
 *  earned-titles rule) — only the equipped pick persists. */
export function spellsUnlocked(alloc: TalentAllocation): SpellId[] {
  return BRANCH_IDS.filter(
    (b) => pointsSpentInBranch(alloc, b) >= SPELL_UNLOCK_POINTS
  ).map((b) => BRANCHES[b].spell);
}

/** The equipped-spell invariant: a persisted pick survives only while it's
 *  still unlocked; null otherwise. */
export function sanitizeEquippedSpell(
  raw: unknown,
  alloc: TalentAllocation
): SpellId | null {
  const unlocked = spellsUnlocked(alloc);
  return typeof raw === "string" && (unlocked as string[]).includes(raw)
    ? (raw as SpellId)
    : null;
}
