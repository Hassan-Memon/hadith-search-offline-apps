// Offline search over hadith_fts, with the website's rules (since 11 Nov
// 2026): a narration must hold most of the typed words, not just one of them,
// or one common word such as «کا» matches every narration. Three levels, the
// next tried only when one finds fewer than SEARCH_MIN_RESULTS:
//   0. exact words: up to two words all must be there, longer queries 75%;
//   1. the same, a word's ending may differ (خطبہ/خطبے, چہرہ/چہرے);
//   2. half the words, endings loose.
// The exact phrase ranks first, then the words close together as typed, then
// the narrations holding more of the words; bm25 (title words count more)
// within each.
import type { DbAdapter } from './db/adapter.js';
import { bookFilter, bookSpellings, LIST_COLUMNS } from './db/repo.js';
import { parseSections, stripHtml } from './html.js';
import { normalizeWithMap, queryTokens } from './normalize.js';
import type { HadithListItem, SearchHit, SearchResult } from './types.js';

export interface SearchOptions {
  page?: number;
  pageSize?: number;
  book?: string;
  /** Slug of a باب. */
  chapter?: string;
  tag?: string;
}

export const SEARCH_MIN_RESULTS = 3;
/** Words close together: at most this many other words between them. */
const NEAR_DISTANCE = 3;

const quote = (token: string) => `"${token.replace(/"/g, '""')}"`;

/** How many of n typed words a narration must hold at each level. */
export function wordsNeeded(n: number, level: number): number {
  if (n <= 0) return 0;
  if (level < 2) return n <= 2 ? n : Math.floor(n * 0.75);
  return Math.max(1, Math.floor(n * 0.5));
}

/**
 * One word as an FTS5 term. The last word is a prefix so typing feels quick
 * («نما» finds «نماز»). Loose (levels 1 and 2): a word of four letters or more
 * may end differently, the way the website allows a letter or two.
 */
export function wordTerm(token: string, last: boolean, loose: boolean): string {
  const letters = [...token];
  if (loose && letters.length >= 4) {
    const keep = letters.length >= 7 ? letters.length - 2 : letters.length - 1;
    return `${quote(letters.slice(0, keep).join(''))}*`;
  }
  return last && letters.length >= 2 ? `${quote(token)}*` : quote(token);
}

/** The FTS5 expressions for one query: each word, the phrase, the words near each other, and all of them for scoring. */
export function buildMatchExpressions(query: string, loose = false) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  const last = tokens.length - 1;
  const words = tokens.map((t, i) => wordTerm(t, i === last, loose));
  const exact = tokens.map((t, i) => wordTerm(t, i === last, false));
  return {
    tokens,
    words,
    phrase: quote(tokens.join(' ')) + (tokens[last]!.length >= 2 ? '*' : ''),
    near: tokens.length > 1 ? `NEAR(${exact.join(' ')}, ${NEAR_DISTANCE})` : null,
    any: words.join(' OR '),
  };
}

// Column weights: title, body, hukm, book, tags.
const BM25 = 'bm25(hadith_fts, 5.0, 1.0, 3.0, 0.5, 0.5)';

