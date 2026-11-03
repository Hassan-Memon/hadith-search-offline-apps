import type { AnnouncementRecord, ChangesPage, FileRecord, Manifest } from '../types.js';

export interface SyncApi {
  getManifest(): Promise<Manifest>;
  getChanges(since: string, limit: number): Promise<ChangesPage>;
}

/** Website Next API routes used for the small Firestore-backed collections. */
export interface SiteApi {
  getAnnouncements(): Promise<AnnouncementRecord[]>;
  getFiles(): Promise<FileRecord[]>;
}

export interface HttpOptions {
  /** e.g. https://tehqeqatehadees.com/api/v1/sync */
  syncBaseUrl: string;
  /** e.g. https://tehqeqatehadees.com/api */
  siteBaseUrl?: string;
  fetch?: typeof fetch;
  /** Kept for logging on the client; not sent (see getJson). */
  appVersion?: string;
  timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

async function getJson<T>(url: string, opts: HttpOptions): Promise<T> {
  const f = opts.fetch ?? fetch;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000) : null;
  try {
    const res = await f(url, {
      // Only "simple" headers: a custom header would make browsers send a CORS
      // preflight first, which doubles the round trips on slow connections.
      headers: { Accept: 'application/json' },
      signal: controller?.signal ?? null,
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createHttpApi(opts: HttpOptions): SyncApi & SiteApi {
  const sync = opts.syncBaseUrl.replace(/\/$/, '');
  const site = (opts.siteBaseUrl ?? sync.replace(/\/(?:v1\/)?sync$/, '')).replace(/\/$/, '');
  return {
    getManifest: async () => {
      const manifestUrl = `${sync}/manifest`;
      const manifest = await getJson<Manifest>(manifestUrl, opts);
      // The website returns a relative snapshot URL; resolve it here.
      if (manifest.snapshot?.url) manifest.snapshot.url = new URL(manifest.snapshot.url, manifestUrl).href;
      return manifest;
    },
    getChanges: (since, limit) =>
      getJson<ChangesPage>(
        `${sync}/changes?since=${encodeURIComponent(since)}&limit=${Math.min(500, Math.max(1, limit))}`,
        opts,
      ),
    getAnnouncements: async () => {
      // The website answers { announcements: [...], message }.
      const data = await getJson<unknown>(`${site}/announcements`, opts);
      const list = Array.isArray(data)
        ? data
        : (data as { announcements?: unknown } | null)?.announcements;
      return Array.isArray(list) ? (list as AnnouncementRecord[]) : [];
    },
    getFiles: async () => {
      const data = await getJson<unknown>(`${site}/files`, opts);
      return Array.isArray(data) ? (data as FileRecord[]) : [];
    },
  };
}
