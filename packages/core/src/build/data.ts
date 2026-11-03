// Builds the app's data directory from the website's public API.
//
// Runs in GitHub Actions on a schedule. It reads only what any visitor's
// browser reads (/api/all-hadees/<page>, /api/hadees-detail/<id>,
// /api/announcements, /api/files), so the website needs no changes.
//
// Incremental: the previous build is downloaded from the published site; only
// documents whose updated_at or slug changed are fetched again, and documents
// missing from the list become deletions. A normal run is ~91 small list
// requests. Each run that changes something adds changes-<n>.json; devices
// apply those, or the snapshot when they are too far behind.
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { NodeSqliteAdapter } from '../adapters/node.js';
import { ensureSchema, SCHEMA_VERSION } from '../db/migrate.js';
import { countHadith, deleteHadith, setCursor, upsertHadith } from '../db/repo.js';
import { slimDocument } from '../slim.js';
import type { BuildEntry, StaticManifest } from '../sync/static.js';
import type { HadithDoc, Tombstone } from '../types.js';

export interface BuildOptions {
  /** Website origin, e.g. https://tehqeqatehadees.com */
  site: string;
  /** Published data directory of the previous build (omit for a full build). */
  prevBase?: string;
  outDir: string;
  fetch?: typeof fetch;
  concurrency?: number;
  /** How many change files to keep (older devices download the snapshot). */
  keepBuilds?: number;
  log?: (message: string) => void;
  now?: () => Date;
}

export interface BuildResult {
  cursor: string;
  total: number;
  changed: number;
  deleted: number;
  snapshot: string;
  reusedSnapshot: boolean;
  fullBuild: boolean;
}

interface ListItem {
  id: string;
  slug?: string;
  updated_at?: string;
}

const MIN_APP_VERSION = '1.0.0';

class ClientError extends Error {}

