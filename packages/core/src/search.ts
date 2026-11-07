// Offline search over hadith_fts, ranked the way the website ranks:
// phrase matches, then all words, then any word; bm25 within each tier.
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

const quote = (token: string) => `"${token.replace(/"/g, '""')}"`;

/** Build the three FTS5 MATCH expressions for a query. */
export function buildMatchExpressions(query: string): { phrase: string; all: string; any: string } | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  // Prefix matching on the last token so typing feels responsive: «نما» finds «نماز».
  const quoted = tokens.map(quote);
  const last = quoted.length - 1;
  const prefixed = quoted.map((t, i) => (i === last && tokens[last]!.length >= 2 ? `${t}*` : t));
  return {
    phrase: quote(tokens.join(' ')) + (tokens[last]!.length >= 2 ? '*' : ''),
    all: prefixed.join(' AND '),
    any: prefixed.join(' OR '),
  };
}

// Column weights: title, body, hukm, book, tags.
const BM25 = 'bm25(hadith_fts, 5.0, 1.0, 3.0, 0.5, 0.5)';

export async function searchHadith(
  db: DbAdapter,
  query: string,
  { page = 1, pageSize = 10, book, chapter, tag }: SearchOptions = {},
): Promise<SearchResult> {
  const match = buildMatchExpressions(query);
  if (!match) return { total: 0, page, pageSize, hits: [] };

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
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const cte = `
    WITH m AS (
      SELECT id, 0 AS tier, ${BM25} AS score FROM hadith_fts WHERE hadith_fts MATCH ?
      UNION ALL
      SELECT id, 1, ${BM25} FROM hadith_fts WHERE hadith_fts MATCH ?
      UNION ALL
      SELECT id, 2, ${BM25} FROM hadith_fts WHERE hadith_fts MATCH ?
    ),
    best AS (SELECT id, min(tier) AS tier, min(score) AS score FROM m GROUP BY id)
  `;
  const matchParams = [match.phrase, match.all, match.any];

  const totalRow = await db.get<{ c: number }>(
    `${cte} SELECT count(*) AS c FROM best JOIN hadith h ON h.id = best.id ${whereSql}`,
    [...matchParams, ...filterParams],
  );
  const rows = await db.all<HadithListItem & { tier: number; html_content: string }>(
    `${cte} SELECT ${LIST_COLUMNS.split(', ')
      .map((c) => `h.${c}`)
      .join(', ')}, h.html_content, best.tier
     FROM best JOIN hadith h ON h.id = best.id ${whereSql}
     ORDER BY best.tier, best.score LIMIT ? OFFSET ?`,
    [...matchParams, ...filterParams, pageSize, (Math.max(1, page) - 1) * pageSize],
  );

  const tokens = queryTokens(query);
  const hits: SearchHit[] = rows.map(({ html_content, ...row }) => ({
    ...row,
    snippet: makeSnippet(sectionsText(html_content), tokens),
  }));
  return { total: Number(totalRow?.c ?? 0), page, pageSize, hits };
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
