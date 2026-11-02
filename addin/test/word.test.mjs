/** word.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
/** Behavioral Word integration checks with a tiny range/context simulator.
 * Real Office acceptance is still required; this catches ordering and restore regressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Player } from '../src/lib/player.js';
import { splitSentences, sentenceChunks } from '../src/lib/splitter.js';
import { mapChunkToSearch } from '../src/lib/mapping.js';
import { WordReader } from '../src/word.js';
/** Emulate context ownership and literal range search without importing Office. */
function documentFixture(text, selectionStart = 0, selectionEnd = 0, color = null, searchFilter = () => true) {
  const selections = [];
  let selected = [selectionStart, selectionEnd];
  const colors = new Map();
  const context = { sync: async () => {} };
  const tracked = new Set();
  let searches = 0;
  class Range {
    /** Each range belongs to a single simulated Word request context. */
    constructor(start, end) {
      this.start = start;
      this.end = end;
      this.context = context;
    }
    /** Locate the paragraph containing this range's start. */
    get paragraphs() {
      return { getFirst: () => new Range(Math.max(text.lastIndexOf('\n', this.start - 1), text.lastIndexOf('\r', this.start - 1)) + 1,
        (() => { const end = text.slice(this.start).search(/[\r\n]/); return end < 0 ? text.length : this.start + end; })()) };
    }
    // Word exposes loaded text after sync; this model supplies it immediately.
    get text() {
      return text.slice(this.start, this.end);
    }
    /** Property loading queues no work in this synchronous document model. */
    load() {
      return this;
    }
    /** Preserve range objects across simulated run batches. */
    track() {
      tracked.add(this);
      return this;
    }
    /** Release a range when the reading session ends. */
    untrack() {
      tracked.delete(this);
    }
    /** Produce independently tracked range proxies for start/end/full scope. */
    getRange(location) {
      if (location === 'Start') return new Range(this.start, this.start);
      if (location === 'End') return new Range(this.end, this.end);
      return new Range(this.start, this.end);
    }
    /** Expand in document order, as required for cursor-to-end reading. */
    expandTo(other) {
      return new Range(Math.min(this.start, other.start), Math.max(this.end, other.end));
    }
    /** Record user-visible document selection changes. */
    select() {
      selected = [this.start, this.end];
      if (context.select) context.select([this.start, this.end]);
      else selections.push([this.start, this.end]);
    }
    /** Simulate literal caret escaping and the first matching range. */
    search(query, options) {
      assert.equal(options.matchCase, true);
      searches++;
      const needle = query.replaceAll('^^', '^');
      if (!searchFilter(needle)) return { items: [], load() {} };
      const items = [];
      for (let position = text.indexOf(needle, this.start);
        position >= 0 && position + needle.length <= this.end;
        position = text.indexOf(needle, position + Math.max(1, needle.length))) {
        items.push(new Range(position, position + needle.length));
      }
      return {
        items,
        /** Word load queues properties; this fake already has their values. */
        load() {},
      };
    }
    // Share formatting by range coordinates, as independent Word proxies do.
    get font() {
      const key = `${this.start}:${this.end}`;
      return {
        /** Word load queues properties; this fake already has their values. */
        load() {},
        /** Return saved formatting, including null and mixed-color markers. */
        get highlightColor() {
          return colors.has(key) ? colors.get(key) : color;
        },
        /** Share writes between range proxies with the same coordinates. */
        set highlightColor(value) {
          colors.set(key, value);
        },
      };
    }
  }
  context.document = {
    getSelection: () => new Range(...selected),
    body: new Range(0, text.length),
  };
  globalThis.Word = {
    /** Reject cross-context use: tracked objects must be passed back to Word.run. */
    async run(anchor, callback) {
      if (typeof anchor === 'function') return anchor(context);
      assert.ok(tracked.has(anchor));
      assert.equal(anchor.context, context);
      return callback(context);
    },
  };
  return { context, selections, colors, tracked, searchCount: () => searches };
}
test('cursor-to-end reading and ordered repeats survive skipped highlights and previous', async () => {
  const f = documentFixture('Intro. Same. Same.', 7, 7);
  const reader = new WordReader();
  assert.equal(await reader.read(), 'Same. Same.');
  reader.chunks = ['Same. ', 'Same.'];
  await reader.highlight(1, 'Same.', false);
  assert.deepEqual(f.selections.at(-1), [13, 18]);
  await reader.highlight(0, 'Same. ', false);
  assert.deepEqual(f.selections.at(-1), [7, 12]);
  assert.equal(f.searchCount(), 2);
  await reader.cleanup();
  assert.deepEqual(f.selections.at(-1), [7, 7]);
  assert.equal(f.tracked.size, 0);
});
test('yellow restores null and existing colors on movement and cleanup', async () => {
  for (const color of [null, '#00FF00']) {
    const f = documentFixture('One. Two.', 0, 9, color);
    const reader = new WordReader();
    await reader.read();
    reader.chunks = ['One. ', 'Two.'];
    await reader.highlight(0, 'One.', true);
    assert.equal(f.colors.get('0:4'), '#FFFF00');
    await reader.highlight(1, 'Two.', true);
    assert.equal(f.colors.get('0:4'), color);
    await reader.cleanup();
    assert.equal(f.colors.get('5:9'), color);
    assert.equal(f.tracked.size, 0);
  }
});
test('mixed colors select instead; missing matches do not reject', async () => {
  const f = documentFixture('One.', 0, 4, '');
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['One.', 'Missing.'];
  await reader.highlight(0, 'One.', true);
  assert.deepEqual(f.selections.at(-1), [0, 4]);
  assert.equal(f.colors.size, 0);
  await reader.highlight(1, 'Missing.', true);
  await reader.cleanup();
  assert.equal(f.tracked.size, 0);
});
test('stale queued requests are discarded and errors leave the queue usable', async () => {
  const f = documentFixture('One. Two.', 0, 9);
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['One. ', 'Two.'];
  const first = reader.highlight(0, 'One.', true);
  const second = reader.highlight(1, 'Two.', false);
  await Promise.all([first, second]);
  assert.deepEqual(f.selections, [[5, 9]]);
  await assert.rejects(reader.enqueue(() => {
    throw Error('Word unavailable');
  }));
  await reader.cleanup();
  assert.equal(f.tracked.size, 0);
});

