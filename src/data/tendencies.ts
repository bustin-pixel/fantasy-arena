// ============================================================================
// Tendencies — per-unit targeting personalities (display copy).
// The RULES live in engine/TargetingSystem.acquireTarget (steps 2 & 4); the
// TendencyId type lives in types/ so the engine never imports this module.
// A unit's tendency is fixed data on its UnitDef (absent = "brawler", which is
// today's exact targeting and shows no trait chip). Taunt is never overridden.
// `blurb` is the one-liner on the unit panel; `detail` is the full treatise
// entry in the Compendium's Book of Tendencies.
// ============================================================================

import type { TendencyId } from "@/types";

export type { TendencyId };

export const TENDENCIES: Record<
  TendencyId,
  { name: string; blurb: string; detail: string }
> = {
  brawler: {
    name: "Brawler",
    blurb: "Fights whatever is in front of it.",
    detail:
      "The common instinct, and the measure all others are read against. A brawler strikes the most wounded foe within its reach; finding none in reach, it closes on the nearest enemy. Strike one, and it will answer you in kind.",
  },
  backline_stalker: {
    name: "Hunts the Backline",
    blurb: "Seeks out ranged foes and casters behind the line.",
    detail:
      "This creature slips past shields and spears to reach what hides behind them. It prefers archers, casters, and menders over any frontliner — the longer a foe's reach, the sweeter the prey — and among such prey it runs down the most wounded first.",
  },
  executioner: {
    name: "Smells Blood",
    blurb: "Runs down the most wounded enemy on the field.",
    detail:
      "Distance means nothing; blood means everything. An executioner marks the most wounded enemy anywhere on the field and crosses the whole of it to finish the kill, ignoring nearer and healthier foes along the way.",
  },
  bodyguard: {
    name: "Answers for Allies",
    blurb: "Turns on whoever is harming its companions.",
    detail:
      "A guardian's eye stays on its companions, not its enemies. Whenever a foe raises a blade against one of its allies, the bodyguard turns on that foe first — and among several such menaces, it silences the most wounded.",
  },
  spellwrath: {
    name: "Hates Casters",
    blurb: "Magic-wielders die first.",
    detail:
      "Old grudge or hard lesson, this one cannot abide sorcery. Any wielder of magic is preferred prey over every mundane arm on the field, and among casters it cuts down the most wounded first.",
  },
  big_game: {
    name: "Stalks the Largest",
    blurb: "Always squares up to the biggest beast.",
    detail:
      "Trophies are measured in size. This hunter walks past the small and the dying to square up against the largest creature on the field — the one with the deepest well of life — however far away it stands. It farms giants; it ignores rabble.",
  },
  faithbane: {
    name: "Faithbane",
    blurb: "Healers die first. Always.",
    detail:
      "Where the backline stalker harries anything soft, the faithbane wants one thing: the mender. It walks past archers and mages alike to silence whoever knits its enemies back together, and only once every healer lies still does it fight like the rest.",
  },
  focus_fire: {
    name: "Focus Fire",
    blurb: "Piles onto whatever its allies are already fighting.",
    detail:
      "A pack instinct. This creature reads the field for the enemy its packmates are already savaging and joins the kill, adding its teeth where the most allies have theirs. Untouched foes hold no interest while the pack's chosen prey still stands.",
  },
  lone_wolf: {
    name: "Lone Wolf",
    blurb: "Seeks the foe nobody else is fighting.",
    detail:
      "It will not share a kill. The lone wolf seeks whichever enemy none of its allies have claimed and starts its own fight there, spreading the battle wide. Only when every foe is spoken for does it deign to join another's quarrel — taking the most wounded.",
  },
};
