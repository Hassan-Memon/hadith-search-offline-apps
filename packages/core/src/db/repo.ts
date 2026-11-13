// Reads and writes against the shared schema. All SQL lives here so the UIs
// never embed queries.
import { normalize } from '../normalize.js';
import { stripHtml } from '../html.js';
import type {
  AnnouncementRecord,
  BookCount,
  ChapterCount,
  FileRecord,
  HadithDoc,
  HadithListItem,
  HadithRow,
  MetaUpdate,
  Narrator,
  NarratorRef,
  Registry,
  SyncState,
  TagCount,
} from '../types.js';
import type { DbAdapter } from './adapter.js';

export const LIST_COLUMNS = 'id, slug, book, title_html, title_text, hukm_html, chapter, updated_at';

/** A book's name and its other stored spellings (from the book registry). */
export async function bookSpellings(db: DbAdapter, name: string): Promise<string[]> {
  const rows = await db.all<{ spelling: string }>('SELECT spelling FROM book_spelling WHERE name = ?', [name]);
  return [...new Set([name, ...rows.map((r) => r.spelling)])];
}

/** `h.book IN (…)` for the given spellings (a plain list is far cheaper than a subquery per search). */
export const bookFilter = (spellings: string[]) => `h.book IN (${spellings.map(() => '?').join(', ')})`;

const prefixed = (alias: string) =>
  LIST_COLUMNS.split(', ')
    .map((c) => `${alias}.${c}`)
    .join(', ');

export function narratorRefs(refs: unknown): NarratorRef[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .filter((r): r is NarratorRef => Boolean(r) && typeof (r as NarratorRef).slug === 'string')
    .map((r) => ({ slug: r.slug, start: Number(r.start) || 0, end: Number(r.end ?? r.start) || 0 }));
}

