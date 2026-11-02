/** Exercise the worker's network and offline paths without a browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../src/sw.js', import.meta.url), 'utf8');
function fixture(fetch, timers = { setTimeout, clearTimeout }) {
  const handlers = new Map();
  const writes = [];
  const matches = [];
  const precached = [];
  const cached = new Response('cached');
  runInNewContext(source, {
    URL, Request: class {
      constructor(url, options) { this.url = url; this.cache = options.cache; }
    }, ...timers, fetch,
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {},
    },
    caches: { open: async () => ({
      put: async (request, response) => writes.push([request, await response.text()]),
      match: async (request, options) => { matches.push([request, options]); return cached; },
      addAll: async (requests) => precached.push(...requests),
    }) },
  });
  return { writes, matches, precached, cached, handlers };
}
async function request(f, url = 'https://example.test/taskpane.js?v=1.0.2') {
  const work = [];
  let response;
  f.handlers.get('fetch')({
    request: { url, method: 'GET' },
    waitUntil: (promise) => work.push(promise),
    respondWith: (promise) => { response = promise; },
  });
  return { response: await response, work };
}
test('network success wins over cache and refreshes it with no-cache fetch', async () => {
  const f = fixture(async (request, options) => {
    assert.equal(options.cache, 'no-cache');
    return new Response('new release');
  });
  const result = await request(f);
  assert.equal(await result.response.text(), 'new release');
  await Promise.all(result.work);
  assert.equal(f.writes[0][1], 'new release');
  assert.equal(f.matches.length, 0);
});
for (const failure of ['offline', 'timeout', 'http']) {
  test(`${failure} falls back to precached versioned navigation ignoring search`, async () => {
    let timeout;
    const f = fixture(async () => {
      if (failure === 'offline') throw Error('offline');
      if (failure === 'http') return new Response('server down', { status: 503 });
      return new Promise(() => {});
    }, {
      setTimeout(callback, delay) {
        assert.equal(delay, 3000);
        timeout = callback;
        if (failure === 'timeout') queueMicrotask(timeout);
      },
      clearTimeout() {},
    });
    const result = await request(f, 'https://example.test/taskpane.html?v=1.0.2');
    assert.equal(result.response, f.cached);
    assert.equal(f.matches[0][1].ignoreSearch, true);
    assert.equal(f.writes.length, 0);
  });
}
test('install reloads precache requests and tolerates unavailable Office CDN', async () => {
  const f = fixture(async () => { throw Error('CDN offline'); });
  let installed;
  f.handlers.get('install')({ waitUntil: (work) => { installed = work; } });
  await installed;
  assert.ok(f.precached.length);
  assert.ok(f.precached.every((request) => request.cache === 'reload'));
});
