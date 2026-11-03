# تحقیقاتِ حدیث — offline app

The whole tehqeqatehadees.com collection on the reader's own device: search,
all narrations, books, the تعارف page with the تقاریظ, bookmarks and history,
with or without internet. New and edited narrations arrive automatically.

One installable web app (PWA) covers every platform, with no store fees and no
new server:

| Platform | How readers get it | Cost |
|---|---|---|
| Android | Open app.tehqeqatehadees.com in Chrome → "Install app" | free |
| iPhone / iPad | Open in Safari → Share → "Add to Home Screen" | free |
| Windows, macOS, Linux | Open in Chrome or Edge → install icon in the address bar | free |
| Optional: Microsoft Store | Package with PWABuilder, individual developer account | free |
| Optional: Google Play | Trusted Web Activity built with Bubblewrap | $25 once (only if the donor agrees) |

Not used, because they cost money every year: Apple App Store ($99/yr), Apple
notarisation, Windows code-signing certificates, paid build services.

## How it works

```
tehqeqatehadees.com (unchanged)          GitHub Actions, every hour         the app (GitHub Pages)
  /api/all-hadees/<page>   ── list ──►   build-data: compare with the  ─►  data/manifest.json
  /api/hadees-detail/<id>  ── only  ──►  published build, fetch only        data/snapshot-….sqlite.gz
                              changed     what changed                      data/changes-<n>.json
                                                                              │
                                                       phone / computer ◄────┘
                                                       SQLite + FTS5 in the browser (OPFS, Web Worker)
```

- **The website is not changed.** The data builder reads its public API, the
  same requests a visitor's browser makes. A normal run is about 91 small
  requests, once an hour; hours where nothing changed are not deployed.
- **Safe by design:** a run that cannot read the published build, sees an
  incomplete list, gets an invalid document or would delete more than 5
  hadith publishes nothing and opens a "Data build failing" issue. The app
  keeps the last good data. After an urgent correction, Actions → "Deploy app
  and data" → Run workflow publishes it within minutes.
- **First start** downloads one gzipped SQLite snapshot (about 10 MB), checks
  its sha256 and stores it on the device (about 42 MB).
- **After that** the app reads the small change files: on start, every 6 hours
  while open, when the device comes back online, and when the app returns to
  the foreground. Deletions arrive too.
- **Search** runs on the device: Urdu/Arabic normaliser (ی/ي، ک/ك، ہ/ه/ۃ،
  harakat), ranked phrase → all words → any word.
- **The app itself** is cached by a service worker, so it opens with no
  connection. A new version installs in the background and applies on the
  next start: no store review, no reinstall.

Details: `packages/core/README.md`.

## Repository layout

```
apps/web/          the app (Vite + React + TypeScript, vite-plugin-pwa, @sqlite.org/sqlite-wasm)
packages/core/     shared logic: types, normaliser, SQLite schema, search, sync engine (+ tests)
packages/assets/   fonts (from the website) and the تعارف images
packages/i18n/     the website's ur/en/ar strings (for later languages)
```


## Develop

Requirements: Node 26 and pnpm 12.

```bash
pnpm install
pnpm test                 # core: normaliser, search, sync engine, data builder
pnpm data:local           # build data from a local website on :3000 into apps/web/public/data
pnpm dev                  # app on http://localhost:5173
```

To build data from the live website instead (about 1,000 requests the first
time, only when you really need it):

```bash
pnpm --filter @tehqeqat/core build
node packages/core/dist/scripts/build-data.js --site https://tehqeqatehadees.com --out apps/web/public/data
```

## Hosting (free)

This repository is public, so GitHub Pages and GitHub Actions are free.

1. Settings → Pages → Source: **GitHub Actions**. `.github/workflows/deploy-pages.yml`
   publishes the app and its data on every push to `main` and every 6 hours.
2. Until the domain is ready, the app lives at
   `https://hassan-memon.github.io/hadith-search-offline-apps/` and works there
   (the build adapts to the address).
3. When the website owner adds the GoDaddy record
   `CNAME   app   hassan-memon.github.io`, set Settings → Pages → Custom domain
   to `app.tehqeqatehadees.com` and tick **Enforce HTTPS**. Do this only after
   the record exists: with a custom domain set, github.io redirects to it.
   Readers who installed from the github.io address need to install once more
   from the new address (browsers treat them as different apps).

## Release

Merging to `main` deploys the app. Readers get it on their next start. Bump
`apps/web/package.json` `version` for anything user-visible; it is shown under
مزید → ورژن.

## Copyright

Copyright © Tehqeeqat-e-Hadees. All rights reserved.

The code is public so it can be read and audited. No licence is granted to
copy, modify or redistribute it, and the hadith research it displays belongs
to its author. Only the maintainers can push to this repository.
