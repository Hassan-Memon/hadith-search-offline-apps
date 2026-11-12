// HTML helpers that work without a DOM (Expo, Node, Tauri WebView alike).
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
 */
export function sanitizeHadithHtml(html: string | null | undefined): string {
  if (!html) return '';
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
