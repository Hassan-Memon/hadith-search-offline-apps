// DbAdapter (the interface @tehqeqat/core needs) over the SQLite worker.
import { runInTransaction, type DbAdapter, type SqlValue } from '@tehqeqat/core';

import type { OpenInfo, WorkerRequest } from './worker';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

class WorkerDb implements DbAdapter {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const { id, ok, result, error } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error));
    };
  }

  private call<T>(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }

  open() {
    return this.call<OpenInfo>({ op: 'open' });
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

  /** Replace the database with a snapshot (the bytes are moved, not copied). */
  async importDb(bytes: Uint8Array) {
    await this.call({ op: 'import', bytes }, [bytes.buffer]);
  }

  async reset() {
    await this.call({ op: 'reset' });
  }
}

export const db = new WorkerDb();
