// The one place that knows the website's addresses.
export const SITE_URL = 'https://tehqeqatehadees.com';
export const SITE_API_BASE_URL = `${SITE_URL}/api`;
// Public routes on the website (Next forwards them to Django's /api/v1/sync).
export const SYNC_BASE_URL = `${SITE_URL}/api/sync`;

/** Canonical web URL of a hadith (what Share copies; opens the app when installed). */
export function hadithWebUrl(slug: string): string {
  return `${SITE_URL}/hadees-detail/${encodeURIComponent(slug)}`;
}
