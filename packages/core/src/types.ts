// Shapes shared between the Django sync API, the on-device database and the UIs.

/** A hadith document as the website's /api/hadees-detail returns it (and changes-<n>.json carries it). */
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
  /** Slug of its باب in the chapter registry. */
  chapter?: string | null;
  /** Narrators whose study is in this research: sections start…end (inclusive). */
  narrators?: NarratorRef[] | null;
  authored_at?: string | null;
  created_at?: string | null;
  updated_at: string;
}

export interface NarratorRef {
  slug: string;
  start: number;
  end: number;
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
  chapter: string | null;
  narrators_json: string;
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
  chapter: string | null;
  updated_at: string;
}

export interface SearchHit extends HadithListItem {
  /** The search level that found it: 0 = exact words, 1 = endings loose, 2 = half the words (see search.ts). */
  tier: number;
  /** Plain-text excerpt around the first match in the body (original text). */
  snippet: string;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  hits: SearchHit[];
  /** The exact words found too little, so looser spellings or fewer words were used. */
  relaxed?: boolean;
}

export interface BookCount {
  book: string;
  count: number;
  /** From the book registry when the book is in it. */
  volume_no?: number | null;
  sort_order?: number | null;
  is_series?: number | null;
  published_at?: string | null;
  /** 1 when every narration of the book has its pages in the book's PDF. */
  pdf_pages?: number | null;
}

export interface ChapterCount {
  slug: string;
  name: string;
  parent: string | null;
  sort_order: number | null;
  description: string | null;
  count: number;
}

export interface Narrator {
  slug: string;
  /** Urdu name, as the research writes it. */
  name: string;
  /** Arabic name with diacritics, as the book's «فہرستِ رُوات» writes it (shown when present). */
  arabic_name?: string | null;
  aliases: string[];
  death_note: string | null;
  death_year: number | null;
  century: number | null;
  /** The opening of the study the website shows (from his latest volume), for cards. */
  excerpt?: string | null;
}

/** The website's book, chapter and narrator registries (data/registry-<sha>.json). */
export interface Registry {
  books: {
    name: string;
    volume_no: number | null;
    sort_order: number | null;
    is_series: boolean;
    published_at: string | null;
    aliases: string[];
    pdf_pages: boolean;
  }[];
  chapters: { slug: string; name: string; parent: string | null; sort_order: number | null; description: string | null }[];
  narrators: Narrator[];
}

/** A change that does not touch the text: the hadith moved to another باب or got a date. */
export interface MetaUpdate {
  id: string;
  chapter: string | null;
  authored_at: string | null;
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
  /** The registries; a device downloads them only when sha256 changed. */
  registry?: { url: string; sha256: string } | null;
}

export interface ChangesPage {
  items: HadithDoc[];
  deleted: Tombstone[];
  meta?: MetaUpdate[];
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
