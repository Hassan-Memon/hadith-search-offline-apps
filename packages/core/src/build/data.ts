// Builds the app's data directory from the website's public API.
//
// Runs in GitHub Actions on a schedule. It reads only what any visitor's
// browser reads (/api/all-hadees/<page>, /api/hadees-detail/<id>,
// /api/books, /api/chapters, /api/narrators, /api/announcements, /api/files),
// so the website needs no changes.
//
// A hadith's باب and date come with the list, so moving a hadith to another
// باب (which does not change its updated_at) reaches devices as a small
// "meta" entry of the change file, without fetching the hadith again.
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
import {
  countHadith,
  deleteHadith,
  narratorRefs,
  replaceRegistry,
  setCursor,
  setSetting,
  updateHadithMeta,
  upsertHadith,
} from '../db/repo.js';
import { stripHtml } from '../html.js';
import { normalize } from '../normalize.js';
import { slimDocument } from '../slim.js';
import { REGISTRY_SETTING } from '../sync/engine.js';
import { formatStaticCursor, parseStaticCursor, type BuildEntry, type StaticManifest } from '../sync/static.js';
import type { HadithDoc, HadithRow, MetaUpdate, Narrator, Registry, Tombstone } from '../types.js';

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
  /** Parallel /api/hadees-detail requests (default 1, gentle on the website). */
  detailConcurrency?: number;
  /** Base delay between retries (tests use a small value). */
  retryDelayMs?: number;
}

export interface BuildResult {
  cursor: string;
  total: number;
  /** Documents whose content changed (in the change file). */
  changed: number;
  /** Hadith whose باب or date changed without the text changing. */
  meta: number;
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
  chapter?: string | null;
  authored_at?: string | null;
}

/** What the website's registries answer (only the fields the app uses). */
export interface SiteBook {
  name: string;
  volume_no?: number | null;
  sort_order?: number | null;
  is_series?: boolean;
  published_at?: string | null;
  aliases?: string[];
  pdf_file_id?: string | null;
  count?: number;
  pdf_pages_count?: number;
}
interface SiteChapter {
  slug: string;
  name: string;
  parent?: string | null;
  order?: number | null;
  description?: string | null;
}
interface SiteNarrator extends Partial<Narrator> {
  slug: string;
  name: string;
  study_count?: number;
  hadith_count?: number;
  chars?: number;
}

/**
 * Apps older than this cannot read the data. Schema 3 (narrators' Arabic
 * names) needs no new app version for that: an app on schema 2 sees the
 * manifest's schema 3 and updates itself before it syncs.
 */
const MIN_APP_VERSION = '1.2.0';
/** The oldest published schema the builder upgrades in place (2 → 3 adds two registry columns). */
const FIRST_UPGRADABLE_SCHEMA = 2;
const SIGNATURES_FILE = 'narrator-signatures.json';
/** Narrators whose entry changed in one run before the run refetches every hadith instead. */
const MAX_NARRATOR_LOOKUPS = 40;
const DEFAULT_UA = 'tehqeqat-offline-app-builder (+https://github.com/Hassan-Memon/hadith-search-offline-apps)';

class ClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Retries network errors and 5xx. A 4xx usually will not change, so it fails
 * at once, unless retryNotFound is set: the website answers 404 for a hadith
 * whenever its search engine has a short hiccup (Django turns the error into
 * an empty answer), so a 404 for a hadith the list just named is retried.
 */
async function withRetry<T>(fn: () => Promise<T>, tries = 3, retryNotFound = false, delayMs = 1000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ClientError && !(retryNotFound && error.status === 404)) throw error;
      last = error;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
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

/** «2020-03-01T00:00:00» and «2020-03-01» are the same date; the app shows only the date. */
export const dateOnly = (value: string | null | undefined): string | null =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/** A narrator's entry in the website's index, as a string that changes when its studies change. */
const narratorSignature = (n: SiteNarrator) =>
  JSON.stringify([n.name, n.study_count ?? null, n.hadith_count ?? null, n.chars ?? null]);

