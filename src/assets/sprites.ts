// ============================================================================
// Procedural sprites
// Rather than ship binary sprite sheets, each unit is drawn procedurally on the
// canvas with a distinct silhouette + accent color. Animation (idle bob, walk
// bounce, attack lunge, cast flare, hit flash, death fade) is derived from the
// unit's animTime/animState so the look matches the spec's six animation states
// without needing real art assets. Portraits reuse the same draw routine.
//
// Art style: every body reads as a shaded volume (a light→body→dark vertical
// gradient), catches a rim light on its left edge, and carries a signature glow
// or particle emitter themed to its accent colour. Ambient particles (embers,
// wisps, drips, gleams) ride a presentation-only wall clock (see `nowSeconds`)
// rather than `unit.animTime`, which resets to 0 on every state change and would
// pop the loops. Static hub portraits pass `live: false` to freeze the clock and
// suppress the particle emitters, so card art stays still.
// ============================================================================

import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";

type Ctx = CanvasRenderingContext2D;
const PI2 = Math.PI * 2;

/** Per-frame animation inputs handed to each unit's draw routine. */
interface SpriteAnim {
  /** Presentation clock (seconds), offset per-unit so clones desync. 0 static. */
  t: number;
  /** 0..1 ambient glow pulse. */
  glow: number;
  /** 0..1 casting flare, from the unit's cast animation state. */
  cast: number;
  /** False for static hub portraits — suppress motion-only particle emitters. */
  live: boolean;
  /** True only on the battlefield draw (opts.battle). Portraits — the hub card and
   *  the info panel — are false. Lets a unit vary its animation by context (the
   *  Outlaw's phantom flicker: a trailing after-image in battle, a slide-out loop
   *  in the info panel). */
  battle: boolean;
}

/** Wall-clock seconds. Presentation-only: never read by the simulation, so this
 *  does not affect determinism (the Renderer is free to read wall time). */
function nowSeconds(): number {
  return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

/** A small stable phase from a unit's uid so identical units don't pulse in
 *  lockstep. Portraits pass a stub with no uid → phase 0 (a clean frozen frame). */
function phaseOf(uid: string | undefined): number {
  if (!uid) return 0;
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 1009;
  return (h / 1009) * PI2;
}

/** Deterministic 0/1 body-variant pick from a unit's uid, so horde units don't
 *  all read as clones. XOR of char-code parities: real uids are sequential
 *  ("u0","u1",…), so this alternates through a wave instead of clustering
 *  (phaseOf's range test puts u0–u9 all on one side). Presentation-only.
 *  Portraits (no uid) always get 0. */
function variantOf(uid: string | undefined): 0 | 1 {
  if (!uid) return 0;
  let p = 0;
  for (let i = 0; i < uid.length; i++) p ^= uid.charCodeAt(i) & 1;
  return p as 0 | 1;
}

function withShade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

/** Same colour at a given alpha (for glow fills / gradients). */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Build a closed polygon path from [x,y] points. Call fill()/stroke() after —
 *  handy for angular, faceted (non-rounded) shapes. */
function poly(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Body bob/lunge offsets from animation state. */
function animOffsets(unit: Unit): { bob: number; lunge: number; cast: number } {
  const t = unit.animTime;
  switch (unit.animState) {
    case "moving":
      return { bob: Math.sin(t * 14) * 2.5, lunge: 0, cast: 0 };
    case "attacking": {
      // sharp lunge on each attack
      const phase = (t % unit.attackSpeed) / unit.attackSpeed;
      const l = phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI) * 7 : 0;
      return { bob: 0, lunge: l, cast: 0 };
    }
    case "casting":
      return { bob: 0, lunge: 0, cast: Math.sin(t * 24) * 0.5 + 0.5 };
    case "idle":
      return { bob: Math.sin(t * 3) * 1.2, lunge: 0, cast: 0 };
    default:
      return { bob: 0, lunge: 0, cast: 0 };
  }
}

// ---- shared upgrade helpers ------------------------------------------------

/** A rounded torso filled with a light→body→dark vertical gradient (metal/robe
 *  volume). Same footprint as the old flat `roundedBody`. */
function metalBody(
  ctx: Ctx,
  w: number,
  h: number,
  y: number,
  body: string,
  dark: string,
  light: string,
  r = 6
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.5, body);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w / 2, y, w, h, r);
  ctx.fill();
}

/** A glowing orb: soft outer bloom, saturated body, bright offset core. */
function orb(ctx: Ctx, x: number, y: number, r: number, color: string, glow: number, core = "#ffffff"): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 + glow * 9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.42, 0, PI2);
  ctx.fill();
  ctx.restore();
}

/** A drifting-upward mote emitter (embers, spores, soul-wisps). Motion only —
 *  drawn nothing when `!A.live` so portraits stay still. */
function rising(
  ctx: Ctx,
  cx: number,
  spread: number,
  baseY: number,
  riseH: number,
  color: string,
  A: SpriteAnim,
  n = 5
): void {
  if (!A.live) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const seed = i * 1.7;
    const life = (A.t * 0.6 + seed) % 1;
    const x = cx + Math.sin(seed * 5 + A.t * 1.5) * spread + (i - n / 2);
    const y = baseY - life * riseH;
    ctx.globalAlpha = (1 - life) * 0.8;
    const r = 1.2 * (1 - life) + 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

interface DrawOpts {
  /** Override scale (portraits use a larger scale). */
  scale?: number;
  /** Force a static idle pose (portraits). */
  staticPose?: boolean;
  /** Battlefield draw: apply the unit's `def.battleScale` boss enlargement.
   *  Portraits omit this so bosses keep their normal card size. */
  battle?: boolean;
}

/** Ground-shadow ellipse at the humanoid foot line — the default for most units. */
const DEFAULT_SHADOW = { y: 26, rx: 18, ry: 6 };
/** Per-unit shadow tuning (keyed by `def.id`). Low or small creatures whose feet
 *  sit higher than the humanoid default need it raised and tightened so it hugs
 *  their feet instead of floating below as a detached puddle. */
const SHADOW_BY_ID: Record<string, typeof DEFAULT_SHADOW> = {
  // Rat feet bottom out at ~y18.5; the default y26 puddle reads as detached.
  giant_rat: { y: 19.5, rx: 12, ry: 4 },
  // Abomination is drawn 1.25× at the call site; drop + widen the shadow so it
  // sits under the scaled-up feet instead of cutting through its shins.
  abomination: { y: 28, rx: 22, ry: 6.5 },
  // Same 1.25× call-site scaling as the Abomination.
  fallen_seraph: { y: 28, rx: 22, ry: 6.5 },
  bandit_king: { y: 28, rx: 22, ry: 6.5 },
  // Airborne — it hovers, so the shadow sits on the ground below the talons.
  gargoyle: { y: 24, rx: 12, ry: 4 },
  // Hunched grappler; feet bottom out around y23.5.
  den_bruiser: { y: 24, rx: 15, ry: 5 },
  // Lunging thrower; feet bottom out around y21.
  knife_thrower: { y: 24, rx: 13, ry: 4.5 },
  // Drawn 0.9× at the call site; tighten so it hugs the smaller body.
  cutpurse: { y: 21.5, rx: 11, ry: 4 },
};

/**
 * Draw a unit centered at (cx, cy) in the current canvas. The shape per archetype
 * keeps each unit recognizable: ogre = bulky, knight = shielded blocky, archer =
 * slim with bow, mages = robed with orb.
 */
export function drawUnitSprite(
  ctx: Ctx,
  unit: Unit,
  cx: number,
  cy: number,
  opts: DrawOpts = {}
): void {
  const def = getUnitDef(unit.defId);
  // Bosses render larger on the battlefield (opts.battle) but keep their normal
  // size in the fixed-size hub portrait (which passes an explicit opts.scale).
  // Presentation only — the sim never reads battleScale, so collision `radius`
  // and the determinism digest are untouched.
  const bossScale = opts.battle ? def.battleScale ?? 1 : 1;
  const scale = (opts.scale ?? 1) * bossScale;
  const live = !opts.staticPose;
  const { bob, lunge, cast } = live
    ? animOffsets(unit)
    : { bob: 0, lunge: 0, cast: 0 };

  // Presentation clock, offset per-unit so identical units desync.
  const t = (live ? nowSeconds() : 0) + phaseOf(unit.uid);
  const A: SpriteAnim = {
    t,
    glow: 0.5 + 0.5 * Math.sin(t * 3),
    cast,
    live,
    battle: opts.battle === true,
  };

  const sh = SHADOW_BY_ID[def.id] ?? DEFAULT_SHADOW;
  ctx.save();
  // Anchor an enlarged boss by its feet (shadow line) so it stands on the same
  // spot a normal unit would — the extra height rises UPWARD instead of sinking
  // the sprite into the ground. No-op when bossScale === 1.
  ctx.translate(cx, cy - bob - sh.y * (bossScale - 1));

  // Facing flip + attack lunge toward facing direction.
  const dirX = unit.facing;
  ctx.translate(dirX * lunge, 0);
  ctx.scale(dirX * scale, scale);

  const body = def.color;
  const dark = withShade(body, -45);
  const light = withShade(body, 40);
  const accent = def.accent;

  // Shadow.
  if (!opts.staticPose) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, sh.y, sh.rx, sh.ry, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  // A polymorphed unit draws as a harmless sheep regardless of its def id.
  // (The hub portrait passes a minimal stub with no effects — hence the `?.`.)
  if (unit.effects?.some((e) => e.type === "polymorph")) {
    drawSheep(ctx);
    ctx.restore();
    return;
  }

  // Druid in bear form draws as a bear regardless of its def id.
  if (def.id === "summoner" && unit.transformed) {
    drawBear(ctx, "#6b4a2a", "#3f2c18", "#8a6240", accent, A);
    ctx.restore();
    return;
  }

  switch (def.id) {
    case "ogre":
      drawOgre(ctx, body, dark, light, accent, A);
      break;
    case "orc":
      drawOrc(ctx, body, dark, light, accent, A);
      break;
    case "archer":
      // Shares the Ranger's deep-cowl sprite as a recolor (tan leather vs.
      // forest green), with a single nocked arrow instead of the volley fan.
      drawRanger(ctx, body, dark, light, accent, A, 1);
      break;
    case "ranger":
      drawRanger(ctx, body, dark, light, accent, A);
      break;
    case "hunter":
      drawHunter(ctx, body, dark, light, accent, A);
      break;
    case "boar":
      drawBoar(ctx, body, dark, light, accent, A);
      break;
    case "knight":
      drawKnight(ctx, body, dark, light, accent, A, KNIGHT_LIVERY);
      break;
    case "warrior":
      drawWarrior(ctx, body, dark, light, accent, A);
      break;
    case "aegis_knight": {
      const smax = unit.shieldHpMax ?? 0;
      const charge = smax > 0 ? Math.min(1, (unit.shieldHp ?? 0) / smax) : 0;
      drawAegisKnight(ctx, body, dark, light, accent, A, charge);
      break;
    }
    case "holy_knight":
      drawKnight(ctx, body, dark, light, accent, A, HOLY_LIVERY);
      break;
    case "engineer":
      drawEngineer(ctx, body, dark, light, accent, A);
      break;
    case "turret":
      drawTurret(ctx, body, dark, light, accent, A);
      break;
    case "fire_mage":
      drawMage(ctx, body, dark, light, accent, A, "fire");
      break;
    case "ice_mage":
      drawMage(ctx, body, dark, light, accent, A, "ice");
      break;
    case "arcane_mage":
      drawMage(ctx, body, dark, light, accent, A, "arcane");
      break;
    case "mage":
      drawMage(ctx, body, dark, light, accent, A, "plain");
      break;
    case "electric_mage":
      drawMage(ctx, body, dark, light, accent, A, "electric");
      break;
    case "assassin":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "rogue":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "trickster":
      drawAssassin(ctx, body, dark, light, accent, A);
      break;
    case "outlaw":
      drawOutlaw(ctx, body, dark, light, accent, A);
      break;
    case "healer":
      drawHealer(ctx, body, dark, light, accent, A);
      break;
    // Placeholder: the Priest reuses the Cleric's robed body (recolored ivory/
    // gold via its def) until bespoke art lands via /mockup.
    case "priest":
      drawHealer(ctx, body, dark, light, accent, A);
      break;
    case "seraph":
      drawSeraph(ctx, body, dark, light, accent, A);
      break;
    case "summoner":
      drawSummoner(ctx, body, dark, light, accent, A);
      break;
    case "wolf":
      drawWolf(ctx, body, dark, light, accent, A);
      break;
    // Depths monsters — recolors of existing bodies (per the locked design).
    case "giant_rat":
      ctx.scale(0.75, 0.75); // tiny vermin, low to the ground
      drawGiantRat(ctx, body, dark, light, accent, A);
      break;
    case "zombie_shambler":
      drawZombieShambler(ctx, body, dark, light, accent, A, variantOf(unit.uid));
      break;
    case "bloater":
      drawSlime(ctx, body, dark, light, accent, A, 1.2); // swollen pus-green blob
      break;
    case "bloatling":
      drawSlime(ctx, body, dark, light, accent, A, 0.85); // sloughed-off gobbet
      break;
    case "berserker":
      drawBerserker(ctx, body, dark, light, accent, A);
      break;
    case "necromancer":
      drawNecromancer(ctx, body, dark, light, accent, A);
      break;
    case "skeleton":
      drawSkeleton(ctx, body, dark, light, accent, A, variantOf(unit.uid));
      break;
    case "slime":
      drawSlime(ctx, body, dark, light, accent, A, 1);
      break;
    case "slime_clone":
      drawSlime(ctx, body, dark, light, accent, A, 0.7);
      break;
    case "slime_knight":
      // Green plate animated by the ooze sealed inside it (its own draw fn).
      drawSlimeKnight(ctx, A);
      break;
    case "slime_squire":
      // A little glob flung from the dying Slime Knight, racing home.
      drawSlime(ctx, body, dark, light, accent, A, 0.6);
      break;
    case "mystic_archer":
      drawMysticArcher(ctx, body, dark, light, accent, A, unit.mysticForm);
      break;
    // The Bonefields (undead) tier — bespoke sprites (see the dungeon bestiary).
    case "skeleton_archer":
      drawSkeletonArcher(ctx, body, dark, light, accent, A);
      break;
    case "ghoul":
      drawGhoul(ctx, body, dark, light, accent, A);
      break;
    case "bonecaller":
      drawBonecaller(ctx, body, dark, light, accent, A);
      break;
    case "lich":
      drawLich(ctx, body, dark, light, accent, A);
      break;
    case "abomination":
      ctx.scale(1.25, 1.25); // a hulking stitched corpse
      drawAbomination(ctx, body, dark, light, accent, A);
      break;
    // The Wilds (feral beast) tier — bespoke sprites (see the dungeon bestiary).
    case "dire_wolf":
      drawDireWolf(ctx, body, dark, light, accent, A);
      break;
    case "razorback":
      drawRazorback(ctx, body, dark, light, accent, A);
      break;
    case "dire_alpha":
      ctx.scale(1.2, 1.2); // a giant pack alpha
      drawDireAlpha(ctx, body, dark, light, accent, A);
      break;
    case "grizzly":
      drawGrizzly(ctx, body, dark, light, accent, A);
      break;
    case "apex_beast":
      ctx.scale(1.15, 1.15); // a colossal predator
      drawApexBeast(ctx, body, dark, light, accent, A);
      break;
    // The Sealed Vault (arcane) tier — bespoke sprites (see the dungeon bestiary).
    case "arcane_wisp":
      drawArcaneWisp(ctx, body, dark, light, accent, A);
      break;
    case "imp":
      drawImp(ctx, body, dark, light, accent, A);
      break;
    // The Warlock's pact imp — the same body, painted from its own (blue) def.
    case "void_imp":
      ctx.scale(0.9, 0.9); // smaller than the Vault's — a lesser thing
      drawImp(ctx, body, dark, light, accent, A);
      break;
    case "warlock":
      drawWarlock(ctx, body, dark, light, accent, A);
      break;
    case "cultist":
      drawCultist(ctx, body, dark, light, accent, A);
      break;
    case "archmage":
      ctx.scale(1.1, 1.1); // a grand caster
      drawArchmage(ctx, body, dark, light, accent, A);
      break;
    case "mirror_image":
      // The Archmage's illusion double: same sprite, slightly smaller and
      // translucent so the real one always reads at a glance.
      ctx.scale(0.95, 0.95);
      ctx.globalAlpha *= 0.65;
      drawArchmage(ctx, body, dark, light, accent, A);
      break;
    case "rune_golem":
      ctx.scale(1.2, 1.2); // a hulking construct
      drawRuneGolem(ctx, body, dark, light, accent, A);
      break;
    // The Overgrowth (nature) tier — bespoke sprites (see the dungeon bestiary).
    case "thornbeast":
      drawThornbeast(ctx, body, dark, light, accent, A);
      break;
    case "spore_pod":
      drawSporePod(ctx, body, dark, light, accent, A);
      break;
    case "dryad":
      drawDryad(ctx, body, dark, light, accent, A);
      break;
    case "elder_treant":
      ctx.scale(1.4, 1.4); // a colossal ancient tree
      drawElderTreant(ctx, body, dark, light, accent, A);
      break;
    case "wildheart":
      ctx.scale(1.1, 1.1); // the grove's radiant heart
      drawWildheart(ctx, body, dark, light, accent, A);
      break;
    // The Eclipse Spire (celestial) tier — bespoke sprites (see the dungeon bestiary).
    case "light_wisp":
      drawLightWisp(ctx, body, dark, light, accent, A);
      break;
    case "shadow_wraith":
      drawShadowWraith(ctx, body, dark, light, accent, A);
      break;
    case "eclipse_acolyte":
      drawEclipseAcolyte(ctx, body, dark, light, accent, A);
      break;
    case "eclipse_warden":
      ctx.scale(1.25, 1.25); // a towering celestial warden
      drawEclipseWarden(ctx, body, dark, light, accent, A);
      break;
    case "eclipse_herald":
      ctx.scale(1.1, 1.1); // a grand herald
      drawEclipseHerald(ctx, body, dark, light, accent, A);
      break;
    // The Deep Forge (construct) tier — bespoke sprites (see the dungeon bestiary).
    case "clockwork_spider":
      ctx.scale(0.9, 0.9); // a small scuttler
      drawClockworkSpider(ctx, body, dark, light, accent, A);
      break;
    case "sentry":
      drawSentry(ctx, body, dark, light, accent, A);
      break;
    case "animated_armor":
      drawAnimatedArmor(ctx, body, dark, light, accent, A);
      break;
    case "forge_golem":
      ctx.scale(1.25, 1.25); // a molten colossus
      drawForgeGolem(ctx, body, dark, light, accent, A);
      break;
    case "ancient_automaton":
      ctx.scale(1.15, 1.15); // a relic construct
      drawAncientAutomaton(ctx, body, dark, light, accent, A);
      break;
    // The Fallen Cathedral (desecrated sanctum) tier — bespoke sprites; the two
    // angels compose the Seraph's wings in their ashen tone.
    case "heretic_zealot":
      drawHereticZealot(ctx, body, dark, light, accent, A);
      break;
    case "gargoyle":
      // Two airborne bodies picked per-unit (uid parity) so a pack reads as a
      // flock: 0 = stocky Stone Imp, 1 = broad slab-chested Ravager.
      drawGargoyle(ctx, body, dark, light, accent, A, variantOf(unit.uid));
      break;
    case "grave_chorister":
      drawGraveChorister(ctx, body, dark, light, accent, A);
      break;
    case "fallen_seraph":
      ctx.scale(1.25, 1.25); // a towering fallen angel
      drawFallenSeraph(ctx, body, dark, light, accent, A);
      break;
    case "penitent":
      ctx.scale(1.1, 1.1); // a grand, grieving rare
      drawPenitent(ctx, body, dark, light, accent, A);
      break;
    // The Rogue's Den (thieves' guild) tier — all bespoke sprites now; the
    // Silencer wears the Outlaw's own phasing draw.
    case "cutpurse":
      ctx.scale(0.9, 0.9); // a small, quick gutter blade
      drawCutpurse(ctx, body, dark, light, accent, A);
      break;
    case "knife_thrower":
      drawKnifeThrower(ctx, body, dark, light, accent, A);
      break;
    case "den_bruiser":
      drawDenBruiser(ctx, body, dark, light, accent, A);
      break;
    case "bandit_king":
      ctx.scale(1.25, 1.25); // a crowned colossus of a cutthroat
      drawBanditKing(ctx, body, dark, light, accent, A);
      break;
    case "silencer":
      drawOutlaw(ctx, body, dark, light, accent, A);
      break;
    default:
      drawBrute(ctx, body, dark, light, accent, A);
  }

  ctx.restore();
}

// Each draw fn works in a normalized space (~ -20..20 wide, -28..28 tall).

// Turret — a stubby armored base with a barrel pointing up. Symmetric, so the
// renderer's facing-flip is a no-op.
function drawTurret(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Wide base with shading.
  const bg = ctx.createLinearGradient(0, 8, 0, 20);
  bg.addColorStop(0, body);
  bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-16, 8, 32, 12, 3);
  ctx.fill();
  // Armored housing.
  const hg = ctx.createLinearGradient(0, -4, 0, 10);
  hg.addColorStop(0, light);
  hg.addColorStop(1, body);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(-12, -4, 24, 14, 4);
  ctx.fill();
  // Dome cap.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -4, 10, Math.PI, PI2);
  ctx.fill();
  // Barrel + highlight.
  ctx.fillStyle = dark;
  ctx.fillRect(-4, -22, 8, 18);
  ctx.fillStyle = withShade(dark, 22);
  ctx.fillRect(-4, -22, 3, 18);
  // Glowing muzzle.
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.fillRect(-4, -24, 8, 4);
  ctx.restore();
  // Rivets.
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 1, 3, 3);
  ctx.fillRect(6, 1, 3, 3);
  ctx.fillStyle = withShade(light, 20);
  ctx.fillRect(-9, 1, 1.5, 1.5);
  ctx.fillRect(6, 1, 1.5, 1.5);
}

