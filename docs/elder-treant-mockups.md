# Elder Treant — design mockups

Four directions explored for the Overgrowth boss (the original "broccoli tree"
read too goofy). **Direction 1 (Gnarled Guardian) was chosen and built** into
`drawElderTreant` in `src/assets/sprites.ts`. The other three are kept here so
they can be revived later — e.g. for a future treant variant, an alternate boss,
or a reskin.

Each function draws in the normalized sprite space (~ -22..22 wide, feet ~y27,
canopy ~y-27), authored to be dropped into `sprites.ts` as a `draw*` taking
`(ctx, body, dark, light, accent, A)`. Below they're standalone with the Elder
Treant palette inlined for quick preview; `shade()` is the local twin of
`withShade()`. To preview all four, paste the block into a `preview_eval` that
renders each onto a translated/scaled canvas (see session history for the 2×2
grid harness).

```js
// Elder Treant palette
const body = '#5b4327', accent = '#4d7c0f';
const clamp = x => Math.max(0, Math.min(255, x));
const shade = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgb(${clamp((n>>16&255)+a)},${clamp((n>>8&255)+a)},${clamp((n&255)+a)})`; };
const dark = shade(body, -45), light = shade(body, 35);
const canopy = accent, canopyD = shade(accent, -28), canopyL = shade(accent, 30);
const glow = '#fde68a'; const PI2 = Math.PI * 2;

// ── 1 — Gnarled Guardian (CHOSEN → built as drawElderTreant) ───────────────
// Thick twisted trunk, stern face carved into the bark (heavy brow, deep glowing
// eyes, grim cracked maw), raised gnarled clawed arms, craggy asymmetric canopy.
function v1(ctx) {
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s*7,18); ctx.lineTo(s*15,27); ctx.lineTo(s*10,21); ctx.lineTo(s*13,27); ctx.lineTo(s*5,22); ctx.closePath(); ctx.fill(); }
  const g = ctx.createLinearGradient(0,-10,0,22); g.addColorStop(0,light); g.addColorStop(1,dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-9,20); ctx.quadraticCurveTo(-7,4,-9,-9); ctx.quadraticCurveTo(-4,-12,-3,-7); ctx.quadraticCurveTo(0,-11,3,-7); ctx.quadraticCurveTo(4,-12,9,-9); ctx.quadraticCurveTo(7,4,9,20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3,18); ctx.quadraticCurveTo(-1,4,-3,-7); ctx.moveTo(4,18); ctx.quadraticCurveTo(2,4,3,-7); ctx.stroke();
  ctx.strokeStyle = body; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6,-3); ctx.quadraticCurveTo(-15,-7,-19,-17); ctx.moveTo(6,-3); ctx.quadraticCurveTo(15,-7,19,-17); ctx.stroke();
  ctx.lineWidth = 1.8; for (const [hx,hy,d] of [[-19,-17,-1],[19,-17,1]]) { for (let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+d*3.5,hy-4+i*3.2); ctx.stroke(); } } ctx.lineCap = 'butt';
  ctx.fillStyle = canopyD; for (const [cx,cy,r] of [[-11,-19,7],[-2,-25,8.5],[9,-21,6.5],[3,-16,6],[14,-15,4]]) { ctx.beginPath(); ctx.arc(cx,cy,r,0,PI2); ctx.fill(); }
  ctx.fillStyle = canopy; for (const [cx,cy,r] of [[-9,-20,5],[-1,-26,6],[8,-22,4.5]]) { ctx.beginPath(); ctx.arc(cx,cy,r,0,PI2); ctx.fill(); }
  ctx.fillStyle = canopyL; ctx.beginPath(); ctx.arc(-3,-27,2.4,0,PI2); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-6,-3.5); ctx.quadraticCurveTo(0,-6,6,-3.5); ctx.lineTo(5,-1.5); ctx.quadraticCurveTo(0,-3.5,-5,-1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#140f08'; ctx.beginPath(); ctx.ellipse(-3.2,0.5,1.9,2.6,0,0,PI2); ctx.ellipse(3.2,0.5,1.9,2.6,0,0,PI2); ctx.fill();
  ctx.save(); ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-3.2,1,1.1,0,PI2); ctx.arc(3.2,1,1.1,0,PI2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#140f08'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4,7); ctx.lineTo(-1.5,8.5); ctx.lineTo(1.5,7); ctx.lineTo(4,8.5); ctx.stroke(); ctx.lineCap = 'butt';
}

