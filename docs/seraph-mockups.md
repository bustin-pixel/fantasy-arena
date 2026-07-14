# Seraph sprite mockups (2026-07-13)

Four "brand new style" variants for the Seraph legendary raid healer, drawn on
the mockup harness (`public/mockups/seraph-styles.html`, since deleted).

**Chosen & built: 4 — Stained-Glass Saint** → now `drawSeraph` in
`src/assets/sprites.ts`. One tweak was requested during the pick phase: the
inner glass panes originally dimmed to ~50% alpha in their unlit phase and read
as a black slab behind the head/halo on dark backgrounds; the built version
keeps every pane at ≥82% alpha and only modulates between "lit" and "brightly
lit".

The old sprite (game `angelWing` pair over the shared `drawHealer` body) was
replaced. `angelWing` itself is untouched — the Fallen Seraph boss still uses
it in its ashen tone.

The losing variants below are self-contained harness JS (sprite space
~-22..22, feet y27; `accent = '#ffd76a'`, `body = '#f4ecd6'`; `t` = seconds,
`glow` pulses 0..1). Each also drew a ground shadow + levitation bob outside
the snippet. Portable into a `draw*` with `A.t`/`A.glow`/`A.live`.

## 1 — Gilded Valkyrie (lost)

War-saint take: keeps the shipped feathered `angelWing` pair plus a small
drooping second pair (four wings), gilded breastplate with a glowing chased
sun emblem, pauldrons, winged circlet, spinning sun-ray halo, swinging censer
on a chain trailing holy-smoke motes.

```js
function draw1(ctx, t) {
  const bob = Math.sin(t * 1.6) * 1.4;
  const glow = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.save();
  ctx.translate(0, bob - 2);

  // small lower wing pair, drooping behind the robe skirt
  const beat = Math.sin(t * 2.0) * 0.08 - 0.5;
  ctx.save(); ctx.translate(0, 7);
  angelWing(ctx, -1, beat, 0.5, glow); // the game's angelWing (radiant)
  angelWing(ctx, 1, beat, 0.5, glow);
  ctx.restore();
  // grand main wings (the shipped Seraph's flap)
  const beat2 = Math.sin(t * 2.0 + 0.6) * 0.12 + 0.28;
  angelWing(ctx, -1, beat2, 1.28, glow);
  angelWing(ctx, 1, beat2, 1.28, glow);

  // ivory robe
  const rg = ctx.createLinearGradient(0, -11, 0, 20);
  rg.addColorStop(0, shade(body, -10)); rg.addColorStop(0.6, body); rg.addColorStop(1, shade(body, -28));
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(14, 20); ctx.lineTo(-14, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(body, 15);
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(9, 20); ctx.lineTo(-9, 20); ctx.closePath(); ctx.fill();
  // gold hem band
  ctx.strokeStyle = '#c9a94e'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-13.2, 18.4); ctx.lineTo(13.2, 18.4); ctx.stroke();

  // gilded breastplate
  const bp = ctx.createLinearGradient(0, -10, 0, 4);
  bp.addColorStop(0, '#ffe9a8'); bp.addColorStop(0.5, '#e3b74f'); bp.addColorStop(1, '#a97f2c');
  ctx.fillStyle = bp;
  ctx.beginPath();
  ctx.moveTo(-8.5, -9); ctx.quadraticCurveTo(0, -12, 8.5, -9);
  ctx.lineTo(6.5, 3); ctx.quadraticCurveTo(0, 6.5, -6.5, 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7c5a1c'; ctx.lineWidth = 0.8; ctx.stroke();
  // chased sun emblem on the chest
  ctx.save();
  ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 1;
  ctx.shadowColor = accent; ctx.shadowBlur = 3 + glow * 4;
  ctx.beginPath(); ctx.arc(0, -2.5, 2.6, 0, PI2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * PI2 / 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 3.4, -2.5 + Math.sin(a) * 3.4);
    ctx.lineTo(Math.cos(a) * 4.8, -2.5 + Math.sin(a) * 4.8);
    ctx.stroke();
  }
  ctx.restore();
  // pauldrons
  for (const s of [-1, 1]) {
    ctx.fillStyle = bp;
    ctx.beginPath(); ctx.ellipse(s * 9, -7.5, 4.2, 3.2, s * 0.35, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#7c5a1c'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = '#fff2c4'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.ellipse(s * 9, -8.2, 3, 2, s * 0.35, Math.PI, PI2); ctx.stroke();
  }

  // head: serene face + winged gold circlet
  ctx.fillStyle = shade(light, -10);
  ctx.beginPath(); ctx.arc(0, -15, 6, 0, PI2); ctx.fill();
  ctx.strokeStyle = '#6b5232'; ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.2, -14.4); ctx.quadraticCurveTo(-2.2, -13.7, -1.2, -14.4);
  ctx.moveTo(1.2, -14.4); ctx.quadraticCurveTo(2.2, -13.7, 3.2, -14.4);
  ctx.stroke();
  ctx.strokeStyle = '#e3b74f'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -15.5, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  // circlet winglets
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(s * 5.4, -18);
    ctx.quadraticCurveTo(s * 9.5, -22.5, s * 7, -17);
    ctx.closePath(); ctx.fill();
  }

  // spinning sun-ray halo
  ctx.save();
  ctx.strokeStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 6 + glow * 6;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, -24.5, 7.5, 2.8, 0, 0, PI2); ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = t * 1.2 + i * PI2 / 6;
    const x = Math.cos(a) * 7.5, y = -24.5 + Math.sin(a) * 2.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x * 1.35, -24.5 + (y + 24.5) * 1.35 - 1.2);
    ctx.stroke();
  }
  ctx.restore();

  // swinging censer on a chain (right hand)
  const sw = Math.sin(t * 1.9) * 0.45;
  ctx.save();
  ctx.translate(11, -4);
  ctx.rotate(sw);
  ctx.strokeStyle = '#c9a94e'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 11); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 3.5, 0.7, 0, PI2); ctx.arc(0, 7, 0.7, 0, PI2); ctx.stroke();
  const cg = ctx.createLinearGradient(0, 10, 0, 16);
  cg.addColorStop(0, '#ffe9a8'); cg.addColorStop(1, '#a97f2c');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.moveTo(-2.6, 11); ctx.lineTo(2.6, 11); ctx.lineTo(1.6, 16); ctx.lineTo(-1.6, 16); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 5;
  ctx.globalAlpha = 0.65 + glow * 0.35;
  ctx.fillRect(-1.6, 12.2, 3.2, 1.1);
  ctx.restore();
  ctx.restore();
  // holy smoke motes rising off the censer arc
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const seed = i * 1.7 + 0.4;
    const life = (t * 0.45 + seed) % 1;
    const x = 11 + Math.sin(sw) * 12 + Math.sin((t + seed) * 2.2) * 2.5;
    const y = 9 - life * 22;
    ctx.globalAlpha = (1 - life) * 0.5;
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.arc(x, y, 1 + life * 1.6, 0, PI2); ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}
```

