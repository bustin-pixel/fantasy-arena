# Handoff — Endless audit 2 (bounded economy + mitigation)

**Status:** 🔨 **BUILT, VERIFIED, NOT MERGED.** Branch `feat/endless-audit-2`, cut
from `master` at `d5e3a81` (the PR #72 merge), living in the worktree
`C:\Users\Justin\Documents\fantasy-arena-endless`. Five commits, 891 tests,
typecheck + build clean. No PR opened yet — the user approves every merge, because
each one is a Netlify deploy.

> The main repo checkout (`C:\Users\Justin\Documents\fantasy-arena`) is on
> `feature/pixel-8dir` with uncommitted sprite work. **It has not been touched and
> must not be** — that is the whole reason this runs in a worktree.

---

## §0 START HERE

1. `cd C:\Users\Justin\Documents\fantasy-arena-endless && git log --oneline -5`
   — you should see `241dd5d` on top of `d5e3a81`.
2. Read **NOTES.md §4l**. It is the design record and it is more current than this
   file; this document is the *state of the work*, §4l is the *reasoning*.
3. If you are about to change any number, read **"The knobs"** below first, then
   **"Traps"**. Every trap in that list cost real time to discover.
4. Do not re-run a calibration sweep until you have read "Recalibrate LAST".

**The one thing to know:** this branch replaced a doctrine. Every previous version
of the endless curve ended in an accelerating "closer" whose growth rate climbed
without limit, justified by *"a boon arrives every wave, so against any fixed rate
a stacked build eventually wins and the run never ends."* That was true **of an
unbounded boon economy**. It is no longer the economy we have — so the curve is
now a gentle, bounded rate, and it is player power that is capped instead.

---

## What the complaint was

> "endless mode is too easy from wave 1-88 for me and the scaling got to insane
> numbers"

Both halves were one defect: the curve's growth *rate* rose linearly forever, so
it was flat for a strong warband until the mid-30s and then ×7.8e13 by wave 88 —
past the point where enemy `maxHp` is even an exact integer (2^53 lands at waves
85–89, which is exactly where the report landed).

## What shipped in the branch

1. **Bounded boon economy.** Every boon completes: `maxStacks` ranks, each buying
   an ascending share (25/35/40) of the headline on its card, and the copy that
   reaches 100% is the last ever offered. Headlines live in one `H` table at the
   top of `data/boons.ts` — **that table is the tuning surface**, they are retuned
   as a set.
2. **One legendary and one mythic per run, ever.** Taking either closes its whole
   tier (`boonSlotsUsed`).
3. **Rate boons capped** (`capPct` on Ascendant/Apotheosis), **Bounty Hunter
   capped per run** (`BOUNTY_TOTAL_CAP_FRAC`) — its per-wave cap bounded nothing,
   +25% a wave is still an exponential.
4. **The curve is a piecewise-linear rate**: 0.035 warm-up to wave 10 (waves 1–9
   are byte-identical to before), ramping to a 0.114 peak at wave 32, easing to
   0.155 forever.
5. **Toughness is mostly MITIGATION, not HP** (`endlessWaveToughness`).
   `shownHpMult / damageTakenMult` is exactly the curve's multiplier, so this is
   presentation, not balance — but a wave-70 boss reads 143k instead of 8.5m.
6. **The horde thickens**: 8 → 14 concurrent, budget cap 40 → 120.
7. **Damage carry** (`Unit.carryDamage`) so sub-point hits against heavily-resisted
   monsters stop rounding to zero.
8. **UI**: rank on offer cards and tally chips, tier-slot chips, an
   exhausted-pool intermission state, Book of Boons rank/tier tags.

## Decisions already locked — do not re-litigate

- **Ascending rank increments**, not diminishing. The user asked for this
  explicitly ("like option 2 but backwards"): repeat-picking should read as
  committing to a build, not scraping the barrel.
- **One legendary + one mythic**, exclusive tiers, not "one copy of each boon".
- **Mitigation over HP inflation** — the user's own suggestion after being shown
  that small numbers and a wave-70 death are incompatible by scaling HP.
- **The stall clock stays at 45s / 480s.** It was put on trial (the user asked to
  remove it) and the evidence is in NOTES §4l: disabled, the median is unchanged
  but 25% of runs never terminate; doubling the window buys nothing.
- **Swarm ramps 8 → 14.** User-approved.

## The invariants — break these and the mode breaks

- **Player power must stay BOUNDED.** Any boon, item or kit granting *sustained*
  uncapped per-wave growth re-opens the immortal-run hole this mode has now fallen
  into three times. Cap it at the source; do not answer it by steepening the curve.
- **`shownHpMult / damageTakenMult` must equal the curve's multiplier.** The moment
  that stops holding, the mitigation split stops being presentation and silently
  becomes a balance change. There is a spec pinning it.
- **The damage carry stays opt-in** (`Unit.carryDamage`). Global is defensible
  arithmetic and fixes Endless just as well, but it moved Depths boss-floor
  winrates 1–4pp over 80 seeds.
- **Determinism**: no `Math.random`, uid tie-breaks, all HP through the funnel.
  The carry is deterministic (same inputs → same carry → same result).

## The knobs

| Constant | File | What it does |
|---|---|---|
| `ENDLESS_RATE_EARLY` | `data/endless.ts` | Warm-up rate, waves 1–10. Leave alone unless the fresh tier is being crushed. |
| `ENDLESS_RATE_PEAK` | `data/endless.ts` | **Sets the median.** Response is steep: 0.112 → 0.130 moved it 89 → 44. |
| `ENDLESS_RATE_SUSTAIN` | `data/endless.ts` | **Sets the tail / reach-100.** Must stay > 0 or runs never end. |
| `ENDLESS_RAMP_START/PEAK_WAVE/TAPER_END` | `data/endless.ts` | *When* the squeeze is felt, without changing how hard. |
| `ENDLESS_HP_SHOWN_POWER` | `data/endless.ts` | How much toughness hides as mitigation. Pure presentation. |
| `ENDLESS_MIN_DAMAGE_TAKEN` | `data/endless.ts` | The rounding floor. See the trap below. |
| `H` table | `data/boons.ts` | Every boon's completed value. Retune as a SET. |
| `ENDLESS_ENEMY_ACTIVE_DEEP`, `ENDLESS_BUDGET_MAX` | `data/endless.ts` | Horde size. Both, or neither — see traps. |

## How to measure

```bash
SWEEP=1 SWEEP_ONLY=shape npx vitest run endlessSweep
SWEEP=1 SWEEP_ONLY=ceiling SWEEP_SEEDS=100 SWEEP_POLICY=hybridOff SWEEP_MAXWAVE=150 npx vitest run endlessSweep
SWEEP=1 SWEEP_SEEDS=24 npx vitest run winrateSweep   # Depths/Arena regression check
```

The shape table now prints boss/fodder HP and mitigation *next to* the raw curve —
the fight comes from one column, the legibility complaint from the other. Approve
a retune on both.

**Current numbers** (100 seeds, `hybridOff`, elite deck, maxed power):

```
median 74   p75 87   p90 99   max 115   |  66% wipe / 34% timeout / 0% capped
reach odds — w50 73%  w70 59%  w80 42%  w90 20%  w100 10.0%
```

against a brief of median 65–80 and ~10% reach-100. Power-tier spread (bruiser
deck, rarity-greedy): fresh **13** / mid **20** / maxed **48**. Player-facing HP:
w40 boss 14k · w55 42k · w70 143k · w100 6.4m (was 3.0e22).

## What's left

- [ ] **Open the PR and merge** — needs user approval. Nothing else blocks it.
- [ ] **Play it.** Every number here is headless. Nobody has watched a wave.
- [ ] **The 34% timeout share.** These are genuine deadlocks (a warband too weak
      to clear that also won't die) and more time provably doesn't fix them. The
      cheap improvement is presentational: the endless HUD never shows the wave
      clock at all, so surfacing the stall countdown once it starts running turns
      a mysterious ending into a fair warning. Offered to the user, not yet asked
      for.
- [ ] **Reward curve untouched** (inherited from the previous retune). A 100-wave
      run pays roughly 2× a 45-wave one. Deliberate — god-runs are rare — but
      worth revisiting if it distorts the economy.
- [ ] **Worldbreaker on a low curve.** Its %-max-HP rend is relatively stronger
      now. Its 2× carrying-hit cap is sacred (NOTES §4j); if reach-100 ever needs
      trimming, propose `frac` 0.02 → 0.015 as its own user-approved change.

## Traps — every one of these cost time

- **Excluding a rarity tier from the offer POOL is not enough.** The weight stays
  in the table and every roll landing there falls through `rollBoonOffers`'
  empty-candidates fallback — a flat draw over everything that can deal a *mythic*
  on a legendary roll. Zero the weight and redistribute; keep the pool filter as
  belt-and-braces.
- **A deep run EXHAUSTS the boon pool (~wave 70).** Intended terminal state. But
  anything that drives a run in a loop — the sweep harness, the spec drive helpers
  — must handle an empty offer set by *skipping*, or it stalls in an intermission
  it can never answer and reports **every seed at the same wave with cause
  `tickcap`**. That reads exactly like a difficulty wall and is nothing of the
  kind. Cost about an hour.
- **Mitigation has a hard ~80× ceiling.** Damage is rounded to integers at the
  funnel; past that an ordinary hit rounds to zero and the monster is literally
  unkillable. Not a taste call. Lifting it means making damage fractional first.
  Side effect worth remembering: lifesteal and thorns are percentages of damage
  *dealt*, which is now the mitigated number, so both are weaker deep.
- **Swarm size saturates.** `MAX_MELEE_SURROUND` is 3, so against 4 units only
  ~12 melee attackers can ever be swinging. And raising concurrency did *nothing*
  until the wave budget could field that many bodies — it capped at 40 points.
  Change both or neither.
- **`capPct` (the sweep's cause column) SUMS `tickcap` and `maxwave`** while the
  printout labels it "tickcap". A run reported at the harness cap may simply have
  been truncated. Check `SWEEP_MAXWAVE` before concluding anything.
- **Recalibrate LAST.** Every economy change moves the median enormously. Land the
  boon and curve changes, *then* sweep. A sweep taken mid-change measures a build
  that will not exist.
- **Small numbers and a wave-70 maxed death are incompatible by scaling HP.** If a
  future session is tempted to "just lower the numbers": a maxed warband is ~2000×
  a bare one, and the ceiling probe returned every seed at every power tier —
  including the deliberately-bad `first` policy — running to the harness cap
  without dying. Mitigation is the only way to have both.
- Old recorded runs no longer replay byte-identically (offer sequences shift once
  a tier slot is spent). Accepted and documented.

## Ship checklist

```bash
npm run typecheck && npm run build && npm test    # all three, always
SWEEP=1 SWEEP_SEEDS=24 npx vitest run winrateSweep   # Depths/Arena unchanged
```

Then **stop and ask** before merging (`WORKFLOW.md`, and the ship-cadence memory).
After merging, verify the deploy by bundle hash — this repo posts no Netlify
statuses.
