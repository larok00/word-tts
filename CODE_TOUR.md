# Code tour: suggested reading order

About an hour end to end. Each file starts with a header comment explaining its role.

1. **[NOTES.md](NOTES.md)**: the goal, priorities, architecture choice and decision
   log (why it's an Office add-in using Windows voices).
2. **Bend, the core of the learning:**
   1. `bend/hello.bend`: the smallest program (`main`, `IO`).
   2. `bend/splitter.bend`: read the header (worked example), then bottom-up:
      `Splitter.split` → `scan` + `flush`/`State` (the main loop) → `boundary`,
      `abbreviation`, `word` (decisions) → `lazy_string`/`lazy_bool` (thunks) →
      `limits`/`limit`/`choose`/`last_space` (max length, fuel).
   3. `bend/splitter_test.bend`: how tests are written and run (`bend bend/splitter_test.bend`).
   4. `bend/LAWS.bend`: the lossless law, stated but not yet proven.
   5. `bend/parallel_demo.bend`: divide-and-conquer parallelism on a balanced tree.
   6. **[LEARNING.md](LEARNING.md)**: the concepts above explained, exercises, and how
      the code was produced with Codex.
3. **Bend → JavaScript bridge:**
   - `addin/src/lib/splitter.bend.mjs`: *generated* by `bend … -o`. Skim it to see how
     Bend compiles (don't edit).
   - `addin/src/lib/splitter.js`: the wrapper the add-in calls (`splitSentences`).
   - `addin/src/lib/splitter-fallback.js`: the plain-JS twin, used only for lone surrogates.
4. **Speech engine (plain JS, no Word):**
   - `addin/src/lib/player.js`: the state machine (play/pause/resume/stop/next/prev,
     watchdog, voice fallback). This is the reliability heart.
   - `addin/src/lib/voices.js` (offline-first voice ranking), `settings.js` (localStorage),
     `mapping.js` (chunk ↔ document positions).
5. **Word integration:**
   - `addin/src/word.js`: reading the selection or cursor→end, highlighting and restoring.
   - `addin/src/taskpane.html` / `.css` / `.js`: the panel UI and keyboard shortcuts,
     wiring everything together.
   - `addin/src/sw.js`: offline caching. `addin/src/help.html`: the user help page.
6. **Packaging:** `addin/manifest.template.xml` (what Word loads), `addin/scripts/build.mjs`
   (→ `dist/`), `install/install.cmd`, `hosting/pages.yml`,
   `addin/scripts/publish-public.sh`, then **[INSTALL.md](INSTALL.md)**.
7. **Tests:** `addin/test/*.test.mjs` (`cd addin && npm test`). `player.test.mjs` and
   `word.test.mjs` show the tricky cases with fake engines and fake Word.
