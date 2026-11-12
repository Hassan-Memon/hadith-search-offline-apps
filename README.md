# تحقیقاتِ حدیث — offline app

The whole tehqeqatehadees.com collection on the reader's own device: search
(with book and باب filters), all narrations, books, ابواب (chapters), رواۃ
(narrators), the تعارف page with the تقاریظ and the part-2 preface,
bookmarks and history, with or without internet. Each narration can be
copied, saved as a Word file or printed. New and edited narrations arrive
automatically.

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
- **First start** downloads one gzipped SQLite snapshot (about 9.5 MB), checks
  its sha256 and stores it on the device (about 42 MB). It stays there across
  restarts and reloads. Only one window can hold it at a time, so with the
  installed app and a browser tab both open, the one in front takes it over
  (Web Lock) and the other closes its copy; nothing is downloaded twice.
  Bookmarks and history are carried over when a new snapshot is installed.
- **After that** the app reads the small change files: on start, every 6 hours
  while open, when the device comes back online, and when the app returns to
  the foreground. Deletions arrive too.
- **Search** runs on the device with the website's rules: most of the typed
  words must be in a narration, looser spellings only when that finds too
  little; Urdu/Arabic normaliser (ی/ي، ک/ك، ہ/ه/ۃ، harakat).
- **Books, chapters and narrators** come from the website's registries
  (`/api/books`, `/api/chapters`, `/api/narrators`). Devices download them
  only when they change. A narrator's page is built on the device from the
  sections of the narrations that study him (his latest volume first, as on
  the website); nothing extra is downloaded.
- **The app itself** is cached by a service worker, so it opens with no
  connection. A new version downloads in the background (checked hourly and
  when the app returns to the foreground) and switches over when the app goes
  to the background, or at once from the "update now" banner. It never
  reloads under the reader. If the published data needs a newer app
  (`min_app_version`), it updates straight away. No store review, no
  reinstall.

Details: `packages/core/README.md`. What each release brought over from the
website, with size and speed measurements: `docs/1.2.0-website-updates.md`,
`docs/1.3.0-website-updates.md` (also the website's look).

## Repository layout

```
apps/web/          the app (Vite + React + TypeScript, vite-plugin-pwa, @sqlite.org/sqlite-wasm)
packages/core/     shared logic: types, normaliser, SQLite schema, search, sync engine (+ tests)
packages/assets/   fonts (from the website) and the تعارف images
packages/i18n/     the website's ur/en/ar strings (for later languages)
docs/              release notes in depth (what changed, why, measurements)
```

Inside the app: `src/pages/` (one file per screen; تعارف and رواۃ load as
their own chunks), `src/export/` (copy text and Word file, copied from the
website and loaded only when used), `src/db/` (SQLite worker), `src/sync/`.


## Develop

Requirements: Node 26 and pnpm 12.

```bash
pnpm install
pnpm test                 # core: normaliser, search, sync engine, data builder
                          # (Node < 26: node --test packages/core/dist/test/*.test.js)
pnpm data:local           # build data from a local website on :3000 into apps/web/public/data
pnpm dev                  # app on http://localhost:5173
```

To build data from the live website instead (about 1,000 requests and ~8
minutes the first time, only when you really need it):

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
