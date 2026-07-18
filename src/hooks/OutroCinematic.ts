// ============================================================================
// OutroCinematic — the post-victory "continue deeper" campfire scene. Once a
// Depths match resolves, MatchController.tick() is a no-op but the rAF loop
// keeps painting snapshots, and snapshot() shares LIVE unit references — so
// this little lerper runs the whole scene purely client-side:
//
//   1. gatherAtCamp — the warband (INCLUDING fallen heroes, picked back up:
//      un-faded, set to 1 HP) walks into a ring around the campfire at the
//      arena's center, and everyone heals up while the fire burns.
//   2. walkOff — on the player's arrow pick, the band files off-screen in
//      that direction, each hero keeping their lane.
//
// The same lerper also runs two mid-descent beats while the sim is held:
//   • walkIn — the floor-ENTRY march-in: the warband, fielded on the previous
//     floor's marks, files in from the bottom edge (the other half of walkOff).
//   • braceToRow — the boss BRACE: survivors pull back into a centered row to
//     face an incoming boss, then the fight resumes from that formation.
//
// Deliberately NOT MovementSystem: that tick assumes live-combat invariants
// (targeting, separation, aggro) and would fight a scripted stroll. And
// determinism is moot here — the outcome is decided and the rewards were
// granted at resolution; nothing downstream reads these positions or the
// cosmetic revive/heal.
//
// It also advances animTime/animState itself (AnimationSystem lives inside
// the now-dormant tick), so the walk cycle actually plays.
// ============================================================================

import type { Unit, Vec2 } from "@/types";
import { FIELD_HEIGHT, FIELD_WIDTH } from "@/utils/constants";
import type { ChestTier } from "@/meta/economy";
import type { FloorChest } from "@/engine/Renderer";
import { OPEN_AT, spawnSparkles, type Sparkle } from "@/assets/chestArt";

/** Presentational stroll speed (field px/s) — unhurried victors. */
const WALK_SPEED = 120;
/** How close counts as "on your mark". Kept sub-pixel because `finish()` SNAPS
 *  everyone to their exact slot: any hero who stopped short of it pops that far
 *  the instant the slowest one lands, and the whole band visibly hitches
 *  together. Overshoot isn't a risk to guard against — the step below clamps to
 *  1, so a hero closer than one frame of travel lands exactly on the mark. */
const ARRIVE_DIST = 0.5;
/** If someone gets stuck (shouldn't happen — nothing collides), end anyway. */
const FAILSAFE_MS = 4500;
/** Campfire healing: wounds close over ~2.2s at the fire. */
const HEAL_MS = 2200;

export type OutroDir = "up" | "left" | "right";

/** Where the campfire burns, in 480×720 field coords. */
export const CAMP_POINT: Vec2 = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT * 0.55 };
/** Where the reward chest sits — up-field, ABOVE the campfire, so the band
 *  gathers in front of it (nearer the camera) then walks down to the fire. */
export const CHEST_POINT: Vec2 = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT * 0.44 };
/** How far past the field edge a hero must walk to be "gone". */
const OFFSCREEN = 80;

/** Mimics AnimationSystem's pose bookkeeping for one presentational unit. */
function setPose(u: Unit, state: "idle" | "moving", dtMs: number): void {
  u.state = state;
  if (u.animState !== state) {
    u.animState = state;
    u.animTime = 0;
  }
  u.animTime += dtMs / 1000;
}

/** The slice of SimState the cinematic owns after resolution. Structural —
 *  pass the controller's state; only these fields are touched. */
export interface OutroScene {
  units: Unit[];
  floatingTexts: unknown[];
  projectiles: unknown[];
  vfx: unknown[];
}

/** One reward chest on the floor (the reward beat fields one; a treasure room
 *  fields three). Each opens on its own tap and advances its own lid clock. */
interface ChestState {
  point: Vec2;
  tier: ChestTier;
  opened: boolean;
  clock: number; // ms since this chest's open tap
  revealed: boolean;
  sparkles: Sparkle[];
  onReveal: (() => void) | null;
}
function makeChestState(point: Vec2, tier: ChestTier): ChestState {
  return {
    point,
    tier,
    opened: false,
    clock: 0,
    revealed: false,
    sparkles: [],
    onReveal: null,
  };
}

