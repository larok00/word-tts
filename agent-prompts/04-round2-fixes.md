# Codex prompt 04: fixes from Windows end-to-end test round 2

You are working in this repo (Word add-in "Read Aloud+" in addin/, Bend sentence splitter in bend/).
Read NOTES.md, CODE_TOUR.md and the code first. Keep the existing style: short teaching comments,
small functions. Do not commit or push; do not touch git config. No network is needed.

Round-2 test on real Word for Windows (Microsoft 365) found these problems. Fix all of them,
with tests where feasible:

1. **Stop shortcut clash.** Ctrl+Alt+Shift+S is Word's built-in "Styles" shortcut; Word showed
   "Ctrl+Shift+Alt+S is being used for multiple features". Pick non-clashing shortcuts. Check every
   one of our Ctrl+Alt+Shift combos (P, S, Right, Left, Up, Down; see addin/scripts/build.mjs) against
   Word for Windows' built-in keyboard shortcuts as you know them, and change any that clash or are
   risky. Keep them easy to remember. Update everything that mentions them: taskpane.html help text,
   help.html, addin/README.md, INSTALL.md, README.md, and any tests. Add a test that the shortcut list
   has no duplicates and avoids a small hard-coded list of known Word Ctrl+Alt+Shift bindings
   (at least Ctrl+Alt+Shift+S).

2. **Play from mid-sentence starts at the cursor.** With no selection and the caret in the middle of a
   sentence, addin/src/word.js `read()` uses `selection.getRange('Start').expandTo(body end)`, so
   reading starts at the tail of the word/sentence ("ens in between."). It must start at the beginning
   of the sentence containing the cursor. Suggested approach: get the paragraph containing the cursor
   (`selection.paragraphs.getFirst()`), read the text from paragraph start to cursor
   (paragraph.getRange('Start').expandTo(selection.getRange('Start'))), use the existing splitter to find
   where the last sentence starts in that prefix (pure function in a lib module so it can be unit
   tested, e.g. sentenceStartOffset(prefixText) -> number of characters to skip), then build the
   reading range starting at that sentence (e.g. search for the sentence-start text within the
   paragraph, or use the paragraph start when the cursor is in the first sentence). Keep it robust:
   if anything fails, fall back to the current cursor-start behaviour. If the cursor is at the very
   start of a sentence, start there. Add unit tests for the pure function (cursor mid-word, mid-
   sentence after "e.g.", in the first sentence, right after a full stop + space, empty prefix) and a
   word.test.mjs test with the existing Word mocks if feasible.

3. **Stale "Paused" status after Resume.** After Resume the status stays "Paused. Press Resume to
   continue." until the next sentence starts. Update the status immediately on resume (e.g. "Reading
   sentence N of M" or the same text used while reading). Add a test.

4. **Word toast "Add-in Read Aloud+ failed to install or load a required resource."** The pane still
   works. I checked the live site: every URL in the built manifest returns 200 with the right content
   type (icon-16/32/80/128.png are image/png with exactly those pixel sizes, help.html, taskpane.html,
   shortcuts.json application/json). So look for other causes in addin/manifest.template.xml and
   build.mjs and fix them, for example: HighResolutionIconUrl should be a 64x64 icon (icon-64.png
   exists) not 128; AppDomain should be an origin (https://larok00.github.io) not a path; the
   ExtendedOverrides/shortcuts.json format against the documented schema (actions with id/type/name,
   shortcuts with action/key.default) and whether every action id is associated with
   Office.actions.associate in the code before use; FunctionFile/Runtime resids; anything referenced
   but not built into dist/. Make your best fix and explain the likely cause in NOTES.md. Bump the
   manifest <Version> to 1.0.1.0 if the manifest changes. Run `npm run validate` after building
   (office-addin-manifest is installed) and make sure it passes, if it can run offline.

5. **Previous sentence.** Check that the Previous button and its shortcut go back exactly one sentence
   (from sentence N while reading/paused to N-1, at sentence 0 stay at 0), and that Next goes forward
   exactly one. Fix if not, and add player tests for this including repeated presses.

Also, in NOTES.md add a dated "Windows test round 2 (2026-11-01)" section recording: the four
failures above and the fix for each; the passes (reading/selection follow, offline voices listed,
pause/resume, speed, stop, yellow highlight restore, close/reopen); that Codex on Windows runs
sandboxed so registry/file installs it performs don't reach the real system (the install had to be
redone from outside); that Word started via COM automation (/Automation -Embedding) doesn't load
add-ins; and that Codex on Windows kept spending purchased credits after hitting its 5-hour limit
(~44 credits during the test, ~8 more afterwards), so long Windows runs must stop at the limit.
Add the sandbox and COM notes briefly to INSTALL.md's Windows checklist too.

If any fix touches bend/ code, explain the Bend change in plain words in NOTES.md and LEARNING.md.
Prefer not to change bend/ unless needed; if the sentence-start helper uses the compiled splitter,
it should go through the same JS entry point the add-in already uses (with its plain-JS fallback).

Finally run and make pass: `cd addin && npm test && npm run build`, and every Bend test
(`~/.bend/bin/bend bend/splitter_test.bend` and LAWS.bend etc., as described in NOTES/README).
If the splitter.bend changed, regenerate the compiled JS the same way the build does.
Print a final summary: what changed per fix, test counts (JS and Bend), whether the manifest changed.
