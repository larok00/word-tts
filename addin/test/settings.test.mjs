/** settings.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
/** Storage corruption and browser-denial tests use injected storage only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  SETTINGS_KEY,
  loadSettings,
  saveSettings,
  normalizeRate,
} from '../src/lib/settings.js';
/** Minimal localStorage-compatible Map adapter. */
function storage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
test('settings roundtrip', () => {
  const store = storage();
  saveSettings(store, { voiceURI: 'a', rate: 1.2, highlight: true, followWords: true });
  assert.deepEqual(loadSettings(store), { voiceURI: 'a', rate: 1.2, highlight: true, followWords: true });
});
test('missing, corrupt and denied storage never throw', () => {
  const store = storage();
  assert.deepEqual(loadSettings(store), DEFAULTS);
  for (const value of ['{bad', 'null', '42', '"text"', '{"rate":"bad","highlight":"yes"}']) {
    store.setItem(SETTINGS_KEY, value);
    assert.deepEqual(loadSettings(store), DEFAULTS);
  }
  assert.deepEqual(loadSettings(undefined), DEFAULTS);
  assert.doesNotThrow(() => saveSettings(undefined, DEFAULTS));
});
test('rates clamp, round and reject nonfinite values', () => {
  assert.equal(normalizeRate(0), 0.5);
  assert.equal(normalizeRate(9), 2.5);
  assert.equal(normalizeRate(1.26), 1.3);
  assert.equal(normalizeRate(NaN), 1);
});


test('word following defaults on for old preferences and persists explicit false', () => {
  const store = storage();
  store.setItem(SETTINGS_KEY, '{"highlight":true}');
  assert.equal(loadSettings(store).followWords, true);
  saveSettings(store, { followWords: false });
  assert.equal(loadSettings(store).followWords, false);
});
