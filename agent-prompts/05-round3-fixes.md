# Codex prompt 05: fixes from Windows end-to-end test round 3

You are working in this repo (Word add-in "Read Aloud+" in addin/, Bend sentence splitter in bend/).
Read NOTES.md, CODE_TOUR.md and the code first. Keep the existing style: short teaching comments,
small functions. Do not commit or push; do not touch git config. No network is needed.
Be efficient: this runs on a limited plan.

Round 3 tested v1.0.1 on real Word for Windows. The manifest-level fixes (resource toast gone,
Ctrl+Alt+Shift+X stop shortcut) took effect, but two JS behaviours that v1.0.1 fixed were still seen
in their v1.0.0 form. The live gh-pages site DOES serve the v1.0.1 code (word.js has sentenceStart).
Diagnosis from the maintainer: **the likely main cause is our own service worker**. addin/src/sw.js
answers same-origin GETs cache-first (stale-while-revalidate), so the first pane load after a deploy
runs the PREVIOUS release's JS; the new worker only installs in the background. GitHub Pages also
sends `Cache-Control: max-age=600`, so `cache.addAll` can even precache stale copies from the HTTP
cache. Fix the caching, then harden the behaviours anyway, with tests:

1. **Caching / updates.**
   - Change sw.js to network-first for same-origin app files: `fetch(request, { cache: 'no-cache' })`
     (revalidate, bypass stale HTTP cache), with a short timeout (about 3 s) and fall back to the
     cache only when the network fails or times out (offline reliability must stay). Update the
     cache on success. Precache with `new Request(url, { cache: 'reload' })` so installs never take
     stale HTTP-cache copies. Keep the Office.js CDN handling best-effort as now.
   - Single source of truth for the version: `addin/package.json` "version" = "1.0.2". build.mjs
     reads it and writes the manifest `<Version>` as `1.0.2.0` (template placeholder, e.g.
     `{{VERSION}}.0`), and stamps it into the pane.
   - Cache-busting: in the built taskpane.html, add `?v=<version>` to taskpane.css and taskpane.js
     (build-time substitution, not by hand). Also make the manifest's taskpane URL (both
     SourceLocation and Taskpane.Url) `.../taskpane.html?v=<version>` so a new manifest forces a new
     page URL. Make sure the SW still serves `taskpane.html?v=...` offline (match ignoring search for
     navigations, or precache that URL). Module imports between our own JS files may stay plain
     because the SW is now network-first with no-cache.
   - **Visible version label**: a small footer line in the pane, e.g. "Read Aloud+ v1.0.2", filled in
     by the build (and also exported as a JS constant, e.g. `src/lib/version.js` generated or
     substituted at build, so taskpane.js can show it). The tester must be able to read it.
   - Tests (build.test.mjs or a new one): built manifest has Version 1.0.2.0 and `?v=1.0.2` URLs;
     built taskpane.html has versioned asset URLs and the version label; sw.js is network-first
     (e.g. test its fetch handler with a fake `self`/`caches`/`fetch`: network success returns the
     network response and updates the cache; network failure returns the cached one).

2. **Play from mid-word / mid-sentence still started at the cursor** (cursor clicked inside "happens"
   in the paragraph "This sentence appears twice in the document. Something else happens in between.
   This sentence appears twice in the document.", Play via Ctrl+Alt+Shift+P; selection began inside
   "happens"). The shortcut goes through toggle() -> play() -> reader.read(), so it is the same path
   as the button; confirm that. It was probably caching, but harden `WordReader.sentenceStart`:
   - The current approach searches for the text BEFORE the sentence (which ends in a space). Word's
     search may not match trailing whitespace reliably. Prefer searching for the start of the
     current sentence instead: the text from the sentence offset to the cursor
     (`prefix.text.slice(offset)`, e.g. "Something else hap"; trim it to at most ~200 chars, take its
     leading part if longer, escape `^`), inside the prefix range, and choose the match whose
     START is exactly at `offset` (compare with the same prefix-length technique the code already
     uses, start.expandTo(match.getRange('Start')).text.length === offset). Keep the old
     preceding-text search as a second attempt, then the cursor fallback.
   - Also handle a collapsed cursor inside a word identically to one between words (add a test for
     both), cursor in the first sentence (paragraph start), cursor right after ". ", and repeated text.
   - Record which path was used (e.g. `reader.lastStartMethod = 'sentence' | 'paragraph' |
     'preceding-text' | 'cursor-fallback'` plus the caught error message if any) and show it in a
     small collapsed "Diagnostics" <details> in the pane together with the version, so a tester can
     report it. Keep it plain and unobtrusive.
   - Extend the Word mocks in word.test.mjs to cover these cases, including one where the
     preceding-text search returns nothing but the new search works.

