// ============================================================================
// corpseArt — thematic remains left on the arena floor where a unit died.
// Same mold as chestArt.ts: a pure, SFX-free drawing core consumed by
// Renderer.ts's ground-decal pass. Presentation only — corpses are derived
// from dead units already in the snapshot (they persist all match), so this
// module adds NO sim state and the determinism rule never applies here.
//
// Every defId maps to a shared corpse KIND (bone pile, slime pool, ash…) via
// CORPSE_KIND_BY_ID (the SHADOW_BY_ID idiom from sprites.ts); anything
// unmapped falls back to a generic tinted mound built from the unit's own
// color/accent. Painters draw around the origin in a nominal footprint of
// roughly x∈[-18,18], y∈[-9,9] (flat floor perspective); drawCorpse scales
// that to the unit's real footprint.
//
// Per-corpse scatter (bone angles, rubble chunks, coin spread) comes from a
// tiny PRNG seeded with the unit's uid so a corpse keeps its exact shape
// across frames instead of boiling — seeded for STABILITY, not determinism.
// ============================================================================

type Ctx = CanvasRenderingContext2D;
const PI2 = Math.PI * 2;

export type CorpseKind =
  | "bones"
  | "bones_bow" // + snapped bow (skeleton archer)
  | "bones_wisp" // + lingering soul wisp (lich)
  | "ash"
  | "rubble"
  | "rune_rubble" // + fading rune glow (golems/automaton)
  | "slime_pool"
  | "slime_armor" // + empty armor bits (slime knight)
  | "goo"
  | "spore_burst" // + drifting spore motes
  | "remains"
  | "carcass"
  | "scrap"
  | "armor_pile" // collapsed empty armor (animated armor)
  | "leaves"
  | "brambles"
  | "stump"
  | "robes"
  | "dissipate" // energy beings: brief motes, then NOTHING
  | "stain"
  | "loot_spill"
  | "feathers"
  | "arms" // dropped sword + helmet (heroes-at-arms)
  | "bow_drop" // dropped bow + spilled arrows (hero archers)
  | "generic";

/** Per-unit corpse kind, keyed by `def.id`. Heroes included — deaths read the
 *  same on both teams. Unmapped ids get the tinted `generic` mound. */
export const CORPSE_KIND_BY_ID: Record<string, CorpseKind> = {
  // -- undead --
  skeleton: "bones",
  skeleton_archer: "bones_bow",
  bonecaller: "bones",
  lich: "bones_wisp",
  zombie_shambler: "remains",
  ghoul: "remains",
  abomination: "remains",
  grave_chorister: "robes",
  // -- demons & stone --
  imp: "ash",
  gargoyle: "rubble",
  rune_golem: "rune_rubble",
  forge_golem: "rune_rubble",
  ancient_automaton: "rune_rubble",
  // -- slimes --
  slime: "slime_pool",
  slime_clone: "slime_pool",
  slime_squire: "slime_pool",
  slime_knight: "slime_armor",
  // -- ooze & spores --
  bloater: "goo",
  bloatling: "goo",
  spore_pod: "spore_burst",
  // -- beasts --
  giant_rat: "carcass",
  dire_wolf: "carcass",
  razorback: "carcass",
  grizzly: "carcass",
  dire_alpha: "carcass",
  apex_beast: "carcass",
  wolf: "carcass",
  boar: "carcass",
  // -- constructs --
  clockwork_spider: "scrap",
  sentry: "scrap",
  turret: "scrap",
  engineer: "scrap",
  animated_armor: "armor_pile",
  // -- grove --
  thornbeast: "brambles",
  dryad: "leaves",
  wildheart: "leaves",
  elder_treant: "stump",
  // -- robed casters --
  cultist: "robes",
  eclipse_acolyte: "robes",
  heretic_zealot: "robes",
  penitent: "robes",
  fire_mage: "robes",
  ice_mage: "robes",
  electric_mage: "robes",
  arcane_mage: "robes",
  mage: "robes",
  archmage: "robes",
  necromancer: "robes",
  healer: "robes",
  summoner: "robes",
  priest: "robes",
  // -- energy beings (no body to leave) --
  arcane_wisp: "dissipate",
  light_wisp: "dissipate",
  mirror_image: "dissipate",
  // -- shadow --
  shadow_wraith: "stain",
  eclipse_warden: "stain",
  eclipse_herald: "stain",
  // -- scoundrels (bloodless: they drop their loot) --
  cutpurse: "loot_spill",
  knife_thrower: "loot_spill",
  den_bruiser: "loot_spill",
  bandit_king: "loot_spill",
  silencer: "loot_spill",
  assassin: "loot_spill",
  rogue: "loot_spill",
  trickster: "loot_spill",
  outlaw: "loot_spill",
  // -- winged holy --
  fallen_seraph: "feathers",
  seraph: "feathers",
  // -- heroes-at-arms --
  knight: "arms",
  warrior: "arms",
  berserker: "arms",
  aegis_knight: "arms",
  holy_knight: "arms",
  ogre: "arms",
  orc: "arms",
  // -- hero archers --
  archer: "bow_drop",
  ranger: "bow_drop",
  hunter: "bow_drop",
  mystic_archer: "bow_drop",
};

