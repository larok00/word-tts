/** Find the current sentence without imposing the speech chunk length limit. */
import { splitSentences } from './splitter.js?v=1.0.5';

/** A sentinel exposes a boundary even when the cursor follows its whitespace. */
export function sentenceStartOffset(prefixText) {
  const chunks = splitSentences(prefixText + 'A', Math.max(1, prefixText.length + 1));
  return chunks.slice(0, -1).reduce((offset, chunk) => offset + chunk.length, 0);
}
