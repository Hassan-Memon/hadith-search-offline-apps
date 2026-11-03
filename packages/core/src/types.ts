// Shapes shared between the Django sync API, the on-device database and the UIs.

/** A hadith document exactly as `/api/v1/hadith` and `/api/v1/sync/changes` return it. */
export interface HadithDoc {
  id: string;
  slug: string;
  title: string;
  book: string;
  type?: string | null;
  hukm?: string | null;
  /** JSON string of `[{ heading, content }]` (stored that way in the index). */
  html_content: string;
  raw_content: string;
  references?: string | null;
  tags?: string[] | null;
  authored_at?: string | null;
  created_at?: string | null;
  updated_at: string;
}

export interface HadithSection {
  heading?: string;
  content?: string;
}

/** A row of the `hadith` table. */
export interface HadithRow {
  id: string;
  slug: string;
  book: string;
  type: string | null;
  title_html: string;
  title_text: string;
  hukm_html: string | null;
  html_content: string;
  raw_content: string;
  references_html: string | null;
  tags_json: string;
  authored_at: string | null;
  created_at: string | null;
  updated_at: string;
}

/** What lists need: enough to render a card without loading the body. */
export interface HadithListItem {
  id: string;
  slug: string;
  book: string;
  title_html: string;
  title_text: string;
  hukm_html: string | null;
  updated_at: string;
}

export interface SearchHit extends HadithListItem {
  /** 0 = phrase match, 1 = all words, 2 = any word. */
  tier: number;
  /** Plain-text excerpt around the first match in the body (original text). */
  snippet: string;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  hits: SearchHit[];
}

export interface BookCount {
  book: string;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Tombstone {
  id: string;
  slug: string;
  deleted_at: string;
}

export interface SnapshotInfo {
  url: string;
  bytes: number;
  sha256: string;
  built_at: string;
  cursor: string;
  schema_version: number;
}

export interface Manifest {
  api_version: number;
  schema_version: number;
  min_app_version: string;
  generated_at: string;
  latest_cursor: string;
  counts: { hadith: number };
  snapshot: SnapshotInfo | null;
}

export interface ChangesPage {
  items: HadithDoc[];
  deleted: Tombstone[];
  next_cursor: string;
  has_more: boolean;
}

export interface SyncState {
  cursor: string | null;
  schema_version: number;
  snapshot_built_at: string | null;
  last_sync_at: string | null;
  last_result: string | null;
}

/** Announcement record as the website's `/api/announcements` returns it. */
export interface AnnouncementRecord {
  id: string;
  type: 'text-banner' | 'pop-over' | string;
  [key: string]: unknown;
}

/** PDF library record as `/api/files` returns it. */
export interface FileRecord {
  id: string;
  file: { name: string; url: string; type?: string; key?: string; size?: number };
  image?: { url?: string; key?: string } | null;
  [key: string]: unknown;
}
