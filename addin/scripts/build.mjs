/** Dependency-free static build. Run from any directory; BASE_URL is the deployment root. */
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = (process.env.BASE_URL || 'https://localhost:3000').replace(/\/+$/, '');
const parsed = new URL(base);
if (parsed.protocol !== 'https:' || parsed.search || parsed.hash) throw new Error('BASE_URL must be an HTTPS URL without query or fragment.');
const bend = spawnSync('bend', ['../bend/splitter.bend', '-o', 'src/lib/splitter.bend.mjs'], { cwd: root, encoding: 'utf8' });
if (bend.error?.code === 'ENOENT') console.log('Bend is not on PATH; keeping the committed compiled splitter.');
else if (bend.error || bend.status !== 0) throw new Error(bend.stderr || String(bend.error) || 'Bend compilation failed');
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await cp(path.join(root, 'src'), path.join(root, 'dist'), { recursive: true });
// XML attribute escaping is separate from JSON serialization.
function escapeXml(value) { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
const manifest = (await readFile(path.join(root, 'manifest.template.xml'), 'utf8')).replaceAll('{{BASE_URL}}', escapeXml(base));
await writeFile(path.join(root, 'dist/manifest.xml'), manifest);
const definitions = [['TogglePlayPause', 'Play or pause', 'P'], ['Stop', 'Stop reading', 'S'], ['Next', 'Next sentence', 'Right'], ['Previous', 'Previous sentence', 'Left'], ['SpeedUp', 'Increase speed', 'Up'], ['SpeedDown', 'Decrease speed', 'Down']];
const shortcuts = { actions: definitions.map(([id, name]) => ({ id, name, type: 'ExecuteFunction' })),
  shortcuts: definitions.map(([action, , key]) => ({ action, key: { default: `Ctrl+Alt+Shift+${key}` } })) };
await writeFile(path.join(root, 'dist/shortcuts.json'), JSON.stringify(shortcuts, null, 2) + '\n');
// Walk deterministically so identical inputs get the same content-based cache version.
async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files;
}
const files = (await filesUnder(path.join(root, 'dist'))).filter(file => file !== 'sw.js');
const hash = createHash('sha256');
for (const file of files) { hash.update(file); hash.update(await readFile(path.join(root, 'dist', file))); }
let worker = await readFile(path.join(root, 'src/sw.js'), 'utf8');
hash.update(worker);
worker = worker.replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16)).replace("'__PRECACHE_FILES__'", files.map(file => JSON.stringify('./' + file)).join(', '));
await writeFile(path.join(root, 'dist/sw.js'), worker);
// Installation package contains the exact built manifest, never a localhost template.
await mkdir(path.join(root, 'dist/install'), { recursive: true });
await cp(path.join(root, '../install'), path.join(root, 'dist/install'), { recursive: true });
await writeFile(path.join(root, 'dist/install/manifest.xml'), manifest);
console.log(`Built dist/ for ${base}; installation package: dist/install/`);