export class OutroCinematic {
  private units: Unit[];
  private fallenFoes: Unit[];
  private scene: OutroScene;
  private targets = new Map<string, Vec2>();
  private onDone: (() => void) | null = null;
  private elapsed = 0;
  /** While true, step() closes everyone's wounds toward full HP. */
  private healing = false;
  /** Campfire lifecycle: unlit → burning (rest/heal) → doused (charred logs +
   *  smoke, as the band breaks camp and marches out). */
  private fire: "out" | "lit" | "doused" = "out";
  /** Where settled units turn to look (the chest, then the fire). Null during
   *  walk-off so they keep facing their exit. */
  private facePoint: Vec2 | null = CAMP_POINT;

  // -- On-floor reward chest(s): one for the reward beat, three in a treasure
  //    room. Empty until a gather-at-chest(s) call. --
  private chestList: ChestState[] = [];

  /** Captures the player's WHOLE warband — survivors and the fallen alike
   *  (the fallen get picked back up at the campfire). */
  constructor(scene: OutroScene) {
    this.scene = scene;
    this.units = scene.units.filter((u) => u.team === "player");
    this.fallenFoes = scene.units.filter((u) => u.team === "enemy");
  }

  /** Walk the warband into an arc IN FRONT of a reward chest that materializes
   *  up-field, all facing it. No heal yet — the fire does that. `onSettled`
   *  fires once the band has gathered at the chest.
   *
   *  `reviveFallen` (default true): the fallen are picked back up and join the
   *  gather, since the campfire heals everyone next. The boss's Dungeon-Cleared
   *  chest passes false — there's no fire, the run is over, so the fallen stay
   *  down where they lie and only the survivors walk up to the chest. */
  gatherAtChest(tier: ChestTier, onSettled: () => void, reviveFallen = true): void {
    this.sweepStaleVfx();
    if (reviveFallen) this.reviveFallen();
    this.chestList = [makeChestState({ ...CHEST_POINT }, tier)];
    this.facePoint = CHEST_POINT;
    // Only the living walk when the fallen stay down; the arc spreads over them.
    const movers = reviveFallen
      ? this.units
      : this.units.filter((u) => u.state !== "dead");
    this.begin(this.arcBefore(CHEST_POINT, 46, movers), onSettled, movers);
  }

  /** Treasure room: materialize N chests spread across the up-field and gather
   *  the band in an arc in front of the whole hoard (no heal — no fire yet). */
  gatherAtChests(tiers: ChestTier[], onSettled: () => void): void {
    this.reviveAndClear();
    const n = tiers.length;
    const spacing = 112;
    this.chestList = tiers.map((tier, i) => {
      const x = CHEST_POINT.x + (i - (n - 1) / 2) * spacing;
      // Shallow arc: outer chests sit a touch lower (nearer the camera).
      const y = CHEST_POINT.y + Math.abs(i - (n - 1) / 2) * 12;
      return makeChestState({ x, y }, tier);
    });
    this.facePoint = CHEST_POINT;
    this.begin(
      this.arcBefore({ x: CHEST_POINT.x, y: CHEST_POINT.y + 20 }, 60),
      onSettled
    );
  }

  /** Sweep the battlefield of stale damage floats, frozen projectiles and vfx
   *  (the sim tick that ages them is a post-victory no-op). */
  private sweepStaleVfx(): void {
    this.scene.floatingTexts.length = 0;
    this.scene.projectiles.length = 0;
    this.scene.vfx.length = 0;
  }

  /** Pick the fallen back up (cosmetic): back on their feet at a sliver of HP,
   *  the fire does the rest. Skipped on the boss's Dungeon-Cleared chest — with
   *  no campfire the fallen simply stay down. */
  private reviveFallen(): void {
    for (const u of this.units) {
      if (u.state === "dead") {
        u.deathFade = 0;
        u.hp = Math.max(1, u.hp);
        setPose(u, "idle", 0);
      }
    }
  }

  /** Sweep stale vfx and pick the fallen back up — the chest gathers' default
   *  and the treasure-room hoard. */
  private reviveAndClear(): void {
    this.sweepStaleVfx();
    this.reviveFallen();
  }

  /** The player tapped the (single) chest — Phase-1 convenience for openChestAt(0). */
  openChest(onReveal: () => void): void {
    this.openChestAt(0, onReveal);
  }

  /** Start chest `index`'s lid animation. `onReveal` fires once at the reveal
   *  beat (lid fully open). Idempotent — extra taps mid-open are ignored. */
  openChestAt(index: number, onReveal: () => void): void {
    const c = this.chestList[index];
    if (!c || c.opened) return;
    c.opened = true;
    c.clock = 0;
    c.revealed = false;
    c.onReveal = onReveal;
  }

