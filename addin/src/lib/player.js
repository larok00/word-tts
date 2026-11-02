/** Speech state machine, independent of UI and Office. Exports Player; injected
 * engine and clock make retries, stale events, and watchdogs testable.
 */
import { normalizeRate } from './settings.js';
export class Player {
  /** Inject the engine and clock so state transitions can be tested without speech. */
  constructor({
    engine,
    chunks = [],
    voices = [],
    sentenceNumbers = [],
    clock = globalThis,
    onChunkStart = () => {},
    onInvalidate = () => {},
    onStateChange = () => {},
    onError = () => {},
  }) {
    Object.assign(this, { engine, chunks, sentenceNumbers, voices, clock, onChunkStart, onInvalidate, onStateChange, onError });
    this.state = 'idle';
    this.index = 0;
    this.rate = 1;
    this.attempt = 0;
    this.needsRestart = true;
    this.voiceIndex = 0;
    this.watchdog = null;
    this.resumeTimer = null;
  }
  /** User code must not throw into a speech callback. */
  notify(callback, value) {
    try {
      callback(value);
    } catch {
      /* Isolate observers. */
    }
  }
  /** Publish state after updating it, so observers see consistent data. */
  setState(state) {
    this.state = state;
    this.notify(this.onStateChange, state);
  }
  /** Invalidate old utterances before cancel(), which may synchronously emit errors. */
  cancel() {
    this.notify(this.onInvalidate);
    this.attempt++;
    this.needsRestart = true;
    this.clock.clearTimeout(this.watchdog);
    this.clock.clearTimeout(this.resumeTimer);
    try {
      this.engine.cancel();
    } catch {
      /* A broken engine is handled on speak. */
    }
  }
  /** Replace content for a new document selection. */
  setChunks(chunks, sentenceNumbers = []) {
    this.stop();
    this.chunks = chunks;
    this.sentenceNumbers = sentenceNumbers;
    this.index = 0;
  }
  /** Begin at a requested sentence, skipping chunks containing only whitespace. */
  play(index = 0) {
    this.index = Math.max(0, Math.min(Math.trunc(index) || 0, this.chunks.length - 1));
    this.voiceIndex = 0;
    this.startChunk();
  }
  /** Cancel the old browser queue before speaking, so retries cannot overlap audio. */
  startChunk() {
    this.cancel();
    while (this.index < this.chunks.length && !this.chunks[this.index].trim()) this.index++;
    if (this.index >= this.chunks.length) {
      this.setState('finished');
      return;
    }
    this.setState('playing');
    this.notify(this.onChunkStart, this.index);
    const token = this.attempt;
    /** Reject callbacks from canceled utterances, including synchronous cancel errors. */
    const active = () => token === this.attempt && this.state === 'playing';
    /** Progress after resume cancels the restart timer. */
    const progress = () => {
      if (active()) this.clock.clearTimeout(this.resumeTimer);
    };
    /** Advance only when the current utterance actually completes. */
    const ended = () => {
      try {
        if (!active()) return;
        this.index++;
        this.voiceIndex = 0;
        this.startChunk();
      } catch {
        this.fail('speech-failed', token);
      }
    };
    /** Normalize browser event objects and synthetic timeout errors. */
    const failed = (event) => {
      try {
        this.fail(event?.error || 'speech-failed', token);
      } catch {
        /* Never escape. */
      }
    };
    this.armWatchdog(token);
    try {
      this.engine.resume(); // Recover Chromium's stuck paused flag.
      this.needsRestart = false;
      this.engine.speak({
        text: this.chunks[this.index],
        rate: this.rate,
        voice: this.voices[this.voiceIndex] || null,
        onstart: progress,
        onboundary: progress,
        onend: ended,
        onerror: failed,
      });
    } catch {
      failed({ error: 'speech-unavailable' });
    }
  }
  /** Recover when WebView2 omits an end/error event; suspend this timer while paused. */
  armWatchdog(token = this.attempt) {
    this.clock.clearTimeout(this.watchdog);
    const delay = 4000 + (150 * this.chunks[this.index].length) / this.rate;
    this.watchdog = this.clock.setTimeout(() => this.fail('timeout', token), delay);
  }
  /** Retry each voice once; exhaustion leaves the failed sentence ready to resume. */
  fail(error, token) {
    if (token !== this.attempt || this.state !== 'playing') return;
    if (error === 'interrupted' || error === 'canceled') return;
    this.cancel();
    if (this.voiceIndex + 1 < this.voices.length) {
      this.voiceIndex++;
      this.startChunk();
    } else {
      this.setState('paused');
      this.notify(
        this.onError,
        'The voices could not read this sentence. Try another voice, then Resume or Next sentence.',
      );
    }
  }
  /** Keep the utterance in place while stopping elapsed-time watchdogs. */
  pause() {
    if (this.state !== 'playing') return;
    this.clock.clearTimeout(this.watchdog);
    this.clock.clearTimeout(this.resumeTimer);
    this.setState('paused');
    try {
      this.engine.pause();
    } catch {
      this.cancel();
    }
  }
  /** Restart when Chromium gives no progress signal after resume. */
  resume() {
    if (this.state !== 'paused') return;
    this.voiceIndex = 0;
    if (this.needsRestart) {
      this.startChunk();
      return;
    }
    this.setState('playing');
    this.armWatchdog();
    this.resumeTimer = this.clock.setTimeout(() => {
      if (this.state === 'playing') this.startChunk();
    }, 1500);
    try {
      this.engine.resume();
    } catch {
      this.startChunk();
    }
  }
  /** Stop is idempotent and ignores any subsequent browser events. */
  stop() {
    this.cancel();
    this.setState('stopped');
  }
  /** Chunk indexes remain internal; controls and status use sentence identities. */
  sentenceIndex(index = this.index) {
    const chunk = Math.min(index, this.chunks.length - 1);
    return this.sentenceNumbers[chunk] ?? chunk;
  }
  get sentenceCount() {
    return this.chunks.length ? this.sentenceIndex(this.chunks.length - 1) + 1 : 0;
  }
  /** Always go to N±1, even from the second chunk; no restart-current grace. */
  navigate(delta) {
    if (!this.chunks.length) return;
    const target = Math.max(0, Math.min(this.sentenceIndex() + delta, this.sentenceCount - 1));
    const index = this.chunks.findIndex((_, i) => this.sentenceIndex(i) === target && this.chunks[i].trim());
    this.play(index < 0 ? 0 : index);
  }
  next() { this.navigate(1); }
  previous() { this.navigate(-1); }
  /** SpeechSynthesis cannot change an existing utterance's rate reliably. */
  setRate(rate) {
    this.rate = normalizeRate(rate);
    if (this.state === 'playing') this.startChunk();
    else if (this.state === 'paused') this.cancel();
  }
}