## 2 — Celestial Choir (lost)

A hooded being of pure light: robe dissolving into rising motes at the hem,
starlit void for a face, detached praying hands, and a triple halo mandala
counter-rotating behind it while hymn-glyphs drift upward.

```js
function draw2(ctx, t) {
  const bob = Math.sin(t * 1.3) * 1.6;
  const glow = 0.5 + 0.5 * Math.sin(t * 1.8);
  ctx.save();
  ctx.translate(0, bob - 3);

  // triple halo mandala behind the torso
  ctx.save();
  ctx.translate(0, -6);
  ctx.strokeStyle = accent; ctx.shadowColor = accent;
  const rings = [
    [17, t * 0.5, 0.5, 1.4],
    [12.5, -t * 0.8, 0.65, 1.1],
    [8, t * 1.2, 0.8, 0.9],
  ];
  for (const [r, rot, al, lw] of rings) {
    ctx.save();
    ctx.rotate(rot);
    ctx.globalAlpha = al * (0.55 + glow * 0.45);
    ctx.shadowBlur = 5 + glow * 5;
    ctx.lineWidth = lw;
    ctx.setLineDash([r * 0.9, r * 0.35]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.stroke();
    ctx.setLineDash([]);
    // runic studs on each ring
    ctx.fillStyle = '#fff6d8';
    for (let i = 0; i < 4; i++) {
      const a = i * PI2 / 4;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9, 0, PI2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // robe of light: solid at the shoulders, dissolving at the hem
  const rg = ctx.createLinearGradient(0, -12, 0, 22);
  rg.addColorStop(0, '#fffdf4');
  rg.addColorStop(0.45, body);
  rg.addColorStop(0.85, 'rgba(244,236,214,0.25)');
  rg.addColorStop(1, 'rgba(244,236,214,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.quadraticCurveTo(11, -6, 12, 8);
  ctx.quadraticCurveTo(10, 18, 6, 22);
  ctx.lineTo(-6, 22);
  ctx.quadraticCurveTo(-10, 18, -12, 8);
  ctx.quadraticCurveTo(-11, -6, 0, -13);
  ctx.fill();
  // hem dissolve motes
  for (let i = 0; i < 7; i++) {
    const seed = i * 2.3 + 0.9;
    const life = (t * 0.5 + seed) % 1;
    const x = Math.sin(seed * 5.1) * 10;
    const y = 20 - life * 14;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.7;
    ctx.fillStyle = i % 2 ? accent : '#fff8e2';
    ctx.beginPath(); ctx.arc(x, y, 0.9 + (i % 3) * 0.3, 0, PI2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // deep hood with a starlit void face
  ctx.fillStyle = shade(body, -12);
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.quadraticCurveTo(9, -20, 7.5, -10);
  ctx.quadraticCurveTo(4, -6.5, 0, -6.5);
  ctx.quadraticCurveTo(-4, -6.5, -7.5, -10);
  ctx.quadraticCurveTo(-9, -20, 0, -22);
  ctx.fill();
  ctx.strokeStyle = '#c9a94e'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-6.8, -11); ctx.quadraticCurveTo(0, -7.5, 6.8, -11);
  ctx.stroke();
  // void + two star eyes
  const vg = ctx.createRadialGradient(0, -14, 1, 0, -14, 6);
  vg.addColorStop(0, '#2a2140'); vg.addColorStop(1, '#0d0a18');
  ctx.fillStyle = vg;
  ctx.beginPath(); ctx.ellipse(0, -14, 5.2, 5.8, 0, 0, PI2); ctx.fill();
  ctx.save();
  ctx.fillStyle = '#fff8e2'; ctx.shadowColor = accent; ctx.shadowBlur = 4 + glow * 5;
  ctx.beginPath();
  ctx.arc(-2, -14.5, 1 + glow * 0.25, 0, PI2);
  ctx.arc(2, -14.5, 1 + glow * 0.25, 0, PI2);
  ctx.fill();
  ctx.restore();

  // detached praying hands, hovering ahead of the chest
  const hb = Math.sin(t * 2.6) * 0.8;
  ctx.save();
  ctx.translate(0, -1 + hb * 0.5);
  ctx.fillStyle = '#fffdf4';
  ctx.shadowColor = accent; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.ellipse(-1.6, 0, 1.7, 3.4, 0.35, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(1.6, 0, 1.7, 3.4, -0.35, 0, PI2); ctx.fill();
  ctx.restore();

  // rising hymn glyphs
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const seed = i * 2.9 + 1.3;
    const life = (t * 0.35 + seed) % 1;
    const x = Math.sin(seed * 4.4) * 13 + Math.sin((t + seed) * 1.6) * 1.5;
    const y = 8 - life * 30;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.8;
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 0.9;
    ctx.shadowColor = accent; ctx.shadowBlur = 3;
    if (i % 2) { // tiny cross
      ctx.beginPath();
      ctx.moveTo(x, y - 1.8); ctx.lineTo(x, y + 1.8);
      ctx.moveTo(x - 1.4, y - 0.6); ctx.lineTo(x + 1.4, y - 0.6);
      ctx.stroke();
    } else { // diamond glyph
      ctx.beginPath();
      ctx.moveTo(x, y - 1.7); ctx.lineTo(x + 1.4, y); ctx.lineTo(x, y + 1.7); ctx.lineTo(x - 1.4, y);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();

  ctx.restore();
}
```