  /** Chest world points + open state, for tap hit-testing. */
  chestPoints(): { index: number; point: Vec2; opened: boolean }[] {
    return this.chestList.map((c, index) => ({
      index,
      point: c.point,
      opened: c.opened,
    }));
  }

  /** True once every gathered chest has been opened (treasure-room gate). */
  allChestsOpened(): boolean {
    return this.chestList.length > 0 && this.chestList.every((c) => c.opened);
  }

  /** The chests' render state (null until gathered). Advanced by step(); the
   *  render loop passes it to renderBattle, which y-sorts each body with the
   *  units. An array so a treasure room fields three. */
  chests(): FloorChest[] | null {
    if (this.chestList.length === 0) return null;
    return this.chestList.map((c) => ({
      x: c.point.x,
      y: c.point.y,
      tier: c.tier,
      t: c.opened ? c.clock : 0,
      opening: c.opened,
      sparkles: c.sparkles,
    }));
  }

  /** Pick up the fallen, walk everyone into a ring around the campfire, and
   *  start the heal-up. `onDone` fires when the band has settled at the fire
   *  (healing keeps ticking afterwards, while the arrows are up). */
  gatherAtCamp(onDone: () => void): void {
    // Sweep the battlefield: stale damage floats, frozen projectiles and vfx
    // would otherwise hang mid-air forever (the sim tick that ages them is a
    // post-victory no-op). Enemy corpses melt away in step() instead.
    this.scene.floatingTexts.length = 0;
    this.scene.projectiles.length = 0;
    this.scene.vfx.length = 0;
    for (const u of this.units) {
      if (u.state === "dead") {
        // Picked up by their comrades: back on their feet at a sliver of HP
        // (the fire does the rest). Purely cosmetic — the match is over.
        u.deathFade = 0;
        u.hp = Math.max(1, u.hp);
        setPose(u, "idle", 0);
      }
    }
    this.healing = true;
    this.fire = "lit";
    this.facePoint = CAMP_POINT;
    this.begin(this.ringAround(CAMP_POINT, 38), onDone);
  }

  /** The campfire's world position + state while the scene is playing (else
   *  null) — the render loop passes it to renderBattle, which y-sorts it with
   *  the units. `doused` swaps the flame for charred logs + a smoke wisp. */
  campfire(): { x: number; y: number; doused: boolean } | null {
    if (this.fire === "out") return null;
    return { x: CAMP_POINT.x, y: CAMP_POINT.y, doused: this.fire === "doused" };
  }

  /** File off-screen in the chosen direction, each hero keeping their lane.
   *  Douses the campfire first — the band breaks camp (charred logs + smoke
   *  remain), which also stops heroes crossing the center from appearing to
   *  walk through the flame. */
  walkOff(dir: OutroDir, onDone: () => void): void {
    this.fire = "doused";
    this.healing = false;
    this.facePoint = null;
    const slots = this.units.map((u): Vec2 => {
      if (dir === "up") return { x: u.pos.x, y: -OFFSCREEN };
      if (dir === "left") return { x: -OFFSCREEN, y: u.pos.y };
      return { x: FIELD_WIDTH + OFFSCREEN, y: u.pos.y };
    });
    this.begin(slots, onDone);
  }

  /** Floor-entry march-in (the twin of walkOff): the warband files in from the
   *  bottom edge onto the marks they ALREADY occupy (fielded at construction).
   *  The sim is held until this resolves, so moving these live refs is invisible
   *  to combat; `onDone` releases that hold. Each hero keeps their column
   *  (target.x = start.x, so dx = 0 and the walk never flips `facing`, which
   *  four kits read for spawn-side offsets) and is normalized to the player
   *  default on arrival — battle-start state is byte-identical to a manual
   *  placement on the same marks. */
  walkIn(onDone: () => void): void {
    this.facePoint = null;
    const marks = this.units.map((u): Vec2 => ({ x: u.pos.x, y: u.pos.y }));
    // Drop each hero below the field edge (keeping their column), lightly
    // staggered so they file in rather than pop up in one rigid line.
    this.units.forEach((u, i) => {
      u.pos.y = FIELD_HEIGHT + OFFSCREEN + i * 24;
    });
    this.begin(marks, () => {
      for (const u of this.units) {
        u.facing = -1;
        setPose(u, "idle", 0);
      }
      onDone();
    });
  }

