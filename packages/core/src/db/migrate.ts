import type { DbAdapter } from './adapter.js';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.generated.js';

/**
 * Bring a database (fresh, or a downloaded snapshot that only has the hadith
 * tables) to the current schema. Every statement in schema.sql is
 * `IF NOT EXISTS`, so running it is always safe. Version-specific migrations
 * go in MIGRATIONS keyed by the version they upgrade *from*.
 */
const MIGRATIONS: Record<number, (string | ((db: DbAdapter) => Promise<void>))[]> = {
  // 1 → 2: chapters, narrators and the book registry (the new tables come
  // from schema.sql; only the new hadith columns need ALTER).
  1: [
    'ALTER TABLE hadith ADD COLUMN chapter TEXT',
    "ALTER TABLE hadith ADD COLUMN narrators_json TEXT NOT NULL DEFAULT '[]'",
  ],
  // 2 → 3: narrators' Arabic names and card excerpts. Only the registry
  // fills them, so a device keeps its data and fetches the registry again.
  // Forgetting the registry's checksum makes the next sync download it.
  // (A version 1 file has no narrators table yet: schema.sql creates it whole.)
  2: [
    async (db) => {
      if (!(await hasTable(db, 'narrators'))) return;
      await db.exec('ALTER TABLE narrators ADD COLUMN arabic_name TEXT');
      await db.exec('ALTER TABLE narrators ADD COLUMN excerpt TEXT');
    },
    async (db) => {
      if (await hasTable(db, 'settings')) await db.exec("DELETE FROM settings WHERE key = 'registry_sha256'");
    },
  ],
};

async function hasTable(db: DbAdapter, name: string): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
}

export async function ensureSchema(db: DbAdapter): Promise<{ from: number; to: number }> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const from = Number(row?.user_version ?? 0);
  // Columns first: schema.sql indexes columns an older file does not have yet.
  // (A fresh file, version 0, gets everything from schema.sql.)
  if (from > 0) {
    for (let v = from; v < SCHEMA_VERSION; v++) {
      for (const step of MIGRATIONS[v] ?? []) {
        if (typeof step === 'string') await db.exec(step);
        else await step(db);
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
