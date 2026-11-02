# Codex prompt 06: fixes from Windows end-to-end test round 4

You are working in this repo (Word add-in "Read Aloud+" in addin/, Bend sentence splitter in bend/).
Read NOTES.md (especially the round-3 section), CODE_TOUR.md and the code first. Keep the existing
style: short teaching comments, small functions. Do not commit or push; do not touch git config.
No network is needed. Be efficient: this runs on a limited plan.

Round 4 tested v1.0.2 on real Word for Windows (the footer and Diagnostics confirmed v1.0.2 was
loaded). PASSES: Play button from mid-word starts at "Something" (Diagnostics "start: sentence");
Pause/Resume buttons update the status immediately; the second copy of the repeated sentence is
selected. Fix the following, with tests, and bump to **v1.0.3** (addin/package.json "version";
the build stamps manifest Version 1.0.3.0).

## B. Regression: add-in load error and dead document shortcuts

On opening the pane Word showed "Add-in Read Aloud+ failed to install or load a required resource."
(heading "Error installing add-ins", status bar "Error loading add-ins"), which was gone on v1.0.1.
The first Ctrl+Alt+Shift+P (focus in the document) showed "ADD-IN ERROR: This add-in is no longer
available: add-ins inserted during development are only available during debugging from Visual
Studio...". After that the P and Left shortcuts did nothing (they worked on v1.0.1). Home had no
Read Aloud+ button until the pane was opened from Developer Add-ins.

Maintainer's investigation (read-only): the ONLY manifest difference between v1.0.1 and v1.0.2 is
`?v=<version>` appended to `SourceLocation` and to the `Taskpane.Url` resource. `Taskpane.Url` is
also the shared `<Runtime resid>` and the `<FunctionFile resid>`. Every manifest URL on Pages returns
200 with the right content type (icons image/png, help.html and taskpane.html?v=1.0.2 text/html,
shortcuts.json application/json). So the query string on the shared-runtime/function-file URL is the
prime suspect (Office identifies the shared runtime and the keyboard-shortcut function file by that
URL, and its cached registration of the sideloaded add-in no longer matched).

Fix:
- Make the manifest URLs exactly as stable as v1.0.1: `SourceLocation` and `Taskpane.Url` back to
  `{{BASE_URL}}/taskpane.html` with NO query string. No query strings anywhere in the manifest
  (icons, help, ExtendedOverrides shortcuts.json URL, AppDomain). Only `<Version>` changes per
  release. Keep `{{VERSION}}` substitution for `<Version>` only.
- Keep cache-busting only inside the built pane: `taskpane.css?v=`, `taskpane.js?v=` in
  taskpane.html and the `?v=` on relative module imports (already in build.mjs). The service worker
  is network-first, so an unversioned taskpane.html is fine for users already on v1.0.2. Make sure
  the SW still serves taskpane.html (no query) offline.
- Re-check the shortcut wiring for a shared runtime opened with focus in the document:
  `Office.actions.associate` for every action id in shortcuts.json must run as early as possible
  (at module top level inside `Office.onReady`, before any awaits that could fail), and the build
  test should assert ids in shortcuts.json == ids associated in taskpane.js. Make sure a failure in
  voices/settings setup cannot skip the associate calls. If you know of anything else in the manifest
  that could produce "failed to load a required resource" for a shared runtime (e.g. the runtime
  needing `<Runtime resid lifetime="long">` with the same URL as FunctionFile, which we have), check it
  and explain.
- Tests: build test that the built manifest contains no `?` in any URL, that SourceLocation,
  Taskpane.Url, Runtime and FunctionFile all resolve to exactly `<BASE_URL>/taskpane.html`, and that
  the manifest equals the v1.0.1 manifest except for `<Version>` (compare against a normalised copy of
  the v1.0.1 template stored in the test, or assert the specific URL set).
- In NOTES.md explain the likely cause plainly, and add to INSTALL.md troubleshooting: if Word still
  shows that error after updating, fully close Word, delete the contents of
  `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` (Office's add-in cache; safe, it is rebuilt), and reopen.

## C. Real bug: Previous leaves Word's selection on the old sentence (reproduced twice)

Reading started with the cursor in "happens", so the reading chunks are:
1 "Something else happens in between. ", 2 "This sentence appears twice in the document." (the
SECOND copy in the paragraph, the FIRST occurrence inside the reading range), 3 the long sentence in
the next paragraph (about 390 chars, so splitSentences(text, 300) splits it; its search text is the
mapChunkToSearch 250-char prefix). With playback on sentence 3, pressing the Previous BUTTON moves
the status and "Now reading" to sentence 2, but Word's selection stays on the long sentence.

Use testing/fixtures/sample.docx's real text (paragraphs 4 and 5) in a Word mock with duplicate text
and a paragraph break, start from the cursor in "happens", play through to chunk index 2 (the long
sentence, mapped via its prefix), then previous() via the real Player + WordReader wiring (as in
taskpane.js: onInvalidate -> reader.invalidate, onChunkStart -> reader.highlight). Try to reproduce:
- an in-flight highlight for index 2 (search sync pending or select already sent) when Previous comes;
- a cached range for index 1 that is stale/invalid or whose select() throws (enqueue() swallows
  errors silently today!);
- late callbacks of the cancelled long utterance.
Then fix so the selection ALWAYS ends up matching "Now reading":
- After selecting, verify: load the document selection's text (or compare the selected range with
  the expected range via compareLocationWith) and if it doesn't match the chunk, re-map that index
  with a fresh search inside the reading range and pick the occurrence whose start offset (measured
  from the reading start, like sentenceStart's prefix-length technique) equals the chunk's offset in
  the reading text (offsets are the cumulative chunk lengths, since chunks concatenate to the text).
  Prefer computing that offset-based mapping in general, so repeated text never relies on
  "first match after the cursor".
- Never swallow highlight errors silently: record the last highlight outcome in WordReader
  (e.g. `lastHighlight = { index, method: 'cached'|'remapped'|'not-found', error }`) and show it in the
  pane's Diagnostics next to the start method.
- Keep the generation checks; the newest request must win.
Add tests for each scenario above, plus Next/Previous across the paragraph break and across the split
long sentence.

## D. Test fixture: long document

Create `testing/fixtures/make_sample_long.py` (python-docx is installed: `python3 -c "import docx"`)
that writes `testing/fixtures/sample-long.docx`: start with the same content as sample.docx (you may
open sample.docx with python-docx and append), then add filler paragraphs (normal sentences, a few
repeats) until it is at least 25 pages at default Word formatting (aim for about 25 x 550 words,
or insert explicit page breaks every ~500 words to make the page count deterministic, i.e. 26+
page breaks). Put a unique paragraph `PAGE FIFTEEN MARKER sentence. This is the sentence after the
marker.` at the start of page 15 (right after the 14th page break if you use page breaks). Run it
and commit-ready the .docx (binary is fine). Add a tiny test or script check that the docx contains
the marker exactly once and at least 25 page breaks.

## Finish

Update NOTES.md with a dated "Windows test round 4 (2026-11-02)" section: passes, findings B-D, root
causes, and fixes. Prefer not to change bend/; if you do, explain it plainly in NOTES.md and
LEARNING.md. Run and make pass: `cd addin && node --test --test-isolation=none test/*.test.mjs`
(report the count), `BASE_URL=https://larok00.github.io/word-tts npm run build`, and
`~/.bend/bin/bend bend/splitter_test.bend`. Print a short summary per item, test counts, and whether
bend/ changed.
