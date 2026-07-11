// ============================================================================
// Tendencies — per-unit targeting personalities (display copy).
// The RULES live in engine/TargetingSystem.acquireTarget (steps 2 & 4); the
// TendencyId type lives in types/ so the engine never imports this module.
// A unit's tendency is fixed data on its UnitDef (absent = "brawler", which is
// today's exact targeting and shows no trait chip). Taunt is never overridden.
// ============================================================================

import type { TendencyId } from "@/types";

export type { TendencyId };

export const TENDENCIES: Record<TendencyId, { name: string; blurb: string }> = {
  brawler: {
    name: "Brawler",
    blurb: "Fights whatever is in front of it.",
  },
  backline_stalker: {
    name: "Hunts the Backline",
    blurb: "Seeks out ranged foes and casters behind the line.",
  },
  executioner: {
    name: "Smells Blood",
    blurb: "Runs down the most wounded enemy on the field.",
  },
  bodyguard: {
    name: "Answers for Allies",
    blurb: "Turns on whoever is harming its companions.",
  },
  spellwrath: {
    name: "Hates Casters",
    blurb: "Magic-wielders die first.",
  },
  big_game: {
    name: "Stalks the Largest",
    blurb: "Always squares up to the biggest beast.",
  },
};
