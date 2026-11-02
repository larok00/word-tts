# Codex prompt 07: fixes from Windows end-to-end test round 5

You are working in this repo (Word add-in "Read Aloud+" in addin/, Bend sentence splitter in bend/).
Read NOTES.md (especially the round-4 section), CODE_TOUR.md and the code first. Keep the existing
style: short teaching comments, small functions. Do not commit or push; do not touch git config.
No network is needed. Be efficient: this runs on a limited plan. Avoid changing Bend unless it is
truly needed; if you do, explain the Bend change in plain words in NOTES.md (the maintainer is
learning Bend).

Round 5 tested v1.0.3 on real Word for Windows. PASSES: no load errors; shortcuts P (play, pause,
resume), Up/Down (speed) and X (stop) work; mid-word Play starts at the sentence start
(start: sentence); on sample-long.docx, starting inside "after" selected "This is the sentence after
the marker."; Pause and Stop (buttons and shortcuts) reach the right state.
Fix the following, with tests, and bump to **v1.0.4** (addin/package.json "version"; the build
stamps manifest Version 1.0.4.0). Manifest URLs must stay exactly as they are now (no query strings).

## 1. Previous is unreliable

With playback on the long sentence (which follows the 2nd copy of "This sentence appears twice in
the document.") the Previous button left the status at "Reading sentence 3 of 166", with Now reading
and the Word selection on the long sentence, 3 times out of 3. Diagnostics showed e.g.
"highlight: 3 remapped (GeneralException)" and "highlight: 4 remapped" while the status said 3.
The Ctrl+Alt+Shift+Left shortcut never showed a decrease (5 to 8, 8 to 14, ...), although natural
progression on short filler sentences between ~2 s+ screenshots can't be ruled out.

Maintainer's prime suspect (verify it): the player index, the status "sentence X of Y" and
Previous/Next all count **chunks** from `splitSentences(text, 300)`, not sentences. The ~390-char
long sentence in sample.docx becomes TWO chunks. Pressing Previous while on its second chunk goes to
its first chunk: the same sentence, so the status/Now reading/selection appear unchanged ("highlight:
4" vs status 3 fits this). Fix: give every chunk a sentence number (chunks of one split sentence share
it), make Previous go to the FIRST chunk of the previous sentence (always N-1; no "restart current
sentence if more than X s in" behaviour, or at most a ~1 s grace — say which you chose), Next go to the
first chunk of the next sentence, and the status count sentences ("Reading sentence X of Y" with
Y = number of sentences). Do this in JS if possible (e.g. split with no length limit to get sentences,
then split each long sentence), keeping highlight offsets correct.
Also check carefully: whether the index used by previous() could be stale or still advancing, and the
classic speechSynthesis.cancel() race (cancel fires 'end'/'error' on the old utterance, which
increments the index after navigation). The attempt-token guard should already prevent this; add
tests reproducing cancel firing onend and onerror, synchronously and asynchronously, after Previous
and Next, and confirm the index is exactly N-1 / N+1. Test Previous from both chunks of the long
sentence onto the repeated sentence, with the real sample.docx text.

## 2. GeneralException during highlighting; cached path never succeeds

Word reports GeneralException during highlighting, mostly right after navigation (Left, Up, Previous),
and every highlight is reported as "remapped" (the cached range path never succeeds on real Word).
Find out why. Likely causes: overlapping Word.run batches (e.g. diagnostics, sentenceStart, yellow
restore or highlight running outside the single queue), using a tracked/cached range across contexts
without adding it to context.trackedObjects (and removing it later), or selecting while another
select is in flight. Fix: route EVERY Word call through one serialized queue, coalesce highlight
requests so only the newest pending index runs, avoid stale range objects (if cached ranges can't be
made reliable on Word desktop, drop the cache and compute ranges fresh from positions each time),
and retry once on GeneralException. Report in Diagnostics what happened (method + error).

## 3. Selection on the wrong copy of a repeated filler sentence

Twice Word's selection showed "Reading aloud should feel smooth and steady." while Now reading showed
a different sentence. These filler sentences repeat many times, so any text-search remapping may hit
the wrong copy. Make sure the range is found by **position** (the chunk's character offset within
the reading range), never by "first text match". For example: search for the chunk text within the
reading range, then choose the match whose start offset equals the expected offset (compute the
offset of each match from the reading range start), or walk paragraphs by cumulative length. Verify
after selecting (text AND offset); if it doesn't match, say "not-found" rather than leaving a wrong
selection. Add tests with many identical filler sentences.

## 4. Home ribbon button missing on a cold Word open

The Read Aloud+ button on Home is missing on a cold Word open, even after clearing the Wef cache. It
only appears after opening the add-in once from Home > Add-ins > Developer Add-ins. Investigate the
manifest (VersionOverrides V1_0/V1_1, OfficeTab TabHome, Group/Control ids and icons, Runtimes /
shared runtime, any AutoShow/startup settings such as Office.addin.setStartupBehavior) and fix it if
possible so the button is present on cold start for an add-in sideloaded through the developer
registry key (HKCU\Software\Microsoft\Office\16.0\WEF\Developer). If it is inherent to
registry sideloading (Office only reads the commands after the add-in is first activated), say so
clearly in NOTES.md and INSTALL.md with the simplest steps for a non-technical user, and consider a
safe startup option (e.g. setStartupBehavior(load) after the first open) if it helps. Don't claim a
Windows result you can't verify.

## 5. NEW: event log in Diagnostics, with a Copy log button

Add an event log to Diagnostics showing the last ~40 events, each with a millisecond timestamp
(ms since pane load, plus HH:MM:SS.mmm). Log: each command (play, pause, resume, stop, next, prev,
speed up/down) with its source (button or shortcut) and the sentence index before and after; utterance
start, end, error and cancel; each select request and its result (index, method, error, retry); and
status changes. Add a "Copy log" button that copies the log (plus version and Diagnostics summary) to
the clipboard (navigator.clipboard with a textarea/execCommand fallback; show "Copied" or the error).
Keep it cheap: a capped ring buffer, rendered only when Diagnostics is open or on change, no Word calls.
This lets a tester check Previous/Next N±1 and Pause/Stop latency (command to cancel/pause, in ms).
Add tests.

## Finish

Run `cd addin && node --test --test-isolation=none test/*.test.mjs`,
`BASE_URL=https://larok00.github.io/word-tts npm run build`, and `~/.bend/bin/bend bend/splitter_test.bend`.
Check dist/install/manifest.xml has Version 1.0.4.0 and the same URLs as v1.0.3. Add a "Windows test
round 5" section to NOTES.md (root causes, especially 1–3, what changed, test counts, whether bend/
changed) and update INSTALL.md (Home button guidance, Copy log). Report briefly.
