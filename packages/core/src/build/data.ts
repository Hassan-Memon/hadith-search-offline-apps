// Builds the app's data directory from the website's public API.
//
// Runs in GitHub Actions on a schedule. It reads only what any visitor's
// browser reads (/api/all-hadees/<page>, /api/hadees-detail/<id>,
// /api/announcements, /api/files), so the website needs no changes.
//
// Incremental: the previous build is downloaded from the published site; only
// documents whose updated_at or slug changed are fetched again, and of those
// only documents whose content really changed go into the change file.
// Documents missing from the list become deletions. A normal run is ~91 small
// list requests.
//
// Cursors are "<epoch>:<n>". The epoch changes only on a full build; a device
// whose epoch differs from the manifest's installs the snapshot, so restarting
// the counter can never leave a device stuck as "caught up".
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { NodeSqliteAdapter } from '../adapters/node.js';
import { ensureSchema, SCHEMA_VERSION } from '../db/migrate.js';
import { countHadith, deleteHadith, setCursor, upsertHadith } from '../db/repo.js';
import { stripHtml } from '../html.js';
import { normalize } from '../normalize.js';
import { slimDocument } from '../slim.js';
import { formatStaticCursor, parseStaticCursor, type BuildEntry, type StaticManifest } from '../sync/static.js';
import type { HadithDoc, HadithRow, Tombstone } from '../types.js';

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
  /**
   * Most deletions one run may publish. Real deletions are rare, so more
   * than this is treated as a website problem unless allowMassDelete is set
   * (workflow input "allow_deletes").
   */
  maxDeletes?: number;
  allowMassDelete?: boolean;
  log?: (message: string) => void;
  now?: () => Date;
  userAgent?: string;
}

export interface BuildResult {
  cursor: string;
  total: number;
  /** Documents whose content changed (in the change file). */
  changed: number;
  deleted: number;
  /** Documents re-fetched because updated_at/slug moved, but with the same content. */
  timestampOnly: number;
  snapshot: string;
  reusedSnapshot: boolean;
  fullBuild: boolean;
  /** False when nothing a device or reader can see changed (the deploy can be skipped). */
  publish: boolean;
}

interface ListItem {
  id: string;
  slug?: string;
  updated_at?: string;
}

const MIN_APP_VERSION = '1.0.0';
const DEFAULT_UA = 'tehqeqat-offline-app-builder (+https://github.com/Hassan-Memon/hadith-search-offline-apps)';

class ClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

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

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** Why a fetched document cannot be published, or null when it is fine. */
export function validateDocument(doc: Partial<HadithDoc>, id: string): string | null {
  if (doc.id !== id) return `id ${String(doc.id)} instead of ${id}`;
  if (typeof doc.slug !== 'string' || !doc.slug.trim()) return 'missing slug';
  if (typeof doc.title !== 'string' || !doc.title.trim()) return 'missing title';
  if (typeof doc.book !== 'string' || !doc.book.trim()) return 'missing book';
  if (typeof doc.html_content !== 'string') return 'missing html_content';
  try {
    if (!Array.isArray(JSON.parse(doc.html_content))) return 'html_content is not a list';
  } catch {
    return 'html_content is not JSON';
  }
  if (typeof doc.raw_content !== 'string') return 'missing raw_content';
  if (typeof doc.updated_at !== 'string' || !doc.updated_at) return 'missing updated_at';
  return null;
}

/**
 * What the reader sees of a document. Two documents with the same fingerprint
 * need no update on devices even if updated_at moved.
 */
function fingerprint(d: {
  slug: string;
  book: string;
  type?: string | null;
  title: string;
  hukm?: string | null;
  html_content: string;
  references?: string | null;
  tags: string;
  body: string;
}): string {
  return sha256(
    JSON.stringify([d.slug, d.book, d.type ?? null, d.title, d.hukm ?? null, d.html_content, d.references ?? null, d.tags, d.body]),
  );
}

