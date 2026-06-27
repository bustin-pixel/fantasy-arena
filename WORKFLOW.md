# Workflow — building & shipping changes

How we work in this repo. (Designing a unit from an idea? See `UNIT_DESIGN.md`.
Engine gotchas / the "adding a unit" checklist? See `NOTES.md`.)

## Verify every change before committing
All three must pass:
- `npm run typecheck` — `tsc --noEmit` (the build does **not** type-check).
- `npm run build` — production build.
- `npm test` — Vitest engine specs. After an engine/sim change, add or extend a
  spec for the behavior you touched (determinism + no-crash are the invariants).

## Batch changes; merge infrequently (conserve deploys)
Merging to `master` auto-deploys to Netlify, and **each deploy costs build
credits** (the user has run out before). So:
- **At session start, run `gh pr list`** — if a batch PR is already open, continue
  it (don't start a fresh PR or re-merge already-merged work).
- Work on **one running branch / PR** and keep adding verified commits to it —
  **do not open a new PR per change.**
- **Never merge without explicit approval.** Take the work to the open PR, then
  stop and ask.
- When the user says to ship, **merge the whole batch in one go** — that's one
  deploy for N changes.

## Per-change git flow
The user is newer to git/GitHub, so handle the git steps for them:
1. Branch off `master` (or reuse the current batch branch).
2. `git add` → `git commit -F msg` — use `-F` / `--body-file`, **not** `-m`, for
   any message with quotes or em-dashes (PowerShell mangles them). End commit
   messages with the `Co-Authored-By:` line.
3. `git push`, then add the change to the open batch PR (or open the batch PR if
   it's the first change).

On a batch-merge OK: `gh pr merge <n> --merge --delete-branch`, then
`git checkout master && git pull` and confirm the merge + sync.

## Re-triggering a failed deploy
If a deploy fails (e.g. out of Netlify credits), it is **not** a merge problem —
the code is already on `master`. Re-trigger the deploy from the Netlify dashboard
(**Deploys → Trigger deploy → Deploy site**), or push an empty commit to `master`
(`git commit --allow-empty`). Don't re-merge anything.
