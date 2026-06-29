// ============================================================================
// Procedural sprites
// Rather than ship binary sprite sheets, each unit is drawn procedurally on the
// canvas with a distinct silhouette + accent color. Animation (idle bob, walk
// bounce, attack lunge, cast flare, hit flash, death fade) is derived from the
// unit's animTime/animState so the look matches the spec's six animation states
// without needing real art assets. Portraits reuse the same draw routine.
// ============================================================================

import type { Unit } from "@/types";
import { getUnitDef } from "@/data/units";

type Ctx = CanvasRenderingContext2D;

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

interface DrawOpts {
  /** Override scale (portraits use a larger scale). */
  scale?: number;
  /** Force a static idle pose (portraits). */
  staticPose?: boolean;
}

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
  const scale = opts.scale ?? 1;
  const { bob, lunge, cast } = opts.staticPose
    ? { bob: 0, lunge: 0, cast: 0 }
    : animOffsets(unit);

  ctx.save();
  ctx.translate(cx, cy - bob);

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
    ctx.ellipse(0, 26, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Druid in bear form draws as a bear regardless of its def id.
  if (def.id === "summoner" && unit.transformed) {
    drawBear(ctx, "#6b4a2a", "#3f2c18", "#8a6240", accent);
    ctx.restore();
    return;
  }

  switch (def.id) {
    case "ogre":
      drawOgre(ctx, body, dark, light, accent);
      break;
    case "orc":
      drawOrc(ctx, body, dark, light, accent);
      break;
    case "archer":
      drawArcher(ctx, body, dark, light, accent);
      break;
    case "knight":
      drawKnight(ctx, body, dark, light, accent);
      break;
    case "aegis_knight":
      drawAegisKnight(ctx, body, dark, light, accent);
      break;
    case "holy_knight":
      drawKnight(ctx, body, dark, light, accent);
      break;
    case "engineer":
      drawEngineer(ctx, body, dark, light, accent);
      break;
    case "turret":
      drawTurret(ctx, body, dark, light, accent);
      break;
    case "fire_mage":
      drawMage(ctx, body, dark, light, accent, cast);
      break;
    case "ice_mage":
      drawMage(ctx, body, dark, light, accent, cast);
      break;
    case "arcane_mage":
      drawMage(ctx, body, dark, light, accent, cast);
      break;
    case "electric_mage":
      drawMage(ctx, body, dark, light, accent, cast);
      break;
    case "assassin":
      drawAssassin(ctx, body, dark, light, accent);
      break;
    case "rogue":
      drawAssassin(ctx, body, dark, light, accent);
      break;
    case "trickster":
      drawAssassin(ctx, body, dark, light, accent);
      break;
    case "healer":
      drawHealer(ctx, body, dark, light, accent);
      break;
    case "summoner":
      drawSummoner(ctx, body, dark, light, accent);
      break;
    case "wolf":
      drawWolf(ctx, body, dark, light, accent);
      break;
    case "berserker":
      drawBerserker(ctx, body, dark, light, accent);
      break;
    case "necromancer":
      drawNecromancer(ctx, body, dark, light, accent);
      break;
    case "skeleton":
      drawSkeleton(ctx, body, dark, light, accent);
      break;
    case "slime":
      drawSlime(ctx, body, dark, light, accent, 1);
      break;
    case "slime_clone":
      drawSlime(ctx, body, dark, light, accent, 0.7);
      break;
    case "mystic_archer":
      drawMysticArcher(ctx, body, dark, light, accent, unit.mysticForm);
      break;
    default:
      drawOrc(ctx, body, dark, light, accent);
  }

  ctx.restore();
}

// Each draw fn works in a normalized space (~ -20..20 wide, -28..28 tall).

// Turret — a stubby armored base with a barrel pointing up. Symmetric, so the
// renderer's facing-flip is a no-op.
function drawTurret(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // Wide base.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-16, 8, 32, 12, 3);
  ctx.fill();
  // Armored housing.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-12, -4, 24, 14, 4);
  ctx.fill();
  // Dome cap.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -4, 10, Math.PI, Math.PI * 2);
  ctx.fill();
  // Barrel.
  ctx.fillStyle = dark;
  ctx.fillRect(-4, -22, 8, 18);
  // Glowing muzzle.
  ctx.fillStyle = accent;
  ctx.fillRect(-4, -24, 8, 4);
  // Rivets.
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 1, 3, 3);
  ctx.fillRect(6, 1, 3, 3);
}

