import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NodeSqliteAdapter } from '../src/adapters/node.js';
import { groupBooks } from '../src/books.js';
import { ensureSchema, SCHEMA_VERSION } from '../src/db/migrate.js';
import {
  countHadith,
  deleteHadith,
  getHadithBySlug,
  listBooks,
  listChapters,
  listBookmarks,
  listHadith,
  listTags,
  recordVisit,
  listHistory,
  toggleBookmark,
  upsertHadith,
} from '../src/db/repo.js';
import { highlightRanges, searchHadith, splitForHighlight } from '../src/search.js';
import type { HadithDoc } from '../src/types.js';

const BOOK1 = 'غیر معتبر روایات کا فنی جائزہ (حصہ اول)';
const BOOK8 = 'غیر معتبر روایات کافنی جائزہ (حصہ ہشتم)';
const OTHER = 'حضرت حکیم الامت مولانا اشرف علی تھانوی صاحب رحمۃ اللہ علیہ کا من گھڑت روایات پر تعاقب';

function doc(partial: Partial<HadithDoc> & { id: string; slug: string }): HadithDoc {
  return {
    title: `<p><span class="font-class-Jameel-Noori-Nastaleeq">${partial.slug}</span></p>`,
    book: BOOK1,
    type: 'فصل اول',
    html_content: JSON.stringify([{ heading: 'تفصیل', content: `<p>${partial.raw_content ?? ''}</p>` }]),
    raw_content: '',
    tags: [partial.book ?? BOOK1],
    updated_at: '2026-10-28T13:54:55.655Z',
    ...partial,
  };
}

const DOCS: HadithDoc[] = [
  doc({ id: 'a', slug: 'نماز-جنازہ', raw_content: 'نمازِ جنازہ کے بعد دعا کی روایت موضوع ہے', hukm: '<p>موضوع</p>' }),
  doc({ id: 'b', slug: 'جنازہ-کا-بیان', raw_content: 'جنازہ کے بیان میں ایک ضعیف روایت' }),
  doc({ id: 'c', slug: 'نماز-کی-فضیلت', raw_content: 'نماز کی فضیلت میں مشہور روایت لا اصل لہ', book: BOOK8, tags: [BOOK8] }),
  doc({ id: 'd', slug: 'روزہ', raw_content: 'روزے کی حالت میں مسواک', book: OTHER, tags: [OTHER, 'روزہ'] }),
];

async function freshDb() {
  const db = new NodeSqliteAdapter(':memory:');
  await ensureSchema(db);
  for (const d of DOCS) await upsertHadith(db, d);
  return db;
}

test('schema is created and versioned', async () => {
  const db = new NodeSqliteAdapter(':memory:');
  const r = await ensureSchema(db);
  assert.equal(r.to, SCHEMA_VERSION);
  const again = await ensureSchema(db); // idempotent
  assert.equal(again.from, SCHEMA_VERSION);
  db.close();
});

test('upsert, list, books, tags, delete', async () => {
  const db = await freshDb();
  assert.equal(await countHadith(db), 4);
  const row = await getHadithBySlug(db, 'نماز-جنازہ');
  assert.equal(row?.id, 'a');
  assert.equal(row?.title_text, 'نماز-جنازہ');

  const all = await listHadith(db, { pageSize: 2 });
  assert.equal(all.total, 4);
  assert.equal(all.items.length, 2);
  const byBook = await listHadith(db, { book: BOOK8 });
  assert.deepEqual(byBook.items.map((i) => i.id), ['c']);
  const byTag = await listHadith(db, { tag: 'روزہ' });
  assert.deepEqual(byTag.items.map((i) => i.id), ['d']);

  const books = await listBooks(db);
  assert.equal(books.length, 3);
  const groups = groupBooks(books);
  assert.deepEqual(groups.series.map((s) => s.volume), [1, 8]);
  assert.equal(groups.others[0]?.book, OTHER);

  const tags = await listTags(db);
  assert.ok(tags.some((t) => t.tag === 'روزہ' && t.count === 1));

  // Re-upsert with changed slug keeps one row and updates FTS.
  await upsertHadith(db, doc({ id: 'a', slug: 'نماز-جنازہ-نیا', raw_content: 'نیا متن' }));
  assert.equal(await countHadith(db), 4);
  assert.equal((await searchHadith(db, 'نیا')).hits[0]?.id, 'a');

  await deleteHadith(db, 'a');
  assert.equal(await countHadith(db), 3);
  assert.equal((await searchHadith(db, 'نیا')).total, 0);
  db.close();
});

