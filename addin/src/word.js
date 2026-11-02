/** Word API boundary. Exports WordReader; speech never waits for its serialized
 * highlight queue. Tracked ranges remain valid across separate Word.run batches.
 */
import { sentenceStartOffset } from './lib/sentence-start.js';
import { mapChunkToSearch } from './lib/mapping.js';
export class WordReader {
  /** Keep document state separate from the speech session. */
  constructor() {
    this.queue = Promise.resolve();
    this.generation = 0;
    this.reading = null;
    this.original = null;
    this.yellow = null;
    this.matches = new Map();
    this.mappedThrough = -1;
    this.cursor = null;
    this.chunks = [];
  }
  /** Serialize mutations, absorbing Word failures without poisoning later work. */
  enqueue(work) {
    this.queue = this.queue.then(work).catch(() => {});
    return this.queue;
  }
  /** Capture text and track ranges: Office otherwise releases proxies after Word.run ends. */
  async read() {
    await this.cleanup(false);
    return Word.run(async (context) => {
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
    });
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
      if (!offset) return start;
      if (offset === prefix.text.length) return cursor;
      // Search the end of the preceding text, keeping below Word's search limit.
      const before = prefix.text.slice(0, offset);
      const matches = prefix.search(before.slice(-100).replaceAll('^', '^^'), {
        matchCase: true, matchWildcards: false,
      });
      matches.load('items');
      await context.sync();
      const candidates = matches.items.map((match) => ({
        end: match.getRange('End'),
        prefix: start.expandTo(match.getRange('End')),
      }));
      for (const candidate of candidates) candidate.prefix.load('text');
      await context.sync();
      // Repeated text must resolve to this exact offset, never a later occurrence.
      const found = candidates.find((candidate) => candidate.prefix.text.length === offset);
      if (found) return found.end;
    } catch {
      /* Cursor-to-end remains available on API or search failure. */
    }
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
  /** Highlight a current request only; cached matches support previous/retry navigation. */
  highlight(index, chunk, yellowMode) {
    const generation = ++this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation || !this.reading) return;
      await Word.run(this.reading, async (context) => {
        await this.restoreYellow(context);
        if (generation !== this.generation) return;
        // Map skipped sentences too, so rapid Next and repeated text stay ordered.
        // Mapping can lag behind speech; generation checks discard obsolete UI work.
        for (let current = this.mappedThrough + 1; current <= index; current++) {
          if (generation !== this.generation) return;
          const search = mapChunkToSearch(this.chunks[current] ?? (current === index ? chunk : ''));
          let found = null;
          if (search) {
            const start = this.cursor || this.reading.getRange('Start');
            const scope = start.expandTo(this.reading.getRange('End'));
            const results = scope.search(search, { matchCase: true, matchWildcards: false });
            results.load('items');
            await context.sync();
            found = results.items[0] || null;
          }
          if (found) {
            found.track();
            if (this.cursor) this.cursor.untrack();
            this.cursor = found.getRange('End');
            this.cursor.track();
          }
          this.matches.set(current, found);
          this.mappedThrough = current;
        }
        if (generation !== this.generation) return;
        const range = this.matches.get(index);
        if (!range) return;
        if (yellowMode) {
          range.font.load('highlightColor');
          await context.sync();
          if (generation !== this.generation) return;
          const color = range.font.highlightColor;
          // Word represents mixed formatting as an empty string on some builds.
          if (color !== '' && String(color).toLowerCase() !== 'mixed') {
            this.yellow = { range: range.getRange(), color };
            this.yellow.range.track();
            range.font.highlightColor = '#FFFF00';
          } else {
            range.select();
          }
        } else {
          range.select();
        }
        await context.sync();
      });
    });
  }
  /** Error/finish restores yellow without discarding navigation or the selection bookmark. */
  clearHighlight() {
    ++this.generation;
    return this.enqueue(() => {
      const anchor = this.reading || this.original;
      if (anchor) return Word.run(anchor, (context) => this.restoreYellow(context));
    });
  }
  /** Release every tracked range, optionally restoring the user's original selection. */
  cleanup(restoreSelection = true) {
    ++this.generation;
    return this.enqueue(async () => {
      if (!this.reading && !this.original && !this.yellow) return;
      await Word.run(this.reading || this.original, async (context) => {
        await this.restoreYellow(context);
        if (restoreSelection && this.original) this.original.select();
        for (const range of this.matches.values()) if (range) range.untrack();
        this.matches.clear();
        if (this.cursor) this.cursor.untrack();
        if (this.reading) this.reading.untrack();
        if (this.original) this.original.untrack();
        this.cursor = null;
        this.reading = null;
        this.original = null;
        this.mappedThrough = -1;
        this.chunks = [];
        await context.sync();
      });
    });
  }
}