function roundedBody(ctx: Ctx, w: number, h: number, y: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-w / 2, y, w, h, 5);
  ctx.fill();
}

// Engineer — a stout figure in a hard hat shouldering a long musket. The musket
// points forward (to the right) and flips with the unit's facing.
function drawEngineer(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // Stout torso + belt.
  roundedBody(ctx, 26, 22, 2, body);
  ctx.fillStyle = dark;
  ctx.fillRect(-13, 15, 26, 5);
  // Head.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -7, 9, 0, Math.PI * 2);
  ctx.fill();
  // Hard hat (dome + brim).
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -9, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-11, -9, 22, 3);
  // Eyes + beard.
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -7, 3, 3);
  ctx.fillRect(2, -7, 3, 3);
  ctx.fillStyle = dark;
  ctx.fillRect(-6, -2, 12, 5);
  // Musket: wooden stock, long steel barrel, glinting muzzle.
  ctx.fillStyle = "#5a3d22";
  ctx.fillRect(-10, 4, 13, 5);
  ctx.fillStyle = "#b8bcc4";
  ctx.fillRect(1, 5, 23, 3);
  ctx.fillStyle = accent;
  ctx.fillRect(22, 4, 4, 4);
}

function drawOgre(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  roundedBody(ctx, 30, 26, 0, body);
  ctx.fillStyle = dark; // belly shading
  ctx.fillRect(-15, 14, 30, 8);
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -8, 11, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-5, -10, 3, 3);
  ctx.fillRect(3, -10, 3, 3);
  // club
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(12, -4, 5, 22);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(14, -6, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrc(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  roundedBody(ctx, 22, 24, -2, body);
  ctx.fillStyle = dark;
  ctx.fillRect(-11, 12, 22, 8);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, Math.PI * 2);
  ctx.fill();
  // tusks
  ctx.fillStyle = "#f3f3e0";
  ctx.fillRect(-4, -4, 2, 4);
  ctx.fillRect(2, -4, 2, 4);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-4, -12, 2, 2);
  ctx.fillRect(2, -12, 2, 2);
  // big two-handed axe in the right hand
  drawBigAxe(ctx, 12, -2, 1);
}

function drawArcher(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  roundedBody(ctx, 16, 22, -2, body);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 7, 0, Math.PI * 2);
  ctx.fill();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -13, 8, Math.PI, 0);
  ctx.fill();
  // bow
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(10, -2, 14, -Math.PI / 2.4, Math.PI / 2.4);
  ctx.stroke();
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(15, -12);
  ctx.lineTo(15, 8);
  ctx.stroke();
}

