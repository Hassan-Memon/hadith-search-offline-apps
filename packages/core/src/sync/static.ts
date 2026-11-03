// Sync from static files published next to the app (GitHub Pages):
//
//   data/manifest.json          what exists, cursors, snapshot info
//   data/snapshot-<sha>.sqlite.gz   whole database (first start, or far behind)
//   data/changes-<n>.json       documents added/edited and ids deleted in build n
//   data/announcements.json, data/files.json
//
// A cursor is a build number as a string. A device at cursor c needs the
// change files c+1 … latest; if the oldest kept file is newer than c+1 it
// downloads the snapshot instead.
import type { AnnouncementRecord, ChangesPage, FileRecord, Manifest } from '../types.js';
import type { SiteApi, SyncApi } from './api.js';
import { HttpError } from './api.js';

export interface BuildEntry {
  cursor: string;
  file: string;
  items: number;
  deleted: number;
}

export interface StaticManifest extends Manifest {
  builds: BuildEntry[];
}

export interface StaticApiOptions {
  /** URL of the data directory, e.g. https://app.tehqeqatehadees.com/data/ */
  baseUrl: string;
  fetch?: typeof fetch;
}

const num = (cursor: string | null | undefined) => (cursor ? Number(cursor) : 0);

export function createStaticApi(opts: StaticApiOptions): SyncApi & SiteApi {
  const base = opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`;
  const f = opts.fetch ?? fetch;
  let builds: BuildEntry[] = [];

  async function json<T>(name: string, bust = false): Promise<T> {
    const url = new URL(name, base).href + (bust ? `?t=${Date.now()}` : '');
    const res = await f(url, { headers: { Accept: 'application/json' }, cache: bust ? 'no-store' : 'default' });
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  }

  return {
    async getManifest() {
      // Cache-busted: GitHub Pages serves files with a 10-minute cache.
      const manifest = await json<StaticManifest>('manifest.json', true);
      builds = Array.isArray(manifest.builds) ? manifest.builds : [];
      if (manifest.snapshot?.url) manifest.snapshot.url = new URL(manifest.snapshot.url, base).href;
      return manifest;
    },

    async getChanges(since): Promise<ChangesPage> {
      const pending = builds.filter((b) => num(b.cursor) > num(since));
      const next = pending[0];
      if (!next) return { items: [], deleted: [], next_cursor: since, has_more: false };
      const page = await json<{ items: ChangesPage['items']; deleted: ChangesPage['deleted'] }>(next.file);
      return {
        items: page.items ?? [],
        deleted: page.deleted ?? [],
        next_cursor: next.cursor,
        has_more: pending.length > 1,
      };
    },

    needsSnapshot(cursor, manifest) {
      if (!cursor) return true;
      if (cursor === manifest.latest_cursor) return false;
      const oldest = builds[0];
      // No change files kept, or the device is older than the oldest one.
      if (!oldest) return true;
      return num(cursor) < num(oldest.cursor) - 1;
    },

    async getAnnouncements() {
      const data = await json<unknown>('announcements.json', true);
      return Array.isArray(data) ? (data as AnnouncementRecord[]) : [];
    },

    async getFiles() {
      const data = await json<unknown>('files.json', true);
      return Array.isArray(data) ? (data as FileRecord[]) : [];
    },
  };
}