/** Convert an API document into the row + FTS row and write both. */
export async function upsertHadith(db: DbAdapter, doc: HadithDoc): Promise<void> {
  const titleText = stripHtml(doc.title);
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  await db.run(
    `INSERT INTO hadith (id, slug, book, type, title_html, title_text, hukm_html, html_content,
       raw_content, references_html, tags_json, chapter, narrators_json, authored_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug, book = excluded.book, type = excluded.type,
       title_html = excluded.title_html, title_text = excluded.title_text,
       hukm_html = excluded.hukm_html, html_content = excluded.html_content,
       raw_content = excluded.raw_content, references_html = excluded.references_html,
       tags_json = excluded.tags_json, chapter = excluded.chapter,
       narrators_json = excluded.narrators_json, authored_at = excluded.authored_at,
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
      doc.chapter || null,
      JSON.stringify(narratorRefs(doc.narrators)),
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

/** The website moved a hadith to another باب or dated it, without touching the text. */
export async function updateHadithMeta(db: DbAdapter, meta: MetaUpdate): Promise<void> {
  await db.run('UPDATE hadith SET chapter = ?, authored_at = ? WHERE id = ?', [
    meta.chapter || null,
    meta.authored_at ?? null,
    meta.id,
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
  chapter?: string;
  tag?: string;
  /** 'index' = stored order (rowid, like the website), 'title' = alphabetical. */
  order?: 'index' | 'title';
}

export async function listHadith(
  db: DbAdapter,
  { page = 1, pageSize = 10, book, chapter, tag, order = 'index' }: ListOptions = {},
): Promise<{ total: number; items: HadithListItem[] }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (book) {
    const spellings = await bookSpellings(db, book);
    where.push(bookFilter(spellings));
    params.push(...spellings);
  }
  if (chapter) {
    where.push('h.chapter = ?');
    params.push(chapter);
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(h.tags_json) WHERE value = ?)');
    params.push(tag);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = order === 'title' ? 'ORDER BY h.title_text' : 'ORDER BY h.rowid';
  const total = Number(
    (await db.get<{ c: number }>(`SELECT count(*) AS c FROM hadith h ${whereSql}`, params))?.c ?? 0,
  );
  const items = await db.all<HadithListItem>(
    `SELECT ${prefixed('h')} FROM hadith h ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...params, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { total, items };
}

/** Books with their counts in the website's order; other spellings of a book count as that book. */
export async function listBooks(db: DbAdapter): Promise<BookCount[]> {
  return db.all<BookCount>(
    `SELECT coalesce(s.name, h.book) AS book, count(*) AS count, b.volume_no, b.sort_order,
       b.is_series, b.published_at, b.pdf_pages
     FROM hadith h
     LEFT JOIN book_spelling s ON s.spelling = h.book
     LEFT JOIN books b ON b.name = coalesce(s.name, h.book)
     GROUP BY coalesce(s.name, h.book)
     ORDER BY b.sort_order IS NULL, b.sort_order, count(*) DESC`,
  );
}

/** A book's registry entry, found by its name or another spelling. */
export async function getBook(db: DbAdapter, spelling: string): Promise<BookCount | undefined> {
  return db.get<BookCount>(
    `SELECT b.name AS book, b.volume_no, b.sort_order, b.is_series, b.published_at, b.pdf_pages, 0 AS count
     FROM book_spelling s JOIN books b ON b.name = s.name WHERE s.spelling = ?`,
    [spelling],
  );
}

/** Chapters in the website's order, with how many hadith each has. */
export async function listChapters(db: DbAdapter): Promise<ChapterCount[]> {
  return db.all<ChapterCount>(
    `SELECT c.slug, c.name, c.parent, c.sort_order, c.description, count(h.id) AS count
     FROM chapters c LEFT JOIN hadith h ON h.chapter = c.slug
     GROUP BY c.slug ORDER BY c.sort_order IS NULL, c.sort_order, c.name`,
  );
}

export async function getChapter(db: DbAdapter, slug: string): Promise<ChapterCount | undefined> {
  return db.get<ChapterCount>(
    `SELECT c.slug, c.name, c.parent, c.sort_order, c.description,
       (SELECT count(*) FROM hadith h WHERE h.chapter = c.slug) AS count
     FROM chapters c WHERE c.slug = ?`,
    [slug],
  );
}

/**
 * One hadith from each chapter («ہر باب سے ایک روایت»). The same seed gives
 * the same picks and order, so a list does not reshuffle while it is read.
 */
/**
 * The chapter of prefaces, introductions and method notes (مقدمہ, a scholar's
 * تعارف, مراتبِ جرح …). They are stored like narrations but are not ones, so
 * lists of narrations (the per-chapter samples, «متعلقہ روایات») leave them
 * out, as the website does since 13 Nov 2026. The chapter keeps its own page.
 */
export const INTRO_CHAPTER = 'مقدمات-و-تعارف';

export async function chapterSamples(
  db: DbAdapter,
  seed: number,
): Promise<(HadithListItem & { chapter_name: string })[]> {
  const s = (Math.abs(Math.trunc(seed)) % 997) + 1;
  return db.all(
    `SELECT ${prefixed('h')}, c.name AS chapter_name
     FROM chapters c JOIN hadith h ON h.rowid = (
       SELECT rowid FROM hadith WHERE chapter = c.slug ORDER BY (rowid * ?) % 1009, rowid LIMIT 1)
     WHERE c.slug <> ?
     ORDER BY (c.rowid * ?) % 1013, c.rowid`,
    [s, INTRO_CHAPTER, s],
  );
}

export async function listTags(db: DbAdapter): Promise<TagCount[]> {
  return db.all<TagCount>(
    `SELECT value AS tag, count(*) AS count FROM hadith, json_each(hadith.tags_json)
     GROUP BY value ORDER BY count DESC, tag`,
  );
}

/**
 * Up to `limit` related hadith, picked the way the website picks them: the
 * same باب from any book first, then neighbours in the same book.
 */
export async function relatedHadith(
  db: DbAdapter,
  id: string,
  book: string,
  limit = 5,
  chapter?: string | null,
): Promise<HadithListItem[]> {
  const ch = chapter || null;
  const spellings = await bookSpellings(db, book);
  return db.all<HadithListItem>(
    `SELECT ${LIST_COLUMNS} FROM (
       SELECT ${prefixed('h')}, 0 AS grp, h.rowid AS r FROM hadith h
       WHERE ? IS NOT NULL AND h.chapter = ? AND h.id <> ?
       UNION ALL
       SELECT ${prefixed('h')}, 1, h.rowid FROM hadith h
       WHERE ${bookFilter(spellings)} AND h.id <> ? AND (? IS NULL OR h.chapter IS NOT ?)
         -- A narration is not offered a preface as related (a preface may be).
         AND (? = ? OR h.chapter IS NOT ?)
     )
     ORDER BY grp, abs(r - (SELECT rowid FROM hadith WHERE id = ?)) LIMIT ?`,
    [ch, ch, id, ...spellings, id, ch, ch, ch ?? '', INTRO_CHAPTER, INTRO_CHAPTER, id, limit],
  );
}

// ---- narrators ---------------------------------------------------------------

interface NarratorDbRow {
  slug: string;
  name: string;
  arabic_name: string | null;
  aliases_json: string;
  death_note: string | null;
  death_year: number | null;
  century: number | null;
  excerpt: string | null;
}

function jsonList(value: string | null | undefined): string[] {
  try {
    const list = JSON.parse(value ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const toNarrator = (r: NarratorDbRow): Narrator => ({
  slug: r.slug,
  name: r.name,
  arabic_name: r.arabic_name ?? null,
  aliases: jsonList(r.aliases_json),
  death_note: r.death_note,
  death_year: r.death_year,
  century: r.century,
  excerpt: r.excerpt ?? null,
});

/**
 * The key a narrator is sorted under, as the website sorts: his Arabic name
 * (his Urdu name until he has one) without diacritics, spaces or punctuation,
 * with the Arabic and Urdu forms of a letter made the same.
 */
export const narratorSortKey = (n: Pick<Narrator, 'name' | 'arabic_name'>): string =>
  normalize(n.arabic_name || n.name).replace(/[^\p{L}\p{N}]/gu, '');

export interface NarratorListItem extends Narrator {
  study_count: number;
  hadith_count: number;
}

/** Every narrator with a study on this device, in the order of the book's «فہرستِ رُوات». */
export async function listNarrators(db: DbAdapter): Promise<NarratorListItem[]> {
  const counts = await db.all<{ slug: string; studies: number; hadith: number }>(
    `SELECT json_extract(j.value, '$.slug') AS slug, count(*) AS studies, count(DISTINCT h.id) AS hadith
     FROM hadith h, json_each(h.narrators_json) j WHERE h.narrators_json <> '[]' GROUP BY 1`,
  );
  const bySlug = new Map(counts.map((c) => [c.slug, c]));
  const rows = await db.all<NarratorDbRow>('SELECT * FROM narrators');
  return rows
    .map((r) => ({
      ...toNarrator(r),
      study_count: Number(bySlug.get(r.slug)?.studies ?? 0),
      hadith_count: Number(bySlug.get(r.slug)?.hadith ?? 0),
    }))
    .filter((n) => n.study_count > 0)
    .map((n) => ({ n, key: narratorSortKey(n) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ n }) => n);
}

/** How many studies there are and in how many narrations (each counted once). */
export async function narratorTotals(db: DbAdapter): Promise<{ studies: number; hadith: number }> {
  const row = await db.get<{ studies: number; hadith: number }>(
    `SELECT count(*) AS studies, count(DISTINCT h.id) AS hadith
     FROM hadith h, json_each(h.narrators_json) j
     WHERE h.narrators_json <> '[]' AND json_extract(j.value, '$.slug') IN (SELECT slug FROM narrators)`,
  );
  return { studies: Number(row?.studies ?? 0), hadith: Number(row?.hadith ?? 0) };
}

/**
 * One narrator. Spellings the website merged into one narrator (they share an
 * Arabic name) keep their old addresses: a slug that is no longer a narrator
 * finds the narrator who has it as another spelling.
 */
export async function getNarrator(db: DbAdapter, slug: string): Promise<Narrator | undefined> {
  const row = await db.get<NarratorDbRow>('SELECT * FROM narrators WHERE slug = ?', [slug]);
  if (row) return toNarrator(row);
  const wanted = normalize(slug.replace(/-/g, ' ')).replace(/\s+/g, '');
  if (!wanted) return undefined;
  const rows = await db.all<NarratorDbRow>("SELECT * FROM narrators WHERE aliases_json <> '[]'");
  const old = rows.find((r) => jsonList(r.aliases_json).some((a) => normalize(a).replace(/\s+/g, '') === wanted));
  return old ? toNarrator(old) : undefined;
}

/** A book's place among the books, higher being later (see `latestFirst`). */
export type BookRank = [number, number, string];

export interface NarratorStudy {
  hadith: HadithListItem & { html_content: string; references_html: string | null };
  /** Sections start…end (inclusive) of the narration are the study. */
  start: number;
  end: number;
  rank: BookRank;
}

/**
 * A book's rank as the website ranks it: the volumes of the series come after
 * the other books whatever their dates, in volume order; the other books go
 * by publication date. A book the registry does not know comes first.
 */
function bookRank(b: { is_series: number | null; volume_no: number | null; published_at: string | null }): BookRank {
  if (b.is_series == null) return [-1, 0, ''];
  if (b.is_series && b.volume_no) return [1, b.volume_no, ''];
  return [0, 0, b.published_at ?? ''];
}

const compareRank = (a: BookRank, b: BookRank) =>
  a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);

/**
 * A narrator's studies, the one the website shows first: the latest volume,
 * and within one volume the fullest study. `chars` gives a study's length
 * (the caller parses the sections anyway).
 */
export function latestFirst<T extends { rank: BookRank }>(studies: T[], chars: (s: T) => number): T[] {
  return studies
    .map((s) => ({ s, c: chars(s) }))
    .sort((a, b) => compareRank(b.s.rank, a.s.rank) || b.c - a.c)
    .map(({ s }) => s);
}

/** Every study of one narrator: which sections of which narrations, with each narration's book rank. */
export async function narratorStudies(db: DbAdapter, slug: string): Promise<NarratorStudy[]> {
  const rows = await db.all<
    HadithListItem & {
      html_content: string;
      references_html: string | null;
      s: number;
      e: number;
      is_series: number | null;
      volume_no: number | null;
      published_at: string | null;
    }
  >(
    `SELECT ${prefixed('h')}, h.html_content, h.references_html,
       json_extract(j.value, '$.start') AS s, json_extract(j.value, '$.end') AS e,
       b.is_series, b.volume_no, b.published_at
     FROM hadith h
     JOIN json_each(h.narrators_json) j
     LEFT JOIN book_spelling bs ON bs.spelling = h.book
     LEFT JOIN books b ON b.name = bs.name
     WHERE h.narrators_json <> '[]' AND json_extract(j.value, '$.slug') = ?
     ORDER BY h.rowid, s`,
    [slug],
  );
  const seen = new Set<string>();
  const out: NarratorStudy[] = [];
  for (const { s, e, is_series, volume_no, published_at, ...hadith } of rows) {
    // Keep one row per study whatever the joins found.
    const key = `${hadith.id}:${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ hadith, start: Number(s), end: Number(e), rank: bookRank({ is_series, volume_no, published_at }) });
  }
  return out;
}

/**
 * The other narrators studied in the same narrations as this one, most shared
 * first (the website's «اسی روایت کے دیگر روات» / «انہی روایات کے دیگر روات»),
 * with how many narrations discuss each, for their cards.
 */
export async function relatedNarrators(db: DbAdapter, slug: string, limit = 12): Promise<NarratorListItem[]> {
  const rows = await db.all<NarratorDbRow & { shared: number }>(
    `SELECT n.*, count(DISTINCT h.id) AS shared
     FROM hadith h
     JOIN json_each(h.narrators_json) a
     JOIN json_each(h.narrators_json) b
     JOIN narrators n ON n.slug = json_extract(b.value, '$.slug')
     WHERE h.narrators_json <> '[]' AND json_extract(a.value, '$.slug') = ? AND n.slug <> ?
     GROUP BY n.slug
     ORDER BY shared DESC
     LIMIT ?`,
    [slug, slug, limit],
  );
  if (rows.length === 0) return [];
  const counts = await db.all<{ slug: string; studies: number; hadith: number }>(
    `SELECT json_extract(j.value, '$.slug') AS slug, count(*) AS studies, count(DISTINCT h.id) AS hadith
     FROM hadith h, json_each(h.narrators_json) j
     WHERE h.narrators_json <> '[]' AND json_extract(j.value, '$.slug') IN (${rows.map(() => '?').join(', ')})
     GROUP BY 1`,
    rows.map((r) => r.slug),
  );
  const bySlug = new Map(counts.map((c) => [c.slug, c]));
  return rows
    .map(({ shared, ...r }) => ({ r: toNarrator(r), shared }))
    .sort((a, b) => b.shared - a.shared || (narratorSortKey(a.r) < narratorSortKey(b.r) ? -1 : 1))
    .map(({ r }) => ({
      ...r,
      study_count: Number(bySlug.get(r.slug)?.studies ?? 0),
      hadith_count: Number(bySlug.get(r.slug)?.hadith ?? 0),
    }));
}

/** The narrators studied in one narration, with their names, in the order of the text. */
export async function hadithNarrators(
  db: DbAdapter,
  narratorsJson: string | null | undefined,
): Promise<(NarratorRef & { name: string; arabic_name: string | null })[]> {
  let refs: NarratorRef[];
  try {
    refs = narratorRefs(JSON.parse(narratorsJson ?? '[]'));
  } catch {
    return [];
  }
  if (refs.length === 0) return [];
  const names = await db.all<{ slug: string; name: string; arabic_name: string | null }>(
    `SELECT slug, name, arabic_name FROM narrators WHERE slug IN (${refs.map(() => '?').join(', ')})`,
    refs.map((r) => r.slug),
  );
  const bySlug = new Map(names.map((n) => [n.slug, n]));
  return refs
    .filter((r) => bySlug.has(r.slug))
    .map((r) => ({ ...r, name: bySlug.get(r.slug)!.name, arabic_name: bySlug.get(r.slug)!.arabic_name ?? null }));
}

// ---- registries --------------------------------------------------------------

/** Replace the book, chapter and narrator registries (call inside a transaction). */
export async function replaceRegistry(db: DbAdapter, registry: Registry): Promise<void> {
  await db.run('DELETE FROM books');
  for (const b of registry.books ?? []) {
    await db.run(
      `INSERT OR REPLACE INTO books (name, volume_no, sort_order, is_series, published_at, aliases_json, pdf_pages)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name,
        b.volume_no ?? null,
        b.sort_order ?? null,
        b.is_series ? 1 : 0,
        b.published_at ?? null,
        JSON.stringify(b.aliases ?? []),
        b.pdf_pages ? 1 : 0,
      ],
    );
  }
  await db.run('DELETE FROM chapters');
  for (const c of registry.chapters ?? []) {
    await db.run('INSERT OR REPLACE INTO chapters (slug, name, parent, sort_order, description) VALUES (?, ?, ?, ?, ?)', [
      c.slug,
      c.name,
      c.parent ?? null,
      c.sort_order ?? null,
      c.description ?? null,
    ]);
  }
  await db.run('DELETE FROM narrators');
  for (const n of registry.narrators ?? []) {
    await db.run(
      `INSERT OR REPLACE INTO narrators (slug, name, aliases_json, death_note, death_year, century, arabic_name, excerpt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        n.slug,
        n.name,
        JSON.stringify(n.aliases ?? []),
        n.death_note || null,
        n.death_year ?? null,
        n.century ?? null,
        n.arabic_name || null,
        n.excerpt || null,
      ],
    );
  }
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
        // The book's name when the registry links a book to this file.
        (typeof record.book === 'string' && record.book) || record.file?.name || '',
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
  // In the order published (the website's book order, see the data builder).
  return db.all<FileRow>('SELECT * FROM files ORDER BY rowid');
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
    `SELECT ${prefixed('h')} FROM bookmarks b JOIN hadith h ON h.id = b.id ORDER BY b.added_at DESC`,
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
    `SELECT ${prefixed('h')} FROM history v JOIN hadith h ON h.id = v.id ORDER BY v.opened_at DESC LIMIT ?`,
    [limit],
  );
}

/** What the reader made on this device and must survive a snapshot install. */
export interface DeviceData {
  bookmarks: { id: string; added_at: string }[];
  history: { id: string; opened_at: string }[];
  seenAnnouncements: { id: string; seen_at: string }[];
}

export async function exportDeviceData(db: DbAdapter): Promise<DeviceData> {
  return {
    bookmarks: await db.all('SELECT id, added_at FROM bookmarks'),
    history: await db.all('SELECT id, opened_at FROM history'),
    seenAnnouncements: await db.all('SELECT id, seen_at FROM announcements WHERE seen_at IS NOT NULL'),
  };
}

/** Put device data back after the database file was replaced. Rows for hadith the new data no longer has are dropped. */
export async function restoreDeviceData(db: DbAdapter, data: DeviceData): Promise<void> {
  await db.transaction(async () => {
    for (const b of data.bookmarks) {
      await db.run(
        'INSERT OR IGNORE INTO bookmarks (id, added_at) SELECT id, ? FROM hadith WHERE id = ?',
        [b.added_at, b.id],
      );
    }
    for (const h of data.history) {
      await db.run(
        `INSERT INTO history (id, opened_at) SELECT id, ? FROM hadith WHERE id = ?
         ON CONFLICT(id) DO UPDATE SET opened_at = max(opened_at, excluded.opened_at)`,
        [h.opened_at, h.id],
      );
    }
    for (const a of data.seenAnnouncements) {
      await db.run('UPDATE announcements SET seen_at = ? WHERE id = ?', [a.seen_at, a.id]);
    }
  });
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
