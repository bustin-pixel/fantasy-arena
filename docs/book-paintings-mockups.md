# Book-painting mockups — Heroes of the Arena & Arms & Relics (2026-07-12)

Visual-upgrade audition for the two non-dungeon Compendium books' splash
paintings (`src/components/compendium/splashArt.ts`), 2 variants each plus a
book-cover treatment question.

## Outcome

- **Heroes of the Arena — variant 1 "The Victor's Dawn" CHOSEN & BUILT**: a
  caped champion raises a gleaming blade into a huge low sun; god-rays,
  colosseum arches, crowd flecks, drifting petals, gold rim-light.
- **Arms & Relics — variant 2 "The Trophy Wall" CHOSEN & BUILT**: a mounted
  shield with crossed greatswords over a candlelit mantel of relics (crown,
  potion, gem, scroll) against a patterned tapestry.
- **Cover cutout ALSO BUILT** (user request, follow-up mockup): the portrait
  book cover no longer squeezes the whole landscape scene — for these two
  books it crops a plate-scale portrait window centered on a per-book focal x
  (`COVER_FOCAL` in splashArt.ts: heroes 0.53, items 0.5; painterly `finish`
  applied after the crop). Dungeon books keep the squeeze — their scenes read
  fine tall. `SplashArt` in BookOverlay passes `cover` only at the cover site.

## Rejected variants (kept for reuse)

### Heroes variant 2 — "The Duel"

Two rivals clash at dusk; the spark where sword meets axe is the light source,
rim-lighting both silhouettes over torch-lit stands, banners, kicked-up dust.

