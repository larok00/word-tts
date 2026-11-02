/** UI glue: connects DOM controls, Office lifecycle, WordReader, and Player.
 * No exports; loading this module registers pane controls and document shortcuts.
 */
import { EventLog, copyLog } from './lib/event-log.js';
import { VERSION } from './lib/version.js';
import { Player } from './lib/player.js';
import { sentenceChunks } from './lib/splitter.js';
import { filterVoices, pickDefault, buildFallbackOrder } from './lib/voices.js';
import { loadSettings, saveSettings, normalizeRate } from './lib/settings.js';
import { WordReader } from './word.js';
// Register document shortcuts before settings, voices, or asynchronous setup can fail.
if (window.Office)
  Office.onReady(() => {
    try {
      if (Office.actions?.associate) {
        const actions = {
          TogglePlayPause: toggle,
          Stop: stop,
          Next: () => player.next(),
          Previous: () => player.previous(),
          SpeedUp: () => changeRate(settings.rate + 0.1),
          SpeedDown: () => changeRate(settings.rate - 0.1),
        };
        for (const [name, action] of Object.entries(actions)) {
          Office.actions.associate(name, async () => {
            try {
              await command(name, 'shortcut', action);
            } catch {
              status('Please try that control again.');
            }
          });
        }
      }
      Office.addin?.onVisibilityModeChanged?.((event) => {
        if (event.visibilityMode !== Office.VisibilityMode.taskpane) stop();
      });
    } catch {
      /* Pane controls remain available on older Office builds. */
    }
  });

