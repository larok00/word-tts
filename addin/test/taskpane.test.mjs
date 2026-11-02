/** Exercise status rendering without a browser or Office installation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
test('resume immediately replaces the paused status before another chunk starts', async () => {
  const elements = new Map();
  let callbacks;
  const source = (await readFile(new URL('../src/taskpane.js', import.meta.url), 'utf8'))
    .replace(/^import .*;$/gm, '');
  runInNewContext(source, {
    document: {
      getElementById(id) {
        const element = { addEventListener() {}, setAttribute() {} };
        elements.set(id, element);
        return element;
      },
      addEventListener() {},
    },
    window: { addEventListener() {} }, navigator: {},
    loadSettings: () => ({ rate: 1 }), saveSettings() {}, normalizeRate: (rate) => rate,
    WordReader: class {},
    Player: class {
      constructor(options) { callbacks = options; this.index = 1; this.chunks = ['One.', 'Two.']; }
      setRate() {}
    },
  });
  callbacks.onStateChange('paused');
  assert.equal(elements.get('status').textContent, 'Paused. Press Resume to continue.');
  callbacks.onStateChange('playing');
  assert.equal(elements.get('status').textContent, 'Reading sentence 2 of 2');
});
