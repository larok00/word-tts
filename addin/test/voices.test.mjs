/** Pure voice list behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortVoices, filterVoices, pickDefault, buildFallbackOrder } from '../src/lib/voices.js';
const voices = [
  { voiceURI: 'online', name: 'Cloud', lang: 'en-GB', localService: false },
  { voiceURI: 'fr', name: 'French', lang: 'fr-FR', localService: true },
  { voiceURI: 'us', name: 'US', lang: 'en-US', localService: true },
  { voiceURI: 'gb', name: 'British', lang: 'en-GB', localService: true }
];
test('local first, preferred language then English', () => {
  assert.deepEqual(sortVoices(voices).map(v => v.voiceURI), ['gb', 'us', 'fr', 'online']);
  assert.equal(voices[0].voiceURI, 'online');
});
test('filter and defaults handle empty and saved voices', () => {
  assert.equal(filterVoices(voices).length, 3); assert.equal(filterVoices(voices, false).length, 4);
  assert.equal(pickDefault(voices).voiceURI, 'gb'); assert.equal(pickDefault(voices, 'us').voiceURI, 'us'); assert.equal(pickDefault([]), null);
});
test('fallback starts selected then local same language', () => {
  assert.deepEqual(buildFallbackOrder(voices, voices[0]).map(v => v.voiceURI), ['online', 'gb', 'us', 'fr']);
});
