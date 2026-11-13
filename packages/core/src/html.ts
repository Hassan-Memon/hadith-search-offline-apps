// HTML helpers that work without a DOM (Expo, Node, Tauri WebView alike).
import { mendMixedDigits } from './digits.js';
import { normalize } from './normalize.js';
import { spellSymbolsForReaders } from './symbols.js';
import type { HadithSection } from './types.js';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  zwnj: '\u200c',
  zwj: '\u200d',
};

/** Decode the entities Word-exported HTML actually uses. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/**
 * Plain text: the end of a paragraph, line or cell is a space, an inline tag
 * is nothing (Word splits a word across spans, «رہ</span><span>ے», and the
 * browser shows no space there either), entities decoded, whitespace collapsed.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(?:br\s*\/?|\/(?:p|div|li|h[1-6]|tr|td|th))>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const HREF_ATTRIBUTE = /\s+href\s*=\s*("([^"]*)"|'([^']*)')/gi;
const ALLOWED_HREF = /^(?:https?:\/\/|mailto:|tel:|\/|#|\?)/i;

/**
 * Render-time guard, identical in spirit to the website's sanitizeHadithHtml:
 * drops `file:///D:/…` footnote hrefs left by Word, and any active content.
 * Like the website (13 Nov 2026), every display also shows a number typed
 * with two kinds of digit in one kind (digits.ts) and gives each symbol-font
 * honorific its words for screen readers and copying (symbols.ts).
 */
export function sanitizeHadithHtml(html: string | null | undefined): string {
  if (!html) return '';
  return spellSymbolsForReaders(mendMixedDigits(stripUnsafe(html)));
}

function stripUnsafe(html: string): string {
  return html
    .replace(HREF_ATTRIBUTE, (match, _q, dq, sq) => {
      const url = String(dq ?? sq ?? '').trim();
      return url === '' || ALLOWED_HREF.test(url) ? match : '';
    })
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<o:p>|<\/o:p>/g, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, '');
}

const RULING_END = normalize('حکم');

/**
 * The ruling on a narration is under a heading that ends in «حکم»: «روایت کا
 * حکم», «تحقیق کا خلاصہ اور روایت کا حکم», «روایت بطریق … کا حکم» and their
 * spellings without spaces (649 of the 910 narrations on 12 Nov 2026, the
 * website's count). Marks, spaces and end punctuation are ignored; «حکماء»
 * or «حکمی» do not match. The website opens these sections on arrival.
 */
export function isRulingHeading(heading: string | null | undefined): boolean {
  if (!heading) return false;
  return normalize(stripHtml(heading)).replace(/[\s:۔.،,؛\-–—]+/g, '').endsWith(RULING_END);
}

/** Parse the stored `html_content` JSON; tolerant of bad data. */
export function parseSections(htmlContent: string | null | undefined): HadithSection[] {
  if (!htmlContent) return [];
  try {
    const parsed: unknown = JSON.parse(htmlContent);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is HadithSection => typeof s === 'object' && s !== null)
      .filter((s) => (s.heading?.trim() || s.content?.trim()) !== undefined);
  } catch {
    return [];
  }
}
