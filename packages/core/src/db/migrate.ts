import type { DbAdapter } from './adapter.js';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.generated.js';

/**
 * Bring a database (fresh, or a downloaded snapshot that only has the hadith
 * tables) to the current schema. Every statement in schema.sql is
 * `IF NOT EXISTS`, so running it is always safe. Version-specific migrations
 * go in MIGRATIONS keyed by the version they upgrade *from*.
 */
const MIGRATIONS: Record<number, string[]> = {
  // 1 → 2: chapters, narrators and the book registry (the new tables come
  // from schema.sql; only the new hadith columns need ALTER).
  1: [
    'ALTER TABLE hadith ADD COLUMN chapter TEXT',
    "ALTER TABLE hadith ADD COLUMN narrators_json TEXT NOT NULL DEFAULT '[]'",
  ],
};

export async function ensureSchema(db: DbAdapter): Promise<{ from: number; to: number }> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const from = Number(row?.user_version ?? 0);
  // Columns first: schema.sql indexes columns an older file does not have yet.
  // (A fresh file, version 0, gets everything from schema.sql.)
  if (from > 0) {
    for (let v = from; v < SCHEMA_VERSION; v++) {
      for (const statement of MIGRATIONS[v] ?? []) {
        await db.exec(statement);
      }
    }
  }
  await db.exec(SCHEMA_SQL);
  await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  await db.run(
    `INSERT INTO sync_state (id, cursor, schema_version) VALUES (1, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version`,
    [SCHEMA_VERSION],
  );
  return { from, to: SCHEMA_VERSION };
}

export { SCHEMA_SQL, SCHEMA_VERSION };
