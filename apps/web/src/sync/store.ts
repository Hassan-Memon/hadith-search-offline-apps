// App-wide state: database readiness and sync status, as a tiny external
// store React reads with useSyncExternalStore.
//
// The window the reader is looking at owns the on-device database (see
// db/client.ts): it claims it on start, and again whenever it comes back to
// the foreground or gets focus after another window of the app had it.
// Sync runs on start, every few hours while open, when the device comes back
// online and when the app returns to the foreground.
import { useSyncExternalStore } from 'react';

import {
  countHadith,
  createStaticApi,
  getSyncState,
  sync,
  type SyncProgress,
  type SyncResult,
} from '@tehqeqat/core';

import { APP_VERSION, DATA_BASE, FOREGROUND_SYNC_AFTER_MS, SYNC_INTERVAL_MS } from '../config';
import { db, DbMovedError } from '../db/client';
import { BUSY } from '../db/shared';
import { browserInstaller } from './installer';

export interface AppState {
  dbReady: boolean;
  persistent: boolean;
  /** Another window kept the database and did not let go. */
  dbBusy: boolean;
  hadithCount: number;
  syncing: boolean;
  progress: SyncProgress | null;
  lastResult: SyncResult | null;
  lastSyncAt: string | null;
  /** Bumped after every sync that changed data, so screens reload. */
  dataVersion: number;
  online: boolean;
  fatal: string | null;
  /** A new app version is downloaded and waiting (see update.ts). */
  updateReady: boolean;
  /** Set on the first start after the app updated itself. */
  updatedTo: string | null;
}

let state: AppState = {
  dbReady: false,
  persistent: true,
  dbBusy: false,
  hadithCount: 0,
  syncing: false,
  progress: null,
  lastResult: null,
  lastSyncAt: null,
  dataVersion: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  fatal: null,
  updateReady: false,
  updatedTo: null,
};
const listeners = new Set<() => void>();

export function patchApp(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const set = patchApp;

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

const api = createStaticApi({ baseUrl: DATA_BASE });

/** Called when a sync learns this build is too old for the published data. */
let onUpdateRequired: () => void = () => {};
export function setUpdateRequiredHandler(fn: () => void) {
  onUpdateRequired = fn;
}

let running: Promise<SyncResult | null> | null = null;

/** Sync now, if this window holds the database. Resolves to null when it was skipped. */
export function runSync(): Promise<SyncResult | null> {
  if (!db.isOwner) return Promise.resolve(null);
  running ??= (async () => {
    // Bound to this ownership: if another window takes the database midway,
    // the rest of this sync is refused instead of writing over its work.
    const session = db.session();
    set({ syncing: true, progress: { phase: 'manifest' } });
    const result = await sync({
      db: session,
      api,
      site: api,
      installer: browserInstaller(session),
      appVersion: APP_VERSION,
      onProgress: (progress) => set({ progress }),
    });
    if (!db.isOwner) {
      // Moved to another window; that window reports its own syncs.
      set({ syncing: false, progress: null });
      return null;
    }
    const s = await getSyncState(db).catch(() => null);
    const hadithCount = await countHadith(db).catch(() => state.hadithCount);
    const changed = result.status === 'ok';
    set({
      syncing: false,
      progress: null,
      lastResult: result,
      lastSyncAt: s?.last_sync_at ?? state.lastSyncAt,
      hadithCount,
      dataVersion: changed ? state.dataVersion + 1 : state.dataVersion,
    });
    if (result.status === 'update-required') onUpdateRequired();
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

function stale(): boolean {
  const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
  return Date.now() - last > FOREGROUND_SYNC_AFTER_MS;
}

let claimedOnce = false;

/** Open the database in this window (taking it from another window if needed). */
async function claimHere(): Promise<void> {
  if (db.isOwner) return;
  let persistent: boolean;
  try {
    persistent = (await db.claim()).persistent;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(BUSY)) set({ dbBusy: true });
    // Not errors: another window took it back while we were opening (it is
    // in front), or this page is being left.
    else if (!(error instanceof DbMovedError) && !(error instanceof DOMException && error.name === 'AbortError'))
      set({ fatal: message });
    return;
  }
  const hadithCount = await countHadith(db).catch(() => 0);
  const s = await getSyncState(db).catch(() => null);
  set({
    dbReady: true,
    dbBusy: false,
    fatal: null,
    persistent,
    hadithCount,
    lastSyncAt: s?.last_sync_at ?? null,
    // Another window may have synced or saved bookmarks meanwhile: reload screens.
    dataVersion: claimedOnce ? state.dataVersion + 1 : state.dataVersion,
  });
  const first = !claimedOnce;
  claimedOnce = true;

  if (first) {
    // Ask the browser not to evict the database under storage pressure
    // (granted automatically to installed apps on Android Chrome).
    navigator.storage?.persist?.().catch(() => undefined);
  }
  if (navigator.onLine && (first || hadithCount === 0 || stale())) void runSync();
}

/** Retry after "open in another window" (button on that screen). */
export function retryOpen() {
  set({ dbBusy: false });
  void claimHere();
}

export async function startApp() {
  const onFront = () => {
    if (document.visibilityState !== 'visible') return;
    if (!db.isOwner) void claimHere();
    else if (navigator.onLine && stale()) void runSync();
  };

  window.addEventListener('online', () => {
    set({ online: true });
    void runSync();
  });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', onFront);
  window.addEventListener('focus', onFront);
  window.addEventListener('pageshow', onFront);
  setInterval(() => {
    if (navigator.onLine) void runSync();
  }, SYNC_INTERVAL_MS);

  // A window opened in the background waits until the reader looks at it.
  if (document.visibilityState === 'visible') await claimHere();
}

/** Settings → remove downloaded data. The next sync downloads it again. */
export async function resetData() {
  await db.reset();
  set({ hadithCount: 0, lastSyncAt: null, lastResult: null, dataVersion: state.dataVersion + 1 });
  if (navigator.onLine) void runSync();
}
