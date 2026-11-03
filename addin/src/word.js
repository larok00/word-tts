/** Word API boundary. Exports WordReader; speech never waits for its serialized
 * highlight queue. Tracked ranges remain valid across separate Word.run batches.
 */
import { sentenceStartOffset } from './lib/sentence-start.js';
import { mapChunkToSearch, normalizeText, searchPart } from './lib/mapping.js';
export class WordReader {
  /** Keep document state separate from the speech session. */
  constructor() {
    this.queue = Promise.resolve();
    this.generation = 0;
    this.reading = null;
    this.original = null;
    this.yellow = null;
    this.onEvent = () => {};
    this.chunks = [];
    this.sentenceNumbers = [];
    this.lastHighlight = null;
    this.lastStartMethod = null;
    this.lastStartError = null;
    this.drift = 0;
    this.wordRequest = 0;
  }
  /** Serialize every Word batch; a failed caller never poisons the following work. */
  enqueue(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  /** Capture text and track ranges: Office otherwise releases proxies after Word.run ends. */
  async read() {
    this.lastStartMethod = null;
    this.lastStartError = null;
    this.lastHighlight = null;
    await this.cleanup(false);
    return this.enqueue(() => Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();
      this.original = selection;
      this.original.track();
      this.reading =
        selection.text.length > 0
          ? selection.getRange()
          : (await this.sentenceStart(context, selection)).expandTo(context.document.body.getRange('End'));
      this.reading.track();
      this.reading.load('text');
      await context.sync();
      return this.reading.text;
    }));
  }
  /** Resolve within the paragraph; unsupported Word operations retain cursor reading. */
  async sentenceStart(context, selection) {
    const cursor = selection.getRange('Start');
    try {
      const paragraph = selection.paragraphs.getFirst();
      const start = paragraph.getRange('Start');
      const prefix = start.expandTo(cursor);
      prefix.load('text');
      await context.sync();
      const offset = sentenceStartOffset(prefix.text);
      if (!offset) {
        this.lastStartMethod = 'paragraph';
        return start;
      }
      if (offset === prefix.text.length) {
        this.lastStartMethod = 'sentence';
        return cursor;
      }
      // Search sentence text first: Word may ignore trailing spaces in preceding text.
      for (const preceding of [false, true]) {
        try {
          const text = preceding
            ? prefix.text.slice(0, offset).slice(-100)
            : prefix.text.slice(offset).slice(0, 200);
          const matches = prefix.search(text.replaceAll('^', '^^'), {
            matchCase: true, matchWildcards: false,
          });
          matches.load('items');
          await context.sync();
          const candidates = matches.items.map((match) => {
            const range = match.getRange(preceding ? 'End' : 'Start');
            return { range, prefix: start.expandTo(range) };
          });
          for (const candidate of candidates) candidate.prefix.load('text');
          await context.sync();
          // Compare offsets so repeated sentences cannot move the reading position.
          const found = candidates.find((candidate) => candidate.prefix.text.length === offset);
          if (found) {
            this.lastStartMethod = preceding ? 'preceding-text' : 'sentence';
            return found.range;
          }
        } catch (error) {
          this.lastStartError = error.message || String(error);
        }
      }
    } catch (error) {
      this.lastStartError = error.message || String(error);
    }
    this.lastStartMethod = 'cursor-fallback';
    return cursor;
  }
  /** Restore temporary formatting before applying the next highlight. */
  async restoreYellow(context) {
    if (!this.yellow) return;
    const { range, color } = this.yellow;
    range.font.highlightColor = color;
    await context.sync();
    range.untrack();
    this.yellow = null;
  }
  /** Navigation cancels obsolete Word work before speech can emit callbacks. */
  invalidate() {
    ++this.generation;
    ++this.wordRequest;
  }
  /** Search prefixes first; Word sub-range lengths can differ from the reading snapshot. */
  async mapIndex(context, index, chunk) {
    const part = searchPart(chunk);
    if (!part) return null;
    const results = this.reading.search(part.query, { matchCase: true, matchWildcards: false });
    results.load('items');
    await context.sync();
    const start = this.reading.getRange('Start');
    const candidates = results.items.map((range) => ({ range, prefix: start.expandTo(range) }));
    for (const candidate of candidates) {
      candidate.prefix.load('text');
      candidate.range.load('text');
    }
    await context.sync();
    const expected = this.chunks.slice(0, index).join('').length + part.offset;
    const valid = candidates.map(({ range, prefix }) => ({ range,
      offset: prefix.text.length - range.text.length,
    })).filter(({ range }) => normalizeText(range.text) === normalizeText(part.text));
    // Reverse navigation starts a new forward search window.
    const floor = this.current && index > this.current.index ? this.current.offset : -Infinity;
    const found = valid.find(({ offset }) => offset === expected)
      || valid.filter(({ offset }) => offset >= floor)
        .sort((a, b) => Math.abs(a.offset - expected - this.drift) - Math.abs(b.offset - expected - this.drift))[0];
    if (!found) return null;
    this.match = found.offset === expected ? 'exact' : found.offset === expected + this.drift ? 'drift' : 'nearest';
    this.mappedDrift = found.offset - expected;
    this.mappedOffset = found.offset;
    let range = found.range;
    const tail = searchPart(chunk.slice(part.offset + part.text.length), true);
    if (tail) {
      const rest = range.getRange('End').expandTo(this.reading.getRange('End'));
      const ends = rest.search(tail.query, { matchCase: true, matchWildcards: false });
      ends.load('items');
      await context.sync();
      const expanded = ends.items.map((end) => range.expandTo(end));
      for (const candidate of expanded) candidate.load('text');
      await context.sync();
      if (expanded.length) range = expanded.find((candidate) => normalizeText(candidate.text) === normalizeText(chunk)) || expanded[0];
      else this.onEvent(`selection partial chunk=${index + 1} fallback=prefix reason=end-not-found`);
    }
    range.load('text');
    await context.sync();
    this.mappedText = range.text;
    if (normalizeText(range.text) !== normalizeText(chunk)) {
      this.onEvent(`selection partial chunk=${index + 1} fallback=prefix reason=full-text-mismatch`);
      range = found.range;
      this.mappedText = range.text;
    }
    return range;
  }
  /** Compare actual endpoints, without relying on host-specific text lengths. */
  async sameRange(context, left, right) {
    const comparison = left.compareLocationWith(right);
    await context.sync();
    return String(comparison.value).toLowerCase() === 'equal';
  }
  /** Verify selection and keep an owned bookmark for Stop, including word selections. */
  async selectRange(context, range, index, chunk, yellowMode, generation) {
    if (generation !== this.generation) return;
    if (yellowMode) {
      range.font.load('highlightColor');
      await context.sync();
      if (generation !== this.generation) return;
      const color = range.font.highlightColor;
      if (color !== '' && String(color).toLowerCase() !== 'mixed') {
        this.yellow = { range: range.getRange(), color };
        this.yellow.range.track();
        range.font.highlightColor = '#FFFF00';
      }
    }
    if (generation !== this.generation) return;
    this.pendingSelection?.range.untrack();
    this.pendingSelection = { range: range.getRange(), index };
    this.pendingSelection.range.track();
    range.select();
    await context.sync();
    if (generation !== this.generation) return;
    const selection = context.document.getSelection();
    selection.load('text');
    const equal = await this.sameRange(context, selection, range);
    if (generation !== this.generation) return;
    if (!equal || normalizeText(selection.text) !== normalizeText(this.mappedText)) {
      throw new Error('Word selection did not match the chunk offset/text');
    }
    this.owned?.untrack();
    this.owned = range.getRange();
    this.owned.track();
  }
  /** Release chunk and word bookmarks together; never retain search proxies untracked. */
  releaseCurrent() {
    if (!this.current) return;
    this.current.range.untrack();
    for (const word of this.current.words) word.range?.untrack();
    this.current = null;
  }
  /** Cache repeated words by their offsets, not by their spelling alone. */
  async cacheWords(context, range, index, chunk, generation) {
    const words = [...chunk.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)]
      .map((match) => ({ text: match[0], offset: match.index, length: match[0].length }));
    const searches = new Map();
    for (const word of words) {
      if (!searches.has(word.text)) {
        const results = range.search(mapChunkToSearch(word.text), { matchCase: true, matchWildcards: false });
        results.load('items');
        searches.set(word.text, results);
      }
    }
    await context.sync();
    const candidates = new Map();
    for (const [text, results] of searches) {
      candidates.set(text, results.items.map((item) => {
        const prefix = range.getRange('Start').expandTo(item);
        prefix.load('text'); item.load('text');
        return { range: item, prefix };
      }));
    }
    await context.sync();
    if (generation !== this.generation) return;
    let correction = 0, previous = -1;
    const leading = chunk.search(/\S/);
    for (const word of words) {
      const choices = candidates.get(word.text).map((candidate) => ({ ...candidate,
        offset: candidate.prefix.text.length - candidate.range.text.length,
      })).filter((candidate) => candidate.offset > previous && candidate.range.text === word.text);
      const found = choices.sort((a, b) => Math.abs(a.offset - word.offset + leading - correction)
        - Math.abs(b.offset - word.offset + leading - correction))[0];
      if (found) {
        word.range = found.range; word.range.track();
        correction = found.offset - (word.offset - leading);
        previous = found.offset;
      }
    }
    this.releaseCurrent();
    this.current = { range: range.getRange(), index, offset: this.mappedOffset, words };
    this.current.range.track();
  }
  /** Speech never awaits Word. Only the newest pending word may change selection. */
  highlightWord(index, charIndex, charLength) {
    const generation = this.generation;
    const request = ++this.wordRequest;
    return this.enqueue(async () => {
      if (generation !== this.generation || request !== this.wordRequest || this.current?.index !== index) return;
      const word = this.current.words.find((word) => charIndex >= word.offset && charIndex < word.offset + word.length);
      if (!word?.range) {
        this.onEvent(`word fallback=sentence reason=unmapped chunk=${index + 1}`);
      }
      try {
        await Word.run(this.reading, async (context) => {
          if (generation !== this.generation || request !== this.wordRequest) return;
          const range = word?.range || this.current.range;
          range.select();
          this.owned?.untrack();
          this.owned = range.getRange(); this.owned.track();
          await context.sync();
          if (generation !== this.generation) return;
          if (word?.range && this.wordStats?.index === index) this.wordStats.highlighted.add(word.offset);
        });
      } catch (error) { this.onEvent(`word fallback=sentence reason=${error.message || error}`); }
    });
  }
  /** One summary per chunk keeps the small Diagnostics history useful. */
  summarizeWords() {
    if (!this.wordStats) return;
    const { index, highlighted, events, total } = this.wordStats;
    this.onEvent(`chunk=${index + 1} words highlighted=${highlighted.size} of ${total}`
      + (events ? '' : ' boundary events=none fallback=sentence'));
    this.wordStats = null;
  }
  /** Count boundary delivery even when word following is disabled. */
  wordBoundary(index, charIndex, charLength, follow = true) {
    if (this.wordStats?.index === index) {
      if (!this.wordStats.events++) this.onEvent(`word boundary chunk=${index + 1} first`);
    }
    if (follow) return this.highlightWord(index, charIndex, charLength);
  }
  /** Coalesce pending requests; retry once in a fresh batch after a host failure. */
  highlight(index, chunk, yellowMode) {
    this.summarizeWords();
    this.wordStats = { index, events: 0, highlighted: new Set(),
      total: [...chunk.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)].length };
    this.requestedIndex = index;
    const generation = ++this.generation;
    ++this.wordRequest;
    const label = `sentence=${(this.sentenceNumbers[index] ?? index) + 1} chunk=${index + 1}`;
    this.onEvent(`select request ${label}`);
    return this.enqueue(async () => {
      if (generation !== this.generation || !this.reading) {
        this.onEvent(`select result ${label} superseded`);
        return;
      }
      let error = null;
      let method = 'not-found';
      // Also retry a fresh range if Word ignores its first selection request.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (generation !== this.generation) return;
        method = 'position-search';
        this.onEvent(`select ${label} method=${method} retry=${attempt}`);
        try {
          // A failed Office batch may contain invalid proxies; retry in a new batch.
          await Word.run(this.reading, async (context) => {
            if (generation !== this.generation) return;
            const range = await this.mapIndex(context, index, chunk);
            if (generation !== this.generation) return;
            if (!range) {
              method = 'not-found';
              this.onEvent(`selection lost ${label} recovery=kept-previous reason=not-found`);
              return;
            }
            await this.restoreYellow(context);
            await this.selectRange(context, range, index, chunk, yellowMode, generation);
            if (generation !== this.generation) return;
            this.drift = this.mappedDrift;
            try { await this.cacheWords(context, range, index, chunk, generation); }
            catch (error) {
              // A voice can still read with sentence selection if word lookup fails.
              this.onEvent(`word fallback=sentence reason=${error.message || error}`);
              this.releaseCurrent();
              this.current = { range: range.getRange(), index, offset: this.mappedOffset, words: [] };
              this.current.range.track();
            }
            this.onEvent(`select ${label} method=position-search match=${this.match} drift=${this.drift >= 0 ? '+' : ''}${this.drift}`);
          });
          break;
        } catch (caught) {
          method = 'not-found';
          error = [caught.code, caught.message].filter(Boolean).join(': ') || String(caught);
          this.onEvent(`selection lost ${label} recovery=kept-previous error=${error}`);
          this.onEvent(`select ${label} method=position-search error=${error} retry=${attempt}`);
        }
      }
      if (generation === this.generation) {
        this.lastHighlight = { index, method, error };
        this.onEvent(`select result ${label} method=${method} error=${error || 'none'}`);
      } else this.onEvent(`select result ${label} superseded`);
    });
  }
  /** Error/finish restores yellow without discarding navigation or the selection bookmark. */
  clearHighlight() {
    ++this.generation;
    return this.enqueue(() => {
      const anchor = this.reading || this.original;
      if (anchor) return Word.run(anchor, (context) => this.restoreYellow(context));
    }).catch((error) => this.onEvent(`clear highlight error=${error.message || error}`));
  }
  /** Collapse only a selection we still own; user clicks always win. */
  async settleSelection(context, action) {
    let result = 'kept-user';
    const selection = context.document.getSelection();
    let current = null;
    if (this.owned && this.current && await this.sameRange(context, selection, this.owned)) current = this.current;
    else if (this.pendingSelection && await this.sameRange(context, selection, this.pendingSelection.range)) current = this.pendingSelection;
    if (current) {
      let range = current.range;
      let index = current.index;
      if (action === 'finish' && this.requestedIndex !== index) {
        index = this.requestedIndex;
        range = await this.mapIndex(context, index, this.chunks[index]) || range;
      }
      if (action === 'stop') {
        const sentence = this.sentenceNumbers[index] ?? index;
        const first = this.sentenceNumbers.length ? this.sentenceNumbers.indexOf(sentence) : index;
        if (first !== index) range = await this.mapIndex(context, first, this.chunks[first]) || range;
      }
      // Recheck after mapping: the user may click during a slow Word sync.
      if (await this.sameRange(context, context.document.getSelection(), selection)) {
        range.getRange(action === 'finish' ? 'End' : 'Start').select();
        await context.sync();
        result = `collapsed sentence=${(this.sentenceNumbers[index] ?? index) + 1}`;
      }
    }
    this.onEvent(`${action} selection=${result}`);
  }
  /** Finish retains navigation bookmarks; Stop releases the complete session. */
  finish() {
    this.invalidate();
    return this.enqueue(() => this.reading && Word.run(this.reading, async (context) => {
      this.summarizeWords();
      await this.settleSelection(context, 'finish');
      await this.restoreYellow(context);
    })).catch((error) => this.onEvent(`finish error=${error.message || error}`));
  }
  /** Release tracked ranges without ever restoring the Play-time bookmark. */
  cleanup(settle = true) {
    this.invalidate();
    return this.enqueue(async () => {
      if (!this.reading && !this.original && !this.yellow) return;
      await Word.run(this.reading || this.original, async (context) => {
        this.summarizeWords();
        if (settle) await this.settleSelection(context, 'stop');
        await this.restoreYellow(context);
        this.releaseCurrent();
        this.pendingSelection?.range.untrack(); this.pendingSelection = null;
        this.owned?.untrack(); this.owned = null;
        if (this.reading) this.reading.untrack();
        if (this.original) this.original.untrack();
        this.reading = null;
        this.original = null;
        this.chunks = [];
        this.drift = 0;
        await context.sync();
      });
    }).catch((error) => this.onEvent(`cleanup error=${error.message || error}`));
  }
}
