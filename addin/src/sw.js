/** Best-effort offline cache. Office can still need a network on the first visit.
 * Office.js loads more resources itself; opaque CDN caching cannot guarantee Office
 * startup offline. Never fail installation merely because the CDN is unavailable.
 */
const CACHE = 'read-aloud-plus-__CACHE_VERSION__';
const FILES = ['__PRECACHE_FILES__'];
const OFFICE = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
// Cache the local application atomically; the optional opaque CDN response separately.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    try { const response = await fetch(OFFICE, { mode: 'no-cors' }); await cache.put(OFFICE, response); } catch { /* Optional. */ }
    await self.skipWaiting();
  })());
});
// Keep old caches: an already-open pane may still import its original version.
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
// Return cached content immediately and refresh it when the network works.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && event.request.url !== OFFICE) return;
  const update = caches.open(CACHE).then(async cache => {
    const response = await fetch(event.request);
    if (response.ok || response.type === 'opaque') await cache.put(event.request, response.clone());
    return response;
  });
  event.waitUntil(update.catch(() => {}));
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || update));
});
