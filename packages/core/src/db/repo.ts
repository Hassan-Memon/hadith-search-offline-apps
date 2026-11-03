// Reads and writes against the shared schema. All SQL lives here so the UIs
// never embed queries.
import { normalize } from '../normalize.js';
import { stripHtml } from '../html.js';
import type {
  AnnouncementRecord,
  BookCount,
  FileRecord,
  HadithDoc,
  HadithListItem,
  HadithRow,
  SyncState,
  TagCount,
} from '../types.js';
import type { DbAdapter } from './adapter.js';

export const LIST_COLUMNS = 'id, slug, book, title_html, title_text, hukm_html, updated_at';

/** Convert an API document into the row + FTS row and write both. */
export async function upsertHadith(db: DbAdapter, doc: HadithDoc): Promise<void> {
  const titleText = stripHtml(doc.title);
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  await db.run(
    `INSERT INTO hadith (id, slug, book, type, title_html, title_text, hukm_html, html_content,
       raw_content, references_html, tags_json, authored_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug, book = excluded.book, type = excluded.type,
       title_html = excluded.title_html, title_text = excluded.title_text,
       hukm_html = excluded.hukm_html, html_content = excluded.html_content,
       raw_content = excluded.raw_content, references_html = excluded.references_html,
       tags_json = excluded.tags_json, authored_at = excluded.authored_at,
       created_at = excluded.created_at, updated_at = excluded.updated_at`,
    [
      doc.id,
      doc.slug,
      doc.book ?? '',
      doc.type ?? null,
      doc.title ?? '',
      titleText,
      doc.hukm ?? null,
      doc.html_content ?? '[]',
      // Not stored: the sections hold the same text (keeps the database
      // small, same as the server-built snapshot). It is indexed below.
      '',
      doc.references ?? null,
      JSON.stringify(tags),
      doc.authored_at ?? null,
      doc.created_at ?? null,
      doc.updated_at,
    ],
  );
  // A slug can move between documents (admin edit); keep slugs unique.
  await db.run('DELETE FROM hadith WHERE slug = ? AND id <> ?', [doc.slug, doc.id]);
  await db.run('DELETE FROM hadith_fts WHERE id = ?', [doc.id]);
  await db.run('INSERT INTO hadith_fts (id, title, body, hukm, book, tags) VALUES (?, ?, ?, ?, ?, ?)', [
    doc.id,
    normalize(titleText),
    // raw_content only: the same field the website searches.
    normalize(doc.raw_content ?? ''),
    normalize(stripHtml(doc.hukm)),
    normalize(doc.book ?? ''),
    normalize(tags.join(' ')),
  ]);
}

export async function deleteHadith(db: DbAdapter, id: string): Promise<void> {
  await db.run('DELETE FROM hadith_fts WHERE id = ?', [id]);
  await db.run('DELETE FROM hadith WHERE id = ?', [id]);
}

export async function countHadith(db: DbAdapter): Promise<number> {
  const row = await db.get<{ c: number }>('SELECT count(*) AS c FROM hadith');
  return Number(row?.c ?? 0);
}

export async function getHadithBySlug(db: DbAdapter, slug: string): Promise<HadithRow | undefined> {
  return db.get<HadithRow>('SELECT * FROM hadith WHERE slug = ?', [slug]);
}

export async function getHadithById(db: DbAdapter, id: string): Promise<HadithRow | undefined> {
  return db.get<HadithRow>('SELECT * FROM hadith WHERE id = ?', [id]);
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  book?: string;
  tag?: string;
  /** 'index' = stored order (rowid, like the website), 'title' = alphabetical. */
  order?: 'index' | 'title';
}

