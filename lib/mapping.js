/** Word search adapter used by WordReader. Exports mapChunkToSearch; keeps escaped
 * prefixes at 250 UTF-16 units, below Office’s 255-unit search limit.
 */
/** Word search accepts at most 255 characters, including escaped carets. */
/** Build a literal prefix, preserving whole words where possible and UTF-16 pairs. */
export function mapChunkToSearch(chunk) {
  let text = String(chunk)
    .replace(/[\r\n]+/g, ' ')
    .trim();
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
