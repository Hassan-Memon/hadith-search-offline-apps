// DbAdapter over Node's built-in SQLite (node:sqlite, Node ≥ 22.5, FTS5 included).
// Used by the tests and the sync CLI; desktop and mobile have their own adapters.
import { DatabaseSync } from 'node:sqlite';

import type { DbAdapter, SqlValue } from '../db/adapter.js';

export class NodeSqliteAdapter implements DbAdapter {
  private db: DatabaseSync;

  constructor(public readonly path: string = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }

  /** Close and reopen (after a snapshot file replaced the database on disk). */
  reopen(): void {
    try {
      this.db.close();
    } catch {
      // already closed (the installer closes before swapping the file)
    }
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }

  close(): void {
    this.db.close();
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async get<T>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw error;
    }
  }
}
