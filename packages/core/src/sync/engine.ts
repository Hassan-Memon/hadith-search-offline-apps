// The sync state machine. Platform code supplies the database adapter, the
// HTTP api and (optionally) a snapshot installer; this decides what to do.
import type { DbAdapter } from '../db/adapter.js';
import { ensureSchema, SCHEMA_VERSION } from '../db/migrate.js';
import {
  countHadith,
  deleteHadith,
  getSyncState,
  replaceAnnouncements,
  replaceFiles,
  setCursor,
  setSyncResult,
  upsertHadith,
} from '../db/repo.js';
import type { Manifest, SnapshotInfo } from '../types.js';
import type { SiteApi, SyncApi } from './api.js';
import { isCaughtUp } from './cursor.js';
import { compareVersions } from './version.js';

export type SyncPhase =
  | 'manifest'
  | 'snapshot-download'
  | 'snapshot-install'
  | 'delta'
  | 'extras'
  | 'done';

export interface SyncProgress {
  phase: SyncPhase;
  /** 0–1 when known. */
  fraction?: number;
  message?: string;
  applied?: number;
}

export interface SnapshotInstaller {
  /**
   * Download `snapshot.url`, verify `snapshot.sha256`, gunzip it and make it
   * the app's database. The adapter passed to sync() must talk to the new
   * file afterwards (reopen inside this call). Throw on any failure; the
   * engine then falls back to paging deltas from the beginning.
   */
  install(snapshot: SnapshotInfo, onProgress: (fraction: number) => void): Promise<void>;
}

export interface SyncOptions {
  db: DbAdapter;
  api: SyncApi;
  /** When given, announcements and the PDF list are refreshed too. */
  site?: SiteApi;
  installer?: SnapshotInstaller;
  appVersion: string;
  onProgress?: (p: SyncProgress) => void;
  /** Page size for /changes (1–500). */
  pageSize?: number;
  /**
   * When the device is this many documents behind, re-bootstrap from the
   * snapshot instead of paging (a reindex that touched every row).
   */
  rebootstrapThreshold?: number;
  /** Force a snapshot install even if the device already has data. */
  forceSnapshot?: boolean;
}

export type SyncResult =
  | { status: 'ok'; applied: number; deleted: number; cursor: string; usedSnapshot: boolean; hadith: number }
  | { status: 'up-to-date'; cursor: string; hadith: number }
  | { status: 'update-required'; minAppVersion: string }
  | { status: 'error'; error: string };

export async function sync(opts: SyncOptions): Promise<SyncResult> {
  const { db, api, onProgress } = opts;
  const report = (p: SyncProgress) => onProgress?.(p);
  try {
    await ensureSchema(db);
    report({ phase: 'manifest' });
    const manifest = await api.getManifest();

    if (compareVersions(opts.appVersion, manifest.min_app_version) < 0) {
      await setSyncResult(db, `update-required: ${manifest.min_app_version}`);
      return { status: 'update-required', minAppVersion: manifest.min_app_version };
    }
    if (manifest.schema_version > SCHEMA_VERSION) {
      // The server moved ahead of this build; deltas may carry fields we do
      // not know. Treat like an app update requirement.
      await setSyncResult(db, `update-required: schema ${manifest.schema_version}`);
      return { status: 'update-required', minAppVersion: manifest.min_app_version };
    }

    let state = await getSyncState(db);
    let usedSnapshot = false;
    const hadithCount = await countHadith(db);
    const fresh = !state.cursor || hadithCount === 0;
    const farBehind =
      !fresh &&
      ((opts.rebootstrapThreshold ?? 2000) <= estimateBehind(manifest, hadithCount, state.cursor) ||
        (api.needsSnapshot?.(state.cursor, manifest) ?? false));

    if (opts.installer && manifest.snapshot && usableSnapshot(manifest.snapshot) && (fresh || farBehind || opts.forceSnapshot)) {
      try {
        report({ phase: 'snapshot-download', fraction: 0 });
        await opts.installer.install(manifest.snapshot, (fraction) =>
          report({ phase: 'snapshot-download', fraction }),
        );
        report({ phase: 'snapshot-install' });
        await ensureSchema(db);
        state = await getSyncState(db);
        usedSnapshot = true;
      } catch (error) {
        // Fall back to deltas from wherever we are (possibly the beginning).
        report({ phase: 'delta', message: `snapshot failed: ${String(error)}` });
      }
    }

    let applied = 0;
    let deleted = 0;
    let cursor = state.cursor ?? '';
    if (!isCaughtUp(cursor, manifest.latest_cursor)) {
      report({ phase: 'delta', applied: 0 });
      const limit = opts.pageSize ?? 500;
      // Hard stop so a server bug cannot loop forever.
      for (let pages = 0; pages < 10_000; pages++) {
        const page = await api.getChanges(cursor, limit);
        await db.transaction(async () => {
          for (const item of page.items) await upsertHadith(db, item);
          for (const tomb of page.deleted) await deleteHadith(db, tomb.id);
          await setCursor(db, page.next_cursor);
        });
        applied += page.items.length;
        deleted += page.deleted.length;
        cursor = page.next_cursor;
        report({
          phase: 'delta',
          applied,
          fraction: manifest.counts.hadith ? Math.min(1, applied / Math.max(1, manifest.counts.hadith)) : undefined,
        });
        if (!page.has_more || page.next_cursor === '' ) break;
        if (isCaughtUp(cursor, manifest.latest_cursor)) break;
      }
    }

    if (opts.site) {
      report({ phase: 'extras' });
      try {
        const [announcements, files] = await Promise.all([opts.site.getAnnouncements(), opts.site.getFiles()]);
        await db.transaction(async () => {
          await replaceAnnouncements(db, announcements);
          await replaceFiles(db, files);
        });
      } catch {
        // Non-fatal: the site routes depend on Firebase, which may be down
        // while the hadith API is fine.
      }
    }

    const hadith = await countHadith(db);
    await setSyncResult(db, 'ok');
    report({ phase: 'done', fraction: 1 });
    if (applied === 0 && deleted === 0 && !usedSnapshot) return { status: 'up-to-date', cursor, hadith };
    return { status: 'ok', applied, deleted, cursor, usedSnapshot, hadith };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await setSyncResult(db, `error: ${message}`);
    } catch {
      // database may be unusable
    }
    return { status: 'error', error: message };
  }
}

function usableSnapshot(snapshot: SnapshotInfo): boolean {
  return Boolean(snapshot.url && snapshot.sha256) && snapshot.schema_version <= SCHEMA_VERSION;
}

/** Rough "how many rows would deltas carry": server count minus local, floored at 0. */
function estimateBehind(manifest: Manifest, local: number, cursor: string | null): number {
  if (!cursor) return manifest.counts.hadith;
  return Math.max(0, manifest.counts.hadith - local);
}
