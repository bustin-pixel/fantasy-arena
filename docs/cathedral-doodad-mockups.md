# Fallen Cathedral church doodad mockups — 2026-07-16

Harness: `public/mockups/cathedral-doodad.html` (deleted after the build).
Two church variants for the Fallen Cathedral's hero landmark (replacing the
giant arch as showpiece; small arches stayed in the scatter and archBig became
the secondary hero + floor-corner prop).

## Final pick — BUILT: "Rose Basilica + spires" (1 merged with 2's towers)

Gabled nave with the 8-pane stained rose window (glass palette
`#5d74c4 #8c4fb0 #c44f4f #d8a03c`), blue side lancets, pointed door,
**left facade tower with intact spire + gold cross** and **broken right
tower** (from variant 2, per the user — keeps the "fallen" character),
fallen-spire chunk + rubble, moss, breathing violet window glow
(`atlasFxHoly` gradient, `.atlas-fx-window-glow`).

User-placed positions: world hero at node **(+2, −8)** (above-left, scale
0.85); floor `bossProp` at the Lair node **(−13, +2)** (scale 1.05).

## Loser — archived: "2 — Twin-Spire Ruin" (standalone)

Nave with twin lancet stained windows (blue over red), left tower + spire,
broken right tower, fallen spire chunk. Rejected standalone because the thin
lancets blur at map scale (~5 px/unit) where the rose window still reads —
but its towers were merged into the winner.
