/** Word search adapter used by WordReader. Exports mapChunkToSearch; keeps escaped
 * prefixes at 250 UTF-16 units, below Office’s 255-unit search limit.
 */
/** Word search accepts at most 255 characters, including escaped carets. */
/** Build a literal prefix, preserving whole words where possible and UTF-16 pairs. */
export function mapChunkToSearch(chunk) {
  let text = String(chunk)
    .replace(/[\r\n]+/g, ' ')
    .trim();
  text = text.split(/[\v\t\u0007\u00A0\u00AD\u001E\u001F\uFFFC]/).find((part) => part.trim())?.trim() || '';
  if (!text) return null;
  let prefix = '';
  for (const character of text) {
    const escaped = character === '^' ? '^^' : character;
    if (prefix.length + escaped.length > 250) break;
    prefix += escaped;
  }
  if (prefix.replace(/\^\^/g, '^').length < text.length) {
    const boundary = prefix.lastIndexOf(' ');
    if (boundary > 0) prefix = prefix.slice(0, boundary);
  }
  return prefix.trim() || null;
}
/** Ignore host-only marks when checking text, and treat Word whitespace alike. */
export function normalizeText(text) {
  return String(text).replace(/[\u0007\u00AD\u001E\u001F\uFFFC]/g, '').replace(/\s+/g, ' ').trim();
}
/** Use a safe literal segment; offsets still refer to the untouched speech text. */
export function searchPart(chunk, tail = false) {
  const segments = [...String(chunk).matchAll(/[^\r\n\v\t\u0007\u00A0\u00AD\u001E\u001F\uFFFC]+/g)]
    .filter((match) => match[0].trim());
  const segment = tail ? segments.at(-1) : segments[0];
  if (!segment) return null;
  const text = segment[0].trim();
  const base = segment.index + segment[0].indexOf(text);
  if (!tail) {
    const query = mapChunkToSearch(text);
    return { query, text: query.replaceAll('^^', '^'), offset: base };
  }
  // Reverse by code point so the suffix also respects escaped length and surrogate pairs.
  let suffix = '';
  for (const character of [...text].reverse()) {
    if ((suffix + character).replaceAll('^', '^^').length > 250) break;
    suffix = character + suffix;
  }
  return { query: suffix.replaceAll('^', '^^'), text: suffix, offset: base + text.length - suffix.length };
}
