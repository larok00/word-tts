/** Word API boundary. Exports WordReader; speech never waits for its serialized
 * highlight queue. Tracked ranges remain valid across separate Word.run batches.
 */
import { sentenceStartOffset } from './lib/sentence-start.js?v=1.0.4';
import { mapChunkToSearch } from './lib/mapping.js?v=1.0.4';
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
  }
  /** Chunk offsets include whitespace and paragraph marks in the original reading text. */
  chunkOffset(index) {
    return this.chunks.slice(0, index).reduce((offset, chunk) => offset + chunk.length, 0)
      + (this.chunks[index]?.search(/\S/) || 0);
  }
  /** Search the whole reading range, then disambiguate duplicates by prefix length. */
  async mapIndex(context, index, chunk) {
    const search = mapChunkToSearch(chunk);
    if (!search) return null;
    const results = this.reading.search(search, { matchCase: true, matchWildcards: false });
    results.load('items');
    await context.sync();
    const start = this.reading.getRange('Start');
    const candidates = results.items.map((range) => ({
      // Use a nonempty range even at offset zero; avoid expanding two collapsed points.
      range, prefix: start.expandTo(range),
    }));
    for (const candidate of candidates) {
      candidate.prefix.load('text');
      candidate.range.load('text');
    }
    await context.sync();
    return candidates.find(({ prefix, range }) =>
      prefix.text.length - range.text.length === this.chunkOffset(index)
      && range.text === search.replaceAll('^^', '^'))?.range || null;
  }
  /** Verify the visible selection's position as well as its text (duplicates can match). */
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
        await context.sync();
        return;
      }
    }
    if (generation !== this.generation) return;
    range.select();
    await context.sync();
    if (generation !== this.generation) return;
    const selection = context.document.getSelection();
    const prefix = this.reading.getRange('Start').expandTo(selection);
    const suffix = selection.expandTo(this.reading.getRange('End'));
    selection.load('text');
    prefix.load('text');
    suffix.load('text');
    await context.sync();
    if (generation !== this.generation) return;
    const expected = mapChunkToSearch(chunk)?.replaceAll('^^', '^');
    if (prefix.text.length - selection.text.length !== this.chunkOffset(index) || selection.text !== expected
      || prefix.text.length + suffix.text.length - selection.text.length !== this.reading.text.length) {
      // Clear an unverified selection before retrying; never leave a wrong duplicate lit up.
      this.original.getRange('Start').select();
      await context.sync();
      throw new Error('Word selection did not match the chunk offset/text');
    }
  }
  /** Coalesce pending requests; retry once in a fresh batch after a host failure. */
  highlight(index, chunk, yellowMode) {
    const generation = ++this.generation;
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
            await this.restoreYellow(context);
            if (generation !== this.generation) return;
            const range = await this.mapIndex(context, index, chunk);
            if (generation !== this.generation) return;
            if (!range) {
              method = 'not-found';
              this.original.getRange('Start').select();
              await context.sync();
              return;
            }
            await this.selectRange(context, range, index, chunk, yellowMode, generation);
          });
          break;
        } catch (caught) {
          method = 'not-found';
          error = [caught.code, caught.message].filter(Boolean).join(': ') || String(caught);
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
  /** Release every tracked range, optionally restoring the user's original selection. */
  cleanup(restoreSelection = true) {
    ++this.generation;
    return this.enqueue(async () => {
      if (!this.reading && !this.original && !this.yellow) return;
      await Word.run(this.reading || this.original, async (context) => {
        await this.restoreYellow(context);
        if (restoreSelection && this.original) this.original.select();
        if (this.reading) this.reading.untrack();
        if (this.original) this.original.untrack();
        this.reading = null;
        this.original = null;
        this.chunks = [];
        await context.sync();
      });
    }).catch((error) => this.onEvent(`cleanup error=${error.message || error}`));
  }
}
