import type { AnnouncementRecord, ChangesPage, FileRecord, Manifest, Registry } from '../types.js';

export interface SyncApi {
  getManifest(): Promise<Manifest>;
  getChanges(since: string, limit: number): Promise<ChangesPage>;
  /** True when deltas cannot bring this cursor up to date (download the snapshot instead). */
  needsSnapshot?(cursor: string | null, manifest: Manifest): boolean;
  /** Books, chapters and narrators (`manifest.registry.url`). */
  getRegistry?(url: string): Promise<Registry>;
}

/** Announcements and the PDF list (data/announcements.json, data/files.json). */
export interface SiteApi {
  getAnnouncements(): Promise<AnnouncementRecord[]>;
  getFiles(): Promise<FileRecord[]>;
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
