# Codex prompt 08: fixes from Krystof's real use of v1.0.4

You are working in this repo (Word add-in "Read Aloud+" in addin/, Bend sentence splitter in bend/).
Read NOTES.md (round 5 section), CODE_TOUR.md and addin/src/word.js, taskpane.js, lib/player.js,
lib/mapping.js and test/word.test.mjs first. Keep the existing style: short teaching comments, small
functions. Do not commit or push; do not touch git config. No network is needed. Be efficient: this
runs on a limited plan. Do not change bend/ unless a bug is genuinely there; if you do, explain it
in plain words in NOTES.md (the maintainer is learning Bend).

The end user (Krystof, Word desktop on Windows) used v1.0.4 on a real multi-page English document.
His Copy log showed normal progression (select result ... method=position-search error=none for
sentences 68-72, then "Finished reading."), start method "paragraph". He reported:

1. "When I pause to reread the previous sentence and click STOP to be able to start again elsewhere,
   the document jumps to where I started reading originally, which can be a couple of pages back.
   I used Previous sentence to go back, but when I finish the reading session the whole document
   still jumps to where I started."
2. "Sometimes the sentence highlight disappears. When this happens, with each new sentence the whole
   document scrolls all the way to where I started reading or to the beginning, but the audio plays
   without a problem."
3. "The highlight sometimes does not highlight the whole sentence. Highlighting the word currently
   being read would probably be better."

Maintainer's analysis (verify against the code, and correct it if wrong):
- Bug 1: `stop()` in taskpane.js calls `reader.cleanup()` whose default `restoreSelection = true`
  runs `this.original.select()`: it re-selects the caret/selection captured at Play time, so Word
  scrolls back there. Stop is also run by pane hide (onVisibilityModeChanged) and pagehide. Any
  click he made elsewhere while paused is overwritten too.
  Fix: Stop, finish and pane close must never move the user back. If the user's current selection is
  still exactly our highlight (sentence or word), collapse it to the START of the sentence being read
  (so Play resumes from there and typing can't replace selected text); if the user has clicked/selected
  somewhere else, leave their selection alone. Same on "finished" (collapse to the end of the last
  sentence read, or leave the user's own selection). Log what was done, e.g. "stop selection=kept-user"
  / "stop selection=collapsed sentence=N" / "finish selection=...".
- Bug 2: in `highlight()`/`selectRange()`, a not-found mapping or a failed verification runs
  `this.original.getRange('Start').select()`: the highlight vanishes and Word scrolls to the original
  start. Once offsets drift, every later sentence fails the same way, so it repeats per sentence.
  Likely drift sources: the exact-offset check compares `prefix.text.length` of ranges expanded from
  the reading start with offsets computed from the one-time `reading.text`; Word's sub-range text
  lengths can differ from the full text (fields: codes vs results, hidden text, content controls,
  footnote/endnote marks, tables cell marks \u0007, line breaks \v, soft hyphen, objects), and the user
  may edit the document while paused. Also `mapChunkToSearch` keeps characters such as \v, \t,
  \u0007, \u00A0, \u00AD, \u001E/\u001F that literal Word search may not match (Word needs ^l, ^t,
  ^s, etc. or will not find them).
  Fix: never select/scroll to the original start on failure. On failure, keep the previous highlight
  (do nothing to the selection) and log "selection lost ... recovery=kept-previous" or similar.
  Make mapping tolerant: keep exact-offset match first; else choose the matching candidate nearest the
  expected offset that is at or after the last successfully highlighted position (track a running
  drift correction = actual - expected from the last success and apply it to the next expected
  offset); verification should accept the drift-corrected offset. Make search text robust: cut the
  search prefix at the first character that literal search can't match reliably (or map it to the
  right ^ code), and keep it nonempty. Log method names that distinguish exact / nearest / drift and
  the drift amount, e.g. `method=position-search match=nearest drift=+3`.
- Bug 3: `mapChunkToSearch` caps the search at 250 chars (Word's 255 limit), so for long sentences
  only the first ~250 chars get selected; and sentences over 300 chars are split into chunks, each
  highlighted alone. Fix: select the whole chunk by finding its start (prefix search) and its end
  (search for the chunk's last <=250 chars within the range from the start match to the reading end,
  first match), then `start.expandTo(end)`; fall back to the prefix-only range if the end isn't found
  (log it). Verify against the full chunk text (normalized the same way) rather than only the prefix.

4. NEW: word-following highlight. Use `SpeechSynthesisUtterance` boundary events (name === 'word',
   charIndex, charLength; charLength may be missing/0 in some engines: then derive the word length
   from the chunk text at charIndex with a word regex). The Player already receives onboundary;
   pass the boundary through to a new callback (e.g. onWord(index, charIndex, charLength)) only for
   the active attempt. In WordReader, after a chunk's range is found, cache that chunk's tracked range
   and the text offsets of its words (e.g. via `chunkRange.search(word)` with offset disambiguation
   or `getTextRanges([' '], true)` loaded once per chunk; pick whatever is reliable with the existing
   mock, and include the drift handling). On each word boundary, select that word's range (serialized,
   coalesced: skip a stale word request if a newer word or chunk request is already queued; never
   block speech). Fallback: the sentence highlight is shown at chunk start as today and stays if the
   voice gives no word boundaries, or if a word can't be mapped (log "word fallback=sentence reason=...").
   Add a pane setting "Follow each word" (checkbox, default on, persisted in settings.js alongside
   `highlight`). In yellow mode keep the yellow on the sentence and select the current word on top.
   Log word highlights sparingly (e.g. the first word event of each chunk and any failure, plus a
   per-chunk count "words highlighted=K of M"), so the 40-entry log is not flooded; Diagnostics
   summary should say whether boundary events were seen for the current voice.

Also add event-log entries useful for diagnosing remaining cases: selection lost and the recovery
taken, drift amount, stop/finish selection actions, and when no boundary events arrived for a chunk.

Tests (mock Word, extend the existing fixture in test/word.test.mjs and player/taskpane tests): a
regression test for each bug: (1) Previous a few times then Stop does not select the original start;
user clicked elsewhere -> selection untouched; our highlight still selected -> collapsed to current
sentence start; finish likewise. (2) a document whose Word sub-range text lengths differ from the
reading text (simulate e.g. a field/hidden char that makes expanded-prefix lengths larger by k), and a
search miss: the selection never jumps to the original start, later sentences still highlight via
drift/nearest, events are logged. (3) a >250-char sentence chunk is selected in full; a chunk with
\v or \t still maps. (4) word boundaries select the right words, including repeated words in one
sentence and missing charLength; stale words are skipped; no boundaries -> sentence stays selected.

Bump the version to **1.0.5** in addin/package.json (the build stamps manifest Version 1.0.5.0).
Manifest URLs must stay exactly as they are (no query strings; the build test enforces it).
Update help.html/INSTALL.md briefly for the new "Follow each word" option.

## Finish
Run `cd addin && node --test --test-isolation=none test/*.test.mjs`,
`BASE_URL=https://larok00.github.io/word-tts npm run build`, and `~/.bend/bin/bend bend/splitter_test.bend`.
All must pass. Check dist/install/manifest.xml has Version 1.0.5.0 and the same URLs as before.
Add a "Krystof feedback (v1.0.5)" section to NOTES.md: each root cause in plain words, what changed,
test counts, whether bend/ changed, and what only real Word on Windows can confirm (boundary events
from his voices, drift sources in his document, scroll behaviour). Report briefly.
