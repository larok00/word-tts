/** Build in a subprocess and inspect the actual deployment package. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('build substitutes deployment URL and copies all HTML references', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, env: { ...process.env, BASE_URL: 'https://example.github.io/word-tts' } });
  const manifest = await readFile(new URL('dist/manifest.xml', root), 'utf8');
  assert.ok(manifest.includes('https://example.github.io/word-tts/taskpane.html')); assert.ok(!manifest.includes('{{BASE_URL}}'));
  assert.equal(await readFile(new URL('dist/install/manifest.xml', root), 'utf8'), manifest);
  const html = await readFile(new URL('dist/taskpane.html', root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('https:')) await access(new URL('dist/' + match[1], root));
  }
  const worker = await readFile(new URL('dist/sw.js', root), 'utf8'); assert.ok(!worker.includes('__CACHE_VERSION__')); assert.ok(worker.includes('./lib/player.js'));
  const shortcuts = JSON.parse(await readFile(new URL('dist/shortcuts.json', root), 'utf8')); assert.equal(shortcuts.actions.length, 6);
});