// ── 2 — Willow Elder ───────────────────────────────────────────────────────
// Taller trunk draped in long drooping willow fronds, glowing slit-eyes peering
// through, spreading roots. Elegant and eldritch.
function v2(ctx) {
  ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const ex of [-13,-6,0,7,13]) { ctx.beginPath(); ctx.moveTo(0,16); ctx.quadraticCurveTo(ex*0.5,22,ex,26); ctx.stroke(); } ctx.lineCap = 'butt';
  const g = ctx.createLinearGradient(0,-16,0,18); g.addColorStop(0,light); g.addColorStop(1,dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5,18); ctx.quadraticCurveTo(-4,-4,-5,-16); ctx.lineTo(5,-16); ctx.quadraticCurveTo(4,-4,5,18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = body; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4,-13); ctx.quadraticCurveTo(-13,-18,-17,-14); ctx.moveTo(4,-13); ctx.quadraticCurveTo(13,-18,17,-14); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = canopyD; for (const [cx,cy,r] of [[-12,-16,7],[0,-22,9],[12,-16,7],[-5,-19,6],[5,-19,6]]) { ctx.beginPath(); ctx.arc(cx,cy,r,0,PI2); ctx.fill(); }
  ctx.strokeStyle = canopy; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (let i=0;i<9;i++){ const sx=-16+i*4; const len=10+((i%3))*5+(Math.abs(i-4)<2?8:0); ctx.beginPath(); ctx.moveTo(sx,-14); ctx.quadraticCurveTo(sx+1,-14+len*0.6,sx-1,-14+len); ctx.stroke(); ctx.fillStyle=canopyL; ctx.beginPath(); ctx.arc(sx-1,-14+len,1.4,0,PI2); ctx.fill(); }
  ctx.lineCap = 'butt';
  ctx.save(); ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 6; ctx.beginPath(); ctx.ellipse(-2.4,-6,1.7,0.9,0.2,0,PI2); ctx.ellipse(2.4,-6,1.7,0.9,-0.2,0,PI2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0,-1,2,Math.PI*0.15,Math.PI*0.85); ctx.stroke();
}

// ── 3 — Hunched Colossus ───────────────────────────────────────────────────
// Broad hunched bark-body, burl-head with a jagged maw, dead-branch antler crown,
// mushrooms + moss. Bulkiest, but reads a bit critter-like — needs work.
function v3(ctx) {
  const g = ctx.createLinearGradient(0,-12,0,20); g.addColorStop(0,light); g.addColorStop(1,dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-13,-4); ctx.quadraticCurveTo(-16,12,-9,20); ctx.lineTo(9,20); ctx.quadraticCurveTo(16,12,12,-6); ctx.quadraticCurveTo(8,-12,0,-11); ctx.quadraticCurveTo(-9,-12,-13,-4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-11,18); ctx.lineTo(-14,26); ctx.lineTo(-6,20); ctx.closePath(); ctx.moveTo(11,18); ctx.lineTo(14,26); ctx.lineTo(6,20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = body; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-11,-2); ctx.quadraticCurveTo(-18,6,-15,16); ctx.moveTo(11,-2); ctx.quadraticCurveTo(18,6,15,16); ctx.stroke();
  ctx.lineWidth = 1.8; for (const [hx,hy,d] of [[-15,16,-1],[15,16,1]]) { for (let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+d*2+i*1.5,hy+4); ctx.stroke(); } } ctx.lineCap = 'butt';
  ctx.strokeStyle = shade(body,-10); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6,-10); ctx.lineTo(-9,-19); ctx.lineTo(-12,-17); ctx.moveTo(-9,-19); ctx.lineTo(-8,-24); ctx.moveTo(6,-10); ctx.lineTo(9,-19); ctx.lineTo(12,-17); ctx.moveTo(9,-19); ctx.lineTo(8,-24); ctx.moveTo(0,-11); ctx.lineTo(0,-21); ctx.lineTo(-3,-24); ctx.moveTo(0,-21); ctx.lineTo(3,-25); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = shade(body,8); ctx.beginPath(); ctx.ellipse(0,-4,8,7,0,0,PI2); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0,-4,8,7,0,0.15*Math.PI,0.85*Math.PI); ctx.fill();
  ctx.fillStyle = '#120d06'; ctx.beginPath(); ctx.ellipse(-3.4,-6,2,2.4,0,0,PI2); ctx.ellipse(3.4,-6,2,2.4,0,0,PI2); ctx.fill();
  ctx.save(); ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-3.4,-5.6,1.1,0,PI2); ctx.arc(3.4,-5.6,1.1,0,PI2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#120d06'; ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(-2.5,3); ctx.lineTo(-1,0.5); ctx.lineTo(0.5,3.5); ctx.lineTo(2,0.5); ctx.lineTo(3.5,3); ctx.lineTo(4,0.2); ctx.lineTo(0,1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c94f3a'; ctx.beginPath(); ctx.ellipse(-9,-4,2.4,1.4,0,0,PI2); ctx.fill(); ctx.fillStyle = '#e8d3ad'; ctx.fillRect(-9.6,-3.2,1.4,2.4);
  ctx.fillStyle = canopyD; ctx.globalAlpha = 0.6; for (const [mx,my] of [[-8,6],[7,8],[-3,14]]) { ctx.beginPath(); ctx.arc(mx,my,2.4,0,PI2); ctx.fill(); } ctx.globalAlpha = 1;
}

