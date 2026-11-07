// Books of the series and the others, in the order of the website's book registry.
import type { BookCount } from './types.js';

export const SERIES_NAME = 'غیر معتبر روایات کا فنی جائزہ';

// Urdu ordinals used in the series' book names, e.g. «(حصہ اول)», «(گیارہواں حصہ)».
const VOLUME_WORDS: Record<string, number> = {
  اول: 1,
  دوم: 2,
  سوم: 3,
  چہارم: 4,
  پنجم: 5,
  ششم: 6,
  ہفتم: 7,
  ہشتم: 8,
  نہم: 9,
  دہم: 10,
  گیارہواں: 11,
  بارہواں: 12,
  تیرہواں: 13,
  چودہواں: 14,
  پندرہواں: 15,
  سولہواں: 16,
};

export interface SeriesVolume extends BookCount {
  volume: number;
  label: string;
}

/** Both stored spellings («کا فنی» and «کافنی») match; names are shown as stored, never changed. */
export function parseSeriesVolume(book: string): { volume: number; label: string } | null {
  if (!book.includes('غیر معتبر روایات') || !book.includes('جائزہ')) return null;
  const label = /\(([^)]+)\)/.exec(book)?.[1]?.trim();
  if (!label) return null;
  const word = Object.keys(VOLUME_WORDS).find((w) => label.split(/\s+/).includes(w));
  return word ? { volume: VOLUME_WORDS[word]!, label } : null;
}

export interface BookGroups {
  series: SeriesVolume[];
  others: BookCount[];
}

/**
 * The website's book registry decides (part number, order); the name is
 * parsed only for a book the registry does not have yet.
 */
export function groupBooks(books: BookCount[]): BookGroups {
  const series: SeriesVolume[] = [];
  const others: BookCount[] = [];
  for (const entry of books) {
    const parsed = parseSeriesVolume(entry.book);
    const inRegistry = entry.sort_order != null || entry.is_series != null;
    if (inRegistry && entry.is_series && entry.volume_no) {
      series.push({ ...entry, volume: entry.volume_no, label: parsed?.label ?? entry.book });
    } else if (!inRegistry && parsed) {
      series.push({ ...entry, ...parsed });
    } else {
      others.push(entry);
    }
  }
  const order = (b: BookCount) => b.sort_order ?? Number.MAX_SAFE_INTEGER;
  series.sort((a, b) => a.volume - b.volume || b.count - a.count);
  others.sort((a, b) => order(a) - order(b) || b.count - a.count);
  return { series, others };
}