export async function searchHadith(
  db: DbAdapter,
  query: string,
  { page = 1, pageSize = 10, book, chapter, tag }: SearchOptions = {},
): Promise<SearchResult> {
  if (queryTokens(query).length === 0) return { total: 0, page, pageSize, hits: [] };

  const filters: string[] = [];
  const filterParams: string[] = [];
  if (book) {
    const spellings = await bookSpellings(db, book);
    filters.push(bookFilter(spellings));
    filterParams.push(...spellings);
  }
  if (chapter) {
    filters.push('h.chapter = ?');
    filterParams.push(chapter);
  }
  if (tag) {
    filters.push('EXISTS (SELECT 1 FROM json_each(h.tags_json) WHERE value = ?)');
    filterParams.push(tag);
  }
  const whereSql = filters.length ? `AND ${filters.join(' AND ')}` : '';
  const columns = LIST_COLUMNS.split(', ')
    .map((c) => `h.${c}`)
    .join(', ');

  for (let level = 0; level <= 2; level++) {
    const match = buildMatchExpressions(query, level > 0)!;
    const n = match.tokens.length;
    // Level 1 is level 0 again when no word is long enough to loosen.
    if (level === 1 && match.words.join() === buildMatchExpressions(query, false)!.words.join()) continue;
    // A narration and how many of the typed words it holds. MATERIALIZED:
    // each full-text query runs once, not once per row that joins it.
    const cte = `
      WITH w AS (${match.words.map((_, k) => `SELECT id, ${k} AS k FROM hadith_fts WHERE hadith_fts MATCH ?`).join(' UNION ALL ')}),
      hit AS MATERIALIZED (SELECT id, count(DISTINCT k) AS n FROM w GROUP BY id HAVING n >= ?)
    `;
    const cteParams: (string | number)[] = [...match.words, wordsNeeded(n, level)];

    // Order: the phrase, then the words near each other (two words or more),
    // then more of the words, then bm25. Only ids and small columns are
    // sorted; the text is read for the page's rows alone.
    const fts = (name: string) => `${name} AS MATERIALIZED (SELECT id FROM hadith_fts WHERE hadith_fts MATCH ?)`;
    const rankCtes = [...(n > 1 ? [fts('ph')] : []), ...(match.near ? [fts('nr')] : [])];
    const rankParams = [...(n > 1 ? [match.phrase] : []), ...(match.near ? [match.near] : [])];
    const rows = await db.all<HadithListItem & { html_content: string; total: number }>(
      `${cte},
       sc AS MATERIALIZED (SELECT id, ${BM25} AS score FROM hadith_fts WHERE hadith_fts MATCH ?)
       ${rankCtes.map((c) => `, ${c}`).join('')},
       pg AS (
         SELECT hit.id,
           ${n > 1 ? '(hit.id IN ph)' : '0'} AS p,
           ${match.near ? '(hit.id IN nr)' : '0'} AS nr,
           hit.n AS n, sc.score AS score, count(*) OVER () AS total
         FROM hit JOIN hadith h ON h.id = hit.id LEFT JOIN sc ON sc.id = hit.id
         WHERE 1 ${whereSql}
         ORDER BY p DESC, nr DESC, hit.n DESC, sc.score
         LIMIT ? OFFSET ?
       )
       SELECT ${columns}, h.html_content, pg.total
       FROM pg JOIN hadith h ON h.id = pg.id
       ORDER BY pg.p DESC, pg.nr DESC, pg.n DESC, pg.score`,
      [...cteParams, match.any, ...rankParams, ...filterParams, pageSize, (Math.max(1, page) - 1) * pageSize],
    );
    // The count comes with the page; a page past the end needs it asked for.
    let total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && page > 1) {
      const row = await db.get<{ c: number }>(
        `${cte} SELECT count(*) AS c FROM hit JOIN hadith h ON h.id = hit.id WHERE 1 ${whereSql}`,
        [...cteParams, ...filterParams],
      );
      total = Number(row?.c ?? 0);
    }
    if (total < SEARCH_MIN_RESULTS && level < 2) continue;
    const hits: SearchHit[] = rows.map(({ html_content, total: _total, ...row }) => ({
      ...row,
      tier: level,
      snippet: makeSnippet(sectionsText(html_content), match.tokens),
    }));
    return { total, page, pageSize, hits, relaxed: level > 0 && total > 0 };
  }
  return { total: 0, page, pageSize, hits: [] };
}

/** Plain text of the stored sections (used for snippets; raw_content is not kept on device). */
export function sectionsText(htmlContent: string): string {
  return parseSections(htmlContent)
    .map((s) => `${stripHtml(s.heading)} ${stripHtml(s.content)}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HighlightRange {
  start: number;
  end: number;
}

/**
 * Find query words in `original` by matching on its normalised form and map
 * the ranges back, so highlights land on the real text (harakat and all).
 * The phrase is tried first; then each token.
 */
export function highlightRanges(original: string, query: string): HighlightRange[] {
  const tokens = queryTokens(query);
  if (!original || tokens.length === 0) return [];
  const { text, map } = normalizeWithMap(original);
  const ranges: HighlightRange[] = [];
  const needles = tokens.length > 1 ? [tokens.join(' '), ...tokens] : tokens;
  for (const needle of needles) {
    let from = 0;
    while (from <= text.length - needle.length) {
      const at = text.indexOf(needle, from);
      if (at < 0) break;
      const start = map[at]!;
      const endIndex = map[at + needle.length - 1]!;
      ranges.push({ start, end: endIndex + 1 });
      from = at + needle.length;
    }
  }
  return mergeRanges(ranges);
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: HighlightRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Split text into alternating plain/highlighted parts for rendering. */
export function splitForHighlight(
  original: string,
  query: string,
): { text: string; highlight: boolean }[] {
  const ranges = highlightRanges(original, query);
  if (ranges.length === 0) return [{ text: original, highlight: false }];
  const parts: { text: string; highlight: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push({ text: original.slice(cursor, r.start), highlight: false });
    parts.push({ text: original.slice(r.start, r.end), highlight: true });
    cursor = r.end;
  }
  if (cursor < original.length) parts.push({ text: original.slice(cursor), highlight: false });
  return parts;
}

/** ~180 characters of the original body around the first match. */
export function makeSnippet(body: string, tokens: string[], width = 180): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const { text, map } = normalizeWithMap(clean);
  let at = -1;
  for (const token of tokens) {
    at = text.indexOf(token);
    if (at >= 0) break;
  }
  if (at < 0) return clean.length > width ? `${clean.slice(0, width)}…` : clean;
  const center = map[at] ?? 0;
  let start = Math.max(0, center - Math.floor(width / 3));
  let end = Math.min(clean.length, start + width);
  if (start > 0) start = clean.lastIndexOf(' ', start) + 1 || start;
  if (end < clean.length) end = clean.indexOf(' ', end) === -1 ? clean.length : clean.indexOf(' ', end);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}
