// App updates (new features and fixes), separate from data updates.
//
// The service worker downloads a new version in the background and keeps it
// waiting, so a reader is never reloaded in the middle of a narration. It is
// applied:
//   - when the app goes to the background (the reader does not see the reload),
//   - when the reader taps "update now" on the banner,
//   - at once when the published data needs a newer app (min_app_version).
// Installed apps can stay open for days on a phone, so the app also checks for
// a new version every hour and whenever it comes back to the foreground.
import { registerSW } from 'virtual:pwa-register';

import { APP_VERSION } from './config';
import { getApp, patchApp, setUpdateRequiredHandler } from './sync/store';

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FOREGROUND_CHECK_AFTER_MS = 30 * 60 * 1000;
const VERSION_KEY = 'tq.version';

let applySw: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;
let required = false;

function check() {
  if (!registration || !navigator.onLine || registration.installing) return;
  lastCheck = Date.now();
  registration.update().catch(() => undefined);
}

/** Reload into the waiting version. */
export function applyUpdate() {
  return applySw?.(true);
}

function rememberVersion() {
  try {
    const previous = localStorage.getItem(VERSION_KEY);
    if (previous && previous !== APP_VERSION) patchApp({ updatedTo: APP_VERSION });
    localStorage.setItem(VERSION_KEY, APP_VERSION);
  } catch {
    // storage blocked: no "updated" note
  }
}

/**
 * A new service worker asks open pages their version when it installs
 * (public/sw-handoff.js). Answering tells it this page knows how to switch
 * versions calmly, so it waits; a page that does not answer (1.0) gets the
 * new version at once.
 */
function answerVersionQuestions() {
  const container = navigator.serviceWorker;
  if (!container) return;
  container.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === 'TQ_VERSION') event.ports[0]?.postMessage({ version: APP_VERSION });
  });
  // Messages are held until the page says it is listening.
  container.startMessages();
}

export function startUpdates() {
  rememberVersion();
  answerVersionQuestions();

  applySw = registerSW({
    immediate: true,
    onNeedRefresh() {
      patchApp({ updateReady: true });
      if (required || document.visibilityState === 'hidden') void applyUpdate();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      lastCheck = Date.now();
      setInterval(check, CHECK_EVERY_MS);
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Out of sight: a good moment to switch, unless a download is running.
      if (getApp().updateReady && !getApp().syncing) void applyUpdate();
    } else if (Date.now() - lastCheck > FOREGROUND_CHECK_AFTER_MS) {
      check();
    }
  });

  setUpdateRequiredHandler(() => {
    required = true;
    if (getApp().updateReady) void applyUpdate();
    else check();
  });
}