/** Per-unit corpse footprint multiplier (keyed by `def.id`, default 1). The
 *  Renderer sizes corpses off the unit's collision radius, which is fairly
 *  uniform — small creatures and lean remains need a manual pull-down so the
 *  decal doesn't outsize the thing that died. */
export const CORPSE_SIZE_BY_ID: Record<string, number> = {
  // bone piles read oversized at full footprint
  skeleton: 0.6,
  skeleton_archer: 0.6,
  bonecaller: 0.6,
  lich: 0.6,
  // a rat's carcass should look rat-sized, not wolf-sized
  giant_rat: 0.6,
};

export interface CorpseArgs {
  /** UnitDef.color — tints pools, carcasses, robes, the generic mound. */
  color: string;
  /** UnitDef.accent — glows, runes, trims. */
  accent: string;
  /** Footprint radius in world px (nominal painter space is 16). */
  size: number;
  /** Stable scatter seed — pass the unit's uid. */
  seed: string;
  /** Ambient clock in seconds (ember pulses, drifting motes). */
  t: number;
  /** Death fade 0→1 (clamped). 1 = fully settled corpse. Drives the crossfade
   *  window: dissipate motes exist only while fade < 1. */
  fade: number;
}

/** Draw a corpse centered at the origin. The caller owns translate/alpha. */
export function drawCorpse(ctx: Ctx, kind: CorpseKind, args: CorpseArgs): void {
  const r = makeRand(args.seed);
  // Desync ambient shimmer (embers, wisps) between identical corpses.
  const a: CorpseArgs = { ...args, t: args.t + r() * 10 };
  ctx.save();
  const s = a.size / 16;
  ctx.scale(s, s);
  switch (kind) {
    case "bones": drawBonePile(ctx, r); break;
    case "bones_bow": drawBonePile(ctx, r); drawSnappedBow(ctx); break;
    case "bones_wisp": drawBonePile(ctx, r); drawSoulWisp(ctx, a); break;
    case "ash": drawAshPile(ctx, r, a); break;
    case "rubble": drawRubble(ctx, r); break;
    case "rune_rubble": drawRubble(ctx, r); drawRuneGlow(ctx, r, a); break;
    case "slime_pool": drawSlimePool(ctx, r, a); break;
    case "slime_armor": drawSlimePool(ctx, r, a); drawArmorBits(ctx); break;
    case "goo": drawGooSplat(ctx, r, a); break;
    case "spore_burst": drawGooSplat(ctx, r, a); drawSporeMotes(ctx, a); break;
    case "remains": drawRemains(ctx, r, a); break;
    case "carcass": drawCarcass(ctx, a); break;
    case "scrap": drawScrap(ctx, r, a); break;
    case "armor_pile": drawArmorPile(ctx, a); break;
    case "leaves": drawLeafLitter(ctx, r, a); break;
    case "brambles": drawBrambles(ctx, r, a); break;
    case "stump": drawStump(ctx, a); break;
    case "robes": drawRobes(ctx, r, a); break;
    case "dissipate": drawDissipate(ctx, r, a); break;
    case "stain": drawStain(ctx, a); break;
    case "loot_spill": drawLootSpill(ctx, r, a); break;
    case "feathers": drawFeathers(ctx, r, a); break;
    case "arms": drawArms(ctx, a); break;
    case "bow_drop": drawBowDrop(ctx, r, a); break;
    default: drawGeneric(ctx, r, a); break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Rand = () => number;

/** Tiny seeded PRNG (mulberry32 flavor over an FNV-1a hash of the uid) —
 *  per-corpse scatter stays put across frames. */
function makeRand(seed: string): Rand {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amt: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
}

/** Faint dark patch blending the corpse into the floor. */
function groundPatch(ctx: Ctx, rx = 16, ry = 7, alpha = 0.16): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 1, rx, ry, 0, 0, PI2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// bones
// ---------------------------------------------------------------------------

const BONE = "#e6ddc4";
const BONE_DARK = "#b3a887";

function longBone(ctx: Ctx, x: number, y: number, angle: number, len: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.roundRect(-len / 2, -1, len, 2, 1);
  ctx.fill();
  for (const e of [-len / 2, len / 2]) {
    ctx.beginPath();
    ctx.arc(e, -0.9, 1.4, 0, PI2);
    ctx.arc(e, 0.9, 1.4, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSkull(ctx: Ctx, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(0, -0.5, 4, 0, PI2);
  ctx.fill();
  ctx.fillRect(-2.4, 2.2, 4.8, 2.2); // jaw
  ctx.fillStyle = BONE_DARK;
  ctx.fillRect(-1.9, 2.6, 1, 1.6); // teeth gaps
  ctx.fillRect(0.9, 2.6, 1, 1.6);
  ctx.fillStyle = "#241f16";
  ctx.beginPath();
  ctx.arc(-1.5, -0.8, 1.1, 0, PI2);
  ctx.arc(1.5, -0.8, 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
}

function drawBonePile(ctx: Ctx, r: Rand): void {
  groundPatch(ctx, 15, 6, 0.14);
  for (let i = 0; i < 4; i++) {
    longBone(
      ctx,
      -12 + i * 6 + (r() - 0.5) * 5,
      (r() - 0.5) * 7 + 2,
      (r() - 0.5) * 1.2,
      8 + r() * 4
    );
  }
  // ribcage arcs
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-4 + i * 3, 0.5, 5 - i, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  drawSkull(ctx, 8, -2);
}

function drawSnappedBow(ctx: Ctx): void {
  ctx.strokeStyle = "#6b4a26";
  ctx.lineWidth = 1.6;
  ctx.beginPath(); // two limb halves, broken apart
  ctx.arc(-11, 6, 5, Math.PI * 1.2, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-5, 8, 5, Math.PI * 0.25, Math.PI * 0.8);
  ctx.stroke();
  ctx.strokeStyle = "rgba(230,224,204,0.7)"; // dangling string
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-14, 3.5);
  ctx.quadraticCurveTo(-9, 9, -3, 6);
  ctx.stroke();
}

function drawSoulWisp(ctx: Ctx, a: CorpseArgs): void {
  const pulse = 0.5 + 0.5 * Math.sin(a.t * 2.4);
  const y = -8 - Math.sin(a.t * 1.3) * 1.5;
  const g = ctx.createRadialGradient(0, y, 0.5, 0, y, 6);
  g.addColorStop(0, withAlpha("#c9a8ff", 0.5 + pulse * 0.3));
  g.addColorStop(1, "rgba(201,168,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, y, 6, 0, PI2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#efe3ff", 0.55 + pulse * 0.35);
  ctx.beginPath();
  ctx.arc(0, y, 1.4, 0, PI2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// ash / rubble
// ---------------------------------------------------------------------------

function drawAshPile(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.2);
  ctx.fillStyle = "#57534e";
  ctx.beginPath();
  ctx.ellipse(0, 1, 11, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#78716c";
  ctx.beginPath();
  ctx.ellipse(-1, -0.5, 7.5, 3.4, 0, 0, PI2);
  ctx.fill();
  // soot flecks
  ctx.fillStyle = "#3f3c38";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc((r() - 0.5) * 22, (r() - 0.5) * 9 + 2, 0.9 + r() * 0.7, 0, PI2);
    ctx.fill();
  }
  // pulsing embers buried in the mound
  for (let i = 0; i < 3; i++) {
    const ex = (r() - 0.5) * 10;
    const ey = (r() - 0.5) * 4;
    const glow = Math.max(0, 0.45 + 0.45 * Math.sin(a.t * 2.2 + i * 2.1));
    ctx.fillStyle = `rgba(255,120,30,${glow})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.1, 0, PI2);
    ctx.fill();
  }
}

function drawRubble(ctx: Ctx, r: Rand): void {
  groundPatch(ctx, 16, 7, 0.18);
  for (let i = 0; i < 6; i++) {
    const x = -13 + i * 5 + (r() - 0.5) * 4;
    const y = (r() - 0.5) * 7 + 1;
    const w = 3.5 + r() * 4;
    const grey = 95 + Math.floor(r() * 45);
    ctx.fillStyle = `rgb(${grey},${grey - 4},${grey - 8})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r() - 0.5) * 0.8);
    ctx.beginPath(); // chunky irregular block
    ctx.moveTo(-w / 2, w * 0.28);
    ctx.lineTo(-w * 0.3, -w * 0.3);
    ctx.lineTo(w * 0.35, -w * 0.34);
    ctx.lineTo(w / 2, w * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }
}

function drawRuneGlow(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  const pulse = 0.4 + 0.3 * Math.sin(a.t * 1.8);
  ctx.strokeStyle = withAlpha(a.accent, pulse);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 16;
    const y = (r() - 0.5) * 6 + 1;
    ctx.beginPath(); // dying rune tick on a shard face
    ctx.moveTo(x - 1.5, y + 1.2);
    ctx.lineTo(x, y - 1.5);
    ctx.lineTo(x + 1.5, y + 1.2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// slimes / goo
// ---------------------------------------------------------------------------

function drawSlimePool(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  ctx.fillStyle = shade(a.color, -30);
  ctx.beginPath();
  ctx.ellipse(0, 1, 14, 6.5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.ellipse(-0.5, 0.3, 12, 5.2, 0, 0, PI2);
  ctx.fill();
  // glossy highlight
  ctx.fillStyle = withAlpha("#ffffff", 0.3);
  ctx.beginPath();
  ctx.ellipse(-4, -1.4, 4.5, 1.7, -0.25, 0, PI2);
  ctx.fill();
  // stray droplets
  ctx.fillStyle = a.color;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(
      (r() > 0.5 ? 1 : -1) * (13 + r() * 4),
      (r() - 0.5) * 6 + 2,
      1.2 + r() * 0.8,
      0,
      PI2
    );
    ctx.fill();
  }
}

function drawArmorBits(ctx: Ctx): void {
  // Empty helmet + a shoulder plate half-sunk in the pool.
  ctx.fillStyle = "#9aa3ad";
  ctx.beginPath(); // tipped helmet dome
  ctx.arc(5, -1.5, 3.4, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.fillStyle = "#1f242b";
  ctx.fillRect(2.2, -2.2, 5.6, 1.6); // visor slit
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(5, -1.5, 3.4, Math.PI * 0.95, Math.PI * 2.05);
  ctx.stroke();
  ctx.fillStyle = "#7b8794";
  ctx.beginPath(); // pauldron sliver
  ctx.ellipse(-6, 0.5, 3, 1.6, 0.3, Math.PI, PI2);
  ctx.fill();
}

function drawGooSplat(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  const base = a.color;
  ctx.fillStyle = shade(base, -35);
  // irregular burst: central blob + radiating splats
  ctx.beginPath();
  ctx.ellipse(0, 1, 10, 4.6, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = base;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * PI2 + r() * 0.6;
    const d = 6 + r() * 8;
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(ang) * d,
      Math.sin(ang) * d * 0.42 + 1,
      2 + r() * 2.2,
      1 + r(),
      ang * 0.3,
      0,
      PI2
    );
    ctx.fill();
  }
  ctx.fillStyle = shade(base, 30);
  ctx.beginPath();
  ctx.ellipse(-1, 0, 5, 2.2, 0, 0, PI2);
  ctx.fill();
}

function drawSporeMotes(ctx: Ctx, a: CorpseArgs): void {
  // Spores drift up and fan out forever, looping softly.
  for (let i = 0; i < 5; i++) {
    const p = (a.t * 0.22 + i / 5) % 1;
    const x = Math.sin(a.t * 0.7 + i * 2.4) * (4 + p * 8);
    const y = -2 - p * 13;
    const alpha = Math.sin(p * Math.PI) * 0.5;
    if (alpha <= 0.02) continue;
    ctx.fillStyle = withAlpha(a.accent, alpha);
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + p * 0.5, 0, PI2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// flesh & fur
// ---------------------------------------------------------------------------

function drawRemains(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6.5, 0.2);
  const flesh = shade(a.color, -15);
  ctx.fillStyle = shade(flesh, -25);
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 11, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = flesh;
  ctx.beginPath(); // lumpy heap: three overlapping mounds
  ctx.ellipse(-4, -0.5, 5.5, 3.2, 0.2, 0, PI2);
  ctx.ellipse(3, -1, 5, 3, -0.15, 0, PI2);
  ctx.ellipse(0, 1.5, 6, 2.6, 0, 0, PI2);
  ctx.fill();
  // sickly ooze patches + a protruding bone tip
  ctx.fillStyle = withAlpha("#86a34d", 0.55);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc((r() - 0.5) * 14, (r() - 0.5) * 5, 1.3 + r(), 0, PI2);
    ctx.fill();
  }
  longBone(ctx, 7, -3, -0.7, 5);
}

function drawCarcass(ctx: Ctx, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6, 0.16);
  const fur = a.color;
  // body on its side
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -1, 10, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = shade(fur, 26);
  ctx.beginPath(); // belly
  ctx.ellipse(0.5, 1, 7, 2.6, 0, 0, PI2);
  ctx.fill();
  // head + ear
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(-10.5, -1, 4, 3.2, -0.2, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-12.5, -3.4);
  ctx.lineTo(-11.2, -6.4);
  ctx.lineTo(-9.6, -3.8);
  ctx.closePath();
  ctx.fill();
  // stiff legs up in the air (cartoon-dead, bloodless)
  ctx.strokeStyle = shade(fur, -30);
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  for (const [lx, tilt] of [[2, -0.18], [6, 0.14]] as const) {
    ctx.beginPath();
    ctx.moveTo(lx, -4.5);
    ctx.lineTo(lx + tilt * 12, -9.5);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // X eye + drooping tail
  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-11.6, -2); ctx.lineTo(-10, -0.4);
  ctx.moveTo(-10, -2); ctx.lineTo(-11.6, -0.4);
  ctx.stroke();
  ctx.strokeStyle = shade(fur, -20);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(9.5, 0);
  ctx.quadraticCurveTo(14, 1.5, 15.5, 4.5);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// constructs
// ---------------------------------------------------------------------------

function drawScrap(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6.5, 0.18);
  // bent plates
  for (let i = 0; i < 3; i++) {
    const grey = 110 + Math.floor(r() * 40);
    ctx.fillStyle = `rgb(${grey},${grey + 4},${grey + 10})`;
    ctx.save();
    ctx.translate((r() - 0.5) * 18, (r() - 0.5) * 6 + 1.5);
    ctx.rotate((r() - 0.5) * 1);
    ctx.beginPath();
    ctx.moveTo(-4, 1.5);
    ctx.lineTo(-1, -1.8);
    ctx.lineTo(4, -0.8);
    ctx.lineTo(3, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }
  // a toothed gear
  ctx.save();
  ctx.translate(5, -2);
  ctx.rotate(r() * PI2);
  ctx.fillStyle = "#a16207";
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * PI2;
    ctx.fillRect(Math.cos(ang) * 3.4 - 0.9, Math.sin(ang) * 3.4 - 0.9, 1.8, 1.8);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#3a3530";
  ctx.beginPath();
  ctx.arc(0, 0, 1.2, 0, PI2);
  ctx.fill();
  ctx.restore();
  // sprung coil
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = -11 + i * 1.4;
    const y = 4 + (i % 2 ? -1.6 : 1.6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // one last accent spark
  const spark = Math.max(0, Math.sin(a.t * 5.1));
  if (spark > 0.7) {
    ctx.fillStyle = withAlpha(a.accent, (spark - 0.7) * 2.5);
    ctx.beginPath();
    ctx.arc(5, -2, 1.6, 0, PI2);
    ctx.fill();
  }
}

function drawArmorPile(ctx: Ctx, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6.5, 0.18);
  // Fixed steel greys — the Animated Armor's def color is near-black and reads
  // as a blob on the arena floor; empty armor should glint.
  const steel = "#9aa3ad";
  // collapsed breastplate
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 7.5, 4.2, 0.1, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = shade(steel, 40);
  ctx.beginPath(); // rim highlight
  ctx.ellipse(-2, -0.8, 6, 2.6, 0.1, Math.PI, PI2);
  ctx.stroke();
  // helmet rolled aside, visor dark and EMPTY
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(9, -1, 3.8, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.stroke();
  ctx.fillStyle = "#14161a";
  ctx.fillRect(6.2, -2, 5.6, 1.8);
  ctx.fillStyle = withAlpha(a.accent, 0.85); // crest stub
  ctx.beginPath();
  ctx.ellipse(9, -4.6, 1.7, 0.9, 0.4, 0, PI2);
  ctx.fill();
  // a gauntlet
  ctx.fillStyle = shade(steel, -20);
  ctx.beginPath();
  ctx.roundRect(-12, 2, 4.5, 2.6, 1);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// grove
// ---------------------------------------------------------------------------

function drawLeafLitter(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.12);
  // snapped twigs
  ctx.strokeStyle = "#6b4a26";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 18;
    const y = (r() - 0.5) * 6 + 1;
    const ang = (r() - 0.5) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * 4, y - Math.sin(ang) * 2);
    ctx.lineTo(x + Math.cos(ang) * 4, y + Math.sin(ang) * 2);
    ctx.stroke();
  }
  // scattered leaves in the unit's green + a withered brown
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i % 3 === 2 ? "#8a6a34" : shade(a.color, (r() - 0.5) * 50);
    ctx.save();
    ctx.translate((r() - 0.5) * 26, (r() - 0.5) * 9 + 1);
    ctx.rotate(r() * PI2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.4, 1.1, 0, 0, PI2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBrambles(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6.5, 0.14);
  // withered thorny loops
  ctx.strokeStyle = shade(a.color, -35);
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 7 + (r() - 0.5) * 3;
    const y = (r() - 0.5) * 4;
    ctx.beginPath();
    ctx.arc(x, y, 3.5 + r() * 2, r() * PI2, r() * PI2 + Math.PI * 1.5);
    ctx.stroke();
  }
  // thorn ticks
  ctx.strokeStyle = "#5c4326";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) {
    const x = (r() - 0.5) * 24;
    const y = (r() - 0.5) * 9 + 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - 1.5 - r());
    ctx.stroke();
  }
}

function drawStump(ctx: Ctx, a: CorpseArgs): void {
  groundPatch(ctx, 16, 7, 0.2);
  const bark = shade(a.color, -20);
  // broken trunk seen from above-ish: bark ring + growth rings + jagged rim
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 6.5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#c9a876";
  ctx.beginPath();
  ctx.ellipse(0, -0.8, 7.8, 4.6, 0, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#a07d4c";
  ctx.lineWidth = 0.8;
  for (const k of [0.68, 0.4]) {
    ctx.beginPath();
    ctx.ellipse(0, -0.8, 7.8 * k, 4.6 * k, 0, 0, PI2);
    ctx.stroke();
  }
  // splintered shards standing on the rim
  ctx.fillStyle = bark;
  for (const [sx, h] of [[-8, 4], [-3, 6], [6, 5]] as const) {
    ctx.beginPath();
    ctx.moveTo(sx - 1.4, -2);
    ctx.lineTo(sx, -2 - h);
    ctx.lineTo(sx + 1.4, -2);
    ctx.closePath();
    ctx.fill();
  }
  // roots
  ctx.strokeStyle = bark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (const [dx, dy] of [[-12, 4], [12, 3.5], [8, 6]] as const) {
    ctx.beginPath();
    ctx.moveTo(dx * 0.6, dy * 0.7);
    ctx.quadraticCurveTo(dx * 0.85, dy, dx + (dx > 0 ? 3 : -3), dy);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// ---------------------------------------------------------------------------
// cloth, light & shadow
// ---------------------------------------------------------------------------

function drawRobes(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.14);
  const cloth = a.color;
  // crumpled fabric heap
  ctx.fillStyle = shade(cloth, -25);
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 11, 5, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.ellipse(-3, -0.5, 6.5, 3.4, 0.25, 0, PI2);
  ctx.ellipse(4, 0.2, 5.5, 3, -0.2, 0, PI2);
  ctx.fill();
  // fold lines
  ctx.strokeStyle = withAlpha("#000000", 0.25);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 5 + (r() - 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(x, -2 + r());
    ctx.quadraticCurveTo(x + 2, 1, x - 1, 3.2);
    ctx.stroke();
  }
  // empty hood opening + accent trim
  ctx.fillStyle = "#15121c";
  ctx.beginPath();
  ctx.ellipse(-8, -1.5, 3, 2, 0.35, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(a.accent, 0.8);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(-8, -1.5, 3, 2, 0.35, 0, PI2);
  ctx.stroke();
}

function drawDissipate(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  // Energy beings leave NOTHING — just a brief upward mote burst while the
  // sprite fades (fade < 1), then the floor is clean.
  if (a.fade >= 1) return;
  const gone = a.fade; // 0 → 1 over the death fade
  const alpha = 1 - gone;
  ctx.strokeStyle = withAlpha(a.accent, alpha * 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath(); // expanding farewell ring
  ctx.ellipse(0, 0, 4 + gone * 12, 2 + gone * 5, 0, 0, PI2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const ang = r() * PI2;
    const d = 2 + gone * (6 + r() * 8);
    const x = Math.cos(ang) * d;
    const y = Math.sin(ang) * d * 0.5 - gone * 10 * (0.5 + r() * 0.5);
    ctx.fillStyle = withAlpha(i % 2 ? "#ffffff" : a.accent, alpha * (0.5 + r() * 0.4));
    ctx.beginPath();
    ctx.arc(x, y, 1 + r() * 0.8, 0, PI2);
    ctx.fill();
  }
}

function drawStain(ctx: Ctx, a: CorpseArgs): void {
  const breathe = 0.85 + 0.15 * Math.sin(a.t * 1.6);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
  g.addColorStop(0, `rgba(8,6,14,${0.6 * breathe})`);
  g.addColorStop(0.7, `rgba(12,10,22,${0.35 * breathe})`);
  g.addColorStop(1, "rgba(12,10,22,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, PI2);
  ctx.fill();
  // wispy tendrils curling off the edge
  ctx.strokeStyle = `rgba(30,24,48,${0.5 * breathe})`;
  ctx.lineWidth = 1.4;
  for (const [dx, sw] of [[-11, 1], [12, -1], [3, 1]] as const) {
    ctx.beginPath();
    ctx.moveTo(dx, 2);
    ctx.quadraticCurveTo(dx + sw * 4, -6, dx + sw * 1.5, -13);
    ctx.stroke();
  }
  ctx.restore();
  // a faint accent glimmer where the eyes were
  ctx.fillStyle = withAlpha(a.accent, 0.25 + 0.2 * Math.sin(a.t * 2.3));
  ctx.beginPath();
  ctx.arc(-1.6, -1, 0.8, 0, PI2);
  ctx.arc(1.6, -1, 0.8, 0, PI2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// dropped gear
// ---------------------------------------------------------------------------

function drawLootSpill(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.14);
  // dropped dagger
  ctx.save();
  ctx.translate(-7, -1);
  ctx.rotate(-0.5 + r() * 0.3);
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(1.5, -1.2);
  ctx.lineTo(1.5, 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#57534e";
  ctx.fillRect(1.5, -1.5, 1.2, 3); // guard
  ctx.fillStyle = shade(a.color, -10);
  ctx.fillRect(2.7, -0.9, 3.4, 1.8); // grip
  ctx.restore();
  // burst coin pouch
  ctx.fillStyle = "#7a5c36";
  ctx.beginPath();
  ctx.ellipse(5, 0.5, 3.2, 2.4, -0.2, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "#4d3a20";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // spilled coins
  for (let i = 0; i < 6; i++) {
    const x = 2 + r() * 12;
    const y = (r() - 0.5) * 7 + 2;
    ctx.fillStyle = "#ffd24d";
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5, 1, 0, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "#a87a12";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawFeathers(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  // soft holy afterglow
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
  g.addColorStop(0, withAlpha(a.accent, 0.18));
  g.addColorStop(1, withAlpha(a.accent, 0));
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, PI2);
  ctx.fill();
  ctx.restore();
  // ring of fallen feathers, tips singed grey
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * PI2 + (r() - 0.5) * 0.5;
    const d = 6 + r() * 7;
    const x = Math.cos(ang) * d;
    const y = Math.sin(ang) * d * 0.45 + 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2 + (r() - 0.5) * 0.6);
    ctx.fillStyle = "#f3efe4";
    ctx.beginPath(); // feather: slim leaf
    ctx.ellipse(0, 0, 1.3, 3.4, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = "#8a8578"; // singed tip
    ctx.beginPath();
    ctx.ellipse(0, -2.5, 0.9, 1.1, 0, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; // quill line
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(0, -2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawArms(ctx: Ctx, a: CorpseArgs): void {
  groundPatch(ctx, 15, 6, 0.15);
  // sword flat on the ground
  ctx.save();
  ctx.translate(-3, 1);
  ctx.rotate(-0.35);
  ctx.fillStyle = "#d7dee8";
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(2, -1.4);
  ctx.lineTo(2, 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = "#a87a12"; // crossguard
  ctx.fillRect(2, -2.6, 1.6, 5.2);
  ctx.fillStyle = shade(a.color, -15); // grip
  ctx.fillRect(3.6, -1, 4, 2);
  ctx.fillStyle = "#ffd24d"; // pommel
  ctx.beginPath();
  ctx.arc(8.4, 0, 1.3, 0, PI2);
  ctx.fill();
  ctx.restore();
  // helmet tipped on its side
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.arc(8, -2.5, 3.6, 0, PI2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = "#14161a";
  ctx.fillRect(4.9, -3.4, 4.4, 1.7); // dark visor
  ctx.fillStyle = withAlpha(a.accent, 0.9); // plume stub
  ctx.beginPath();
  ctx.ellipse(10.6, -5.3, 1.8, 1, 0.6, 0, PI2);
  ctx.fill();
}

function drawBowDrop(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.14);
  // the bow, fallen in one piece
  ctx.strokeStyle = "#6b4a26";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(-4, 8, 10, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();
  ctx.strokeStyle = "rgba(230,224,204,0.8)"; // slack string
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-11.5, 0.5);
  ctx.quadraticCurveTo(-4, 3.5, 3.4, 0.3);
  ctx.stroke();
  // spilled arrows
  for (let i = 0; i < 3; i++) {
    const x = 4 + i * 3 + (r() - 0.5) * 2;
    const y = (r() - 0.5) * 5 + 1;
    const ang = -0.4 + (r() - 0.5) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = "#8a6a34";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1"; // head
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(2.6, -0.9);
    ctx.lineTo(2.6, 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha(a.accent, 0.9); // fletching
    ctx.fillRect(-4.8, -0.9, 1.6, 1.8);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// fallback
// ---------------------------------------------------------------------------

function drawGeneric(ctx: Ctx, r: Rand, a: CorpseArgs): void {
  groundPatch(ctx, 14, 6, 0.16);
  ctx.fillStyle = shade(a.color, -35);
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 10, 4.6, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = shade(a.color, -15);
  ctx.beginPath();
  ctx.ellipse(-1, -0.5, 7, 3.2, 0.1, 0, PI2);
  ctx.fill();
  // scattered tinted fragments
  ctx.fillStyle = shade(a.color, 15);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc((r() - 0.5) * 20, (r() - 0.5) * 8 + 1.5, 1 + r() * 0.9, 0, PI2);
    ctx.fill();
  }
  ctx.fillStyle = withAlpha(a.accent, 0.6);
  ctx.beginPath();
  ctx.arc(3, -1, 1.1, 0, PI2);
  ctx.fill();
}
