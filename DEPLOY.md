# Deploying Fantasy Arena to Netlify (play it on your phone)

This gets the game onto a public URL you can open on any phone or share with
friends. Two paths — the drag-and-drop one is the simplest and needs no account
setup beyond signing in.

---

## Path A — Drag & drop (easiest)

### 1. Build the game
Open a terminal in the project folder (the inner `fantasy-arena`, where
`package.json` lives) and run:

```
npm install        # only needed the first time
npm run build
```

When it finishes you'll have a new **`dist`** folder. That folder *is* the whole
website — plain HTML/JS/CSS, no server needed.

### 2. Drop it on Netlify
1. Go to https://app.netlify.com/drop
2. Sign in (free — GitHub, email, whatever's easiest).
3. Drag the **`dist`** folder onto the page.
4. Wait a few seconds. Netlify gives you a URL like
   `https://random-name-12345.netlify.app`.

### 3. Open it on your phone
Type that URL into your phone's browser (or text it to yourself). The game
loads and runs. Done.

To update later: run `npm run build` again and drag the new `dist` folder onto
the same site (Netlify → your site → "Deploys" tab → drag-and-drop area).

---

## Path B — Connect a GitHub repo (auto-rebuilds on every change)

Only worth it if you're putting the code on GitHub anyway.

1. Push this project to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Netlify reads `netlify.toml` automatically — build command `npm run build`,
   publish folder `dist`. Just confirm and deploy.
4. From then on, every `git push` rebuilds and redeploys the site.

---

## Notes

- The game is 100% client-side, so there's nothing to pay for — the free tier
  is plenty.
- Progress (your selected deck, win/loss record) is saved in the browser's
  local storage, so it persists per-device but doesn't sync between phone and
  computer.
- The layout was built for portrait phones (480×720). If anything looks off on
  your actual screen — taps not registering, field cut off, cards too small —
  that's a layout tweak, not a deploy problem; it can be fixed.

## Want to test before deploying?

On the same Wi-Fi as your computer, you can skip hosting entirely:

```
npm run dev -- --host
```

Vite prints a **Network** URL like `http://192.168.1.50:5173`. Open that on your
phone's browser while your computer keeps the server running. Instant testing,
no upload.