test('caret reading starts at its sentence, retaining the original caret bookmark', async () => {
  for (const [text, caret, expected] of [
    ['First. Ravens in between.', 11, 'Ravens in between.'],
    ['First. Ravens in between.', 14, 'Ravens in between.'],
    ['First sentence.', 4, 'First sentence.'],
    ['First. Next.', 7, 'Next.'],
    ['Same. Same. Same.', 14, 'Same.'],
    ['Heading\nFirst. Second sentence.', 22, 'Second sentence.'],
    ['First. Use e.g. examples here.', 22, 'Use e.g. examples here.'],
  ]) {
    const f = documentFixture(text, caret, caret);
    const reader = new WordReader();
    assert.equal(await reader.read(), expected);
    await reader.cleanup();
    assert.deepEqual(f.selections.at(-1), [caret, caret]);
    assert.equal(f.tracked.size, 0);
  }
});
test('paragraph API failure falls back to the caret', async () => {
  documentFixture('First. Second.', 10, 10);
  const reader = new WordReader();
  const run = Word.run;
  Word.run = (callback) => run((context) => {
    const select = context.document.getSelection;
    context.document.getSelection = () => {
      const range = select();
      Object.defineProperty(range, 'paragraphs', { get() { throw Error('unsupported'); } });
      return range;
    };
    return callback(context);
  });
  assert.equal(await reader.read(), 'ond.');
  assert.equal(reader.lastStartMethod, 'cursor-fallback');
  assert.equal(reader.lastStartError, 'unsupported');
});

