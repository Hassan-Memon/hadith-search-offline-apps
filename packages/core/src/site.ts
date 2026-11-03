// The one place that knows the website's address.
export const SITE_URL = 'https://tehqeqatehadees.com';

/** Canonical web URL of a hadith (what Share copies). */
export function hadithWebUrl(slug: string): string {
  return `${SITE_URL}/hadees-detail/${encodeURIComponent(slug)}`;
}
