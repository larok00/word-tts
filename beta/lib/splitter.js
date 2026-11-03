/** Bridge from pane JavaScript to compiled Bend. Exports splitSentences,
 * converting Bend lists into arrays and preserving malformed UTF-16 via a JS port.
 */
import Bend from './splitter.bend.mjs?v=1.0.6';
import { splitFallback } from './splitter-fallback.js?v=1.0.6';

// Empirically, Bend 2.0.39 optimizes String/Char to native JS strings,
// despite their linked-list source types. Nat is a number. Lists remain
// {$:"Con", head: value, tail: list}, ending in {$:"Nil"}.
// The generated module is self-contained and has no Node-only imports.
/** Validate the public JS contract and translate the Bend list into a plain array. */
export function splitSentences(text, max = 300) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isSafeInteger(max) || max < 1)
    throw new RangeError('max must be a positive safe integer');
  // The generated str_in sanitizes lone surrogates. Preserve such inputs with
  // the matching JS port; ordinary Unicode text still runs the compiled Bend.
  if (/\p{Cs}/u.test(text)) return splitFallback(text, max);
  const chunks = [];
  for (let xs = Bend['Splitter.split'](text, max); xs.$ !== 'Nil'; xs = xs.tail) {
    chunks.push(xs.head);
  }
  return chunks;
}

/** Keep speech chunks lossless while giving every part its sentence identity. */
export function sentenceChunks(text, max = 300) {
  const sentences = splitSentences(text, Number.MAX_SAFE_INTEGER);
  const chunks = [];
  const sentenceNumbers = [];
  const sentenceTexts = [];
  for (const sentence of sentences) {
    // Whitespace belongs to the preceding sentence and still contributes offsets.
    const number = sentenceTexts.length;
    if (!sentence.trim()) {
      if (chunks.length) chunks[chunks.length - 1] += sentence;
      continue;
    }
    sentenceTexts.push(sentence);
    for (const chunk of splitSentences(sentence, max)) {
      chunks.push(chunk);
      sentenceNumbers.push(number);
    }
  }
  return { chunks, sentenceNumbers, sentenceTexts };
}
