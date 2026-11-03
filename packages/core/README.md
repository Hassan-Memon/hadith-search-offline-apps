# @tehqeqat/core

Shared TypeScript for the offline app: types, the Urdu/Arabic search
normaliser, the SQLite schema, search queries, the sync engine and the data
builder.

## Where the data comes from

The website is not changed for the app. `src/build/data.ts` (run by
`.github/workflows/deploy-pages.yml` every hour, on every push and by hand) reads
the website's existing public API, the same requests a visitor's browser makes:

| Request | Used for |
|---|---|
| `GET /api/all-hadees/<page>` (10 per page) | the full list with `id`, `slug`, `updated_at` |
| `GET /api/hadees-detail/<id>` | full text of new or edited hadith only |
| `GET /api/announcements`, `GET /api/files` | banner and PDF library |

It downloads the currently published build, compares `updated_at` and `slug`
per hadith (as times: the list writes `+00:00`, the detail `Z`), fetches only
what changed, treats missing ids as deletions, and publishes:

```
data/manifest.json                 cursors, counts, snapshot info, kept change files
data/snapshot-<sha16>.sqlite.gz    whole database (first start, or device far behind)
data/changes-<epoch>-<n>.json      { items: [full documents], deleted: [{id, slug, deleted_at}] }
data/announcements.json, data/files.json
```

Safety: it publishes nothing when the published build cannot be read, the
list is incomplete or shrinks below half, a fetched document fails validation,
or one run would delete more than 5 hadith (2 %) without the manual
`allow_deletes` input. Documents whose `updated_at` moved but whose content
did not are not sent to devices. A normal run is ~91 small list requests
(about 15 s).

## Manifest

```json
{
  "api_version": 1,
  "schema_version": 1,
  "min_app_version": "1.0.0",
  "generated_at": "2026-11-03T12:00:00.000Z",
  "epoch": "1793700000000",
  "latest_cursor": "1793700000000:7",
  "counts": { "hadith": 910 },
  "snapshot": {
    "url": "snapshot-de9fa15b2d3955b2.sqlite.gz",
    "bytes": 9630545,
    "sha256": "…",
    "built_at": "…",
    "cursor": "1793700000000:7",
    "schema_version": 1
  },
  "builds": [{ "cursor": "1793700000000:6", "file": "changes-1793700000000-6.json", "items": 1, "deleted": 0 }]
}
```

A cursor is `<epoch>:<n>`. The epoch is set by a build from scratch (first
run, schema change, or published data lost); a device whose epoch differs
installs the snapshot. Within an epoch, a device at build `c` applies
`changes-<epoch>-(c+1)` … latest; when the oldest kept file is newer than
`c+1` (120 are kept), or the device has no data, it installs the snapshot. A
device that needs the snapshot and cannot download it reports an error and
retries; it never shows partial data.
URLs in the manifest are relative to the manifest. Files are named by content
or number, so GitHub Pages' 10-minute cache never serves a stale mix; the
manifest itself is fetched with a cache-busting query.

## Payload size

HTML is slimmed in the published data only (`src/slim.ts`): text,
`font-class-*`, `Arbic`, `align` and real links are kept; Word's MSO classes,
`dir`/`lang`/`style`, empty spans and dead `file://` links are dropped.
`raw_content` is indexed for search but not stored in the `hadith` table (the
sections hold the same text); snippets are cut from the sections. Result: a
9.6 MB download, about 42 MB on the device.

## Normaliser

`normalize.ts`, checked by `fixtures/normalize.json`:

1. Unicode NFKC (ﷲ → الله, ﷺ → its words, presentation forms → letters).
2. Remove harakat and Quranic marks (U+0610–061A, 064B–065F, 0670, 06D6–06DC,
   06DF–06E8, 06EA–06ED), tatweel (U+0640), zero-width characters and marks
   (U+200B–200F), BOM.
3. Fold letters: ك→ک ي/ى/ئ→ی ؤ→و أ/إ/آ/ٱ→ا ه/ۀ/ۂ/ة/ۃ/ە→ہ, Arabic-Indic and
   Urdu digits → 0–9.
4. Lowercase, collapse whitespace.

The full-text index (`hadith_fts`, FTS5) holds normalised text, and queries
are normalised the same way, so «نماز», «نَمَازِ» and «نمــاز» all match.
Ranking: exact phrase, then all words, then any word; bm25 within each.

## SQLite

`schema.sql` is the single source of truth (`PRAGMA user_version` = schema
version, embedded at build time into `src/db/schema.generated.ts`). Changing
it: bump `user_version`, add a migration in `src/db/migrate.ts`. The next data
build then starts over with a full build, and devices reinstall the snapshot.

## Tests

`pnpm test`: normaliser fixture, cursors, schema, repository, search ranking
and highlighting, the sync engine, the static sync client, and the data
builder end to end against a fake website (full build, unchanged run,
edit + delete + add, a device following along, refusal on a shrunk list).
