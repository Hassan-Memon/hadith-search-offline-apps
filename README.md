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
website (tehqeqatehadees.com)                 this app (app.tehqeqatehadees.com)
  Next.js /api/sync/manifest  ───────────────►  sync engine (packages/core)
  Next.js /api/sync/changes   ── deltas ─────►    │
  Next.js /api/sync/snapshot  ── 9.6 MB once ─►   ▼
        │ forwards to                          SQLite + FTS5 in the browser
  Django /api/v1/sync/* + Elasticsearch        (OPFS, in a Web Worker)
```

- **First start** downloads one gzipped SQLite snapshot (about 10 MB), checks
  its sha256 and stores it on the device (about 42 MB).
- **After that** the app asks `/api/sync/changes` for anything newer than its
  cursor: on start, every 6 hours while open, when the device comes back
  online, and when the app returns to the foreground after 30 minutes.
  Deletions arrive as tombstones.
- **Search** runs on the device: the same Urdu/Arabic normaliser as the server
  (ی/ي، ک/ك، ہ/ه/ۃ، harakat), ranked phrase → all words → any word.
- **The app itself** is cached by a service worker, so it opens with no
  connection. A new version installs in the background and applies on the
  next start: no store review, no reinstall.

The server side (sync API, snapshot builder, public routes) lives in the
website repository (`Techwards/hadithsearch`, PR #95). The snapshot is
rebuilt once at the end of each website deploy; nothing extra runs on the
droplet.

## Repository layout

```
apps/web/          the app (Vite + React + TypeScript, vite-plugin-pwa, @sqlite.org/sqlite-wasm)
packages/core/     shared logic: types, normaliser, SQLite schema, search, sync engine (+ tests)
packages/assets/   fonts (from the website) and the تعارف images
packages/i18n/     the website's ur/en/ar strings (for later languages)
scripts/           check-contract.mjs (schema + normaliser fixture match the backend)
```

`packages/core/README.md` is the sync contract. Its `schema.sql` and
`fixtures/normalize.json` must stay identical to
`backend/hadithsearch/hadith/sync/` in the website repo: `pnpm check:contract`
compares them when that repo is checked out next to this one.

## Develop

Requirements: Node 26 and pnpm 12.

```bash
pnpm install
pnpm test                 # core: normaliser, search, sync engine
# Website running locally on :3000 (with PR #95), Django on :8000:
pnpm dev                  # app on http://localhost:5173, /api proxied to :3000
```

Build a production bundle pointed at a local website (for testing offline
behaviour with `vite preview`):

```bash
VITE_SITE_ORIGIN=http://localhost:3000 pnpm build
pnpm --filter @tehqeqat/web preview      # http://localhost:4173
```

## Hosting (free)

This repository is public, so GitHub Pages and GitHub Actions are free.

1. Settings → Pages → Source: **GitHub Actions**. The workflow
   `.github/workflows/deploy-pages.yml` publishes `apps/web/dist` on every
   push to `main`.
2. Settings → Pages → Custom domain: `app.tehqeqatehadees.com`, then tick
   **Enforce HTTPS** once the certificate is issued.
3. At GoDaddy (DNS for tehqeqatehadees.com) add one record:
   `CNAME   app   hassan-memon.github.io`

The website and its server are not involved in hosting the app; the app only
reads the website's public `/api/sync` routes.

## Release

Merging to `main` deploys the app. Readers get it on their next start. Bump
`apps/web/package.json` `version` for anything user-visible; it is shown under
مزید → ورژن.

## Copyright

Copyright © Tehqeeqat-e-Hadees. All rights reserved.

The code is public so it can be read and audited. No licence is granted to
copy, modify or redistribute it, and the hadith research it displays belongs
to its author. Only the maintainers can push to this repository.
