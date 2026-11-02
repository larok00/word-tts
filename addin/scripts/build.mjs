/** Static packaging entry point. No exports; compiles Bend when available, copies
 * assets, substitutes the HTTPS root, and versions the service worker by content.
 */
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const base = (process.env.BASE_URL || 'https://localhost:3000').replace(/\/+$/, '');
const parsed = new URL(base);
if (parsed.protocol !== 'https:' || parsed.search || parsed.hash)
  throw new Error('BASE_URL must be an HTTPS URL without query or fragment.');
// Try PATH first, then the standard user installation. CI uses the committed output.
const bendArguments = ['../bend/splitter.bend', '-o', 'src/lib/splitter.bend.mjs'];
/** Use asynchronous pipes so restricted hosts can launch the compiler too. */
function compile(command) {
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn(command, bendArguments, { cwd: root });
    child.stdout.resume();
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => resolve({ error, stderr }));
    child.on('close', (status) => resolve({ status, stderr }));
  });
}
let bendPath = 'bend';
let bend = await compile(bendPath);
if (bend.error?.code === 'ENOENT') {
  bendPath = path.join(homedir(), '.bend/bin/bend');
  bend = await compile(bendPath);
}
if (bend.error?.code === 'ENOENT') {
  console.log('Bend not found on PATH or in $HOME/.bend/bin; using committed splitter.');
} else {
  console.log(`Compiling splitter with ${bendPath}`);
  if (bend.error || bend.status !== 0) {
    throw new Error(bend.stderr || String(bend.error) || 'Bend compilation failed');
  }
}
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await cp(path.join(root, 'src'), path.join(root, 'dist'), { recursive: true });
/** XML attribute escaping is separate from JSON serialization. */
function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
const manifest = (await readFile(path.join(root, 'manifest.template.xml'), 'utf8'))
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{BASE_URL}}', escapeXml(base))
  .replaceAll('{{ORIGIN}}', escapeXml(parsed.origin));
await writeFile(path.join(root, 'dist/manifest.xml'), manifest);
for (const file of ['taskpane.html', 'lib/version.js']) {
  const source = await readFile(path.join(root, 'src', file), 'utf8');
  await writeFile(path.join(root, 'dist', file), source.replaceAll('{{VERSION}}', version));
}
const definitions = [
  ['TogglePlayPause', 'Play or pause', 'P'],
  ['Stop', 'Stop reading', 'X'],
  ['Next', 'Next sentence', 'Right'],
  ['Previous', 'Previous sentence', 'Left'],
  ['SpeedUp', 'Increase speed', 'Up'],
  ['SpeedDown', 'Decrease speed', 'Down'],
];
const shortcuts = {
  actions: definitions.map(([id, name]) => ({ id, name, type: 'ExecuteFunction' })),
  shortcuts: definitions.map(([action, , key]) => ({
    action,
    key: { default: `Ctrl+Alt+Shift+${key}` },
  })),
};
await writeFile(path.join(root, 'dist/shortcuts.json'), JSON.stringify(shortcuts, null, 2) + '\n');
/** Walk deterministically so identical inputs get the same content-based cache version. */
async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await filesUnder(path.join(directory, entry.name), relative + '/')));
    else files.push(relative);
  }
  return files;
}
const files = (await filesUnder(path.join(root, 'dist'))).filter((file) => file !== 'sw.js');
// Bypass the previous cache-first worker for every module in the first upgraded load.
for (const file of files.filter((file) => /^(?:lib\/)?[^/]+\.js$/.test(file))) {
  const target = path.join(root, 'dist', file);
  const source = await readFile(target, 'utf8');
  await writeFile(target, source.replace(
    /(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.{1,2}\/[^'"?]+)\2/g,
    (_, prefix, quote, specifier) => `${prefix}${quote}${specifier}?v=${version}${quote}`,
  ));
}
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(path.join(root, 'dist', file)));
}
let worker = await readFile(path.join(root, 'src/sw.js'), 'utf8');
hash.update(worker);
worker = worker
  .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
  .replace("'__PRECACHE_FILES__'", files.map((file) => JSON.stringify('./' + file)).join(', '));
await writeFile(path.join(root, 'dist/sw.js'), worker);
// Installation package contains the exact built manifest, never a localhost template.
await mkdir(path.join(root, 'dist/install'), { recursive: true });
await cp(path.join(root, '../install'), path.join(root, 'dist/install'), { recursive: true });
await writeFile(path.join(root, 'dist/install/manifest.xml'), manifest);
console.log(`Built dist/ for ${base}; installation package: dist/install/`);
