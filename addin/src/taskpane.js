/** UI glue: connects DOM controls, Office lifecycle, WordReader, and Player.
 * No exports; loading this module registers pane controls and document shortcuts.
 */
import { Player } from './lib/player.js';
import { splitSentences } from './lib/splitter.js';
import { filterVoices, pickDefault, buildFallbackOrder } from './lib/voices.js';
import { loadSettings, saveSettings, normalizeRate } from './lib/settings.js';
import { WordReader } from './word.js';
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
let voices = [];
let ready = false;
let loading = false;
let playRequest = 0;
/** Show friendly text without ever interpreting document text as HTML. */
function status(message) {
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
    utterance.onstart = options.onstart;
    utterance.onboundary = options.onboundary;
    utterance.onend = options.onend;
    utterance.onerror = options.onerror;
    this.current = utterance;
    synth.speak(utterance);
  },
  /** Cancel before every new utterance, including retry and navigation. */
  cancel() {
    synth?.cancel();
    this.current = null;
  },
  /** Native pause retains position when WebView2 cooperates. */
  pause() {
    synth?.pause();
  },
  /** Player handles a stalled resume with a timed restart. */
  resume() {
    synth?.resume();
  },
};
const player = new Player({
  engine,
  /** Word requests are deliberately not awaited by speech callbacks. */
  onChunkStart(index) {
    elements.now.textContent = player.chunks[index];
    status(`Reading sentence ${index + 1} of ${player.chunks.length}`);
    void reader.highlight(index, player.chunks[index], settings.highlight);
  },
  /** Keep controls and temporary document formatting consistent with player state. */
  onStateChange(state) {
    elements.pause.disabled = !['playing', 'paused'].includes(state);
    elements.pause.textContent = state === 'paused' ? '▶ Resume' : '⏸ Pause';
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
    if (request !== playRequest) {
      void reader.cleanup();
      return;
    }
    const chunks = splitSentences(text, 300).filter((chunk) => chunk.trim());
    reader.chunks = chunks;
    player.setChunks(chunks);
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
  else void play();
}
/** Invalidate a pending document read as well as any pending speech callbacks. */
function stop() {
  ++playRequest;
  player.stop();
  void reader.cleanup();
}
elements.play.addEventListener('click', play);
elements.pause.addEventListener('click', toggle);
elements.stop.addEventListener('click', stop);
elements.previous.addEventListener('click', () => player.previous());
elements.next.addEventListener('click', () => player.next());
elements.slower.addEventListener('click', () => changeRate(settings.rate - 0.1));
elements.faster.addEventListener('click', () => changeRate(settings.rate + 0.1));
elements.rate.addEventListener('input', () => changeRate(Number(elements.rate.value)));
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
    void reader.highlight(player.index, player.chunks[player.index], settings.highlight);
  else void reader.clearHighlight();
});
// Form controls retain their normal Space/arrow keys; Escape always stops.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    stop();
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
    actions[event.key]();
  }
});
changeRate(settings.rate);
if (synth) {
  synth.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
  for (const delay of [250, 750, 1500, 3000, 5000]) setTimeout(refreshVoices, delay);
} else {
  status('Speech is unavailable in this pane. Please update Windows and Microsoft 365.');
}
// Unsupported shortcut/lifecycle APIs must never prevent ordinary pane operation.
if (window.Office)
  Office.onReady(() => {
    ready = true;
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
              await action();
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
// Best effort only: shared-runtime visibility cleanup above is more dependable.
window.addEventListener('pagehide', stop);
// Office and this pane need the network on the first visit; caching helps later visits.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
