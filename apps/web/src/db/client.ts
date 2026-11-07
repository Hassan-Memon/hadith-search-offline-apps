// DbAdapter (the interface @tehqeqat/core needs) over the SQLite worker.
//
// Only one window of the app can hold the on-device database at a time (see
// worker.ts). A Web Lock decides which: the window the reader is looking at
// takes it (claim), and the window it was taken from closes its copy. Nothing
// ever falls back to a throw-away in-memory copy because another window was
// open, which used to lose downloads and bookmarks on the next refresh.
import { runInTransaction, type DbAdapter, type SqlValue } from '@tehqeqat/core';

import type { OpenInfo, WorkerRequest } from './worker';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Req = DistributiveOmit<WorkerRequest, 'id'>;

const LOCK = 'tehqeqat-db';

/** The database was handed to another window while this work was running. */
export class DbMovedError extends Error {
  constructor() {
    super('database moved to another window');
  }
}

/** A database handle that stops working once this window loses the database. */
export interface DbSession extends DbAdapter {
  importDb(bytes: Uint8Array): Promise<void>;
}

class WorkerDb implements DbAdapter {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private owner = false;
  /** Bumped every time this window loses the database. */
  private generation = 0;
  private claiming: Promise<OpenInfo> | null = null;
  /** Lets go of the Web Lock this window holds. */
  private releaseLock: (() => void) | null = null;
  private listeners = new Set<(owner: boolean) => void>();
  info: OpenInfo | null = null;

  constructor() {
    // Leaving the page (navigation, reload, closing, back/forward cache): the
    // browser may keep the old worker alive for a while, still holding the
    // files, so the next page could not open them. Let go right away.
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.shutdown());
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const { id, ok, result, error } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error));
    };
    this.worker = worker;
    return worker;
  }

  private post<T>(req: Req, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.getWorker().postMessage({ ...req, id }, transfer);
    });
  }

  /** Stop the worker (its files close with it) and give up the lock. A later claim starts a new one. */
  private shutdown() {
    this.setOwner(false);
    this.releaseLock?.();
    this.releaseLock = null;
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) entry.reject(new DbMovedError());
    this.pending.clear();
  }

  /** Run a request if this window holds the database (waiting for a claim in progress). */
  private async call<T>(req: Req, transfer: Transferable[] = [], generation?: number): Promise<T> {
    if (!this.owner && this.claiming) await this.claiming.catch(() => undefined);
    if (generation !== undefined && generation !== this.generation) throw new DbMovedError();
    if (!this.owner) throw new DbMovedError();
    return this.post<T>(req, transfer);
  }

  get isOwner() {
    return this.owner;
  }

  onOwnerChange(fn: (owner: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setOwner(owner: boolean) {
    if (this.owner === owner) return;
    this.owner = owner;
    if (!owner) this.generation++;
    for (const fn of this.listeners) fn(owner);
  }

  /**
   * Take the database for this window, from another window if needed. Resolves
   * once it is open here; rejects if the other window never let go.
   */
  claim(): Promise<OpenInfo> {
    if (this.owner && this.info) return Promise.resolve(this.info);
    this.claiming ??= this.doClaim().finally(() => {
      this.claiming = null;
    });
    return this.claiming;
  }

  private doClaim(): Promise<OpenInfo> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) {
      // Very old browsers: no coordination, open directly.
      return this.post<OpenInfo>({ op: 'open' }).then((info) => {
        this.info = info;
        this.setOwner(true);
        return info;
      });
    }

    return new Promise<OpenInfo>((resolve, reject) => {
      let stolen = false;
      locks
        .request(LOCK, { steal: true }, async () => {
          let info: OpenInfo;
          try {
            info = await this.post<OpenInfo>({ op: 'open' });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return; // gives the lock back
          }
          if (stolen) {
            // Another window took over while we were opening.
            void this.post({ op: 'release' }).catch(() => undefined);
            return;
          }
          this.info = info;
          this.setOwner(true);
          resolve(info);
          // Hold the lock until another window steals it or this page goes away.
          await new Promise<void>((r) => (this.releaseLock = r));
        })
        .catch((error: unknown) => {
          // AbortError: another window took the database.
          this.releaseLock = null;
          if (this.owner) return this.lose();
          stolen = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /** Another window has the database now: close our copy so it can open it. */
  private lose() {
    this.setOwner(false);
    void this.post({ op: 'release' }).catch(() => undefined);
  }

  /** A handle bound to the current ownership, for long work such as a sync. */
  session(): DbSession {
    const generation = this.generation;
    const call = <T>(req: Req, transfer: Transferable[] = []) => this.call<T>(req, transfer, generation);
    const session: DbSession = {
      exec: async (sql) => void (await call({ op: 'exec', sql })),
      run: async (sql, params = []) => void (await call({ op: 'run', sql, params })),
      all: <T>(sql: string, params: SqlValue[] = []) => call<T[]>({ op: 'all', sql, params }),
      get: <T>(sql: string, params: SqlValue[] = []) => call<T | undefined>({ op: 'get', sql, params }),
      transaction: (fn) => runInTransaction(session, fn),
      importDb: async (bytes) => void (await call({ op: 'import', bytes }, [bytes.buffer])),
    };
    return session;
  }

  async exec(sql: string) {
    await this.call({ op: 'exec', sql });
  }

  async run(sql: string, params: SqlValue[] = []) {
    await this.call({ op: 'run', sql, params });
  }

  all<T>(sql: string, params: SqlValue[] = []) {
    return this.call<T[]>({ op: 'all', sql, params });
  }

  get<T>(sql: string, params: SqlValue[] = []) {
    return this.call<T | undefined>({ op: 'get', sql, params });
  }

  transaction<T>(fn: () => Promise<T>) {
    return runInTransaction(this, fn);
  }

  async reset() {
    await this.call({ op: 'reset' });
  }
}

export const db = new WorkerDb();