for (const method of ['sentence', 'preceding-text', 'cursor-fallback']) {
  test(`sentence search records ${method} when Word omits search results`, async () => {
    const text = 'This sentence appears twice in the document. Something else happens in between. '
      + 'This sentence appears twice in the document.';
    const offset = text.indexOf('Something');
    const caret = text.indexOf('happens') + 3;
    documentFixture(text, caret, caret, null, (query) =>
      method === 'sentence' ? !query.endsWith(' ') : method === 'preceding-text' && query.endsWith(' '));
    const reader = new WordReader();
    assert.equal(await reader.read(), text.slice(method === 'cursor-fallback' ? caret : offset));
    assert.equal(reader.lastStartMethod, method);
  });
}
test('sentence search uses the leading 200 characters and escapes carets', async () => {
  const text = 'First. A^ ' + 'word '.repeat(60) + 'ends.';
  const caret = text.length - 2;
  documentFixture(text, caret, caret, null, (query) => {
    assert.ok(query.length <= 200);
    return query.startsWith('A^');
  });
  const reader = new WordReader();
  assert.equal(await reader.read(), text.slice(7));
  assert.equal(reader.lastStartMethod, 'sentence');
});

for (const yellow of [false, true]) {
  test(`latest highlight wins during slow Word sync, yellow=${yellow}`, async () => {
    const f = documentFixture('One. Two. Three. Four.', 0, 22);
    const reader = new WordReader();
    await reader.read();
    reader.chunks = ['One. ', 'Two. ', 'Three. ', 'Four.'];
    // Prepare mappings so the held sync is immediately before the visible mutation.
    await reader.highlight(3, 'Four.', false);
    f.selections.length = 0;
    let release;
    let entered;
    const waiting = new Promise((resolve) => { entered = resolve; });
    f.context.sync = () => {
      entered();
      return new Promise((resolve) => { release = resolve; });
    };
    // Yellow loads its colour before changing it; selection holds the mapping sync.
    const old = reader.highlight(3, 'Four.', yellow);
    await waiting;
    reader.invalidate();
    const latest = reader.highlight(2, 'Three.', yellow);
    f.context.sync = async () => {};
    release();
    await Promise.all([old, latest]);
    if (yellow) {
      assert.equal(f.colors.get('10:16'), '#FFFF00');
      assert.notEqual(f.colors.get('17:22'), '#FFFF00');
    } else {
      assert.deepEqual(f.selections.at(-1), [10, 16]);
    }
  });
}

test('latest selection runs after an obsolete select already sent to Word', async () => {
  const f = documentFixture('One. Two. Three. Four.', 0, 22);
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['One. ', 'Two. ', 'Three. ', 'Four.'];
  await reader.highlight(3, 'Four.', false);
  f.selections.length = 0;
  let release;
  let entered;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const pending = [];
  f.context.select = (range) => pending.push(range);
  f.context.sync = async () => {
    if (pending[0]?.[0] === 17) {
      entered();
      await new Promise((resolve) => { release = resolve; });
    }
    f.selections.push(...pending.splice(0));
  };
  const old = reader.highlight(3, 'Four.', false);
  await waiting;
  reader.invalidate();
  const latest = reader.highlight(2, 'Three.', false);
  release();
  await Promise.all([old, latest]);
  assert.deepEqual(f.selections, [[17, 22], [10, 16]]);
});

// Read the real DOCX instead of copying text that could drift from the Windows fixture.
const { stdout: sampleJSON } = await promisify(execFile)('python3', ['-c',
  'import json,sys; from docx import Document; print(json.dumps([p.text for p in Document(sys.argv[1]).paragraphs][3:5]))',
  new URL('../../testing/fixtures/sample.docx', import.meta.url).pathname]);