export async function buildData(o: BuildOptions): Promise<BuildResult> {
  const f = o.fetch ?? fetch;
  const log = o.log ?? (() => {});
  const site = o.site.replace(/\/$/, '');
  const prevBase = o.prevBase ? (o.prevBase.endsWith('/') ? o.prevBase : `${o.prevBase}/`) : undefined;
  const concurrency = o.concurrency ?? 2;
  const keep = o.keepBuilds ?? 120;
  const nowDate = (o.now ?? (() => new Date()))();
  const now = nowDate.toISOString();
  const headers = { Accept: 'application/json', 'User-Agent': o.userAgent ?? DEFAULT_UA };

  const getJson = <T>(url: string) =>
    withRetry(async () => {
      const res = await f(url, { headers });
      if (!res.ok) {
        const message = `HTTP ${res.status} for ${url}`;
        throw res.status < 500 ? new ClientError(message, res.status) : new Error(message);
      }
      return (await res.json()) as T;
    });
  const getBytes = (url: string) =>
    withRetry(async () => {
      const res = await f(url, { headers: { 'User-Agent': headers['User-Agent'] } });
      if (!res.ok) {
        const message = `HTTP ${res.status} for ${url}`;
        throw res.status < 500 ? new ClientError(message, res.status) : new Error(message);
      }
      return new Uint8Array(await res.arrayBuffer());
    });

  await mkdir(o.outDir, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'tq-data-'));
  const dbPath = join(work, 'hadith.sqlite');
  let db: NodeSqliteAdapter | null = null;

  try {
    // ---- previous build -------------------------------------------------------
    // A full build starts a new epoch and makes every device reinstall the
    // snapshot, so it happens only when there truly is no usable previous
    // build. A failure to *read* it (network, 5xx) stops the run instead; the
    // published data stays as it is and the next run tries again.
    let prev: StaticManifest | null = null;
    let prevSnapshot: Uint8Array | null = null;
    let fullReason: string | null = prevBase ? null : 'no previous build given';
    if (prevBase) {
      try {
        prev = await getJson<StaticManifest>(`${prevBase}manifest.json?t=${Date.now()}`);
      } catch (error) {
        if (!(error instanceof ClientError && error.status === 404)) {
          throw new Error(`cannot read the published build, not publishing: ${String(error)}`);
        }
        fullReason = 'nothing published yet';
      }
      if (prev && prev.schema_version !== SCHEMA_VERSION) fullReason = `schema ${prev.schema_version} → ${SCHEMA_VERSION}`;
      else if (prev && !prev.epoch) fullReason = 'previous build has no epoch';
      else if (prev && !prev.snapshot) fullReason = 'previous build has no snapshot';
      if (fullReason) {
        prev = null;
      } else if (prev?.snapshot) {
        const bytes = await getBytes(new URL(prev.snapshot.url, prevBase).href);
        if (sha256(bytes) !== prev.snapshot.sha256) throw new Error('previous snapshot checksum mismatch, not publishing');
        prevSnapshot = bytes;
        await writeFile(dbPath, gunzipSync(bytes));
        log(`previous build ${prev.latest_cursor}: ${prev.counts.hadith} hadith`);
      }
    }
    const fullBuild = !prev;
    if (fullBuild) log(`full build (${fullReason})`);

    const conn = new NodeSqliteAdapter(dbPath);
    db = conn;
    await ensureSchema(conn);

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
    // Safety: never publish from a broken or partial list.
    if (list.size !== total) throw new Error(`list incomplete: ${list.size} of ${total}, not publishing`);
    if (prev && total < prev.counts.hadith * 0.5) {
      throw new Error(`list shrank from ${prev.counts.hadith} to ${total}; refusing to publish`);
    }
    log(`website lists ${total} hadith on ${pages} pages`);

    // ---- what changed -----------------------------------------------------------
    const local = await conn.all<HadithRow & { body: string | null }>(
      'SELECT h.*, f.body FROM hadith h LEFT JOIN hadith_fts f ON f.id = h.id',
    );
    const localById = new Map(local.map((r) => [r.id, r]));
    const candidates = [...list.values()]
      .filter((item) => {
        const row = localById.get(item.id);
        return !row || !sameTime(row.updated_at, item.updated_at) || row.slug !== (item.slug ?? row.slug);
      })
      .map((item) => item.id);
    const deletedRows = local.filter((r) => !list.has(r.id));

    const maxDeletes = o.maxDeletes ?? Math.max(5, Math.ceil(local.length * 0.02));
    if (!fullBuild && deletedRows.length > maxDeletes && !o.allowMassDelete) {
      throw new Error(
        `${deletedRows.length} deletions in one run (limit ${maxDeletes}); refusing to publish. ` +
          `If the website really removed them, run the workflow by hand with allow_deletes.`,
      );
    }

    const fetched = await mapLimit(candidates, concurrency, async (id) => {
      const raw = await getJson<HadithDoc & { related?: unknown }>(`${site}/api/hadees-detail/${encodeURIComponent(id)}`);
      const { related: _related, ...doc } = raw;
      const problem = validateDocument(doc, id);
      return { id, doc: problem ? null : slimDocument(doc), problem };
    });
    const invalid = fetched.filter((x) => x.problem);
    if (invalid.length) {
      throw new Error(
        `${invalid.length} document(s) failed validation, not publishing: ` +
          invalid
            .slice(0, 5)
            .map((x) => `${x.id} (${x.problem})`)
            .join(', '),
      );
    }

    // Content comparison: only real changes go to devices.
    const docs: HadithDoc[] = [];
    const timestampOnly: HadithDoc[] = [];
    for (const { doc } of fetched) {
      const d = doc!;
      const row = localById.get(d.id);
      const tags = JSON.stringify(Array.isArray(d.tags) ? d.tags : []);
      const same =
        row &&
        fingerprint({ ...row, title: row.title_html, hukm: row.hukm_html, references: row.references_html, tags: row.tags_json, body: row.body ?? '' }) ===
          fingerprint({ ...d, tags, body: normalize(d.raw_content ?? '') });
      (same ? timestampOnly : docs).push(d);
    }
    const tombstones: Tombstone[] = deletedRows.map((r) => ({ id: r.id, slug: r.slug, deleted_at: now }));

    await conn.transaction(async () => {
      for (const doc of docs) await upsertHadith(conn, doc);
      // Keep the new timestamp so the next run does not fetch it again.
      for (const doc of timestampOnly) {
        await conn.run('UPDATE hadith SET updated_at = ? WHERE id = ?', [doc.updated_at, doc.id]);
      }
      for (const t of tombstones) await deleteHadith(conn, t.id);
    });
    log(`${docs.length} new or edited, ${timestampOnly.length} timestamp only, ${tombstones.length} deleted`);

    // ---- cursor and change files --------------------------------------------
    const epoch = prev?.epoch ?? String(nowDate.getTime());
    const prevSeq = prev ? parseStaticCursor(prev.latest_cursor).seq : 0;
    const changedContent = docs.length > 0 || tombstones.length > 0;
    const seq = fullBuild || changedContent ? prevSeq + 1 : prevSeq;
    const cursor = formatStaticCursor(epoch, seq);
    const dbChanged = fullBuild || changedContent || timestampOnly.length > 0;

    let builds: BuildEntry[] = prev ? [...(prev.builds ?? [])] : [];
    const newFile = !fullBuild && changedContent ? `changes-${epoch}-${seq}.json` : null;
    if (newFile) {
      await writeFile(join(o.outDir, newFile), JSON.stringify({ items: docs, deleted: tombstones }));
      builds.push({ cursor, file: newFile, items: docs.length, deleted: tombstones.length });
    }
    builds = builds.slice(-keep);
    // Carry the kept change files over from the published site. If one is
    // missing, drop it and everything older (devices then use the snapshot).
    for (let i = builds.length - 1; i >= 0; i--) {
      const b = builds[i]!;
      if (b.file === newFile) continue;
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
    if (prevSnapshot && prev?.snapshot && !dbChanged) {
      snapshotBytes = prevSnapshot;
      reusedSnapshot = true;
      conn.close();
    } else {
      await setCursor(conn, cursor);
      await conn.run('UPDATE sync_state SET snapshot_built_at = ?, last_sync_at = NULL, last_result = NULL WHERE id = 1', [now]);
      // Merge the full-text index segments (VACUUM alone leaves them as they
      // are), then compact. Rollback journal, not WAL, so the browser's OPFS
      // import accepts the file.
      await conn.exec("INSERT INTO hadith_fts(hadith_fts) VALUES('optimize')");
      await conn.exec('PRAGMA journal_mode = DELETE');
      await conn.exec('VACUUM');
      conn.close();
      snapshotBytes = gzipSync(await readFile(dbPath), { level: 9 });
    }
    db = null;
    const digest = sha256(snapshotBytes);
    const snapshotFile = `snapshot-${digest.slice(0, 16)}.sqlite.gz`;
    await writeFile(join(o.outDir, snapshotFile), snapshotBytes);

    // ---- announcements and the PDF list (keep the previous copy on failure) --
    let extrasChanged = false;
    for (const [name, path, pick] of [
      ['announcements.json', '/api/announcements', (d: unknown) => (d as { announcements?: unknown })?.announcements ?? d],
      ['files.json', '/api/files', (d: unknown) => d],
    ] as const) {
      const previous = prevBase ? await getJson<unknown>(`${prevBase}${name}`).catch(() => null) : null;
      let data: unknown;
      try {
        data = pick(await getJson<unknown>(`${site}${path}`));
        if (!Array.isArray(data)) throw new Error('not a list');
      } catch {
        data = previous ?? [];
      }
      if (JSON.stringify(data) !== JSON.stringify(previous)) extrasChanged = true;
      await writeFile(join(o.outDir, name), JSON.stringify(data));
    }

    const counted = new NodeSqliteAdapter(dbPath);
    const hadithCount = await countHadith(counted);
    counted.close();

    const publish = fullBuild || dbChanged || extrasChanged || builds.length !== (prev?.builds?.length ?? 0);
    const manifest: StaticManifest = {
      api_version: 1,
      schema_version: SCHEMA_VERSION,
      min_app_version: MIN_APP_VERSION,
      // When the data last changed (unchanged runs are not deployed).
      generated_at: publish || !prev ? now : prev.generated_at,
      epoch,
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
    log(
      `build ${cursor}: ${hadithCount} hadith, snapshot ${(snapshotBytes.byteLength / 1e6).toFixed(1)} MB` +
        `${reusedSnapshot ? ' (unchanged)' : ''}, ${builds.length} change files, publish=${publish}`,
    );

    return {
      cursor,
      total: hadithCount,
      changed: docs.length,
      deleted: tombstones.length,
      timestampOnly: timestampOnly.length,
      snapshot: snapshotFile,
      reusedSnapshot,
      fullBuild,
      publish,
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
