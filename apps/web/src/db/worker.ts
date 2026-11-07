/// <reference lib="webworker" />
// SQLite (with FTS5) running in a worker. The database lives in the browser's
// Origin Private File System through the "opfs-sahpool" VFS, which needs no
// special server headers and works in Chrome/Edge/Android WebView, Safari 16.4+
// (iPhone) and Firefox.
//
// That VFS holds exclusive handles on its files, so only one window of the app
// can have the database open at a time (the installed app and a browser tab,
// two desktop windows, or a page that is reloading while the old one is still
// shutting down). The main thread decides which window owns it (client.ts);
// this worker opens the files on 'open' and lets go of them on 'release'.
// Only a browser with no OPFS at all gets an in-memory database.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import { BUSY } from './shared';

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>;
type Db = InstanceType<Sqlite3['oo1']['DB']>;
type Bind = (string | number | null | Uint8Array)[];

export type WorkerRequest =
  | { id: number; op: 'open' }
  | { id: number; op: 'release' }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'run' | 'all' | 'get'; sql: string; params?: Bind }
  | { id: number; op: 'import'; bytes: Uint8Array }
  | { id: number; op: 'reset' };

export interface OpenInfo {
  persistent: boolean;
  sqliteVersion: string;
}


const FILE = '/tehqeqat.sqlite3';
const VFS = 'tehqeqat';
/** How long to wait for another window (or the page being reloaded) to let go. */
const BUSY_WAIT_MS = 15_000;

let sqlite3: Sqlite3 | null = null;
let pool: Pool | null = null;
/** True when this browser has no usable OPFS: data lives in memory only. */
let memoryOnly = false;
let db: Db | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openDb(): Db {
  const handle = pool ? new pool.OpfsSAHPoolDb(FILE) : new sqlite3!.oo1.DB(':memory:', 'c');
  handle.exec('PRAGMA foreign_keys = ON');
  return handle;
}

function opfsMissing(): boolean {
  return (
    typeof navigator === 'undefined' ||
    !navigator.storage?.getDirectory ||
    typeof FileSystemFileHandle === 'undefined' ||
    !('createSyncAccessHandle' in FileSystemFileHandle.prototype)
  );
}

/** Install the VFS, or take its files back after a release. Retries while another window holds them. */
async function acquirePool(): Promise<void> {
  const deadline = Date.now() + BUSY_WAIT_MS;
  for (let delay = 100; ; delay = Math.min(delay * 2, 1000)) {
    try {
      if (!pool) {
        // forceReinitIfPreviouslyFailed: without it a failed attempt is cached
        // and every retry fails too (supported, but missing from the types).
        const options = { name: VFS, initialCapacity: 4, forceReinitIfPreviouslyFailed: true };
        pool = await sqlite3!.installOpfsSAHPoolVfs(options as Parameters<Sqlite3['installOpfsSAHPoolVfs']>[0]);
      } else if (pool.isPaused()) {
        await pool.unpauseVfs();
      }
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw new Error(`${BUSY}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(delay);
    }
  }
}

async function open(): Promise<OpenInfo> {
  sqlite3 ??= await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  if (!db) {
    if (!memoryOnly && opfsMissing()) memoryOnly = true;
    if (!memoryOnly) await acquirePool();
    db = openDb();
  }
  return { persistent: !memoryOnly, sqliteVersion: sqlite3.version.libVersion };
}

/** Close the database and give its files back so another window can open them. */
function release() {
  if (memoryOnly) return; // nothing is shared; keep the in-memory data
  db?.close(); // an open transaction is rolled back
  db = null;
  if (pool && !pool.isPaused()) pool.pauseVfs();
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
  if (req.op === 'release') return release();
  if (!db) throw new Error('database is not open');
  switch (req.op) {
    case 'exec':
      db.exec(req.sql);
      return null;
    case 'run':
      db.exec({ sql: req.sql, bind: req.params && req.params.length ? req.params : undefined });
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