  /** Boss brace: the surviving warband pulls back into a centered row to face an
   *  incoming boss (or rare). Targets are the controller's DETERMINISTIC row slots
   *  (keyed by uid) — the engine re-snaps to them on release, so this is purely the
   *  visual lerp. Only the living move; corpses stay where they fell. */
  braceToRow(targets: { uid: string; pos: Vec2 }[], onDone: () => void): void {
    this.facePoint = null;
    const byUid = new Map(targets.map((t) => [t.uid, t.pos]));
    const movers = this.units.filter(
      (u) => u.state !== "dead" && byUid.has(u.uid)
    );
    const slots = movers.map((u) => byUid.get(u.uid)!);
    this.begin(slots, onDone, movers);
  }

  /** Advance the scene. Called once per rAF frame with real (unscaled) dt. */
  step(dtMs: number): void {
    // Reward chest(s): advance each opened lid and fire its one-shot reveal the
    // instant it lands (spawning that chest's burst sparkles at the same beat).
    for (const c of this.chestList) {
      if (!c.opened) continue;
      c.clock += dtMs;
      if (!c.revealed && c.clock >= OPEN_AT) {
        c.revealed = true;
        c.sparkles = spawnSparkles(c.tier, c.clock);
        const cb = c.onReveal;
        c.onReveal = null;
        cb?.();
      }
    }
    if (this.healing) {
      for (const u of this.units) {
        if (u.state === "dead") continue;
        u.hp = Math.min(u.maxHp, u.hp + (u.maxHp * dtMs) / HEAL_MS);
      }
      // Enemy corpses finish fading out — the field clears around the camp.
      for (const foe of this.fallenFoes) {
        if (foe.state === "dead" && foe.deathFade < 1) {
          foe.deathFade = Math.min(1, foe.deathFade + dtMs / 700);
        }
      }
    }
    if (!this.onDone) return;
    this.elapsed += dtMs;
    let allArrived = true;
    for (const u of this.units) {
      const t = this.targets.get(u.uid);
      if (!t || u.state === "dead") continue;
      const dx = t.x - u.pos.x;
      const dy = t.y - u.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= ARRIVE_DIST) {
        setPose(u, "idle", dtMs);
        // Settled: turn to face the current focus (the chest, then the fire).
        const fp = this.facePoint;
        if (fp && Math.abs(fp.x - u.pos.x) > 2) {
          u.facing = fp.x < u.pos.x ? -1 : 1;
        }
        continue;
      }
      allArrived = false;
      const step = Math.min(1, (WALK_SPEED * dtMs) / 1000 / dist);
      u.pos.x += dx * step;
      u.pos.y += dy * step;
      if (Math.abs(dx) > 2) u.facing = dx < 0 ? -1 : 1;
      setPose(u, "moving", dtMs);
    }
    if (allArrived || this.elapsed >= FAILSAFE_MS) this.finish();
  }

  /** Snap everyone to their marks and fire the pending callback (reduced
   *  motion, impatient taps, or the failsafe). Safe to call repeatedly. */
  finish(): void {
    const cb = this.onDone;
    if (!cb) return;
    this.onDone = null;
    for (const u of this.units) {
      const t = this.targets.get(u.uid);
      if (!t || u.state === "dead") continue;
      u.pos.x = t.x;
      u.pos.y = t.y;
      setPose(u, "idle", 0);
    }
    cb();
  }

  private begin(
    slots: Vec2[],
    onDone: () => void,
    movers: Unit[] = this.units
  ): void {
    this.targets.clear();
    movers.forEach((u, i) => this.targets.set(u.uid, slots[i]));
    this.elapsed = 0;
    this.onDone = onDone;
    // Nobody to walk: resolve immediately so the flow still advances.
    if (movers.length === 0) this.finish();
  }

  /** Evenly spread slots on a ring (single unit stands just south of it). */
  private ringAround(center: Vec2, radius: number): Vec2[] {
    const n = this.units.length;
    if (n <= 1) return [{ x: center.x, y: center.y + radius }];
    return this.units.map((_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return {
        x: center.x + Math.cos(a) * radius,
        y: center.y + Math.sin(a) * radius,
      };
    });
  }

  /** Fan the band across the near (south) side of a point, so everyone stands
   *  in FRONT of the chest (nobody behind it). A lone hero stands due south. */
  private arcBefore(center: Vec2, radius: number, movers: Unit[] = this.units): Vec2[] {
    const n = movers.length;
    if (n <= 1) return [{ x: center.x, y: center.y + radius }];
    const spread = Math.PI * 0.82; // arc width, centered on due south (+y)
    const start = Math.PI / 2 - spread / 2;
    return movers.map((_, i) => {
      const a = start + (i / (n - 1)) * spread;
      return {
        x: center.x + Math.cos(a) * radius,
        y: center.y + Math.sin(a) * radius,
      };
    });
  }
}
