# @tehqeqat/core

Shared, platform-neutral TypeScript for the Tehqeqat offline apps (Expo mobile,
Tauri desktop): types, the search normaliser, the SQLite schema, search queries
and the sync engine. The Django backend implements the server side of the
contract below; `backend/hadithsearch/hadith/sync/` mirrors `schema.sql`,
`normalize` and `fixtures/normalize.json`.

## Sync contract (v1)

Django serves the API at `/api/v1/sync/` on the internal compose network.
The website exposes it publicly at **`https://tehqeqatehadees.com/api/sync/`**
(Next.js routes that forward to Django, add open CORS and hold the snapshot
in memory). Apps always use the public routes. Locally: `http://localhost:3000/api/sync/`.

### Cursor

```
"<updated_at_ms>|<slug>|<deleted_at_ms>"
```

* `updated_at_ms` – epoch milliseconds of the last applied document's `updated_at`
* `slug` – that document's slug (tie-break: the 910 imported documents share one
  `updated_at`, so time alone is not a cursor)
* `deleted_at_ms` – epoch milliseconds of the newest tombstone applied (0 if none)

The empty string means "nothing applied yet". Cursors are opaque to clients
except for equality; the server parses them.

### `GET manifest`

```json
{
  "api_version": 1,
  "schema_version": 1,
  "min_app_version": "1.0.0",
  "generated_at": "2026-11-02T18:00:00.000Z",
  "latest_cursor": "1761659695655|مقدمہ|0",
  "counts": { "hadith": 910 },
  "snapshot": {
    "url": "/api/sync/snapshot",
    "bytes": 7340032,
    "sha256": "…hex…",
    "built_at": "2026-11-02T03:00:00.000Z",
    "cursor": "1761659695655|مقدمہ|0",
    "schema_version": 1
  }
}
```

`snapshot` is `null` when no snapshot has been built yet. `snapshot.url` may be
relative; clients resolve it against the manifest URL. `Cache-Control:
public, max-age=300`.

### `GET changes?since=<cursor>&limit=500`

```json
{
  "items":   [ { "id": "…", "slug": "…", "title": "…", "book": "…", "type": "…",
                 "hukm": "…", "html_content": "[…json…]", "raw_content": "…",
                 "references": "…", "tags": ["…"], "authored_at": null,
                 "created_at": "…", "updated_at": "…" } ],
  "deleted": [ { "id": "…", "slug": "…", "deleted_at": "…" } ],
  "next_cursor": "…",
  "has_more": false
}
```

* `items`: documents with `(updated_at, slug) > (since.updated_at_ms, since.slug)`,
  sorted by `updated_at asc, slug asc` (Elasticsearch `search_after`), at most
  `limit` (1–500, default 500). Full documents, same fields as `/api/v1/hadith`.
* `deleted`: tombstones with `deleted_at > since.deleted_at_ms`, sorted
  ascending, at most 1000.
* `next_cursor`: updated part = last item (or unchanged), deleted part = newest
  tombstone returned (or unchanged).
* `has_more`: `items.length == limit || deleted.length == 1000`.
* `since` missing or empty = from the beginning. Invalid cursor → 400.

Applying a page is idempotent: upsert every item, delete every tombstoned id,
then store `next_cursor`, all in one transaction.

### `GET snapshot`

Serves the newest `hadith-v<schema>.sqlite.gz`: a gzip of a SQLite database
created from `schema.sql` with `hadith` and `hadith_fts` filled and
`sync_state` row 1 set to the build cursor. Headers: `ETag` (= sha256),
`Content-Length`, `Content-Type: application/gzip`, `Cache-Control: public,
max-age=3600`. Supports `If-None-Match` → 304.

### Tombstones

Index `hadith_tombstones` `{ id: keyword, slug: keyword, deleted_at: date }`.
Written by the delete view **before** the document is deleted. Never pruned
(a few dozen rows a year at most).

## Normaliser

Both `normalize.ts` and `normalize.py` implement exactly this, in this order,
and must pass every case in `fixtures/normalize.json`:

1. Unicode NFKC (turns ﷲ into الله, ﷺ into its words, presentation forms into letters).
2. Remove: U+0610–U+061A, U+064B–U+065F, U+0670, U+06D6–U+06DC, U+06DF–U+06E8,
   U+06EA–U+06ED (harakat and Quranic marks), U+0640 (tatweel),
   U+200B–U+200F (ZW space/joiners, LRM/RLM), U+FEFF.
3. Map characters:
   `ك→ک`, `ي→ی`, `ى→ی`, `ئ→ی`, `ؤ→و`, `أ→ا`, `إ→ا`, `آ→ا`, `ٱ→ا`,
   `ه→ہ`, `ۀ→ہ`, `ۂ→ہ`, `ة→ہ`, `ۃ→ہ`, `ە→ہ`,
   `٠–٩→0–9`, `۰–۹→0–9`.
   (`ے`, `ھ`, `ں`, `گ`, `چ`, `پ`, `ژ`, `ڑ`, `ٹ`, `ڈ` are kept as they are.)
4. Lowercase.
5. Collapse runs of whitespace to one space and trim.

## Payload size

The server slims the Word HTML in the sync output only (text, `font-class-*`,
`Arbic`, `align` and real links kept; MSO classes, `dir`/`lang`/`style`, empty
spans and dead `file://` links dropped). `raw_content` is sent in `/changes`
items so the device can index it, but it is **not stored** in the `hadith`
table (the sections hold the same text); snippets are cut from the sections.

## SQLite

`schema.sql` is the single source of truth (PRAGMA `user_version` = schema
version). `hadith_fts` holds normalised text: `title` = title_text, `body` =
raw_content only (what the website searches), `hukm`, `book`, `tags` (space-joined).