function drawKnight(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  roundedBody(ctx, 22, 26, -2, body);
  // armor plate lines
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-9, 2);
  ctx.lineTo(9, 2);
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 18);
  ctx.stroke();
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor
  // shield
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-16, -8);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-8, 10);
  ctx.lineTo(-12, 16);
  ctx.lineTo(-16, 10);
  ctx.closePath();
  ctx.fill();
  // sword in the right hand, held upright
  ctx.save();
  ctx.translate(12, 2);
  // handle + pommel
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.5, 2, 3, 9);
  ctx.fillStyle = "#d8c08a";
  ctx.fillRect(-2, 10, 4, 2); // pommel
  ctx.fillRect(-5, 0, 10, 2.5); // crossguard
  // steel blade, pointing up
  ctx.fillStyle = "#d6d9de";
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(0, -22);
  ctx.closePath();
  ctx.fill();
  // blade highlight
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(-0.7, -2);
  ctx.lineTo(0.7, -2);
  ctx.lineTo(0, -19);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAegisKnight(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  roundedBody(ctx, 22, 26, -2, body);
  // armor seam
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, 18);
  ctx.stroke();
  // helm
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -13, 10, 3); // visor
  // big runic tower shield (left)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-20, -13, 13, 31, 4);
  ctx.fill();
  // glowing rune
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
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
  ctx.shadowBlur = 0;
  // sword (right hand)
  ctx.save();
  ctx.translate(12, 2);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.5, 2, 3, 8);
  ctx.fillStyle = "#d8c08a";
  ctx.fillRect(-5, 0, 10, 2.5);
  ctx.fillStyle = "#d6d9de";
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(0, -20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMage(
  ctx: Ctx,
  body: string,
  dark: string,
  light: string,
  accent: string,
  cast: number
) {
  // robe (triangle)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(14, 20);
  ctx.lineTo(-14, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(8, 20);
  ctx.lineTo(-8, 20);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -14, 6, 0, Math.PI * 2);
  ctx.fill();
  // hat
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(8, -14);
  ctx.lineTo(-8, -14);
  ctx.closePath();
  ctx.fill();
  // orb (glows while casting)
  const glow = 4 + cast * 4;
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6 + cast * 10;
  ctx.beginPath();
  ctx.arc(12, -2, glow, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawAssassin(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // slim hooded figure
  roundedBody(ctx, 14, 22, -2, body);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(8, -6);
  ctx.lineTo(0, -18);
  ctx.closePath();
  ctx.fill(); // hood
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -9, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-3, -10, 2, 2);
  ctx.fillRect(1, -10, 2, 2);
  // twin daggers — one in each hand, held blade-out
  drawDagger(ctx, 9, 4, 1, accent);
  drawDagger(ctx, -9, 4, -1, accent);
}

/** A small dagger at (hx,hy), pointing up-and-outward by `side` (1 right, -1 left). */
function drawDagger(ctx: Ctx, hx: number, hy: number, side: number, accent: string) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(side * -0.5); // angle the blade outward
  // handle
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(-1.5, 0, 3, 7);
  // crossguard
  ctx.fillStyle = "#8a6d3b";
  ctx.fillRect(-4, -1, 8, 2.5);
  // blade
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-2.5, -1);
  ctx.lineTo(2.5, -1);
  ctx.lineTo(0, -13);
  ctx.closePath();
  ctx.fill();
  // blade highlight
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(-0.6, -2);
  ctx.lineTo(0.6, -2);
  ctx.lineTo(0, -11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  // big steel bit — a crescent blade flaring outward
  ctx.fillStyle = "#c4c9d0";
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
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.bezierCurveTo(17, -10, 14, -17, -1, -15);
  ctx.stroke();
  ctx.restore();
}

function drawHealer(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // robed cleric
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(13, 20);
  ctx.lineTo(-13, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -13, 6, 0, Math.PI * 2);
  ctx.fill();
  // halo
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -20, 7, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  // cross/staff
  ctx.strokeStyle = "#d8c08a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(12, -8); ctx.lineTo(12, 16);
  ctx.moveTo(7, -2); ctx.lineTo(17, -2);
  ctx.stroke();
}

function drawSummoner(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // cloaked druid (defId "summoner")
  roundedBody(ctx, 22, 24, -2, body);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(12, -4);
  ctx.lineTo(8, 18);
  ctx.lineTo(-8, 18);
  ctx.closePath();
  ctx.fill(); // cloak
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 7, 0, Math.PI * 2);
  ctx.fill();
  // antler/horn headpiece
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -17); ctx.lineTo(-8, -24); ctx.moveTo(-6, -20); ctx.lineTo(-11, -21);
  ctx.moveTo(4, -17); ctx.lineTo(8, -24); ctx.moveTo(6, -20); ctx.lineTo(11, -21);
  ctx.stroke();
}

function drawWolf(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // small quadruped, drawn low to the ground
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill(); // body
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(-12, 2, 6, 0, Math.PI * 2);
  ctx.fill(); // head
  // ears
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-15, -3); ctx.lineTo(-13, -8); ctx.lineTo(-11, -3); ctx.closePath();
  ctx.moveTo(-12, -3); ctx.lineTo(-10, -8); ctx.lineTo(-8, -3); ctx.closePath();
  ctx.fill();
  // glowing eye
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-14, 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 13); ctx.lineTo(-6, 19);
  ctx.moveTo(6, 13); ctx.lineTo(6, 19);
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(13, 6); ctx.lineTo(20, 0);
  ctx.stroke();
}