## 3 — Sixwing Dawn (lost)

The old-scripture seraphim: six wings of pure light rays breathing around a
small blindfolded figure, a burning sun-core in the chest, embers of light
drifting off the wingtips, a pulsing star above the head.

```js
function draw3(ctx, t) {
  const bob = Math.sin(t * 1.4) * 1.3;
  const glow = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.save();
  ctx.translate(0, bob - 2);

  // six ray-wings: three per side, breathing spread
  const spread = 0.10 + Math.sin(t * 1.1) * 0.05;
  ctx.save();
  ctx.translate(0, -6);
  for (const dir of [-1, 1]) {
    const baseAngles = [-1.05, -0.35, 0.45];
    for (let w = 0; w < 3; w++) {
      const a = baseAngles[w] + spread * Math.sin(t * 1.1 + w * 0.9) - spread * (w - 1);
      const len = 30 - w * 4;
      ctx.save();
      ctx.scale(dir, 1);
      ctx.rotate(a);
      // each wing: a fan of 4 translucent light blades
      for (let b = 0; b < 4; b++) {
        const ba = (b - 1.5) * 0.16;
        const bl = len * (1 - Math.abs(b - 1.5) * 0.12);
        const shimmer = 0.35 + 0.3 * Math.sin(t * 3 + b * 1.3 + w * 2.1 + (dir < 0 ? 1.7 : 0));
        const g = ctx.createLinearGradient(0, 0, Math.cos(ba) * bl, Math.sin(ba) * bl);
        g.addColorStop(0, `rgba(255,240,200,${0.85 * shimmer + 0.15})`);
        g.addColorStop(0.6, `rgba(255,215,106,${0.5 * shimmer})`);
        g.addColorStop(1, 'rgba(255,215,106,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(Math.cos(ba - 0.07) * bl + 2, Math.sin(ba - 0.07) * bl);
        ctx.lineTo(Math.cos(ba + 0.07) * bl + 2, Math.sin(ba + 0.07) * bl);
        ctx.closePath();
        ctx.fill();
      }
      // bright leading filament
      ctx.strokeStyle = `rgba(255,250,230,${0.5 + glow * 0.4})`;
      ctx.lineWidth = 0.8;
      ctx.shadowColor = accent; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len + 2, 0); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  // embers of light drifting off the wingtips
  for (let i = 0; i < 6; i++) {
    const seed = i * 1.9 + 0.6;
    const life = (t * 0.4 + seed) % 1;
    const side = i % 2 ? 1 : -1;
    const x = side * (16 + life * 14);
    const y = -8 - Math.sin(seed * 3.3) * 12 + life * 6;
    ctx.globalAlpha = (1 - life) * 0.7;
    ctx.fillStyle = i % 3 ? accent : '#fff8e2';
    ctx.beginPath(); ctx.arc(x, y, 0.8, 0, PI2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // slim column robe
  const rg = ctx.createLinearGradient(0, -10, 0, 21);
  rg.addColorStop(0, light); rg.addColorStop(0.55, body); rg.addColorStop(1, shade(body, -30));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.quadraticCurveTo(8, -4, 9, 21);
  ctx.lineTo(-9, 21);
  ctx.quadraticCurveTo(-8, -4, 0, -11);
  ctx.fill();
  // gold sash crossing the chest
  ctx.strokeStyle = '#e3b74f'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(7, 6); ctx.stroke();

  // burning sun-core in the chest
  ctx.save();
  const core = 2.4 + glow * 0.9;
  ctx.shadowColor = accent; ctx.shadowBlur = 8 + glow * 8;
  const cg = ctx.createRadialGradient(0, -1, 0.4, 0, -1, core + 2);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.45, '#ffe9a8'); cg.addColorStop(1, 'rgba(255,215,106,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, -1, core + 2, 0, PI2); ctx.fill();
  ctx.fillStyle = '#fffdf4';
  ctx.beginPath(); ctx.arc(0, -1, core * 0.5, 0, PI2); ctx.fill();
  ctx.restore();

  // head with a gold blindfold band (it needs no eyes to see)
  ctx.fillStyle = shade(light, -8);
  ctx.beginPath(); ctx.arc(0, -15.5, 5.6, 0, PI2); ctx.fill();
  const bf = ctx.createLinearGradient(0, -17.5, 0, -14);
  bf.addColorStop(0, '#ffe9a8'); bf.addColorStop(1, '#c9962e');
  ctx.fillStyle = bf;
  ctx.beginPath();
  ctx.moveTo(-5.7, -17.3); ctx.quadraticCurveTo(0, -18.6, 5.7, -17.3);
  ctx.lineTo(5.4, -14.4); ctx.quadraticCurveTo(0, -15.7, -5.4, -14.4);
  ctx.closePath(); ctx.fill();
  // band tails fluttering
  ctx.strokeStyle = '#e3b74f'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  const fl = Math.sin(t * 3.1) * 1.5;
  ctx.beginPath();
  ctx.moveTo(-5.5, -16);
  ctx.quadraticCurveTo(-9, -15 + fl * 0.4, -11.5, -12.5 + fl);
  ctx.stroke();
  // serene mouth
  ctx.strokeStyle = '#6b5232'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-1.2, -12); ctx.quadraticCurveTo(0, -11.4, 1.2, -12); ctx.stroke();

  // point halo — a single bright star above
  ctx.save();
  ctx.strokeStyle = '#fff8e2'; ctx.shadowColor = accent; ctx.shadowBlur = 6 + glow * 6;
  ctx.lineWidth = 1;
  const sp = 3 + glow * 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -26 - sp); ctx.lineTo(0, -26 + sp);
  ctx.moveTo(-sp, -26); ctx.lineTo(sp, -26);
  ctx.moveTo(-sp * 0.5, -26 - sp * 0.5); ctx.lineTo(sp * 0.5, -26 + sp * 0.5);
  ctx.moveTo(-sp * 0.5, -26 + sp * 0.5); ctx.lineTo(sp * 0.5, -26 - sp * 0.5);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
```
