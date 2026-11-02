/** Sentence offsets use the same compiled splitter and fallback as speech. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceStartOffset } from '../src/lib/sentence-start.js';
for (const [prefix, expected] of [
  ['', 0], ['First sen', 0], ['First. Rav', 7],
  ['First. Use e.g. examp', 7], ['First. ', 7],
  ['First. Second. ', 15], ['First. 😀 ra', 7], ['First. \ud800 ra', 7],
  ['a'.repeat(500), 0],
]) {
  test(`sentence start for ${JSON.stringify(prefix.slice(0, 40))}`, () => {
    assert.equal(sentenceStartOffset(prefix), expected);
  });
}