```js
function heroesV2(g,w,h,rnd){
  sky(g,w,h,"#1c2a4e","#0c1220");
  for(let i=0;i<3;i++){ g.fillStyle=`rgb(${44-i*9},${38-i*8},${30-i*6})`; g.beginPath();
    g.ellipse(w*0.5,h*(0.5+i*0.065),w*(0.64-i*0.09),h*0.13,0,Math.PI,0,true); g.fill(); }
  for(const x of [0.12,0.88]){ glow(g,w*x,h*0.34,w*0.16,"rgba(255,160,60,.55)");
    g.fillStyle="#ffb050"; g.fillRect(w*x-1.4,h*0.30,2.8,8);
    g.fillStyle="#241708"; g.fillRect(w*x-1,h*0.34,2,h*0.2); }
  for(const [x,c] of [[0.24,"#c23a3a"],[0.76,"#3b82f6"]]){
    g.fillStyle="#241708"; g.fillRect(w*x-1,h*0.24,2,h*0.22);
    g.fillStyle=c; g.beginPath(); g.moveTo(w*x,h*0.24); g.lineTo(w*x+w*0.075,h*0.26);
    g.lineTo(w*x+w*0.075,h*0.36); g.lineTo(w*x,h*0.34); g.closePath(); g.fill(); }
  const sand=g.createRadialGradient(w*0.5,h*0.62,w*0.05,w*0.5,h*0.85,w*0.7);
  sand.addColorStop(0,"#d8b06a"); sand.addColorStop(1,"#4e3a1c");
  g.fillStyle=sand; g.beginPath(); g.ellipse(w*0.5,h*0.9,w*0.6,h*0.34,0,0,7); g.fill();
  for(let i=0;i<6;i++){ g.fillStyle=`rgba(216,176,106,${0.12+rnd()*0.12})`; g.beginPath();
    g.arc(w*(0.3+rnd()*0.4),h*(0.78+rnd()*0.08),w*(0.03+rnd()*0.04),0,7); g.fill(); }
  g.fillStyle="#181022";
  g.beginPath(); g.moveTo(w*0.335,h*0.82); g.lineTo(w*0.355,h*0.60); g.lineTo(w*0.415,h*0.62);
  g.lineTo(w*0.42,h*0.82); g.closePath(); g.fill();
  g.beginPath(); g.arc(w*0.39,h*0.565,w*0.030,0,7); g.fill();
  g.beginPath(); g.ellipse(w*0.345,h*0.66,w*0.028,w*0.045,0.2,0,7); g.fill();
  g.strokeStyle="#181022"; g.lineWidth=w*0.02; g.beginPath();
  g.moveTo(w*0.415,h*0.63); g.lineTo(w*0.472,h*0.545); g.stroke();
  g.strokeStyle="#cdd2de"; g.lineWidth=w*0.012; g.beginPath();
  g.moveTo(w*0.472,h*0.545); g.lineTo(w*0.5,h*0.50); g.stroke();
  g.fillStyle="#141018";
  g.beginPath(); g.moveTo(w*0.585,h*0.82); g.lineTo(w*0.59,h*0.60); g.lineTo(w*0.655,h*0.615);
  g.lineTo(w*0.67,h*0.82); g.closePath(); g.fill();
  g.beginPath(); g.arc(w*0.615,h*0.565,w*0.031,0,7); g.fill();
  g.strokeStyle="#141018"; g.lineWidth=w*0.02; g.beginPath();
  g.moveTo(w*0.60,h*0.62); g.lineTo(w*0.545,h*0.53); g.stroke();
  g.strokeStyle="#8a6a3a"; g.lineWidth=w*0.012; g.beginPath();
  g.moveTo(w*0.545,h*0.53); g.lineTo(w*0.508,h*0.492); g.stroke();
  g.fillStyle="#b8bcc8"; g.beginPath();
  g.moveTo(w*0.512,h*0.470); g.quadraticCurveTo(w*0.545,h*0.475,w*0.535,h*0.515);
  g.lineTo(w*0.508,h*0.492); g.closePath(); g.fill();
  const sx=w*0.502, sy=h*0.496;
  glow(g,sx,sy,w*0.16,"rgba(255,236,180,.95)");
  g.strokeStyle="#fff6d8"; g.lineWidth=1.8;
  for(let i=0;i<6;i++){ const a=(i/6)*Math.PI*2+0.35; const r=w*(0.035+(i%2)*0.02);
    g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+Math.cos(a)*r, sy+Math.sin(a)*r); g.stroke(); }
  g.fillStyle="#fffbe8"; g.beginPath(); g.arc(sx,sy,w*0.012,0,7); g.fill();
  g.strokeStyle="rgba(255,236,180,.8)"; g.lineWidth=1.5;
  g.beginPath(); g.moveTo(w*0.415,h*0.62); g.lineTo(w*0.42,h*0.82); g.stroke();
  g.beginPath(); g.moveTo(w*0.59,h*0.60); g.lineTo(w*0.585,h*0.82); g.stroke();
  g.beginPath(); g.arc(w*0.39,h*0.565,w*0.030,-0.7,0.7); g.stroke();
  g.beginPath(); g.arc(w*0.615,h*0.565,w*0.031,Math.PI-0.7,Math.PI+0.7); g.stroke();
  for(let i=0;i<10;i++){ g.fillStyle=`rgba(255,230,150,${0.5+rnd()*0.5})`;
    g.fillRect(sx+(rnd()-0.5)*w*0.2, sy+(rnd()-0.5)*h*0.16, 1.8, 1.8); }
}
```

### Items variant 1 — "The Reliquary"

A legendary blade floats point-down over a stone pedestal inside a vault,
ringed by golden runes, a window light-shaft with dust motes, treasure
scattered below. (Would suit a future "vault"/museum feature.)