test('search ranks phrase, then all words, then any word; normalisation applies', async () => {
  const db = await freshDb();
  const r = await searchHadith(db, 'نماز جنازہ');
  // a: phrase «نماز جنازہ» (original has نمازِ with kasra); b and c: one word each.
  assert.deepEqual(r.hits[0], { ...r.hits[0], id: 'a', tier: 0 });
  assert.deepEqual(r.hits.slice(1).map((h) => h.tier), [2, 2]);
  assert.deepEqual(r.hits.slice(1).map((h) => h.id).sort(), ['b', 'c']);
  // Tatweel/kasra-insensitive: «نمــاز» finds both documents with نماز (a and c).
  assert.equal((await searchHadith(db, 'نمــاز')).total, 2);
  assert.equal((await searchHadith(db, 'روزہ')).total, 1);
  // Prefix on the last token.
  assert.equal((await searchHadith(db, 'جناز')).total, 2);
  // Filters.
  assert.deepEqual((await searchHadith(db, 'نماز', { book: BOOK8 })).hits.map((h) => h.id), ['c']);
  // Empty query.
  assert.equal((await searchHadith(db, '  ')).total, 0);
  // Snippet contains the original (with kasra) text.
  assert.match(r.hits[0]!.snippet, /نمازِ جنازہ/);
  db.close();
});

test('highlight ranges land on the original text', () => {
  const original = 'یہ نَمَازِ جنازہ کی روایت ہے';
  const ranges = highlightRanges(original, 'نماز جنازہ');
  assert.equal(ranges.length, 1);
  assert.equal(original.slice(ranges[0]!.start, ranges[0]!.end), 'نَمَازِ جنازہ');
  const parts = splitForHighlight(original, 'روایت');
  assert.deepEqual(parts.map((p) => p.highlight), [false, true, false]);
  assert.equal(parts[1]!.text, 'روایت');
});

test('bookmarks and history', async () => {
  const db = await freshDb();
  assert.equal(await toggleBookmark(db, 'a'), true);
  assert.equal(await toggleBookmark(db, 'c'), true);
  assert.equal((await listBookmarks(db)).length, 2);
  assert.equal(await toggleBookmark(db, 'a'), false);
  assert.equal((await listBookmarks(db)).length, 1);
  await recordVisit(db, 'b');
  await recordVisit(db, 'd');
  await recordVisit(db, 'b');
  assert.deepEqual((await listHistory(db)).map((h) => h.id), ['b', 'd']);
  // Deleting a hadith cascades to bookmarks/history.
  await deleteHadith(db, 'c');
  assert.equal((await listBookmarks(db)).length, 0);
  db.close();
});

test('a version 1 database (app 1.1) upgrades to version 2 and keeps its rows', async () => {
  const db = new NodeSqliteAdapter(':memory:');
  // The hadith table of schema version 1, with a row and a bookmark in it.
  await db.exec(`
    CREATE TABLE hadith (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, book TEXT NOT NULL DEFAULT '', type TEXT,
      title_html TEXT NOT NULL DEFAULT '', title_text TEXT NOT NULL DEFAULT '', hukm_html TEXT,
      html_content TEXT NOT NULL DEFAULT '[]', raw_content TEXT NOT NULL DEFAULT '',
      references_html TEXT, tags_json TEXT NOT NULL DEFAULT '[]', authored_at TEXT, created_at TEXT,
      updated_at TEXT NOT NULL);
    CREATE TABLE bookmarks (id TEXT PRIMARY KEY REFERENCES hadith(id) ON DELETE CASCADE, added_at TEXT NOT NULL);
    INSERT INTO hadith (id, slug, updated_at) VALUES ('a', 'الف', '2026-01-01');
    INSERT INTO bookmarks VALUES ('a', '2026-01-02');
    PRAGMA user_version = 1;
  `);
  const r = await ensureSchema(db);
  assert.deepEqual(r, { from: 1, to: SCHEMA_VERSION });
  const row = await getHadithBySlug(db, 'الف');
  assert.equal(row?.chapter, null);
  assert.equal(row?.narrators_json, '[]');
  assert.equal((await listBookmarks(db)).length, 1);
  assert.deepEqual(await listChapters(db), []);
  // Books not in the (still empty) registry are listed as stored.
  assert.deepEqual((await listBooks(db)).map((b) => b.book), ['']);
  db.close();
});
