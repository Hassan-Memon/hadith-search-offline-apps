// Ported unchanged from the website (frontend-next/src/lib), so a copied or
// downloaded narration is the same from the app and from tehqeqatehadees.com.
import { mendMixedDigits, spellSymbol, symbolKind } from '@tehqeqat/core';

// Reading the stored research HTML as text.
//
// The research was typed in Word. Honorifics and circled numbers are not
// text there: they are ordinary letters and digits set in a symbol font
// (ARBO), e.g. "l" draws «رحمۃ اللہ علیہ» and "1" draws ①. On the page the
// font takes care of it. Anywhere the font does not travel (a table of
// contents label, the clipboard, a Word file) the letter would arrive as a
// stray "l", so these helpers write the words out, or drop them where only
// the bare name is wanted.

// The symbol helpers (HONORIFICS, symbolKind, spellSymbol and the display's
// spellSymbolsForReaders) moved to @tehqeqat/core/symbols, which every
// display needs; they are re-exported here so this file reads as the website's.
export {
  CIRCLED_NUMBERS,
  HONORIFICS,
  spellSymbol,
  spellSymbolsForReaders,
  symbolKind,
  type SymbolKind,
} from '@tehqeqat/core';

const SYMBOL_SPAN =
  /<span[^>]*class="([^"]*font-class-(?:\d-)?(?:ARBO|Arbo)[^"]*)"[^>]*>([\s\S]*?)<\/span>/g;
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  zwnj: '\u200c',
  zwj: '\u200d',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point =
        code[1]!.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/**
 * Plain text of a fragment of research HTML, on the server or in the browser.
 * `symbols`: 'spell' writes honorifics and numbers out, 'drop' removes them
 * (for labels and names).
 */
export function hadithPlainText(
  html: string | undefined | null,
  symbols: 'spell' | 'drop' = 'spell',
) {
  if (!html) return '';
  return decodeEntities(
    mendMixedDigits(html)
      .replace(SYMBOL_SPAN, (_match, className: string, inner: string) => {
        if (symbols === 'drop') return ' ';
        const text = decodeEntities(inner.replace(/<[^>]+>/g, ''));
        const spelled = spellSymbol(symbolKind(className), text);
        return spelled ? ` ${spelled} ` : ' ';
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
      // Word splits a word across spans («رہ</span><span>ے»), so an inline
      // tag is nothing, not a space: the browser shows none either.
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** One line, for a heading or a table-of-contents entry. */
export function hadithLabel(html: string | undefined | null): string {
  return hadithPlainText(html, 'drop')
    .replace(/\[\s*[\d۰-۹٠-٩]+\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:،۔])/g, '$1')
    .replace(/[:：]\s*$/, '')
    .trim();
}

export interface HadithSection {
  heading?: string;
  content?: string;
}

export function parseSections(htmlContent: string | undefined | null): HadithSection[] {
  if (!htmlContent) return [];
  try {
    const parsed = JSON.parse(htmlContent) as unknown;
    return Array.isArray(parsed) ? (parsed as HadithSection[]) : [];
  } catch {
    return [];
  }
}

// For matching what a reader types against stored text: diacritics, tatweel
// and zero-width joiners are dropped and the Arabic and Urdu forms of a
// letter are made one, so «يحيى» finds «یحییٰ».
// Harakat, the dagger alif, tatweel and the zero-width marks, by code point
// (written out one by one: a range of combining marks reads as one glued
// character to tools that check regular expressions).
const IGNORED_MARKS = new Set([
  ...'\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065a\u065b\u065c\u065d\u065e\u065f\u0670\u0640\u200c\u200d\u200e\u200f',
]);
// Quranic annotation signs.
const isAnnotation = (ch: string) => {
  const code = ch.charCodeAt(0);
  return code >= 0x06d6 && code <= 0x06ed;
};
const LETTER_FORMS: Record<string, string> = {
  '\u064a': '\u06cc',
  '\u0649': '\u06cc',
  '\u0626': '\u06cc',
  '\u0643': '\u06a9',
  '\u0647': '\u06c1',
  '\u0629': '\u06c1',
  '\u06c3': '\u06c1',
  '\u06be': '\u06c1',
  '\u0623': '\u0627',
  '\u0625': '\u0627',
  '\u0622': '\u0627',
  '\u0671': '\u0627',
  '\u0624': '\u0648',
};

export function foldArabic(text: string): string {
  let folded = '';
  for (const ch of text.normalize('NFKD')) {
    if (IGNORED_MARKS.has(ch) || isAnnotation(ch)) continue;
    folded += LETTER_FORMS[ch] ?? ch;
  }
  return folded.toLowerCase().trim();
}
