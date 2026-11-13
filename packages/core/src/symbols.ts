// Honorifics and circled numbers in the research, ported from the website
// (frontend-next/src/lib/hadithText.ts, 13 Nov 2026). They live here, not in
// the app's export code, because every display of research HTML now needs
// them (sanitizeHadithHtml → spellSymbolsForReaders).
//
// The research was typed in Word. Honorifics and circled numbers are not
// text there: they are ordinary letters and digits set in a symbol font
// (ARBO), e.g. "l" draws «رحمۃ اللہ علیہ» and "1" draws ①. On the page the
// font takes care of it. Anywhere the font does not travel (a table of
// contents label, the clipboard, a Word file, a screen reader) the letter
// would arrive as a stray "l", so these helpers write the words out.
import { decodeEntities } from './html.js';

// ARBO-DT: honorifics. Verified against the font's glyphs.
export const HONORIFICS: Record<string, string> = {
  l: 'رحمہ اللہ',
  r: 'رضی اللہ عنہ',
  R: 'رضی اللہ عنہا',
  q: 'رضی اللہ عنہما',
  p: 'رضی اللہ عنہم',
  e: 'علیہ السلام',
  E: 'علیہ الصلاۃ والسلام',
  f: 'علیہم السلام',
  s: 'ﷺ',
  a: 'ﷺ',
  b: 'رضی اللہ عنہ',
  n: 'رحمہم اللہ',
  m: 'رحمہما اللہ',
};

// ARBO-UW: numbers in a circle. The digits are 1-10 (0 is ⑩); the shifted
// keys continue the count.
const CIRCLED_KEYS = '1234567890!@#$%^&*()qwertyui';
const CIRCLED_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 19, 21, 22, 23, 24, 25, 26, 27,
  28,
];
export const CIRCLED_NUMBERS: Record<string, number> = Object.fromEntries(
  [...CIRCLED_KEYS].map((key, index) => [key, CIRCLED_VALUES[index]!]),
);

const HONORIFIC_CLASS = /font-class-ARBO-DT/;
const NUMBER_CLASS = /font-class-(?:ARBO-U[WB]|ARBO-AB|Arbo-1|Arbo-Number-nasir)/;
// Decorative dingbats and calligraphic ligatures with no text equivalent.
const ORNAMENT_CLASS = /font-class-(?:\d-)?(?:ARBO|Arbo)/;

export type SymbolKind = 'honorific' | 'number' | 'ornament' | null;

export function symbolKind(className: string | null | undefined, tagName = 'span'): SymbolKind {
  if (!className) return null;
  if (HONORIFIC_CLASS.test(className)) return 'honorific';
  // `font-class-Arbo-1` on a paragraph is just the paragraph's Word style.
  if (NUMBER_CLASS.test(className)) return tagName.toLowerCase() === 'span' ? 'number' : null;
  if (ORNAMENT_CLASS.test(className)) return tagName.toLowerCase() === 'span' ? 'ornament' : null;
  return null;
}

export function spellSymbol(kind: SymbolKind, text: string): string {
  if (kind === 'honorific') {
    return [...text]
      .map((ch) => HONORIFICS[ch] ?? '')
      .filter(Boolean)
      .join(' ');
  }
  if (kind === 'number') {
    return [...text]
      .map((ch) => (CIRCLED_NUMBERS[ch] ? `(${CIRCLED_NUMBERS[ch]})` : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

const SYMBOL_SPAN_WITH_ATTRS =
  /<span([^>]*class="([^"]*font-class-(?:\d-)?(?:ARBO|Arbo)[^"]*)"[^>]*)>([\s\S]*?)<\/span>/g;

/**
 * For display: each honorific or circled number keeps its glyph for the eye
 * (hidden from screen readers and left out of a copy), followed by its words
 * for screen readers and the clipboard. «تھانوی l» is then read and copied
 * as «تھانوی رحمہ اللہ», not "l". The stored text is not changed.
 */
export function spellSymbolsForReaders(html: string): string {
  return html.replace(SYMBOL_SPAN_WITH_ATTRS, (match, attrs: string, className: string, inner: string) => {
    const kind = symbolKind(className);
    if (kind !== 'honorific' && kind !== 'number') return match;
    if (/aria-hidden/.test(attrs)) return match;
    const spelled = spellSymbol(kind, decodeEntities(inner.replace(/<[^>]+>/g, '')));
    if (!spelled) return match;
    return `<span${attrs} aria-hidden="true" data-symbol>${inner}</span><span class="sr-only" data-symbol-words> ${spelled} </span>`;
  });
}
