// The website's changes of 12–13 November 2026, as the app does them.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NodeSqliteAdapter } from '../src/adapters/node.js';
import { inBookOrder } from '../src/build/data.js';
import { ensureSchema } from '../src/db/migrate.js';
import { digitForms, mendMixedDigits } from '../src/digits.js';
import { isRulingHeading, sanitizeHadithHtml } from '../src/html.js';
import {
  chapterSamples,
  INTRO_CHAPTER,
  relatedHadith,
  relatedNarrators,
  replaceRegistry,
  upsertHadith,
} from '../src/db/repo.js';
import { searchHadith } from '../src/search.js';
import type { HadithDoc } from '../src/types.js';

test('a number typed with two kinds of digit is shown in one kind; others stay as typed', () => {
  // Most digits win: two Latin and one Urdu make a Latin number.
  assert.equal(mendMixedDigits('<p>المتوفی 1۸0ھ</p>'), '<p>المتوفی 180ھ</p>');
  assert.equal(mendMixedDigits('<p>المتوفی ۱8۰ھ</p>'), '<p>المتوفی ۱۸۰ھ</p>');
  assert.equal(mendMixedDigits('<p>28/15۹</p>'), '<p>28/159</p>');
  // A citation is one number: «۸/۴۷۵،رقم:8520» goes to the kind most of it uses.
  assert.equal(mendMixedDigits('<p>۸/۴۷۵،رقم:8520</p>'), '<p>۸/۴۷۵،رقم:۸۵۲۰</p>');
  // Split across Word's spans, still one number.
  assert.equal(mendMixedDigits('<p><span>1</span><span>۸0</span>ھ</p>'), '<p><span>1</span><span>80</span>ھ</p>');
  // Unmixed numbers and symbol-font digits are left alone.
  assert.equal(mendMixedDigits('<p>290 اور ۲۹۰</p>'), '<p>290 اور ۲۹۰</p>');
  assert.equal(
    mendMixedDigits('<p>۱۲<span class="font-class-ARBO-UW">1</span></p>'),
    '<p>۱۲<span class="font-class-ARBO-UW">1</span></p>',
  );
  assert.deepEqual(digitForms('290').sort(), ['290', '٢٩٠', '۲۹۰'].sort());
});

test('a symbol-font honorific keeps its glyph and gets its words for readers and copying', () => {
  const html = sanitizeHadithHtml('<p>تھانوی<span class="font-class-ARBO-DT-1">l</span></p>');
  assert.match(html, /aria-hidden="true" data-symbol>l<\/span>/);
  assert.match(html, /<span class="sr-only" data-symbol-words> رحمہ اللہ <\/span>/);
  // Done once, however often the HTML passes through.
  assert.equal(sanitizeHadithHtml(html), html);
  // And still drops Word's dead links.
  assert.doesNotMatch(sanitizeHadithHtml('<a href="file:///D:/x.docx#_ftn1">[1]</a>'), /file:/);
});

test('the ruling: a heading that ends in «حکم»', () => {
  assert.ok(isRulingHeading('<p><span>روایت کا حکم:</span></p>'));
  assert.ok(isRulingHeading('تحقیق کا خلاصہ اور روایت کا حُکم'));
  assert.ok(isRulingHeading('روایت بطریق ابن عباس کاحکم ۔'));
  assert.ok(!isRulingHeading('حکماء کے اقوال'));
  assert.ok(!isRulingHeading('حکمی روایت'));
  assert.ok(!isRulingHeading(''));
});

function doc(id: string, chapter: string, narrators: { slug: string; start: number; end: number }[] = []): HadithDoc {
  return {
    id,
    slug: `slug-${id}`,
    title: `<p>عنوان ${id}</p>`,
    book: 'کتاب',
    type: null,
    html_content: JSON.stringify([{ heading: 'سند', content: `<p>متن ${id} روایت</p>` }]),
    raw_content: `متن ${id} روایت`,
    tags: [],
    chapter,
    narrators,
    updated_at: '2026-11-13T00:00:00Z',
  };
}

test('prefaces are left out of chapter samples and related narrations; related narrators by shared narrations', async () => {
  const db = new NodeSqliteAdapter(':memory:');
  await ensureSchema(db);
  await replaceRegistry(db, {
    books: [],
    chapters: [
      { slug: INTRO_CHAPTER, name: 'مقدمات و تعارف', parent: 'مقدمات', sort_order: 1, description: null },
      { slug: 'نماز', name: 'نماز', parent: 'عبادات', sort_order: 2, description: null },
    ],
    narrators: ['زید', 'عمرو', 'بکر'].map((slug) => ({
      slug,
      name: slug,
      aliases: [],
      death_note: null,
      death_year: null,
      century: null,
    })),
  });
  const z = { slug: 'زید', start: 0, end: 0 };
  const a = { slug: 'عمرو', start: 0, end: 0 };
  const b = { slug: 'بکر', start: 0, end: 0 };
  await upsertHadith(db, doc('p1', INTRO_CHAPTER));
  await upsertHadith(db, doc('n1', 'نماز', [z, a]));
  await upsertHadith(db, doc('n2', 'نماز', [z, a, b]));
  await upsertHadith(db, doc('n3', 'نماز'));

  const samples = await chapterSamples(db, 3);
  assert.deepEqual(samples.map((s) => s.chapter), ['نماز']);
  const related = await relatedHadith(db, 'n1', 'کتاب', 5, 'نماز');
  assert.ok(!related.some((r) => r.id === 'p1'), 'a preface is not related to a narration');
  // A preface itself may still list other prefaces.
  await upsertHadith(db, doc('p2', INTRO_CHAPTER));
  assert.ok((await relatedHadith(db, 'p1', 'کتاب', 5, INTRO_CHAPTER)).some((r) => r.id === 'p2'));

  // عمرو shares two narrations with زید, بکر one.
  const others = await relatedNarrators(db, 'زید');
  assert.deepEqual(others.map((n) => [n.slug, n.hadith_count]), [
    ['عمرو', 2],
    ['بکر', 1],
  ]);
  db.close();
});

test('a number finds the same narrations in every digit form', async () => {
  const db = new NodeSqliteAdapter(':memory:');
  await ensureSchema(db);
  for (const [id, text] of [
    ['a', 'المتوفی 290ھ'],
    ['b', 'المتوفی ۲۹۰ھ'],
    ['c', 'المتوفی ٢٩٠ھ'],
  ]) {
    await upsertHadith(db, { ...doc(id!, 'نماز'), raw_content: text! });
  }
  for (const q of ['290', '۲۹۰', '٢٩٠']) assert.equal((await searchHadith(db, q)).total, 3, q);
  db.close();
});

test('the PDF library in the books\' order, unlinked files after them', () => {
  const files = [{ id: 'x' }, { id: 'v2' }, { id: 'v1' }, { id: 'y' }];
  const books = [
    { name: 'حصہ دوم', sort_order: 2, pdf_file_id: 'v2' },
    { name: 'حصہ اول', sort_order: 1, pdf_file_id: 'v1' },
  ];
  const ordered = inBookOrder(files, books);
  assert.deepEqual(ordered.map((f) => f.id), ['v1', 'v2', 'x', 'y']);
  assert.deepEqual(ordered.map((f) => f.book), ['حصہ اول', 'حصہ دوم', undefined, undefined]);
});