const elements = {};
for (const id of [
  'play',
  'pause',
  'stop',
  'previous',
  'next',
  'slower',
  'faster',
  'rate',
  'rateValue',
  'voice',
  'offline',
  'yellow',
  'status',
  'now',
  'version',
  'diagnostics',
  'diagnosticsPanel',
  'eventLog',
  'copyLog',
  'copyResult',
]) {
  elements[id] = document.getElementById(id);
}
let storage;
try {
  storage = window.localStorage;
} catch {
  /* Private browsing may deny access. */
}
const settings = loadSettings(storage);
const synth = window.speechSynthesis;
const reader = new WordReader();
const log = new EventLog({ onChange: renderLog });
reader.onEvent = (event) => log.add(event);
/** Hidden Diagnostics costs no DOM updates. */
function renderLog() {
  if (elements.diagnosticsPanel.open) elements.eventLog.textContent = log.text();
}
elements.diagnosticsPanel.addEventListener('toggle', renderLog);
elements.copyLog.addEventListener('click', async () => {
  try {
    diagnostics();
    await copyLog(elements.diagnostics.textContent + '\n' + log.text(), navigator, document);
    elements.copyResult.textContent = 'Copied';
  } catch (error) { elements.copyResult.textContent = error.message || String(error); }
});
elements.version.textContent = `Read Aloud+ v${VERSION}`;
/** Keep the last read decision available without exposing document text. */
function diagnostics() {
  elements.diagnostics.textContent = `Version ${VERSION}; start: ${reader.lastStartMethod || 'not read yet'}`
    + (reader.lastStartError ? `; error: ${reader.lastStartError}` : '')
    + (reader.lastHighlight ? `; highlight chunk: ${reader.lastHighlight.index + 1} ${reader.lastHighlight.method}`
      + (reader.lastHighlight.error ? ` (${reader.lastHighlight.error})` : '') : '');
}
diagnostics();
let voices = [];
let ready = false;
let loading = false;
let playRequest = 0;
let sentenceTexts = [];
/** Show friendly text without ever interpreting document text as HTML. */
function status(message) {
  if (elements.status.textContent !== message) log.add(`status ${message}`);
  elements.status.textContent = message;
}
// Adapt browser utterances to the small injected engine interface.
const engine = {
  // Keep the utterance alive until its callbacks complete (Chromium GC workaround).
  current: null,
  /** Wire one browser utterance to Player callbacks and retain it through completion. */
  speak(options) {
    const utterance = new SpeechSynthesisUtterance(options.text);
    utterance.rate = options.rate;
    utterance.voice = options.voice;
    const sentence = player.sentenceIndex() + 1;
    const chunk = player.index + 1;
    const event = (name, callback) => (value) => {
      log.add(`utterance ${name} sentence=${sentence} chunk=${chunk}${value?.error ? ' error=' + value.error : ''}`);
      callback(value);
    };
    utterance.onstart = event('start', options.onstart);
    utterance.onboundary = options.onboundary;
    utterance.onend = event('end', options.onend);
    utterance.onerror = event('error', options.onerror);
    this.current = utterance;
    synth.speak(utterance);
  },
  /** Cancel before every new utterance, including retry and navigation. */
  cancel() {
    log.add('utterance cancel');
    synth?.cancel();
    this.current = null;
  },
  /** Native pause retains position when WebView2 cooperates. */
  pause() {
    log.add('utterance pause');
    synth?.pause();
  },
  /** Player handles a stalled resume with a timed restart. */
  resume() {
    log.add('utterance resume');
    synth?.resume();
  },
};
const player = new Player({
  engine,
  onInvalidate: () => reader.invalidate(),
  /** Word requests are deliberately not awaited by speech callbacks. */
  onChunkStart(index) {
    elements.now.textContent = sentenceTexts[player.sentenceIndex(index)] || player.chunks[index];
    status(`Reading sentence ${player.sentenceIndex(index) + 1} of ${player.sentenceCount}`);
    void Promise.resolve(reader.highlight(index, player.chunks[index], settings.highlight)).then(diagnostics);
  },
  /** Keep controls and temporary document formatting consistent with player state. */
  onStateChange(state) {
    elements.pause.disabled = !['playing', 'paused'].includes(state);
    elements.pause.textContent = state === 'paused' ? '▶ Resume' : '⏸ Pause';
    if (state === 'playing')
      status(`Reading sentence ${player.sentenceIndex() + 1} of ${player.sentenceCount}`);
    if (state === 'paused') status('Paused. Press Resume to continue.');
    if (state === 'finished') {
      status('Finished reading.');
      void reader.clearHighlight();
    }
    if (state === 'stopped') status('Stopped.');
  },
  /** Clear yellow on error while leaving the failed sentence available for retry. */
  onError(message) {
    status(message);
    void reader.clearHighlight();
  },
});
/** Save just the supported settings; blocked storage is ignored. */
function persist() {
  saveSettings(storage, settings);
}
/** Apply a new rate immediately, restarting the current sentence when playing. */
function changeRate(rate) {
  settings.rate = normalizeRate(rate);
  elements.rate.value = settings.rate;
  elements.rateValue.textContent = `${settings.rate.toFixed(1)}×`;
  elements.rate.setAttribute('aria-valuetext', elements.rateValue.textContent);
  player.setRate(settings.rate);
  persist();
}
/** Rebuild fallback order whenever voices or the selection change. */
function updateFallback() {
  player.voices = buildFallbackOrder(voices, pickDefault(voices, settings.voiceURI));
}
/** Refill the picker as Windows asynchronously publishes installed voices. */
function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices();
  const visible = filterVoices(voices, elements.offline.checked);
  const selected = pickDefault(visible, settings.voiceURI);
  elements.voice.replaceChildren();
  for (const voice of visible) {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} — ${voice.lang} (${voice.localService ? 'offline' : 'online'})`;
    elements.voice.append(option);
  }
  if (selected) {
    elements.voice.value = selected.voiceURI;
    settings.voiceURI = selected.voiceURI;
  }
  updateFallback();
  if (player.state !== 'idle') return;
  if (!voices.length)
    status(
      'No voices yet. Add Windows voices in Settings → Time & language → Speech → Add voices.',
    );
  else if (!visible.length)
    status(
      'No offline voices found. Uncheck “Only show offline voices”, or add Windows voices in Settings → Time & language → Speech → Add voices.',
    );
  else if (player.state === 'idle')
    status('Ready. Select text or place your cursor in Word, then Play.');
}
/** Read the document only for a fresh Play; guard against double clicks and stale reads. */
async function play() {
  if (loading) return;
  if (!ready) {
    status('Word is still getting ready. Please try again shortly.');
    return;
  }
  if (!synth || !voices.length) {
    status('Add Windows voices in Settings → Time & language → Speech → Add voices.');
    return;
  }
  const request = ++playRequest;
  loading = true;
  player.stop();
  status('Getting text from Word…');
  try {
    const text = await reader.read();
    diagnostics();
    if (request !== playRequest) {
      void reader.cleanup();
      return;
    }
    const content = sentenceChunks(text, 300);
    const { chunks, sentenceNumbers } = content;
    sentenceTexts = content.sentenceTexts;
    reader.chunks = chunks;
    reader.sentenceNumbers = sentenceNumbers;
    player.setChunks(chunks, sentenceNumbers);
    updateFallback();
    player.play();
    if (!chunks.length)
      status('There is no text here. Select some text or move the cursor earlier in the document.');
  } catch {
    status('Word could not read this selection. Click in the document and try Play again.');
    void reader.cleanup();
  } finally {
    loading = false;
  }
}
/** Shared by pane buttons, pane keys, and document shortcuts. */
function toggle() {
  if (player.state === 'playing') player.pause();
  else if (player.state === 'paused') player.resume();
  else return play();
}
/** Invalidate a pending document read as well as any pending speech callbacks. */
function stop() {
  ++playRequest;
  player.stop();
  void reader.cleanup();
}
/** Log both sides of every command, including asynchronous document reads. */
async function command(name, source, action) {
  name = ({ Previous: 'prev', Next: 'next', Stop: 'stop', SpeedUp: 'speed up', SpeedDown: 'speed down' })[name] || name;
  if (name === 'TogglePlayPause') name = player.state === 'playing' ? 'pause' : player.state === 'paused' ? 'resume' : 'play';
  const before = player.sentenceIndex() + 1;
  log.add(`command ${name} source=${source} before=${before}`);
  try {
    const result = action();
    return result?.then ? await result : result;
  }
  finally { log.add(`command ${name} source=${source} before=${before} after=${player.sentenceIndex() + 1}`); }
}
for (const [id, name, action] of [
  ['play', 'play', play], ['pause', 'TogglePlayPause', toggle], ['stop', 'stop', stop],
  ['previous', 'prev', () => player.previous()], ['next', 'next', () => player.next()],
  ['slower', 'speed down', () => changeRate(settings.rate - 0.1)],
  ['faster', 'speed up', () => changeRate(settings.rate + 0.1)],
]) elements[id].addEventListener('click', () => command(name, 'button', action));
elements.rate.addEventListener('input', () => command('speed', 'button', () => changeRate(Number(elements.rate.value))));
elements.voice.addEventListener('change', () => {
  settings.voiceURI = elements.voice.value;
  updateFallback();
  persist();
  if (player.state === 'playing') player.play(player.index);
});
elements.offline.addEventListener('change', refreshVoices);
elements.yellow.checked = settings.highlight;
elements.yellow.addEventListener('change', () => {
  settings.highlight = elements.yellow.checked;
  persist();
  if (player.state === 'playing')
    void Promise.resolve(reader.highlight(player.index, player.chunks[player.index], settings.highlight)).then(diagnostics);
  else void reader.clearHighlight();
});
// Form controls retain their normal Space/arrow keys; Escape always stops.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    void command('stop', 'shortcut', stop);
    return;
  }
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.target.closest('input,select,textarea,button,summary,[contenteditable="true"]')
  )
    return;
  const actions = {
    ' ': toggle,
    ArrowLeft: () => player.previous(),
    ArrowRight: () => player.next(),
    '+': () => changeRate(settings.rate + 0.1),
    '-': () => changeRate(settings.rate - 0.1),
  };
  if (actions[event.key]) {
    event.preventDefault();
    const names = { ' ': 'TogglePlayPause', ArrowLeft: 'prev', ArrowRight: 'next', '+': 'speed up', '-': 'speed down' };
    void command(names[event.key], 'shortcut', actions[event.key]);
  }
});
if (window.Office) Office.onReady(() => { ready = true; });
changeRate(settings.rate);
if (synth) {
  synth.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
  for (const delay of [250, 750, 1500, 3000, 5000]) setTimeout(refreshVoices, delay);
} else {
  status('Speech is unavailable in this pane. Please update Windows and Microsoft 365.');
}
// Best effort only: shared-runtime visibility cleanup above is more dependable.
window.addEventListener('pagehide', stop);
// Office and this pane need the network on the first visit; caching helps later visits.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
