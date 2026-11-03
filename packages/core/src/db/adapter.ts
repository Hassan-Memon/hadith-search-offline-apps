// The tiny database surface the core needs. Each platform implements it:
// Node (node:sqlite) for tests and the CLI, expo-sqlite on mobile,
// tauri-plugin-sql on desktop.

export type SqlValue = string | number | null | Uint8Array;

export interface DbAdapter {
  /** Run several statements separated by `;` (schema, migrations). */
  exec(sql: string): Promise<void>;
  /** Run one statement with parameters; no result rows. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  /** Run `fn` inside BEGIN … COMMIT (ROLLBACK on throw). Not re-entrant. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Default transaction helper for adapters whose driver has no transaction API. */
export async function runInTransaction<T>(db: Pick<DbAdapter, 'exec'>, fn: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // ignore: the transaction may already be gone
    }
    throw error;
  }
}
