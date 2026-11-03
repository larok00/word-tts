/** Storage boundary for pane preferences. Exports SETTINGS_KEY, DEFAULTS,
 * normalizeRate, validateSettings, loadSettings, and saveSettings.
 */
export const SETTINGS_KEY = 'readAloudPlus.settings';
export const DEFAULTS = Object.freeze({ voiceURI: '', rate: 1, highlight: false, followWords: true });
/** Clamp and round speeds to the UI's one-tenth increments. */
export function normalizeRate(rate) {
  const number = Number(rate);
  return Number.isFinite(number) ? Math.round(Math.min(2.5, Math.max(0.5, number)) * 10) / 10 : 1;
}
/** Accept only the supported fields, even for malformed saved values. */
export function validateSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
    voiceURI: typeof settings.voiceURI === 'string' ? settings.voiceURI : '',
    rate: typeof settings.rate === 'number' ? normalizeRate(settings.rate) : 1,
    highlight: settings.highlight === true,
    followWords: settings.followWords !== false,
  };
}
/** Corrupt JSON and disabled localStorage both fall back to defaults. */
export function loadSettings(storage) {
  try {
    return validateSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULTS };
  }
}
/** A full disk or privacy policy must never interrupt reading. */
export function saveSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(settings)));
  } catch {
    /* Best effort. */
  }
}
