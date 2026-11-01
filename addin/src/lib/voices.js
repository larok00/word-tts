/** Pure voice ordering; local Windows voices are our first fallback. */
// Rank languages without depending on browser voice objects.
function languageRank(voice, preferred) {
  const lang = (voice.lang || '').toLowerCase();
  if (lang === preferred.toLowerCase()) return 0;
  if (lang.startsWith('en-')) return 1;
  return 2;
}
// Return a copy so callers never mutate the browser's voice list.
export function sortVoices(voices, preferred = 'en-GB') {
  return [...voices].sort((a, b) => Number(b.localService === true) - Number(a.localService === true)
    || languageRank(a, preferred) - languageRank(b, preferred)
    || (a.name || '').localeCompare(b.name || ''));
}
// Filtering affects the picker only, never removes emergency fallback voices.
export function filterVoices(voices, offlineOnly = true, preferred = 'en-GB') {
  return sortVoices(voices, preferred).filter(voice => !offlineOnly || voice.localService === true);
}
// Pick a saved voice when available, otherwise prefer a local English voice.
export function pickDefault(voices, voiceURI = '', preferred = 'en-GB') {
  return voices.find(voice => voice.voiceURI === voiceURI) || sortVoices(voices, preferred)[0] || null;
}
// Try the chosen voice first, then local voices in the same language first.
export function buildFallbackOrder(voices, selected = null, preferred = 'en-GB') {
  const ordered = sortVoices(voices, selected?.lang || preferred);
  return selected ? [selected, ...ordered.filter(voice => voice.voiceURI !== selected.voiceURI)] : ordered;
}