/** The website's registries in the shape devices store. */
export function toRegistry(books: SiteBook[], chapters: SiteChapter[], narrators: SiteNarrator[]): Registry {
  return {
    books: books
      .filter((b) => typeof b.name === 'string' && b.name.trim())
      .map((b) => ({
        name: b.name,
        volume_no: typeof b.volume_no === 'number' ? b.volume_no : null,
        sort_order: typeof b.sort_order === 'number' ? b.sort_order : null,
        is_series: Boolean(b.is_series),
        published_at: dateOnly(b.published_at),
        aliases: Array.isArray(b.aliases) ? b.aliases.filter((a) => typeof a === 'string') : [],
        // Only when every narration's pages are known can the app offer them without asking first.
        pdf_pages: Boolean(b.pdf_file_id) && (b.count ?? 0) > 0 && (b.pdf_pages_count ?? 0) >= (b.count ?? 0),
      })),
    chapters: chapters
      .filter((c) => typeof c.slug === 'string' && c.slug && typeof c.name === 'string')
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        parent: c.parent ?? null,
        sort_order: typeof c.order === 'number' ? c.order : null,
        description: c.description || null,
      })),
    narrators: narrators
      .filter((n) => typeof n.slug === 'string' && n.slug && typeof n.name === 'string')
      .map((n) => ({
        slug: n.slug,
        name: n.name,
        aliases: Array.isArray(n.aliases) ? n.aliases.filter((a) => typeof a === 'string') : [],
        death_note: n.death_note || null,
        death_year: typeof n.death_year === 'number' ? n.death_year : null,
        century: typeof n.century === 'number' ? n.century : null,
        arabic_name: typeof n.arabic_name === 'string' && n.arabic_name.trim() ? n.arabic_name.trim() : null,
        excerpt: typeof n.excerpt === 'string' && n.excerpt.trim() ? n.excerpt.trim() : null,
      })),
  };
}

/**
 * The PDF library in the order the website shows it (since 13 Nov 2026): the
 * books' order in the book registry, each book pointing at its file; a file
 * no book points at keeps its place after them. A file a book points at also
 * gets the book's name (`book`), which the app shows instead of «Vol-1.pdf»
 * and links to that book's narrations; older apps ignore the field.
 */
