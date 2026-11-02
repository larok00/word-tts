/** word.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
/** Behavioral Word integration checks with a tiny range/context simulator.
 * Real Office acceptance is still required; this catches ordering and restore regressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WordReader } from '../src/word.js';
/** Emulate context ownership and literal range search without importing Office. */
function documentFixture(text, selectionStart = 0, selectionEnd = 0, color = null, searchFilter = () => true) {
  const selections = [];
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
      return { getFirst: () => new Range(text.lastIndexOf('\n', this.start - 1) + 1,
        text.indexOf('\n', this.start) < 0 ? text.length : text.indexOf('\n', this.start)) };
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
    getSelection: () => new Range(selectionStart, selectionEnd),
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
  await reader.enqueue(() => {
    throw Error('Word unavailable');
  });
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
    reader.chunks = ['One.', 'Two.', 'Three.', 'Four.'];
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
    if (!yellow) reader.mappedThrough = 2;
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
      assert.deepEqual(f.selections, [[10, 16]]);
    }
  });
}

test('latest selection runs after an obsolete select already sent to Word', async () => {
  const f = documentFixture('One. Two. Three. Four.', 0, 22);
  const reader = new WordReader();
  await reader.read();
  reader.chunks = ['One.', 'Two.', 'Three.', 'Four.'];
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
