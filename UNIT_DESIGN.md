# New-Unit Design Playbook

How we go from a loose unit idea to a buildable spec. This is the **design /
brainstorm phase**. Once a spec is locked, *build* it via the "Checklist for
adding a new unit" in `NOTES.md`.

Worked example throughout: **the Holy Knight** (the unit this playbook was
written from).

---

## 1. Identity & niche first — what gap does it fill?
Start from the *roster*, not the unit. What does it do that nothing else does?
If it doesn't carve out a distinct niche, rework the idea before going further.

> Holy Knight: a **frontline support** — shields/heals the whole cluster around
> it — distinct from the Cleric (single-target heal from the backline) and the
> Knight (pure self-tank).

## 2. Propose a concrete kit, grounded in the engine
Frame it — melee/ranged, tanky/squishy, support/DPS/control — and give it one
clear signature mechanic. Lean on systems that **already exist** so it stays
low-risk and deterministic:
- `shieldHp` / `shieldHpMax` (absorb shield), the `heal()` funnel, the Cleric's
  scan-allies-in-range, the Knight's AoE-over-a-radius, the status-effect
  framework (burn/slow/stun/haste/poison/silence/stealth/taunt/fear/curse),
  summoning.

> Holy Knight: **Blessing** — pulse an absorb shield + small heal to nearby
> allies, reusing the Cleric's ally scan and the Knight's radius pattern.

## 3. Answer the mechanic-interaction questions concretely
If the idea touches an existing system, work out *exactly* how before committing
— don't hand-wave it. The answer usually surfaces the next decision.

> "Does the shield stack with the Knight's?" → Yes: `shieldHp` is a **single
> pool**, so Blessing *adds* to it (and bumps `shieldHpMax`). It layers on top of
> the Knight's Taunt bubble and the Aegis Knight's banked magic. → which forces
> the next question: a **cap**.

## 4. Surface the real decisions (recommend a default for each)
Pull out the genuine forks and let the designer choose. A quick multiple-choice
works well here. Common axes:
- **Rarity** — rare = 1 mechanic, epic = 2+, legendary = capstone / one-per-deck.
- **The 2nd mechanic** — what makes it more than one-note.
- **Balance knobs / caps** — e.g. cap stacked overhealth so it's strong, not
  unkillable.

> Holy Knight choices: **epic**, **heal bundled into Blessing**, **cap stacked
> overhealth (~150/unit)**.

## 5. Finalize the spec with concrete numbers
A stats table + each ability (name / effect / cooldown) + any trait lines +
sprite/color + name. **Make the `id` equal the display name** to avoid the
id≠name trap (`summoner`/`healer` — see `NOTES.md`).

> Holy Knight (epic, "Support Bulwark"): HP 200, dmg 14, atk 1.8s, melee, move 55.
> **Blessing** (active, ⟳8s): +40 absorb + 15 heal to itself + allies within
> ~180px; shield capped at 150/unit. Trait **"Bulwark of Faith"** explains the
> stacking + cap.

## 6. Confirm before building
Present the numbers, invite tweaks (numbers / name / sprite), get a green light.
*Then* implement via the `NOTES.md` checklist, add a per-unit spec (copy
`src/engine/__tests__/arcaneMage.test.ts` or `mysticArcher.test.ts`), and verify
(`npm run typecheck`, `npm run build`, `npm test`). Open a PR; don't merge until
the user okays it (merge auto-deploys live).

---

## Prefer first-class abilities over `defId` hardcoding
Where possible, build the unit as a **real ability** — a cast function in
`AbilitySystem.ts` plus a data entry in `abilities.ts` — instead of `defId`-gated
branches in `CombatSystem.ts`. The Holy Knight's Blessing needs *zero* `defId`
hardcoding: it just calls `heal()` and writes the `shieldHp` pool. Reach for that
pattern first; only fall back to `defId` gating for mechanics the ability hooks
genuinely can't express.
