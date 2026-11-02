/** Exercise real Player transitions through pane and Office controls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { EventLog, copyLog } from '../src/lib/event-log.js';
import { Player } from '../src/lib/player.js';
const source = (await readFile(new URL('../src/taskpane.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
function fixture(failSetup = false, highlightOutcome = null) {
  const elements = new Map();
  const keys = {};
  const actions = {};
  const utterances = [];
  let voiceChange;
  let reads = 0;
  let copied;
  let player;
  const voice = { name: 'Local', voiceURI: 'local', localService: true };
  const clock = { setTimeout: () => 1, clearTimeout() {} };
  const office = {
    onReady: (callback) => callback(),
    actions: { associate: (name, callback) => { actions[name] = callback; } },
  };
  try {
  runInNewContext(source, {
    VERSION: '1.0.4', EventLog: class extends EventLog { constructor(options) { super({ ...options, now: () => 0 }); } }, copyLog, ...clock, Office: office,
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
      cancel() {}, pause() {}, resume() {}, getVoices: () => { if (failSetup === 'voices') throw Error('voices unavailable'); return [voice]; },
      addEventListener: (_, callback) => { voiceChange = callback; },
    } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    navigator: { clipboard: { writeText: async (text) => { copied = text; } } },
    loadSettings: () => { if (failSetup === 'settings') throw Error('settings unavailable'); return { rate: 1 }; }, saveSettings() {}, normalizeRate: (rate) => rate,
    filterVoices: (voices) => voices, pickDefault: (voices) => voices[0],
    buildFallbackOrder: (voices) => voices,
    sentenceChunks: () => ({ chunks: ['One.', 'Two.'], sentenceNumbers: [0, 1], sentenceTexts: ['One.', 'Two.'] }),
    WordReader: class {
      async read() { reads++; this.lastStartMethod = 'sentence'; return 'One. Two.'; }
      invalidate() {} cleanup() {}
      highlight() { this.lastHighlight = highlightOutcome; }
      clearHighlight() {}
    },
    Player: class extends Player {
      constructor(options) { super({ ...options, clock }); player = this; }
    },
  });
  } catch (error) { if (!failSetup) throw error; }
  return { elements, actions, utterances, player, voiceChange,
    copied: () => copied,
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
  assert.equal(f.elements.get('diagnostics').textContent, 'Version 1.0.4; start: sentence');
  assert.equal(f.elements.get('version').textContent, 'Read Aloud+ v1.0.4');
});

for (const failure of ['settings', 'voices']) {
  test(`Office actions register before failing ${failure} setup`, () => {
    const f = fixture(failure);
    assert.deepEqual(Object.keys(f.actions).sort(),
      ['TogglePlayPause', 'Stop', 'Next', 'Previous', 'SpeedUp', 'SpeedDown'].sort());
  });
}

test('Diagnostics displays the completed highlight outcome and error beside start method', async () => {
  const f = fixture(false, { index: 0, method: 'remapped', error: 'InvalidObjectPath' });
  await f.click('play');
  await Promise.resolve();
  assert.equal(f.elements.get('diagnostics').textContent,
    'Version 1.0.4; start: sentence; highlight chunk: 1 remapped (InvalidObjectPath)');
});


test('Diagnostics logs button/shortcut commands, speech and status', async () => {
  const f = fixture();
  const panel = f.elements.get('diagnosticsPanel');
  const view = f.elements.get('eventLog');
  assert.equal(view.textContent, undefined);
  panel.open = true;
  panel.handlers.toggle();
  await f.click('play');
  f.utterances.at(-1).onstart();
  await f.actions.Next();
  await f.actions.Previous();
  await f.click('pause');
  await f.click('pause');
  await f.click('faster');
  await f.actions.Stop();
  assert.match(view.textContent, /command prev source=shortcut before=2 after=1/);
  assert.match(view.textContent, /utterance cancel/);
  assert.match(view.textContent, /command pause source=button before=1 after=1/);
  assert.match(view.textContent, /command resume source=button/);
  assert.match(view.textContent, /command speed up source=button/);
  assert.match(view.textContent, /status Stopped/);
});


test('Copy log includes version, summary and raw end/error callbacks, even when closed', async () => {
  const f = fixture();
  await f.click('play');
  f.utterances.at(-1).onstart();
  const old = f.utterances.at(-1);
  await f.click('next');
  old.onend();
  old.onerror({ error: 'canceled' });
  await f.click('copyLog');
  assert.match(f.copied(), /^Version 1.0.4; start: sentence/);
  assert.match(f.copied(), /utterance start sentence=1 chunk=1/);
  assert.match(f.copied(), /utterance end sentence=1 chunk=1/);
  assert.match(f.copied(), /utterance error sentence=1 chunk=1 error=canceled/);
  assert.equal(f.elements.get('copyResult').textContent, 'Copied');
  assert.equal(f.elements.get('eventLog').textContent, undefined);
});
