// Cursor "<updated_at_ms>|<slug>|<deleted_at_ms>" — see README "Sync contract".
export interface Cursor {
  updatedMs: number;
  slug: string;
  deletedMs: number;
}

export const EMPTY_CURSOR = '';

export function parseCursor(value: string | null | undefined): Cursor {
  if (!value) return { updatedMs: 0, slug: '', deletedMs: 0 };
  const parts = value.split('|');
  if (parts.length < 2 || parts.length > 3) throw new Error(`invalid cursor: ${value}`);
  const updatedMs = Number(parts[0]);
  const deletedMs = parts.length === 3 ? Number(parts[2]) : 0;
  if (!Number.isInteger(updatedMs) || !Number.isInteger(deletedMs) || updatedMs < 0 || deletedMs < 0) {
    throw new Error(`invalid cursor: ${value}`);
  }
  return { updatedMs, slug: parts[1] ?? '', deletedMs };
}

export function formatCursor(cursor: Cursor): string {
  if (cursor.updatedMs === 0 && cursor.deletedMs === 0 && !cursor.slug) return EMPTY_CURSOR;
  return `${cursor.updatedMs}|${cursor.slug}|${cursor.deletedMs}`;
}

/** Cursors are opaque; two are equal when their strings are equal. */
export function isCaughtUp(local: string | null | undefined, latest: string | null | undefined): boolean {
  return (local ?? '') === (latest ?? '');
}
