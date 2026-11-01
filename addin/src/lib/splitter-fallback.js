/** Lossless JS port for lone UTF-16 surrogates that Bend sanitizes. Exports
 * splitFallback; splitter.js chooses this path only for those inputs.
 */
// Port of splitter.bend for JS strings outside Bend's Unicode String domain.
// Bend 2.0.39 str_in replaces lone UTF-16 surrogates with U+FFFD, losing input.
// Array.from keeps those code units intact while counting valid pairs as one Char.
/** Match Base Char.is_space, rather than JS’s broader Unicode whitespace class. */
const space = (c) => c !== undefined && /^[\t-\r ]$/.test(c);
/** Keep quotes and brackets with their preceding sentence, as the Bend scan does. */
const closing = (c) => ['"', "'", '”', '’', ')'].includes(c);
const abbreviations = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'no',
  'fig',
  'approx',
]);

/** Inspect left context and look past closers before marking a possible sentence cut. */
function boundary(chars, i) {
  const c = chars[i];
  if (c === '\n' || c === '\r') return true;
  if (!['.', '!', '?', '…'].includes(c)) return false;
  let after = i + 1;
  while (closing(chars[after])) after++;
  if (c === '…' || (c === '.' && chars[i - 1] === '.' && chars[i - 2] === '.')) {
    if (!space(chars[after])) return false;
    while (space(chars[after])) after++;
    return /^[A-Z]$/.test(chars[after] ?? '');
  }
  if (after < chars.length && !space(chars[after])) return false;
  if (c !== '.') return true;
  let start = i;
  while (start > 0 && /^[a-zA-Z.]$/.test(chars[start - 1])) start--;
  const word = chars.slice(start, i).join('');
  return !(/^[A-Z]$/.test(word) || abbreviations.has(word.toLowerCase()));
}

/** Mirror both Bend passes while preserving lone surrogates that its JS input replaces. */
export function splitFallback(text, max = 300) {
  const chars = Array.from(text);
  const sentences = [];
  let start = 0;
  let pending = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (pending && !space(c) && !(closing(c) && !space(chars[i - 1]))) {
      sentences.push(chars.slice(start, i));
      start = i;
    }
    pending = boundary(chars, i) || (pending && (space(c) || closing(c)));
  }
  if (start < chars.length) sentences.push(chars.slice(start));
  const chunks = [];
  for (const sentence of sentences) {
    for (let at = 0; at < sentence.length; ) {
      let size = Math.min(max, sentence.length - at);
      if (sentence.length - at > max) {
        for (let i = at + size - 1; i >= at; i--) {
          if (sentence[i] === ' ') {
            size = i - at + 1;
            break;
          }
        }
      }
      chunks.push(sentence.slice(at, at + size).join(''));
      at += size;
    }
  }
  return chunks;
}
