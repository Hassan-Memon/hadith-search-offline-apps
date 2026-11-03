import { SITE_URL } from '@tehqeqat/core';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

// In development Vite proxies /api to the local website (see vite.config.ts),
// so the app talks to its own origin. A build can be pointed at another
// website (a local one for testing) with VITE_SITE_ORIGIN.
export const SITE_ORIGIN: string = import.meta.env.DEV
  ? location.origin
  : (import.meta.env.VITE_SITE_ORIGIN as string | undefined) || SITE_URL;

export const SYNC_BASE = `${SITE_ORIGIN}/api/sync`;
export const SITE_API_BASE = `${SITE_ORIGIN}/api`;

/** The public website (for "open on the website" and shared links). */
export const WEBSITE = SITE_URL;

export const PAGE_SIZE = 20;
/** Background refresh while the app is open. */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refresh when the app comes back to the foreground after this long. */
export const FOREGROUND_SYNC_AFTER_MS = 30 * 60 * 1000;