/** Retries network errors and 5xx; a 4xx answer will not change, so it fails at once. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ClientError) throw error;
      last = error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

// The list answers "…+00:00" and the detail "…Z" for the same moment, so
// timestamps are compared as times, not as text.
const sameTime = (a: string | undefined, b: string | undefined) => {
  const ta = Date.parse(a ?? '');
  const tb = Date.parse(b ?? '');
  return Number.isNaN(ta) || Number.isNaN(tb) ? (a ?? '') === (b ?? '') : ta === tb;
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function buildData(o: BuildOptions): Promise<BuildResult> {
  const f = o.fetch ?? fetch;
  const log = o.log ?? (() => {});
  const site = o.site.replace(/\/$/, '');
  const prevBase = o.prevBase ? (o.prevBase.endsWith('/') ? o.prevBase : `${o.prevBase}/`) : undefined;
  const concurrency = o.concurrency ?? 2;
  const keep = o.keepBuilds ?? 120;
  const now = (o.now ?? (() => new Date()))().toISOString();

  const getJson = <T>(url: string) =>
    withRetry(async () => {
      const res = await f(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new (res.status < 500 ? ClientError : Error)(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    });
  const getBytes = (url: string) =>
    withRetry(async () => {
      const res = await f(url);
      if (!res.ok) throw new (res.status < 500 ? ClientError : Error)(`HTTP ${res.status} for ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    });

  await mkdir(o.outDir, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'tq-data-'));
  const dbPath = join(work, 'hadith.sqlite');
  let db: NodeSqliteAdapter | null = null;

  try {
    // ---- previous build -------------------------------------------------------
    let prev: StaticManifest | null = null;
    let prevSnapshot: Uint8Array | null = null;
    if (prevBase) {
      try {
        prev = await getJson<StaticManifest>(`${prevBase}manifest.json?t=${Date.now()}`);
        if (prev.schema_version !== SCHEMA_VERSION || !prev.snapshot) throw new Error('schema changed');
        const bytes = await getBytes(new URL(prev.snapshot.url, prevBase).href);
        if (sha256(bytes) !== prev.snapshot.sha256) throw new Error('previous snapshot checksum mismatch');
        prevSnapshot = bytes;
        await writeFile(dbPath, gunzipSync(bytes));
        log(`previous build ${prev.latest_cursor}: ${prev.counts.hadith} hadith`);
      } catch (error) {
        log(`no usable previous build (${error instanceof Error ? error.message : String(error)}); full build`);
        prev = null;
        prevSnapshot = null;
      }
    }
    const fullBuild = !prev;

    db = new NodeSqliteAdapter(dbPath);
    await ensureSchema(db);

    // ---- current list from the website ----------------------------------------
    const first = await getJson<{ total_records: number; data: ListItem[] }>(`${site}/api/all-hadees/1`);
    const total = first.total_records;
    const perPage = first.data.length || 10;
    const pages = Math.ceil(total / perPage);
    const rest = await mapLimit(
      Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
      concurrency,
      (page) => getJson<{ data: ListItem[] }>(`${site}/api/all-hadees/${page}`),
    );
    const list = new Map<string, ListItem>();
    for (const item of [first, ...rest].flatMap((p) => p.data ?? [])) list.set(item.id, item);
    // Safety: never publish deletions from a broken or partial list.
    if (list.size !== total) throw new Error(`list incomplete: ${list.size} of ${total}`);
    if (prev && total < prev.counts.hadith * 0.5) {
      throw new Error(`list shrank from ${prev.counts.hadith} to ${total}; refusing to publish`);
    }
    log(`website lists ${total} hadith on ${pages} pages`);

    // ---- what changed -----------------------------------------------------------
    const local = await db.all<{ id: string; slug: string; updated_at: string }>(
      'SELECT id, slug, updated_at FROM hadith',
    );
    const localById = new Map(local.map((r) => [r.id, r]));
    const changedIds = [...list.values()]
      .filter((item) => {
        const row = localById.get(item.id);
        return !row || !sameTime(row.updated_at, item.updated_at) || row.slug !== (item.slug ?? row.slug);
      })
      .map((item) => item.id);
    const deletedRows = local.filter((r) => !list.has(r.id));

    const docs = await mapLimit(changedIds, concurrency, async (id) => {
      const raw = await getJson<HadithDoc & { related?: unknown }>(
        `${site}/api/hadees-detail/${encodeURIComponent(id)}`,
      );
      const { related: _related, ...doc } = raw;
      if (doc.id !== id) throw new Error(`detail for ${id} returned ${doc.id}`);
      return slimDocument({ ...doc, slug: doc.slug || id, updated_at: doc.updated_at ?? '' });
    });
    const tombstones: Tombstone[] = deletedRows.map((r) => ({ id: r.id, slug: r.slug, deleted_at: now }));

    const conn = db;
    await conn.transaction(async () => {
      for (const doc of docs) await upsertHadith(conn, doc);
      for (const t of tombstones) await deleteHadith(conn, t.id);
    });
    log(`${docs.length} new or edited, ${tombstones.length} deleted`);

    // ---- cursor and change files --------------------------------------------
    const prevSeq = prev ? Number(prev.latest_cursor) || 0 : 0;
    const changedSomething = docs.length > 0 || tombstones.length > 0;
    const seq = fullBuild || changedSomething ? prevSeq + 1 : prevSeq;
    const cursor = String(seq);

    let builds: BuildEntry[] = prev ? [...(prev.builds ?? [])] : [];
    if (!fullBuild && changedSomething) {
      const file = `changes-${seq}.json`;
      await writeFile(join(o.outDir, file), JSON.stringify({ items: docs, deleted: tombstones }));
      builds.push({ cursor, file, items: docs.length, deleted: tombstones.length });
    }
    builds = builds.slice(-keep);
    // Carry the kept change files over from the published site. If one is
    // missing, drop it and everything older (devices then use the snapshot).
    for (let i = builds.length - 1; i >= 0; i--) {
      const b = builds[i]!;
      if (b.cursor === cursor && changedSomething && !fullBuild) continue;
      try {
        await writeFile(join(o.outDir, b.file), await getBytes(new URL(b.file, prevBase).href));
      } catch {
        builds = builds.slice(i + 1);
        break;
      }
    }

    // ---- snapshot -------------------------------------------------------------
    let snapshotBytes: Uint8Array;
    let reusedSnapshot = false;
    if (prevSnapshot && prev?.snapshot && !changedSomething) {
      snapshotBytes = prevSnapshot;
      reusedSnapshot = true;
      db.close();
    } else {
      await setCursor(db, cursor);
      await db.run('UPDATE sync_state SET snapshot_built_at = ?, last_sync_at = NULL, last_result = NULL WHERE id = 1', [now]);
      // Merge the full-text index segments (VACUUM alone leaves them as they
      // are), then compact. Rollback journal, not WAL, so the browser's OPFS
      // import accepts the file.
      await db.exec("INSERT INTO hadith_fts(hadith_fts) VALUES('optimize')");
      await db.exec('PRAGMA journal_mode = DELETE');
      await db.exec('VACUUM');
      db.close();
      snapshotBytes = gzipSync(await readFile(dbPath), { level: 9 });
    }
    const digest = sha256(snapshotBytes);
    const snapshotFile = `snapshot-${digest.slice(0, 16)}.sqlite.gz`;
    await writeFile(join(o.outDir, snapshotFile), snapshotBytes);

    // ---- announcements and the PDF list (keep the previous copy on failure) --
    for (const [name, path, pick] of [
      ['announcements.json', '/api/announcements', (d: unknown) => (d as { announcements?: unknown })?.announcements ?? d],
      ['files.json', '/api/files', (d: unknown) => d],
    ] as const) {
      let data: unknown = [];
      try {
        data = pick(await getJson<unknown>(`${site}${path}`));
        if (!Array.isArray(data)) throw new Error('not a list');
      } catch {
        data = prevBase ? await getJson<unknown>(`${prevBase}${name}`).catch(() => []) : [];
      }
      await writeFile(join(o.outDir, name), JSON.stringify(data));
    }

    const counted = new NodeSqliteAdapter(dbPath);
    const hadithCount = await countHadith(counted);
    counted.close();

    const manifest: StaticManifest = {
      api_version: 1,
      schema_version: SCHEMA_VERSION,
      min_app_version: MIN_APP_VERSION,
      generated_at: now,
      latest_cursor: cursor,
      counts: { hadith: hadithCount },
      snapshot: {
        url: snapshotFile,
        bytes: snapshotBytes.byteLength,
        sha256: digest,
        built_at: reusedSnapshot && prev?.snapshot ? prev.snapshot.built_at : now,
        cursor,
        schema_version: SCHEMA_VERSION,
      },
      builds,
    };
    await writeFile(join(o.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    log(`build ${cursor}: ${hadithCount} hadith, snapshot ${(snapshotBytes.byteLength / 1e6).toFixed(1)} MB${reusedSnapshot ? ' (unchanged)' : ''}, ${builds.length} change files`);

    return {
      cursor,
      total: hadithCount,
      changed: docs.length,
      deleted: tombstones.length,
      snapshot: snapshotFile,
      reusedSnapshot,
      fullBuild,
    };
  } finally {
    try {
      db?.close();
    } catch {
      // already closed
    }
    await rm(work, { recursive: true, force: true });
  }
}
