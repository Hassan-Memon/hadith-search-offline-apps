// One number, one kind of digit. Ported from the website
// (frontend-next/src/lib/digits.ts, 13 Nov 2026); only `!` added for this
// package's stricter index checks.
//
// The research was typed in Word, and some numbers came out with two kinds of
// digit in one place: «28/15۹», «1۸0ھ», «۸/۴۷۵،رقم:8520». Only such a number
// (or citation) is changed, to the kind most of its own digits already use.
// Every other number stays exactly as typed, Latin, Urdu or Arabic. The
// stored text does not change; this is only what is shown.

const KINDS = [0x30, 0x0660, 0x06f0]; // Latin, Arabic, Urdu zero.
const ANY_DIGIT = /[0-9٠-٩۰-۹]/g;
const HAS_DIGIT = /[0-9٠-٩۰-۹]/;

const kindOf = (code: number) => (code >= 0x06f0 ? 2 : code >= 0x0660 ? 1 : 0);

/**
 * The text with its digits in each of the three kinds, for matching what a
 * reader types against what is stored or shown: «290», «۲۹۰», «٢٩٠».
 */
export function digitForms(text: string): string[] {
  if (!HAS_DIGIT.test(text)) return [text];
  const forms = KINDS.map((zero) =>
    text.replace(ANY_DIGIT, (digit) => {
      const code = digit.charCodeAt(0);
      return String.fromCharCode(zero + code - KINDS[kindOf(code)]!);
    }),
  );
  return [...new Set([text, ...forms])];
}

// A number: digits, with what may stand inside one («28/159», «۱ ۴ ۱ ۴»).
const NUMBER = /[0-9٠-٩۰-۹]+(?:[\s/\-–—.]*[0-9٠-٩۰-۹]+)*/g;
// What may stand between two numbers of one citation: «۸/۴۷۵،رقم:۸۵۲۰».
const CITATION_GLUE =
  /^[\s\u00a0،,:؛;/()\-–—]*(?:(?:ص|صفحہ|ج|جلد|رقم|الرقم|برقم|ح)[\s\u00a0:،.]*)?$/;

/** Each number or citation that mixes kinds of digit, in the kind it mostly uses. */
function mendText(text: string): string {
  if (!HAS_DIGIT.test(text)) return text;
  const numbers = [...text.matchAll(NUMBER)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
  }));
  let written = text;
  for (let first = 0; first < numbers.length; ) {
    let last = first;
    while (
      last + 1 < numbers.length &&
      CITATION_GLUE.test(text.slice(numbers[last]!.end, numbers[last + 1]!.start))
    ) {
      last++;
    }
    const start = numbers[first]!.start;
    const end = numbers[last]!.end;
    const counts = [0, 0, 0];
    for (const digit of text.slice(start, end).match(ANY_DIGIT) ?? []) {
      counts[kindOf(digit.charCodeAt(0))]!++;
    }
    if (counts.filter(Boolean).length > 1) {
      // Most digits win; on a tie, the kind the citation starts with.
      const firstKind = kindOf(text.slice(start).match(ANY_DIGIT)![0].charCodeAt(0));
      const kind = counts.reduce(
        (best, count, index) => (count > counts[best]! ? index : best),
        firstKind,
      );
      const mended = text.slice(start, end).replace(ANY_DIGIT, (digit) => {
        const code = digit.charCodeAt(0);
        return String.fromCharCode(KINDS[kind]! + code - KINDS[kindOf(code)]!);
      });
      // A digit is one character in every kind, so the length is unchanged.
      written = written.slice(0, start) + mended + written.slice(end);
    }
    first = last + 1;
  }
  return written;
}

// A symbol font's digits are not numbers but keys: "1" draws ① (hadithText.ts).
const SYMBOL_FONT = /font-class-(?:\d-)?(?:ARBO|Arbo)/;
const VOID_TAG = /^(?:br|hr|img|input|meta|link|wbr)$/;
const BLOCK_TAG = /^(?:p|div|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|br|hr)$/;
const TOKEN = /(<[^>]*>|&#?[0-9a-z]+;)/i;
const TAG = /^<(\/?)([a-z][a-z0-9]*)/i;
const CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Mixed numbers in stored research HTML. A number may be split across Word's
 * spans, so each block is read as one text. Tags, attributes, entities and
 * symbol fonts are left alone.
 */
export function mendMixedDigits(html: string): string {
  if (!html || !HAS_DIGIT.test(html)) return html;
  const tokens = html.split(TOKEN);
  const open: { tag: string; symbol: boolean }[] = [];
  let pieces: { token: number; at: number; length: number }[] = [];
  let flat = '';

  const flush = () => {
    if (pieces.length && HAS_DIGIT.test(flat)) {
      const written = mendText(flat);
      for (const piece of pieces) {
        tokens[piece.token] = written.slice(piece.at, piece.at + piece.length);
      }
    }
    pieces = [];
    flat = '';
  };

  tokens.forEach((token, index) => {
    if (!token) return;
    if (index % 2 === 1) {
      if (token[0] === '&') {
        flat += ' ';
        return;
      }
      const match = TAG.exec(token);
      if (!match) return;
      const name = match[2]!.toLowerCase();
      if (BLOCK_TAG.test(name)) flush();
      if (match[1]) {
        const last = open.map((entry) => entry.tag).lastIndexOf(name);
        if (last >= 0) open.length = last;
        return;
      }
      if (VOID_TAG.test(name) || token.endsWith('/>')) return;
      const attribute = CLASS_ATTRIBUTE.exec(token);
      const className = attribute?.[1] ?? attribute?.[2] ?? '';
      // On a paragraph `font-class-Arbo-1` is only Word's style name.
      open.push({ tag: name, symbol: name === 'span' && SYMBOL_FONT.test(className) });
      return;
    }
    if (open.some((entry) => entry.symbol)) {
      // Its letters and digits draw something else: a gap in the text.
      flat += ' '.repeat(token.length);
      return;
    }
    pieces.push({ token: index, at: flat.length, length: token.length });
    flat += token;
  });
  flush();
  return tokens.join('');
}
