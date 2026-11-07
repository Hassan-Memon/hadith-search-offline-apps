// Loaded into the generated service worker (workbox importScripts, see
// vite.config.ts).
//
// Since 1.1 a new app version waits until the page tells it to take over
// (src/update.ts), so a reader is never reloaded mid-narration. Pages of 1.0
// never send that message: they expect each new version to take over by
// itself, then reload. With such a page open the new version would wait until
// every window of the app is closed, which on a phone (the installed app stays
// alive in the background) or in a tab that is only reloaded is "never".
//
// So on install the new worker asks every open page which version it is. A
// page of 1.1 or later answers at once; if any page does not answer, it is an
// older version and the new worker takes over right away (that page then
// reloads itself into the new version, as 1.0 always did).
const HANDOFF_TIMEOUT_MS = 1500;

function askVersion(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), HANDOFF_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data && event.data.version ? event.data.version : null);
    };
    try {
      client.postMessage({ type: 'TQ_VERSION' }, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // First install (no older version controls anything): nothing to hand over.
      if (!self.registration.active) return;
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (pages.length === 0) return; // nothing open: it activates by itself
      const versions = await Promise.all(pages.map(askVersion));
      if (versions.some((v) => v === null)) await self.skipWaiting();
    })(),
  );
});