export function inBookOrder<T>(files: T[], books: SiteBook[]): (T & { book?: string })[] {
  const linked = new Map<string, { rank: number; name: string }>();
  [...books]
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
    .forEach((b, i) => {
      if (b.pdf_file_id && !linked.has(b.pdf_file_id)) linked.set(b.pdf_file_id, { rank: i, name: b.name });
    });
  const id = (f: T) => String((f as { id?: unknown })?.id ?? '');
  return files
    .map((f, i) => ({ f, i, book: linked.get(id(f)) }))
    .sort((a, b) => (a.book?.rank ?? Infinity) - (b.book?.rank ?? Infinity) || a.i - b.i)
    .map(({ f, book }) => (book && f && typeof f === 'object' ? { ...f, book: book.name } : (f as T & { book?: string })));
}

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
  chapter?: string | null;
  narrators: string;
  authored_at?: string | null;
}): string {
  return sha256(
    JSON.stringify([
      d.slug,
      d.book,
      d.type ?? null,
      d.title,
      d.hukm ?? null,
      d.html_content,
      d.references ?? null,
      d.tags,
      d.body,
      d.chapter || null,
      d.narrators,
      dateOnly(d.authored_at),
    ]),
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

  const getJson = <T>(url: string, retryNotFound = false) =>
    withRetry(
      async () => {
        const res = await f(url, { headers });
        if (!res.ok) {
          const message = `HTTP ${res.status} for ${url}`;
          throw res.status < 500 ? new ClientError(message, res.status) : new Error(message);
        }
        return (await res.json()) as T;
      },
      retryNotFound ? 5 : 3,
      retryNotFound,
      o.retryDelayMs ?? 1000,
    );
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
      // A newer schema that only adds columns (see MIGRATIONS) upgrades the
      // published snapshot in place: devices migrate the same way and keep
      // their data, so no one downloads the whole snapshot again.
      if (prev && (prev.schema_version < FIRST_UPGRADABLE_SCHEMA || prev.schema_version > SCHEMA_VERSION)) {
        fullReason = `schema ${prev.schema_version} → ${SCHEMA_VERSION}`;
      }
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

    // ---- registries: books, chapters, narrators ---------------------------------
    // Each keeps the previously published copy when the website cannot answer.
    const prevRegistry =
      prev?.registry?.url && prevBase
        ? await getJson<Registry>(new URL(prev.registry.url, prevBase).href).catch(() => null)
        : null;
    // Builder-only bookkeeping (devices never read it): what each narrator's
    // index entry looked like last run.
    const prevSignatures =
      prev && prevBase ? await getJson<Record<string, string>>(`${prevBase}${SIGNATURES_FILE}`).catch(() => null) : null;
    const siteList = async <T>(path: string, key: string): Promise<T[] | null> => {
      try {
        const data = await getJson<Record<string, unknown>>(`${site}${path}`);
        const rows = data?.[key];
        return Array.isArray(rows) && rows.length > 0 ? (rows as T[]) : null;
      } catch (error) {
        log(`${path} unavailable (${String(error)}); keeping the previous copy`);
        return null;
      }
    };
    const [siteBooks, siteChapters, siteNarrators] = await Promise.all([
      siteList<SiteBook>('/api/books', 'books'),
      siteList<SiteChapter>('/api/chapters', 'chapters'),
      siteList<SiteNarrator>('/api/narrators', 'narrators'),
    ]);
    const fresh = toRegistry(siteBooks ?? [], siteChapters ?? [], siteNarrators ?? []);
    const registry: Registry = {
      books: siteBooks ? fresh.books : (prevRegistry?.books ?? []),
      chapters: siteChapters ? fresh.chapters : (prevRegistry?.chapters ?? []),
      narrators: siteNarrators ? fresh.narrators : (prevRegistry?.narrators ?? []),
    };
    const signatures: Record<string, string> = siteNarrators
      ? Object.fromEntries(siteNarrators.map((n) => [n.slug, narratorSignature(n)]))
      : (prevSignatures ?? {});

    // A narrator whose studies changed without his narrations being edited
    // (the website improved how it reads headings): fetch those narrations
    // again so their pointers are current. Not needed on a full build.
    const extra = new Set<string>();
    if (!fullBuild && siteNarrators && prevSignatures) {
      const before = prevSignatures;
      const changedSlugs = [
        ...Object.keys(signatures).filter((slug) => before[slug] !== signatures[slug]),
        ...Object.keys(before).filter((slug) => !(slug in signatures)),
      ];
      if (changedSlugs.length > MAX_NARRATOR_LOOKUPS) {
        log(`${changedSlugs.length} narrators changed: fetching every hadith with narrators again`);
        for (const r of local) if (r.narrators_json && r.narrators_json !== '[]') extra.add(r.id);
        for (const slug of changedSlugs) {
          if (!(slug in signatures)) continue;
          const detail = await getJson<{ hadith_ids?: string[] }>(`${site}/api/narrators/${encodeURIComponent(slug)}`).catch(
            () => null,
          );
          for (const id of detail?.hadith_ids ?? []) extra.add(id);
        }
      } else {
        for (const slug of changedSlugs) {
          for (const r of local) if (r.narrators_json?.includes(`"${slug}"`)) extra.add(r.id);
          if (slug in signatures) {
            const detail = await getJson<{ hadith_ids?: string[] }>(
              `${site}/api/narrators/${encodeURIComponent(slug)}`,
            ).catch(() => null);
            for (const id of detail?.hadith_ids ?? []) extra.add(id);
          }
        }
      }
    }
    for (const id of extra) if (list.has(id) && !candidates.includes(id)) candidates.push(id);

    const maxDeletes = o.maxDeletes ?? Math.max(5, Math.ceil(local.length * 0.02));
    if (!fullBuild && deletedRows.length > maxDeletes && !o.allowMassDelete) {
      throw new Error(
        `${deletedRows.length} deletions in one run (limit ${maxDeletes}); refusing to publish. ` +
          `If the website really removed them, run the workflow by hand with allow_deletes.`,
      );
    }

    // One at a time: each detail request also makes the website run a
    // "related hadith" search, and its search engine is small.
    const fetched = await mapLimit(candidates, o.detailConcurrency ?? 1, async (id) => {
      const raw = await getJson<HadithDoc & { related?: unknown }>(
        `${site}/api/hadees-detail/${encodeURIComponent(id)}`,
        true,
      );
      const { related: _related, ...doc } = raw;
      const problem = validateDocument(doc, id);
      if (problem) return { id, doc: null, problem };
      const fromList = list.get(id);
      const slim = slimDocument({
        ...doc,
        chapter: doc.chapter ?? fromList?.chapter ?? null,
        // Only slug and section range: the name comes from the narrator registry.
        narrators: narratorRefs(doc.narrators),
        authored_at: dateOnly(doc.authored_at ?? fromList?.authored_at),
      });
      return { id, doc: slim, problem: null };
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
        fingerprint({
          ...row,
          title: row.title_html,
          hukm: row.hukm_html,
          references: row.references_html,
          tags: row.tags_json,
          body: row.body ?? '',
          narrators: row.narrators_json ?? '[]',
        }) === fingerprint({ ...d, tags, body: normalize(d.raw_content ?? ''), narrators: JSON.stringify(d.narrators ?? []) });
      (same ? timestampOnly : docs).push(d);
    }
    const tombstones: Tombstone[] = deletedRows.map((r) => ({ id: r.id, slug: r.slug, deleted_at: now }));

    // باب or date changed on the website without the text (and updated_at)
    // changing: the list says so, no detail request needed.
    const fetchedIds = new Set(candidates);
    const meta: MetaUpdate[] = [];
    for (const item of list.values()) {
      const row = localById.get(item.id);
      if (!row || fetchedIds.has(item.id)) continue;
      const chapter = 'chapter' in item ? item.chapter || null : row.chapter;
      const authored = 'authored_at' in item ? dateOnly(item.authored_at) : dateOnly(row.authored_at);
      if (chapter !== (row.chapter || null) || authored !== dateOnly(row.authored_at)) {
        meta.push({ id: item.id, chapter, authored_at: authored });
      }
    }

    await conn.transaction(async () => {
      for (const doc of docs) await upsertHadith(conn, doc);
      // Keep the new timestamp so the next run does not fetch it again.
      for (const doc of timestampOnly) {
        await conn.run('UPDATE hadith SET updated_at = ? WHERE id = ?', [doc.updated_at, doc.id]);
      }
      for (const m of meta) await updateHadithMeta(conn, m);
      for (const t of tombstones) await deleteHadith(conn, t.id);
    });
    log(
      `${docs.length} new or edited, ${meta.length} باب/date only, ${timestampOnly.length} timestamp only, ` +
        `${tombstones.length} deleted`,
    );

    // The registries go into the snapshot too, so a new device has them at once.
    const registryJson = JSON.stringify(registry);
    await writeFile(join(o.outDir, SIGNATURES_FILE), JSON.stringify(signatures));
    const registryDigest = sha256(registryJson);
    const registryFile = `registry-${registryDigest.slice(0, 16)}.json`;
    await writeFile(join(o.outDir, registryFile), registryJson);
    const registryChanged = registryDigest !== prev?.registry?.sha256;
    if (registryChanged || fullBuild) {
      await conn.transaction(async () => {
        await replaceRegistry(conn, registry);
        await setSetting(conn, REGISTRY_SETTING, registryDigest);
      });
    }
    log(
      `registry: ${registry.books.length} books, ${registry.chapters.length} chapters, ` +
        `${registry.narrators.length} narrators${registryChanged ? ' (changed)' : ''}`,
    );

    // ---- cursor and change files --------------------------------------------
    const epoch = prev?.epoch ?? String(nowDate.getTime());
    const prevSeq = prev ? parseStaticCursor(prev.latest_cursor).seq : 0;
    const changedContent = docs.length > 0 || tombstones.length > 0 || meta.length > 0;
    const seq = fullBuild || changedContent ? prevSeq + 1 : prevSeq;
    const cursor = formatStaticCursor(epoch, seq);
    const dbChanged = fullBuild || changedContent || timestampOnly.length > 0 || registryChanged;

    let builds: BuildEntry[] = prev ? [...(prev.builds ?? [])] : [];
    const newFile = !fullBuild && changedContent ? `changes-${epoch}-${seq}.json` : null;
    if (newFile) {
      await writeFile(join(o.outDir, newFile), JSON.stringify({ items: docs, deleted: tombstones, meta }));
      builds.push({ cursor, file: newFile, items: docs.length + meta.length, deleted: tombstones.length });
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
        if (name === 'files.json' && siteBooks) data = inBookOrder(data, siteBooks);
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
      registry: { url: registryFile, sha256: registryDigest },
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
      meta: meta.length,
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