```js
function itemsV1(g,w,h,rnd){
  sky(g,w,h,"#241c38","#0c0a16");
  g.save(); g.globalAlpha=0.14; g.fillStyle="#ffe8b0";
  g.beginPath(); g.moveTo(w*0.72,0); g.lineTo(w*0.92,0); g.lineTo(w*0.62,h); g.lineTo(w*0.42,h);
  g.closePath(); g.fill(); g.restore();
  g.fillStyle="#171226"; g.fillRect(0,h*0.76,w,h*0.24);
  g.strokeStyle="rgba(140,120,200,.16)"; g.lineWidth=1;
  for(let i=1;i<5;i++){ g.beginPath();
    g.moveTo(w*0.5-i*w*0.16,h); g.lineTo(w*0.5-i*w*0.06,h*0.76);
    g.moveTo(w*0.5+i*w*0.16,h); g.lineTo(w*0.5+i*w*0.06,h*0.76); g.stroke(); }
  g.fillStyle="#2c2444";
  g.fillRect(w*0.43,h*0.60,w*0.14,h*0.18);
  g.fillRect(w*0.40,h*0.58,w*0.20,h*0.035);
  g.fillRect(w*0.40,h*0.76,w*0.20,h*0.03);
  g.fillStyle="#3a3058"; g.fillRect(w*0.43,h*0.60,w*0.02,h*0.18);
  glow(g,w*0.5,h*0.40,w*0.24,"rgba(255,214,120,.55)");
  g.strokeStyle="#eef2fa"; g.lineWidth=w*0.016; g.beginPath();
  g.moveTo(w*0.5,h*0.20); g.lineTo(w*0.5,h*0.50); g.stroke();
  g.strokeStyle="#aab2c6"; g.lineWidth=w*0.006; g.beginPath();
  g.moveTo(w*0.5,h*0.22); g.lineTo(w*0.5,h*0.48); g.stroke();
  g.strokeStyle="#d9b455"; g.lineWidth=w*0.014; g.beginPath();
  g.moveTo(w*0.462,h*0.185); g.lineTo(w*0.538,h*0.185); g.stroke();
  g.fillStyle="#d9b455"; g.fillRect(w*0.493,h*0.13,w*0.014,h*0.05);
  g.beginPath(); g.arc(w*0.5,h*0.115,w*0.016,0,7); g.fill();
  g.fillStyle="#7cffd0"; g.beginPath(); g.arc(w*0.5,h*0.115,w*0.009,0,7); g.fill();
  g.strokeStyle="rgba(255,216,115,.85)"; g.lineWidth=1.6; g.beginPath();
  g.ellipse(w*0.5,h*0.40,w*0.13,h*0.055,0,0,7); g.stroke();
  g.fillStyle="#ffd873";
  for(let i=0;i<7;i++){ const a=(i/7)*Math.PI*2+0.5;
    g.fillRect(w*0.5+Math.cos(a)*w*0.13-1.5, h*0.40+Math.sin(a)*h*0.055-1.5, 3, 3); }
  glow(g,w*0.5,h*0.585,w*0.07,"rgba(255,214,120,.5)");
  g.fillStyle="#e6c86a";
  for(const [x,y] of [[0.34,0.80],[0.38,0.83],[0.63,0.81],[0.67,0.84],[0.31,0.85]]){
    g.beginPath(); g.ellipse(w*x,h*y,3.2,1.8,0,0,7); g.fill(); }
  g.fillStyle="#e05a5a"; g.beginPath(); g.moveTo(w*0.70,h*0.77); g.lineTo(w*0.73,h*0.80);
  g.lineTo(w*0.70,h*0.83); g.lineTo(w*0.67,h*0.80); g.closePath(); g.fill();
  g.fillStyle="#7c4fd0"; g.beginPath(); g.arc(w*0.30,h*0.78,w*0.028,0,7); g.fill();
  g.fillStyle="#caa84a"; g.fillRect(w*0.292,h*0.72,w*0.016,h*0.045);
  for(let i=0;i<12;i++){ g.fillStyle=`rgba(255,232,176,${0.25+rnd()*0.4})`;
    const t=rnd(); g.fillRect(w*(0.72-t*0.28)+rnd()*w*0.12, h*t, 1.6, 1.6); }
}
```

The previous (replaced) paintings — the banner-and-sand arena and the flat
armory still-life — live in git history (`splashArt.ts` before this change).
