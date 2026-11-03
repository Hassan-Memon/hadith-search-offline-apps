/// <reference lib="webworker" />
// SQLite (with FTS5) running in a worker. The database lives in the browser's
// Origin Private File System through the "opfs-sahpool" VFS, which needs no
// special server headers and works in Chrome/Edge/Android WebView, Safari 16.4+
// (iPhone) and Firefox. Where OPFS is missing the database is kept in memory
// and the app tells the user it cannot stay offline on that browser.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>;
type Db = InstanceType<Sqlite3['oo1']['DB']>;
type Bind = (string | number | null | Uint8Array)[];

export type WorkerRequest =
  | { id: number; op: 'open' }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'run' | 'all' | 'get'; sql: string; params?: Bind }
  | { id: number; op: 'import'; bytes: Uint8Array }
  | { id: number; op: 'reset' };

export interface OpenInfo {
  persistent: boolean;
  sqliteVersion: string;
}

const FILE = '/tehqeqat.sqlite3';

let sqlite3: Sqlite3 | null = null;
let pool: Pool | null = null;
let db: Db | null = null;

function openDb(): Db {
  const handle = pool ? new pool.OpfsSAHPoolDb(FILE) : new sqlite3!.oo1.DB(':memory:', 'c');
  handle.exec('PRAGMA foreign_keys = ON');
  return handle;
}

async function open(): Promise<OpenInfo> {
  sqlite3 ??= await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  if (!pool) {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'tehqeqat', initialCapacity: 4 });
    } catch {
      pool = null;
    }
  }
  db ??= openDb();
  return { persistent: Boolean(pool), sqliteVersion: sqlite3.version.libVersion };
}

function rows(sql: string, params?: Bind) {
  return db!.exec({
    sql,
    bind: params && params.length ? params : undefined,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as Record<string, unknown>[];
}

/** Replace the whole database with a downloaded snapshot. */
async function importDb(bytes: Uint8Array) {
  db?.close();
  db = null;
  if (pool) {
    await pool.importDb(FILE, bytes);
    db = openDb();
    return;
  }
  // In-memory fallback: hand the bytes to SQLite with sqlite3_deserialize.
  const s = sqlite3!;
  db = new s.oo1.DB(':memory:', 'c');
  const pointer = s.wasm.allocFromTypedArray(bytes);
  const flags = s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE;
  const rc = s.capi.sqlite3_deserialize(db.pointer!, 'main', pointer, bytes.byteLength, bytes.byteLength, flags);
  db.checkRc(rc);
  db.exec('PRAGMA foreign_keys = ON');
}

/** Delete everything (settings → "remove downloaded data"). */
async function reset() {
  db?.close();
  db = null;
  if (pool) await pool.wipeFiles();
  db = openDb();
}

async function handle(req: WorkerRequest): Promise<unknown> {
  if (req.op === 'open') return open();
  if (!db) await open();
  switch (req.op) {
    case 'exec':
      db!.exec(req.sql);
      return null;
    case 'run':
      db!.exec({ sql: req.sql, bind: req.params && req.params.length ? req.params : undefined });
      return null;
    case 'all':
      return rows(req.sql, req.params);
    case 'get':
      return rows(req.sql, req.params)[0];
    case 'import':
      await importDb(req.bytes);
      return null;
    case 'reset':
      await reset();
      return null;
  }
}

// One request at a time: SQLite calls are synchronous, but open/import are
// not, and nothing may run against a database that is being replaced.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  queue = queue.then(async () => {
    try {
      const result = await handle(req);
      self.postMessage({ id: req.id, ok: true, result });
    } catch (error) {
      self.postMessage({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
