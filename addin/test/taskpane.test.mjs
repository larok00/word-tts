/** Exercise real Player transitions through pane and Office controls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Player } from '../src/lib/player.js';
const source = (await readFile(new URL('../src/taskpane.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
function fixture() {
  const elements = new Map();
  const keys = {};
  const actions = {};
  const utterances = [];
  let voiceChange;
  let reads = 0;
  let player;
  const voice = { name: 'Local', voiceURI: 'local', localService: true };
  const clock = { setTimeout: () => 1, clearTimeout() {} };
  const office = {
    onReady: (callback) => callback(),
    actions: { associate: (name, callback) => { actions[name] = callback; } },
  };
  runInNewContext(source, {
    VERSION: '1.0.2', ...clock, Office: office,
    document: {
      getElementById(id) {
        const handlers = {};
        const element = { handlers, checked: true,
          addEventListener: (name, callback) => { handlers[name] = callback; },
          setAttribute() {}, replaceChildren() {}, append() {},
        };
        elements.set(id, element);
        return element;
      },
      createElement: () => ({}),
      addEventListener: (name, callback) => { keys[name] = callback; },
    },
    window: { Office: office, addEventListener() {}, speechSynthesis: {
      speak: (utterance) => utterances.push(utterance),
      cancel() {}, pause() {}, resume() {}, getVoices: () => [voice],
      addEventListener: (_, callback) => { voiceChange = callback; },
    } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    navigator: {},
    loadSettings: () => ({ rate: 1 }), saveSettings() {}, normalizeRate: (rate) => rate,
    filterVoices: (voices) => voices, pickDefault: (voices) => voices[0],
    buildFallbackOrder: (voices) => voices,
    splitSentences: () => ['One.', 'Two.'],
    WordReader: class {
      async read() { reads++; this.lastStartMethod = 'sentence'; return 'One. Two.'; }
      invalidate() {} cleanup() {} highlight() {} clearHighlight() {}
    },
    Player: class extends Player {
      constructor(options) { super({ ...options, clock }); player = this; }
    },
  });
  return { elements, actions, utterances, player, voiceChange,
    reads: () => reads,
    click: (id) => elements.get(id).handlers.click(),
    space: () => keys.keydown({ key: ' ', target: { closest: () => false }, preventDefault() {} }),
  };
}
for (const path of ['button', 'space', 'office', 'needsRestart', 'rate', 'error']) {
  test(`resume via ${path} immediately replaces paused status and resists stale callbacks`, async () => {
    const f = fixture();
    await f.click('play');
    const old = f.utterances.at(-1);
    if (path === 'error') old.onerror({ error: 'network' });
    else f.click('pause');
    if (path === 'needsRestart') f.player.cancel();
    if (path === 'rate') f.click('faster');
    assert.equal(f.player.state, 'paused');
    if (path === 'space') f.space();
    else if (path === 'office') f.actions.TogglePlayPause();
    else f.click('pause');
    // This assertion precedes any asynchronous progress or fresh utterance callbacks.
    assert.equal(f.elements.get('status').textContent, 'Reading sentence 1 of 2');
    f.voiceChange();
    if (f.utterances.at(-1) !== old) {
      old.onstart(); old.onboundary(); old.onend(); old.onerror({ error: 'network' });
    }
    old.onpause?.();
    assert.equal(f.elements.get('status').textContent, 'Reading sentence 1 of 2');
    assert.equal(f.player.state, 'playing');
  });
}
test('Office Play uses the same document read and diagnostics as the button', async () => {
  const f = fixture();
  await f.actions.TogglePlayPause();
  // toggle starts the shared asynchronous read; allow its continuation to finish.
  await Promise.resolve();
  assert.equal(f.reads(), 1);
  assert.equal(f.player.state, 'playing');
  assert.equal(f.elements.get('diagnostics').textContent, 'Version 1.0.2; start: sentence');
  assert.equal(f.elements.get('version').textContent, 'Read Aloud+ v1.0.2');
});
