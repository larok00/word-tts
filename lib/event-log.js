/** Small pane-only event history. Logging never calls Word. */
export class EventLog {
  constructor({ now = () => performance.now(), date = () => new Date(), limit = 40, onChange = () => {} } = {}) {
    Object.assign(this, { now, date, limit, onChange });
    this.started = now();
    this.buffer = [];
    this.next = 0;
  }
  add(message) {
    const time = this.date();
    const wall = [time.getHours(), time.getMinutes(), time.getSeconds()]
      .map((part) => String(part).padStart(2, '0')).join(':')
      + '.' + String(time.getMilliseconds()).padStart(3, '0');
    this.buffer[this.next] = `${(this.now() - this.started).toFixed(0)} ms ${wall} ${message}`;
    this.next = (this.next + 1) % this.limit;
    this.onChange();
  }
  get events() {
    return this.buffer.length < this.limit ? this.buffer.slice()
      : this.buffer.slice(this.next).concat(this.buffer.slice(0, this.next));
  }
  text() { return this.events.join('\n'); }
}
/** Clipboard access can be denied in WebView2; retain the old copy fallback. */
export async function copyLog(text, navigator, document) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Try the pane-local fallback after permission failures. */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  try {
    area.select();
    if (!document.execCommand('copy')) throw Error('Clipboard copy was denied. Select and copy the log manually.');
  } finally { area.remove(); }
}
