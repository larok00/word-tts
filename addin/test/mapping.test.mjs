/** Word search text remains within the limit even after caret escaping. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapChunkToSearch } from '../src/lib/mapping.js';
test('trim, paragraph collapse and literal caret', () => {
  assert.equal(mapChunkToSearch(' \rHello\r\nworld ^ here.\n '), 'Hello world ^^ here.'); assert.equal(mapChunkToSearch('\r \n'), null);
});
test('truncate on word boundary and count escaped length', () => {
  const result = mapChunkToSearch('hello '.repeat(60)); assert.ok(result.length <= 250); assert.ok(result.endsWith('hello'));
  assert.equal(mapChunkToSearch('^'.repeat(300)).length, 250);
});
test('long words and surrogate pairs remain valid', () => {
  assert.equal(mapChunkToSearch('x'.repeat(300)).length, 250);
  const result = mapChunkToSearch('😀'.repeat(200)); assert.equal(result.length, 250); assert.equal([...result].length, 125);
});
