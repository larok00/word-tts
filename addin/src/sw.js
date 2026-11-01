/** Offline cache lifecycle for the built pane. No exports; registers install,
 * activate, and fetch handlers. Office startup may still need network resources.
 */
/** Best-effort offline cache. Office can still need a network on the first visit.
 * Office.js loads more resources itself; opaque CDN caching cannot guarantee Office
 * startup offline. Never fail installation merely because the CDN is unavailable.
 */
const CACHE = 'read-aloud-plus-__CACHE_VERSION__';
const FILES = ['__PRECACHE_FILES__'];
const OFFICE = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
// Cache the local application atomically; the optional opaque CDN response separately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES);
      try {
        const response = await fetch(OFFICE, { mode: 'no-cors' });
        await cache.put(OFFICE, response);
      } catch {
        /* Optional. */
      }
      await self.skipWaiting();
    })(),
  );
});
// CacheStorage.keys() returns creation order, not hash order. Keep the most recently
// created older app cache for an already-open pane, and leave other apps' caches alone.
// This bounds disk use to two deployments; it cannot preserve arbitrarily old panes.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const appCaches = (await caches.keys()).filter(
        (name) => name.startsWith('read-aloud-plus-') && name !== CACHE,
      );
      const previous = appCaches.at(-1);
      for (const name of appCaches) {
        if (name !== previous) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
// Return cached content immediately and refresh it when the network works.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && event.request.url !== OFFICE) return;
  const update = caches.open(CACHE).then(async (cache) => {
    const response = await fetch(event.request);
    if (response.ok || response.type === 'opaque') await cache.put(event.request, response.clone());
    return response;
  });
  event.waitUntil(update.catch(() => {}));
  event.respondWith(
    caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) || update),
  );
});
