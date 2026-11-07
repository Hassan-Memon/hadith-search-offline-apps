-- On-device schema of the offline app. The data builder (src/build/data.ts)
-- creates the published snapshot from it, and the app migrates with it.
-- Bump PRAGMA user_version and add a migration in src/db/migrate.ts whenever
-- this file changes.

PRAGMA user_version = 2;

-- One row per hadith document, fields exactly as the API returns them.
CREATE TABLE IF NOT EXISTS hadith (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  book            TEXT NOT NULL DEFAULT '',
  -- Small columns before the large text ones: reading them for a filter or a
  -- list then never walks through a narration's text.
  chapter         TEXT,                         -- slug of its باب (chapters.slug)
  narrators_json  TEXT NOT NULL DEFAULT '[]',   -- JSON string: [{slug, start, end}] sections studying a narrator
  type            TEXT,
  title_html      TEXT NOT NULL DEFAULT '',
  title_text      TEXT NOT NULL DEFAULT '',
  hukm_html       TEXT,
  html_content    TEXT NOT NULL DEFAULT '[]',   -- JSON string: [{heading, content}]
  raw_content     TEXT NOT NULL DEFAULT '',
  references_html TEXT,
  tags_json       TEXT NOT NULL DEFAULT '[]',   -- JSON string: string[]
  authored_at     TEXT,
  created_at      TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hadith_book ON hadith(book);
CREATE INDEX IF NOT EXISTS idx_hadith_updated ON hadith(updated_at, slug);
CREATE INDEX IF NOT EXISTS idx_hadith_chapter ON hadith(chapter);

-- Full-text index over *normalised* text (see normalize.ts). A plain FTS5
-- table: a row is replaced by deleting it by id and inserting it again.
CREATE VIRTUAL TABLE IF NOT EXISTS hadith_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  hukm,
  book,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- The website's registries (published as data/registry-<sha>.json and
-- replaced whole on the device when it changes).
CREATE TABLE IF NOT EXISTS books (
  name          TEXT PRIMARY KEY,
  volume_no     INTEGER,                     -- part of the series, or NULL
  sort_order    INTEGER,
  is_series     INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,                        -- 'YYYY-MM-DD'
  aliases_json  TEXT NOT NULL DEFAULT '[]',  -- other stored spellings of the name
  pdf_pages     INTEGER NOT NULL DEFAULT 0   -- 1 when every narration has its pages in the book's PDF
);
-- Every spelling a hadith row may carry, mapped to the book's name.
CREATE VIEW IF NOT EXISTS book_spelling AS
  SELECT name AS spelling, name FROM books
  UNION SELECT j.value, b.name FROM books b, json_each(b.aliases_json) j;

CREATE TABLE IF NOT EXISTS chapters (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  parent       TEXT,                         -- group heading, e.g. «عقائد»
  sort_order   INTEGER,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS narrators (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  death_note   TEXT,                         -- as printed, e.g. «المتوفی ۲۹۰ھ»
  death_year   INTEGER,
  century      INTEGER
);

-- Announcements and the PDF library, as the website lists them
-- (published as data/announcements.json and data/files.json).
CREATE TABLE IF NOT EXISTS announcements (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                 -- 'text-banner' | 'pop-over'
  payload     TEXT NOT NULL,                 -- JSON string of the record
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT,
  seen_at     TEXT                           -- device-local: when the user dismissed it
);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  image_url     TEXT,
  bytes         INTEGER,
  local_path    TEXT,                        -- device-local: downloaded copy
  downloaded_at TEXT
);

-- Device-local state (never synced).
CREATE TABLE IF NOT EXISTS bookmarks (
  id        TEXT PRIMARY KEY REFERENCES hadith(id) ON DELETE CASCADE,
  added_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  id        TEXT PRIMARY KEY REFERENCES hadith(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Exactly one row (id = 1).
CREATE TABLE IF NOT EXISTS sync_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  cursor         TEXT,                       -- number of the last data build applied
  schema_version INTEGER NOT NULL,
  snapshot_built_at TEXT,
  last_sync_at   TEXT,
  last_result    TEXT                        -- 'ok' | 'error: ...'
);
