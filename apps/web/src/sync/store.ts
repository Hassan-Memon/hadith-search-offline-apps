// App-wide state: database readiness and sync status, as a tiny external
// store React reads with useSyncExternalStore. Sync runs on start, every few
// hours while open, when the device comes back online and when the app
// returns to the foreground.
import { useSyncExternalStore } from 'react';

import {
  countHadith,
  createHttpApi,
  getSyncState,
  sync,
  type SyncProgress,
  type SyncResult,
} from '@tehqeqat/core';

import { APP_VERSION, FOREGROUND_SYNC_AFTER_MS, SITE_API_BASE, SYNC_BASE, SYNC_INTERVAL_MS } from '../config';
import { db } from '../db/client';
import { browserInstaller } from './installer';

export interface AppState {
  dbReady: boolean;
  persistent: boolean;
  hadithCount: number;
  syncing: boolean;
  progress: SyncProgress | null;
  lastResult: SyncResult | null;
  lastSyncAt: string | null;
  /** Bumped after every sync that changed data, so screens reload. */
  dataVersion: number;
  online: boolean;
  fatal: string | null;
}

let state: AppState = {
  dbReady: false,
  persistent: true,
  hadithCount: 0,
  syncing: false,
  progress: null,
  lastResult: null,
  lastSyncAt: null,
  dataVersion: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  fatal: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getApp = () => state;

const api = createHttpApi({ syncBaseUrl: SYNC_BASE, siteBaseUrl: SITE_API_BASE, appVersion: APP_VERSION });

let running: Promise<SyncResult> | null = null;

export function runSync(): Promise<SyncResult> {
  running ??= (async () => {
    set({ syncing: true, progress: { phase: 'manifest' } });
    const result = await sync({
      db,
      api,
      site: api,
      installer: browserInstaller,
      appVersion: APP_VERSION,
      onProgress: (progress) => set({ progress }),
    });
    const sync_ = await getSyncState(db);
    const hadithCount = await countHadith(db);
    const changed = result.status === 'ok';
    set({
      syncing: false,
      progress: null,
      lastResult: result,
      lastSyncAt: sync_.last_sync_at,
      hadithCount,
      dataVersion: changed ? state.dataVersion + 1 : state.dataVersion,
    });
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function startApp() {
  try {
    const info = await db.open();
    const hadithCount = await countHadith(db).catch(() => 0);
    const s = await getSyncState(db).catch(() => null);
    set({ dbReady: true, persistent: info.persistent, hadithCount, lastSyncAt: s?.last_sync_at ?? null });
  } catch (error) {
    set({ fatal: error instanceof Error ? error.message : String(error) });
    return;
  }

  // Ask the browser not to evict the database under storage pressure.
  navigator.storage?.persist?.().catch(() => undefined);

  if (navigator.onLine) void runSync();

  window.addEventListener('online', () => {
    set({ online: true });
    void runSync();
  });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
    if (Date.now() - last > FOREGROUND_SYNC_AFTER_MS) void runSync();
  });
  setInterval(() => {
    if (navigator.onLine) void runSync();
  }, SYNC_INTERVAL_MS);
}

/** Settings → remove downloaded data. The next sync downloads it again. */
export async function resetData() {
  await db.reset();
  set({ hadithCount: 0, lastSyncAt: null, lastResult: null, dataVersion: state.dataVersion + 1 });
  if (navigator.onLine) void runSync();
}