const sampleText = JSON.parse(sampleJSON).join('\r');
async function playbackFixture() {
  const caret = sampleText.indexOf('happens') + 3;
  const f = documentFixture(sampleText, caret, caret);
  const reader = new WordReader();
  const text = await reader.read();
  const { chunks, sentenceNumbers } = sentenceChunks(text, 300);
  assert.equal(chunks.join(''), text);
  assert.equal(chunks.length, 4);
  assert.ok(chunks[1].includes('appears twice'));
  reader.chunks = chunks;
  const utterances = [];
  let now;
  const player = new Player({
    engine: { cancel() {}, resume() {}, speak: (u) => utterances.push(u) },
    clock: { setTimeout() {}, clearTimeout() {} },
    chunks, sentenceNumbers,
    onInvalidate: () => reader.invalidate(),
    onChunkStart(index) { now = chunks[index]; void reader.highlight(index, chunks[index], false); },
  });
  player.play();
  await reader.queue;
  utterances.at(-1).onend();
  await reader.queue;
  return { ...f, reader, player, utterances, chunks, now: () => now };
}
function assertSelection(f, index) {
  const start = sampleText.indexOf('Something')
    + f.chunks.slice(0, index).join('').length + f.chunks[index].search(/\S/);
  const prefix = mapChunkToSearch(f.chunks[index]).replaceAll('^^', '^');
  assert.deepEqual(f.selections.at(-1), [start, start + prefix.length]);
  assert.equal(f.now(), f.chunks[index]);
  assert.equal(f.reader.lastHighlight.index, index);
  assert.notEqual(f.reader.lastHighlight.method, 'not-found');
}
for (const pendingAt of ['search', 'select']) {
  test(`real Player Previous wins with long chunk ${pendingAt} pending and late speech callbacks`, async () => {
    const f = await playbackFixture();
    let entered, release;
    const waiting = new Promise((resolve) => { entered = resolve; });
    let selected = false;
    f.context.select = (range) => { selected = true; f.selections.push(range); };
    f.context.sync = async () => {
      if ((pendingAt === 'search' || selected) && !release) {
        entered();
        await new Promise((resolve) => { release = resolve; });
      }
    };
    f.utterances.at(-1).onend();
    await waiting;
    const cancelled = f.utterances.at(-1);
    f.player.previous();
    cancelled.onstart(); cancelled.onboundary(); cancelled.onend();
    cancelled.onerror({ error: 'network' });
    f.context.sync = async () => {};
    release();
    await f.reader.queue;
    assert.equal(f.player.index, 1);
    assertSelection(f, 1);
  });
}
for (const failure of ['select throws', 'sync rejects', 'select ignored']) {
  test(`fresh position selection retries once: ${failure}`, async () => {
    const f = await playbackFixture();
    f.player.next();
    await f.reader.queue;
    assertSelection(f, 2);
    let first = true;
    if (failure === 'sync rejects') {
      f.context.sync = async () => { if (first) { first = false; throw Error('GeneralException'); } };
    } else {
      f.context.select = (range) => {
        if (first) {
          first = false;
          if (failure === 'select throws') throw Error('GeneralException');
          return;
        }
        f.selections.push(range);
      };
      // Ignore the actual selection too, once, rather than just its visible record.
      if (failure === 'select ignored') {
        const getSelection = f.context.document.getSelection;
        f.context.document.getSelection = () => {
          if (!first) { f.context.document.getSelection = getSelection; return new f.context.document.body.constructor(0, 0); }
          return getSelection();
        };
      }
    }
    f.player.previous();
    await f.reader.queue;
    assertSelection(f, 1);
    assert.equal(f.reader.lastHighlight.method, 'position-search');
    assert.ok(f.reader.lastHighlight.error);
  });
}
for (const chunk of [2, 3]) {
  test(`Previous from real long sentence chunk ${chunk} selects the repeated sentence`, async () => {
    const f = await playbackFixture();
    f.player.play(chunk);
    await f.reader.queue;
    assertSelection(f, chunk);
    assert.equal(f.player.sentenceIndex(), 2);
    assert.equal(f.player.sentenceCount, 3);
    f.player.previous();
    await f.reader.queue;
    assert.equal(f.player.sentenceIndex(), 1);
    assert.equal(f.player.index, 1);
    assertSelection(f, 1);
    f.player.next();
    await f.reader.queue;
    assert.equal(f.player.index, 2);
    assertSelection(f, 2);
  });
}
test('highlight failures remain visible and a later request recovers', async () => {
  const f = await playbackFixture();
  const sync = f.context.sync;
  f.context.sync = async () => { throw Error('Word unavailable'); };
  await f.reader.highlight(1, f.chunks[1], false);
  assert.deepEqual(f.reader.lastHighlight, { index: 1, method: 'not-found', error: 'Word unavailable' });
  f.context.sync = sync;
  await f.reader.highlight(1, f.chunks[1], false);
  assertSelection(f, 1);
});

