// Bonecaller — an undead summoner from The Bonefields. Its one trick is Raise
// Dead: every 5s it claws a skeleton up beside it, synced to the GLOBAL tick
// (like the Necromancer) so every Bonecaller raises in lockstep. Suppressed
// while incapacitated (stun/fear/polymorph); the summon cap gates the flush. No
// active cast — the raise is a pre-gate passive.
import type { UnitKit } from "./UnitKit";
import { isIncapacitated } from "../StatusEffectSystem";
import { secToTicks } from "@/utils/constants";

const RAISE_INTERVAL_SEC = 5;

export const bonecallerKit: UnitKit = {
  roleClass: "support",

  onTick(unit, ctx) {
    if (isIncapacitated(unit)) return;
    if (ctx.tick % secToTicks(RAISE_INTERVAL_SEC) === 0) {
      ctx.spawnUnit("skeleton", unit.team, {
        x: unit.pos.x,
        y: unit.pos.y + (unit.team === "player" ? -24 : 24),
      });
    }
  },
};