// Engineer — a stout dwarven fortifier: a lamp-lit hard hat and welder goggles, a
// steam-boiler backpack, a braided beard, and a rivet-gun that spits sparks. The
// gun points forward (to the right) and flips with the unit's facing.
function drawEngineer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // Steam-boiler backpack behind the shoulder (hooped tank + gauge + pipe + steam).
  ctx.fillStyle = withShade(body, -46);
  ctx.beginPath();
  ctx.roundRect(-15, -3, 8, 19, 3);
  ctx.fill();
  ctx.strokeStyle = withShade(body, -64);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-15, 2);
  ctx.lineTo(-7, 2);
  ctx.moveTo(-15, 8);
  ctx.lineTo(-7, 8);
  ctx.stroke();
  ctx.fillStyle = "#d9dde2"; // pressure gauge
  ctx.beginPath();
  ctx.arc(-11, -1, 2.2, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, -1);
  ctx.lineTo(-10, -2.4);
  ctx.stroke();
  ctx.strokeStyle = withShade(accent, -34); // pipe over the shoulder
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-11, -3);
  ctx.quadraticCurveTo(-11, -13, -2, -13);
  ctx.stroke();
  ctx.lineCap = "butt";
  rising(ctx, -11, 3, -3, 16, "rgba(220,224,228,0.9)", A, 4);
  // Stout torso.
  metalBody(ctx, 26, 22, 2, body, dark, light, 5);
  // Plate seam + riveted highlights.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, 9);
  ctx.lineTo(12, 9);
  ctx.stroke();
  const rivets: [number, number][] = [
    [-10, 5],
    [10, 5],
    [-10, 13],
    [10, 13],
  ];
  ctx.fillStyle = dark;
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = light;
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx - 0.5, ry - 0.5, 0.6, 0, PI2);
    ctx.fill();
  }
  // Tool belt + buckle + pouch.
  ctx.fillStyle = dark;
  ctx.fillRect(-13, 15, 26, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(-3, 15, 6, 5);
  ctx.fillStyle = withShade(body, -28);
  ctx.fillRect(6, 15, 5, 6);
  // Head.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -7, 9, 0, PI2);
  ctx.fill();
  // Braided beard with beads.
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(-7, -3);
  ctx.quadraticCurveTo(-8, 7, -3, 8);
  ctx.quadraticCurveTo(0, 10, 3, 8);
  ctx.quadraticCurveTo(8, 7, 7, -3);
  ctx.quadraticCurveTo(0, 1, -7, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-3, 7.5, 1, 0, PI2);
  ctx.arc(3, 7.5, 1, 0, PI2);
  ctx.fill();
  // Hard hat (dome + brim + ridge) with shading.
  const hg = ctx.createLinearGradient(0, -18, 0, -6);
  hg.addColorStop(0, withShade(accent, 30));
  hg.addColorStop(1, accent);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, -9, 9, Math.PI, PI2);
  ctx.fill();
  ctx.fillRect(-11, -9, 22, 3);
  ctx.fillStyle = withShade(accent, -22);
  ctx.fillRect(-1, -18, 2, 9);
  // Glowing head-lamp.
  ctx.save();
  ctx.shadowColor = "#fff2c0";
  ctx.shadowBlur = 6 + A.glow * 7;
  ctx.fillStyle = "#fff2c0";
  ctx.beginPath();
  ctx.arc(0, -10.5, 2.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // Welder goggles (two lenses + strap + accent glint).
  ctx.fillStyle = "#20242a";
  ctx.beginPath();
  ctx.arc(-3.4, -6.5, 2.7, 0, PI2);
  ctx.arc(3.4, -6.5, 2.7, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = withShade(accent, -8);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-1, -6.5);
  ctx.lineTo(1, -6.5);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.fillRect(-4.4, -7.6, 1.4, 1.4);
  ctx.fillRect(2.6, -7.6, 1.4, 1.4);
  ctx.restore();
  // Wrench in the near hand.
  ctx.save();
  ctx.translate(-10, 10);
  ctx.rotate(-0.55);
  ctx.strokeStyle = "#aeb4bc";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#cfd4db";
  ctx.beginPath();
  ctx.arc(0, -1.5, 2.8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -1.5, 1.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // Rivet-gun: wooden grip, boxy receiver + hopper, steel barrel, glowing muzzle.
  ctx.fillStyle = "#5a3d22";
  ctx.fillRect(-9, 4, 10, 5);
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.roundRect(-2, 2, 9, 7, 1.5);
  ctx.fill();
  ctx.fillStyle = withShade(accent, -16);
  ctx.fillRect(1, -1, 3, 4);
  const bg = ctx.createLinearGradient(6, 4, 6, 7);
  bg.addColorStop(0, "#cfd4db");
  bg.addColorStop(1, "#8a9099");
  ctx.fillStyle = bg;
  ctx.fillRect(6, 4.5, 17, 3);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.fillRect(21, 4, 4, 4);
  ctx.restore();
  // Welding sparks spraying forward (motion only).
  if (A.live) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const life = (t * 1.5 + i * 0.8) % 1;
      const sx = 24 + life * 11;
      const sy = 6 + Math.sin(i * 2.3 + t * 7) * 5 * life;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = i % 2 ? "#ffe08a" : accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.1 * (1 - life) + 0.4, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Hunter — a hooded beastmaster ranger drawing a heavy recurve longbow. The bow
// points forward (to the right) and flips with the unit's facing. Its boar and
// scatter traps are their own entities, so the sprite is just the archer figure.
function drawHunter(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // Fur-trimmed cloak behind the shoulders (sways idly).
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.quadraticCurveTo(12 + Math.sin(t * 1.6) * 1.5, 6, 8, 22);
  ctx.lineTo(-8, 22);
  ctx.quadraticCurveTo(-11, 5, -6, -9);
  ctx.closePath();
  ctx.fill();
  // Quiver slung behind, arrows fletched up.
  ctx.save();
  ctx.rotate(-0.15);
  ctx.fillStyle = withShade(body, -42);
  ctx.beginPath();
  ctx.roundRect(-12, -10, 5, 15, 2);
  ctx.fill();
  ctx.restore();
  for (const dx of [-11, -9, -7]) {
    ctx.strokeStyle = "#d8c9a8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx, -9);
    ctx.lineTo(dx - 1.5, -16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(dx - 1.5, -16);
    ctx.lineTo(dx - 3.4, -15);
    ctx.lineTo(dx - 1, -13);
    ctx.closePath();
    ctx.fill();
  }
  // Lean torso.
  metalBody(ctx, 16, 23, -3, body, dark, light, 5);
  // Crossed leather straps.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -1);
  ctx.lineTo(6, 11);
  ctx.moveTo(6, -1);
  ctx.lineTo(-6, 11);
  ctx.stroke();
  ctx.lineCap = "butt";
  // Belt + buckle.
  ctx.fillStyle = withShade(body, -42);
  ctx.fillRect(-8, 11, 16, 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-2, 11, 4, 4);
  // Fur ruff across the shoulders.
  ctx.fillStyle = withShade(accent, -4);
  for (const px of [-7, -4, -1, 2, 5]) {
    ctx.beginPath();
    ctx.arc(px, -6, 2.8, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = withShade(accent, 20);
  for (const px of [-6, -2, 2]) {
    ctx.beginPath();
    ctx.arc(px, -7, 1.1, 0, PI2);
    ctx.fill();
  }
  // Head under the hood (mostly shadowed).
  ctx.fillStyle = "#c2a374";
  ctx.beginPath();
  ctx.arc(1, -12, 5.6, 0, PI2);
  ctx.fill();
  // Deep hood + peak.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-5, -10);
  ctx.quadraticCurveTo(-7, -22, 2, -21);
  ctx.quadraticCurveTo(9, -20, 7, -9);
  ctx.quadraticCurveTo(1, -13, -5, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, -21);
  ctx.quadraticCurveTo(-2, -24, -5, -22);
  ctx.quadraticCurveTo(-1, -20, 2, -20);
  ctx.closePath();
  ctx.fill();
  // Face recess shadow.
  ctx.fillStyle = "#12140e";
  ctx.beginPath();
  ctx.ellipse(2, -11, 3, 3.2, 0, 0, PI2);
  ctx.fill();
  // Glowing eyes.
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.fillRect(0.4, -11.6, 1.5, 1.3);
  ctx.fillRect(2.8, -11.6, 1.5, 1.3);
  ctx.restore();
  // Heavy recurve longbow (right hand) with a nocked broadhead.
  const bg = ctx.createLinearGradient(10, -18, 10, 14);
  bg.addColorStop(0, withShade(accent, 28));
  bg.addColorStop(0.5, accent);
  bg.addColorStop(1, withShade(accent, -28));
  ctx.strokeStyle = bg;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(12, -2, 17, -Math.PI / 2.5, Math.PI / 2.5);
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(18.5, -15.8, 3, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(18.5, 11.8, 3, Math.PI * 0.3, Math.PI * 1.1);
  ctx.stroke();
  ctx.lineCap = "butt";
  // String.
  ctx.strokeStyle = "#eaeaea";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18.6, -16.4);
  ctx.lineTo(6, -2);
  ctx.lineTo(18.6, 12.4);
  ctx.stroke();
  // Nocked arrow + broadhead.
  ctx.strokeStyle = "#c9b78f";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(3, -2);
  ctx.lineTo(20, -2);
  ctx.stroke();
  ctx.fillStyle = "#e8eef2";
  ctx.beginPath();
  ctx.moveTo(23, -2);
  ctx.lineTo(19, -4);
  ctx.lineTo(19, 0);
  ctx.closePath();
  ctx.fill();
  // Drawing hand at the nock.
  ctx.fillStyle = "#a5854f";
  ctx.beginPath();
  ctx.arc(6, -2, 2, 0, PI2);
  ctx.fill();
  // Drifting motes (tan pollen/dust) — presentation only.
  rising(ctx, 0, 9, 20, 24, accent, A, 5);
}

function drawOgre(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // dust kicked up around the feet (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = "#a8a29e";
    for (let i = 0; i < 2; i++) {
      const life = (A.t * 0.35 + i * 1.3) % 1;
      ctx.globalAlpha = (1 - life) * 0.22;
      ctx.beginPath();
      ctx.arc(-12 + i * 24 + Math.sin(A.t + i) * 2, 23 - life * 4, 1.5 + life * 2.5, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // pear-shaped belly volume with a rim light
  const tg = ctx.createLinearGradient(0, -12, 0, 22);
  tg.addColorStop(0, light);
  tg.addColorStop(0.5, body);
  tg.addColorStop(1, dark);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-17, -4);
  ctx.quadraticCurveTo(-16, -12, 0, -12);
  ctx.quadraticCurveTo(16, -12, 17, -4);
  ctx.quadraticCurveTo(19, 10, 13, 21);
  ctx.lineTo(-13, 21);
  ctx.quadraticCurveTo(-19, 10, -17, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-16.4, -2);
  ctx.quadraticCurveTo(-17, 10, -12.5, 19.5);
  ctx.stroke();
  // belly highlight + navel
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = withShade(body, 18);
  ctx.beginPath();
  ctx.ellipse(0, 9, 9.5, 7.5, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 11, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rope belt with a bone charm
  ctx.strokeStyle = "#8a6a3f";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-16, 13.5);
  ctx.quadraticCurveTo(0, 15.5, 16, 13.5);
  ctx.stroke();
  ctx.fillStyle = "#8a6a3f";
  ctx.beginPath();
  ctx.arc(-6, 14.6, 1.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#e7e5e4";
  ctx.fillRect(-6.7, 15.4, 1.6, 3.6);
  // ragged loincloth
  ctx.fillStyle = "#4a3320";
  ctx.beginPath();
  ctx.moveTo(-8, 15);
  ctx.lineTo(8, 15);
  ctx.lineTo(6, 22);
  ctx.lineTo(3, 18.5);
  ctx.lineTo(0, 23);
  ctx.lineTo(-3, 18.5);
  ctx.lineTo(-6, 22);
  ctx.closePath();
  ctx.fill();
  // head with a heavy underbite jaw
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 11, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.beginPath();
  ctx.arc(0, -10, 11, 0.15 * Math.PI, 0.85 * Math.PI); // jaw shadow
  ctx.fill();
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.roundRect(-8.5, -6.5, 17, 7, 3);
  ctx.fill();
  // upturned jaw tusks
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(-7.5, -4);
  ctx.lineTo(-5.8, -11.5);
  ctx.lineTo(-4.2, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.2, -4);
  ctx.lineTo(5.8, -11.5);
  ctx.lineTo(7.5, -4);
  ctx.closePath();
  ctx.fill();
  // brow
  ctx.fillStyle = dark;
  ctx.fillRect(-9, -14.5, 18, 3);
  // eyes with a faint accent glint
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-5.5, -11, 3, 2.6);
  ctx.fillRect(2.5, -11, 3, 2.6);
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-4.5, -10.6, 1.2, 1.2);
  ctx.fillRect(3.5, -10.6, 1.2, 1.2);
  ctx.restore();
  // cheek scar
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, -17);
  ctx.lineTo(8.5, -9);
  ctx.stroke();
  // tapered club: grained wood, iron band, magma head
  ctx.fillStyle = "#6b4423";
  ctx.beginPath();
  ctx.moveTo(11.5, 17);
  ctx.lineTo(16, 17);
  ctx.lineTo(19.5, -3);
  ctx.lineTo(10.5, -3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(13, 14);
  ctx.lineTo(14.5, 2);
  ctx.moveTo(15.5, 10);
  ctx.lineTo(16.5, 3);
  ctx.stroke();
  ctx.fillStyle = "#7d7f85";
  ctx.fillRect(11, 3, 8, 3);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(11, 3, 8, 1);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(15, -9, 8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // dark crust cracks over the magma
  ctx.strokeStyle = "#3b2510";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(9, -11);
  ctx.lineTo(14, -9);
  ctx.lineTo(12, -5);
  ctx.moveTo(16, -15);
  ctx.lineTo(15.5, -10);
  ctx.lineTo(20, -8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(12.6, -11.5, 2.2, 0, PI2);
  ctx.fill();
  // embers venting off the club head
  rising(ctx, 15, 3, -5, 18, accent, A, 3);
}

// Generic hulking humanoid — used by the zombie shambler (rot palette) and as
// the fallback body for any unit without its own draw routine.
// Elder Treant — the Overgrowth boss: a colossal ancient guardian-tree. A thick
// twisted trunk with a stern face carved into the bark (heavy brow, deep glowing
// eyes, a grim cracked maw), raised gnarled clawed arms and a craggy asymmetric
// canopy. Scaled up at the call site; pulsing eyes + drifting leaves for life.
// (Other explored directions kept in docs/elder-treant-mockups.md.)
function drawElderTreant(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const canopyD = withShade(accent, -28);
  const canopyL = withShade(accent, 30);
  // gnarled root-claw legs
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 7, 18);
    ctx.lineTo(s * 15, 27);
    ctx.lineTo(s * 10, 21);
    ctx.lineTo(s * 13, 27);
    ctx.lineTo(s * 5, 22);
    ctx.closePath();
    ctx.fill();
  }
  // thick twisted trunk (shaded volume)
  const g = ctx.createLinearGradient(0, -10, 0, 22);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-9, 20);
  ctx.quadraticCurveTo(-7, 4, -9, -9);
  ctx.quadraticCurveTo(-4, -12, -3, -7);
  ctx.quadraticCurveTo(0, -11, 3, -7);
  ctx.quadraticCurveTo(4, -12, 9, -9);
  ctx.quadraticCurveTo(7, 4, 9, 20);
  ctx.closePath();
  ctx.fill();
  // bark grain
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3, 18);
  ctx.quadraticCurveTo(-1, 4, -3, -7);
  ctx.moveTo(4, 18);
  ctx.quadraticCurveTo(2, 4, 3, -7);
  ctx.stroke();
  // heavy gnarled branch arms with clawed twigs
  ctx.strokeStyle = body;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.quadraticCurveTo(-15, -7, -19, -17);
  ctx.moveTo(6, -3);
  ctx.quadraticCurveTo(15, -7, 19, -17);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  for (const [hx, hy, d] of [[-19, -17, -1], [19, -17, 1]] as const) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + d * 3.5, hy - 4 + i * 3.2);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // craggy asymmetric canopy (not a round ball)
  ctx.fillStyle = canopyD;
  for (const [cx, cy, r] of [[-11, -19, 7], [-2, -25, 8.5], [9, -21, 6.5], [3, -16, 6], [14, -15, 4]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = accent;
  for (const [cx, cy, r] of [[-9, -20, 5], [-1, -26, 6], [8, -22, 4.5]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = canopyL;
  ctx.beginPath();
  ctx.arc(-3, -27, 2.4, 0, PI2);
  ctx.fill();
  // moss on the bark
  ctx.fillStyle = withShade(accent, -6);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-6, 10, 2.6, 4, 0.3, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // FACE carved into the bark — heavy brow
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-6, -3.5);
  ctx.quadraticCurveTo(0, -6, 6, -3.5);
  ctx.lineTo(5, -1.5);
  ctx.quadraticCurveTo(0, -3.5, -5, -1.5);
  ctx.closePath();
  ctx.fill();
  // deep eye hollows + pulsing glowing eyes
  ctx.fillStyle = "#140f08";
  ctx.beginPath();
  ctx.ellipse(-3.2, 0.5, 1.9, 2.6, 0, 0, PI2);
  ctx.ellipse(3.2, 0.5, 1.9, 2.6, 0, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = "#fde68a";
  ctx.shadowColor = "#fde68a";
  ctx.shadowBlur = 4 + A.glow * 5;
  ctx.beginPath();
  ctx.arc(-3.2, 1, 1.1 + A.glow * 0.2, 0, PI2);
  ctx.arc(3.2, 1, 1.1 + A.glow * 0.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // grim cracked maw
  ctx.strokeStyle = "#140f08";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, 7);
  ctx.lineTo(-1.5, 8.5);
  ctx.lineTo(1.5, 7);
  ctx.lineTo(4, 8.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // leaves drifting down from the canopy (liveliness)
  if (A.live) {
    ctx.fillStyle = accent;
    for (let i = 0; i < 5; i++) {
      const seed = i * 1.9;
      const life = (A.t * 0.4 + seed) % 1;
      const lx = -12 + i * 6 + Math.sin(A.t * 2 + seed) * 4;
      const ly = -22 + life * 44;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 1.8, 1, Math.sin(seed), 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// A swollen fungal bloom (the Overgrowth's Spore Pod): a squat stalk under a
// bulbous spotted cap. Ignores the SpriteAnim (portrait-stub safe).
function drawSporePod(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const breathe = A.live ? 1 + Math.sin(A.t * 2) * 0.05 : 1;
  // stalk
  ctx.fillStyle = dark;
  ctx.fillRect(-4, 2, 8, 18);
  // roots
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-3, 20);
  ctx.lineTo(-6, 23);
  ctx.moveTo(0, 20);
  ctx.lineTo(0, 23);
  ctx.moveTo(3, 20);
  ctx.lineTo(6, 23);
  ctx.stroke();
  ctx.lineCap = "butt";
  // bulbous cap (gently breathes)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -2, 16 * breathe, 13 * breathe, 0, 0, PI2);
  ctx.fill();
  // cap highlight
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(-5, -6, 6, 4, 0, 0, PI2);
  ctx.fill();
  // gills under the rim
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.4;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.6, 8);
    ctx.lineTo(i * 3.4, 11);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // spore spots (pulse + faint glow)
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = ([[-8, -4], [6, -8], [9, 0], [-2, 2], [2, -11]] as const)[i];
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(A.t * 3 + i * 1.3);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
  // puffing spore cloud rising off the cap (liveliness)
  rising(ctx, 0, 13, -6, 22, accent, A, 4);
}

// (The old shared drawWisp is retired — the Arcane Wisp and Light Wisp now have
//  their own bespoke draws in the dungeon bestiary: drawArcaneWisp / drawLightWisp.)

function drawBrute(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  metalBody(ctx, 22, 24, -2, body, dark, light, 5);
  ctx.fillStyle = dark;
  ctx.fillRect(-11, 12, 22, 8);
  // war-paint stripe
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(-11, 4, 22, 2);
  ctx.globalAlpha = 1;
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // tusks
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-4, -4, 2, 4);
  ctx.fillRect(2, -4, 2, 4);
  // eyes with a faint accent glint
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -12, 2, 2);
  ctx.fillRect(2, -12, 2, 2);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-4, -12, 1, 1);
  ctx.fillRect(2, -12, 1, 1);
  ctx.globalAlpha = 1;
  // big two-handed axe in the right hand
  drawBigAxe(ctx, 12, -2, 1);
}

// ---- zombie shambler -------------------------------------------------------
// Two body variants picked per-unit via variantOf(uid) so Depths hordes read
// as a mob, not clones: 0 = hunched reacher in rags, 1 = stitched gut-buster.
// Both share the zombie head (slack jaw, empty socket, milky eye, skull crack)
// and one arm per side. User-approved from canvas mockups.

/** A drooping zombie arm from shoulder (sx,sy) to hand (ex,ey), with fingers. */
function zombieArm(ctx: Ctx, sx: number, sy: number, ex: number, ey: number, col: string) {
  ctx.strokeStyle = col;
  ctx.lineWidth = 4.2;
  ctx.lineCap = "round";
  const mx = (sx + ex) / 2 + (ex > sx ? 1.5 : -1.5);
  const my = (sy + ey) / 2 - 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  const d = ex > sx ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + d * 2.6, ey + 0.8 + i * 1.3);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/** Zombie head: tilted, slack hanging jaw with teeth, one empty socket, one
 *  milky eye, sunken brow, and a skull crack. */
function zombieHead(
  ctx: Ctx,
  body: string,
  light: string,
  accent: string,
  hx: number,
  hy: number,
  tilt: number,
  r: number
) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // sunken brow
  ctx.fillStyle = withShade(body, -30);
  ctx.fillRect(-r * 0.66, -r * 0.5, r * 1.32, 1.8);
  // gaping mouth void + teeth
  ctx.fillStyle = "#1c1713";
  ctx.fillRect(-1, r * 0.28, r * 0.8 + 1, r * 0.42);
  ctx.fillStyle = accent;
  for (let i = 0; i < 3; i++) ctx.fillRect(-0.5 + i * 2.1, r * 0.28, 1.1, 1.3);
  // slack lower jaw hanging off
  ctx.fillStyle = withShade(body, -8);
  ctx.beginPath();
  ctx.roundRect(-1.5, r * 0.72, r * 0.9 + 2, 2.6, 1.2);
  ctx.fill();
  // left: empty socket; right: milky eye
  ctx.fillStyle = "#161311";
  ctx.fillRect(-r * 0.5, -r * 0.28, 2.6, 2.6);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 0.1, 1.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(r * 0.34, -r * 0.1, 0.5, 0, PI2);
  ctx.fill();
  // skull crack
  ctx.strokeStyle = withShade(body, -38);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r);
  ctx.lineTo(-r * 0.05, -r * 0.6);
  ctx.lineTo(-r * 0.35, -r * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** Short stitch seam at (x,y), rotated by ang, with n cross-bars. */
function zombieStitches(ctx: Ctx, x: number, y: number, ang: number, n: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = "#3c332a";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(n * 2.4, 0);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(1.2 + i * 2.4, -1.4);
    ctx.lineTo(1.2 + i * 2.4, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZombieShambler(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  variant: 0 | 1
) {
  if (variant === 0) {
    // hunched reacher: rags, ribs through a tear, one arm limp / one reaching
    ctx.save();
    ctx.rotate(0.07); // whole-body forward slump
    zombieArm(ctx, -9, 0, -14, 10, withShade(body, -12)); // limp arm at its side
    metalBody(ctx, 20, 22, -2, body, dark, light, 5);
    // tattered shirt with a zigzag hem
    ctx.fillStyle = withShade(body, -28);
    ctx.beginPath();
    ctx.moveTo(-10, 1);
    ctx.lineTo(10, 1);
    ctx.lineTo(10, 8);
    ctx.lineTo(7, 13);
    ctx.lineTo(5, 9);
    ctx.lineTo(2, 13.5);
    ctx.lineTo(-1, 9.5);
    ctx.lineTo(-4, 14);
    ctx.lineTo(-7, 9.5);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    // torn shoulder hole showing skin
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(-8, 1.5);
    ctx.lineTo(-4.5, 1.5);
    ctx.lineTo(-6.5, 4.5);
    ctx.closePath();
    ctx.fill();
    // torn trousers
    ctx.fillStyle = dark;
    ctx.fillRect(-10, 14, 20, 7);
    // ribs peeking through a side tear
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-6, 4 + i * 2.6, 3, -0.5, 0.9);
      ctx.stroke();
    }
    zombieStitches(ctx, 1, 6, 0.4, 3);
    zombieHead(ctx, body, light, accent, 3.5, -11, 0.14, 8);
    zombieArm(ctx, 9, -1, 16, 5, light); // reaching arm, dropped to mid height
    ctx.restore();
  } else {
    // gut-buster: swollen stitched belly, small sunken head, knuckle-draggers
    ctx.save();
    ctx.rotate(0.05);
    zombieArm(ctx, -9, -1, -15, 13, withShade(body, -12));
    metalBody(ctx, 22, 22, -2, body, dark, light, 6);
    // swollen belly
    const bg = ctx.createLinearGradient(0, 2, 0, 18);
    bg.addColorStop(0, light);
    bg.addColorStop(1, withShade(body, -25));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0.5, 10, 11, 8.5, 0, 0, PI2);
    ctx.fill();
    // stitched scar across it
    ctx.strokeStyle = "#3c332a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.quadraticCurveTo(0, 11, 9, 8.5);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = -8 + t * 17;
      const y = 7 + Math.sin(t * Math.PI) * 3.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 1.7);
      ctx.lineTo(x + 0.8, y + 1.7);
      ctx.stroke();
    }
    // rot blotches
    ctx.fillStyle = withShade(body, -20);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(-5, 12.5, 2.4, 1.7, 0.4, 0, PI2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, 13, 1.8, 1.3, -0.3, 0, PI2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // maggot hole
    ctx.fillStyle = "#241d16";
    ctx.beginPath();
    ctx.arc(2.5, 12.6, 1.2, 0, PI2);
    ctx.fill();
    zombieHead(ctx, body, light, accent, 3.5, -12, 0.1, 6.8);
    zombieArm(ctx, 10, -1, 16, 12, light);
    ctx.restore();
  }
}

// Orc — a bare-chested warband champion: carved abs, spiked iron pauldrons,
// a fang necklace, and pointed ears. Big axe stays in the right hand.
function drawOrc(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Bloodlust: an ever-present red rage aura that swells on a lub-dub heartbeat.
  // Presentation-only (from A.t); the same beat flashes the eyes and flushes the
  // body below. Static portraits (cards) show a steady glow, not a frozen thump.
  const bp = A.t % 1.05;
  const pulse = Math.min(
    1,
    Math.exp(-Math.pow(bp * 10, 2)) + 0.7 * Math.exp(-Math.pow((bp - 0.19) * 10, 2))
  );
  const beat = A.live ? pulse : 0.4;
  ctx.save();
  const auraR = 30 * (1 + 0.05 * beat);
  const aura = ctx.createRadialGradient(0, 3, 3, 0, 3, auraR);
  aura.addColorStop(0, `rgba(239,68,68,${0.3 + 0.28 * beat})`);
  aura.addColorStop(0.5, `rgba(220,38,38,${0.12 + 0.16 * beat})`);
  aura.addColorStop(1, "rgba(127,29,29,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.ellipse(0, 3, auraR, auraR * 1.08, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bare muscled torso
  metalBody(ctx, 24, 24, -2, body, dark, light, 6);
  // pec + ab definition carved into the gradient
  ctx.strokeStyle = withShade(body, -38);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.quadraticCurveTo(0, 5, 8, 2); // pec line
  ctx.moveTo(0, 4);
  ctx.lineTo(0, 14); // center channel
  ctx.moveTo(-5, 7);
  ctx.quadraticCurveTo(0, 8.5, 5, 7); // ab rows
  ctx.moveTo(-5, 11);
  ctx.quadraticCurveTo(0, 12.5, 5, 11);
  ctx.stroke();
  // embossed highlight just under each ab crease
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4.5, 8.2);
  ctx.quadraticCurveTo(0, 9.7, 4.5, 8.2);
  ctx.moveTo(-4.5, 12.2);
  ctx.quadraticCurveTo(0, 13.7, 4.5, 12.2);
  ctx.stroke();
  // war-paint slash across the chest
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.save();
  ctx.rotate(-0.18);
  ctx.fillRect(-11, 0, 22, 2.4);
  ctx.restore();
  ctx.globalAlpha = 1;
  // hide belt with a fang buckle
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 15, 24, 7);
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(-1.8, 16);
  ctx.lineTo(1.8, 16);
  ctx.lineTo(0, 20.5);
  ctx.closePath();
  ctx.fill();
  // pointed ears poking out past the jaw
  for (const side of [-1, 1] as const) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(side * 7, -13);
    ctx.lineTo(side * 15, -17);
    ctx.lineTo(side * 8, -8);
    ctx.closePath();
    ctx.fill();
    // inner-ear shade
    ctx.fillStyle = withShade(body, -20);
    ctx.beginPath();
    ctx.moveTo(side * 8.5, -12.5);
    ctx.lineTo(side * 13, -15.5);
    ctx.lineTo(side * 8.8, -9.5);
    ctx.closePath();
    ctx.fill();
  }
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // heavy brow shadow
  ctx.fillStyle = withShade(body, -30);
  ctx.fillRect(-6, -14.5, 12, 2);
  // tusks jutting up from the underbite
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-4.5, -4.5, 2.4, 5);
  ctx.fillRect(2.1, -4.5, 2.4, 5);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(-4.5, -4.5, 1, 1.6);
  ctx.fillRect(2.1, -4.5, 1, 1.6);
  // eyes — pupils flash red with the heartbeat (bloodlust)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -12, 2, 2);
  ctx.fillRect(2, -12, 2, 2);
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.5 * beat;
  ctx.fillStyle = "#ff3b30";
  ctx.shadowColor = "#ff3b30";
  ctx.shadowBlur = 3 + 9 * beat;
  ctx.fillRect(-4.1, -12.2, 2.2, 2.4);
  ctx.fillRect(1.9, -12.2, 2.2, 2.4);
  ctx.restore();
  // fang necklace on a leather cord
  ctx.strokeStyle = "#3a2a18";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.quadraticCurveTo(0, 4, 9, -2);
  ctx.stroke();
  for (const [fx, fy, fs] of [
    [-6, -0.6, 2.6],
    [-3, 0.8, 3.2],
    [0, 1.4, 3.8],
    [3, 0.8, 3.2],
    [6, -0.6, 2.6],
  ] as const) {
    ctx.fillStyle = "#f3f3e0";
    ctx.beginPath();
    ctx.moveTo(fx - 1.4, fy);
    ctx.lineTo(fx + 1.4, fy);
    ctx.lineTo(fx, fy + fs);
    ctx.closePath();
    ctx.fill();
  }
  // spiked iron pauldrons capping both shoulders
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 12, -4);
    ctx.scale(side, 1);
    // bone spike jutting up and out
    ctx.fillStyle = "#e8e6d4";
    ctx.beginPath();
    ctx.moveTo(1, -4);
    ctx.lineTo(7, -11);
    ctx.lineTo(4.5, -3);
    ctx.closePath();
    ctx.fill();
    // dome plate with an iron gradient
    const pg = ctx.createLinearGradient(0, -6, 0, 5);
    pg.addColorStop(0, "#82868f");
    pg.addColorStop(1, "#474a52");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 1, 7.5, Math.PI, 0);
    ctx.quadraticCurveTo(7.5, 4.5, 5, 5);
    ctx.lineTo(-5, 5);
    ctx.quadraticCurveTo(-7.5, 4.5, -7.5, 1);
    ctx.closePath();
    ctx.fill();
    // rim + rivets
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 1, 6.8, -Math.PI, -Math.PI * 0.25);
    ctx.stroke();
    ctx.fillStyle = "#2e3036";
    for (const rx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.arc(rx, 2.2, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // double-bit war axe held two-handed at a diagonal ready
  drawOrcWarAxe(ctx, body, light, accent);
  // rage flush: the whole figure reddens on each heartbeat (additive).
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.06 + 0.15 * beat;
  const flush = ctx.createRadialGradient(0, 3, 2, 0, 3, 24);
  flush.addColorStop(0, "rgba(255,70,70,0.85)");
  flush.addColorStop(1, "rgba(255,0,0,0)");
  ctx.fillStyle = flush;
  ctx.beginPath();
  ctx.ellipse(0, 3, 22, 26, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
}

/** The orc's double-bit battle axe: crude jagged iron bits flanking a socket
 *  with a forward pike, a leather-wrapped haft with a bone butt-spike, and
 *  both fists on the grip. Drawn at a diagonal two-handed carry. */
function drawOrcWarAxe(ctx: Ctx, body: string, light: string, accent: string) {
  ctx.save();
  ctx.translate(0, 3.5);
  ctx.rotate(-0.35);
  // rough dark haft
  ctx.strokeStyle = "#463020";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-17, 0);
  ctx.lineTo(16, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-16, -1);
  ctx.lineTo(11, -1);
  ctx.stroke();
  ctx.lineCap = "butt";
  // leather grip wraps
  ctx.fillStyle = "#2c1f13";
  ctx.fillRect(-10, -2.1, 4.4, 4.2);
  ctx.fillRect(2.6, -2.1, 4.4, 4.2);
  // bone butt-spike
  ctx.fillStyle = "#e8e6d4";
  ctx.beginPath();
  ctx.moveTo(-17, -1.7);
  ctx.lineTo(-21.5, 0);
  ctx.lineTo(-17, 1.7);
  ctx.closePath();
  ctx.fill();
  // two mirrored bits flaring off the head
  for (const s of [-1, 1] as const) {
    ctx.save();
    ctx.scale(1, s);
    const g = ctx.createLinearGradient(11, -12, 21, -2);
    g.addColorStop(0, "#7d828c");
    g.addColorStop(1, "#464a52");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(14.2, -2);
    ctx.bezierCurveTo(12.5, -4.5, 11.5, -6.5, 11, -9); // concave throat toward the haft
    ctx.lineTo(13.5, -8); // jagged, chipped cutting edge
    ctx.lineTo(15.5, -11);
    ctx.lineTo(18, -8.6);
    ctx.lineTo(20.5, -10.5);
    ctx.bezierCurveTo(21.5, -6.5, 21, -4, 19.5, -2);
    ctx.closePath();
    ctx.fill();
    // chipped-edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, -9);
    ctx.lineTo(13.5, -8);
    ctx.lineTo(15.5, -11);
    ctx.lineTo(18, -8.6);
    ctx.lineTo(20.5, -10.5);
    ctx.stroke();
    ctx.restore();
  }
  // iron socket band over the haft between the bits
  ctx.fillStyle = "#33363c";
  ctx.fillRect(13.6, -2.6, 6.6, 5.2);
  ctx.fillStyle = "#2e3036";
  ctx.beginPath();
  ctx.arc(16.9, 0, 1, 0, PI2);
  ctx.fill();
  // forward pike between the bits
  ctx.fillStyle = "#7d828c";
  ctx.beginPath();
  ctx.moveTo(20.2, -1.6);
  ctx.lineTo(26, 0);
  ctx.lineTo(20.2, 1.6);
  ctx.closePath();
  ctx.fill();
  // war-paint slashes on the upper bit cheek
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(14, -7.5);
  ctx.lineTo(17.5, -3.5);
  ctx.moveTo(16.5, -8);
  ctx.lineTo(19, -5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // both fists gripping the wraps
  for (const hx of [-7.8, 4.8]) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(hx, 0, 2.7, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = withShade(body, -25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, 0, 2.7, 0, PI2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 2, -0.8);
    ctx.lineTo(hx + 2, -0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** The deep-cowl archer hood (2026-07-05 mockup pick B): a pitch-black face with
 *  two glowing eyes, an outer shell + inner lip, and a drape over the shoulders.
 *  Every color derives from the caller's `body`/`accent`, so it repaints itself
 *  for whoever wears it — the Ranger's forest green, the Archer's tan leather,
 *  the Warlock's ember-red. Shared by drawRanger and drawWarlock.
 *  Leaves fillStyle/strokeStyle dirty exactly as the inline block did; callers
 *  set their own before the next shape.
 *
 *  `fillCavity`: the face circle, hood shell and drape don't quite meet — they
 *  leave bare wedges either side of the face (~±4..5.4, y -9..-6.5) that show
 *  whatever is behind the unit. The Ranger/Archer have always had them (their
 *  quiver+cape sit behind, so nothing reads through); the Warlock's are visible,
 *  so it packs the cowl silhouette black first. Everything else draws on top, so
 *  this ONLY changes those gaps. Off by default = Ranger/Archer untouched. */
function deepCowlHood(ctx: Ctx, body: string, accent: string, A: SpriteAnim, fillCavity = false) {
  if (fillCavity) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(-6.6, -9.6);
    ctx.quadraticCurveTo(-7.4, -19, 0, -19.8);
    ctx.quadraticCurveTo(7.4, -19, 6.6, -9.6);
    ctx.lineTo(7.0, -5.5);
    ctx.quadraticCurveTo(0, -2.5, -7.0, -5.5);
    ctx.closePath();
    ctx.fill();
  }
  // shadowed face with glowing eyes (same trick as the Rogue's hood-eyes)
  ctx.fillStyle = "#141410";
  ctx.beginPath();
  ctx.arc(0, -12, 5.6, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 5;
  ctx.fillRect(-2.8, -12.6, 1.9, 1.6);
  ctx.fillRect(1, -12.6, 1.9, 1.6);
  ctx.restore();
  // deep cowl: outer shell + inner lip shading the face
  const hd = withShade(body, -40);
  ctx.fillStyle = hd;
  ctx.beginPath();
  ctx.moveTo(-6.6, -9.6);
  ctx.quadraticCurveTo(-7.4, -19, 0, -19.8);
  ctx.quadraticCurveTo(7.4, -19, 6.6, -9.6);
  ctx.quadraticCurveTo(7.4, -7, 5.4, -7.6);
  ctx.quadraticCurveTo(6, -14.8, 0, -16.4);
  ctx.quadraticCurveTo(-6, -14.8, -5.4, -7.6);
  ctx.quadraticCurveTo(-7.4, -7, -6.6, -9.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5.4, -8);
  ctx.quadraticCurveTo(-6, -15.2, 0, -16.6);
  ctx.quadraticCurveTo(6, -15.2, 5.4, -8);
  ctx.quadraticCurveTo(4, -15, 0, -15.4);
  ctx.quadraticCurveTo(-4, -15, -5.4, -8);
  ctx.closePath();
  ctx.fill();
  // cowl drape over the shoulders
  ctx.beginPath();
  ctx.moveTo(-7, -7.6);
  ctx.quadraticCurveTo(0, -4.4, 7, -7.6);
  ctx.quadraticCurveTo(7.6, -4.6, 6.2, -3.2);
  ctx.quadraticCurveTo(0, -0.8, -6.2, -3.2);
  ctx.quadraticCurveTo(-7.6, -4.6, -7, -7.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withShade(body, 25);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-6.4, -4);
  ctx.quadraticCurveTo(0, -1.8, 6.4, -4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-5.6, -12);
  ctx.quadraticCurveTo(0, -18.8, 5.6, -12);
  ctx.stroke();
}

// Ranger — the deep-cowl hooded archer sprite (2026-07-05 mockup pick B):
// shadowed face with glowing eyes, shoulder mantle over a long swaying cape,
// recurve wooden bow with leather wraps. The Archer draws the SAME sprite as a
// recolor with `arrows: 1`; the Ranger's volley fan (3) stays its signature.
function drawRanger(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim, arrows: 1 | 3 = 3) {
  // long swaying travel cape behind (deep-cowl look, 2026-07-05 mockup pick B)
  const sway = Math.sin(A.t * 1.6) * 1.5;
  ctx.fillStyle = withShade(body, -25);
  ctx.beginPath();
  ctx.moveTo(-2, -10);
  ctx.quadraticCurveTo(-13, -3, -11 + sway, 21);
  ctx.lineTo(-4 + sway * 0.5, 19);
  ctx.quadraticCurveTo(-8, 1, -1, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10.5 + sway, 20);
  ctx.lineTo(-4.5 + sway * 0.5, 18.4);
  ctx.stroke();
  // hip quiver, angled, stuffed with arrows
  ctx.save();
  ctx.translate(-7, 9);
  ctx.rotate(0.5);
  ctx.fillStyle = withShade(body, -35);
  ctx.beginPath();
  ctx.roundRect(-2.5, -6, 5, 12, 2);
  ctx.fill();
  ctx.strokeStyle = "#d8c9a8";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1.5, -6);
  ctx.lineTo(-1.5, -9);
  ctx.moveTo(0, -6);
  ctx.lineTo(0, -9.6);
  ctx.moveTo(1.5, -6);
  ctx.lineTo(1.5, -8.8);
  ctx.stroke();
  ctx.restore();
  metalBody(ctx, 15, 20, -2, body, dark, light, 4.5);
  // leather belt with a gold buckle
  ctx.strokeStyle = "#795548";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.lineTo(7, 6.5);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(-0.8, 4.4, 2, 2);
  // shoulder mantle layered over the cape
  ctx.fillStyle = withShade(body, -32);
  ctx.beginPath();
  ctx.moveTo(-8.4, -6.4);
  ctx.quadraticCurveTo(0, -2.4, 8.4, -6.4);
  ctx.lineTo(7, -1.6);
  ctx.quadraticCurveTo(0, 1.6, -7, -1.6);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-7, -1.6);
  ctx.quadraticCurveTo(0, 1.6, 7, -1.6);
  ctx.stroke();
  ctx.restore();
  deepCowlHood(ctx, body, accent, A);
  // recurve wooden bow: dark outline, wood core, leather wraps at the limb
  // joints and grip
  ctx.strokeStyle = "#6b4420";
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  ctx.moveTo(13.4, -12.6);
  ctx.quadraticCurveTo(15.5, -10.5, 19.5, -6.5);
  ctx.quadraticCurveTo(22.5, -2, 19.5, 2.5);
  ctx.quadraticCurveTo(15.5, 6.5, 13.4, 8.6);
  ctx.stroke();
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(13.4, -12.6);
  ctx.quadraticCurveTo(15.5, -10.5, 19.5, -6.5);
  ctx.quadraticCurveTo(22.5, -2, 19.5, 2.5);
  ctx.quadraticCurveTo(15.5, 6.5, 13.4, 8.6);
  ctx.stroke();
  ctx.strokeStyle = "#4e342e";
  ctx.lineWidth = 3.4;
  for (const [x1, y1, x2, y2] of [
    [19.2, -6.9, 20.4, -5.3],
    [20.4, 1.3, 19.2, 2.9],
    [20.9, -2.8, 20.9, -1.2],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#795548";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(20.9, -2.6);
  ctx.lineTo(20.9, -1.4);
  ctx.stroke();
  // string drawn to the nock
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(13.4, -12.6);
  ctx.lineTo(4, -2);
  ctx.lineTo(13.4, 8.6);
  ctx.stroke();
  // arrows from the nock: the Ranger's volley fan, or a lone nocked arrow
  ctx.strokeStyle = "#d8c9a8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(16, -2);
  if (arrows === 3) {
    ctx.moveTo(4, -2);
    ctx.lineTo(15, -8);
    ctx.moveTo(4, -2);
    ctx.lineTo(15, 4);
  }
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(17.4, -2);
  ctx.lineTo(14.4, -3.5);
  ctx.lineTo(14.4, -0.5);
  ctx.closePath();
  ctx.fill();
  if (arrows === 3) {
    ctx.beginPath();
    ctx.moveTo(16.4, -8.8);
    ctx.lineTo(13.2, -9.2);
    ctx.lineTo(14.6, -6.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16.4, 4.8);
    ctx.lineTo(14.6, 2.4);
    ctx.lineTo(13.2, 5.2);
    ctx.closePath();
    ctx.fill();
  }
  // tip glints + drifting feather motes (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 3 + A.glow * 4;
    ctx.globalAlpha = 0.4 + A.glow * 0.5;
    const tips =
      arrows === 3 ? [[17, -2], [15.8, -8.4], [15.8, 4.4]] : [[17, -2]];
    for (const [px, py] of tips) {
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#f5f0e1";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const seed = i * 2.2;
      const life = (A.t * 0.3 + seed * 0.37) % 1;
      const x = -15 + i * 5 + Math.sin(A.t * 1.2 + seed) * 2.5;
      const y = -16 + life * 30;
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - 1.5, y);
      ctx.quadraticCurveTo(x, y - 1.4, x + 1.5, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

interface KnightLivery {
  plume: string;
  plumeDark: string;
  cape: string;
  shield: string;
  shieldDark: string;
  trim: string;
  gem: string;
}

// The Knight wears gold-and-royal-blue heraldry (the design mockup); the Holy
// Knight a white-and-gold paladin livery. Same body, per-unit colours.
const KNIGHT_LIVERY: KnightLivery = {
  plume: "#e8c15a",
  plumeDark: "#b8922f",
  cape: "#2b3f63",
  shield: "#3f6bb0",
  shieldDark: "#284a80",
  trim: "#e8c15a",
  gem: "#e8c15a",
};
const HOLY_LIVERY: KnightLivery = {
  plume: "#fff4c2",
  plumeDark: "#d9b74a",
  cape: "#6e5417",
  shield: "#f3f5f2",
  shieldDark: "#cdd2cf",
  trim: "#c9a227",
  gem: "#fff4c2",
};
// Slime Knight — the "Sealed Sentinel": the Knight's green plate ANIMATED by the
// ooze sealed inside it. Same silhouette as drawKnight, but the slime is the
// lifeforce — it pulses behind the visor and chest seams, bubbles rise through the
// plate, a bead drips from the chin, motes drift up, and it stands in a faint ooze
// puddle. All glow via shadowBlur (like the Slime's core); all motion from A.t, so
// particles are deterministic (fixed per-index seeds) and freeze on static portraits.
function drawSlimeKnight(ctx: Ctx, A: SpriteAnim): void {
  const t = A.t;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2); // ambient ooze breathing
  const MBL = "#5fd389", MBB = "#2b9d54", MBD = "#12653a"; // metal light/body/dark
  const OOZE = "#4ade80", OOZEB = "#7bffb0", TRIM = "#a7f3c0";

  // ground ooze puddle (a localized floor glow at its feet)
  ctx.save();
  ctx.shadowColor = OOZE;
  ctx.shadowBlur = 6 + pulse * 7;
  ctx.fillStyle = "rgba(31,122,68,0.95)";
  ctx.beginPath();
  ctx.ellipse(0, 21, 11.5, 3.2, 0, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(90,240,150,${0.55 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(0, 20.4, 7, 1.8, 0, 0, PI2);
  ctx.fill();
  ctx.restore();

  // gelatinous cape peeking behind the shoulders (sways idly)
  ctx.fillStyle = "#1f7a44";
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(6, -8);
  ctx.lineTo(10 + Math.sin(t * 2) * 1.2, 20);
  ctx.lineTo(-10, 20);
  ctx.closePath();
  ctx.fill();

  // torso — green-metal volume
  const lg = ctx.createLinearGradient(0, -4, 0, 20);
  lg.addColorStop(0, MBL);
  lg.addColorStop(0.5, MBB);
  lg.addColorStop(1, MBD);
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.roundRect(-11, -4, 22, 24, 6);
  ctx.fill();

  // seams coursing with green light — drawn on the chest BEFORE the shield/sword
  // and pauldrons, so those plates occlude the ends (no glow bleeding over the
  // shield). Kept inside the torso width so they read as chest plating.
  ctx.save();
  ctx.shadowColor = OOZE;
  ctx.shadowBlur = 3 + pulse * 5;
  ctx.strokeStyle = `rgba(140,255,185,${0.62 + pulse * 0.38})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-9, 5);
  ctx.lineTo(9, 5);
  ctx.moveTo(-9, 11);
  ctx.lineTo(9, 11);
  ctx.stroke();
  ctx.restore();

  // pauldrons (both shoulders)
  for (const x of [-11, 11]) {
    ctx.fillStyle = MBD;
    ctx.beginPath();
    ctx.ellipse(x, -1, 6.5, 5.5, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = MBL;
    ctx.beginPath();
    ctx.ellipse(x, -2.5, 5.3, 4.4, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = TRIM;
    ctx.fillRect(x - 0.8, -6, 1.6, 2);
  }

  // helm with a T-visor
  ctx.fillStyle = MBL;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = MBB;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(-2, -13, 6, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  ctx.fillStyle = "#0d1f16";
  ctx.fillRect(-5, -14, 10, 3);
  ctx.fillRect(-1.5, -14, 3, 7);

  // crest plume, arcing back (gelatinous)
  const sway = Math.sin(t * 3) * 1.6;
  ctx.fillStyle = "#c9f9d8";
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-2, -31, -12, -31 + sway);
  ctx.quadraticCurveTo(-6, -24, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5bbf7e";
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-3, -27, -9, -28 + sway * 0.7);
  ctx.quadraticCurveTo(-5, -23, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c9f9d8";
  ctx.beginPath();
  ctx.arc(0, -19, 2, 0, PI2);
  ctx.fill();

  // heater shield (left) with a glowing cross
  ctx.save();
  ctx.translate(-14, 1);
  const sf = ctx.createLinearGradient(0, -9, 0, 16);
  sf.addColorStop(0, "#3ec46f");
  sf.addColorStop(1, "#1f7a44");
  ctx.fillStyle = sf;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 4);
  ctx.quadraticCurveTo(6, 12, 0, 16);
  ctx.quadraticCurveTo(-6, 12, -6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = TRIM;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = TRIM;
  ctx.shadowBlur = 2 + pulse * 3;
  ctx.fillStyle = TRIM;
  ctx.fillRect(-1, -6, 2, 14);
  ctx.fillRect(-4, -2, 8, 2);
  ctx.restore();
  ctx.restore();

  // sword (right hand) with a gem pommel
  ctx.save();
  ctx.translate(13, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.6, 2, 3.2, 9);
  ctx.fillStyle = "#d9ffe8";
  ctx.beginPath();
  ctx.arc(0, 12, 2.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = TRIM;
  ctx.beginPath();
  ctx.roundRect(-6, -0.5, 12, 2.5, 1.2);
  ctx.fill();
  const bl = ctx.createLinearGradient(-3, 0, 3, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-2.6, 0);
  ctx.lineTo(2.6, 0);
  ctx.lineTo(2.2, -19);
  ctx.lineTo(0, -22);
  ctx.lineTo(-2.2, -19);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // --- the ooze, made alive -------------------------------------------------
  // bubbles rising inside the plate (clipped to the torso)
  if (A.live) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-11, -4, 22, 24, 6);
    ctx.clip();
    ctx.fillStyle = "#cffde0";
    for (let i = 0; i < 5; i++) {
      const p = (t * (0.45 + (i % 3) * 0.12) + i * 1.7) % 1;
      ctx.globalAlpha = (1 - p) * 0.6;
      ctx.beginPath();
      ctx.arc((i - 2) * 3.6, 16 - p * 22, 1.5 * (1 - p) + 0.5, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ooze glowing behind the visor slits (breathing eyes)
  ctx.save();
  ctx.shadowColor = OOZEB;
  ctx.shadowBlur = 5 + pulse * 8;
  ctx.fillStyle = `rgba(180,255,208,${0.85 + pulse * 0.15})`;
  ctx.fillRect(-4.6, -13.5, 3.6, 2);
  ctx.fillRect(1, -13.5, 3.6, 2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.2 + pulse * 0.32;
  ctx.fillStyle = OOZE;
  ctx.beginPath();
  ctx.ellipse(0, -12.5, 7, 4, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  // a bead of slime swelling and dripping from the chin
  const dp = (t * 0.45) % 1;
  ctx.save();
  ctx.shadowColor = OOZEB;
  ctx.shadowBlur = 2 + pulse * 2;
  ctx.fillStyle = "#5bf08e";
  if (dp < 0.72) {
    const half = (2 + dp * 7) / 2;
    ctx.beginPath();
    ctx.ellipse(0, -6 + half, 1.6, half + 1.2, 0, 0, PI2);
    ctx.fill();
  } else if (A.live) {
    const fp = (dp - 0.72) / 0.28;
    ctx.beginPath();
    ctx.arc(0, fp * 24, 1.7 * (1 - fp * 0.4), 0, PI2);
    ctx.fill();
  }
  ctx.restore();

  // faint slime motes drifting up around it (legendary presence)
  if (A.live) {
    ctx.save();
    ctx.shadowColor = OOZEB;
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#a9ffcb";
    for (let i = 0; i < 9; i++) {
      const seed = i * 2.1;
      const p = (t * (0.28 + (i % 4) * 0.03) + seed * 0.31) % 1;
      const mx = ((i % 5) - 2) * 6 + Math.sin((p + seed) * PI2) * 1.7;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.72;
      ctx.beginPath();
      ctx.arc(mx, 19 - p * 46, 0.85 + (i % 3) * 0.4, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawKnight(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  livery: KnightLivery
) {
  // cape peeking behind the shoulders (sways idly)
  ctx.fillStyle = livery.cape;
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(6, -8);
  ctx.lineTo(10 + Math.sin(A.t * 2) * 1.4, 20);
  ctx.lineTo(-10, 20);
  ctx.closePath();
  ctx.fill();
  // body — metallic volume
  metalBody(ctx, 22, 24, -4, body, dark, light, 6);
  // plate seams
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, 5);
  ctx.lineTo(10, 5);
  ctx.moveTo(-10, 11);
  ctx.lineTo(10, 11);
  ctx.stroke();
  // pauldrons (both shoulders)
  for (const x of [-11, 11]) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, -1, 6.5, 5.5, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(x, -2.5, 5.3, 4.4, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = livery.trim;
    ctx.fillRect(x - 0.8, -6, 1.6, 2);
  }
  // helm with a T-visor
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#15181d";
  ctx.fillRect(-5, -14, 10, 3);
  ctx.fillRect(-1.5, -14, 3, 7);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-2, -13, 6, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  // crest plume, arcing back
  ctx.fillStyle = livery.plume;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-2, -31, -12, -31 + Math.sin(A.t * 3) * 1.5);
  ctx.quadraticCurveTo(-6, -24, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = livery.plumeDark;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-3, -27, -9, -28);
  ctx.quadraticCurveTo(-5, -23, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = livery.plume;
  ctx.beginPath();
  ctx.arc(0, -19, 2, 0, PI2);
  ctx.fill();
  // heater shield (left) with a glowing cross crest
  ctx.save();
  ctx.translate(-14, 1);
  const sf = ctx.createLinearGradient(0, -9, 0, 16);
  sf.addColorStop(0, livery.shield);
  sf.addColorStop(1, livery.shieldDark);
  ctx.fillStyle = sf;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 4);
  ctx.quadraticCurveTo(6, 12, 0, 16);
  ctx.quadraticCurveTo(-6, 12, -6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = livery.trim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 4);
  ctx.quadraticCurveTo(6, 12, 0, 16);
  ctx.quadraticCurveTo(-6, 12, -6, 4);
  ctx.closePath();
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = livery.trim;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillStyle = livery.trim;
  ctx.fillRect(-1, -6, 2, 14);
  ctx.fillRect(-4, -2, 8, 2);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-2.5, -5, 1.4, 2.6, -0.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // sword (right hand) with a traveling gleam
  ctx.save();
  ctx.translate(13, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.6, 2, 3.2, 9);
  ctx.fillStyle = livery.gem;
  ctx.beginPath();
  ctx.arc(0, 12, 2.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(livery.gem, 35);
  ctx.beginPath();
  ctx.arc(-0.6, 11.4, 0.9, 0, PI2);
  ctx.fill();
  ctx.fillStyle = livery.trim;
  ctx.beginPath();
  ctx.roundRect(-6, -0.5, 12, 2.5, 1.2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-6, 0.7, 1.4, 0, PI2);
  ctx.arc(6, 0.7, 1.4, 0, PI2);
  ctx.fill();
  const bl = ctx.createLinearGradient(-3, 0, 3, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-2.8, 0);
  ctx.lineTo(2.8, 0);
  ctx.lineTo(0, -24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(70,80,95,0.5)";
  ctx.fillRect(-0.5, -20, 1, 18);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-2.8, 0);
  ctx.lineTo(2.8, 0);
  ctx.lineTo(0, -24);
  ctx.closePath();
  ctx.clip();
  const gy = A.live ? -1 - ((A.t * 26) % 24) : -12;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(0, gy, 3, 2.6, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawWarrior(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // broad-shouldered fighter hefting a two-handed claymore
  metalBody(ctx, 24, 26, -2, body, dark, light, 6);
  // waist belt
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 12, 24, 5);
  // chest strap
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -2);
  ctx.lineTo(8, 12);
  ctx.stroke();
  // pauldrons
  for (const x of [-12, 12]) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, -2, 6, 5, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(x, -3.5, 5, 4, 0, 0, PI2);
    ctx.fill();
  }
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor slit
  // crest plume (accent), swaying
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.quadraticCurveTo(0, -30, 4 + Math.sin(A.t * 3) * 1.2, -30);
  ctx.quadraticCurveTo(1, -24, 2, -18);
  ctx.closePath();
  ctx.fill();
  // two-handed claymore, held across the body and tilted up (flips with facing)
  ctx.save();
  ctx.translate(6, 2);
  ctx.rotate(-0.35);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.6, 4, 3.2, 15);
  ctx.fillStyle = withShade(accent, -10);
  ctx.fillRect(-2.4, 18, 4.8, 2.4); // pommel
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(-8, 2, 16, 3); // crossguard
  const bl = ctx.createLinearGradient(-3.5, 0, 3.5, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-3.5, 2);
  ctx.lineTo(3.5, 2);
  ctx.lineTo(0, -32);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-3.5, 2);
  ctx.lineTo(3.5, 2);
  ctx.lineTo(0, -32);
  ctx.closePath();
  ctx.clip();
  const gy = A.live ? 2 - ((A.t * 34) % 34) : -14;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, gy, 3.4, 3, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawAegisKnight(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  charge: number
) {
  metalBody(ctx, 22, 26, -2, body, dark, light, 6);
  // armor seam
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, 18);
  ctx.stroke();
  // right pauldron (left arm carries the tower shield)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(11, -2, 6, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(11, -3.5, 5, 4, 0, 0, PI2);
  ctx.fill();
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor
  // plume
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.quadraticCurveTo(-2, -30, -10, -30 + Math.sin(A.t * 3) * 1.3);
  ctx.quadraticCurveTo(-5, -24, -1, -18);
  ctx.closePath();
  ctx.fill();
  // big runic tower shield (left)
  const sf = ctx.createLinearGradient(-20, 0, -7, 0);
  sf.addColorStop(0, withShade(body, -40));
  sf.addColorStop(1, dark);
  ctx.fillStyle = sf;
  ctx.beginPath();
  ctx.roundRect(-20, -13, 13, 31, 4);
  ctx.fill();
  // Banked magic rising inside the shield: fills bottom→top from the absorbed
  // charge (shieldHp/shieldHpMax), so the bar visually tracks the Backlash meter.
  if (charge > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-20, -13, 13, 31, 4);
    ctx.clip();
    const fh = 31 * charge;
    const cg = ctx.createLinearGradient(0, 18, 0, 18 - fh);
    cg.addColorStop(0, withAlpha(accent, 0.6));
    cg.addColorStop(1, withAlpha(accent, 0.12));
    ctx.fillStyle = cg;
    ctx.fillRect(-20, 18 - fh, 13, fh);
    ctx.strokeStyle = `rgba(226, 245, 255, ${0.35 + 0.4 * Math.sin(A.t * 8)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-20, 18 - fh);
    ctx.lineTo(-7, 18 - fh);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = withShade(accent, -10);
  ctx.lineWidth = 1;
  ctx.strokeRect(-19.5, -12.5, 12, 30);
  // glowing rune (pulses with the shield's charge)
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 7 + charge * 8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-13.5, -8);
  ctx.lineTo(-13.5, 13); // vertical bar
  ctx.moveTo(-17, 2);
  ctx.lineTo(-10, 2); // crossbar
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13.5, -5);
  ctx.lineTo(-10.5, -1);
  ctx.lineTo(-13.5, 3);
  ctx.lineTo(-16.5, -1);
  ctx.closePath();
  ctx.stroke(); // diamond rune
  ctx.restore();
  // Fully banked (Backlash armed): a pulsing halo on the shield rune.
  if (charge >= 0.999) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(A.t * 6);
    ctx.globalAlpha = 0.45 + 0.4 * pulse;
    ctx.strokeStyle = "#e2f5ff";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-13.5, 2, 9 + pulse * 2, 0, PI2);
    ctx.stroke();
    ctx.restore();
  }
  // sword (right hand)
  ctx.save();
  ctx.translate(12, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.5, 2, 3, 8);
  ctx.fillStyle = withShade(accent, -15);
  ctx.fillRect(-5, 0, 10, 2.5);
  const bl = ctx.createLinearGradient(-2.5, 0, 2.5, 0);
  bl.addColorStop(0, "#9aa1ab");
  bl.addColorStop(0.5, "#eef2f6");
  bl.addColorStop(1, "#b7bdc6");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(0, -20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Rising runes: absorbed magic coursing up the plate. Presentation-only
  // (derived from A.t, no engine state); only visible while the shield holds charge.
  if (charge > 0) {
    for (let i = 0; i < 5; i++) {
      const speed = 0.32 + (i % 3) * 0.07;
      const prog = (A.t * speed + i * 0.41) % 1; // 0 at the feet → 1 overhead
      const y = 22 - prog * 46;
      const x = Math.sin(i * 51.2) * 8 + Math.sin(A.t * 2 + i) * 1.5;
      let a = charge * 0.85;
      if (prog < 0.15) a *= prog / 0.15;
      else if (prog > 0.6) a *= (1 - prog) / 0.4;
      if (a <= 0.02) continue;
      const r = 2.4 + (i % 2) * 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(A.t * 1.5 + i);
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.7, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.7, 0);
        ctx.closePath();
      } else {
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.moveTo(-r * 0.6, 0);
        ctx.lineTo(r * 0.6, 0);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

type MageElement = "fire" | "ice" | "arcane" | "electric" | "plain";

function drawMage(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  element: MageElement
) {
  const t = A.t;
  const core =
    element === "ice"
      ? "#eaf6ff"
      : element === "electric"
      ? "#fff7cc"
      : element === "arcane"
      ? "#f3e8ff"
      : element === "fire"
      ? "#fff3d0"
      : "#ffffff";

  // ground glow beneath the caster (skipped for the plain mage)
  if (element !== "plain") {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const gg = ctx.createRadialGradient(0, 22, 2, 0, 22, 18);
    gg.addColorStop(0, accent);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(0, 22, 16, 5, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  // robe with a vertical gradient; fire/ice get a jagged hem
  const hemGlow =
    element === "fire" ? "#e0561b" : element === "ice" ? withShade(body, 40) : withShade(body, -10);
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, withShade(body, -12));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, hemGlow);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(14, 20);
  if (element === "fire") {
    const hem: [number, number][] = [
      [10, 15], [7, 20], [4, 15], [1, 21], [-2, 15], [-5, 20], [-8, 15], [-11, 20], [-14, 20],
    ];
    for (const [hx, hy] of hem) ctx.lineTo(hx, hy + Math.sin(t * 6 + hx) * 0.6);
  } else if (element === "ice") {
    const hem: [number, number][] = [
      [10, 16], [8, 20], [5, 15], [2, 20], [-1, 15], [-4, 20], [-7, 15], [-10, 20], [-14, 20],
    ];
    for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  } else {
    ctx.lineTo(-14, 20);
  }
  ctx.closePath();
  ctx.fill();
  // inner fold shadow
  ctx.fillStyle = withShade(body, -40);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.fill();
  // glowing rune band
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(i * 4, 8, 1, 0, PI2);
    ctx.stroke();
  }
  ctx.restore();
  // collar
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.lineTo(7, -6);
  ctx.lineTo(5, -1);
  ctx.lineTo(-5, -1);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = withShade(light, -15);
  ctx.beginPath();
  ctx.arc(0, -14, 5.5, 0, PI2);
  ctx.fill();
  // wide-brim pointed hat with a bent tip + gem
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -16, 10, 3, 0, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -16);
  ctx.quadraticCurveTo(-2, -28, -7, -32 + Math.sin(t * 2.4) * 1.4);
  ctx.quadraticCurveTo(0, -26, 8, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.fillRect(-8, -18, 16, 2.2); // band
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, -16.9, 1.8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // glowing eyes in the brim shadow
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillStyle = core;
  ctx.fillRect(-3, -13, 2, 2);
  ctx.fillRect(1, -13, 2, 2);
  ctx.restore();
  // staff
  ctx.strokeStyle = "#4a3320";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(12, 18);
  ctx.lineTo(12, -2);
  ctx.stroke();
  ctx.lineCap = "butt";
  // elemental head on the staff
  const or = (5 + A.cast * 2) * (0.9 + 0.12 * Math.sin(t * 8));
  orb(ctx, 12, -6, or, accent, A.glow + A.cast, core);
  if (element === "fire") {
    ctx.fillStyle = "#f0731f";
    for (let k = 0; k < 5; k++) {
      const an = t * 4 + k * 1.256;
      const fl = or * (1 + 0.35 * Math.abs(Math.sin(t * 7 + k)));
      ctx.beginPath();
      ctx.moveTo(12 + Math.cos(an) * or * 0.5, -6 + Math.sin(an) * or * 0.5);
      ctx.lineTo(12 + Math.cos(an - 0.2) * fl, -6 + Math.sin(an - 0.2) * fl);
      ctx.lineTo(12 + Math.cos(an + 0.2) * fl, -6 + Math.sin(an + 0.2) * fl);
      ctx.closePath();
      ctx.fill();
    }
    rising(ctx, 12, 3, -8, 20, accent, A, 5);
  } else if (element === "ice") {
    ctx.strokeStyle = core;
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const an = k * (PI2 / 6) + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(12 + Math.cos(an) * or, -6 + Math.sin(an) * or);
      ctx.lineTo(12 + Math.cos(an) * (or + 3), -6 + Math.sin(an) * (or + 3));
      ctx.stroke();
    }
  } else if (element === "electric") {
    ctx.save();
    ctx.strokeStyle = core;
    ctx.lineWidth = 1;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    for (let k = 0; k < 3; k++) {
      const a0 = t * 6 + k * 2.1;
      ctx.beginPath();
      ctx.moveTo(12, -6);
      for (let s = 1; s <= 3; s++) {
        const rr = (or * s) / 3 + 2;
        const aa = a0 + s * 0.9;
        ctx.lineTo(12 + Math.cos(aa) * rr, -6 + Math.sin(aa) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (element === "arcane") {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    for (let k = 0; k < 3; k++) {
      const an = t * 2 + k * (PI2 / 3);
      ctx.beginPath();
      ctx.arc(12 + Math.cos(an) * (or + 3), -6 + Math.sin(an) * (or + 3), 1.3, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// A harmless sheep — drawn in place of any polymorphed unit.
function drawSheep(ctx: Ctx) {
  // Woolly white body with bumpy fleece.
  ctx.fillStyle = "#eceae3";
  ctx.beginPath();
  ctx.ellipse(-2, 8, 15, 11, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  for (const [bx, by] of [
    [-12, 2],
    [-4, -3],
    [5, -2],
    [-8, 12],
    [3, 12],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, PI2);
    ctx.fill();
  }
  // Dark face + ears.
  ctx.fillStyle = "#3a3530";
  ctx.beginPath();
  ctx.ellipse(11, 2, 6, 7, 0, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, -4, 3, 2, -0.5, 0, PI2);
  ctx.fill();
  // Eye.
  ctx.fillStyle = "#fff";
  ctx.fillRect(12, 0, 2, 2);
  // Stick legs.
  ctx.fillStyle = "#2a2622";
  ctx.fillRect(-9, 17, 3, 7);
  ctx.fillRect(5, 17, 3, 7);
}

function drawAssassin(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // shadow-smoke wisps at the feet (Vanish/stealth flavour) — motion only
  if (A.live) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const seed = i * 1.9;
      const life = (t * 0.5 + seed) % 1;
      const wx = (i - 1.5) * 5 + Math.sin(t * 1.2 + seed) * 3;
      const wy = 18 - life * 16;
      ctx.globalAlpha = (1 - life) * 0.28;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(wx, wy, 3 + life * 3, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  const sway = A.live ? Math.sin(t * 2) * 2 : 0;
  // flowing tattered cape behind the body
  ctx.fillStyle = withShade(body, -26);
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(5, -8);
  ctx.quadraticCurveTo(11 + sway, 4, 8 + sway, 20);
  ctx.lineTo(5, 15);
  ctx.lineTo(3, 20);
  ctx.lineTo(0, 15);
  ctx.lineTo(-3, 20);
  ctx.lineTo(-6, 15);
  ctx.lineTo(-8 - sway, 20);
  ctx.quadraticCurveTo(-11 - sway, 6, -5, -8);
  ctx.closePath();
  ctx.fill();
  // slim body with a subtle gradient
  const bg = ctx.createLinearGradient(-7, 0, 7, 0);
  bg.addColorStop(0, dark);
  bg.addColorStop(0.5, body);
  bg.addColorStop(1, withShade(body, -14));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-7, -4, 14, 22, 5);
  ctx.fill();
  // chest sash
  ctx.strokeStyle = withShade(body, -36);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(6, 8);
  ctx.stroke();
  // belt + pouch
  ctx.fillStyle = "#20161a";
  ctx.fillRect(-7, 10, 14, 3);
  ctx.fillStyle = withShade(body, -28);
  ctx.fillRect(3, 11, 4, 4);
  // forearm wraps
  ctx.strokeStyle = withShade(body, 22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-3, 4);
  ctx.moveTo(-6, 7);
  ctx.lineTo(-3, 7);
  ctx.stroke();
  // deep hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-9, -16, 0, -19);
  ctx.quadraticCurveTo(9, -16, 8, -4);
  ctx.quadraticCurveTo(0, -8, -8, -4);
  ctx.closePath();
  ctx.fill();
  // face shadow
  ctx.fillStyle = "#0d0912";
  ctx.beginPath();
  ctx.ellipse(0, -9, 4.5, 5, 0, 0, PI2);
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + A.glow * 5;
  ctx.beginPath();
  ctx.ellipse(-2.2, -9, 1.1, 1.5, 0.2, 0, PI2);
  ctx.ellipse(2.2, -9, 1.1, 1.5, -0.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // hood rim light
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-9, -16, 0, -19);
  ctx.stroke();
  // twin daggers — one in each hand, held blade-out
  drawDagger(ctx, 9, 6, 1, accent, A);
  drawDagger(ctx, -9, 6, -1, accent, A);
}

/** A small dagger at (hx,hy), pointing up-and-outward by `side` (1 right, -1
 *  left). Blade carries an accent (poison/shadow) sheen and drips while live. */
function drawDagger(ctx: Ctx, hx: number, hy: number, side: number, accent: string, A: SpriteAnim) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(side * -0.5); // angle the blade outward
  // handle
  ctx.fillStyle = "#2a1d12";
  ctx.fillRect(-1.5, 0, 3, 7);
  // crossguard
  ctx.fillStyle = "#6b532e";
  ctx.fillRect(-4, -1, 8, 2.5);
  // blade with an accent sheen
  const g = ctx.createLinearGradient(0, -1, 0, -15);
  g.addColorStop(0, "#cfd3da");
  g.addColorStop(1, accent);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-2.6, -1);
  ctx.lineTo(2.6, -1);
  ctx.lineTo(0.4, -15);
  ctx.lineTo(-0.4, -15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // edge highlight
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-1.5, -2);
  ctx.lineTo(-0.2, -13);
  ctx.stroke();
  // venom drip
  if (A.live) {
    const drip = (A.t * 0.8 + (side > 0 ? 0 : 0.5)) % 1;
    ctx.globalAlpha = 1 - drip;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -14 + drip * 12, 1.1 * (1 - drip) + 0.4, 0, PI2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Outlaw (defId "outlaw") — the legendary gunslinger reuses the hooded-duelist
// body (drawAssassin) but layers a context-aware "phantom flicker" on top:
//   - Battlefield: an after-image trails the unit's recent phase positions, so it
//     always fades BEHIND the way it's moving (facing is already applied by the
//     outer frame, so local -x = behind). Echoes are static-pose ghosts (no
//     doubled particles); the solid body keeps its full animation.
//   - Info panel (live portrait): the original flicker — a ghost peels off to the
//     side and fades on a loop.
//   - Static card (!live): just the body, no flicker motion.
// All presentation-only (reads the wall clock via A.t), so determinism is untouched.
const OUTLAW_FLICKER_AMP = 6.5;
function outlawPhasePos(t: number): number {
  return Math.sin(t * 3.0) * OUTLAW_FLICKER_AMP;
}
function drawOutlaw(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  if (!A.live) {
    drawAssassin(ctx, body, dark, light, accent, A);
    return;
  }
  const ghost: SpriteAnim = { t: A.t, glow: A.glow, cast: 0, live: false, battle: A.battle };

  if (A.battle) {
    const bx = outlawPhasePos(A.t);
    for (let g = 4; g >= 1; g--) {
      const ex = outlawPhasePos(A.t - g * 0.085);
      ctx.save();
      ctx.globalAlpha = 0.06 + 0.18 * (1 - g / 5);
      ctx.translate(ex, 0);
      drawAssassin(ctx, body, dark, light, accent, ghost);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bx, 0);
    drawAssassin(ctx, body, dark, light, accent, A);
    ctx.restore();
  } else {
    const cyc = (A.t % 1.5) / 1.5;
    const gx = -16 * cyc,
      ga = 1 - cyc;
    ctx.save();
    ctx.globalAlpha = ga * 0.28;
    ctx.translate(gx, 0);
    drawAssassin(ctx, body, dark, light, accent, ghost);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = ga * 0.16;
    ctx.translate(gx * 0.5, 0);
    drawAssassin(ctx, body, dark, light, accent, ghost);
    ctx.restore();
    drawAssassin(ctx, body, dark, light, accent, A);
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.3 * ga;
    ctx.lineWidth = 1;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(gx, 3);
    ctx.lineTo(-3, 3);
    ctx.moveTo(gx, 7);
    ctx.lineTo(-3, 7);
    ctx.stroke();
    ctx.restore();
  }
}

/** A chunky two-handed-style axe at (hx,hy): wooden haft + big steel bit.
 *  `side` mirrors it (1 = bit faces right, -1 = left). */
function drawBigAxe(ctx: Ctx, hx: number, hy: number, side: number) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  // wooden haft
  ctx.strokeStyle = "#5a3a1f";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.lineTo(2, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1.5, -13);
  ctx.lineTo(1.5, 16);
  ctx.stroke();
  ctx.lineCap = "butt";
  // big steel bit — a crescent blade with a gradient
  const g = ctx.createLinearGradient(0, -17, 12, -6);
  g.addColorStop(0, "#e9edf2");
  g.addColorStop(1, "#9aa0a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.bezierCurveTo(14, -17, 17, -10, 15, -6);
  ctx.bezierCurveTo(17, -2, 12, 2, -1, 1);
  ctx.closePath();
  ctx.fill();
  // darker steel near the haft (the poll/eye)
  ctx.fillStyle = "#8a9099";
  ctx.beginPath();
  ctx.moveTo(-1, -13);
  ctx.lineTo(6, -11);
  ctx.lineTo(6, -2);
  ctx.lineTo(-1, -1);
  ctx.closePath();
  ctx.fill();
  // bright cutting edge
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
}

/** The berserker's variant of the big axe: leather-wrapped haft, a notch
 *  bitten out of the crescent, and a cutting edge lit by the rage accent. */
function drawRageAxe(ctx: Ctx, hx: number, hy: number, side: number, accent: string, A: SpriteAnim) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  // wooden haft with leather wraps
  ctx.strokeStyle = "#5a3a1f";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.lineTo(2, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1.5, -13);
  ctx.lineTo(1.5, 16);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#7c4a24";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2.2, 6);
  ctx.lineTo(2.8, 8);
  ctx.moveTo(-1.8, 10);
  ctx.lineTo(3.2, 12);
  ctx.stroke();
  // notched crescent blade
  const g = ctx.createLinearGradient(0, -17, 12, -6);
  g.addColorStop(0, "#e9edf2");
  g.addColorStop(1, "#9aa0a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.bezierCurveTo(14, -17, 17, -10, 15, -6);
  ctx.lineTo(12.5, -4.5);
  ctx.lineTo(15.5, -3.5);
  ctx.bezierCurveTo(16, -1, 12, 2, -1, 1);
  ctx.closePath();
  ctx.fill();
  // darker steel near the haft (the poll/eye)
  ctx.fillStyle = "#8a9099";
  ctx.beginPath();
  ctx.moveTo(-1, -13);
  ctx.lineTo(6, -11);
  ctx.lineTo(6, -2);
  ctx.lineTo(-1, -1);
  ctx.closePath();
  ctx.fill();
  // cutting edge, rage-lit on the glow pulse
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55 + A.glow * 0.35;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 6;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
}

function drawHealer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // soft gold backlight
  ctx.save();
  ctx.globalAlpha = 0.12 + A.glow * 0.06;
  const bl = ctx.createRadialGradient(0, -4, 3, 0, -4, 24);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -4, 24, 0, PI2);
  ctx.fill();
  ctx.restore();
  // layered robe with a lighter inner panel
  const rg = ctx.createLinearGradient(0, -11, 0, 20);
  rg.addColorStop(0, withShade(body, -10));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, withShade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(14, 20);
  ctx.lineTo(-14, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, 15);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(9, 20);
  ctx.lineTo(-9, 20);
  ctx.closePath();
  ctx.fill();
  // white tabard with a glowing cross
  ctx.fillStyle = "#f5f0e1";
  ctx.beginPath();
  ctx.moveTo(-4, -7);
  ctx.lineTo(4, -7);
  ctx.lineTo(3, 19);
  ctx.lineTo(-3, 19);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + A.glow * 3;
  ctx.fillRect(-1, -3, 2, 8);
  ctx.fillRect(-3, -1, 6, 2);
  ctx.restore();
  // rope belt with a knot and hanging cord
  ctx.strokeStyle = "#b1905a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, 6);
  ctx.quadraticCurveTo(0, 8.5, 9, 6);
  ctx.stroke();
  ctx.fillStyle = "#b1905a";
  ctx.beginPath();
  ctx.arc(6.5, 7.2, 1.4, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#b1905a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6.5, 8.4);
  ctx.lineTo(6.2, 13);
  ctx.stroke();
  // prayer book on the hip
  ctx.fillStyle = "#5b3a29";
  ctx.beginPath();
  ctx.roundRect(-13, 8, 6, 7.5, 1);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-13, 9.5);
  ctx.lineTo(-7, 9.5);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-10.6, 10.5, 1.2, 3.6);
  ctx.fillRect(-11.8, 11.6, 3.6, 1.2);
  ctx.restore();
  // shoulder mantle
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(-9.5, -9);
  ctx.quadraticCurveTo(0, -13.5, 9.5, -9);
  ctx.lineTo(7, -2.5);
  ctx.quadraticCurveTo(0, -6, -7, -2.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, -8.6);
  ctx.quadraticCurveTo(0, -12.8, 9, -8.6);
  ctx.stroke();
  // head with serene closed eyes + skullcap
  ctx.fillStyle = withShade(light, -10);
  ctx.beginPath();
  ctx.arc(0, -14, 6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -25);
  ctx.beginPath();
  ctx.arc(0, -15.5, 5.7, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "#6b5232";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.2, -13.6);
  ctx.quadraticCurveTo(-2.2, -12.9, -1.2, -13.6);
  ctx.moveTo(1.2, -13.6);
  ctx.quadraticCurveTo(2.2, -12.9, 3.2, -13.6);
  ctx.stroke();
  // radiant double halo
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 7 + A.glow * 7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -23, 7.5, 3, 0, 0, PI2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -23, 4.5, 1.8, 0, 0, PI2);
  ctx.stroke();
  ctx.restore();
  // spark orbiting the halo (motion only)
  if (A.live) {
    const ang = A.t * 2;
    ctx.save();
    ctx.fillStyle = "#fffbe6";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 7.5, -23 + Math.sin(ang) * 3, 1, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
  // crozier: curled head cradling a glowing orb
  ctx.strokeStyle = "#d8c08a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(12, 18);
  ctx.lineTo(12, -11);
  ctx.stroke();
  ctx.strokeStyle = "#d8c08a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(12, -15, 4, 0.5 * Math.PI, 1.9 * Math.PI);
  ctx.stroke();
  orb(ctx, 12, -15, 2.6, accent, A.glow, "#fffbe6");
  // rising motes + cross sparkles (motion only)
  rising(ctx, 0, 6, 16, 24, accent, A, 4);
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = "#fffbe6";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const seed = i * 2.1 + 0.7;
      const life = (A.t * 0.7 + seed) % 1;
      const x = Math.sin(seed * 6) * 9;
      const y = 12 - life * 24;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.3, y);
      ctx.lineTo(x + 1.3, y);
      ctx.moveTo(x, y - 1.3);
      ctx.lineTo(x, y + 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A real angel wing built like a feathered reference: dense flight feathers FAN
// from a wrist pivot (up-and-out at the tip, hanging down at the bottom), with
// several layered rows of short covert feathers shingled over their roots, cool
// blue-white primaries + warm gold-lit coverts, and a soft golden glow along the
// covert seam. dir -1 = left, 1 = right; `sc` scales the span; `glow` (0..1) the
// seam-glow strength. Reads no unit fields — safe for the portrait stub.
function angelWing(
  ctx: Ctx,
  dir: number,
  beat: number,
  sc: number,
  glow: number,
  tone: "radiant" | "ashen" = "radiant"
) {
  ctx.save();
  ctx.scale(dir, 1);
  ctx.translate(2, -3);
  ctx.rotate(-beat); // gentle flap around a raised rest angle
  ctx.scale(sc, sc);
  const piv = { x: 2, y: 7 }; // wrist: the point every feather fans from
  const thT = -1.28,
    thB = 1.24; // tip direction (up-out) -> bottom primary (down)
  const primLen = (f: number) =>
    27 * (1 - 0.3 * f) * (0.55 + 0.45 * Math.sin((1 - f) * Math.PI * 0.5 + 0.12));
  const fan = (
    count: number,
    lenScale: number,
    wid: number,
    pivShift: number,
    cols: [string, string, string],
    edge: string | null
  ) => {
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const th = thT + (thB - thT) * f;
      const L = primLen(f) * lenScale;
      const c = Math.cos(th),
        s = Math.sin(th);
      const bx = piv.x + c * pivShift,
        by = piv.y + s * pivShift;
      const tx = piv.x + c * (pivShift + L),
        ty = piv.y + s * (pivShift + L);
      const perp = th + Math.PI / 2,
        wx = Math.cos(perp) * wid,
        wy = Math.sin(perp) * wid;
      const g = ctx.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, cols[0]);
      g.addColorStop(0.72, cols[1]);
      g.addColorStop(1, cols[2]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo((bx + tx) / 2 + wx, (by + ty) / 2 + wy, tx, ty);
      ctx.quadraticCurveTo((bx + tx) / 2 - wx, (by + ty) / 2 - wy, bx, by);
      ctx.closePath();
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    }
  };
  // Feather palettes: radiant blue-white/gold, or ashen char with ember light
  // (the Fallen Cathedral's burned angels).
  const radiant = tone === "radiant";
  // 1) long primaries — the back layer
  fan(
    15, 1.0, 2.5, 2,
    radiant ? ["#f2f5fa", "#e2e7f0", "#c8cfdd"] : ["#57505c", "#3f3945", "#2a252f"],
    radiant ? "rgba(120,132,152,0.30)" : "rgba(12,8,16,0.4)"
  );
  // 2) warm glow washing along the covert/primary seam (embers when ashen)
  ctx.save();
  ctx.globalAlpha = 0.35 + glow * 0.2;
  const gcx = piv.x + Math.cos(-0.1) * 11,
    gcy = piv.y + Math.sin(-0.1) * 11;
  const rg = ctx.createRadialGradient(gcx, gcy, 1, gcx, gcy, 15);
  if (radiant) {
    rg.addColorStop(0, "#ffe6a6");
    rg.addColorStop(0.6, "rgba(255,214,120,0.35)");
    rg.addColorStop(1, "rgba(255,214,120,0)");
  } else {
    rg.addColorStop(0, "#e8843c");
    rg.addColorStop(0.6, "rgba(200,92,40,0.3)");
    rg.addColorStop(1, "rgba(200,92,40,0)");
  }
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(gcx, gcy, 15, 0, PI2);
  ctx.fill();
  ctx.restore();
  // 3) secondary coverts — mid length
  fan(
    15, 0.6, 2.1, 2,
    radiant ? ["#fbfcff", "#edf1f8", "#d8dfec"] : ["#635b68", "#4a434f", "#332d3a"],
    radiant ? "rgba(120,132,152,0.26)" : "rgba(12,8,16,0.35)"
  );
  // 4) small coverts near the leading edge
  fan(
    13, 0.34, 1.8, 2,
    radiant ? ["#fffaf0", "#fdeecb", "#f0d497"] : ["#77636a", "#5c4a50", "#42353c"],
    radiant ? "rgba(196,164,92,0.30)" : "rgba(120,60,40,0.30)"
  );
  // 5) tiny shoulder coverts capping the roots
  fan(
    10, 0.18, 1.5, 1.5,
    radiant ? ["#fffdf8", "#fbeecb", "#f3daa2"] : ["#8a6f6a", "#6b544f", "#4d3c3a"],
    null
  );
  ctx.restore();
}

// Seraph (defId "seraph") — the legendary raid healer as a "Stained-Glass
// Saint": a cathedral come to life. An alabaster statue body veined with
// pulsing gold kintsugi cracks (one across the cheek), wings of leaded
// stained-glass panes that catch the light one after another, a carved stone
// ring halo, and dust motes drifting in its own soft window-light. Levitates
// with a slow bob. Chosen from the 4-variant mockup round (2026-07-13); the
// losing variants are archived in docs/seraph-mockups.md.
function drawSeraph(ctx: Ctx, _body: string, _dark: string, _light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  const bob = A.live ? Math.sin(t * 1.2) : 0;
  const glow = A.glow;
  ctx.save();
  ctx.translate(0, bob - 1.5);

  // soft cathedral-window backlight (no hard edges — reads as caught light)
  ctx.save();
  ctx.globalAlpha = 0.16 + glow * 0.08;
  const lsg = ctx.createRadialGradient(0, -8, 3, 0, -8, 27);
  lsg.addColorStop(0, "#fff3c9");
  lsg.addColorStop(1, "rgba(255,243,201,0)");
  ctx.fillStyle = lsg;
  ctx.beginPath();
  ctx.arc(0, -8, 27, 0, PI2);
  ctx.fill();
  ctx.restore();
  // dust motes in the beam (motion only)
  if (A.live) {
    for (let i = 0; i < 5; i++) {
      const seed = i * 2.7 + 1.1;
      const life = (t * 0.18 + seed) % 1;
      const x = Math.sin(seed * 7.3) * 9 + Math.sin((t + seed) * 0.9) * 2;
      const y = 22 - life * 52;
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.45;
      ctx.fillStyle = "#fff3c9";
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // stained-glass wings: leaded panes, lit one after another
  // [x1,y1, x2,y2, x3,y3, hue] — triangular panes fanning up-and-out
  const panes: [number, number, number, number, number, number, string][] = [
    [3, -4, 24, -22, 15, -6, "#e9b64f"], // gold
    [3, -4, 15, -6, 20, 4, "#7fa8d9"], // azure
    [3, -4, 24, -22, 12, -20, "#d98a9d"], // rose
    [3, -4, 12, -20, 2, -16, "#9b87c9"], // violet
    [3, -4, 20, 4, 12, 9, "#8fbf8a"], // green
  ];
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir, 1);
    ctx.translate(1, -3);
    ctx.rotate((A.live ? Math.sin(t * 1.5) : 0) * 0.04 - 0.05); // stone-slow sway
    for (let p = 0; p < panes.length; p++) {
      const [x1, y1, x2, y2, x3, y3, hue] = panes[p];
      // panes light up in sequence, offset per side — never dim below "lit
      // glass" or the dim panes read as a black slab against dark arenas
      const lit = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.6 - p * 0.85 + (dir < 0 ? 2.4 : 0)));
      ctx.fillStyle = hue;
      ctx.globalAlpha = 0.82 + lit * 0.18;
      if (lit > 0.8) {
        ctx.shadowColor = hue;
        ctx.shadowBlur = 6;
      } else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // lead came outline
      ctx.strokeStyle = "#2b2733";
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // alabaster statue robe (cool marble whites)
  const marble = "#e8e6df";
  const rg = ctx.createLinearGradient(0, -11, 0, 20);
  rg.addColorStop(0, "#f4f2ec");
  rg.addColorStop(0.55, marble);
  rg.addColorStop(1, "#b9b6ac");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.quadraticCurveTo(10, -6, 12.5, 20);
  ctx.lineTo(-12.5, 20);
  ctx.quadraticCurveTo(-10, -6, 0, -12);
  ctx.fill();
  // carved drape folds
  ctx.strokeStyle = "rgba(90,86,78,0.4)";
  ctx.lineWidth = 0.8;
  for (const fx of [-6, -1.5, 3.5]) {
    ctx.beginPath();
    ctx.moveTo(fx, -2);
    ctx.quadraticCurveTo(fx + 1.5, 9, fx + 0.5, 19);
    ctx.stroke();
  }
  // chipped hem (a statue's age)
  ctx.fillStyle = "#b9b6ac";
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(10.5, 17.5);
  ctx.lineTo(11.5, 20);
  ctx.closePath();
  ctx.fill();

  // glowing kintsugi cracks across the body
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  const cracks = [
    [[-4, -9], [-2, -3], [-5, 3], [-3.5, 10]],
    [[5, -5], [3, 1], [6, 7], [4.5, 14]],
    [[-1, -12], [1, -8]],
  ];
  cracks.forEach((path, ci) => {
    const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.9 + ci * 1.9));
    ctx.globalAlpha = pulse;
    ctx.shadowBlur = 3 + pulse * 5;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let k = 1; k < path.length; k++) ctx.lineTo(path[k][0], path[k][1]);
    ctx.stroke();
  });
  ctx.restore();

  // serene marble head, kintsugi crack across one cheek
  ctx.fillStyle = "#f4f2ec";
  ctx.beginPath();
  ctx.arc(0, -16, 5.8, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,86,78,0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-3, -15.2);
  ctx.quadraticCurveTo(-2, -14.6, -1, -15.2);
  ctx.moveTo(1, -15.2);
  ctx.quadraticCurveTo(2, -14.6, 3, -15.2);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  const cp = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.9 + 4.1));
  ctx.globalAlpha = cp;
  ctx.shadowBlur = 2 + cp * 4;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(3.2, -19.5);
  ctx.lineTo(2.2, -16.5);
  ctx.lineTo(3.6, -13.8);
  ctx.stroke();
  ctx.restore();

  // gothic ring halo: a carved stone ring with a small cross keystone
  ctx.save();
  ctx.strokeStyle = "#d9d5c9";
  ctx.lineWidth = 1.7;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + glow * 4;
  ctx.beginPath();
  ctx.arc(0, -25.5, 5.2, 0, PI2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6 + glow * 0.4;
  ctx.beginPath();
  ctx.moveTo(0, -32.2);
  ctx.lineTo(0, -29.4);
  ctx.moveTo(-1.3, -31.1);
  ctx.lineTo(1.3, -31.1);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawSummoner(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Ancient forest-warden (defId "summoner").
  const t = A.t;
  const wood = "#6b4a2a";
  const leaf = accent;
  const leafGlow = "#c6f76a";
  // summoning circle underfoot (a nod to its wolf-summoning)
  ctx.save();
  ctx.globalAlpha = 0.32 + 0.15 * Math.sin(t * 2);
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(0, 24, 17, 5, 0, 0, PI2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 24, 12, 3.5, 0, 0, PI2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = leaf;
  for (let i = 0; i < 6; i++) {
    const a = i * (PI2 / 6) + t * 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 15, 24 + Math.sin(a) * 4.5, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // green backlight
  ctx.save();
  ctx.globalAlpha = 0.18;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, leaf);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // layered cloak
  const rg = ctx.createLinearGradient(0, -6, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.5, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(13, 20);
  ctx.lineTo(-13, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.fill();
  // leaf-trim mantle
  ctx.fillStyle = leaf;
  for (let j = -2; j <= 2; j++) {
    ctx.save();
    ctx.translate(j * 5, -4);
    ctx.rotate(j * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 1.6, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
  // head, hood, white beard
  ctx.fillStyle = withShade(light, -10);
  ctx.beginPath();
  ctx.arc(0, -12, 6.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -13, 7.5, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#d8d2c4";
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.lineTo(3, -9);
  ctx.lineTo(1.5, -5);
  ctx.lineTo(-1.5, -5);
  ctx.closePath();
  ctx.fill();
  // glowing nature eyes
  ctx.save();
  ctx.fillStyle = leafGlow;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-2.4, -12, 1.3, 0, PI2);
  ctx.arc(2.4, -12, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  // branching antler crown
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, -16);
  ctx.lineTo(-6, -22);
  ctx.lineTo(-10, -27);
  ctx.moveTo(-6, -22);
  ctx.lineTo(-11, -23);
  ctx.moveTo(-8, -25);
  ctx.lineTo(-6, -29);
  ctx.moveTo(4, -16);
  ctx.lineTo(6, -22);
  ctx.lineTo(10, -27);
  ctx.moveTo(6, -22);
  ctx.lineTo(11, -23);
  ctx.moveTo(8, -25);
  ctx.lineTo(6, -29);
  ctx.stroke();
  ctx.lineCap = "butt";
  // glowing antler tips
  ctx.save();
  ctx.fillStyle = leafGlow;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 6;
  const tips: [number, number][] = [
    [-10, -27], [-11, -23], [-6, -29], [10, -27], [11, -23], [6, -29],
  ];
  for (const [tx, ty] of tips) {
    ctx.beginPath();
    ctx.arc(tx, ty, 1.3, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // living staff (flips with facing)
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 19);
  ctx.lineTo(12, 9);
  ctx.lineTo(14, -1);
  ctx.lineTo(12, -10);
  ctx.stroke();
  // vine wrap
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s <= 10; s++) {
    const yy = 19 - s * 3;
    const xx = 13 + Math.sin(s * 1.1) * 2.5;
    if (s === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
  // glowing seed-orb cradled in leaves
  ctx.save();
  ctx.fillStyle = leaf;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.ellipse(10, -13, 3.5, 2, -0.5, 0, PI2);
  ctx.ellipse(16, -13, 3.5, 2, 0.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  orb(ctx, 13, -14, 3.2 * (0.9 + 0.1 * Math.sin(t * 4)), leafGlow, A.glow, "#f0ffd0");
  // orbiting spirit-wisp + drifting leaves + fireflies (motion only)
  if (A.live) {
    const wa = t * 1.2;
    const wx = Math.cos(wa) * 16;
    const wy = -2 + Math.sin(wa) * 8;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = leafGlow;
    ctx.shadowColor = leaf;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, PI2);
    ctx.fill();
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.arc(wx - Math.cos(wa) * 3, wy - Math.sin(wa) * 1.5, 1.2, 0, PI2);
    ctx.fill();
    ctx.restore();
    for (let l = 0; l < 5; l++) {
      const seed = l * 1.7;
      const life = (t * 0.4 + seed) % 1;
      const lx = (l - 2) * 7 + Math.sin(t * 1.3 + seed) * 4;
      const ly = 18 - life * 30;
      ctx.save();
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.translate(lx, ly);
      ctx.rotate(life * 6 + seed);
      ctx.fillStyle = l % 2 ? leaf : leafGlow;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.4, 1.2, 0, 0, PI2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = leafGlow;
    ctx.shadowColor = leaf;
    ctx.shadowBlur = 5;
    for (let f = 0; f < 3; f++) {
      const a2 = t * (1 + f * 0.3) + f * 2;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 5 + f);
      ctx.beginPath();
      ctx.arc(Math.cos(a2) * 14 + (f - 1) * 3, -4 + Math.sin(a2 * 1.3) * 10, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Spirit Wolf — feral pounce: chest low over braced forelegs, hackles raised,
// bushy tail up, fangs bared. Authored head-right (no facing mirror needed).
// User-approved from canvas mockups.
function drawWolf(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // bushy raised tail
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-12, 6);
  ctx.quadraticCurveTo(-20, 2, -21, -6);
  ctx.lineTo(-17.5, -5);
  ctx.quadraticCurveTo(-16, 1, -10, 4);
  ctx.closePath();
  ctx.fill();
  // crouched body, chest dipped toward the target
  const bgd = ctx.createLinearGradient(0, 1.5, 0, 14.5);
  bgd.addColorStop(0, light);
  bgd.addColorStop(1, dark);
  ctx.fillStyle = bgd;
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 6.5, -0.14, 0, PI2);
  ctx.fill();
  // hackle spikes along the spine
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-9, 4.5);
  ctx.lineTo(-7, 0.5);
  ctx.lineTo(-4.5, 3.2);
  ctx.lineTo(-2, -0.5);
  ctx.lineTo(0.5, 2.4);
  ctx.lineTo(3, -1);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.fill();
  // legs: rear pair coiled with bent hocks, front pair braced under the chest
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, 9);
  ctx.lineTo(-10, 15);
  ctx.lineTo(-8.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 11);
  ctx.lineTo(-5.5, 15.5);
  ctx.lineTo(-4.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, 11.5);
  ctx.lineTo(7.5, 19.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(9.5, 10.5);
  ctx.lineTo(11, 19.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // head with an angular muzzle
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(12, 3, 6, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(22.5, 5.2);
  ctx.lineTo(15, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#26282c";
  ctx.beginPath();
  ctx.arc(22, 5.2, 1.3, 0, PI2);
  ctx.fill(); // nose
  // perked ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(8, -1);
  ctx.lineTo(9.5, -7.5);
  ctx.lineTo(12.5, -1.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12.5, -1.5);
  ctx.lineTo(15, -6.5);
  ctx.lineTo(17, -0.5);
  ctx.closePath();
  ctx.fill();
  // glowing spirit eye
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(14.5, 2.5, 1.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bared fangs + snarl line
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(17.5, 6.6);
  ctx.lineTo(18.7, 6.6);
  ctx.lineTo(18.1, 8.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, 6.4);
  ctx.lineTo(21, 6.4);
  ctx.lineTo(20.5, 8.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#26282c";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(15.5, 8.4);
  ctx.lineTo(20.5, 8);
  ctx.stroke();
  void body;
}

// Boar — war boar: shoulder hump, mohawk bristle ridge, proper snout with
// nostrils, four hooved legs, curly tail, angry brow, two spaced tusks.
// Authored head-right (no facing mirror needed). User-approved from mockups.
function drawBoar(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // curly tail
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-15, 4);
  ctx.quadraticCurveTo(-19, 2, -18, -1);
  ctx.quadraticCurveTo(-17, 1, -15.5, 0);
  ctx.stroke();
  ctx.lineCap = "butt";
  // body with a heavy front shoulder hump
  const bgd = ctx.createLinearGradient(0, -2, 0, 17);
  bgd.addColorStop(0, light);
  bgd.addColorStop(1, dark);
  ctx.fillStyle = bgd;
  ctx.beginPath();
  ctx.ellipse(-1, 7, 15, 9, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(6, 2.5, 8.5, 6, 0.1, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-1, 12.5, 13, 4.5, 0, 0, PI2);
  ctx.fill(); // belly shading
  // mohawk bristle ridge (head overlaps its front edge)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(10, -3);
  ctx.lineTo(8, -8);
  ctx.lineTo(5.5, -3.5);
  ctx.lineTo(3, -7.5);
  ctx.lineTo(0.5, -3);
  ctx.lineTo(-2, -6.5);
  ctx.lineTo(-4.5, -2);
  ctx.lineTo(-7, -5);
  ctx.lineTo(-9, -0.5);
  ctx.lineTo(-11, 1.5);
  ctx.closePath();
  ctx.fill();
  // four legs with hoof caps
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.8;
  for (const x of [-10, -5, 5, 10]) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, 20);
    ctx.stroke();
  }
  ctx.fillStyle = "#2b1c10";
  for (const x of [-10, -5, 5, 10]) ctx.fillRect(x - 1.6, 19, 3.2, 2);
  // head + snout with nostrils
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(13, 5, 7.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.ellipse(20, 7.5, 4, 3, 0.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#2b1c10";
  ctx.beginPath();
  ctx.arc(21, 7, 0.7, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(21.5, 8.4, 0.7, 0, PI2);
  ctx.fill();
  // ear
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(9, -1.5);
  ctx.lineTo(10.5, -6.5);
  ctx.lineTo(13.5, -2);
  ctx.closePath();
  ctx.fill();
  // angry brow + eye
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(12, 0.5);
  ctx.lineTo(16.5, 2);
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(13.5, 2.2, 2, 2);
  // two tusks, spaced so they read separately: a big fore tusk and a
  // smaller rear one
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(18.5, 9.5);
  ctx.quadraticCurveTo(23, 7.5, 22, 3);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, 10.8);
  ctx.quadraticCurveTo(17.5, 10, 17.5, 7.2);
  ctx.stroke();
  ctx.lineCap = "butt";
  void A;
}

function drawBear(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // Druid's bear form — a shaggy, fanged bruiser wreathed in nature magic.
  const nat = accent;
  const natGlow = "#c6f76a";
  // green nature backlight
  ctx.save();
  ctx.globalAlpha = 0.14;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, nat);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // shaggy fur silhouette
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI2;
    const ex = Math.cos(a) * 19;
    const ey = 4 + Math.sin(a) * 15;
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex * 1.13, 4 + (ey - 4) * 1.13);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
  // body
  const g = ctx.createLinearGradient(0, -14, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 4, 20, 16, 0, 0, PI2);
  ctx.fill();
  // shoulder hump
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, -4, 13, 9, 0, 0, PI2);
  ctx.fill();
  // belly shading
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, 12, 16, 8, 0, 0, PI2);
  ctx.fill();
  // chest highlight
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 2, 8, 10, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.fill();
  // ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-8, -20, 4, 0, PI2);
  ctx.arc(8, -20, 4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-8, -20, 2, 0, PI2);
  ctx.arc(8, -20, 2, 0, PI2);
  ctx.fill();
  // brow ridge
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-8, -15);
  ctx.lineTo(-1, -16);
  ctx.lineTo(-2, -13);
  ctx.closePath();
  ctx.moveTo(8, -15);
  ctx.lineTo(1, -16);
  ctx.lineTo(2, -13);
  ctx.closePath();
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = natGlow;
  ctx.shadowColor = nat;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-4.5, -13, 2, 0, PI2);
  ctx.arc(4.5, -13, 2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // muzzle
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -8, 5.5, 4.5, 0, 0, PI2);
  ctx.fill();
  // nose
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, -10, 2.2, 1.6, 0, 0, PI2);
  ctx.fill();
  // growling mouth
  ctx.fillStyle = "#2a0f0f";
  ctx.beginPath();
  ctx.ellipse(0, -5, 3.6, 2, 0, 0, PI2);
  ctx.fill();
  // fangs
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-2.6, -6);
  ctx.lineTo(-1.6, -3);
  ctx.lineTo(-0.8, -6);
  ctx.closePath();
  ctx.moveTo(2.6, -6);
  ctx.lineTo(1.6, -3);
  ctx.lineTo(0.8, -6);
  ctx.closePath();
  ctx.fill();
  // forepaws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-16, 12, 5, 4, 0, 0, PI2);
  ctx.ellipse(16, 12, 5, 4, 0, 0, PI2);
  ctx.fill();
  // claws
  ctx.strokeStyle = "#f3f3e0";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-19, 13);
  ctx.lineTo(-21, 17);
  ctx.moveTo(-16, 14);
  ctx.lineTo(-17, 18.5);
  ctx.moveTo(-13, 14);
  ctx.lineTo(-13, 18.5);
  ctx.moveTo(19, 13);
  ctx.lineTo(21, 17);
  ctx.moveTo(16, 14);
  ctx.lineTo(17, 18.5);
  ctx.moveTo(13, 14);
  ctx.lineTo(13, 18.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // hind paws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-9, 19, 4, 2.5, 0, 0, PI2);
  ctx.ellipse(9, 19, 4, 2.5, 0, 0, PI2);
  ctx.fill();
  // druidic moss on the shoulders
  ctx.save();
  ctx.fillStyle = nat;
  ctx.shadowColor = nat;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.ellipse(-11, -3, 2.6, 1.4, -0.4, 0, PI2);
  ctx.ellipse(11, -3, 2.6, 1.4, 0.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rising nature-motes
  rising(ctx, 0, 13, 12, 30, natGlow, A, 4);
}

function drawBerserker(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // hulking, hunched, dual axes — rage is the signature emitter
  // pulsing blood-red backlight
  ctx.save();
  ctx.globalAlpha = 0.14 + A.glow * 0.08;
  const bl = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rage fissures underfoot
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.25 + A.glow * 0.3;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4, 24);
  ctx.lineTo(-9, 26.5);
  ctx.lineTo(-15, 25.5);
  ctx.moveTo(3, 24.5);
  ctx.lineTo(9, 27);
  ctx.lineTo(13, 25.5);
  ctx.moveTo(-1, 25);
  ctx.lineTo(1, 28);
  ctx.stroke();
  ctx.restore();
  // hunched torso — wide shoulders tapering to the hips, with rim light
  const tg = ctx.createLinearGradient(0, -6, 0, 22);
  tg.addColorStop(0, light);
  tg.addColorStop(0.5, body);
  tg.addColorStop(1, dark);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-16, -2);
  ctx.quadraticCurveTo(-14, -8, 0, -8);
  ctx.quadraticCurveTo(14, -8, 16, -2);
  ctx.quadraticCurveTo(15, 12, 10, 20);
  ctx.lineTo(-10, 20);
  ctx.quadraticCurveTo(-15, 12, -16, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-15.2, 0);
  ctx.quadraticCurveTo(-14.6, 10, -10.5, 18.5);
  ctx.stroke();
  // fur pelt mantle across the shoulders
  ctx.fillStyle = "#3a2417";
  ctx.beginPath();
  ctx.moveTo(-17, -3);
  const tufts: [number, number][] = [
    [-13, -1], [-11, -6], [-8, -2], [-5, -7], [-2, -3], [2, -7], [5, -2], [8, -7], [11, -2], [13, -6], [17, -3],
  ];
  for (const [tx, ty] of tufts) ctx.lineTo(tx, ty);
  ctx.lineTo(17, -8);
  ctx.quadraticCurveTo(0, -13, -17, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(-17, -8);
  ctx.quadraticCurveTo(0, -13, 17, -8);
  ctx.lineTo(15, -6.5);
  ctx.quadraticCurveTo(0, -11.2, -15, -6.5);
  ctx.closePath();
  ctx.fill();
  // war-paint chevrons, faintly rage-lit
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.65;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + A.glow * 3;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.lineTo(-2, 7);
  ctx.moveTo(8, 2);
  ctx.lineTo(2, 7);
  ctx.moveTo(-7, 7);
  ctx.lineTo(-2, 11);
  ctx.moveTo(7, 7);
  ctx.lineTo(2, 11);
  ctx.stroke();
  ctx.restore();
  // belt with a skull buckle
  ctx.fillStyle = dark;
  ctx.fillRect(-12, 14, 24, 6);
  ctx.fillStyle = "#e7e5e4";
  ctx.beginPath();
  ctx.arc(0, 17, 2.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(-1.8, 16.2, 1.2, 1.2);
  ctx.fillRect(0.7, 16.2, 1.2, 1.2);
  // fists gripping the hafts, veins pulsing with bloodrage
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    const ag = ctx.createLinearGradient(10, -2, 18, 6);
    ag.addColorStop(0, withShade(body, 25));
    ag.addColorStop(1, withShade(body, -20));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(14.5, 2, 4.6, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(14.5, 2, 4.6, Math.PI * 0.9, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.3 + A.glow * 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.quadraticCurveTo(13.5, 2, 12.5, 5);
    ctx.stroke();
    ctx.restore();
  }
  // head with a war-paint band across the face
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -13, 8.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(0, -13, 8.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-7.5, -16);
  ctx.lineTo(7.5, -12);
  ctx.stroke();
  ctx.restore();
  // topknot, swaying on the presentation clock
  ctx.fillStyle = "#2a1810";
  ctx.beginPath();
  ctx.arc(0, -20.5, 3.4, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2a1810";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -21.5);
  ctx.quadraticCurveTo(3 + Math.sin(A.t * 2.4), -26, 1.5 + Math.sin(A.t * 2.4) * 1.6, -28.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // rage eyes (glow) with rising ember flecks
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 7;
  ctx.fillRect(-5.5, -15, 3.4, 2);
  ctx.fillRect(2.1, -15, 3.4, 2);
  if (A.live) {
    ctx.globalAlpha = 0.4 + A.glow * 0.3;
    ctx.fillRect(-4.6, -18 - A.glow * 1.5, 1.4, 1.4);
    ctx.fillRect(3.2, -18.5 - A.glow * 1.2, 1.4, 1.4);
  }
  ctx.restore();
  // twin notched axes with rage-lit edges
  drawRageAxe(ctx, 15, -1, 1, accent, A);
  drawRageAxe(ctx, -15, -1, -1, accent, A);
  // rising rage motes + the odd bright spark
  rising(ctx, 0, 13, 16, 30, accent, A, 6);
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = "#ffd9b0";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const seed = i * 2.3 + 0.9;
      const life = (A.t * 0.8 + seed) % 1;
      const x = Math.sin(seed * 7) * 10;
      const y = 14 - life * 26;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, y);
      ctx.lineTo(x + 1.4, y);
      ctx.moveTo(x, y - 1.4);
      ctx.lineTo(x, y + 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Warlock — the rare pact summoner (2026-07-17 mockup pick 1, "Ember Cowl"; the
// three losing variants are archived in docs/warlock-mockups.md). A black-and-ember
// robed summoner: a tattered shroud under the Archer's deep cowl (cavity packed
// black — see deepCowlHood's `fillCavity`), a slow-rotating pentagram, rising
// embers, and a black staff crowned with red flame. It shares the Necromancer's
// robe silhouette by lineage, but is its own draw fn — the two diverge from here.
function drawWarlock(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  // slow-rotating summoning pentagram underfoot (no encircling ring)
  ctx.save();
  ctx.globalAlpha = 0.45 + 0.18 * Math.sin(t * 1.6);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.1;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + t * 0.25 + i * ((PI2 * 2) / 5);
    const x = Math.cos(a) * 12;
    const y = 24 + Math.sin(a) * 3.4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // ember backlight
  ctx.save();
  ctx.globalAlpha = 0.2;
  const bl = ctx.createRadialGradient(0, -2, 4, 0, -2, 24);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 24, 0, PI2);
  ctx.fill();
  ctx.restore();
  // embers rising off the pact (motion only)
  if (A.live) {
    for (let w = 0; w < 5; w++) {
      const seed = w * 1.9;
      const life = (t * 0.45 + seed) % 1;
      const wx = (w - 2) * 6 + Math.sin(t + seed) * 3;
      const wy = 16 - life * 28;
      ctx.save();
      ctx.globalAlpha = (1 - life) * 0.55;
      ctx.fillStyle = "#fca5a5";
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 1.8, 2.4, 0, 0, PI2);
      ctx.fill();
      ctx.restore();
    }
  }
  // tattered pact-shroud with a ragged hem
  const rg = ctx.createLinearGradient(0, -14, 0, 20);
  rg.addColorStop(0, withShade(body, 10));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, withShade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(14, 18);
  const hem: [number, number][] = [
    [11, 14], [8, 19], [5, 14], [2, 19], [-1, 14], [-4, 19], [-7, 14], [-10, 19], [-14, 18],
  ];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -35);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(8, 18);
  ctx.lineTo(-8, 18);
  ctx.closePath();
  ctx.fill();
  // the Archer's deep cowl, cavity packed black so no seam shows through
  deepCowlHood(ctx, body, accent, A, true);
  // black staff crowned with red flame
  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 18);
  ctx.lineTo(13, -8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.85;
  for (let k = 0; k < 5; k++) {
    const an = t * 3 + k * 1.256;
    const fl = 6 * (0.9 + 0.3 * Math.abs(Math.sin(t * 6 + k)));
    ctx.beginPath();
    ctx.moveTo(13 + Math.cos(an) * 3, -14 + Math.sin(an) * 3);
    ctx.lineTo(13 + Math.cos(an - 0.2) * fl, -14 + Math.sin(an - 0.2) * fl);
    ctx.lineTo(13 + Math.cos(an + 0.2) * fl, -14 + Math.sin(an + 0.2) * fl);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // ember core at the staff's crown (where the Necromancer carries a skull)
  ctx.save();
  ctx.fillStyle = "#fca5a5";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(13, -14, 2.6, 0, PI2);
  ctx.fill();
  ctx.restore();
  void dark;
  void light;
}

function drawNecromancer(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const t = A.t;
  const bone = "#e7e5e4";
  const boneDark = "#b8b4ad";
  const vio = accent;
  const vioGlow = "#c9b6ff";
  // grave glyph underfoot (a summoning pentagram)
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 2);
  ctx.strokeStyle = vio;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.ellipse(0, 24, 16, 4.5, 0, 0, PI2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * ((PI2 * 2) / 5);
    const x = Math.cos(a) * 11;
    const y = 24 + Math.sin(a) * 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // violet backlight
  ctx.save();
  ctx.globalAlpha = 0.2;
  const bl = ctx.createRadialGradient(0, -2, 4, 0, -2, 24);
  bl.addColorStop(0, vio);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 24, 0, PI2);
  ctx.fill();
  ctx.restore();
  // soul-wisps with hollow faces (motion only)
  if (A.live) {
    for (let w = 0; w < 5; w++) {
      const seed = w * 1.9;
      const life = (t * 0.45 + seed) % 1;
      const wx = (w - 2) * 6 + Math.sin(t + seed) * 3;
      const wy = 16 - life * 28;
      ctx.save();
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.fillStyle = vioGlow;
      ctx.shadowColor = vio;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 2, 2.6, 0, 0, PI2);
      ctx.fill();
      ctx.globalAlpha *= 0.8;
      ctx.fillStyle = body;
      ctx.fillRect(wx - 1.1, wy - 0.6, 0.8, 0.8);
      ctx.fillRect(wx + 0.3, wy - 0.6, 0.8, 0.8);
      ctx.restore();
    }
  }
  // tattered death-shroud with a ragged hem
  const rg = ctx.createLinearGradient(0, -14, 0, 20);
  rg.addColorStop(0, withShade(body, 10));
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, withShade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(14, 18);
  const hem: [number, number][] = [
    [11, 14], [8, 19], [5, 14], [2, 19], [-1, 14], [-4, 19], [-7, 14], [-10, 19], [-14, 18],
  ];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -35);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(8, 18);
  ctx.lineTo(-8, 18);
  ctx.closePath();
  ctx.fill();
  // horned hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(10, -15);
  ctx.lineTo(0, 0);
  ctx.lineTo(-10, -15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, -16);
  ctx.quadraticCurveTo(-11, -20, -9, -24);
  ctx.moveTo(7, -16);
  ctx.quadraticCurveTo(11, -20, 9, -24);
  ctx.stroke();
  ctx.lineCap = "butt";
  // detailed skull
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(2, -15);
  ctx.lineTo(3, -11);
  ctx.stroke();
  // glowing eye sockets
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.ellipse(-2.3, -11.5, 1.4, 1.6, 0, 0, PI2);
  ctx.ellipse(2.3, -11.5, 1.4, 1.6, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  // nasal + teeth
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.moveTo(-0.7, -9);
  ctx.lineTo(0.7, -9);
  ctx.lineTo(0, -10.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    ctx.moveTo(k * 1.2, -7.6);
    ctx.lineTo(k * 1.2, -6);
  }
  ctx.stroke();
  // bone staff topped with a violet-flaming skull
  ctx.strokeStyle = "#4a4038";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 18);
  ctx.lineTo(13, -8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 0.85;
  for (let k = 0; k < 5; k++) {
    const an = t * 3 + k * 1.256;
    const fl = 6 * (0.9 + 0.3 * Math.abs(Math.sin(t * 6 + k)));
    ctx.beginPath();
    ctx.moveTo(13 + Math.cos(an) * 3, -14 + Math.sin(an) * 3);
    ctx.lineTo(13 + Math.cos(an - 0.2) * fl, -14 + Math.sin(an - 0.2) * fl);
    ctx.lineTo(13 + Math.cos(an + 0.2) * fl, -14 + Math.sin(an + 0.2) * fl);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.arc(13, -14, 3.4, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 5;
  ctx.fillRect(11.8, -15, 1.3, 1.3);
  ctx.fillRect(12.8, -15, 1.3, 1.3);
  ctx.restore();
  ctx.fillStyle = bone;
  ctx.fillRect(11.5, -11, 3, 1.8);
  // orbiting bone shards (motion only)
  if (A.live) {
    ctx.fillStyle = bone;
    for (let s = 0; s < 3; s++) {
      const a3 = t * 1.5 + s * (PI2 / 3);
      ctx.save();
      ctx.translate(Math.cos(a3) * 15, -2 + Math.sin(a3) * 9);
      ctx.rotate(a3);
      ctx.fillRect(-1.5, -0.6, 3, 1.2);
      ctx.restore();
    }
  }
  void light;
}

// ---- skeleton --------------------------------------------------------------
// Two variants picked per-unit via variantOf(uid) so summoned packs vary:
// 0 = restrung classic (bare bones + rusty sword), 1 = grave warrior (adds a
// cracked half-helm and a bitten plank shield held in front of the bones).
// User-approved from canvas mockups.

const BONE = "#e7e5e4";
const BONE_SHADE = "#c8c6c2";

/** Skull with glowing sockets, nasal cavity, teeth, a hanging jaw (dropped by
 *  jawDrop) and a cranium crack. */
function skeletonSkull(ctx: Ctx, accent: string, glow: number, x: number, y: number, tilt: number, jawDrop: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(0, -1, 5.2, Math.PI, 0);
  ctx.quadraticCurveTo(5.2, 2.5, 3.5, 3.2);
  ctx.lineTo(-3.5, 3.2);
  ctx.quadraticCurveTo(-5.2, 2.5, -5.2, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BONE_SHADE;
  ctx.fillRect(-3.5, 1.4, 7, 1.8);
  // dark mouth gap + upper teeth
  ctx.fillStyle = "#141216";
  ctx.fillRect(-2.6, 3.1, 5.2, 1 + jawDrop);
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) ctx.fillRect(-2.4 + i * 1.4, 3.1, 0.7, 1);
  // hanging jaw
  ctx.fillStyle = "#dcdad6";
  ctx.beginPath();
  ctx.roundRect(-2.8, 4.1 + jawDrop, 5.6, 2.2, 1);
  ctx.fill();
  // glowing sockets
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + glow * 3;
  ctx.fillRect(-3.5, -2.4, 2.3, 2.3);
  ctx.fillRect(1.2, -2.4, 2.3, 2.3);
  ctx.restore();
  // nasal cavity
  ctx.fillStyle = "#8f8d89";
  ctx.beginPath();
  ctx.moveTo(0, -0.2);
  ctx.lineTo(-0.9, 1.7);
  ctx.lineTo(0.9, 1.7);
  ctx.closePath();
  ctx.fill();
  // cranium crack
  ctx.strokeStyle = "#9a9894";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1.2, -6);
  ctx.lineTo(-0.3, -3.9);
  ctx.lineTo(-2, -2.7);
  ctx.stroke();
  ctx.restore();
}

/** Spine, four curved rib pairs, and a pelvis with hip knobs. */
function skeletonRibs(ctx: Ctx) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(0, 11);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const y = -2.5 + i * 3;
    const w = 6.2 - i * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(-w, y + 0.4, -w + 0.6, y + 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(w, y + 0.4, w - 0.6, y + 2.6);
    ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3.8, 11);
  ctx.lineTo(3.8, 11);
  ctx.stroke();
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(-3.4, 11.8, 1.5, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.4, 11.8, 1.5, 0, PI2);
  ctx.fill();
}

/** A bone limb through the given joints, with knob joints between segments. */
function boneLimb(ctx: Ctx, pts: [number, number][], lw: number) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#d5d3cf";
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], lw * 0.6, 0, PI2);
    ctx.fill();
  }
}

/** Three finger-bone claws splaying from (x,y) toward dir (+1 right / -1 left). */
function boneClaws(ctx: Ctx, x: number, y: number, dir: number) {
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 3, y - 1.5 + i * 1.5);
    ctx.stroke();
  }
}

function skeletonLegs(ctx: Ctx) {
  boneLimb(ctx, [[0, 12], [-3, 15.5], [-4.5, 19.5]], 2);
  boneLimb(ctx, [[0, 12], [3, 15], [4.5, 19.5]], 2);
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-4.5, 19.5);
  ctx.lineTo(-7, 19.5);
  ctx.moveTo(4.5, 19.5);
  ctx.lineTo(7, 19.5);
  ctx.stroke();
}

/** Notched, rust-spotted sword gripped at (hx,hy). */
function rustySword(ctx: Ctx, hx: number, hy: number, ang: number) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.fillStyle = "#6b5a3a"; // grip
  ctx.fillRect(-0.8, 1, 1.6, 3.4);
  ctx.fillStyle = "#7d7260"; // guard
  ctx.fillRect(-3, -0.4, 6, 1.4);
  // notched blade
  ctx.fillStyle = "#b9b3a6";
  ctx.beginPath();
  ctx.moveTo(-1.1, -0.4);
  ctx.lineTo(-1.1, -13);
  ctx.lineTo(0, -15.5);
  ctx.lineTo(1.1, -13);
  ctx.lineTo(1.1, -8.5);
  ctx.lineTo(-0.1, -7.4);
  ctx.lineTo(1.1, -6.2);
  ctx.lineTo(1.1, -0.4);
  ctx.closePath();
  ctx.fill();
  // rust blooms
  ctx.fillStyle = "#8a5a3a";
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(-0.3, -11, 0.9, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.4, -4, 1, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-0.4, -2, 0.6, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-1.1, -1);
  ctx.lineTo(-1.1, -13);
  ctx.stroke();
  ctx.restore();
}

function drawSkeleton(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  variant: 0 | 1
) {
  if (variant === 0) {
    // restrung classic: bare bones, off-hand claw, notched rusty sword
    boneLimb(ctx, [[0, -3], [-6, 0], [-8.5, 4.5]], 1.8);
    boneClaws(ctx, -8.5, 4.5, -1);
    skeletonRibs(ctx);
    skeletonLegs(ctx);
    skeletonSkull(ctx, accent, A.glow, 0, -12, 0, 0.4);
    boneLimb(ctx, [[0, -3], [6, -1], [9.5, 2]], 1.8);
    rustySword(ctx, 9.5, 2, 0.35);
  } else {
    // grave warrior: cracked half-helm + bitten plank shield held in front
    boneLimb(ctx, [[0, -3], [-6, -1], [-9, 2]], 1.8); // shield arm
    skeletonRibs(ctx);
    skeletonLegs(ctx);
    skeletonSkull(ctx, accent, A.glow, 0, -12, 0, 0.4);
    // cracked half-helm
    ctx.fillStyle = "#7d828c";
    ctx.beginPath();
    ctx.arc(0, -13.5, 5.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d6068";
    ctx.fillRect(-5.6, -13.8, 11.2, 1.4);
    ctx.strokeStyle = "#494c53";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2, -18.5);
    ctx.lineTo(2.8, -15.8);
    ctx.lineTo(1.2, -14.2);
    ctx.stroke();
    // plank shield in front of the bones, a bite missing from the top edge
    ctx.save();
    ctx.translate(-10, 3);
    ctx.fillStyle = "#8a6a42";
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "#6e5230";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.8, -5.2);
    ctx.lineTo(-1.8, 5.2);
    ctx.moveTo(1.8, -5.2);
    ctx.lineTo(1.8, 5.2);
    ctx.stroke();
    ctx.strokeStyle = "#57595e";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.stroke();
    ctx.fillStyle = "#6a6d74";
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, PI2);
    ctx.fill();
    // bite gouge in the rim, clipped to the shield face (dark fill — erasing
    // would punch a hole through the arena behind the sprite)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, PI2);
    ctx.clip();
    ctx.fillStyle = "#1a1b1e";
    ctx.beginPath();
    ctx.arc(4.6, -4.6, 2.4, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    boneLimb(ctx, [[0, -3], [6, -1], [9.5, 2]], 1.8);
    rustySword(ctx, 9.5, 2, 0.35);
  }
  void body;
  void dark;
  void light;
}

// Giant rat — a proper sewer rat: pointed snout with buck teeth and whiskers,
// big round pink ears, beady eye, mange patches, long segmented curling tail.
// User-approved from canvas mockups (drawn full-size; the call site shrinks it).
function drawGiantRat(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // The geometry below is authored head-left, but the renderer's facing flip
  // assumes sprites face right — mirror so the rat attacks nose-first.
  ctx.save();
  ctx.scale(-1, 1);
  const pinkDeep = withShade(accent, -25);
  // tail behind the body
  ctx.strokeStyle = pinkDeep;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(11, 8);
  ctx.quadraticCurveTo(21, 10, 24, 3);
  ctx.quadraticCurveTo(25.5, -1, 22.5, -3.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  // tail segment ticks
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  for (const [tx, ty] of [[15, 9.3], [19, 8.2], [22.5, 5], [23.7, 0.5]] as const) {
    ctx.beginPath();
    ctx.moveTo(tx, ty - 1.2);
    ctx.lineTo(tx + 0.6, ty + 1.2);
    ctx.stroke();
  }
  // low teardrop body
  const g = ctx.createLinearGradient(0, 1.5, 0, 14.5);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(2, 8, 13, 6.5, -0.1, 0, PI2);
  ctx.fill();
  // mange patches
  ctx.fillStyle = withShade(body, -18);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(6, 5.5, 3, 2, 0.3, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1, 10, 2.2, 1.5, -0.2, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // big round ears, pink inside
  for (const [ex, ey, er] of [[-10.5, -2, 3.6], [-4.5, -3, 3.2]] as const) {
    ctx.fillStyle = withShade(body, -22);
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, PI2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(ex, ey + 0.3, er * 0.58, 0, PI2);
    ctx.fill();
  }
  // head dome tapering to a pointed snout
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(-3, 0.5);
  ctx.quadraticCurveTo(-9, -0.5, -19, 6.5);
  ctx.quadraticCurveTo(-9, 10.5, -3, 9.5);
  ctx.closePath();
  ctx.fill();
  // nose + buck teeth
  ctx.fillStyle = "#3d3028";
  ctx.beginPath();
  ctx.arc(-19, 6.5, 1.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-17.6, 7.6, 1.5, 2.4);
  // beady eye with a glint
  ctx.fillStyle = "#191512";
  ctx.beginPath();
  ctx.arc(-11, 3, 1.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(-11.4, 2.5, 0.45, 0, PI2);
  ctx.fill();
  // whiskers
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 0.7;
  for (const dy of [-2, 0.5, 3]) {
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(-21.5, 6 + dy);
    ctx.stroke();
  }
  // little pink feet
  ctx.strokeStyle = pinkDeep;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7, 13);
  ctx.lineTo(-7.5, 18);
  ctx.moveTo(7, 13.5);
  ctx.lineTo(7, 18.5);
  ctx.stroke();
  ctx.restore();
  void A;
}

function drawSlime(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim, scale: number) {
  ctx.save();
  ctx.scale(scale, scale);
  // gooey blob body — rounded dome with a wobbly base, shaded top-to-bottom
  const g = ctx.createLinearGradient(0, -16, 0, 19);
  g.addColorStop(0, light);
  g.addColorStop(1, body);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-18, 16);
  ctx.bezierCurveTo(-20, -8, -10, -16, 0, -16);
  ctx.bezierCurveTo(10, -16, 20, -8, 18, 16);
  // wobbly bottom
  ctx.bezierCurveTo(12, 20, 6, 16, 0, 19);
  ctx.bezierCurveTo(-6, 16, -12, 20, -18, 16);
  ctx.closePath();
  ctx.fill();
  // glossy highlight
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(-6, -6, 5, 7, -0.3, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // inner core glow
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 4, 7, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bubbles rising through the goo (motion only)
  if (A.live) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 3; i++) {
      const seed = i * 2.1;
      const life = (A.t * 0.5 + seed) % 1;
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.beginPath();
      ctx.arc((i - 1) * 6, 12 - life * 20, 1.4 * (1 - life) + 0.5, 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // eyes
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(-5, -2, 2, 0, PI2);
  ctx.arc(5, -2, 2, 0, PI2);
  ctx.fill();
  // eye shine
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-4, -3, 0.7, 0, PI2);
  ctx.arc(6, -3, 0.7, 0, PI2);
  ctx.fill();
  // rim highlight along the top-left edge
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-17, 10);
  ctx.bezierCurveTo(-19, -6, -11, -14, -2, -15);
  ctx.stroke();
  ctx.restore();
  void dark;
}

function drawMysticArcher(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  form: "light" | "dark"
) {
  // Celestial ranger; its aura snaps between golden Light and violet Dark stance.
  const t = A.t;
  const aura = form === "light" ? "#fcd34d" : "#a78bfa";
  const auraB = form === "light" ? "#fff2c0" : "#e6dbff";
  const robeBase = form === "light" ? body : withShade(body, -22);
  // backlight aura
  ctx.save();
  ctx.globalAlpha = 0.2;
  const bg = ctx.createRadialGradient(0, -4, 4, 0, -4, 26);
  bg.addColorStop(0, aura);
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, -4, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // star sparkles (motion only)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = auraB;
    ctx.shadowColor = aura;
    ctx.shadowBlur = 4;
    for (let i = 0; i < 5; i++) {
      const a = t * (0.5 + i * 0.2) + i * 1.7;
      const sx = Math.cos(a) * 18;
      const sy = -4 + Math.sin(a * 1.2) * 14;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 3 + i));
      ctx.beginPath();
      ctx.arc(sx, sy, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // celestial halo behind the head
  ctx.save();
  ctx.translate(0, -20);
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, PI2);
  ctx.stroke();
  ctx.fillStyle = auraB;
  for (let h = 0; h < 4; h++) {
    const a2 = h * (PI2 / 4);
    ctx.beginPath();
    ctx.arc(Math.cos(a2) * 6, Math.sin(a2) * 6, 1.1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // quiver of glowing arrows on the back
  ctx.strokeStyle = withShade(body, -20);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-10, 8);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 1;
  for (let q = 0; q < 3; q++) {
    ctx.beginPath();
    ctx.moveTo(-9 + q * 1.5, -6);
    ctx.lineTo(-11 + q * 1.5, -12);
    ctx.stroke();
  }
  ctx.restore();
  // flowing robe
  const rg = ctx.createLinearGradient(0, -14, 0, 18);
  rg.addColorStop(0, withShade(robeBase, 25));
  rg.addColorStop(0.6, robeBase);
  rg.addColorStop(1, withShade(robeBase, -25));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(6, 0);
  ctx.lineTo(13, 18);
  ctx.lineTo(4, 14);
  ctx.lineTo(0, 18);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-13, 18);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  // sash
  ctx.strokeStyle = aura;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(6, 8);
  ctx.stroke();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(8, -14);
  ctx.lineTo(0, -2);
  ctx.lineTo(-8, -14);
  ctx.closePath();
  ctx.fill();
  // brow gem
  ctx.save();
  ctx.fillStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(0, -13, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.fillRect(-3.4, -11, 2.2, 1.8);
  ctx.fillRect(1.2, -11, 2.2, 1.8);
  ctx.restore();
  // ornate recurve bow + nocked energy arrow (flips with facing)
  ctx.save();
  ctx.translate(12, 0);
  ctx.strokeStyle = withShade(aura, -30);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 13, -Math.PI / 2.1, Math.PI / 2.1);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.cos(-Math.PI / 2.1) * 13, Math.sin(-Math.PI / 2.1) * 13);
  ctx.quadraticCurveTo(6, -13, 3, -15);
  ctx.moveTo(Math.cos(Math.PI / 2.1) * 13, Math.sin(Math.PI / 2.1) * 13);
  ctx.quadraticCurveTo(6, 13, 3, 15);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5;
  for (let r = -1; r <= 1; r++) {
    const ra = r * 0.5;
    ctx.beginPath();
    ctx.arc(Math.cos(ra) * 13, Math.sin(ra) * 13, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = auraB;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.lineTo(-1, 0);
  ctx.lineTo(3, 15);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.shadowColor = aura;
  ctx.shadowBlur = 6 + A.glow * 4;
  ctx.strokeStyle = auraB;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(12, 0);
  ctx.stroke();
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(12, -2.4);
  ctx.lineTo(12, 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = aura;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(-7, 0);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // aura motes
  rising(ctx, 0, 10, 16, 24, aura, A, 4);
  void light;
  void accent;
}

// ============================================================================
// Dungeon bestiary — bespoke per-monster sprites
// Every themed-dungeon monster gets its own silhouette here (no arena-unit
// reskins). Same normalized space (~ -20..20 wide, -28..28 tall) and the same
// (body, dark, light, accent, A) contract; colours come from each def. Grouped
// by dungeon — the boss + rare catalyst are the showpieces of each set.
//
// Conventions (keep these for every sprite added below):
//  • Lively: never a static pose. Every unit carries at least one ambient
//    animation driven by A — an A.glow pulse, a `rising()` mote emitter, an
//    orbiting/drifting detail, or a hover. Gate motion-only bits on `A.live`
//    so hub portraits stay a clean frozen frame.
//  • Rare catalysts (the quest spawns — lich, apex_beast, archmage, wildheart,
//    eclipse_herald, ancient_automaton) get a SIGNATURE themed aura/animation
//    beyond the fodder so the rare appearance reads as an event.
// ============================================================================

// ---- The Bonefields (undead) ----------------------------------------------

// Skeleton Archer — a bare skeletal frame drawing a bone recurve bow, cold-blue
// fletching. Built from the shared skeleton sub-parts (ribs/legs/skull).
function drawSkeletonArcher(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  skeletonLegs(ctx);
  // rear arm pulling the string back toward the chest
  boneLimb(ctx, [[0, -3], [4, -1], [6.5, 1.5]], 1.8);
  skeletonRibs(ctx);
  // quiver of arrows slung over the shoulder
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-6 + i * 1.3, -7);
    ctx.lineTo(-9 + i * 1.3, -13);
    ctx.stroke();
  }
  skeletonSkull(ctx, accent, A.glow, -1, -12, -0.05, 0.3);
  // lead arm holding the bow out front
  boneLimb(ctx, [[0, -3], [7, 0], [12, 1]], 1.8);
  // bone recurve bow, bellying toward the target (right)
  ctx.strokeStyle = "#cfc7b2";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(12, -9);
  ctx.quadraticCurveTo(19, 1, 12, 11);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(12, -9);
  ctx.quadraticCurveTo(10.5, -11, 12.6, -12);
  ctx.moveTo(12, 11);
  ctx.quadraticCurveTo(10.5, 13, 12.6, 14);
  ctx.stroke();
  ctx.lineCap = "butt";
  // bowstring, pulled back to the nock at the draw hand
  ctx.strokeStyle = "rgba(230,235,245,0.8)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(12.6, -12);
  ctx.lineTo(6.5, 1.5);
  ctx.lineTo(12.6, 14);
  ctx.stroke();
  // nocked arrow, pointing right through the bow
  ctx.strokeStyle = "#8a7a5a";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(6.5, 1.5);
  ctx.lineTo(20, 1);
  ctx.stroke();
  ctx.fillStyle = "#d7dbe2";
  ctx.beginPath();
  ctx.moveTo(23, 1);
  ctx.lineTo(19.5, -1);
  ctx.lineTo(19.5, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(6.5, 1.5);
  ctx.lineTo(4.3, -0.6);
  ctx.moveTo(6.5, 1.5);
  ctx.lineTo(4.3, 3.6);
  ctx.stroke();
  // faint cold grave-glow drifting off the bones (liveliness)
  rising(ctx, 0, 7, 12, 24, accent, A, 3);
  void body;
  void dark;
  void light;
}

// Ghoul — a gaunt, hunched carrion-eater crouched to lunge, over-long clawed
// arms reaching, a wide fanged maw. Grave-rot flesh, jaundiced claws.
function drawGhoul(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const claw = accent;
  // bent, splayed legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.lineTo(-7, 15);
  ctx.lineTo(-4, 20);
  ctx.moveTo(3, 11);
  ctx.lineTo(7, 15);
  ctx.lineTo(9, 20);
  ctx.stroke();
  ctx.strokeStyle = claw;
  ctx.lineWidth = 1;
  for (const [fx, dir] of [[-4, -1], [9, 1]] as const) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(fx, 20);
      ctx.lineTo(fx + dir * 2 + i * 1.3, 22.5);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // hunched torso leaning forward
  const g = ctx.createLinearGradient(0, -8, 0, 12);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.quadraticCurveTo(-6, 12, 2, 12);
  ctx.quadraticCurveTo(10, 11, 9, 0);
  ctx.quadraticCurveTo(7, -8, 0, -8);
  ctx.quadraticCurveTo(-7, -8, -8, -2);
  ctx.closePath();
  ctx.fill();
  // starved rib shadows
  ctx.strokeStyle = withShade(body, -28);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-1, -3 + i * 3);
    ctx.quadraticCurveTo(5, -2 + i * 3, 6, 1 + i * 3);
    ctx.stroke();
  }
  // long reaching arms, both toward the target
  ctx.strokeStyle = body;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(2, -4);
  ctx.quadraticCurveTo(12, -3, 17, 3);
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(9, 3, 15, 8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = claw;
  ctx.lineWidth = 1.2;
  for (const [hx, hy] of [[17, 3], [15, 8]] as const) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + 3.5, hy - 2 + i * 2.3);
      ctx.stroke();
    }
  }
  // thrust-forward gaunt head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(9, -6, 6.5, 5, 0.1, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -12);
  ctx.beginPath();
  ctx.ellipse(9.5, -4.5, 6, 3.2, 0.1, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(6, -10);
  ctx.lineTo(4, -15);
  ctx.lineTo(8, -11);
  ctx.closePath();
  ctx.fill();
  // wide fanged maw
  ctx.fillStyle = "#1c1713";
  ctx.beginPath();
  ctx.ellipse(13, -3, 3.5, 2.2, 0.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#f3f3e0";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(11 + i * 1.5, -4.5);
    ctx.lineTo(11.6 + i * 1.5, -1.6);
    ctx.lineTo(12.2 + i * 1.5, -4.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(9, -8, 1.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  // sickly miasma + a drool string swinging from the maw (liveliness)
  rising(ctx, 4, 7, 6, 18, accent, A, 3);
  if (A.live) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(13, -0.6);
    ctx.lineTo(13.2, 1.6 + (Math.sin(A.t * 2) * 0.5 + 0.5) * 3.5);
    ctx.stroke();
    ctx.restore();
  }
}

// Bonecaller — a lesser undead summoner: hooded violet grave-robe, a skull face,
// one bony hand raised calling a fresh skull up in violet grave-fire.
function drawBonecaller(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const vio = accent;
  // faint grave glyph underfoot
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.12 * Math.sin(A.t * 2);
  ctx.strokeStyle = vio;
  ctx.lineWidth = 1;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(0, 22, 13, 3.5, 0, 0, PI2);
  ctx.stroke();
  ctx.restore();
  // bell robe with a ragged hem
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(11, 20);
  const hem: [number, number][] = [[8, 16], [5, 20], [2, 16], [-2, 20], [-5, 16], [-8, 20], [-11, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -30);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(6, 18);
  ctx.lineTo(-6, 18);
  ctx.closePath();
  ctx.fill();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(8, -8);
  ctx.lineTo(0, 2);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  // skull set in the hood shadow
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(0, -9, 4.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = BONE_SHADE;
  ctx.fillRect(-2.6, -7.6, 5.2, 1.4);
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillRect(-2.4, -10, 1.8, 1.8);
  ctx.fillRect(0.6, -10, 1.8, 1.8);
  ctx.restore();
  // raised summoning hand
  boneLimb(ctx, [[3, 0], [10, -3], [14, -9]], 1.6);
  boneClaws(ctx, 14, -9, 1);
  // a fresh skull rising in violet grave-fire
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.8;
  for (let k = 0; k < 4; k++) {
    const an = A.t * 3 + k * 1.57;
    ctx.beginPath();
    ctx.arc(18 + Math.cos(an) * 2.5, -14 + Math.sin(an) * 2.5, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(18, -14, 2.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#141216";
  ctx.fillRect(17, -14.6, 0.9, 0.9);
  ctx.fillRect(18.3, -14.6, 0.9, 0.9);
  rising(ctx, 0, 10, 18, 22, accent, A, 4);
}

// Abomination — the Bonefields boss: a hulking stitched-together corpse with
// mismatched arms, exposed ribs and sewn-shut seams. (Scaled up at the call site.)
function drawAbomination(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // hulking mismatched legs (drawn first so the belly overlaps their tops and
  // they read as rooted under the mass, not stuck on)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-11, 8, 9, 13, 3);
  ctx.fill();
  ctx.fillStyle = withShade(body, -34); // the stitched-on, mismatched right leg
  ctx.beginPath();
  ctx.roundRect(2, 9, 10, 12, 3);
  ctx.fill();
  // broad flat feet
  ctx.fillStyle = "#26281f";
  ctx.beginPath();
  ctx.roundRect(-13.5, 19, 12, 4.5, 2);
  ctx.roundRect(1.5, 19, 13, 4.5, 2);
  ctx.fill();
  // knee stitches binding the legs on
  zombieStitches(ctx, -8.5, 13, 0.1, 3);
  zombieStitches(ctx, 4.5, 14, -0.1, 3);
  // huge asymmetric torso
  const g = ctx.createLinearGradient(0, -12, 0, 16);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-12, -6);
  ctx.quadraticCurveTo(-15, 12, -4, 14);
  ctx.quadraticCurveTo(8, 15, 13, 6);
  ctx.quadraticCurveTo(15, -6, 6, -11);
  ctx.quadraticCurveTo(-6, -14, -12, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(-2, 4, 8, 7, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // exposed ribs on one side
  ctx.strokeStyle = "#d9dcc0";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-9, -3 + i * 3.4);
    ctx.quadraticCurveTo(-3, -2 + i * 3.4, -1, i * 3.4);
    ctx.stroke();
  }
  zombieStitches(ctx, -4, 8, 0.2, 5);
  zombieStitches(ctx, 4, -4, 1.4, 4);
  // small sunken head between the shoulders
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(1, -12, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -15);
  ctx.beginPath();
  ctx.arc(1, -12, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(-1, -13, 1.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#141210";
  ctx.fillRect(2.6, -13.6, 1.6, 1.6);
  // slack stitched mouth
  ctx.strokeStyle = "#3c332a";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.lineTo(4, -9);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-1.5 + i * 1.6, -10);
    ctx.lineTo(-1.5 + i * 1.6, -8);
    ctx.stroke();
  }
  // huge dragging right arm, small stitched left arm
  ctx.strokeStyle = body;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(11, -3);
  ctx.quadraticCurveTo(18, 6, 16, 16);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(16, 17, 5, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = body;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-11, -2);
  ctx.quadraticCurveTo(-16, 4, -14, 9);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-14, 10, 3, 0, PI2);
  ctx.fill();
  // a rusty spike stitched into the shoulder
  ctx.strokeStyle = "#9a9488";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(8, -10);
  ctx.lineTo(11, -16);
  ctx.stroke();
  // rot-miasma + a couple of buzzing flies (liveliness)
  rising(ctx, 0, 12, 12, 26, accent, A, 4);
  if (A.live) {
    ctx.save();
    ctx.fillStyle = "#17170f";
    for (let k = 0; k < 2; k++) {
      const an = A.t * 3.2 + k * 3.14;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(5 + Math.cos(an) * 9, -13 + Math.sin(an * 1.3) * 5, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Lich — the rare Bonefields catalyst: a crowned deathless sorcerer-lord that
// floats above a trailing robe, soul-fire blazing in its sockets.
function drawLich(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const vio = accent;
  const hover = A.live ? Math.sin(A.t * 1.6) * 1.5 : 0;
  ctx.save();
  ctx.translate(0, hover);
  // violet backlight
  ctx.save();
  ctx.globalAlpha = 0.22;
  const bl = ctx.createRadialGradient(0, -4, 4, 0, -4, 26);
  bl.addColorStop(0, vio);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -4, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // robe tapering to a wispy point (no legs — it floats)
  const rg = ctx.createLinearGradient(0, -12, 0, 24);
  rg.addColorStop(0, light);
  rg.addColorStop(0.5, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(-9, -6);
  ctx.quadraticCurveTo(-11, 14, -2, 24);
  ctx.quadraticCurveTo(0, 26, 2, 24);
  ctx.quadraticCurveTo(11, 14, 9, -6);
  ctx.quadraticCurveTo(0, -12, -9, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const hx of [-6, -2, 3, 7]) {
    ctx.beginPath();
    ctx.moveTo(hx, 18);
    ctx.lineTo(hx + (hx < 0 ? -1 : 1), 26);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(6, 18);
  ctx.lineTo(-6, 18);
  ctx.closePath();
  ctx.fill();
  // phylactery gem at the chest
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 6 + A.glow * 5;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(2.4, 5);
  ctx.lineTo(0, 8);
  ctx.lineTo(-2.4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // bone staff in the off hand, crowned with a soul-crystal and a living aura:
  // expanding rings + orbiting motes pulsing off the crystal
  ctx.strokeStyle = "#2a2438";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-11, 23);
  ctx.quadraticCurveTo(-13, 4, -12, -13);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#4a4038"; // twisted claw finial cradling the crystal
  ctx.lineWidth = 1.4;
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(-12, -13);
    ctx.quadraticCurveTo(-12 + s * 4, -16, -12 + s * 2.4, -20);
    ctx.stroke();
  }
  const sx = -12, sy = -17;
  ctx.save();
  ctx.strokeStyle = vio; // expanding aura rings
  ctx.shadowColor = vio;
  ctx.shadowBlur = 6;
  for (let r = 0; r < 2; r++) {
    const life = (A.t * 0.7 + r * 0.5) % 1;
    ctx.globalAlpha = (1 - life) * 0.55;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(sx, sy, 3 + life * 7, 0, PI2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#e9deff"; // orbiting motes
  ctx.shadowColor = vio;
  ctx.shadowBlur = 5;
  for (let k = 0; k < 3; k++) {
    const an = A.t * 2 + k * 2.094;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(an) * 5.5, sy + Math.sin(an) * 5.5, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = vio; // the soul-crystal core
  ctx.shadowColor = vio;
  ctx.shadowBlur = 8 + A.glow * 6;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 4.5);
  ctx.lineTo(sx + 3, sy);
  ctx.lineTo(sx, sy + 4.5);
  ctx.lineTo(sx - 3, sy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#f5f0ff";
  ctx.beginPath();
  ctx.moveTo(sx, sy - 2);
  ctx.lineTo(sx + 1.3, sy);
  ctx.lineTo(sx, sy + 2);
  ctx.lineTo(sx - 1.3, sy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // raised skeletal hand wreathed in dark flame
  boneLimb(ctx, [[6, -2], [13, -4], [17, -10]], 1.6);
  boneClaws(ctx, 17, -10, 1);
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 9;
  ctx.globalAlpha = 0.75;
  for (let k = 0; k < 5; k++) {
    const an = A.t * 3.5 + k * 1.256;
    const fl = 5 * (0.9 + 0.3 * Math.abs(Math.sin(A.t * 6 + k)));
    ctx.beginPath();
    ctx.moveTo(18 + Math.cos(an) * 2, -12 + Math.sin(an) * 2);
    ctx.lineTo(18 + Math.cos(an - 0.2) * fl, -12 + Math.sin(an - 0.2) * fl);
    ctx.lineTo(18 + Math.cos(an + 0.2) * fl, -12 + Math.sin(an + 0.2) * fl);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // skull
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(0, -12, 5.4, 0, PI2);
  ctx.fill();
  ctx.fillStyle = BONE_SHADE;
  ctx.beginPath();
  ctx.arc(0, -12, 5.4, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.fill();
  ctx.fillStyle = withShade(body, -10);
  ctx.beginPath();
  ctx.moveTo(-4, -11);
  ctx.lineTo(-2, -8);
  ctx.lineTo(-4.5, -8.5);
  ctx.closePath();
  ctx.moveTo(4, -11);
  ctx.lineTo(2, -8);
  ctx.lineTo(4.5, -8.5);
  ctx.closePath();
  ctx.fill();
  // blazing soul-fire sockets
  ctx.save();
  ctx.fillStyle = "#ede9fe";
  ctx.shadowColor = vio;
  ctx.shadowBlur = 7 + A.glow * 6;
  ctx.beginPath();
  ctx.ellipse(-2.2, -12.5, 1.6, 2, 0, 0, PI2);
  ctx.ellipse(2.2, -12.5, 1.6, 2, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  // jagged bone crown
  ctx.fillStyle = "#efe9d0";
  ctx.beginPath();
  ctx.moveTo(-6, -15);
  ctx.lineTo(-6, -18);
  ctx.lineTo(-3.5, -16);
  ctx.lineTo(-1.5, -20);
  ctx.lineTo(0, -16.5);
  ctx.lineTo(1.5, -20);
  ctx.lineTo(3.5, -16);
  ctx.lineTo(6, -18);
  ctx.lineTo(6, -15);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(0, -17, 1, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore(); // hover
  rising(ctx, 0, 12, 16, 28, "#c9b6ff", A, 5);
}

// ---- The Wilds (feral beasts) ---------------------------------------------

// Dire Wolf — a lean, rangy grey pack-hunter on the prowl (distinct from the
// arena wolf's crouched spirit-eyed pose): mundane beast, panting, cold breath.
function drawDireWolf(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // low sweeping tail
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.quadraticCurveTo(-21, 6, -20, 13);
  ctx.stroke();
  ctx.lineCap = "butt";
  // four legs FIRST (behind), so the body overlaps their tops instead of the
  // legs painting over the belly
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 9);
  ctx.lineTo(-9, 15);
  ctx.lineTo(-7.5, 20); // rear, bent hock
  ctx.moveTo(-3, 10);
  ctx.lineTo(-3.5, 20);
  ctx.moveTo(6, 10);
  ctx.lineTo(6, 20);
  ctx.moveTo(11, 9);
  ctx.lineTo(11.5, 15);
  ctx.lineTo(11, 20); // front, bent
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = dark;
  for (const px of [-7.5, -3.5, 6, 11]) {
    ctx.beginPath();
    ctx.ellipse(px, 20, 2.2, 1.3, 0, 0, PI2);
    ctx.fill();
  }
  // rangy body OVER the leg tops
  const g = ctx.createLinearGradient(0, 2, 0, 15);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-1, 8, 15, 6.5, -0.05, 0, PI2);
  ctx.fill();
  // raised hackles along the spine
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(3, 3);
  ctx.lineTo(6, -3);
  ctx.lineTo(8, 2);
  ctx.lineTo(11, -3);
  ctx.lineTo(13, 3);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(14, 2, 5.5, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, -1);
  ctx.lineTo(23, 3);
  ctx.lineTo(16, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#26282c";
  ctx.beginPath();
  ctx.arc(22.5, 3, 1.2, 0, PI2);
  ctx.fill();
  // ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(11, -2);
  ctx.lineTo(12, -8);
  ctx.lineTo(15, -2);
  ctx.closePath();
  ctx.moveTo(15, -2);
  ctx.lineTo(17, -7);
  ctx.lineTo(19, -1);
  ctx.closePath();
  ctx.fill();
  // mundane eye with a small shine
  ctx.fillStyle = "#2a2320";
  ctx.beginPath();
  ctx.arc(15, 1.4, 1.3, 0, PI2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(15.4, 1, 0.5, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // bared fang
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(18, 4.6);
  ctx.lineTo(19, 4.6);
  ctx.lineTo(18.5, 6.6);
  ctx.closePath();
  ctx.fill();
  // panting tongue (bobs) + cold breath (liveliness)
  if (A.live) {
    const p = Math.sin(A.t * 4) * 0.5 + 0.5;
    ctx.fillStyle = "#c56b7a";
    ctx.beginPath();
    ctx.ellipse(20, 5.6 + p * 1.2, 1.2, 2 + p, 0.2, 0, PI2);
    ctx.fill();
  }
  rising(ctx, 22, 3, 0, 9, "#dfe6ee", A, 2);
  void body;
}

// Razorback — a bristly charging boar armoured with a row of bony razor-spines
// down its back (distinct from the arena war-boar): tusked, snorting.
function drawRazorback(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const g = ctx.createLinearGradient(0, -2, 0, 16);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-1, 8, 15, 8, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-1, 13, 12, 4, 0, 0, PI2);
  ctx.fill();
  // short hooved legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  for (const x of [-9, -4, 5, 10]) {
    ctx.beginPath();
    ctx.moveTo(x, 13);
    ctx.lineTo(x, 20);
    ctx.stroke();
  }
  ctx.fillStyle = "#2b1c10";
  for (const x of [-9, -4, 5, 10]) ctx.fillRect(x - 1.6, 19, 3.2, 2);
  // razor spinal ridge — bony plates along the back
  ctx.fillStyle = accent;
  ctx.strokeStyle = withShade(accent, -45);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 7; i++) {
    const x = -11 + i * 3.3;
    const h = 5 + Math.sin(i * 1.3) * 1.4 + (i === 3 ? 2 : 0);
    ctx.beginPath();
    ctx.moveTo(x, 1);
    ctx.lineTo(x + 1.6, 1 - h);
    ctx.lineTo(x + 3.2, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // head + snout
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(13, 6, 7, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.ellipse(20, 8, 4, 3, 0.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#2b1c10";
  ctx.beginPath();
  ctx.arc(21, 7.4, 0.7, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(21.4, 8.8, 0.7, 0, PI2);
  ctx.fill();
  // ear
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(9, -0.5);
  ctx.lineTo(10, -5.5);
  ctx.lineTo(13, -1);
  ctx.closePath();
  ctx.fill();
  // angry brow + eye
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(11, 1.5);
  ctx.lineTo(15, 3);
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(12.5, 3, 2, 2);
  // big tusks
  ctx.strokeStyle = "#e8dabc";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(18, 10.5);
  ctx.quadraticCurveTo(23, 8, 21.5, 3.5);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, 11.5);
  ctx.quadraticCurveTo(17.5, 11, 17.5, 8);
  ctx.stroke();
  ctx.lineCap = "butt";
  // snorting breath (liveliness)
  rising(ctx, 22, 2.5, 6, 9, "#d8c3a8", A, 2);
}

// Grizzly — a mundane brown bear-bruiser (NO nature magic, unlike the Druid's
// green bear form): shoulder hump, growling, heavy breath.
function drawGrizzly(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const g = ctx.createLinearGradient(0, -6, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  // lower body / haunches (pear-shaped, wider at the base)
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 9, 12, 10, 0, 0, PI2);
  ctx.fill();
  // hind feet
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-7, 18, 4.5, 3, 0, 0, PI2);
  ctx.ellipse(7, 18, 4.5, 3, 0, 0, PI2);
  ctx.fill();
  // forelegs down the sides
  ctx.fillStyle = withShade(body, -10);
  ctx.beginPath();
  ctx.ellipse(-10, 7, 3.6, 8, 0.12, 0, PI2);
  ctx.ellipse(10, 7, 3.6, 8, -0.12, 0, PI2);
  ctx.fill();
  // fore paws + claws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-10, 13, 4, 2.8, 0, 0, PI2);
  ctx.ellipse(10, 13, 4, 2.8, 0, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (const bx of [-10, 10]) for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + i * 2, 14);
    ctx.lineTo(bx + i * 2, 16.5);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // chest / upper body
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -1, 9.5, 9, 0, 0, PI2);
  ctx.fill();
  // grizzly shoulder hump at the nape
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, -6, 7.5, 4.5, 0, 0, PI2);
  ctx.fill();
  // paler chest fur
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 2, 5, 6, 0, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // head CENTERED on top
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -11, 7.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -6);
  ctx.beginPath();
  ctx.arc(0, -11, 7.5, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.fill();
  // rounded ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-6, -16.5, 3, 0, PI2);
  ctx.arc(6, -16.5, 3, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.beginPath();
  ctx.arc(-6, -16.5, 1.4, 0, PI2);
  ctx.arc(6, -16.5, 1.4, 0, PI2);
  ctx.fill();
  // muzzle + nose
  ctx.fillStyle = withShade(body, 18);
  ctx.beginPath();
  ctx.ellipse(0, -7.5, 4, 3.3, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, -9.5, 1.8, 1.3, 0, 0, PI2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#221a12";
  ctx.beginPath();
  ctx.arc(-3.4, -12.5, 1.2, 0, PI2);
  ctx.arc(3.4, -12.5, 1.2, 0, PI2);
  ctx.fill();
  // growling mouth + fangs
  ctx.fillStyle = "#2a0f0f";
  ctx.beginPath();
  ctx.ellipse(0, -4.5, 2.6, 1.6, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-1.6, -5.5);
  ctx.lineTo(-1, -3);
  ctx.lineTo(-0.4, -5.5);
  ctx.closePath();
  ctx.moveTo(1.6, -5.5);
  ctx.lineTo(1, -3);
  ctx.lineTo(0.4, -5.5);
  ctx.closePath();
  ctx.fill();
  // heavy breath (liveliness)
  rising(ctx, 0, 4, -17, 8, "#c9b59a", A, 2);
}

// Dire Alpha — the Wilds boss: a massive near-black pack alpha with raised
// hackles, blood-red glowing eyes and a faint red rage-aura (boss presence).
function drawDireAlpha(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // blood-red rage backlight
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.06 * A.glow;
  const bl = ctx.createRadialGradient(6, 0, 4, 6, 0, 26);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(6, 0, 26, 0, PI2);
  ctx.fill();
  ctx.restore();
  // heavy raised tail
  ctx.strokeStyle = dark;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-13, 4);
  ctx.quadraticCurveTo(-22, -2, -20, -11);
  ctx.stroke();
  // powerful legs FIRST (behind), so the body overlaps their tops
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-9, 9);
  ctx.lineTo(-11, 16);
  ctx.lineTo(-9, 21); // rear, bent hock
  ctx.moveTo(-3, 10);
  ctx.lineTo(-4, 21);
  ctx.moveTo(6, 10);
  ctx.lineTo(6, 21);
  ctx.moveTo(12, 9);
  ctx.lineTo(13, 16);
  ctx.lineTo(12, 21); // front, bent
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = dark;
  for (const px of [-9, -4, 6, 12]) {
    ctx.beginPath();
    ctx.ellipse(px, 21, 2.6, 1.5, 0, 0, PI2);
    ctx.fill();
  }
  // broad body OVER the leg tops
  const g = ctx.createLinearGradient(0, 0, 0, 16);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-1, 8, 16, 8, -0.05, 0, PI2);
  ctx.fill();
  // tall raised hackles
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(3, -6);
  ctx.lineTo(6, 1);
  ctx.lineTo(9, -7);
  ctx.lineTo(12, 0);
  ctx.lineTo(15, -5);
  ctx.lineTo(16, 4);
  ctx.closePath();
  ctx.fill();
  // scar across the shoulder
  ctx.strokeStyle = withShade(body, 24);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(3, 9);
  ctx.stroke();
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(15, 2, 6.5, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(18, -2);
  ctx.lineTo(26, 3);
  ctx.lineTo(18, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(25.5, 3, 1.4, 0, PI2);
  ctx.fill();
  // ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(12, -3);
  ctx.lineTo(13, -10);
  ctx.lineTo(16.5, -3);
  ctx.closePath();
  ctx.moveTo(16.5, -3);
  ctx.lineTo(19, -9);
  ctx.lineTo(21, -2);
  ctx.closePath();
  ctx.fill();
  // blood-red glowing eyes
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 5;
  ctx.beginPath();
  ctx.ellipse(16, 0.5, 1.6, 1.9, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  // bared fangs + snarl
  ctx.fillStyle = "#f3f3e0";
  ctx.beginPath();
  ctx.moveTo(20, 5.4);
  ctx.lineTo(21.2, 5.4);
  ctx.lineTo(20.6, 8);
  ctx.closePath();
  ctx.moveTo(23, 5);
  ctx.lineTo(24, 5);
  ctx.lineTo(23.5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(18, 7.2);
  ctx.lineTo(23.5, 6.6);
  ctx.stroke();
  // panting heat (liveliness)
  rising(ctx, 24, 3, 3, 10, accent, A, 2);
  void body;
}

// Apex Beast — the rare Wilds catalyst: a colossal scarred predator-bear haloed
// in a primal amber aura, amber eyes ablaze, roaring — its rare appearance is
// meant to read as an event (the catalyst signature aura).
function drawApexBeast(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const amber = "#ffb43a";
  // primal amber aura (catalyst signature)
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.07 * A.glow;
  const bl = ctx.createRadialGradient(0, -2, 5, 0, -2, 30);
  bl.addColorStop(0, amber);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 30, 0, PI2);
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, -8, 0, 22);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  // lower body / haunches
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 10, 15, 12, 0, 0, PI2);
  ctx.fill();
  // hind feet
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-9, 20, 5.5, 3.4, 0, 0, PI2);
  ctx.ellipse(9, 20, 5.5, 3.4, 0, 0, PI2);
  ctx.fill();
  // forelegs down the sides
  ctx.fillStyle = withShade(body, -8);
  ctx.beginPath();
  ctx.ellipse(-13, 8, 4.4, 10, 0.12, 0, PI2);
  ctx.ellipse(13, 8, 4.4, 10, -0.12, 0, PI2);
  ctx.fill();
  // fore paws + great claws
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-13, 16, 5, 3.4, 0, 0, PI2);
  ctx.ellipse(13, 16, 5, 3.4, 0, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#f0e2c0";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const bx of [-13, 13]) for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + i * 2.4, 17.5);
    ctx.lineTo(bx + i * 2.4, 21);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // chest / upper body
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -2, 12, 11, 0, 0, PI2);
  ctx.fill();
  // huge shoulder hump
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, -8, 9.5, 5.5, 0, 0, PI2);
  ctx.fill();
  // claw-scars raked across the chest
  ctx.strokeStyle = withShade(body, 28);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-4 + i * 3, -3);
    ctx.lineTo(-2.5 + i * 3, 6);
    ctx.stroke();
  }
  // head CENTERED
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -13, 9.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -8);
  ctx.beginPath();
  ctx.arc(0, -13, 9.5, 0.16 * Math.PI, 0.84 * Math.PI);
  ctx.fill();
  // ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-7.5, -20, 3.6, 0, PI2);
  ctx.arc(7.5, -20, 3.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -22);
  ctx.beginPath();
  ctx.arc(-7.5, -20, 1.7, 0, PI2);
  ctx.arc(7.5, -20, 1.7, 0, PI2);
  ctx.fill();
  // muzzle + nose
  ctx.fillStyle = withShade(body, 16);
  ctx.beginPath();
  ctx.ellipse(0, -8.5, 5, 4, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(0, -11, 2.2, 1.6, 0, 0, PI2);
  ctx.fill();
  // roaring maw + fangs
  ctx.fillStyle = "#2a0f0f";
  ctx.beginPath();
  ctx.ellipse(0, -4, 4, 3, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  for (const fx of [-2.6, 2.6]) {
    ctx.beginPath();
    ctx.moveTo(fx - 0.8, -6);
    ctx.lineTo(fx, -2.5);
    ctx.lineTo(fx + 0.8, -6);
    ctx.closePath();
    ctx.fill();
  }
  for (const fx of [-1.6, 1.6]) {
    ctx.beginPath();
    ctx.moveTo(fx - 0.7, -2.2);
    ctx.lineTo(fx, -4.4);
    ctx.lineTo(fx + 0.7, -2.2);
    ctx.closePath();
    ctx.fill();
  }
  // blazing amber eyes
  ctx.save();
  ctx.fillStyle = amber;
  ctx.shadowColor = amber;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.beginPath();
  ctx.arc(-4, -14.5, 2, 0, PI2);
  ctx.arc(4, -14.5, 2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // angry brow
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6.5, -17);
  ctx.lineTo(-2, -15.5);
  ctx.moveTo(6.5, -17);
  ctx.lineTo(2, -15.5);
  ctx.stroke();
  // rising embers/dust (catalyst liveliness)
  rising(ctx, 0, 15, 18, 32, amber, A, 5);
  void accent;
}

// ---- The Sealed Vault (loosed arcana) -------------------------------------

// Arcane Wisp — an unstable violet mote of loosed magic: a crackling spiked
// energy core with lightning tendrils + an orbiting rune-shard (distinct from
// the soft radiant Light Wisp of the Spire).
function drawArcaneWisp(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  void dark;
  const t = A.t;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -4, 15, 0, PI2);
  ctx.fill();
  ctx.restore();
  // crackling energy tendrils (animated)
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = light;
    ctx.lineWidth = 1;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.8;
    for (let k = 0; k < 4; k++) {
      const a0 = t * 2 + k * 1.57;
      ctx.beginPath();
      let r = 3, x = Math.cos(a0) * r, y = -4 + Math.sin(a0) * r;
      ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        r += 3;
        const jitter = Math.sin(t * 10 + k + s) * 0.24;
        x = Math.cos(a0 + jitter) * r;
        y = -4 + Math.sin(a0 + jitter) * r;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // spiked energy core (slow-spinning star)
  ctx.save();
  ctx.fillStyle = body;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8 + A.glow * 6;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI2 + t * 0.5;
    const r = i % 2 ? 4 : 8;
    const x = Math.cos(a) * r, y = -4 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#f0ecff";
  ctx.beginPath();
  ctx.arc(-1.5, -5.5, 2.4, 0, PI2);
  ctx.fill();
  // orbiting rune-shard
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4;
  const oa = t * 2.5;
  ctx.beginPath();
  ctx.arc(Math.cos(oa) * 12, -4 + Math.sin(oa) * 7, 1.6, 0, PI2);
  ctx.fill();
  ctx.restore();
}

// Imp — a small winged fiend: pot-bellied, horned, barb-tailed, cradling a
// flickering ember. Wings flap, tail sways, eyes glow.
function drawImp(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const flap = A.live ? Math.sin(A.t * 6) * 2 : 0;
  // bat wings (behind the body)
  ctx.fillStyle = dark;
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(s * 3, -2);
    ctx.quadraticCurveTo(s * 14, -10 - flap, s * 16, -flap);
    ctx.quadraticCurveTo(s * 12, -1, s * 13, 4 - flap);
    ctx.quadraticCurveTo(s * 10, 2, s * 3, 4);
    ctx.closePath();
    ctx.fill();
  }
  // barbed tail (sways)
  const tw = A.live ? Math.sin(A.t * 3) * 3 : 0;
  ctx.strokeStyle = body;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.quadraticCurveTo(-8, 14, -7 + tw, 18);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-7 + tw, 18);
  ctx.lineTo(-9 + tw, 21);
  ctx.lineTo(-5 + tw, 21);
  ctx.closePath();
  ctx.fill();
  // pot-bellied body
  const g = ctx.createLinearGradient(0, -4, 0, 12);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 5, 7, 7, 0, 0, PI2);
  ctx.fill();
  // legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, 11);
  ctx.lineTo(-4, 16);
  ctx.moveTo(3, 11);
  ctx.lineTo(4, 16);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(-6, 16, 3, 1.6);
  ctx.fillRect(3, 16, 3, 1.6);
  // head + horns
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(1, -3, 5.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(1, -3, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = withShade(body, -20);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-3, -7);
  ctx.quadraticCurveTo(-6, -11, -4, -13);
  ctx.moveTo(5, -7);
  ctx.quadraticCurveTo(8, -11, 6, -13);
  ctx.stroke();
  ctx.lineCap = "butt";
  // glowing eyes + grin
  ctx.save();
  ctx.fillStyle = "#ffe08a";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(-1, -3.5, 1.1, 0, PI2);
  ctx.arc(3, -3.5, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#2a0f0f";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1.5, -0.5);
  ctx.quadraticCurveTo(1, 1.5, 3.5, -0.5);
  ctx.stroke();
  // conjured ember in the raised hand (flickers)
  ctx.strokeStyle = body;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(5, 3);
  ctx.lineTo(11, -1);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  const fl = 2 + (A.live ? Math.abs(Math.sin(A.t * 8)) * 1.5 : 0.6);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(12, -2, fl, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(12, -2, fl * 0.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  rising(ctx, 12, 2, -3, 9, accent, A, 2);
}

// Vault Cultist — a hooded arcane devotee channelling a floating sigil (a
// spinning rune-ring), glowing eyes in the hood shadow.
function drawCultist(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const vio = accent;
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(10, 20);
  const hem: [number, number][] = [[7, 17], [4, 20], [1, 17], [-2, 20], [-5, 17], [-8, 20], [-10, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -28);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(6, 18);
  ctx.lineTo(-6, 18);
  ctx.closePath();
  ctx.fill();
  // sleeves meeting at the held sigil
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-1, 8);
  ctx.moveTo(6, 0);
  ctx.lineTo(1, 8);
  ctx.stroke();
  ctx.lineCap = "butt";
  // floating arcane sigil (pulsing ring + spinning rune)
  ctx.save();
  ctx.translate(0, 8);
  ctx.strokeStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 7;
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(A.t * 3);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, PI2);
  ctx.stroke();
  ctx.rotate(A.t * 1.5);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI2;
    if (i === 0) ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
    else ctx.lineTo(Math.cos(a) * 3, Math.sin(a) * 3);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(7, -9);
  ctx.lineTo(0, -1);
  ctx.lineTo(-7, -9);
  ctx.closePath();
  ctx.fill();
  // shadowed face + glowing eyes
  ctx.fillStyle = "#0d0a14";
  ctx.beginPath();
  ctx.ellipse(0, -8, 3.4, 4, 0, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = vio;
  ctx.shadowColor = vio;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-1.4, -8, 1, 0, PI2);
  ctx.arc(1.4, -8, 1, 0, PI2);
  ctx.fill();
  ctx.restore();
  rising(ctx, 0, 7, 16, 22, accent, A, 3);
}

// Rune Golem — the Sealed Vault boss: a hulking stone construct carved with
// glowing glyphs that halve every hit. A pulsing hex ward radiates off it.
function drawRuneGolem(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const rune = accent;
  // expanding hex ward (the damage-halving signature)
  if (A.live) {
    ctx.save();
    ctx.translate(0, -2);
    ctx.strokeStyle = rune;
    ctx.shadowColor = rune;
    ctx.shadowBlur = 6;
    const pw = (A.t * 0.5) % 1;
    ctx.globalAlpha = (1 - pw) * 0.4;
    ctx.lineWidth = 1.2;
    const R = 14 + pw * 8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * PI2;
      const x = Math.cos(a) * R, y = Math.sin(a) * R * 0.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  // stone legs
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-9, 12, 7, 11, 2);
  ctx.roundRect(3, 12, 7, 11, 2);
  ctx.fill();
  // blocky stone torso
  const g = ctx.createLinearGradient(0, -12, 0, 14);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-12, -10, 24, 24, 4);
  ctx.fill();
  // plate seams
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -2);
  ctx.lineTo(12, -2);
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 14);
  ctx.stroke();
  // heavy arms + fists
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-18, -6, 6, 16, 3);
  ctx.roundRect(12, -6, 6, 16, 3);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-15, 12, 4.5, 0, PI2);
  ctx.arc(15, 12, 4.5, 0, PI2);
  ctx.fill();
  // stone head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.roundRect(-6, -19, 12, 10, 3);
  ctx.fill();
  // glowing rune glyphs (pulse)
  ctx.save();
  ctx.strokeStyle = rune;
  ctx.shadowColor = rune;
  ctx.shadowBlur = 5 + A.glow * 5;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(A.t * 2);
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(4, 2);
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 6);
  ctx.moveTo(-3, 6);
  ctx.lineTo(3, 6);
  ctx.moveTo(-15, -2);
  ctx.lineTo(-15, 4);
  ctx.moveTo(15, -2);
  ctx.lineTo(15, 4);
  ctx.stroke();
  ctx.restore();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = rune;
  ctx.shadowColor = rune;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-2.5, -14, 1.1, 0, PI2);
  ctx.arc(2.5, -14, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
}

// Archmage — the Sealed Vault catalyst AND playable legendary ("Woven Gold +
// Grimoire" mockup, 2026-07-13): a grand master caster haloed in orbiting
// rune-glyphs, breathing hover, shimmer beads running down the robe's gold
// seams, a fluttering open grimoire that sheds the four spell elements
// (flame / snowflake / bolt / rune), and a twinkling starred hat worn ON the
// head (head first, brim over the forehead, eyes on top — the old order drew
// the face over the brim). Mirror Image reuses this draw.
const GRIMOIRE_MOTE_COLORS = ["#fb923c", "#7dd3fc", "#fde047", "#c084fc"]; // fire, frost, bolt, arcane
function drawArchmage(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const gold = accent;
  const t = A.t;
  const breathe = A.live ? Math.sin(t * 1.4) * 0.8 : 0;
  ctx.save();
  ctx.translate(0, breathe);
  // orbiting arcane rune-glyphs aura (catalyst signature)
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 5;
  for (let k = 0; k < 3; k++) {
    const a = t * 1.3 + k * 2.094;
    const x = Math.cos(a) * 16, y = -4 + Math.sin(a) * 10;
    ctx.globalAlpha = 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, PI2);
    ctx.moveTo(-2.2, 0);
    ctx.lineTo(2.2, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // flowing robe
  const rg = ctx.createLinearGradient(0, -10, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(11, 20);
  const hem: [number, number][] = [[8, 17], [5, 20], [2, 17], [-2, 20], [-5, 17], [-8, 20], [-11, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  // gold seams, pulsing between faint and bright
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6));
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-7, 18);
  ctx.moveTo(0, -8);
  ctx.lineTo(7, 18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // shimmer bead running down each seam
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 5;
  for (const dir of [-1, 1]) {
    const ph = (t * 0.7 + (dir + 1) * 0.25) % 1;
    ctx.globalAlpha = 0.9 * Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.arc(dir * 7 * ph, -8 + 26 * ph, 1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // arms
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5, -2);
  ctx.lineTo(-11, 4);
  ctx.moveTo(5, -2);
  ctx.lineTo(12, -4);
  ctx.stroke();
  ctx.lineCap = "butt";
  // staff with a glowing orb
  ctx.strokeStyle = "#5a4a2a";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(13, 20);
  ctx.lineTo(12, -14);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8 + A.glow * 6;
  ctx.beginPath();
  ctx.arc(12, -16, 3.4, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(11, -17, 1.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // floating open spellbook at the off hand, a page mid-turn over the spine
  ctx.save();
  ctx.translate(-13, 4 + (A.live ? Math.sin(t * 2) : 0));
  ctx.fillStyle = "#6b1f2a";
  ctx.beginPath();
  ctx.moveTo(-4, -3);
  ctx.lineTo(0, -2);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a2531";
  ctx.beginPath();
  ctx.moveTo(4, -3);
  ctx.lineTo(0, -2);
  ctx.lineTo(0, 3);
  ctx.lineTo(4, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#efe6cf";
  ctx.beginPath();
  ctx.moveTo(-3.4, -2.2);
  ctx.lineTo(0, -1.4);
  ctx.lineTo(0, 2.2);
  ctx.lineTo(-3.4, 1.4);
  ctx.closePath();
  ctx.moveTo(3.4, -2.2);
  ctx.lineTo(0, -1.4);
  ctx.lineTo(0, 2.2);
  ctx.lineTo(3.4, 1.4);
  ctx.closePath();
  ctx.fill();
  const flutter = (t * 1.6) % 1;
  ctx.strokeStyle = "#efe6cf";
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 2.2);
  ctx.quadraticCurveTo(3.2 - flutter * 6.4, -4.5, 0, -1.4);
  ctx.stroke();
  ctx.restore();
  // the four spell elements drifting up out of the open book — one mote per
  // school (fire flame, frost flake, lightning bolt, arcane rune), each on its
  // own phase, swaying as it climbs and fading out
  ctx.save();
  for (let k = 0; k < 4; k++) {
    const ph = (t * 0.55 + k * 0.25) % 1;
    const mx = -13 + Math.sin((t + k * 7) * 2.2) * 2.5;
    const my = 2 - ph * 22;
    ctx.globalAlpha = 0.8 * (1 - ph);
    ctx.save();
    ctx.translate(mx, my);
    if (k % 2 === 0) ctx.rotate(Math.sin((t + k) * 1.5) * 0.4); // gentle tumble
    const mc = GRIMOIRE_MOTE_COLORS[k];
    ctx.strokeStyle = mc;
    ctx.fillStyle = mc;
    ctx.shadowColor = mc;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (k === 0) {
      // flame
      ctx.moveTo(0, -2.1);
      ctx.quadraticCurveTo(1.7, -0.2, 0.9, 1.1);
      ctx.quadraticCurveTo(0.4, 1.8, 0, 1.3);
      ctx.quadraticCurveTo(-0.4, 1.8, -0.9, 1.1);
      ctx.quadraticCurveTo(-1.7, -0.2, 0, -2.1);
      ctx.fill();
    } else if (k === 1) {
      // snowflake
      for (let s = 0; s < 3; s++) {
        const a = (s * Math.PI) / 3;
        ctx.moveTo(Math.cos(a) * 1.8, Math.sin(a) * 1.8);
        ctx.lineTo(-Math.cos(a) * 1.8, -Math.sin(a) * 1.8);
      }
      ctx.stroke();
    } else if (k === 2) {
      // lightning bolt
      ctx.moveTo(-0.6, -1.9);
      ctx.lineTo(0.5, -0.3);
      ctx.lineTo(-0.4, 0.1);
      ctx.lineTo(0.7, 1.9);
      ctx.stroke();
    } else {
      // arcane rune
      ctx.arc(0, 0, 1.6, 0, PI2);
      ctx.moveTo(-1.6, 0);
      ctx.lineTo(1.6, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // face + beard FIRST so the hat sits on the head, not behind it
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -5, 3.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#0d1633";
  ctx.fillRect(-2.2, -6, 4.4, 2.4);
  // long beard
  ctx.fillStyle = "#e8eaf0";
  ctx.beginPath();
  ctx.moveTo(-2.4, -3);
  ctx.lineTo(2.4, -3);
  ctx.lineTo(1, 4);
  ctx.lineTo(0, 2);
  ctx.lineTo(-1, 4);
  ctx.closePath();
  ctx.fill();
  // tall starred hat — cone, then brim ACROSS the forehead
  const twinkle = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-7, -7.5);
  ctx.lineTo(0, -26);
  ctx.lineTo(7, -7.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.beginPath();
  ctx.ellipse(0, -7.5, 8, 2.4, 0, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4 + twinkle * 5;
  ctx.beginPath();
  ctx.arc(2, -16, 1.4 + twinkle * 0.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5.6, -10);
  ctx.lineTo(5.6, -10);
  ctx.stroke();
  // stray sparkles around the hat tip
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.6 + 0.4 * twinkle;
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 2; k++) {
    const a = t * 2 + k * Math.PI;
    const sx = Math.cos(a) * 5, sy = -24 + Math.sin(a) * 3;
    ctx.beginPath();
    ctx.moveTo(sx - 1.4, sy);
    ctx.lineTo(sx + 1.4, sy);
    ctx.moveTo(sx, sy - 1.4);
    ctx.lineTo(sx, sy + 1.4);
    ctx.stroke();
  }
  ctx.restore();
  // glowing eyes on top so the brim never swallows them
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(-1.3, -4.6, 0.8, 0, PI2);
  ctx.arc(1.3, -4.6, 0.8, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---- The Overgrowth (blighted grove) --------------------------------------

// Thornbeast — a low bramble-hided charger bristling with curved thorns and
// moss dapples (distinct from the arena war-boar's bony ridge).
function drawThornbeast(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const x of [-9, -4, 5, 10]) {
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x, 20);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  const g = ctx.createLinearGradient(0, -2, 0, 15);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-1, 7, 15, 8, 0, 0, PI2);
  ctx.fill();
  // moss dapples
  ctx.fillStyle = withShade(body, 25);
  ctx.globalAlpha = 0.5;
  for (const [mx, my] of [[-6, 3], [2, 6], [7, 2], [-2, 9]] as const) {
    ctx.beginPath();
    ctx.arc(mx, my, 2.2, 0, PI2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // curved bramble thorns along the back
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const x = -10 + i * 3.4;
    ctx.beginPath();
    ctx.moveTo(x, 1);
    ctx.quadraticCurveTo(x + 1, -6, x + 3, -7);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // leaves
  ctx.fillStyle = withShade(accent, -10);
  ctx.beginPath();
  ctx.ellipse(-8, -6, 2.4, 1.2, -0.6, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(9, -6, 2.4, 1.2, 0.6, 0, PI2);
  ctx.fill();
  // blunt head + snout
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(13, 7, 6.5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -10);
  ctx.beginPath();
  ctx.ellipse(19, 9, 3.5, 2.8, 0.2, 0, PI2);
  ctx.fill();
  // glowing green eye
  ctx.save();
  ctx.fillStyle = "#c6f76a";
  ctx.shadowColor = "#8fae52";
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(13, 5, 1.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // thorn tusk
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(16, 10.5);
  ctx.quadraticCurveTo(20, 9, 19, 6);
  ctx.stroke();
  ctx.lineCap = "butt";
  // drifting spores (liveliness)
  rising(ctx, 0, 12, 10, 22, "#d9f99d", A, 3);
}

// Dryad — the grove's healer: a slender bark-skinned tree-spirit with leafy
// hair, cradling a pulsing heal-bloom (distinct from the Cleric).
function drawDryad(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const leaf = accent;
  const g = ctx.createLinearGradient(0, -8, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.quadraticCurveTo(-8, 16, -6, 20);
  ctx.lineTo(6, 20);
  ctx.quadraticCurveTo(8, 16, 4, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withShade(body, -20);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1, -4);
  ctx.lineTo(-2, 16);
  ctx.moveTo(2, -4);
  ctx.lineTo(2, 16);
  ctx.stroke();
  // root feet
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, 20);
  ctx.lineTo(-7, 23);
  ctx.moveTo(0, 20);
  ctx.lineTo(0, 23);
  ctx.moveTo(4, 20);
  ctx.lineTo(7, 23);
  ctx.stroke();
  // arms
  ctx.strokeStyle = body;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.quadraticCurveTo(-9, -4, -10, -9);
  ctx.moveTo(3, -2);
  ctx.quadraticCurveTo(9, -3, 11, -8);
  ctx.stroke();
  ctx.lineCap = "butt";
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -11, 4.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -10);
  ctx.beginPath();
  ctx.arc(0, -11, 4.6, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  // leafy hair crown
  ctx.fillStyle = leaf;
  for (const [lx, ly, r] of [[-4, -15, 3], [0, -17, 3.4], [4, -15, 3], [-2, -16, 2.6], [2, -16, 2.6]] as const) {
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = withShade(leaf, 25);
  ctx.beginPath();
  ctx.arc(-1, -17, 1.4, 0, PI2);
  ctx.fill();
  // calm glowing eyes
  ctx.save();
  ctx.fillStyle = "#eafff0";
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(-1.6, -11, 0.9, 0, PI2);
  ctx.arc(1.6, -11, 0.9, 0, PI2);
  ctx.fill();
  ctx.restore();
  // heal-bloom in the raised hand (petals turn slowly)
  ctx.save();
  ctx.translate(-11, -10);
  ctx.fillStyle = leaf;
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 6 + A.glow * 5;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * PI2 + A.t * 0.5;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1.6, 1, a, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(0, 0, 1.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rising heal-motes (liveliness)
  rising(ctx, -8, 5, -6, 16, "#bbf7d0", A, 3);
}

// Wildheart — the rare Overgrowth catalyst: the grove's beating heart, a fierce
// heartwood-spirit haloed in a golden radiance with a pulsing heart-core and
// glowing sap-cracks (the catalyst signature).
function drawWildheart(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const gold = accent;
  // radiant golden aura (catalyst signature)
  ctx.save();
  ctx.globalAlpha = 0.2 + 0.08 * A.glow;
  const bl = ctx.createRadialGradient(0, -2, 4, 0, -2, 28);
  bl.addColorStop(0, gold);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 28, 0, PI2);
  ctx.fill();
  ctx.restore();
  // gnarled heartwood body
  const g = ctx.createLinearGradient(0, -14, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-9, -8);
  ctx.quadraticCurveTo(-12, 14, -6, 20);
  ctx.lineTo(6, 20);
  ctx.quadraticCurveTo(12, 14, 9, -8);
  ctx.quadraticCurveTo(5, -14, 0, -13);
  ctx.quadraticCurveTo(-5, -14, -9, -8);
  ctx.closePath();
  ctx.fill();
  // root legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5, 19);
  ctx.lineTo(-8, 24);
  ctx.moveTo(0, 20);
  ctx.lineTo(0, 24);
  ctx.moveTo(5, 19);
  ctx.lineTo(8, 24);
  ctx.stroke();
  // branch arms + twig claws
  ctx.strokeStyle = body;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.quadraticCurveTo(-14, -4, -16, -11);
  ctx.moveTo(6, -2);
  ctx.quadraticCurveTo(14, -4, 16, -11);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  for (const [hx, hy, d] of [[-16, -11, -1], [16, -11, 1]] as const) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + d * 2, hy - 3 + i * 2);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // glowing golden heart-core (pulses) — the signature
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8 + A.glow * 8;
  const hp = 0.9 + 0.2 * Math.sin(A.t * 3);
  ctx.beginPath();
  ctx.moveTo(0, 2 * hp);
  ctx.bezierCurveTo(-4, -3 * hp, -5, 3 * hp, 0, 6 * hp);
  ctx.bezierCurveTo(5, 3 * hp, 4, -3 * hp, 0, 2 * hp);
  ctx.fill();
  ctx.restore();
  // glowing sap-cracks from the heart
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4;
  ctx.globalAlpha = 0.6 + 0.3 * Math.sin(A.t * 3);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(-3, 10);
  ctx.moveTo(0, 4);
  ctx.lineTo(4, 9);
  ctx.moveTo(0, 0);
  ctx.lineTo(-4, -4);
  ctx.moveTo(0, 0);
  ctx.lineTo(4, -5);
  ctx.stroke();
  ctx.restore();
  // fierce bark visage
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withShade(body, -12);
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.lineTo(-1, -12);
  ctx.moveTo(4, -13);
  ctx.lineTo(1, -12);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = "#fff7cf";
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-1.8, -11, 1.1, 0, PI2);
  ctx.arc(1.8, -11, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // leafy crown tufts
  ctx.fillStyle = withShade(gold, -30);
  for (const [lx, ly] of [[-4, -15], [0, -16.5], [4, -15]] as const) {
    ctx.beginPath();
    ctx.arc(lx, ly, 2.2, 0, PI2);
    ctx.fill();
  }
  // rising golden pollen (catalyst liveliness)
  rising(ctx, 0, 13, 14, 28, gold, A, 5);
}

// ---- The Eclipse Spire (celestial light & dark) ---------------------------

// Light Wisp — a soft radiant golden star-mote with slow rotating rays and
// twinkling sparks (the warm counterpart to the crackling Arcane Wisp).
function drawLightWisp(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  void dark;
  void accent;
  const t = A.t;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -4, 14, 0, PI2);
  ctx.fill();
  ctx.restore();
  // slow rotating rays
  ctx.save();
  ctx.translate(0, -4);
  ctx.rotate(t * 0.4);
  ctx.strokeStyle = light;
  ctx.shadowColor = body;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI2;
    const r1 = 11 + (i % 2 ? 2 : 0);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
  // glowing core
  ctx.save();
  ctx.fillStyle = body;
  ctx.shadowColor = body;
  ctx.shadowBlur = 10 + A.glow * 6;
  ctx.beginPath();
  ctx.arc(0, -4, 5.5, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(-1.4, -5.4, 2.4, 0, PI2);
  ctx.fill();
  // twinkling sparks
  if (A.live) {
    ctx.fillStyle = light;
    for (let k = 0; k < 3; k++) {
      const a = t * 1.5 + k * 2.1;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + k);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 10, -4 + Math.sin(a) * 10, 0.9, 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Shadow Wraith — a winged umbral nightmare: a horned hood over a floating cloak,
// tattered shadow-wings spread wide (subtly flapping), a pulsing dark aura and
// glowing violet eyes. No arms — pure creeping dark. (Other directions explored
// this session: reaper, faceless shade, crawling terror.)
function drawShadowWraith(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const glow = "#a970ff";
  const hover = A.live ? Math.sin(A.t * 1.8) * 1.5 : 0;
  ctx.save();
  ctx.translate(0, hover);
  // pulsing dark aura — a shadow bloom with a violet rim
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.15 * A.glow;
  const R = 23 + A.glow * 4;
  const bl = ctx.createRadialGradient(0, -2, 3, 0, -2, R);
  bl.addColorStop(0, "rgba(9,6,18,0.8)");
  bl.addColorStop(0.55, withAlpha(body, 0.55));
  bl.addColorStop(0.82, withAlpha(accent, 0.35));
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, R, 0, PI2);
  ctx.fill();
  ctx.restore();
  // tattered shadow-wings (subtle flap)
  const flap = A.live ? Math.sin(A.t * 3) * 0.12 : 0;
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 4, -4);
    ctx.rotate(s * flap);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 12, -10, s * 18, -2);
    ctx.lineTo(s * 13, 0);
    ctx.lineTo(s * 16, 6);
    ctx.lineTo(s * 10, 3);
    ctx.lineTo(s * 12, 10);
    ctx.lineTo(s * 5, 4);
    ctx.quadraticCurveTo(s * 2, 2, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // floating cloak body tapering to tattered points (no arms)
  const rg = ctx.createLinearGradient(0, -14, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.quadraticCurveTo(-10, 10, -6, 20);
  ctx.lineTo(-3, 15);
  ctx.lineTo(-1, 21);
  ctx.lineTo(1, 15);
  ctx.lineTo(3, 21);
  ctx.lineTo(6, 20);
  ctx.quadraticCurveTo(10, 10, 7, -6);
  ctx.quadraticCurveTo(0, -14, -7, -6);
  ctx.closePath();
  ctx.fill();
  // horned hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(7, -13, 6, -4);
  ctx.quadraticCurveTo(0, -2, -6, -4);
  ctx.quadraticCurveTo(-7, -13, 0, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withShade(body, -20);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.quadraticCurveTo(-9, -18, -7, -23);
  ctx.moveTo(4, -13);
  ctx.quadraticCurveTo(9, -18, 7, -23);
  ctx.stroke();
  ctx.lineCap = "butt";
  // face void + pulsing glowing eyes
  ctx.fillStyle = "#0a0812";
  ctx.beginPath();
  ctx.ellipse(0, -8, 3, 3.8, 0, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = glow;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5 + A.glow * 5;
  ctx.beginPath();
  ctx.ellipse(-1.5, -8, 1, 1.3 + A.glow * 0.2, 0, 0, PI2);
  ctx.ellipse(1.5, -8, 1, 1.3 + A.glow * 0.2, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore(); // hover
  // rising dark wisps (liveliness)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = accent;
    for (let i = 0; i < 4; i++) {
      const seed = i * 1.7;
      const life = (A.t * 0.5 + seed) % 1;
      const wx = (i - 1.5) * 5 + Math.sin(A.t * 1.5 + seed) * 3;
      const wy = 10 - life * 26;
      ctx.globalAlpha = (1 - life) * 0.4;
      ctx.beginPath();
      ctx.arc(wx, wy, 1.4 * (1 - life) + 0.5, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Eclipse Acolyte — a twilight-robed caster channelling an eclipse-disc sigil
// (half gold light, half dark) with a shifting corona; one gold eye, one violet.
function drawEclipseAcolyte(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(10, 20);
  const hem: [number, number][] = [[7, 17], [4, 20], [1, 17], [-2, 20], [-5, 17], [-8, 20], [-10, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -28);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(6, 18);
  ctx.lineTo(-6, 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-1, 7);
  ctx.moveTo(6, 0);
  ctx.lineTo(1, 7);
  ctx.stroke();
  ctx.lineCap = "butt";
  // eclipse disc sigil
  ctx.save();
  ctx.translate(0, 8);
  ctx.fillStyle = "#1a1330";
  ctx.beginPath();
  ctx.arc(0, 0, 4.4, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 4.4, 0, PI2);
  ctx.clip();
  ctx.fillStyle = light;
  ctx.shadowColor = light;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(1.8, 0, 4.4, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = light;
  ctx.shadowColor = light;
  ctx.shadowBlur = 5;
  ctx.globalAlpha = 0.6 + 0.3 * Math.sin(A.t * 3);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI2 + A.t * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
    ctx.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
    ctx.stroke();
  }
  ctx.restore();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(7, -9);
  ctx.lineTo(0, -1);
  ctx.lineTo(-7, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0d0a18";
  ctx.beginPath();
  ctx.ellipse(0, -8, 3.2, 4, 0, 0, PI2);
  ctx.fill();
  // one gold eye, one violet
  ctx.save();
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.fillStyle = light;
  ctx.shadowColor = light;
  ctx.beginPath();
  ctx.arc(-1.4, -8, 1, 0, PI2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.beginPath();
  ctx.arc(1.4, -8, 1, 0, PI2);
  ctx.fill();
  ctx.restore();
  rising(ctx, 0, 7, 16, 22, accent, A, 3);
}

// Eclipse Warden — the Spire boss: a celestial armoured archer wielding a bow of
// light, framed by a split light/dark halo and a glowing visor.
function drawEclipseWarden(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const gold = accent;
  // split light/dark halo (boss signature)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -4, 17, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = withAlpha(gold, 0.18);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -4, 17, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(26,20,54,0.4)";
  ctx.fill();
  ctx.restore();
  // armoured body
  const g = ctx.createLinearGradient(0, -8, 0, 20);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.lineTo(8, -6);
  ctx.lineTo(10, 20);
  const hem: [number, number][] = [[6, 17], [2, 20], [-2, 17], [-6, 20], [-9, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  // pauldrons + gold trim
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(-7, -5, 4, 3, 0, 0, PI2);
  ctx.ellipse(8, -5, 4, 3, 0, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(-5, 18);
  ctx.moveTo(0, -4);
  ctx.lineTo(5, 18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // lead arm to the bow grip
  ctx.strokeStyle = body;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(5, -3);
  ctx.lineTo(13, 0);
  ctx.stroke();
  ctx.lineCap = "butt";
  // helmed head + glowing visor
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -11, 4.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -11, 4.6, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.fillRect(-2.6, -11.6, 5.2, 1.5);
  ctx.restore();
  // crescent helm crest
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -16, 3, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // bow of light + nocked light-arrow
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 7;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, -11);
  ctx.quadraticCurveTo(21, 0, 13, 11);
  ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(13, -11);
  ctx.lineTo(8, 0);
  ctx.lineTo(13, 11);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(19, -2);
  ctx.lineTo(19, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  rising(ctx, 0, 10, 16, 26, gold, A, 3);
}

// Eclipse Herald — the rare Spire catalyst: a serene herald of twin light with
// a light wing and a dark wing, cradling a sun-orb and a moon-orb inside a
// split light/dark aura (the catalyst signature).
function drawEclipseHerald(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const gold = accent;
  const t = A.t;
  // twin split aura (catalyst signature)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -4, 20, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = withAlpha(gold, 0.16);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -4, 20, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(20,20,45,0.4)";
  ctx.fill();
  ctx.restore();
  // dark wing (left)
  ctx.fillStyle = "#161230";
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  ctx.quadraticCurveTo(-18, -12, -20, -2);
  ctx.quadraticCurveTo(-14, -4, -14, 3);
  ctx.quadraticCurveTo(-10, -1, -4, 2);
  ctx.closePath();
  ctx.fill();
  // light wing (right)
  ctx.save();
  ctx.fillStyle = withAlpha(gold, 0.9);
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(4, -4);
  ctx.quadraticCurveTo(18, -12, 20, -2);
  ctx.quadraticCurveTo(14, -4, 14, 3);
  ctx.quadraticCurveTo(10, -1, 4, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // radiant robe
  const rg = ctx.createLinearGradient(0, -10, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(9, 20);
  const hem: [number, number][] = [[6, 17], [3, 20], [0, 17], [-3, 20], [-6, 17], [-9, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -11, 4.4, 0, PI2);
  ctx.fill();
  // radiant halo crown
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(0, -15, 3.2, Math.PI * 0.1, Math.PI * 0.9, true);
  ctx.stroke();
  ctx.restore();
  // serene glowing eyes
  ctx.save();
  ctx.fillStyle = "#fffef0";
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-1.5, -11, 0.9, 0, PI2);
  ctx.arc(1.5, -11, 0.9, 0, PI2);
  ctx.fill();
  ctx.restore();
  // twin orbs — a sun and a moon, drifting opposite
  const ob = A.live ? Math.sin(t * 1.5) * 1.5 : 0;
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8 + A.glow * 5;
  ctx.beginPath();
  ctx.arc(11, 2 + ob, 3, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(10, 1 + ob, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#2a2450";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(-11, 2 - ob, 3, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#4a4478";
  ctx.beginPath();
  ctx.arc(-10.2, 1 - ob, 2.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // rising radiant motes (catalyst liveliness)
  rising(ctx, 0, 12, 14, 28, gold, A, 4);
}

// ---- The Deep Forge (constructs) ------------------------------------------

// Clockwork Spider — a small skittering metal spider: gunmetal body, eight
// articulated legs, a spinning back-gear and a glowing brass lens.
function drawClockworkSpider(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  void body;
  const brass = accent;
  const tw = A.live ? Math.sin(A.t * 6) : 0;
  // eight articulated legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bx = side * 3, by = 3 + i * 1.6;
      const kneeX = side * (9 + i), kneeY = 1 + i * 1.6 - (i === 1 || i === 2 ? tw : 0);
      const footX = side * (13 + i * 0.6), footY = 12 + i * 1.3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt";
  // abdomen (rear)
  const g = ctx.createRadialGradient(-6, 3, 1, -6, 5, 10);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-6, 5, 7, 6, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = brass;
  for (const [rx, ry] of [[-8, 3], [-5, 6], [-9, 7]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 0.9, 0, PI2);
    ctx.fill();
  }
  // spinning back-gear
  ctx.save();
  ctx.translate(-6, 5);
  ctx.rotate(A.t * 1.5);
  ctx.strokeStyle = brass;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
    ctx.lineTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, PI2);
  ctx.stroke();
  ctx.restore();
  // cephalothorax
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(4, 4, 6, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(4, 6, 6, 3, 0, 0, PI2);
  ctx.fill();
  // glowing brass lens
  ctx.save();
  ctx.fillStyle = brass;
  ctx.shadowColor = brass;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(8, 3, 2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#fff6d0";
  ctx.beginPath();
  ctx.arc(8, 3, 0.9, 0, PI2);
  ctx.fill();
  ctx.restore();
  // mandibles
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(9, 5);
  ctx.lineTo(12, 6);
  ctx.moveTo(9, 6);
  ctx.lineTo(11, 8);
  ctx.stroke();
  ctx.lineCap = "butt";
  rising(ctx, -6, 3, -2, 8, "#c9ccd2", A, 2);
}

// Forge Sentry — a ranged brass construct: a riveted drum body on stubby legs
// with a forward cannon whose muzzle charges (distinct from the Engineer turret).
function drawSentry(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const amber = accent;
  // stubby legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, 12);
  ctx.lineTo(-8, 20);
  ctx.moveTo(4, 12);
  ctx.lineTo(8, 20);
  ctx.moveTo(0, 13);
  ctx.lineTo(0, 20);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = dark;
  ctx.fillRect(-10, 19, 5, 2);
  ctx.fillRect(5, 19, 5, 2);
  ctx.fillRect(-2, 19, 4, 2);
  // brass drum body
  const g = ctx.createLinearGradient(0, -6, 0, 14);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-9, -4, 18, 17, 4);
  ctx.fill();
  ctx.fillStyle = withShade(body, -20);
  ctx.fillRect(-9, 3, 18, 2.5);
  ctx.fillStyle = amber;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-7 + i * 3.5, 4.2, 0.8, 0, PI2);
    ctx.fill();
  }
  // forward cannon
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(6, -1, 12, 6, 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.fillRect(15, -1, 3, 6);
  ctx.save();
  ctx.fillStyle = amber;
  ctx.shadowColor = amber;
  ctx.shadowBlur = 6 + A.glow * 6;
  ctx.beginPath();
  ctx.arc(18, 2, 1.6 + A.glow * 0.8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // head dome + glowing eye
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(-1, -5, 5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.fillStyle = amber;
  ctx.shadowColor = amber;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.beginPath();
  ctx.arc(-1, -3, 2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#fff6d0";
  ctx.beginPath();
  ctx.arc(-1.5, -3.5, 0.8, 0, PI2);
  ctx.fill();
  ctx.restore();
  // smokestack + steam
  ctx.fillStyle = dark;
  ctx.fillRect(-8, -8, 2.5, 4);
  rising(ctx, -7, 2, -8, 9, "#b9bcc4", A, 2);
}

// Animated Armor — an empty haunted suit of plate: a floating helm above a gap,
// an eerie spirit-glow leaking from the visor and central seam, sword in hand.
function drawAnimatedArmor(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const spirit = "#7dd3fc";
  const hover = A.live ? Math.sin(A.t * 2) : 0;
  const g = ctx.createLinearGradient(0, -6, 0, 16);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  // breastplate
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-9, 10, -5, 15);
  ctx.lineTo(5, 15);
  ctx.quadraticCurveTo(9, 10, 8, -4);
  ctx.quadraticCurveTo(0, -8, -8, -4);
  ctx.closePath();
  ctx.fill();
  // fauld plates + greaves
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-6, 13);
  ctx.lineTo(-4, 20);
  ctx.lineTo(-1, 15);
  ctx.lineTo(1, 20);
  ctx.lineTo(4, 15);
  ctx.lineTo(6, 20);
  ctx.lineTo(6, 13);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-5, 18, 3.5, 5, 1);
  ctx.roundRect(1.5, 18, 3.5, 5, 1);
  ctx.fill();
  // central seam glowing
  ctx.save();
  ctx.strokeStyle = spirit;
  ctx.shadowColor = spirit;
  ctx.shadowBlur = 5 + A.glow * 4;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(A.t * 3);
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, 13);
  ctx.stroke();
  ctx.restore();
  // pauldrons
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(-8, -4, 4, 3.4, 0, 0, PI2);
  ctx.ellipse(8, -4, 4, 3.4, 0, 0, PI2);
  ctx.fill();
  // gauntlet + sword
  ctx.strokeStyle = body;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(7, -2);
  ctx.lineTo(12, 4);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.translate(12, 4);
  ctx.rotate(-0.5);
  ctx.fillStyle = "#8a8f98";
  ctx.fillRect(-1, -16, 2, 16);
  ctx.fillStyle = "#6a6f78";
  ctx.fillRect(-2.5, 0, 5, 1.6);
  ctx.fillStyle = "#5a5f68";
  ctx.fillRect(-0.8, 1.6, 1.6, 3);
  ctx.restore();
  // floating helm (gap to the body, bobbing)
  ctx.save();
  ctx.translate(0, -13 + hover);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, 0, 5, Math.PI * 0.9, Math.PI * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withShade(body, -6);
  ctx.beginPath();
  ctx.roundRect(-4.5, -1, 9, 6, 2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = spirit;
  ctx.shadowColor = spirit;
  ctx.shadowBlur = 5 + A.glow * 5;
  ctx.fillRect(-3.4, 1, 6.8, 1.6);
  ctx.restore();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(-2, -9);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.restore();
  // spirit wisps leaking (liveliness)
  rising(ctx, 0, 6, 6, 16, spirit, A, 3);
}

// Forge Golem — the Deep Forge boss: a hulking fire-blackened colossus with a
// glowing furnace-maw in its chest (flickering fire behind a grate), ember-
// belching shoulder vents, huge fists and angry molten eyes. (Other explored
// directions: a molten warbringer + a volcanic horror — see session mockups.)
function drawForgeGolem(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const hot = "#fff3c4";
  const ember = "#ffb43a";
  // pulsing heat aura
  ctx.save();
  ctx.globalAlpha = 0.14 + 0.07 * A.glow;
  const bl = ctx.createRadialGradient(0, 2, 5, 0, 2, 28);
  bl.addColorStop(0, accent);
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, 2, 28, 0, PI2);
  ctx.fill();
  ctx.restore();
  // thick legs
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-12, 14, 9, 12, 2);
  ctx.roundRect(3, 14, 9, 12, 2);
  ctx.fill();
  // hunched trapezoid torso (broad shoulders)
  const g = ctx.createLinearGradient(0, -14, 0, 16);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-16, -10);
  ctx.lineTo(16, -10);
  ctx.lineTo(13, 16);
  ctx.lineTo(-13, 16);
  ctx.closePath();
  ctx.fill();
  // huge fists hanging forward
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-22, -6, 8, 16, 3);
  ctx.roundRect(14, -6, 8, 16, 3);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-18, 13, 6, 0, PI2);
  ctx.arc(18, 13, 6, 0, PI2);
  ctx.fill();
  // knuckle glow (pulse)
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 4;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(A.t * 3);
  ctx.beginPath();
  ctx.moveTo(-21, 12);
  ctx.lineTo(-15, 12);
  ctx.moveTo(15, 12);
  ctx.lineTo(21, 12);
  ctx.stroke();
  ctx.restore();
  // FURNACE MAW — dark arched opening in the chest
  ctx.fillStyle = "#1a0e06";
  ctx.beginPath();
  ctx.moveTo(-8, 10);
  ctx.lineTo(-8, -2);
  ctx.quadraticCurveTo(0, -8, 8, -2);
  ctx.lineTo(8, 10);
  ctx.closePath();
  ctx.fill();
  // fire inside, clipped to the opening: base glow + flickering flame-tongues
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-6.5, 9);
  ctx.lineTo(-6.5, -1);
  ctx.quadraticCurveTo(0, -6, 6.5, -1);
  ctx.lineTo(6.5, 9);
  ctx.closePath();
  ctx.clip();
  const fg = ctx.createLinearGradient(0, 10, 0, -5);
  fg.addColorStop(0, hot);
  fg.addColorStop(0.5, accent);
  fg.addColorStop(1, "#7c1d00");
  ctx.fillStyle = fg;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillRect(-7, -6, 14, 16);
  if (A.live) {
    ctx.shadowBlur = 6;
    ctx.fillStyle = hot;
    for (let k = 0; k < 3; k++) {
      const fx = -3.5 + k * 3.5;
      const h = 6 + Math.abs(Math.sin(A.t * 6 + k * 1.7)) * 5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx - 1.6, 9);
      ctx.quadraticCurveTo(fx, 9 - h, fx + 1.6, 9);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  // grate bars over the furnace
  ctx.strokeStyle = "#1a0e06";
  ctx.lineWidth = 1.2;
  for (const gx of [-3, 0, 3]) {
    ctx.beginPath();
    ctx.moveTo(gx, 9);
    ctx.lineTo(gx, -3);
    ctx.stroke();
  }
  // ember-belching shoulder vents (glow pulse)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-14, -13, 7, 4, 1);
  ctx.roundRect(7, -13, 7, 4, 1);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 4;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(A.t * 4 + 1);
  ctx.fillRect(-13, -12, 5, 1.5);
  ctx.fillRect(8, -12, 5, 1.5);
  ctx.restore();
  // small sunken angry head between the shoulders
  ctx.fillStyle = withShade(body, 10);
  ctx.beginPath();
  ctx.moveTo(-5, -9);
  ctx.lineTo(5, -9);
  ctx.lineTo(4, -16);
  ctx.lineTo(-4, -16);
  ctx.closePath();
  ctx.fill();
  // angry angled glowing eyes (pulse)
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 5;
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.lineTo(-1, -12);
  ctx.lineTo(-1.5, -10.5);
  ctx.lineTo(-4, -11.5);
  ctx.closePath();
  ctx.moveTo(4, -13);
  ctx.lineTo(1, -12);
  ctx.lineTo(1.5, -10.5);
  ctx.lineTo(4, -11.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // rising embers from the furnace + vents (liveliness)
  rising(ctx, 0, 6, -2, 22, ember, A, 4);
  rising(ctx, -10, 3, -13, 16, ember, A, 2);
  rising(ctx, 10, 3, -13, 16, ember, A, 2);
}

// Ancient Automaton — the rare Deep Forge catalyst: a relic whose sculpted,
// angular bronze armour-plates float apart, held together only by a glowing
// energy spine, with a pulsing core gem (the ethereal catalyst signature). The
// spine stops at the waist, so nothing glows below the pelvis.
// (Other explored directions: orbital sentinel, warded colossus, clockwork relic.)
function drawAncientAutomaton(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const gold = accent;
  const goldB = "#fffbe6";
  const core = "#ffd86b";
  const hover = A.live ? Math.sin(A.t * 1.3) * 1.4 : 0;
  const s = A.live ? 1 + Math.sin(A.t * 2) : 1; // segments drift apart / together
  ctx.save();
  ctx.translate(0, hover);
  // glowing energy spine holding the plates together — ends at the waist so no
  // light bar shows below the pelvis
  ctx.save();
  ctx.strokeStyle = core;
  ctx.shadowColor = core;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(A.t * 4));
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(0, 12);
  ctx.stroke();
  ctx.restore();
  // energy sparks drifting up the spine (liveliness)
  if (A.live) {
    ctx.save();
    ctx.fillStyle = goldB;
    ctx.shadowColor = core;
    ctx.shadowBlur = 4;
    for (let i = 0; i < 3; i++) {
      const life = (A.t * 0.6 + i * 0.6) % 1;
      ctx.globalAlpha = (1 - life) * 0.7;
      ctx.beginPath();
      ctx.arc(0, 12 - life * 26, 1, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, -16, 0, 24);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  // sculpted angular plates (float apart with s)
  poly(ctx, [[-5, -11 - s], [5, -11 - s], [4, -18 - s], [-4, -18 - s]]); // helm
  ctx.fill();
  poly(ctx, [[-11, -8 - s * 0.3], [11, -8 - s * 0.3], [8, 2 - s * 0.3], [-8, 2 - s * 0.3]]); // breastplate
  ctx.fill();
  poly(ctx, [[-8, 5 + s * 0.3], [8, 5 + s * 0.3], [6, 11 + s * 0.3], [0, 13 + s * 0.3], [-6, 11 + s * 0.3]]); // chevron waist
  ctx.fill();
  poly(ctx, [[-8, 15 + s], [-2, 15 + s], [-3, 24 + s], [-8, 24 + s]]); // greaves
  ctx.fill();
  poly(ctx, [[8, 15 + s], [2, 15 + s], [3, 24 + s], [8, 24 + s]]);
  ctx.fill();
  poly(ctx, [[-16 - s * 0.6, -6], [-10 - s * 0.6, -8], [-9 - s * 0.6, -1], [-15 - s * 0.6, 1]]); // pauldrons
  ctx.fill();
  poly(ctx, [[16 + s * 0.6, -6], [10 + s * 0.6, -8], [9 + s * 0.6, -1], [15 + s * 0.6, 1]]);
  ctx.fill();
  // gold filigree on the breastplate
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-9, -3 - s * 0.3);
  ctx.lineTo(9, -3 - s * 0.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // core gem set at the chest (pulse)
  const cp = 0.85 + 0.25 * A.glow;
  ctx.save();
  ctx.fillStyle = core;
  ctx.shadowColor = core;
  ctx.shadowBlur = 8 + A.glow * 6;
  poly(ctx, [[0, -6 - s * 0.3], [3 * cp, -3 - s * 0.3], [0, -s * 0.3], [-3 * cp, -3 - s * 0.3]]);
  ctx.fill();
  ctx.fillStyle = goldB;
  ctx.beginPath();
  ctx.arc(0, -3 - s * 0.3, 1.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // glowing eyes in the helm
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4 + A.glow * 3;
  poly(ctx, [[-3, -14 - s], [-1, -13.5 - s], [-1.5, -12.5 - s], [-3, -13 - s]]);
  ctx.fill();
  poly(ctx, [[3, -14 - s], [1, -13.5 - s], [1.5, -12.5 - s], [3, -13 - s]]);
  ctx.fill();
  ctx.restore();
  ctx.restore(); // hover
}

// ---------------------------------------------------------------------------
// The Fallen Cathedral tier (see data/dungeons) — bespoke sprites. The two
// angels (the Penitent catalyst, Seraphiel the boss) compose the Seraph's
// angelWing in its "ashen" tone over the robed healer body: burned mirrors of
// the legendary the dungeon awards.
// ---------------------------------------------------------------------------

function drawHereticZealot(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // frayed robe with a jagged hem (acolyte family, but torn and stained)
  const rg = ctx.createLinearGradient(0, -12, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.6, body);
  rg.addColorStop(1, dark);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(10, 20);
  const hem: [number, number][] = [[6, 16], [3, 20], [0, 16], [-3, 20], [-6, 16], [-9, 20], [-10, 20]];
  for (const [hx, hy] of hem) ctx.lineTo(hx, hy);
  ctx.closePath();
  ctx.fill();
  // rope belt, ends swinging
  ctx.strokeStyle = "#a08a5a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, 6);
  ctx.quadraticCurveTo(0, 8, 7, 6);
  ctx.moveTo(3, 7);
  const sway = A.live ? Math.sin(A.t * 2.4) * 1.5 : 0;
  ctx.quadraticCurveTo(4 + sway, 12, 3 + sway, 16);
  ctx.stroke();
  // deep hood — a void with two candle-gold glints
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.quadraticCurveTo(-8, -16, 0, -17);
  ctx.quadraticCurveTo(8, -16, 6, -6);
  ctx.quadraticCurveTo(0, -9, -6, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0c0810";
  ctx.beginPath();
  ctx.ellipse(1, -11, 4.4, 5, 0, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4 + A.glow * 3;
  ctx.beginPath(); ctx.arc(-0.5, -11.5, 0.9, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -11, 0.9, 0, PI2); ctx.fill();
  ctx.restore();
  // arm thrust forward brandishing a curved knife
  ctx.strokeStyle = body;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const jab = A.live ? Math.max(0, Math.sin(A.t * 5)) * 2 : 0;
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.quadraticCurveTo(10, -4, 14 + jab, -6);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#cfc8bd";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(14 + jab, -7);
  ctx.quadraticCurveTo(18 + jab, -10, 19 + jab, -14);
  ctx.stroke();
  // heretic sun-mark daubed on the chest — a circle struck through
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(-1, 0, 3.4, 0, PI2);
  ctx.moveTo(-5, 4);
  ctx.lineTo(3, -4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Falling particles (stone dust shed downward). Motion only. */
function falling(
  ctx: Ctx,
  cx: number,
  spread: number,
  baseY: number,
  fallH: number,
  color: string,
  A: SpriteAnim,
  n = 4
): void {
  if (!A.live) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const seed = i * 1.7;
    const life = (A.t * 0.55 + seed) % 1;
    const x = cx + Math.sin(seed * 5 + A.t) * spread + (i - n / 2);
    const y = baseY + life * fallH;
    ctx.globalAlpha = (1 - life) * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, 1.1 * (1 - life) + 0.3, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

/** Imp-style bat wings behind the torso (drawImp's construction, scaled). */
function gargoyleWings(
  ctx: Ctx,
  dark: string,
  A: SpriteAnim,
  span: number,
  flapSpeed: number,
  flapAmp: number
): void {
  const flap = A.live ? Math.sin(A.t * flapSpeed) * flapAmp : 0;
  ctx.fillStyle = dark;
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(s * 4, -3);
    ctx.quadraticCurveTo(s * span * 0.85, -13 - flap, s * span, -1 - flap);
    ctx.quadraticCurveTo(s * span * 0.72, -2, s * span * 0.8, 5 - flap);
    ctx.quadraticCurveTo(s * span * 0.55, 3, s * 4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withShade(dark, -14);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(s * 5, 0);
    ctx.lineTo(s * span * 0.75, -6 - flap);
    ctx.stroke();
  }
}

/** Snarling granite head: horns, pricked ears, fangs, glowing eyes. */
function gargoyleHead(
  ctx: Ctx,
  body: string,
  light: string,
  dark: string,
  A: SpriteAnim,
  hx: number,
  hy: number,
  eyeCol: string,
  swept: boolean
): void {
  const g = ctx.createLinearGradient(hx, hy - 5, hx, hy + 5);
  g.addColorStop(0, light);
  g.addColorStop(1, withShade(body, -20));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark;
  if (swept) {
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.translate(hx + s * 3, hy - 3.5);
      ctx.beginPath();
      ctx.moveTo(-1.4 * s, 0);
      ctx.quadraticCurveTo(s * 1, -6, s * 5, -7.5);
      ctx.quadraticCurveTo(s * 1.5, -4.2, 1.4 * s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    for (const [ox, oa] of [[-2.5, -0.5], [2.5, 0.5]] as const) {
      ctx.save();
      ctx.translate(hx + ox, hy - 4);
      ctx.rotate(oa);
      ctx.beginPath();
      ctx.moveTo(-1.5, 0);
      ctx.lineTo(0, -5.5);
      ctx.lineTo(1.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // pricked ears
  ctx.fillStyle = withShade(body, -10);
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(hx + s * 4.4, hy - 1);
    ctx.lineTo(hx + s * 7, hy - 3);
    ctx.lineTo(hx + s * 4.2, hy + 1.2);
    ctx.closePath();
    ctx.fill();
  }
  // snarl + fangs
  ctx.strokeStyle = withShade(body, -30);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 2, hy + 3);
  ctx.quadraticCurveTo(hx, hy + 3.8, hx + 2, hy + 3);
  ctx.stroke();
  ctx.fillStyle = "#e9e4d4";
  ctx.beginPath();
  ctx.moveTo(hx - 2, hy + 3.2);
  ctx.lineTo(hx - 1.4, hy + 4.8);
  ctx.lineTo(hx - 0.8, hy + 3.3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 0.8, hy + 3.3);
  ctx.lineTo(hx + 1.4, hy + 4.8);
  ctx.lineTo(hx + 2, hy + 3.2);
  ctx.closePath();
  ctx.fill();
  // glowing eyes
  ctx.save();
  ctx.fillStyle = eyeCol;
  ctx.shadowColor = eyeCol;
  ctx.shadowBlur = 4 + A.glow * 5;
  ctx.beginPath(); ctx.arc(hx - 1.8, hy - 0.6, 1.1, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 1.8, hy - 0.6, 1.1, 0, PI2); ctx.fill();
  ctx.restore();
}

/** Airborne gargoyle, hovering on imp-style wingbeats. Two bodies by uid
 *  parity: 0 = stocky Stone Imp, 1 = broad slab-chested Ravager. */
function drawGargoyle(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  A: SpriteAnim,
  variant: 0 | 1
) {
  ctx.lineCap = "round";
  if (variant === 0) {
    // --- Stone Imp: compact granite flier, quick wingbeats -----------------
    const bob = A.live ? Math.sin(A.t * 1.9) * 2 : 0;
    ctx.save();
    ctx.translate(0, -7 + bob);
    gargoyleWings(ctx, dark, A, 21, 6, 3.5);
    // barbed tail sway
    const tw = A.live ? Math.sin(A.t * 3) * 3 : 0;
    ctx.strokeStyle = body;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-2, 9);
    ctx.quadraticCurveTo(-8, 14, -7 + tw, 19);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-7 + tw, 19);
    ctx.lineTo(-9.4 + tw, 22.5);
    ctx.lineTo(-4.6 + tw, 22.5);
    ctx.closePath();
    ctx.fill();
    // stocky granite body
    const g = ctx.createLinearGradient(0, -5, 0, 12);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 4, 7.5, 7.5, 0, 0, PI2);
    ctx.fill();
    // chest cracks
    ctx.strokeStyle = withShade(body, -34);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(-1, 4); ctx.lineTo(-3, 7);
    ctx.moveTo(3, 1); ctx.lineTo(4, 5);
    ctx.stroke();
    // dangling clawed legs, drifting with the hover
    const drift = A.live ? Math.sin(A.t * 1.9 + 1) * 1 : 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-3, 10); ctx.quadraticCurveTo(-4, 13, -3.4 + drift, 16);
    ctx.moveTo(3, 10); ctx.quadraticCurveTo(4, 13, 4.4 + drift, 16);
    ctx.stroke();
    ctx.strokeStyle = withShade(body, 18);
    ctx.lineWidth = 1;
    for (const fx of [-3.4 + drift, 4.4 + drift]) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(fx, 16);
        ctx.lineTo(fx + i * 1.5, 18.6);
        ctx.stroke();
      }
    }
    gargoyleHead(ctx, body, light, dark, A, 0, -7, "#cdd2d8", false);
    ctx.restore();
    // stone dust shaken loose by the wingbeats (accent = pale stone grey)
    falling(ctx, 0, 7, 10, 12, accent, A, 4);
  } else {
    // --- Ravager: broad slab chest, slow heavy beats that lift the body ----
    const lift = A.live ? Math.sin(A.t * 4.2) * 1.6 : 0;
    const bob = A.live ? Math.sin(A.t * 1.4) * 1.4 : 0;
    ctx.save();
    ctx.translate(0, -6 + bob + lift * 0.5);
    gargoyleWings(ctx, dark, A, 24, 4.2, 5);
    const tw = A.live ? Math.sin(A.t * 2.4) * 3 : 0;
    ctx.strokeStyle = body;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(2, 9);
    ctx.quadraticCurveTo(9, 14, 8 + tw, 20);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(8 + tw, 20);
    ctx.lineTo(5.8 + tw, 23.2);
    ctx.lineTo(10.2 + tw, 23.2);
    ctx.closePath();
    ctx.fill();
    // broad slab chest
    const g = ctx.createLinearGradient(0, -6, 0, 12);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 4, 9.2, 8, 0, 0, PI2);
    ctx.fill();
    // pectoral seams
    ctx.strokeStyle = withShade(body, -28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(0, 6);
    ctx.moveTo(-6, 1); ctx.quadraticCurveTo(-3, 3, -0.6, 1.6);
    ctx.moveTo(6, 1); ctx.quadraticCurveTo(3, 3, 0.6, 1.6);
    ctx.stroke();
    // heavy talon legs, spread
    const drift = A.live ? Math.sin(A.t * 1.4 + 1) * 0.8 : 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-4.4, 10); ctx.quadraticCurveTo(-6, 13, -5.6 + drift, 16.4);
    ctx.moveTo(4.4, 10); ctx.quadraticCurveTo(6, 13, 6.6 + drift, 16.4);
    ctx.stroke();
    ctx.strokeStyle = withShade(body, 18);
    ctx.lineWidth = 1.2;
    for (const fx of [-5.6 + drift, 6.6 + drift]) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(fx, 16.4);
        ctx.lineTo(fx + i * 1.8, 19.4);
        ctx.stroke();
      }
    }
    gargoyleHead(ctx, body, light, dark, A, 0, -8, "#9db8ff", true);
    // second inner horn pair
    ctx.fillStyle = dark;
    for (const [ox, oa] of [[-1.2, -0.3], [1.2, 0.3]] as const) {
      ctx.save();
      ctx.translate(ox, -12.4);
      ctx.rotate(oa);
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(0, -3.4);
      ctx.lineTo(1, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // orbiting shed stone chips
    if (A.live) {
      ctx.save();
      ctx.fillStyle = withShade(body, 24);
      for (let i = 0; i < 3; i++) {
        const a = A.t * 1.0 + i * (PI2 / 3);
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(a);
        ctx.save();
        ctx.translate(Math.cos(a) * 17, -2 + Math.sin(a) * 5);
        ctx.rotate(a * 2);
        ctx.beginPath();
        ctx.moveTo(-1.4, 1);
        ctx.lineTo(0, -1.6);
        ctx.lineTo(1.4, 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }
  ctx.lineCap = "butt";
}

function drawGraveChorister(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const hover = A.live ? Math.sin(A.t * 1.6) * 1.8 : 0;
  ctx.save();
  ctx.translate(0, hover);
  // wailing rings rippling out from the open mouth (its "song")
  if (A.live) {
    ctx.save();
    ctx.strokeStyle = accent;
    for (let i = 0; i < 3; i++) {
      const p = (A.t * 0.7 + i / 3) % 1;
      ctx.globalAlpha = (1 - p) * 0.4;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(2, -8, 4 + p * 14, -0.7, 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }
  // spectral glow
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.12 * A.glow;
  const bl = ctx.createRadialGradient(0, -2, 2, 0, -2, 20);
  bl.addColorStop(0, withAlpha(accent, 0.7));
  bl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bl;
  ctx.beginPath();
  ctx.arc(0, -2, 20, 0, PI2);
  ctx.fill();
  ctx.restore();
  // burial-shroud body tapering to tattered wisps (no legs — it drifts)
  const rg = ctx.createLinearGradient(0, -16, 0, 20);
  rg.addColorStop(0, light);
  rg.addColorStop(0.55, body);
  rg.addColorStop(1, withAlpha(dark, 0.15));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.quadraticCurveTo(-9, 8, -5, 19);
  ctx.lineTo(-2, 13);
  ctx.lineTo(0, 20);
  ctx.lineTo(2, 13);
  ctx.lineTo(5, 19);
  ctx.quadraticCurveTo(9, 8, 6, -8);
  ctx.quadraticCurveTo(0, -13, -6, -8);
  ctx.closePath();
  ctx.fill();
  // shroud hood cinched at the crown
  ctx.fillStyle = withShade(body, -18);
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.quadraticCurveTo(-7, -16, 0, -17);
  ctx.quadraticCurveTo(7, -16, 6, -8);
  ctx.quadraticCurveTo(0, -11, -6, -8);
  ctx.closePath();
  ctx.fill();
  // the singing face: hollow eyes and a long open mouth
  ctx.fillStyle = "#10131d";
  ctx.beginPath(); ctx.ellipse(-1.5, -11, 1.3, 1.8, 0, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, -10.6, 1.3, 1.8, 0, 0, PI2); ctx.fill();
  const oo = A.live ? 1 + Math.sin(A.t * 3.2) * 0.5 : 1; // mouth swells with the wail
  ctx.beginPath(); ctx.ellipse(1, -6, 1.7, 2.6 * oo, 0, 0, PI2); ctx.fill();
  // faint candle it still carries
  ctx.fillStyle = "#d8cfb8";
  ctx.fillRect(-8.5, -2, 3, 5);
  ctx.save();
  ctx.fillStyle = "#ffd76a";
  ctx.shadowColor = "#ffd76a";
  ctx.shadowBlur = 5;
  ctx.globalAlpha = 0.75 + 0.25 * A.glow;
  ctx.beginPath();
  ctx.ellipse(-7, -4.5, 1.1, 2, 0, 0, PI2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawPenitent(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // drooped, ash-charred wings — held low in mourning, barely beating
  const beat = (A.live ? Math.sin(A.t * 1.2) * 0.05 : 0) - 0.08;
  angelWing(ctx, -1, beat, 1.1, A.glow, "ashen");
  angelWing(ctx, 1, beat, 1.1, A.glow, "ashen");
  // dim halo, guttering like a low candle
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 5;
  ctx.globalAlpha = 0.35 + 0.25 * A.glow;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, -21, 7, 2.4, 0, 0, PI2);
  ctx.stroke();
  ctx.restore();
  drawHealer(ctx, body, dark, light, accent, A);
}

function drawFallenSeraph(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  // full charred wingspan — it still flies, but nothing about it is white now
  const beat = (A.live ? Math.sin(A.t * 2.0) * 0.12 : 0) + 0.28;
  angelWing(ctx, -1, beat, 1.28, A.glow, "ashen");
  angelWing(ctx, 1, beat, 1.28, A.glow, "ashen");
  // ember motes shed from the wing roots
  if (A.live) {
    ctx.save();
    ctx.fillStyle = "#e8843c";
    ctx.shadowColor = "#e8843c";
    ctx.shadowBlur = 4;
    for (let i = 0; i < 4; i++) {
      const p = (A.t * 0.5 + i / 4) % 1;
      ctx.globalAlpha = (1 - p) * 0.6;
      const s = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(s * (8 + p * 6), -4 + p * 22, 1, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // the broken halo — tilted, hanging on by habit
  ctx.save();
  ctx.translate(1.5, -21);
  ctx.rotate(0.5);
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.6 + 0.3 * A.glow;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 2.6, 0, 0.5, PI2 - 0.35); // a bite missing from the ring
  ctx.stroke();
  ctx.restore();
  drawHealer(ctx, body, dark, light, accent, A);
}

// ---------------------------------------------------------------------------
// The Rogue's Den tier (see data/dungeons) — all bespoke sprites (2026-07-13
// glow-up via /mockup; losing variants archived in docs/rogue-sprites-mockups.md).
// The Silencer reuses the Outlaw's phasing draw — the guild taught it everything.
// ---------------------------------------------------------------------------

/** A small throwing knife at (x,y): steel tip + wooden grip. */
function heldKnife(ctx: Ctx, x: number, y: number, rot: number, alpha = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#dde3e9";
  ctx.beginPath();
  ctx.moveTo(0, -4.5);
  ctx.lineTo(1.4, 0);
  ctx.lineTo(-1.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5a4632";
  ctx.fillRect(-1.1, 0, 2.2, 3);
  ctx.restore();
}

/** Knife Thrower — caught mid-throw: lead arm in full follow-through with a
 *  spinning knife streaking away, while the off-hand draws the next blade from
 *  the bandolier. Red bandit mask, normal eyes (per the approved mockup). */
function drawKnifeThrower(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  ctx.lineCap = "round";
  // lunge legs: back extended, front bent
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-2, 8); ctx.lineTo(-9, 14); ctx.lineTo(-11, 21);
  ctx.moveTo(3, 8); ctx.lineTo(8, 13); ctx.lineTo(8, 21);
  ctx.stroke();
  const cyc = A.live ? (A.t % 1.2) / 1.2 : 0.8; // static pose = next knife drawn
  ctx.save();
  ctx.rotate(-0.14); // torso pitched into the throw
  // oiled-leather jerkin
  const g = ctx.createLinearGradient(0, -10, 0, 12);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.quadraticCurveTo(-9, 4, -5, 10);
  ctx.lineTo(5, 10);
  ctx.quadraticCurveTo(9, 4, 7, -7);
  ctx.quadraticCurveTo(0, -10, -7, -7);
  ctx.closePath();
  ctx.fill();
  // chest bandolier + spare knives
  ctx.strokeStyle = withShade(body, -30);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-6, -5);
  ctx.lineTo(6, 7);
  ctx.stroke();
  ctx.strokeStyle = "#cfd6dd";
  ctx.lineWidth = 1.2;
  for (const f of [0.3, 0.6]) {
    const kx = -6 + 12 * f;
    const ky = -5 + 12 * f;
    ctx.beginPath();
    ctx.moveTo(kx + 1.6, ky - 1.6);
    ctx.lineTo(kx - 1.6, ky + 1.6);
    ctx.stroke();
  }
  // off-hand drawing the NEXT knife from the bandolier (slides on the cycle)
  const draw2 = cyc < 0.35 ? cyc / 0.35 : 1;
  ctx.strokeStyle = body;
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  ctx.moveTo(-4, -3);
  ctx.quadraticCurveTo(-4, 1, -1, 2.4);
  ctx.stroke();
  heldKnife(ctx, 0, 1 - draw2 * 3, -0.9, 0.95);
  // lead arm fully extended, follow-through, open hand
  ctx.beginPath();
  ctx.moveTo(4, -4);
  ctx.quadraticCurveTo(10, -7, 14.5, -7.5);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(14.5, -7.5); ctx.lineTo(16.6, -9);
  ctx.moveTo(14.5, -7.5); ctx.lineTo(17, -7.4);
  ctx.stroke();
  // bare head: normal eyes + the red bandit mask (matches the Bandit King's)
  const hx = 1, hy = -12.5;
  ctx.fillStyle = "#c99b6a";
  ctx.beginPath();
  ctx.arc(hx, hy, 4.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = dark; // dark cropped hair
  ctx.beginPath();
  ctx.arc(hx, hy - 1, 4.6, Math.PI, PI2);
  ctx.fill();
  ctx.fillStyle = "#14181d"; // normal eyes
  ctx.beginPath(); ctx.arc(hx - 1.7, hy - 0.6, 0.75, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 1.9, hy - 0.6, 0.75, 0, PI2); ctx.fill();
  // red mask over the lower face
  ctx.fillStyle = "#c22f2f";
  ctx.beginPath();
  ctx.moveTo(hx - 4.8, hy + 0.6);
  ctx.lineTo(hx + 4.8, hy + 0.6);
  ctx.lineTo(hx + 3.5, hy + 3.8);
  ctx.lineTo(hx, hy + 6.2);
  ctx.lineTo(hx - 3.5, hy + 3.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8f1f1f";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(hx - 3.6, hy + 2.2);
  ctx.quadraticCurveTo(hx, hy + 3.2, hx + 3.6, hy + 2.2);
  ctx.stroke();
  // fluttering knot tails
  const fl = A.live ? Math.sin(A.t * 4) * 1.4 : 0;
  ctx.strokeStyle = "#c22f2f";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hx - 4.5, hy + 1.2);
  ctx.quadraticCurveTo(hx - 8, hy + fl, hx - 11, hy + 1.5 + fl * 1.3);
  ctx.moveTo(hx - 4.5, hy + 2);
  ctx.quadraticCurveTo(hx - 7.5, hy + 3 + fl * 0.5, hx - 9.8, hy + 4.5 + fl);
  ctx.stroke();
  ctx.restore();
  // the thrown knife streaks away, spinning, with a venom glint trail
  if (A.live && cyc < 0.6) {
    const p = cyc / 0.6;
    const x = 16 + p * 22;
    const y = -12 + p * 3;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = withAlpha(accent, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 1);
    ctx.lineTo(x - 2, y);
    ctx.stroke();
    heldKnife(ctx, x, y, Math.PI / 2 + p * 11, 1 - p);
    ctx.restore();
  }
  ctx.lineCap = "butt";
}

/** A spinning gold coin at (x,y): `spin` is the flip phase. */
function spinCoin(ctx: Ctx, x: number, y: number, r: number, spin: number, gold: string): void {
  const sq = Math.abs(Math.cos(spin));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(0.3, r * sq), r, 0, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(0.25, r * sq * 0.65), r * 0.65, 0, 0, PI2);
  ctx.stroke();
  ctx.restore();
}

/** A crude prison shiv at (x,y). */
function shiv(ctx: Ctx, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#2a1d12";
  ctx.fillRect(-1.2, 0, 2.4, 4.5);
  ctx.fillStyle = "#cfd3da";
  ctx.beginPath();
  ctx.moveTo(-1.6, 0);
  ctx.lineTo(1.6, 0);
  ctx.lineTo(0.3, -8);
  ctx.lineTo(-0.3, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-0.8, -1);
  ctx.lineTo(0, -7);
  ctx.stroke();
  ctx.restore();
}

/** Cutpurse — mid-getaway: masked face, streaming scarf, loot sack hugged
 *  under one arm and a trail of spilled coins arcing away behind. Deliberately
 *  NOT the Outlaw's hooded-duelist silhouette (no deep hood, no twin daggers). */
function drawCutpurse(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  ctx.lineCap = "round";
  // spilling coin trail arcing away behind — it's mid-getaway
  if (A.live) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const life = (A.t * 0.8 + i * 0.37) % 1;
      const x = -8 - life * 14;
      const y = 6 + Math.pow(life, 1.8) * 14 - Math.sin(life * Math.PI) * 5;
      ctx.globalAlpha = (1 - life) * 0.85;
      spinCoin(ctx, x, y, 1.3, A.t * 10 + i * 2, accent);
    }
    ctx.restore();
  }
  ctx.save();
  ctx.rotate(-0.13); // leaning into the sprint
  const sway = A.live ? Math.sin(A.t * 2) * 1.4 : 0;
  // short ragged capelet (hip length — not the Outlaw's floor-length cape)
  ctx.fillStyle = withShade(body, -26);
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(5, -8);
  ctx.quadraticCurveTo(9 + sway, 0, 7 + sway, 10);
  ctx.lineTo(3, 7);
  ctx.lineTo(0, 11);
  ctx.lineTo(-3, 7);
  ctx.lineTo(-7 - sway, 10);
  ctx.quadraticCurveTo(-9 - sway, 0, -5, -8);
  ctx.closePath();
  ctx.fill();
  // slim jerkin
  const bg = ctx.createLinearGradient(-7, 0, 7, 0);
  bg.addColorStop(0, dark);
  bg.addColorStop(0.5, body);
  bg.addColorStop(1, withShade(body, -14));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-6.5, -4, 13, 21, 5);
  ctx.fill();
  // belt + BULGING coin purse, the identity prop
  ctx.fillStyle = "#20161a";
  ctx.fillRect(-6.5, 9, 13, 3);
  ctx.fillStyle = "#4a3a28";
  ctx.beginPath();
  ctx.ellipse(5, 13, 3, 3.6, 0.25, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#2c2118";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(3.4, 10.4);
  ctx.quadraticCurveTo(5, 9.4, 6.6, 10.4);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath();
  ctx.arc(5, 11, 1, 0, PI2);
  ctx.fill();
  ctx.restore();
  // streaming scarf behind
  ctx.save();
  ctx.strokeStyle = "#c94f3d";
  ctx.lineWidth = 2;
  const w1 = A.live ? Math.sin(A.t * 5) * 2.2 : 0;
  const w2 = A.live ? Math.sin(A.t * 5 + 1.3) * 3 : 1.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.quadraticCurveTo(-9, -9 + w1, -15, -7 + w2);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(-3, -8);
  ctx.quadraticCurveTo(-8, -6 + w2 * 0.6, -13, -4 + w1);
  ctx.stroke();
  ctx.restore();
  // bare head: burglar mask + messy hair + gold-glint eyes
  ctx.fillStyle = "#c99b6a";
  ctx.beginPath();
  ctx.arc(0, -10, 5, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#1c1a22";
  ctx.fillRect(-5.2, -12, 10.4, 2.8); // burglar band across the eyes
  ctx.fillStyle = "#3a2c22"; // messy hair
  ctx.beginPath();
  ctx.moveTo(-5, -12);
  ctx.quadraticCurveTo(0, -17.5, 5, -12);
  ctx.quadraticCurveTo(3, -14.5, 1, -13.4);
  ctx.quadraticCurveTo(-1, -15, -3, -13.2);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3 + A.glow * 3;
  ctx.beginPath(); ctx.arc(-1.8, -10.7, 0.85, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(1.8, -10.7, 0.85, 0, PI2); ctx.fill();
  ctx.restore();
  // loot sack hugged under the left arm, coins glinting out the top
  ctx.fillStyle = "#4a3a28";
  ctx.beginPath();
  ctx.ellipse(-7.5, 3, 4.4, 5, 0.25, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#2c2118";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10.4, -0.5);
  ctx.quadraticCurveTo(-7.5, -2.4, -4.8, -0.8);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3;
  for (const [gx, gy] of [[-8.6, -1.3], [-6.6, -1.8]] as const) {
    ctx.beginPath();
    ctx.arc(gx, gy, 0.9, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
  // right hand: shiv out front
  ctx.strokeStyle = body;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(5, -2);
  ctx.quadraticCurveTo(9, -3, 11, -4);
  ctx.stroke();
  shiv(ctx, 11.5, -4.5, 1.2);
  ctx.restore();
  ctx.lineCap = "butt";
}

/** Den Bruiser — a human pit-grappler (no more shrunken-ogre recolor): hunched
 *  wide stance, huge open hands flexing, glowing brass pit-brand, stomp rings. */
function drawDenBruiser(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  const heave = A.live ? Math.sin(A.t * 2.0) * 0.7 : 0;
  ctx.lineCap = "round";
  ctx.save();
  ctx.translate(0, 1.6); // hunched lower
  // dust at the feet
  if (A.live) {
    ctx.save();
    ctx.fillStyle = "#a8a29e";
    for (let i = 0; i < 2; i++) {
      const life = (A.t * 0.35 + i * 1.3) % 1;
      ctx.globalAlpha = (1 - life) * 0.2;
      ctx.beginPath();
      ctx.arc(-10 + i * 20 + Math.sin(A.t + i) * 2, 22 - life * 4, 1.5 + life * 2.5, 0, PI2);
      ctx.fill();
    }
    ctx.restore();
  }
  // legs planted wide
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(-5, 8); ctx.lineTo(-8, 15); ctx.lineTo(-7, 22);
  ctx.moveTo(5, 8); ctx.lineTo(8, 15); ctx.lineTo(9, 22);
  ctx.stroke();
  // barrel torso in a hide vest
  const g = ctx.createLinearGradient(0, -11 - heave, 0, 11);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-11, -7 - heave);
  ctx.quadraticCurveTo(-13, 3, -8, 10);
  ctx.lineTo(8, 10);
  ctx.quadraticCurveTo(13, 3, 11, -7 - heave);
  ctx.quadraticCurveTo(0, -12 - heave, -11, -7 - heave);
  ctx.closePath();
  ctx.fill();
  // bare chest V between the vest halves
  ctx.fillStyle = "#b98a5e";
  ctx.beginPath();
  ctx.moveTo(-4.5, -8 - heave);
  ctx.lineTo(4.5, -8 - heave);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  // glowing brass pit-brand on the chest
  const p = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(A.t * 2.2));
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 4;
  ctx.globalAlpha = A.live ? p : 0.6;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, -3 - heave, 2.2, 0, PI2);
  ctx.moveTo(-1.4, -1.6 - heave);
  ctx.lineTo(1.4, -4.4 - heave);
  ctx.stroke();
  ctx.restore();
  // vest stitching
  ctx.strokeStyle = withShade(body, -30);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -6 - heave); ctx.lineTo(-6, 8);
  ctx.moveTo(6, -6 - heave); ctx.lineTo(6, 8);
  ctx.stroke();
  // tooth necklace bouncing with the heave
  ctx.strokeStyle = "#3a2c22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5, -8 - heave);
  ctx.quadraticCurveTo(0, -4 - heave, 5, -8 - heave);
  ctx.stroke();
  ctx.fillStyle = "#e9e4d4";
  for (const tx of [-3, -1, 1, 3]) {
    const ty = -6.4 - heave + Math.abs(tx) * -0.35 + 1.2;
    ctx.beginPath();
    ctx.moveTo(tx - 0.8, ty);
    ctx.lineTo(tx, ty + 2.4);
    ctx.lineTo(tx + 0.8, ty);
    ctx.closePath();
    ctx.fill();
  }
  // belt
  ctx.fillStyle = "#2c2118";
  ctx.fillRect(-9, 8.5, 18, 3);
  ctx.fillStyle = accent;
  ctx.fillRect(-1.5, 8.7, 3, 2.6);
  // both huge open hands forward, fingers flexing
  const flex = 0.5 + 0.5 * Math.sin(A.t * 2.8);
  ctx.strokeStyle = "#b98a5e";
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(9, -4 - heave); ctx.quadraticCurveTo(15, -4, 17, -1);
  ctx.moveTo(-9, -4 - heave); ctx.quadraticCurveTo(-13, -2, -14, 2);
  ctx.stroke();
  for (const [px, py, s] of [[17.5, 0, 1], [-14.5, 3, -1]] as const) {
    ctx.fillStyle = "#b98a5e";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "#b98a5e";
    ctx.lineWidth = 1.7;
    for (let f = 0; f < 3; f++) {
      const fa = s * (0.5 - f * 0.5) - (s > 0 ? 0 : Math.PI);
      const flen = 3.4 + flex * 1.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(fa) * flen, py + Math.sin(fa) * flen - flex * 1.2);
      ctx.stroke();
    }
  }
  // bald scarred head, heavy jaw
  const hy = -15 - heave;
  ctx.fillStyle = "#b98a5e";
  ctx.beginPath();
  ctx.arc(0, hy, 5.6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#a5764b";
  ctx.beginPath();
  ctx.arc(0, hy, 5.6, 0.2 * Math.PI, 0.8 * Math.PI); // jaw shade
  ctx.fill();
  // heavy brow + mean little eyes
  ctx.fillStyle = "#8a5f3e";
  ctx.fillRect(-4.6, hy - 2.8, 9.2, 1.6);
  ctx.fillStyle = "#14181d";
  ctx.fillRect(-3, hy - 1, 2, 1.6);
  ctx.fillRect(1.4, hy - 1, 2, 1.6);
  // broken nose + snarl
  ctx.strokeStyle = "#8a5f3e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hy - 0.6);
  ctx.lineTo(0.8, hy + 1.6);
  ctx.stroke();
  ctx.strokeStyle = "#6e4a30";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2.4, hy + 3);
  ctx.lineTo(2.4, hy + 2.4);
  ctx.stroke();
  // cauliflower ear + head scar
  ctx.fillStyle = "#a5764b";
  ctx.beginPath();
  ctx.arc(5.2, hy + 0.4, 1.4, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.4, hy - 4.4);
  ctx.lineTo(-1, hy - 2.6);
  ctx.stroke();
  ctx.restore();
  // stomp shockwave ring at the feet every couple of seconds
  if (A.live) {
    const cyc = (A.t % 2.2) / 2.2;
    if (cyc < 0.4) {
      const rp = cyc / 0.4;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = (1 - rp) * 0.5;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 22, 4 + rp * 14, (4 + rp * 14) * 0.3, 0, 0, PI2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.lineCap = "butt";
}

/** The king's broad cleaver-falchion, seated properly in the fist: fist at
 *  (0,0), grip through it, gold guard above the fingers, gold pommel below. */
function falchionAt(ctx: Ctx, x: number, y: number, rot: number, gold: string, A: SpriteAnim): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(-1.4, -2.8, 2.8, 6.4); // grip through the hand
  const fg = ctx.createLinearGradient(0, -17, 6, -3);
  fg.addColorStop(0, "#e9edf2");
  fg.addColorStop(1, "#9aa0a8");
  ctx.fillStyle = fg;
  ctx.beginPath(); // broad cleaver-falchion blade, rising off the guard
  ctx.moveTo(-1.6, -2.6);
  ctx.lineTo(-1, -16);
  ctx.quadraticCurveTo(0, -21, 5, -23);
  ctx.quadraticCurveTo(6.5, -18, 5, -13);
  ctx.lineTo(2.6, -2.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1, -16);
  ctx.quadraticCurveTo(0, -21, 5, -23);
  ctx.stroke();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3.2, -2.8);
  ctx.lineTo(3.8, -2.8);
  ctx.stroke(); // gold guard
  // fist wrapping the grip (drawn last so the fingers sit over it)
  ctx.fillStyle = "#a97c58";
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#8a5f3e";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(-0.4, -0.4, 1.5, -0.4, 1.8);
  ctx.stroke(); // thumb crease
  ctx.save();
  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 2 + A.glow * 2;
  ctx.beginPath();
  ctx.arc(0, 4.4, 1.4, 0, PI2);
  ctx.fill();
  ctx.restore(); // gold pommel
  ctx.restore();
}

/** The Masked King (2026-07-13 glow-up): the original crowned brute, now with
 *  a red bandit mask over the whole face, a straight jewelled crown, extra
 *  gold (chains/medallion/belt/bracer), and a full falchion swing — windup,
 *  chop with a swoosh trail, recover — on a ~2.2s loop. */
function drawBanditKing(ctx: Ctx, body: string, dark: string, light: string, accent: string, A: SpriteAnim) {
  ctx.lineCap = "round";
  const heave = A.live ? Math.sin(A.t * 2.2) * 0.8 : 0; // big chest heaving
  // legs planted wide
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(-5, 8);
  ctx.lineTo(-8, 16);
  ctx.lineTo(-7, 23);
  ctx.moveTo(5, 8);
  ctx.lineTo(9, 16);
  ctx.lineTo(10, 23);
  ctx.stroke();
  // fur-trimmed coat over a scarred barrel chest
  const g = ctx.createLinearGradient(0, -12 - heave, 0, 12);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-11, -8 - heave);
  ctx.quadraticCurveTo(-13, 4, -8, 11);
  ctx.lineTo(8, 11);
  ctx.quadraticCurveTo(13, 4, 11, -8 - heave);
  ctx.quadraticCurveTo(0, -13 - heave, -11, -8 - heave);
  ctx.closePath();
  ctx.fill();
  // fur collar
  ctx.strokeStyle = "#6e5b45";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-10, -7 - heave);
  ctx.quadraticCurveTo(0, -12 - heave, 10, -7 - heave);
  ctx.stroke();
  // bare chest V + old scars
  ctx.fillStyle = "#a97c58";
  ctx.beginPath();
  ctx.moveTo(-4, -8 - heave);
  ctx.lineTo(4, -8 - heave);
  ctx.lineTo(0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7d5138";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2, -6 - heave);
  ctx.lineTo(1, -3);
  ctx.moveTo(2.5, -7 - heave);
  ctx.lineTo(0.5, -5);
  ctx.stroke();
  // looped gold chains + medallion across the coat
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(-8, -6 - heave);
  ctx.quadraticCurveTo(0, 1 - heave, 8, -6 - heave);
  ctx.moveTo(-6.5, -7 - heave);
  ctx.quadraticCurveTo(0, -2 - heave, 6.5, -7 - heave);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -0.6 - heave, 1.9, 0, PI2);
  ctx.fill(); // medallion
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff4d6";
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(-0.6, -1.2 - heave, 0.7, 0, PI2);
  ctx.fill();
  ctx.restore();
  // gold belt with a buckle
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 1.5;
  ctx.fillRect(-8.4, 8.6, 16.8, 1.7);
  ctx.fillRect(-1.6, 8, 3.2, 3);
  ctx.restore();
  // coin-purse spoils at the belt
  ctx.fillStyle = "#5a4632";
  ctx.beginPath();
  ctx.ellipse(-6, 9, 3, 3.6, 0.3, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.arc(-6, 7, 1, 0, PI2); ctx.fill();
  ctx.restore();
  // left arm: fist planted on the hip, gold bracer
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-9, -5 - heave);
  ctx.quadraticCurveTo(-14, -1, -12, 4);
  ctx.stroke();
  ctx.fillStyle = "#a97c58";
  ctx.beginPath();
  ctx.arc(-12, 4.6, 2.6, 0, PI2);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-13.6, 0.6);
  ctx.lineTo(-10.9, 1.4);
  ctx.stroke();
  ctx.restore();
  // right arm swings the falchion: windup -> fast strike -> recover, on a loop
  const cyc = A.live ? (A.t % 2.2) / 2.2 : 0.2;
  let ang;
  if (cyc < 0.4) ang = -1.0 - (cyc / 0.4) * 0.6; // slow windup back
  else if (cyc < 0.58) ang = -1.6 + ((cyc - 0.4) / 0.18) * 2.2; // fast sweep forward
  else ang = 0.6 - ((cyc - 0.58) / 0.42) * 1.6; // recover
  const sx = 9;
  const sy = -6 - heave;
  const hx = sx + Math.cos(ang) * 7;
  const hy = sy + Math.sin(ang) * 7;
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + hx) / 2 + 1, (sy + hy) / 2, hx, hy);
  ctx.stroke();
  // swoosh trail during the strike
  if (A.live && cyc >= 0.42 && cyc < 0.72) {
    const sp = (cyc - 0.42) / 0.3;
    ctx.save();
    ctx.globalAlpha = (1 - sp) * 0.6;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sx, sy, 17, ang - 1.0, ang - 0.15);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(accent, 0.7);
    ctx.beginPath();
    ctx.arc(sx, sy, 14, ang - 0.9, ang - 0.15);
    ctx.stroke();
    ctx.restore();
  }
  // blade rotation keyframed for a FULL swing: upright -> cocked back ->
  // big chop through the arc -> ease back upright
  let rot;
  if (cyc < 0.4) rot = 0.1 - (cyc / 0.4) * 0.8; // cock back over the shoulder
  else if (cyc < 0.58) rot = -0.7 + ((cyc - 0.4) / 0.18) * 2.6; // full chopping rotation
  else rot = 1.9 - ((cyc - 0.58) / 0.42) * 1.8; // recover to upright
  falchionAt(ctx, hx, hy, rot, accent, A);
  // bearded head with the stolen crown
  ctx.fillStyle = "#a97c58";
  ctx.beginPath();
  ctx.arc(0, -16 - heave, 6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#4a3526";
  ctx.beginPath(); // beard (mostly hidden under the mask now)
  ctx.moveTo(-5, -14 - heave);
  ctx.quadraticCurveTo(0, -8 - heave, 5, -14 - heave);
  ctx.quadraticCurveTo(0, -12 - heave, -5, -14 - heave);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#14181d";
  ctx.beginPath(); ctx.arc(-2, -17 - heave, 1, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(2.5, -17 - heave, 1, 0, PI2); ctx.fill();
  // the crown — worn straight now, bigger, with stolen jewels
  ctx.save();
  ctx.translate(0.8, -21.9 - heave);
  ctx.scale(1.2, 1.2);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 2 + A.glow * 5;
  ctx.beginPath();
  ctx.moveTo(-5.5, 2);
  ctx.lineTo(-5.5, -1);
  ctx.lineTo(-3, 1);
  ctx.lineTo(-1.5, -2.5);
  ctx.lineTo(0.5, 1);
  ctx.lineTo(2.5, -2.5);
  ctx.lineTo(4, 1);
  ctx.lineTo(5.5, -1);
  ctx.lineTo(5.5, 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 3 + A.glow * 4;
  ctx.fillStyle = "#e04848";
  ctx.beginPath(); ctx.arc(-1.5, 0.4, 0.8, 0, PI2); ctx.fill();
  ctx.fillStyle = "#4ad08a";
  ctx.beginPath(); ctx.arc(2.4, 0.4, 0.7, 0, PI2); ctx.fill();
  ctx.restore();
  // red bandit mask covering the whole lower face
  const hy0 = -16 - heave;
  ctx.fillStyle = "#c22f2f";
  ctx.beginPath();
  ctx.moveTo(-6.4, hy0 - 0.2);
  ctx.lineTo(6.4, hy0 - 0.2);
  ctx.lineTo(5, hy0 + 5);
  ctx.lineTo(0, hy0 + 8.6);
  ctx.lineTo(-5, hy0 + 5);
  ctx.closePath();
  ctx.fill();
  // mask folds
  ctx.strokeStyle = "#8f1f1f";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-5, hy0 + 2);
  ctx.quadraticCurveTo(0, hy0 + 3.4, 5, hy0 + 2);
  ctx.moveTo(-4, hy0 + 4.4);
  ctx.quadraticCurveTo(0, hy0 + 5.6, 4, hy0 + 4.4);
  ctx.stroke();
  // knot tails fluttering off the side
  const fl = A.live ? Math.sin(A.t * 3.6) * 1.4 : 0;
  ctx.strokeStyle = "#c22f2f";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-5.6, hy0 + 1);
  ctx.quadraticCurveTo(-9, hy0 + fl, -11.5, hy0 + 2 + fl * 1.4);
  ctx.moveTo(-5.6, hy0 + 1.8);
  ctx.quadraticCurveTo(-8.5, hy0 + 3 + fl * 0.6, -10.5, hy0 + 5 + fl);
  ctx.stroke();
  // harder eyes: angry brow slashes above the mask line
  ctx.strokeStyle = "#2c1418";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3.6, hy0 - 2.6);
  ctx.lineTo(-0.8, hy0 - 1.4);
  ctx.moveTo(4.1, hy0 - 2.6);
  ctx.lineTo(1.3, hy0 - 1.4);
  ctx.stroke();
  ctx.lineCap = "butt";
}
