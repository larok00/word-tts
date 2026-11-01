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
function documentFixture(text, selectionStart = 0, selectionEnd = 0, color = null) {
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
      selections.push([this.start, this.end]);
    }
    /** Simulate literal caret escaping and the first matching range. */
    search(query, options) {
      assert.equal(options.matchCase, true);
      searches++;
      const needle = query.replaceAll('^^', '^');
      const position = text.indexOf(needle, this.start);
      return {
        items:
          position >= 0 && position + needle.length <= this.end
            ? [new Range(position, position + needle.length)]
            : [],
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
  return { selections, colors, tracked, searchCount: () => searches };
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
