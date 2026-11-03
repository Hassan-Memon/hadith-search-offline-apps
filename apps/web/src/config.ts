import { SITE_URL } from '@tehqeqat/core';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

/** Where the app is served from: "/" on app.tehqeqatehadees.com, "/<repo>/" on github.io. */
export const BASE = import.meta.env.BASE_URL;

/**
 * The data files (manifest, snapshot, change files) are published next to the
 * app by the scheduled GitHub Action, so the app only ever talks to its own
 * origin. In development they are generated into public/data (pnpm data:local).
 */
export const DATA_BASE = new URL(`${BASE}data/`, location.origin).href;

/** The public website (for "open on the website" and shared links). */
export const WEBSITE = SITE_URL;

export const PAGE_SIZE = 20;
/** Background refresh while the app is open. */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refresh when the app comes back to the foreground after this long. */
export const FOREGROUND_SYNC_AFTER_MS = 30 * 60 * 1000;
