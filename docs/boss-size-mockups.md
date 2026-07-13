# Boss battlefield size — mockup record

**Decision:** bosses render enlarged on the battlefield only, via a data-driven
`UnitDef.battleScale`. The user picked **option 4 — "Colossal" ×2.10** from a
side-by-side mockup (Abomination vs Knight + Skeleton on a shared ground line).

## Options shown

| # | Name | battleScale | Notes |
|---|------|-------------|-------|
| — | Baseline | 1.0 | today — boss reads as just another unit |
| 1 | Looming | 1.30 | bigger, still grounded |
| 2 | Hulking | 1.55 | clearly a boss (was the initial recommendation) |
| 3 | Towering | 1.80 | dominant, starts to crowd the lane |
| **4** | **Colossal** | **2.10** | **CHOSEN** — raid-boss silhouette |

Values are a battle-only multiplier layered on top of each boss sprite's existing
*intrinsic* art scale (abomination 1.25×, elder_treant 1.4×, etc.), so final
on-field size = intrinsic × 2.10. The intrinsic scale still applies in the hub
portrait; the 2.10 does not.

## How it was built (presentation only — no engine/determinism change)

- `UnitDef.battleScale?: number` (types/index.ts) — set to `2.1` on all 7 dungeon
  bosses in data/units.ts (bloater, abomination, dire_alpha, rune_golem,
  elder_treant, eclipse_warden, forge_golem).
- `drawUnitSprite` (assets/sprites.ts) applies it only when `opts.battle` is set,
  and anchors the enlarged sprite at its feet/shadow line so it grows UPWARD
  (stands on the same spot, doesn't sink). Portraits pass `opts.scale` (not
  `battle`), so cards are unaffected.
- Renderer battle path passes `{ battle: true }`; the HP bar / status icons /
  hit-flash / shield-ring follow the enlarged sprite (`spriteTopY`, `bossScaleOf`).
  Normal units (battleScale absent → 1) render byte-identically to before.
- The sim never reads `battleScale`; collision `radius` and the digest are
  untouched (all 402 tests green).

## Not done (possible follow-ups)

- Collision radius still normal — melee attackers stand at the old radius (a bit
  inside the big silhouette). Growing the hitbox would touch movement/targeting
  and the digest → a rebalance, deliberately deferred.
- Rare quest "catalyst" foes (lich, apex_beast, wildheart, …) were left at normal
  size; only the tier bosses were enlarged.
- Per-boss tuning is trivial now (just the data number) if any boss reads too big.

Verified with the real renderer (`renderBattle` / `renderPortrait`) via a
throwaway harness at `public/mockups/boss-size.html` (gitignored).