function drawBear(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // big hunched bear
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 20, 16, 0, 0, Math.PI * 2);
  ctx.fill(); // body
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, 12, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill(); // lower shading
  // head
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0, Math.PI * 2);
  ctx.fill();
  // ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-8, -20, 4, 0, Math.PI * 2);
  ctx.arc(8, -20, 4, 0, Math.PI * 2);
  ctx.fill();
  // snout
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -8, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-1.5, -10, 3, 3); // nose
  // eyes
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-4, -14, 1.8, 0, Math.PI * 2);
  ctx.arc(4, -14, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // claws
  ctx.strokeStyle = "#f3f3e0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 14); ctx.lineTo(-19, 19);
  ctx.moveTo(-12, 15); ctx.lineTo(-14, 20);
  ctx.moveTo(16, 14); ctx.lineTo(19, 19);
  ctx.moveTo(12, 15); ctx.lineTo(14, 20);
  ctx.stroke();
}

function drawBerserker(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // hulking, hunched, dual axes
  roundedBody(ctx, 26, 24, 0, body);
  ctx.fillStyle = dark;
  ctx.fillRect(-13, 12, 26, 8);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(0, -8, 9, 0, Math.PI * 2);
  ctx.fill();
  // war paint / rage eyes
  ctx.fillStyle = accent;
  ctx.fillRect(-5, -10, 3, 2);
  ctx.fillRect(2, -10, 3, 2);
  // twin big axes
  drawBigAxe(ctx, 14, -2, 1);
  drawBigAxe(ctx, -14, -2, -1);
}

function drawNecromancer(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // tall hooded robe, skull face, staff
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(13, 20);
  ctx.lineTo(-13, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(9, -16);
  ctx.lineTo(0, -2);
  ctx.lineTo(-9, -16);
  ctx.closePath();
  ctx.fill(); // hood
  // skull face
  ctx.fillStyle = "#e7e5e4";
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-3, -12, 2, 2);
  ctx.fillRect(1, -12, 2, 2);
  // staff with glowing skull orb
  ctx.strokeStyle = "#3a2a18";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, -16); ctx.lineTo(13, 16);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(13, -18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSkeleton(ctx: Ctx, body: string, dark: string, light: string, accent: string) {
  // small bony figure
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 2.5;
  // spine
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(0, 12);
  ctx.stroke();
  // ribs
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = -2 + i * 4;
    ctx.beginPath();
    ctx.moveTo(-5, y); ctx.lineTo(5, y);
    ctx.stroke();
  }
  // skull
  ctx.fillStyle = "#e7e5e4";
  ctx.beginPath();
  ctx.arc(0, -11, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-3, -12, 2, 2);
  ctx.fillRect(1, -12, 2, 2);
  // legs
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 12); ctx.lineTo(-4, 19);
  ctx.moveTo(0, 12); ctx.lineTo(4, 19);
  ctx.stroke();
  // arms / rusty blade
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(9, -6);
  ctx.stroke();
}

function drawSlime(ctx: Ctx, body: string, dark: string, light: string, accent: string, scale: number) {
  ctx.save();
  ctx.scale(scale, scale);
  // gooey blob body — rounded dome with a wobbly base
  ctx.fillStyle = body;
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
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-6, -6, 5, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // inner core glow
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(0, 4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // eyes
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(-5, -2, 2, 0, Math.PI * 2);
  ctx.arc(5, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  // eye shine
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-4, -3, 0.7, 0, Math.PI * 2);
  ctx.arc(6, -3, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMysticArcher(ctx: Ctx, body: string, dark: string, light: string, accent: string, form: "light" | "dark") {
  // Hooded ranger whose aura shifts with stance: golden light or violet dark.
  const aura = form === "light" ? "#fcd34d" : "#7c3aed";
  const robe = form === "light" ? body : withShade(body, -25);
  // flowing robe
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(12, 18);
  ctx.lineTo(-12, 18);
  ctx.closePath();
  ctx.fill();
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(8, -15);
  ctx.lineTo(0, -3);
  ctx.lineTo(-8, -15);
  ctx.closePath();
  ctx.fill();
  // glowing eyes in the hood
  ctx.fillStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 6;
  ctx.fillRect(-4, -11, 2.5, 2);
  ctx.fillRect(2, -11, 2.5, 2);
  ctx.shadowBlur = 0;
  // bow, tinted by form
  ctx.strokeStyle = aura;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(11, 0, 12, -Math.PI / 2.2, Math.PI / 2.2);
  ctx.stroke();
  // bowstring
  ctx.strokeStyle = light;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(16, -10);
  ctx.lineTo(16, 10);
  ctx.stroke();
  // nocked arrow glowing with the active element
  ctx.strokeStyle = aura;
  ctx.shadowColor = aura;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
