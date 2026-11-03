// Shrink Word-exported hadith HTML for the offline app.
//
// The stored HTML came out of Word: every paragraph carries class="MsoNormal",
// dir="RTL", lang=…, empty <span dir="LTR"></span> markers, <o:p> tags,
// comments and dead file:///D:/… footnote links. None of it changes how the
// text looks once the app's CSS is applied, but it is about half of the bytes
// a phone has to download and store.
//
// Kept: font-class-* and Arbic classes (font choice), align (centred lines),
// real links, every element that carries text, and the text itself.
import type { HadithDoc } from './types.js';

const CONDITIONAL_COMMENT = /<!--\[if[\s\S]*?<!\[endif\]-->/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const OFFICE_TAG = /<\/?o:p\s*>/gi;
const DROP_ATTRS = /\s(?:lang|style|name|title|dir)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const CLASS_ATTR = /\sclass\s*=\s*"([^"]*)"/gi;
const HREF_ATTR = /\shref\s*=\s*"([^"]*)"/gi;
const KEEP_HREF = /^(?:https?:|mailto:|tel:)/i;
const BARE_SPAN = /<span>([^<]*)<\/span>/g;
const EMPTY_SPAN = /<span(?:\s[^>]*)?>\s*<\/span>/g;
const BARE_ANCHOR = /<a>([\s\S]*?)<\/a>/g;
const SPACES = /[ \t\r\n]+/g;

export function slimHtml(value: string): string;
export function slimHtml(value: string | null | undefined): string | null | undefined;
export function slimHtml(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  let html = value
    .replace(CONDITIONAL_COMMENT, '')
    .replace(COMMENT, '')
    .replace(OFFICE_TAG, '')
    .replace(DROP_ATTRS, '')
    .replace(CLASS_ATTR, (_m, names: string) => {
      const kept = names.split(/\s+/).filter((n) => n.startsWith('font-class-') || n === 'Arbic');
      return kept.length ? ` class="${kept.join(' ')}"` : '';
    })
    .replace(HREF_ATTR, (_m, url: string) => (KEEP_HREF.test(url.trim()) ? ` href="${url.trim()}"` : ''));
  // Unwrapping one level can expose another, so repeat a few times.
  for (let i = 0; i < 4; i++) {
    const before = html;
    html = html.replace(BARE_SPAN, '$1').replace(EMPTY_SPAN, '').replace(BARE_ANCHOR, '$1');
    if (html === before) break;
  }
  return html.replace(SPACES, ' ');
}

/** `html_content` is a JSON string of [{heading, content}]; slim each part. */
export function slimSections(htmlContent: string | null | undefined): string {
  if (!htmlContent) return '[]';
  let sections: unknown;
  try {
    sections = JSON.parse(htmlContent);
  } catch {
    return slimHtml(htmlContent);
  }
  if (!Array.isArray(sections)) return htmlContent;
  for (const section of sections) {
    if (section && typeof section === 'object') {
      const s = section as Record<string, unknown>;
      for (const key of ['heading', 'content']) {
        if (typeof s[key] === 'string') s[key] = slimHtml(s[key] as string);
      }
    }
  }
  return JSON.stringify(sections);
}

/** A slimmed copy of a document (raw_content kept: it feeds the search index). */
export function slimDocument(doc: HadithDoc): HadithDoc {
  return {
    ...doc,
    title: slimHtml(doc.title) ?? '',
    hukm: slimHtml(doc.hukm),
    references: slimHtml(doc.references),
    html_content: slimSections(doc.html_content),
  };
}
