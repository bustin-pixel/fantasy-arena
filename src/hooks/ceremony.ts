// ============================================================================
// The post-victory ceremony — the stage graph, as a pure machine.
//
// "What happens after a boss dies" used to be spread across BattleScreen's
// ad-hoc React state and a row of pass-throughs on useBattleEngine, so reading
// the flow meant bouncing between three files and no part of it was testable.
// This module owns the graph and nothing else: events in, {stage, effects} out.
//
// It performs NO side effects — no timers, no SFX, no OutroCinematic calls. The
// caller (BattleScreen) renders the stage and performs the returned effects.
// That's what makes the flow assertable headlessly, which matters because the
// cinematic itself is canvas and can't be tested.
// ============================================================================

import type { OutroDir } from "@/hooks/OutroCinematic";
import type { EncounterKind } from "@/data/encounters";

/** Where the ceremony is. "idle" = the match is still live or the outro never
 *  started; "result" = the result card is up (the run's terminal beat, or the
 *  pause before the player chooses to continue deeper). */
export type CeremonyStage =
  | "idle"
  | "chest"
  | "camp"
  | "choice"
  | "walkout"
  | "result";

/** The facts the graph branches on. Frozen for one floor. */
export interface CeremonyCtx {
  /** The boss lair: the run ends here, so there's no campfire and no exits. */
  isBoss: boolean;
  /** A no-combat 3-chest floor — the hoard opens, then the campfire. */
  isTreasureRoom: boolean;
  /** This floor dropped a reward chest (a chestless replay skips the beat). */
  hasChest: boolean;
  /** Honour prefers-reduced-motion: skip the cinematic entirely. */
  reducedMotion: boolean;
}

export type CeremonyEvent =
  /** The match resolved — win, loss, or draw. A loss never carries a chest on
   *  the lair path, so `hasChest`/`isBoss` are enough to route it: only a won
   *  lair opens a chest on the floor, everything else goes to the result card. */
  | { kind: "resolved" }
  /** A treasure room's hoard was granted (it has no fight to win). */
  | { kind: "treasureGranted" }
  /** The player pressed "continue deeper" on the result card. */
  | { kind: "continueDeeper" }
  /** A chest's loot reveal was dismissed (the single reward chest). */
  | { kind: "revealDismissed" }
  /** Every chest in a treasure room has been opened and its loot settled. */
  | { kind: "treasureSettled" }
  /** The band reached the campfire and healed. */
  | { kind: "campSettled" }
  /** The player picked an exit archway. */
  | { kind: "exitChosen"; dir: OutroDir; encounter: EncounterKind }
  /** The band finished walking off the field. */
  | { kind: "walkedOff"; encounter: EncounterKind };

export type CeremonyEffect =
  /** Materialize the chest up-field and gather the band at it. `reviveFallen`
   *  is false in the lair: the run is over, so there's no campfire to raise the
   *  dead and they stay down where they fell. `delayMs` lets the victory
   *  stinger and the "boss slain" beat land before the chest appears. */
  | { kind: "startChest"; reviveFallen: boolean; delayMs: number }
  /** Stroll down to the campfire and heal. */
  | { kind: "startCamp" }
  /** Walk off through `dir`; the arrow's KIND is what the next floor holds,
   *  which is not always the omen it showed. Carried here so the caller doesn't
   *  have to stash it between the choice and the walk finishing. */
  | { kind: "walkOff"; dir: OutroDir; encounter: EncounterKind }
  /** Surface the result card, after `delayMs` (the victory beat needs room to
   *  breathe; a dismissed loot reveal doesn't). */
  | { kind: "showResult"; delayMs: number }
  /** Hand the run back to App to advance to the next floor. */
  | { kind: "handOff"; encounter: EncounterKind };

export interface CeremonyStep {
  stage: CeremonyStage;
  effects: CeremonyEffect[];
}

const stay = (stage: CeremonyStage): CeremonyStep => ({ stage, effects: [] });

/** Advance the ceremony. Pure: same (stage, event, ctx) → same result, and
 *  an event the current stage doesn't expect is a no-op rather than a throw
 *  (a double-fired timer or a stray tap must not corrupt the flow). */
export function ceremonyStep(
  stage: CeremonyStage,
  event: CeremonyEvent,
  ctx: CeremonyCtx
): CeremonyStep {
  switch (event.kind) {
    // ---- entering the outro -------------------------------------------------
    case "resolved": {
      if (stage !== "idle") return stay(stage);
      // The lair's chest opens ON the floor, and the "Dungeon Cleared!" card
      // waits behind it. Everything else (a chestless replay, reduced motion,
      // an ordinary floor) goes straight to the result card, which is where
      // "continue deeper" is offered.
      if (ctx.isBoss && ctx.hasChest && !ctx.reducedMotion) {
        return {
          stage: "chest",
          // Let the victory stinger + the "boss slain" beat land first.
          effects: [{ kind: "startChest", reviveFallen: false, delayMs: 900 }],
        };
      }
      return { stage: "result", effects: [{ kind: "showResult", delayMs: 700 }] };
    }

    case "treasureGranted": {
      if (stage !== "idle") return stay(stage);
      // No fight to win: the hoard is already granted, so open the chest beat.
      // Deliberately effect-free — useBattleEngine's init effect already stood
      // the chests up in lockstep with the controller. Standing them up from
      // here instead races StrictMode's double-mount, which nulls outroRef
      // after the one-shot setup and orphans them.
      if (ctx.reducedMotion) {
        return { stage: "camp", effects: [{ kind: "startCamp" }] };
      }
      return stay("chest");
    }

    case "continueDeeper": {
      if (stage !== "result") return stay(stage);
      // Reduced motion: skip the cinematic AND the path choice — the next floor
      // is a plain descent.
      if (ctx.reducedMotion) {
        return { stage: "walkout", effects: [{ kind: "handOff", encounter: "normal" }] };
      }
      if (ctx.hasChest) {
        return {
          stage: "chest",
          effects: [{ kind: "startChest", reviveFallen: true, delayMs: 0 }],
        };
      }
      return { stage: "camp", effects: [{ kind: "startCamp" }] };
    }

    // ---- the chest beat -----------------------------------------------------
    case "revealDismissed": {
      if (stage !== "chest") return stay(stage);
      // The lair is the end of the run: no campfire, no exits — just the
      // "Dungeon Cleared!" card.
      if (ctx.isBoss) {
        return { stage: "result", effects: [{ kind: "showResult", delayMs: 0 }] };
      }
      return { stage: "camp", effects: [{ kind: "startCamp" }] };
    }

    case "treasureSettled": {
      if (stage !== "chest") return stay(stage);
      return { stage: "camp", effects: [{ kind: "startCamp" }] };
    }

    // ---- campfire → exit ----------------------------------------------------
    case "campSettled": {
      if (stage !== "camp") return stay(stage);
      return stay("choice");
    }

    case "exitChosen": {
      if (stage !== "choice") return stay(stage);
      return {
        stage: "walkout",
        effects: [
          { kind: "walkOff", dir: event.dir, encounter: event.encounter },
        ],
      };
    }

    case "walkedOff": {
      if (stage !== "walkout") return stay(stage);
      return {
        stage: "walkout",
        effects: [{ kind: "handOff", encounter: event.encounter }],
      };
    }
  }
}