export async function listHadith(
  db: DbAdapter,
  { page = 1, pageSize = 10, book, tag, order = 'index' }: ListOptions = {},
): Promise<{ total: number; items: HadithListItem[] }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (book) {
    where.push('book = ?');
    params.push(book);
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(hadith.tags_json) WHERE value = ?)');
    params.push(tag);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = order === 'title' ? 'ORDER BY title_text' : 'ORDER BY rowid';
  const total = Number(
    (await db.get<{ c: number }>(`SELECT count(*) AS c FROM hadith ${whereSql}`, params))?.c ?? 0,
  );
  const items = await db.all<HadithListItem>(
    `SELECT ${LIST_COLUMNS} FROM hadith ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...params, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { total, items };
}

export async function listBooks(db: DbAdapter): Promise<BookCount[]> {
  return db.all<BookCount>('SELECT book, count(*) AS count FROM hadith GROUP BY book ORDER BY count DESC');
}

export async function listTags(db: DbAdapter): Promise<TagCount[]> {
  return db.all<TagCount>(
    `SELECT value AS tag, count(*) AS count FROM hadith, json_each(hadith.tags_json)
     GROUP BY value ORDER BY count DESC, tag`,
  );
}

/** Up to `limit` other hadith from the same book (cheap "related" list). */
export async function relatedHadith(db: DbAdapter, id: string, book: string, limit = 5): Promise<HadithListItem[]> {
  return db.all<HadithListItem>(
    `SELECT ${LIST_COLUMNS} FROM hadith WHERE book = ? AND id <> ?
     ORDER BY abs(rowid - (SELECT rowid FROM hadith WHERE id = ?)) LIMIT ?`,
    [book, id, id, limit],
  );
}

// ---- sync state ------------------------------------------------------------

export async function getSyncState(db: DbAdapter): Promise<SyncState> {
  const row = await db.get<SyncState>(
    'SELECT cursor, schema_version, snapshot_built_at, last_sync_at, last_result FROM sync_state WHERE id = 1',
  );
  return (
    row ?? { cursor: null, schema_version: 0, snapshot_built_at: null, last_sync_at: null, last_result: null }
  );
}

export async function setCursor(db: DbAdapter, cursor: string): Promise<void> {
  await db.run('UPDATE sync_state SET cursor = ? WHERE id = 1', [cursor]);
}

export async function setSyncResult(db: DbAdapter, result: string, at = new Date().toISOString()): Promise<void> {
  await db.run('UPDATE sync_state SET last_sync_at = ?, last_result = ? WHERE id = 1', [at, result]);
}

// ---- announcements & files -------------------------------------------------

export async function replaceAnnouncements(db: DbAdapter, records: AnnouncementRecord[]): Promise<void> {
  const seen = await db.all<{ id: string; seen_at: string | null }>('SELECT id, seen_at FROM announcements');
  const seenAt = new Map(seen.map((r) => [r.id, r.seen_at]));
  await db.run('DELETE FROM announcements');
  for (const record of records) {
    await db.run(
      'INSERT INTO announcements (id, kind, payload, active, created_at, seen_at) VALUES (?, ?, ?, 1, ?, ?)',
      [
        record.id,
        String(record.type ?? ''),
        JSON.stringify(record),
        typeof record.createdAt === 'string' ? record.createdAt : null,
        seenAt.get(record.id) ?? null,
      ],
    );
  }
}

export async function listAnnouncements(db: DbAdapter): Promise<(AnnouncementRecord & { seen_at: string | null })[]> {
  const rows = await db.all<{ payload: string; seen_at: string | null }>(
    'SELECT payload, seen_at FROM announcements WHERE active = 1 ORDER BY created_at DESC',
  );
  return rows.map((r) => ({ ...(JSON.parse(r.payload) as AnnouncementRecord), seen_at: r.seen_at }));
}

export async function markAnnouncementSeen(db: DbAdapter, id: string): Promise<void> {
  await db.run('UPDATE announcements SET seen_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

export async function replaceFiles(db: DbAdapter, records: FileRecord[]): Promise<void> {
  const local = await db.all<{ id: string; local_path: string | null; downloaded_at: string | null }>(
    'SELECT id, local_path, downloaded_at FROM files',
  );
  const keep = new Map(local.map((r) => [r.id, r]));
  await db.run('DELETE FROM files');
  for (const record of records) {
    const prev = keep.get(record.id);
    await db.run(
      'INSERT INTO files (id, name, url, image_url, bytes, local_path, downloaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        record.id,
        record.file?.name ?? '',
        record.file?.url ?? '',
        record.image?.url ?? null,
        typeof record.file?.size === 'number' ? record.file.size : null,
        prev?.local_path ?? null,
        prev?.downloaded_at ?? null,
      ],
    );
  }
}

export interface FileRow {
  id: string;
  name: string;
  url: string;
  image_url: string | null;
  bytes: number | null;
  local_path: string | null;
  downloaded_at: string | null;
}

export async function listFiles(db: DbAdapter): Promise<FileRow[]> {
  return db.all<FileRow>('SELECT * FROM files ORDER BY name');
}

export async function setFileDownloaded(db: DbAdapter, id: string, localPath: string | null): Promise<void> {
  await db.run('UPDATE files SET local_path = ?, downloaded_at = ? WHERE id = ?', [
    localPath,
    localPath ? new Date().toISOString() : null,
    id,
  ]);
}

// ---- device-local --------------------------------------------------------------

export async function toggleBookmark(db: DbAdapter, id: string): Promise<boolean> {
  const existing = await db.get('SELECT id FROM bookmarks WHERE id = ?', [id]);
  if (existing) {
    await db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
    return false;
  }
  await db.run('INSERT INTO bookmarks (id, added_at) VALUES (?, ?)', [id, new Date().toISOString()]);
  return true;
}

export async function isBookmarked(db: DbAdapter, id: string): Promise<boolean> {
  return Boolean(await db.get('SELECT id FROM bookmarks WHERE id = ?', [id]));
}

export async function listBookmarks(db: DbAdapter): Promise<HadithListItem[]> {
  return db.all<HadithListItem>(
    `SELECT ${LIST_COLUMNS.split(', ')
      .map((c) => `h.${c}`)
      .join(', ')} FROM bookmarks b JOIN hadith h ON h.id = b.id ORDER BY b.added_at DESC`,
  );
}

export async function recordVisit(db: DbAdapter, id: string): Promise<void> {
  await db.run(
    `INSERT INTO history (id, opened_at) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET opened_at = excluded.opened_at`,
    [id, new Date().toISOString()],
  );
  // Keep the list short.
  await db.run(
    'DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY opened_at DESC LIMIT 100)',
  );
}

export async function listHistory(db: DbAdapter, limit = 20): Promise<HadithListItem[]> {
  return db.all<HadithListItem>(
    `SELECT ${LIST_COLUMNS.split(', ')
      .map((c) => `h.${c}`)
      .join(', ')} FROM history v JOIN hadith h ON h.id = v.id ORDER BY v.opened_at DESC LIMIT ?`,
    [limit],
  );
}

export async function getSetting(db: DbAdapter, key: string): Promise<string | null> {
  const row = await db.get<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: DbAdapter, key: string, value: string | null): Promise<void> {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
