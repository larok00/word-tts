/** Event history and clipboard paths need no Office host or timers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, copyLog } from '../src/lib/event-log.js';

test('event log caps history, timestamps milliseconds and notifies on change', () => {
  let now = 100, changes = 0;
  const log = new EventLog({ now: () => now, date: () => new Date(2026, 10, 2, 9, 8, 7, 6), onChange: () => changes++ });
  for (let i = 0; i < 45; i++) { now += 3; log.add(`event ${i}`); }
  assert.equal(log.events.length, 40);
  assert.match(log.events[0], /^18 ms 09:08:07.006 event 5$/);
  assert.match(log.text(), /135 ms 09:08:07.006 event 44$/);
  assert.equal(changes, 45);
});
for (const path of ['clipboard', 'absent', 'denied', 'failed']) {
  test(`copy log via ${path}`, async () => {
    let copied, removed = false;
    const navigator = path === 'absent' ? {} : { clipboard: { writeText: async (text) => {
      if (path !== 'clipboard') throw Error('denied');
      copied = text;
    } } };
    const area = { style: {}, select() { copied = this.value; }, remove() { removed = true; } };
    const document = { createElement: () => area, body: { append() {} }, execCommand: () => path !== 'failed' };
    const result = copyLog('Version 1.0.4\nlog', navigator, document);
    if (path === 'failed') await assert.rejects(result, /denied/);
    else { await result; assert.equal(copied, 'Version 1.0.4\nlog'); }
    assert.equal(removed, path !== 'clipboard');
  });
}
