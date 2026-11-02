/** build.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
/** Build in a subprocess and inspect the actual deployment package. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('build substitutes deployment URL and copies all HTML references', async () => {
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], {
    cwd: root,
    env: { ...process.env, BASE_URL: 'https://example.github.io/word-tts' },
  });
  const manifest = await readFile(new URL('dist/manifest.xml', root), 'utf8');
  assert.ok(manifest.includes('https://example.github.io/word-tts/taskpane.html'));
  assert.ok(!manifest.includes('{{BASE_URL}}'));
  assert.equal(await readFile(new URL('dist/install/manifest.xml', root), 'utf8'), manifest);
  const html = await readFile(new URL('dist/taskpane.html', root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('https:')) await access(new URL('dist/' + match[1], root));
  }
  const worker = await readFile(new URL('dist/sw.js', root), 'utf8');
  assert.ok(!worker.includes('__CACHE_VERSION__'));
  assert.ok(worker.includes('./lib/player.js'));
  const shortcuts = JSON.parse(await readFile(new URL('dist/shortcuts.json', root), 'utf8'));
  assert.equal(shortcuts.actions.length, 6);
});

// This is a real cache lifecycle change, so test retention independently of the DOM.
test('activation retains current and newest previous app cache only', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('src/sw.js', root), 'utf8');
  const current = 'read-aloud-plus-__CACHE_VERSION__';
  for (const names of [
    [current],
    ['other-app', 'read-aloud-plus-z-old', 'read-aloud-plus-a-previous', current],
    [current, 'other-app', 'read-aloud-plus-previous'],
  ]) {
    const handlers = new Map();
    const deleted = [];
    let claimed = false;
    runInNewContext(source, {
      self: {
        /** Capture registration so the test can activate the worker explicitly. */
        addEventListener(name, handler) {
          handlers.set(name, handler);
        },
        clients: {
          /** Observe that cleanup completes before the new worker claims clients. */
          async claim() {
            claimed = true;
          },
        },
      },
      caches: {
        /** Preserve creation order; content hashes have no chronological ordering. */
        async keys() {
          return names;
        },
        /** Record deletions without needing the browser's CacheStorage implementation. */
        async delete(name) {
          assert.equal(claimed, false);
          deleted.push(name);
          return true;
        },
      },
    });
    let activation;
    handlers.get('activate')({
      /** Capture the lifecycle promise as the browser would. */
      waitUntil(work) {
        activation = work;
      },
    });
    await activation;
    assert.equal(claimed, true);
    assert.deepEqual(
      deleted,
      names.includes('read-aloud-plus-z-old') ? ['read-aloud-plus-z-old'] : [],
    );
  }
});

test('shortcut package avoids known Word bindings and registers every action', async () => {
  const shortcuts = JSON.parse(await readFile(new URL('dist/shortcuts.json', root), 'utf8'));
  const keys = shortcuts.shortcuts.map((shortcut) => shortcut.key.default);
  assert.equal(new Set(keys).size, keys.length);
  const reserved = ['Ctrl+Alt+Shift+S', 'Ctrl+Alt+Shift+M', 'Ctrl+Alt+Shift+C', 'Ctrl+Alt+Shift+V'];
  for (const key of keys) assert.ok(!reserved.includes(key));
  const source = await readFile(new URL('src/taskpane.js', root), 'utf8');
  for (const action of shortcuts.actions) {
    assert.equal(action.type, 'ExecuteFunction');
    assert.ok(action.name);
    assert.ok(source.includes(action.id + ':'));
    assert.equal(shortcuts.shortcuts.filter((s) => s.action === action.id).length, 1);
  }
  const manifest = await readFile(new URL('dist/manifest.xml', root), 'utf8');
  assert.ok(manifest.includes('<Version>1.0.1.0</Version>'));
  assert.ok(manifest.includes('<AppDomain>https://example.github.io</AppDomain>'));
  assert.ok(manifest.includes('/assets/icon-64.png'));
  for (const match of manifest.matchAll(/https:\/\/example.github.io\/word-tts\/([^"<]+)/g)) {
    await access(new URL('dist/' + match[1], root));
  }
});
