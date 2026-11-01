/** splitter.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../src/lib/splitter.js';
import cases from './splitter-cases.mjs';
import { splitFallback } from '../src/lib/splitter-fallback.js';

/** Check executable invariants on examples; this does not prove LAWS.bend. */
function laws(text, max, chunks) {
  assert.equal(chunks.join(''), text, 'lossless');
  for (const chunk of chunks) {
    assert.ok(Array.from(chunk).length > 0, 'nonempty');
    assert.ok(Array.from(chunk).length <= max, 'bounded in Bend characters');
  }
}
for (const [name, text, max, expected] of cases) {
  test(name, () => {
    const chunks = splitSentences(text, max);
    assert.deepEqual(chunks, expected);
    laws(text, max, chunks);
  });
}
test('200 deterministic random lossless cases', () => {
  let seed = 137;
  /** Fixed-seed generation makes failures repeatable across runs. */
  const random = (n) => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
  const tokens = ['a', 'B', ' ', '. ', 'Dr. ', '3.14', '\n', '...', '"', '😀', '\r', '…', '!)'];
  for (let i = 0; i < 200; i++) {
    let text = '';
    for (let j = random(120); j > 0; j--) text += tokens[random(tokens.length)];
    const max = 1 + random(70);
    const chunks = splitSentences(text, max);
    laws(text, max, chunks);
    assert.deepEqual(splitFallback(text, max), chunks, 'port matches reference');
  }
});
test('20,000 characters in under 2 seconds', () => {
  for (const text of ['Word sentence. '.repeat(1334).slice(0, 20000), 'a'.repeat(20000)]) {
    const start = performance.now();
    const chunks = splitSentences(text);
    const elapsed = performance.now() - start;
    laws(text, 300, chunks);
    assert.ok(elapsed < 2000, `took ${elapsed.toFixed(1)} ms`);
  }
});
test('invalid max is rejected', () => {
  for (const max of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => splitSentences('a', max), RangeError);
});
test('fallback matches every reference case', async () => {
  const { splitFallback } = await import('../src/lib/splitter-fallback.js');
  for (const [, text, max, expected] of cases) {
    const chunks = splitFallback(text, max);
    assert.deepEqual(chunks, expected);
    laws(text, max, chunks);
  }
});
test('lone UTF-16 surrogates remain lossless', () => {
  for (const text of ['\ud800', 'A\udfff. Next.', '\ud800 😀\udfff']) {
    for (const max of [1, 3, 300]) laws(text, max, splitSentences(text, max));
  }
});