test('a fresh selection ignored once is remapped and verified again', async () => {
  const f = await playbackFixture();
  const previous = f.selections.at(-1);
  let first = true;
  const getSelection = f.context.document.getSelection;
  f.context.document.getSelection = () => {
    if (first) {
      first = false;
      const range = getSelection();
      range.start = previous[0]; range.end = previous[1];
      return range;
    }
    return getSelection();
  };
  f.player.next();
  await f.reader.queue;
  assertSelection(f, 2);
  assert.equal(f.reader.lastHighlight.method, 'position-search');
  assert.ok(f.reader.lastHighlight.error);
});

test('many identical fillers map to exact positions after skipped and reverse requests', async () => {
  const filler = 'Reading aloud should feel smooth and steady.';
  const text = 'Intro. ' + Array(90).fill(filler).join(' ') + ' Tail.';
  const f = documentFixture(text, 0, text.length);
  const reader = new WordReader();
  await reader.read();
  reader.chunks = splitSentences(text, 300);
  for (const index of [70, 2, 80, 40, 39, 3]) {
    await reader.highlight(index, reader.chunks[index], false);
    const start = reader.chunks.slice(0, index).join('').length;
    assert.deepEqual(f.selections.at(-1), [start, start + filler.length]);
    assert.equal(reader.lastHighlight.method, 'position-search');
  }
  await reader.cleanup();
  assert.equal(f.tracked.size, 0);
});

test('reading, highlighting, restore and cleanup share one Word queue', async () => {
  const f = documentFixture('One. Two.', 0, 9);
  const run = Word.run;
  let active = 0, runs = 0;
  Word.run = async (...args) => {
    assert.equal(active++, 0, 'Word.run batches must never overlap');
    runs++;
    try { await Promise.resolve(); return await run(...args); }
    finally { active--; }
  };
  const reader = new WordReader();
  const read = reader.read();
  const clear = reader.clearHighlight();
  await Promise.all([read, clear]);
  reader.chunks = ['One. ', 'Two.'];
  await Promise.all([reader.highlight(0, 'One.', true), reader.highlight(1, 'Two.', true)]);
  await Promise.all([reader.clearHighlight(), reader.cleanup()]);
  assert.ok(runs >= 3);
  assert.equal(f.tracked.size, 0);
});

test('a persistent wrong duplicate is not-found and its visible selection is cleared', async () => {
  const f = documentFixture('Same. Same. Same.', 0, 17);
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['Same. ', 'Same. ', 'Same.'];
  f.context.document.getSelection = () => new f.context.document.body.constructor(0, 5);
  await reader.highlight(2, 'Same.', false);
  assert.equal(reader.lastHighlight.method, 'not-found');
  assert.match(reader.lastHighlight.error, /offset\/text/);
  assert.deepEqual(f.selections.at(-1), [0, 0]);
});

test('position zero mapping never expands two identical collapsed ranges', async () => {
  const f = documentFixture('One. Two.', 0, 9);
  const prototype = Object.getPrototypeOf(f.context.document.body);
  const expand = prototype.expandTo;
  prototype.expandTo = function(other) {
    assert.ok(this.start !== this.end || other.start !== other.end || this.start !== other.start);
    return expand.call(this, other);
  };
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['One. ', 'Two.'];
  await reader.highlight(0, 'One.', false);
  assert.equal(reader.lastHighlight.method, 'position-search');
  assert.deepEqual(f.selections.at(-1), [0, 4]);
});