// ── 4 — Dead-Wood Maw ──────────────────────────────────────────────────────
// Split trunk forming a gaping vertical maw of splinter-teeth, glowing eyes above,
// bare clawed branches spread wide, spiky dead crown. Menacing/horror.
function v4(ctx) {
  ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const ex of [-14,-7,7,14]) { ctx.beginPath(); ctx.moveTo(ex*0.4,18); ctx.quadraticCurveTo(ex*0.8,23,ex,26); ctx.stroke(); } ctx.lineCap = 'butt';
  const g = ctx.createLinearGradient(0,-14,0,20); g.addColorStop(0,light); g.addColorStop(1,dark); ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-11,20); ctx.quadraticCurveTo(-10,2,-9,-12); ctx.quadraticCurveTo(-6,-14,-4,-10); ctx.quadraticCurveTo(-3,2,-3,20); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(11,20); ctx.quadraticCurveTo(10,2,9,-12); ctx.quadraticCurveTo(6,-14,4,-10); ctx.quadraticCurveTo(3,2,3,20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0f0b06'; ctx.beginPath(); ctx.moveTo(-3,-6); ctx.lineTo(3,-6); ctx.lineTo(2,16); ctx.lineTo(-2,16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = light; for (let i=0;i<4;i++){ const y=-4+i*5; ctx.beginPath(); ctx.moveTo(-3,y); ctx.lineTo(-0.5,y+1.5); ctx.lineTo(-3,y+3); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(3,y+1); ctx.lineTo(0.5,y+2.5); ctx.lineTo(3,y+4); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = body; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7,-8); ctx.quadraticCurveTo(-16,-10,-20,-4); ctx.moveTo(7,-8); ctx.quadraticCurveTo(16,-10,20,-4); ctx.stroke();
  ctx.lineWidth = 1.6; for (const [hx,hy,d] of [[-20,-4,-1],[20,-4,1]]) { for (let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+d*3,hy-3+i*3); ctx.stroke(); } } ctx.lineCap = 'butt';
  ctx.strokeStyle = shade(body,-8); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7,-11); ctx.lineTo(-10,-20); ctx.moveTo(-3,-12); ctx.lineTo(-4,-22); ctx.moveTo(3,-12); ctx.lineTo(4,-22); ctx.moveTo(7,-11); ctx.lineTo(10,-20); ctx.moveTo(0,-13); ctx.lineTo(0,-24); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = '#0f0b06'; ctx.beginPath(); ctx.arc(-4,-9,2.2,0,PI2); ctx.arc(4,-9,2.2,0,PI2); ctx.fill();
  ctx.save(); ctx.fillStyle = '#b6f36a'; ctx.shadowColor = '#b6f36a'; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(-4,-9,1.2,0,PI2); ctx.arc(4,-9,1.2,0,PI2); ctx.fill(); ctx.restore();
}
```

**To revive one:** drop its function into the `sprites.ts` dungeon-bestiary section
renamed (e.g. `drawWillowTreant`), swap the inlined palette back to the passed
`body/dark/light/accent`/`withShade`, add an `A`-driven ambient (pulsing eyes +
`rising()` leaves) per the bestiary conventions, and wire it into the `switch`.
