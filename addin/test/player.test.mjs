/** player.test fixtures/checks for the add-in. No public exports.
 * Node test support; integration fixtures avoid requiring Word or live speech.
 */
/** Deterministic speech tests: no browser, real timers, or Office required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/lib/player.js';
/** Advance an injected timer queue in deadline order, including newly scheduled jobs. */
function fixture(options = {}) {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  const clock = {
    /** Queue a deadline without waiting for real time. */
    setTimeout(fn, delay) {
      jobs.set(++id, { fn, at: now + delay });
      return id;
    },
    /** Remove a deadline so cancellation can be asserted deterministically. */
    clearTimeout(key) {
      jobs.delete(key);
    },
    /** Run due jobs in order, including jobs scheduled by callbacks. */
    tick(delta) {
      const target = now + delta;
      while (true) {
        const next = [...jobs.entries()]
          .filter(([, job]) => job.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        jobs.delete(next[0]);
        next[1].fn();
      }
      now = target;
    },
  };
  const engine = {
    utterances: [],
    cancels: 0,
    pauses: 0,
    resumes: 0,
    /** Keep callbacks so tests can deliver late or missing engine events. */
    speak(utterance) {
      this.utterances.push(utterance);
    },
    /** Record cancel requests without automatically emitting browser events. */
    cancel() {
      this.cancels++;
    },
    /** Count native pause attempts without moving the fake playback position. */
    pause() {
      this.pauses++;
    },
    /** Count native resumes so tests can distinguish resume from a new utterance. */
    resume() {
      this.resumes++;
    },
  };
  const states = [];
  const errors = [];
  const starts = [];
  const player = new Player({
    engine,
    clock,
    chunks: ['One.', 'Two.'],
    voices: [{ voiceURI: 'a' }, { voiceURI: 'b' }],
    onStateChange: (state) => states.push(state),
    onError: (error) => errors.push(error),
    onChunkStart: (index) => starts.push(index),
    ...options,
  });
  return { player, engine, clock, states, errors, starts, current: () => engine.utterances.at(-1) };
}
test('normal playthrough skips whitespace and finishes', () => {
  const f = fixture({ chunks: [' ', 'One.', '\r', 'Two.'] });
  f.player.play();
  f.current().onend();
  f.current().onend();
  assert.deepEqual(f.starts, [1, 3]);
  assert.equal(f.player.state, 'finished');
});
test('pause suspends watchdog; resume progress prevents restart', () => {
  const f = fixture();
  f.player.play();
  f.player.pause();
  f.clock.tick(100000);
  assert.equal(f.engine.utterances.length, 1);
  f.player.resume();
  f.current().onboundary();
  f.clock.tick(1500);
  assert.equal(f.engine.utterances.length, 1);
  assert.equal(f.engine.pauses, 1);
});
test('silent resume restarts at 1500ms', () => {
  const f = fixture();
  f.player.play();
  f.player.pause();
  f.player.resume();
  f.clock.tick(1500);
  assert.equal(f.engine.utterances.length, 2);
  assert.equal(f.player.index, 0);
});
test('stop ignores late end and error callbacks', () => {
  const f = fixture();
  f.player.play();
  const old = f.current();
  f.player.stop();
  old.onend();
  old.onerror({ error: 'network' });
  f.clock.tick(100000);
  assert.equal(f.player.state, 'stopped');
  assert.equal(f.engine.utterances.length, 1);
});
test('next and previous clamp boundaries', () => {
  const f = fixture();
  f.player.previous();
  assert.equal(f.player.index, 0);
  f.player.next();
  f.player.next();
  assert.equal(f.player.index, 1);
  f.player.previous();
  assert.equal(f.player.index, 0);
});
test('live rate change restarts and stale callbacks do nothing', () => {
  const f = fixture();
  f.player.play();
  const old = f.current();
  f.player.setRate(1.7);
  old.onend();
  assert.equal(f.current().rate, 1.7);
  assert.equal(f.player.index, 0);
  assert.equal(f.engine.utterances.length, 2);
});
test('voice errors retry same chunk with next voice', () => {
  const f = fixture();
  f.player.play();
  f.current().onerror({ error: 'network' });
  assert.equal(f.current().voice.voiceURI, 'b');
  assert.equal(f.player.index, 0);
});
test('watchdog timeout tries fallback', () => {
  const f = fixture();
  f.player.play();
  f.clock.tick(4600);
  assert.equal(f.current().voice.voiceURI, 'b');
});
test('all voices fail then pause and report an error', () => {
  const f = fixture();
  f.player.play();
  f.current().onerror({ error: 'network' });
  f.current().onerror({ error: 'network' });
  assert.equal(f.player.state, 'paused');
  assert.equal(f.player.index, 0);
  assert.equal(f.errors.length, 1);
  f.clock.tick(100000);
  assert.equal(f.engine.utterances.length, 2);
});
test('callbacks and engine exceptions never escape speech callbacks', () => {
  /** Simulate observers and engines throwing inside speech callbacks. */
  const throwing = () => {
    throw Error('observer failed');
  };
  const f = fixture({ onStateChange: throwing, onChunkStart: throwing, onError: throwing });
  f.player.play();
  assert.doesNotThrow(() => f.current().onend());
  f.engine.speak = throwing;
  assert.doesNotThrow(() => f.current().onerror({ error: 'network' }));
  assert.equal(f.player.state, 'paused');
});
test('canceled event does not immediately try another voice', () => {
  const f = fixture();
  f.player.play();
  f.current().onerror({ error: 'canceled' });
  assert.equal(f.engine.utterances.length, 1);
});
test('empty input finishes safely', () => {
  const f = fixture({ chunks: [] });
  f.player.play();
  assert.equal(f.player.state, 'finished');
});
test('rate change while paused takes effect on resume without waiting', () => {
  const f = fixture();
  f.player.play();
  f.player.pause();
  f.player.setRate(2);
  assert.equal(f.player.state, 'paused');
  assert.equal(f.engine.utterances.length, 1);
  f.player.resume();
  assert.equal(f.engine.utterances.length, 2);
  assert.equal(f.current().rate, 2);
});
test('resume after voice exhaustion retries the chosen voice', () => {
  const f = fixture();
  f.player.play();
  f.current().onerror({ error: 'network' });
  f.current().onerror({ error: 'network' });
  f.player.resume();
  assert.equal(f.player.state, 'playing');
  assert.equal(f.current().voice.voiceURI, 'a');
});
