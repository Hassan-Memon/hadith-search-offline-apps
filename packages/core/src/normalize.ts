// Search normaliser shared with backend/hadithsearch/hadith/sync/normalize.py.
// The algorithm is specified in README.md ("Normaliser"); both sides must pass
// fixtures/normalize.json. Change the README and the fixture first, then both
// implementations.

// Harakat, Quranic marks, tatweel, zero-width characters, BOM.
const REMOVE =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ​-‏﻿]/gu;

// Letter folding (Arabic forms → the Urdu letters the texts use) and digits.
const MAP: Record<string, string> = {
  'ك': 'ک', // ك → ک
  'ي': 'ی', // ي → ی
  'ى': 'ی', // ى → ی
  'ئ': 'ی', // ئ → ی
  'ؤ': 'و', // ؤ → و
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'آ': 'ا', // آ → ا
  'ٱ': 'ا', // ٱ → ا
  'ه': 'ہ', // ه → ہ
  'ۀ': 'ہ', // ۀ → ہ
  'ۂ': 'ہ', // ۂ → ہ
  'ة': 'ہ', // ة → ہ
  'ۃ': 'ہ', // ۃ → ہ
  'ە': 'ہ', // ە → ہ
};
for (let d = 0; d <= 9; d++) {
  MAP[String.fromCharCode(0x0660 + d)] = String(d); // Arabic-Indic digits
  MAP[String.fromCharCode(0x06f0 + d)] = String(d); // Extended (Urdu) digits
}
const MAPPED = new RegExp(`[${Object.keys(MAP).join('')}]`, 'gu');

/** Normalise text for indexing and querying. Pure; identical to the Python side. */
export function normalize(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(REMOVE, '')
    .replace(MAPPED, (ch) => MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NormalizedWithMap {
  /** The normalised text (equal to normalize(original) for all practical inputs). */
  text: string;
  /** map[i] = index in `original` of the character that produced text[i]. */
  map: number[];
}

/**
 * Same transformation, character by character, keeping an index map back to
 * the original string so a match found in normalised text can be highlighted
 * in the original (with its harakat, ligatures and letter forms intact).
 */
export function normalizeWithMap(original: string): NormalizedWithMap {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i] as string;
    // Surrogate pairs are handled as one unit so the map never splits them.
    const code = original.codePointAt(i) as number;
    const unit = code > 0xffff ? original.slice(i, i + 2) : ch;
    if (code > 0xffff) i++;
    const start = code > 0xffff ? i - 1 : i;

    let piece = unit.normalize('NFKC').replace(REMOVE, '');
    piece = piece.replace(MAPPED, (c) => MAP[c] ?? c).toLowerCase();
    for (const c of piece) {
      if (/\s/u.test(c)) {
        pendingSpace = out.length > 0;
        continue;
      }
      if (pendingSpace) {
        out.push(' ');
        map.push(start);
        pendingSpace = false;
      }
      out.push(c);
      map.push(start);
    }
  }
  return { text: out.join(''), map };
}

/** Split a normalised query into FTS tokens (letters, digits, marks only). */
export function queryTokens(query: string): string[] {
  return normalize(query)
    .split(' ')
    .map((t) => t.replace(/[^\p{L}\p{N}\p{M}]+/gu, ''))
    .filter((t) => t.length > 0);
}
