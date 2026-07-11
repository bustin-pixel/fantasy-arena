# SFX expansion — mockup archive (2026-07-11)

Soundboard round for the big SFX expansion (UI/meta family, battle-flow, reward/economy,
Grubbins' voice, hit-impact layer). Auditioned on `public/mockups/sfx-expansion.html`
(deleted after build). Winners are live in `src/audio/sfx.ts`; recipes below use the
engine's `blip(r, at, f0, f1, dur, type, vol, attack)` / `burst(r, at, dur, vol, fType, f0, f1)`
/ `ring(r, at, freqs[], dur, vol)` primitives.

## Picks (built)

- **UI family**: Glasswork (sine) base, with the Woodwork (triangle) `uiTap` and
  `uiEquip`/`uiUnequip` — a deliberate mixed set, confirmed via the winners sequencer.
- **countTick/countGo 1** (woodblock + bright hit), **waveHorn 3** (three ascending stabs),
  **bossAlarm 1** (dread drop), **boonChime 2** (harp gliss), **boonPick 1** (confirm+sparkle),
  **retireBank 3** (big ascending payout).
- **coinTick 1** (tiny ring), **unlockFanfare 2** (heraldic triangle stabs, **end ping removed**
  per user tweak), **questSting 3** (deep bell + rising whisper), **chestShine 2** (frosty
  sparkle), **coinShower 2** (scatter + low thump).
- **Grubbins: timbre 2 "Warm"** (triangle glottal blip + bandpass formant puff). Note: the
  sad bark's `durMul 1.4` multiplies the syllable *rate* (raising the formant register) —
  auditioned that way and approved as-is; don't "fix" it to a duration change.
- **Hits: variant 3 "Crunchy knock"** (bandpass burst + low triangle blip; big adds a 95 Hz ring).

## Losing variants (recipes, for reuse)

### UI family 1 — Glasswork (PARTIAL WINNER — tap + equip pair lost to Woodwork)
- tap: `blip(r,0,1500,1350,.04,"sine",.05)`
- equip: `ring(r,0,[2500,3600],.08,.05); burst(r,0,.02,.05,"highpass",5000,7000)`
- unequip: `burst(...); blip(r,.02,2400,1800,.06,"sine",.04)`

### UI family 2 — Woodwork (PARTIAL WINNER — everything except tap/equip lost)
- open/close: rising/falling triangle pairs 620→680 / 840→920 (mirrored)
- select: `blip(r,0,990,900,.03,"triangle",.055)`
- confirm: triangle 660 → 880 + `ring([1320],.12,.035)`
- deny: `blip(r,0,180,150,.07,"triangle",.08)` ×2 @ .1
- add/remove: triangle thirds 660/830
- shuffle: 5× `burst(...,.035,.07,"lowpass",900,500)` @ .04
- compendium: `burst(0,.13,.07,"bandpass",500,1200); ring(.11,[1180],.12,.04)`

### UI family 3 — Parchment & Brass (LOST)
- tap: `burst(r,0,.02,.05,"highpass",4000,3000); ring(r,0,[2400],.03,.02)`
- open/close: `burst(.08,.06,"bandpass",700↔1600)` + ring 1980/1480
- select: highpass micro-burst + `blip(.005,2100,2000,.03,"sine",.035)`
- confirm: `ring([1760,2640],.14,.05)` + highpass tick
- deny: `burst(0,.07,.09,"lowpass",300,150); blip(.09,170,140,.07,"triangle",.07)`
- equip: highpass tick + `ring(.015,[3100,4200],.06,.04)`; unequip mirrored
- shuffle: 6 alternating bandpass bursts 1100/1400
- compendium: `burst(0,.16,.06,"bandpass",800,2400); ring(.13,[2600,3500],.1,.035)`

### Battle-flow losers
- countTick 2 (deep drum): `blip(0,340,300,.06,"triangle",.16); burst(0,.05,.08,"lowpass",500,200)`
- countTick 3 (bell): `ring([1320,1980],.09,.06)`
- countGo 2 (brass): detuned saws 220/223 .22s + `ring(.05,[880],.2,.06)`
- countGo 3 (sweep): `blip(0,600,1200,.12,"sine",.1); ring(.1,[2093,2637],.2,.06)`
- waveHorn 1 (war horn): detuned saws 165/168→155/157, .45s, attack .05 + lowpass breath
- waveHorn 2 (low brass): saws 140/143 .6s + sine octave 280 + breath
- bossAlarm 2 (tolling bell): `ring([196,392,590],.8,.12)` ×2 @ .5 + sine sub 98→90
- bossAlarm 3 (rising alarm): detuned saws rising 120→160 .7s + highpass shimmer + stab
- boonChime 1 (shimmer): blips 784/988/1175 @ .06; boonChime 3 (warm bell): `ring([880,1760,2640],.4,.07)`
- boonPick 2 (arcane pluck): `blip(0,660,880,.1,"sine",.08); ring(.08,[1980,2640],.14,.05)`
- boonPick 3 (power sweep): `blip(0,500,1200,.12,"sine",.08); ring(.1,[2093],.18,.05)`
- retireBank 1 (cascade): rings 3800→2200 descending @ .07
- retireBank 2 (pouch cinch): bandpass 1200→600 + 2 coin rings + low thud 140→70

### Reward losers
- coinTick 2 (soft blip): `blip(0,2600,2500,.04,"sine",.04,.004)`; coinTick 3: `ring([3100,4400],.04,.03)`
- unlockFanfare 1 (rising arp): 1047/1319/1568/2093/2637 @ .06 + `ring(.35,[3140,4230],.2,.06)`
- unlockFanfare 3 (shimmer+gong): 6-note rise + `ring(.3,[440,1010,1660],.5,.08)`
- questSting 1 (two-note mystery): 523, 659 slow + detuned `ring([1319,1976],.35,.06)`
- questSting 2 (minor rise): 523/622/784 + lowpass breath
- chestShine 1 (double ring): `ring([2093,3140],.25,.07)` ×2 @ .12
- coinShower 1 (cascade): 6 falling rings 4400→2200 with 1.4× partners

### Grubbins losers
- Timbre 1 "Raspy": `blip(f,f*.92,.07,"sawtooth",.09,.02)` + `burst(.05,.03,"bandpass",f*6.5,f*5)`
- Timbre 3 "Gravel": dual detuned saws (f, f*1.035) .06 each + `burst(.035,.03,"bandpass",f*7,f*5.5)`
- Mood contours (shared, shipped): greet [1,1.12,1.28]@.11 · happy [1.15,1.35,1.45,1.2]@.09 ·
  sad [1,.78]@.16 ·durMul1.4 · neutral [1,1.06,.97]@.11 — base 140 Hz

### Hit-impact losers
- 1 "Muffled thud": soft `blip(0,180,70,.06,"triangle",.08)+burst(.04,.06,"lowpass",400,150)`;
  big `blip(0,140,45,.1,"triangle",.14)+burst(.07,.1,"lowpass",500,140)+ring(.01,[90],.12,.05)`
- 2 "Fleshy smack": soft `burst(0,.05,.12,"lowpass",550,200)+blip(0,240,90,.05,"sine",.06)`;
  big `burst(0,.08,.18,"lowpass",700,160)+blip(0,200,70,.08,"sine",.1)+ring(.01,[110],.1,.04)`

## Tunables flagged at build

- `BIG_HIT_DMG = 35` in sfx.ts — the hitBig threshold; calibrated mid-floor, may want
  raising for late-floor damage numbers.
- `HIT_FAMILY_GAP_MS = 140` — the shared hit-layer gate (≈7 thuds/s worst case).