3. **Previous: status changed to sentence 2 but Word's selection still showed sentence 3.**
   Check for races: the status updates in onChunkStart immediately, while the highlight is queued
   behind earlier Word work; an older queued/in-flight highlight (or a late onstart/onboundary/onend
   of a cancelled utterance) must never re-select an older sentence after navigation. Make sure:
   - every navigation (previous/next/play(index)/stop) bumps the WordReader generation BEFORE any new
     highlight is queued, and all highlight work checks the generation right before `select()` and
     before applying yellow;
   - the latest request always wins: if an obsolete highlight is mid-flight when navigation happens,
     the new one still runs afterwards and its selection is the final one;
   - cancelled-utterance callbacks cannot trigger onChunkStart for an old index (Player already uses
     attempt tokens; add a test).
   Add tests with a mock Word whose sync() is slow/controllable: highlight(3) in flight, then
   highlight(2) requested -> the final selected range is sentence 2's, and sentence 3 is not
   selected after it. Also a Player test for repeated previous() while callbacks from cancelled
   utterances arrive late.

4. **Resume status.** After Resume, status still read "Paused. Press Resume to continue." on the first
   screenshot (later "Reading sentence 5"). v1.0.1 already sets status on the 'playing' state change;
   verify every resume path (pane Pause/Resume button, pane Space key, Ctrl+Alt+Shift+P via
   Office.actions, needsRestart path, resume after a rate change, resume after an error-pause) updates
   the status synchronously in the same call, and that nothing later overwrites it with "Paused"
   (e.g. a stale pause event or refreshVoices). Add/extend taskpane tests for each path if the
   existing harness allows.

Also add a dated "Windows test round 3 (2026-11-02)" section to NOTES.md: passes (no resource
toast; second copy of the repeated sentence highlighted; Ctrl+Alt+Shift+X stops with no clash),
the findings above, the root-cause analysis (service-worker cache-first served the previous release),
and each fix. Mention in INSTALL.md (Windows checklist / troubleshooting) that the pane footer shows
the version, and that after an update Word should be fully closed and reopened.

Prefer not to change bend/. If you do, explain the Bend change in plain words in NOTES.md and
LEARNING.md.

Finally run and make pass: `cd addin && node --test test/*.test.mjs` (report the real test count,
e.g. with `--test-isolation=none` if the default reporter counts files) and
`BASE_URL=https://larok00.github.io/word-tts npm run build`, and `~/.bend/bin/bend bend/splitter_test.bend`.
Print a final summary: what changed per item, test counts (JS and Bend), and whether bend/ changed.

---

## Follow-up (same session, after review)

Small addition, keep it minimal. Users upgrading from v1.0.1 still have the OLD cache-first service
worker controlling the pane on their first v1.0.2 load. It misses on `taskpane.js?v=1.0.2` (new) but
would serve cached, unversioned `./word.js`, `./lib/player.js` etc. from v1.0.1, so the first load
would mix versions. Fix: in build.mjs, after copying to dist/, rewrite relative ES module import
specifiers in every dist/*.js and dist/lib/*.js (e.g. `from './lib/player.js'`, `from './splitter.js'`,
`from './splitter.bend.mjs'`) to append `?v=<version>`. Do not touch src/ files or absolute URLs.
The SW precache list stays unversioned; offline lookups already use ignoreSearch for same-origin.
Make sure this happens before the SW content hash is computed. Add a build test that every relative
import in dist JS carries `?v=1.0.2` and that the dist modules still import correctly in Node
(e.g. dynamic-import dist/lib/sentence-start.js and call sentenceStartOffset). Run
`cd addin && node --test --test-isolation=none test/*.test.mjs` and
`BASE_URL=https://larok00.github.io/word-tts npm run build`. Print a 3-line summary.
