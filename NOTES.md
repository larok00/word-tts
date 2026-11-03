# word-tts — project notes

_Started 2026-11-01 (Europe/London). Owner: Koral. User: Koral's friend._

## Goal
A text-to-speech (TTS) reader that works reliably inside Koral's friend's existing
Microsoft Word workflow. He depends on Word's built-in Read Aloud / Speak, and it
recently broke for a week, which was a disaster for him. The new tool must be more
reliable than Word's and nicer to use.

## Priorities (from Koral, ranked)
1. **Reliability: it must not break.** It needs an offline fallback, no single cloud
   dependency, and no dependency on Microsoft's Read Aloud backend.
2. **Easy speed and pause controls.** Big obvious buttons plus keyboard shortcuts
   (ideally mirroring Read Aloud's Ctrl+Space play/pause and Alt+←/→ speed).
3. **Seamless Word integration.** It lives in Word: read the selection or from the
   cursor, ideally highlighting the word or sentence being spoken.

## Constraints
- The friend uses **Word desktop on Windows** (confirmed by Koral, 2026-11-01).
- Koral is learning **Bend** (https://github.com/HigherOrderCO/Bend, now Bend 2).
  Use Bend where it fits (sentence splitting, chunking, parallel text
  pre-processing). Voice/audio and Word integration go in another language.
- Don't write the app until the open questions below are answered.

## Open questions (ask Koral / friend)
1. **What exactly broke during that week?** Which Word version/build (File > Account >
   About Word) and which channel? See "Possible cause of the outage" below.
2. Microsoft 365 subscription vs perpetual Office 2019/2021 vs work-managed machine?
   (A managed machine may block sideloaded add-ins and installs, and needs IT.)
3. Windows 10 or 11? Admin rights to install things?
4. Offline needs: is he ever without internet? (This decides whether neural cloud voices
   can be the primary engine or only an extra.)
5. Voice preferences: accent (en-GB?), male/female, how natural it needs to be.
   Does he currently use a neural voice in Read Aloud or the classic voices?
6. How does he read: whole documents start to finish, or selected passages? Does he rely
   on word highlighting / following along? Any screen-reader use (NVDA/Narrator)?
7. Document languages other than English?
8. Who maintains it: will Koral be able to update/support it remotely?

## Possible cause of the outage (research, 2026-11-01)
- Microsoft message MC1127222: Read Aloud, Dictation and Transcription **stopped working
  on Office builds older than 16.0.18827.20202 after end of September 2026** (backend
  upgrade). If his Word was not updating, this matches "broke for a week".
  https://mc.merill.net/message/MC1127222
- Known issue: neural voices unavailable in Read Aloud on version 2604 (build
  19929.20090), fixed in a later build.
- The Edge "read aloud" cloud voices (also used by the unofficial edge-tts library)
  refused synthesis from about 2026-10-10 until edge-tts 7.3.0 (2026-10-13) after a token
  change. Same lesson: Microsoft's cloud voices can change under you.
- **Takeaway:** Word's neural voices are cloud-backed and tied to Office build and
  sign-in. A reliable tool must have a **local engine that works with no network and
  no Microsoft account**.

## Architecture options (ranked against the priorities)

### A. Office Add-in (task pane) + local engine fallback chain ★ recommended
A Word task-pane add-in (HTML/TypeScript, Office.js / Word JS API). On Windows it runs
in Edge WebView2, so `window.speechSynthesis` works there. It reads the selection or
paragraphs via the Word API, splits them into sentences, and speaks them with a
**fallback chain**:
1. Windows local voices via Web Speech API (`speechSynthesis`, SAPI/OneCore voices,
   offline, always present).
2. Optional: a local companion service (Piper neural voices, offline) reached over
   `http://localhost` for better quality.
3. Optional: a cloud neural voice (e.g. Azure Speech with a key, or edge-tts) when online.
- Reliability: good if (1) is always the floor. Risk: add-in loading depends on the
  manifest (sideload or centralized deploy, shared-folder catalog on Windows) and
  WebView2. Hosting the add-in files locally or on a reliable static host avoids
  network breakage.
- Speed/pause: full control in our UI (rate slider, pause/resume, skip
  sentence/paragraph). Keyboard shortcuts are possible via add-in keyboard shortcuts.
- Word integration: best. Sidebar inside Word; can select/highlight the sentence
  being read using Word ranges. Also works on Mac/web later.
- Caveat: Word ranges don't give word-level timing. Sentence-level highlighting is
  easy, word-level is harder (`SpeechSynthesisUtterance.onboundary` may help).

### B. Windows companion app (tray app) + hotkey, reads Word via COM/clipboard
A small native app (C#/.NET or Python) using SAPI / OneCore voices
(System.Speech / Windows.Media.SpeechSynthesis) and Piper offline neural voices. It
gets text from Word via COM automation (`Word.Application.Selection`) or the clipboard,
with a global hotkey for play/pause/speed and a floating mini-player.
- Reliability: highest. Fully local, independent of Office add-in plumbing, works
  in any app (PDFs, browser too).
- Speed/pause: excellent (global hotkeys work even while Word has focus).
- Word integration: medium. Not "inside" Word, highlighting via COM is possible but
  clunkier, and COM needs desktop Word (fine here).
- Could also be the "local engine" that option A calls (A+B hybrid).

### C. VBA/VSTO macro add-in using SAPI
A Word macro or VSTO add-in calling `SAPI.SpVoice` directly, with ribbon buttons.
- Reliability: fully offline, but VBA macro security, Trust Center policies and
  VSTO deployment are fragile. VSTO is legacy tech.
- Speed/pause: OK (SpVoice Rate, Pause/Resume). Integration: native ribbon.
- Quick prototype / emergency fallback, not the long-term product.

**Ranking:** A+B hybrid > A alone > B alone > C. Start with A using Web Speech
(offline Windows voices) so it works on day one, then add a Piper-based local service
(B) for natural offline voices. Cloud voices are optional extras, never required.

## TTS engine notes
- **Windows built-in voices** (SAPI5 / OneCore): offline, always there, robotic-ish but
  dependable. Accessible from WebView2 `speechSynthesis`, .NET, and Python (pyttsx3).
- **Piper** (OHF-Voice/piper1-gpl, `pip install piper-tts`): fast local neural TTS, many
  en_GB voices (alan, alba, cori, jenny_dioco, northern_english_male, …). Used by NVDA
  and Home Assistant. GPL, so check licences per voice model card. An old standalone
  Windows exe also exists (rhasspy/piper 2023.11.14-2).
- **Kokoro-82M (kokoro-onnx)**: another free local neural option, worth a listen test.
- **edge-tts**: unofficial client for Edge's cloud voices. Great quality, but it broke in
  Oct 2026 (403s). **Never rely on it as the primary engine.**
- **Azure Speech**: official, paid/free tier, needs a key + network.

## Where Bend fits
Bend 2 (v2.0.39) compiles to **C (native binary), JS/.mjs**, CUDA and Metal. Ideas:
- Write the **sentence splitter / chunker** (abbreviations like "Dr.", "e.g.",
  decimals, ellipses, quotes, list items, max-chunk-length for TTS) in Bend. Encode the
  splitting rules as `LAWS.bend` (e.g. "concatenating chunks == original text", "no chunk
  exceeds N chars", "never split inside a number"). That gives proofs for the part that
  must not break.
- Compile to **.mjs** (`bend split.bend -o split.mjs`) and import it straight into the
  Office add-in (option A), or to a native binary for the companion app (B).
- Parallelism: split by paragraph, then process paragraphs in parallel (balanced
  divide-and-conquer). Honestly, documents are small, so parallelism is a learning
  exercise more than a performance need. The JS target is single-core anyway.
- Bend gotchas: strings are linked lists of chars (slow text processing). No regex.
  No Windows support (WSL only) for the *compiler*, but the compiled JS output runs
  anywhere. Native builds need clang 14+ (19+ for `!` GPU/parallel), and **clang isn't
  installed on the box yet**.

## Environment status (box, 2026-11-01)
- **Codex CLI**: `/home/box/.local/bin/codex` → `codex-cli 0.166.0`, `codex login status`
  → "Logged in using ChatGPT". One small `codex exec` (Bend install + hello world) worked:
  about 17 s, about 17.6k tokens, no usage-limit message. Invocation used:
  `codex exec -C <dir> --skip-git-repo-check -s danger-full-access -c model_reasoning_effort='"low"' -c service_tier='"fast"' -o <out.txt> - < prompt.txt`
- **Bend**: 2.0.39 installed at `~/.bend/bin/bend` (PATH line added to `~/.bashrc`).
  - Installed the official way (2026): `curl -fsSL https://bend-lang.com/install.sh | sh`
    (script pins version + sha256, no sudo). Codex ran it.
  - **Gotcha:** the old Bend 1 method (Rust nightly + `cargo install hvm` + `cargo install
    bend-lang`, `bend run-rs`) is obsolete. Bend 2 has no `hvm`. Bend 1 code doesn't carry over.
  - **Gotcha:** `bend --version` isn't supported; use `bend version`.
  - Run a file: `bend file.bend`. Build: `bend file.bend -o out{,.c,.js,.mjs}`.
    Learn: `bend guide`, `bend base`.
  - Hello world: `bend/hello.bend` printed "Hello from Bend" ✅
  - clang not installed, so native `-o` binaries are untested.

## Decision log
| Date | Decision | Why |
|---|---|---|
| 2026-11-01 | Target Word **desktop on Windows** first | Confirmed by Koral |
| 2026-11-01 | Priorities: reliability > speed/pause controls > Word integration | Koral |
| 2026-11-01 | Use Bend 2 (2.0.39) via official installer, not Bend 1/HVM | Bend 1 install path is obsolete |
| 2026-11-01 | Coding/install work goes through Codex (`codex exec`) | Koral's standing rule |
| 2026-11-01 | Leaning: Office add-in + offline local voice floor (+ Piper later) | Ranks best on all 3 priorities; pending open questions |
| 2026-11-01 | **Build an Office task-pane add-in (option A)** using the browser `speechSynthesis` (Windows voices, offline first). Piper/companion app deferred | Most reliable path with no server and no admin rights; doesn't depend on Microsoft's Read Aloud service |
| 2026-11-01 | Assume the friend's own PC, M365 Word desktop, current build (Koral) | Allows a per-user registry sideload |
| 2026-11-01 | Splitter written in Bend, compiled with `bend -o` and **used directly** in the add-in | Generated JS is browser-safe (no Node imports), takes about 56 ms for 20k chars, and passes all tests |
| 2026-11-01 | JS fallback splitter is used **only** for text with lone UTF-16 surrogates | Bend `str_in` replaces them with U+FFFD, which would break the lossless law |
| 2026-11-01 | Splitter is sequential, and parallelism is shown in `parallel_demo.bend` | Each cut depends on the text to its left. The JS target is single-core anyway |
| 2026-11-01 | Lossless law stated in `LAWS.bend` and checked by tests and random input, but **not proven** | Proof effort time-boxed; `--verdict` needs Lean (not installed) |
| 2026-11-01 | Plain JS ES modules, no bundler; Office.js from Microsoft CDN | Fewer moving parts = fewer breakages |
| 2026-11-01 | Default highlight = **select** the sentence (no document change); optional yellow mode restores original colours | Never risks modifying the friend's document |
| 2026-11-01 | Shared runtime + `ExtendedOverrides` keyboard shortcuts (Ctrl+Alt+Shift+…) | Shortcuts work while typing in the document (Word 2408+) |
| 2026-11-01 | Watchdog + voice fallback + resume-by-restart in `player.js` | WebView2 speechSynthesis can stall or error silently |
| 2026-11-01 | Service worker caches app files (stale-while-revalidate, keeps current and previous cache) | Best-effort offline reopening |
| 2026-11-01 | Install = per-user **Developer registry sideload** via `install.cmd` (no admin, no store, no account) | Simplest non-technical route on his own PC |
| 2026-11-01 | Hosting **pending Koral's decision**: separate public repo `larok00/read-aloud-plus` + `publish-public.sh` (recommended), make `word-tts` public + Pages workflow, or paid plan | Pages on a private repo needs a paid plan. Both routes are prepared as manual-only, nothing published |
| 2026-11-01 | **Hosting decided (Koral): repo made public, Pages served from the `gh-pages` branch** at https://larok00.github.io/word-tts. Updates via `publish-public.sh larok00/word-tts`; install zip attached to GitHub release v1.0.0 | No workflow-scope token needed. History scanned for secrets before making it public (clean; 2 early commits use the placeholder author `koral@localhost`) |
| 2026-11-01 | New commits authored as Koral Hassan (noreply); earlier history not rewritten | Koral |

## v1 status (2026-11-01)
- Linux-verified: Bend tests 27/27, `parallel_demo` matches sequential, JS tests 61/61,
  build OK, `office-addin-manifest validate` OK, regenerated Bend JS identical.
- **Windows-only, untested:** real speech in WebView2, ribbon button, shortcuts,
  highlighting and restore in a real doc, install.cmd, offline reopen, whether Windows 11
  "natural" voices appear. See the checklist in INSTALL.md.
- Known limits: highlighting a chunk longer than 250 chars selects only its first
  250 chars (Word `search` limit). Shortcuts only work after the add-in has loaded
  once per Word session. The first load needs the network.

## Codex usage and credits
- Codex CLI 0.166.0, ChatGPT **Plus**. Steps used about 17.6k (setup), 57.7k, 77.4k and
  91.3k tokens. After step 03 the 5-hour window was at about 40% and the weekly
  window at about 22%. **No limit messages; purchased-credit balance unchanged**
  (read from the `rate_limits` event in `~/.codex/sessions/*.jsonl`).
- **There is no Codex setting that stops it spending purchased credits** (as of
  Oct 2026; see openai/codex issue #28382). When the included 5h or weekly allowance
  runs out, it draws from the credit balance automatically, even partway through a task.
  Turning off auto-reload (ChatGPT Settings → Usage, or Codex Usage & Billing) only
  stops *new purchases*; the existing balance can still be spent. The only hard
  guarantee is a zero balance. **Account settings were not changed.**
- Mitigation used here: `/workspace/codex-guard.sh` polls the latest session's
  `rate_limits` every 10 s and kills `codex` if the credit balance changes, a limit is
  reached, or the 5h window reaches 90% (weekly 95%). `/status` in the interactive CLI
  shows the same numbers.

## Windows test round 2 (2026-11-01)

Real Microsoft 365 Word for Windows test results and fixes (implemented 2026-11-02):

- **Stop shortcut clash:** Word’s Styles pane owns Ctrl+Alt+Shift+S. Stop now uses
  **Ctrl+Alt+Shift+X** (exit reading). Reviewed the other five combinations from
  existing Word shortcut knowledge, without network lookup: P and Right/Left/Up/Down
  have no known built-in clash with all three modifiers, so they stay. User or
  other add-in assignments can still differ. A package test rejects duplicates and
  the known Word combinations S/M/C/V with these modifiers. Help and install docs agree.
- **Play mid-sentence:** caret-to-end used to start with the remainder of the word.
  A pure JS helper now finds the containing sentence through the existing
  `splitSentences` entry point (compiled Bend, with its existing plain-JS fallback).
  It appends a sentinel to expose a completed boundary at the cursor and disables
  speech-length chunking. Word reads the paragraph prefix, locates the exact offset
  using a short literal search, and expands from there to the body end. Matching
  prefix lengths disambiguates repeated text. API/search failures retain the old
  cursor-start behavior; selected text and the original selection bookmark stay intact.
- **Stale Paused status:** the playing-state observer now immediately displays
  “Reading sentence N of M”, including native Resume before another sentence starts.
- **Resource-load toast:** successful HTTP responses did not rule out manifest
  metadata problems. Changed HighResolutionIconUrl from the 128px asset to the
  existing **64px** asset, and AppDomain from a deployment path to the HTTPS origin.
  These are the likely causes; the Windows toast still needs a real reinstall/retest
  to confirm. Manifest version is now **1.0.1.0**. Reviewed ExtendedOverrides JSON:
  actions already have id/type/name and shortcuts have action/key.default. All six
  action IDs have Office.actions.associate handlers on Office readiness. FunctionFile
  and the long-lived Runtime both resolve to Taskpane.Url. Package tests verify
  referenced local resources are built, and all shortcut action IDs are registered.
- **Previous/Next:** the player already uses the current index minus/plus one and
  clamps at the ends. Added repeated presses while playing and paused, including
  late completion callbacks from canceled speech; no player behavior change needed.

**Windows passes:** reading and selection follow; offline voices listed;
Pause/Resume; speed; Stop; yellow highlight restores; close/reopen.

**Windows test setup lessons:** Codex on Windows runs sandboxed: registry/file
installs it performs do not reach the real system. The install had to be redone
from outside the sandbox. Word started through COM automation
(`/Automation -Embedding`) does not load add-ins; start Word normally for tests.

**Usage limit:** during this Windows test Codex kept spending purchased credits
past its 5-hour limit (about 44 credits during the test, about 8 more afterwards).
Long Windows runs must stop at the limit; do not assume a limit message stops work.

**Local verification (2026-11-02):** 76 JS tests pass, including sentence offsets,
Word range mocks, immediate Resume status, shortcut/resource packaging, and repeated
navigation. `npm test` and `npm run build` pass. This host blocks Node synchronous
child processes with EPERM, so the build/compiler and build test now use asynchronous
child processes. The detailed test count was obtained with Node’s
`--test-isolation=none` (the default reporter here counts the nine test files).
Bend splitter tests: 27 passed, 0 failed; splitter check passes; parallel demo prints
8 and matches sequential; hello runs. LAWS.bend still reports its expected
`SOME PROOFS FAIL / 1 TODO` (exit 1), not a proven law. No Bend source changed;
the build regenerated identical compiled JS. `npm run validate` was attempted,
but this installed XML validator requires Microsoft’s online validation service
and cannot pass offline (DNS EAI_AGAIN); no successful schema validation is claimed.


## Windows test round 3 (2026-11-02)

Real Word for Windows tested v1.0.1. **Passes:** no resource-load toast; the second
copy of a repeated sentence highlighted correctly; Ctrl+Alt+Shift+X stopped reading
without a Word shortcut clash.

**Findings:** Play with the cursor inside “happens” still began inside the word;
Previous showed sentence 2 in the pane while Word still selected sentence 3;
Resume briefly retained “Paused. Press Resume to continue.” The live Pages files
contained the v1.0.1 fixes, but the pane appeared to run v1.0.0 JavaScript.

**Likely root cause:** our cache-first service worker served the previous release
on the first pane load after deployment, updating in the background. GitHub Pages'
600-second HTTP cache could also supply stale files during worker precaching.
This diagnosis fits the manifest fixes taking effect while JS fixes did not; it
still needs a fresh Windows test of v1.0.2.

Fixes for **v1.0.2**:

- Same-origin GETs now use network-first fetch with `cache: 'no-cache'`, a three-second
  timeout, cache updates on success, and cached fallback on failure or timeout.
  Precache uses reload requests; versioned pane/assets can use unversioned offline
  copies. Office.js precaching stays optional. Content-hashed cache retention stays.
- `addin/package.json` is the version source. The build stamps manifest Version
  1.0.2.0, both taskpane URLs, CSS/JS query strings, a visible footer and the exported
  JS version constant. After updates, fully close and reopen Word and check the footer.
- Sentence lookup searches the leading current-sentence text first (up to 200 chars,
  escaping carets), verifies its exact paragraph offset, then tries preceding text,
  then the cursor. Collapsed cursors within and between words share this path;
  paragraph-start and sentence-boundary cases are covered too. Diagnostics records
  the last start method and caught error without showing document text. Office Play
  uses the same `toggle() → play() → reader.read()` path as the pane controls.
- Player cancellation now invalidates Word highlight generations before cancelling
  speech, including navigation, play(index), stop and restarts. Existing generation
  checks before selection/yellow and the serialized queue ensure the latest highlight
  runs after obsolete in-flight work. Tests hold Word sync before mutation and while
  an already-sent selection completes; late cancelled speech callbacks cannot move
  playback or trigger an old chunk start.
- Resume status updates synchronously through the real Player for pane Resume, Space,
  Office Play/Pause, restart, rate-change and error-pause paths. Voice refresh messages
  now apply only while idle, preserving active playback status. Browser pause events
  have no UI handler; cancelled attempt callbacks remain ignored.

- Follow-up: the build appends `?v=<version>` to every relative ES module import in
  dist/ (src/ unchanged), so even a pane still controlled by the old v1.0.1 cache-first
  worker fetches all v1.0.2 modules on its first load instead of mixing versions.

Local verification: 96 JS tests pass after the follow-up (95 before it) (detailed count with `--test-isolation=none`),
including worker success/failure/timeout/install, built packaging, Word search and
controlled-sync races, late speech callbacks and all Resume paths. The requested
standard test command and Pages build pass. Bend splitter: 27 passed, 0 failed.
No `bend/` files changed; generated splitter JS is unchanged. Real Windows retesting
is still required; these are local mocks and package checks.

**Released v1.0.2 (2026-11-02):** published to gh-pages, GitHub release v1.0.2 with
the install zip (release/read-aloud-plus-install.zip, manifest Version 1.0.2.0).
Codex prompt: agent-prompts/05-round3-fixes.md. Next Windows retest:
testing/windows-e2e-round4-codex-prompt.md (version label, Diagnostics start method,
three fresh-screenshot attempts per timing check, report REPORT-round4.md).
Codex credits unchanged during this work (balance 160.4607160000).

## Windows test round 4 (2026-11-02)

Real Word for Windows confirmed **v1.0.2** in both footer and Diagnostics.
**Passes:** Play mid-word began at “Something” (`start: sentence`), Pause/Resume
updated status immediately, and the second copy of the repeated sentence selected.

Fixes for **v1.0.3** (manifest Version **1.0.3.0**):

- **B — load error and dead document shortcuts:** the only manifest difference
  from working v1.0.1 was `?v=1.0.2` on SourceLocation and Taskpane.Url. Successful
  HTTP responses did not fix Office's cached shared-runtime/function-file identity.
  Changing that identity likely caused the resource-load error, development-add-in
  error, missing Home button and dead shortcuts. Both URLs are stable again; no
  manifest URL has a query string, and VERSION substitution occurs only in Version.
  The build test locks the specific v1.0.1 URL set and checks that SourceLocation,
  Taskpane.Url, Runtime and FunctionFile resolve to the same unversioned pane.
  SharedRuntime 1.1, Runtime lifetime="long", FunctionFile's shared resource,
  HTTPS-origin AppDomain, 64px high-resolution icon and local resource packaging
  remain consistent. No additional manifest defect was identified in this offline
  review; no online schema validation or Windows recovery is claimed.
  Office action registration now happens at module top level inside onReady before
  settings/voices setup, with no await before association. Tests check exact shortcut
  action ID equality and registration even when settings or voices throw. Cache-busting
  stays inside HTML CSS/JS references and relative module imports. The network-first
  worker still precaches and serves unversioned taskpane.html offline. INSTALL.md
  explains fully closing Word and clearing the contents of
  `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` if registration errors persist.
- **C — Previous selection:** the reader trusted cached proxies, mapped through a
  moving first-match cursor and silently swallowed Word errors. A stale proxy,
  failed select/sync or ignored selection could therefore leave the long sentence
  selected while the player and pane correctly moved back. Tests reproduce these
  failure paths; the exact real-host cause still needs Windows Diagnostics.
  Mapping now searches within the reading range and chooses the candidate whose
  prefix length equals the chunk's cumulative offset plus leading whitespace.
  This handles repeats, paragraph marks and split long sentences without depending
  on earlier highlights. Chunks retain whitespace so their concatenation stays the
  reading text. After selection, the reader loads its text and prefix length to
  verify both content and position. Failed cached operations retry with a fresh
  search in a separate Word batch. Generation checks and the serialized queue keep
  the newest request in charge, including when an obsolete select was already sent.
  `lastHighlight` records index, cached/remapped/not-found and caught error; the pane
  refreshes Diagnostics after highlighting. Unrecoverable host/search failures are
  visible there, rather than being reported as successful selection.
  Integration tests load sample.docx paragraphs 4–5 with a paragraph mark, start
  inside “happens”, and wire the real Player to WordReader as the pane does. They
  cover pending search/select, wrong duplicate ranges, thrown select, rejected sync,
  ignored select, late cancelled speech events, and navigation across the paragraph
  and both chunks of the long sentence. Selection still uses the search prefix for
  long chunks (up to 250 escaped characters); full long-chunk selection is unchanged.
- **D — long fixture:** `testing/fixtures/make_sample_long.py` preserves sample.docx's
  original text/formatting, adds normal repeated filler, and inserts explicit page
  breaks with roughly 400 words per page to leave room for paragraph spacing.
  Generated `sample-long.docx` has 26 page breaks (27 explicit pages), with the unique
  PAGE FIFTEEN MARKER paragraph immediately after break 14. `--check` verifies the
  marker count, position, original text and minimum page-break count; the Node suite
  runs that check. Pagination can still vary with Word's layout settings.

Local verification: **110 JS tests passed**, 0 failed, using
`cd addin && node --test --test-isolation=none test/*.test.mjs`.
`BASE_URL=https://larok00.github.io/word-tts npm run build` passed.
`~/.bend/bin/bend bend/splitter_test.bend`: **27 passed, 0 failed**.
No `bend/` files changed; the regenerated compiled splitter is unchanged.
No network, commit, push or git configuration changes were needed. Real Word for
Windows retesting of the load error, shortcuts and selection recovery remains.

**Released v1.0.3 (2026-11-02):** published to gh-pages, GitHub release v1.0.3 with
`read-aloud-plus-install.zip` (manifest URLs identical to v1.0.1, Version 1.0.3.0).
Round-5 Windows test prompt: `testing/windows-e2e-round5-codex-prompt.md` (uses
`testing/fixtures/sample.docx` and `sample-long.docx`). Before round 5, run
`install.cmd` from the v1.0.3 zip so the new manifest is in place.

## Windows test round 5 (2026-11-02)

Real Windows tested **v1.0.3**. Passes: no load errors, P/Up/Down/X shortcuts,
sentence-start reading (including “after” in sample-long.docx), and Pause/Stop
buttons and shortcuts. The changes below prepare **v1.0.4**; they have been
verified locally, **not in real Word for Windows**.

- **1 — Previous counted speech chunks. Confirmed root cause:** the pane passed
  `splitSentences(text, 300)` directly to the player, navigation and status. The
  long sample sentence occupies two chunks, so moving backward one chunk can
  stay in that sentence. JS now first splits without a speech-length limit, then
  chunks each sentence, keeping a sentence number for every chunk and preserving
  exact text/offsets. Status counts sentences and Now reading shows the whole
  sentence. Previous always starts sentence N−1, with **no restart-current grace**;
  Next starts N+1, both clamped at the ends. Speech still advances through all
  chunks naturally. No stale separate navigation index was found: the player's
  current chunk index is updated synchronously. The existing attempt-token guard
  invalidates callbacks before cancel; tests now deliver end/error from cancel
  both synchronously and asynchronously during Previous and Next. Tests also
  load real sample.docx text and check Previous from either long-sentence chunk
  onto the second copy of the repeated sentence, including pending Word work.
- **2 — Word batching/cache:** `read()` previously waited for queued cleanup but
  then called Word.run outside the queue, leaving a path for overlapping batches.
  All Word.run calls now go through one queue, including reading/sentenceStart,
  selection, yellow restore and cleanup. Superseded pending highlights skip Word
  entirely; generation checks also protect in-flight work. Cached search-result
  proxies have been removed: each active highlight maps fresh in its own batch,
  with one retry after an exception (including GeneralException). Prefix mapping
  and selection verification now expand through a nonempty range and subtract
  its text length, avoiding expansion between identical collapsed points at
  offset zero. The old ranges were already `.track()`ed; missing tracking was
  **not** established as the cause. Also, `remapped` on a first visit was normal:
  that index had no cached range yet. Thus the screenshots alone cannot prove
  cache failure. The exact real-host GeneralException trigger remains unverified;
  Diagnostics now says `position-search` and logs each attempt, retry and error.
- **3 — repeated fillers:** round 4 already searched by expected prefix length,
  rather than taking the first text match. We retain that position requirement
  with fresh ranges, additionally check match text, and verify visible selection
  text, offset and containment in the reading range. A mismatched selection is
  collapsed to the original bookmark before retry; a missing match also clears
  the old selection and reports `not-found`. Tests use 90 identical fillers with
  skipped/reverse requests and persistent wrong-duplicate selection. This
  addresses stale selection/batch failure paths without claiming the Windows
  symptom was reproduced on Linux. The existing long-chunk selection prefix
  limit (up to 250 escaped search characters) remains.
- **4 — cold Home button:** reviewed the task-pane VersionOverrides V1_0,
  OfficeTab TabHome, unique Group/Control/resource IDs, packaged icons,
  SharedRuntime 1.1, long Runtime and shared FunctionFile URL. No concrete
  manifest defect was identified. A V1_1 override is not a justified fix for this
  Word task-pane manifest; the manifest is unchanged apart from the build's
  Version 1.0.4.0. There is no AutoShow/startup code. Considered
  `Office.addin.setStartupBehavior(load)` after first open, but it requires an
  already activated runtime and cannot guarantee cold command registration;
  automatic startup is therefore not enabled. The tested developer-registry
  sideload required Home → Add-ins → Developer Add-ins → Read Aloud+ once before
  its Home button appeared. INSTALL.md now leads with those steps and explains
  they may be needed after each cold open. Whether this is inherent to that Word
  build's registry sideloading remains unconfirmed; **no cold-start fix or new
  Windows result is claimed**. Cache clearing did not solve it in round 5.
- **5 — event log:** Diagnostics keeps a 40-entry circular buffer with elapsed ms
  and local HH:MM:SS.mmm. It records commands with source and before/after sentence
  numbers, utterance start/end/error/cancel/pause/resume, select requests/results
  with sentence/chunk, method/error/retry, and changed status text. Raw canceled
  utterance events remain visible even when the player correctly ignores them.
  Command and engine timestamps expose pause/cancel latency. Log rendering happens
  only while Diagnostics is open (or when opened); logging makes no Word calls.
  Copy log includes version, summary and events, tries navigator.clipboard then
  textarea/execCommand, and reports Copied or an error. Tests cover timing/cap,
  button/shortcut logging, hidden rendering, summary copying and fallback failures.

Local verification: **130 JS tests passed, 0 failed** with
`cd addin && node --test --test-isolation=none test/*.test.mjs`.
`BASE_URL=https://larok00.github.io/word-tts npm run build` passed.
`~/.bend/bin/bend bend/splitter_test.bend`: **27 passed, 0 failed**.
The packaged `addin/dist/install/manifest.xml` has Version **1.0.4.0** and the
same URL sequence as v1.0.3, with no query strings. **No bend/ source changed**;
the regenerated compiled splitter is unchanged. No network, commit, push or git
configuration changes were made. Windows retesting is still needed for desktop
range reliability, latency, clipboard and cold ribbon activation.

**Released v1.0.4 (2026-11-02):** published to gh-pages, GitHub release v1.0.4 with
`read-aloud-plus-install.zip` (manifest URLs unchanged, Version 1.0.4.0). Codex prompt:
`agent-prompts/07-round5-fixes.md`. Next Windows retest:
`testing/windows-e2e-round6-codex-prompt.md` (judged mainly from the Diagnostics event log).

## Krystof feedback (v1.0.6)

The v1.0.5 beta received word boundaries but every word selection failed in real
Word. It saved search collection items for later batches; tracking the item did
not keep its parent collection alive. Word bookmarks now use standalone range
copies and flush tracking before the batch ends. A failed word selection retries
once with a fresh search inside the chunk, preserving repeated-word positions.
Persistent failures leave the existing selection in place without repeated sentence
selection. Diagnostics keeps the first Office error's code, message and failing
call, then counts failures in the chunk summary. A stricter mock reproduces the
released-collection failure; real Word still needs a v1.0.6 retest.

Krystof used v1.0.4 on a real multi-page English document in Word for Windows.
His log showed successful position searches and normal completion. These fixes
are verified with mocks locally; they are not a claim of a new Windows test.

- **Stop and finish:** Stop restored the selection saved at Play time, which made
  Word scroll several pages back and overwrote any new selection made while paused.
  Finish previously only removed yellow; it did not restore that bookmark itself.
  Stop, pane hide and pagehide now collapse only an add-in-owned sentence or word
  selection to the current sentence's start, including after Previous or in a later
  speech chunk. Finish collapses to the end of the last chunk read. A user's own
  selection is kept. Endpoint comparisons avoid guessing ownership from matching
  words. Logs say `stop/finish selection=kept-user` or `collapsed sentence=N`.
  Tests also cover Stop while a selection has already been sent to a slow Word batch.
- **Lost selection and scrolling:** missing searches and failed verification both
  explicitly selected the original start. That explains the repeated jumps without
  an audio failure. Those selections are gone; misses keep the previous selection
  and yellow, and report `selection lost ... recovery=kept-previous`. Mapping tries
  an exact offset first, then the nearest forward candidate to the expected offset
  plus the last successful drift correction. Previous allows backward mapping.
  Selection verification compares actual range endpoints and normalized text,
  rather than requiring Word's expanded text lengths to equal a frozen snapshot.
  Tests simulate expanded prefixes that are three characters longer, a search miss,
  and later recovery (`match=nearest/drift drift=+3`). Fields, hidden text, controls,
  objects or paused edits are plausible sources of drift, not proven diagnoses of
  his document. Search uses safe nonempty literal segments around Word control
  characters, including tabs, manual line breaks, cell marks and soft hyphens.
- **Partial sentences:** the old search prefix limit also limited the selection.
  Mapping now finds a prefix and a safe suffix and expands between them, checking
  the full normalized chunk. The suffix search starts after the prefix so repeated,
  overlapping text cannot hide the correct end. Missing or mismatched ends retain
  a prefix selection with an explicit fallback log. Speech still uses chunks of up
  to 300 characters; each complete chunk is selected, not the entire sentence across
  multiple chunks. Tests cover long chunks, repeated suffixes, tabs/manual line breaks
  and a missing end match.
- **Follow each word:** a new saved checkbox defaults on. Player forwards only word
  boundaries from its active speech attempt and derives missing/zero word lengths.
  WordReader caches tracked word ranges with offsets (including repeated words and
  local offset correction). Word selection shares the existing serialized queue;
  newer word/chunk requests discard stale pending words without holding up speech.
  Without events the full chunk stays selected; unmapped words fall back to that
  chunk. Yellow stays on the chunk beneath selected words. Diagnostics reports
  boundary delivery for the current voice. The log records the first event, failures,
  and one `words highlighted=K of M` summary per chunk, including missing events.
  Help and installation notes describe the option.

Verification for v1.0.6: **156 JS tests passed, 0 failed** with
`cd addin && npm test`; `npm run build` passed.
The packaged `addin/dist/install/manifest.xml` has Version **1.0.6.0**;
manifest URLs remain query-string-free. The footer shows **Read Aloud+ v1.0.6**.
**No bend/ files changed**; the generated JavaScript splitter is unchanged.
No network, commit, push or git configuration changes were made.

Only real Word on Windows can confirm which of Krystof's voices emit usable word
boundaries, what causes text-length drift in his document, and the actual scrolling
behaviour during reading, Previous, pause/edit, Stop, finish and pane close.

## v1.0.6 release (2026-11-03)

Koral tested the v1.0.6 beta by hand in real Word for Windows (voice Microsoft George
en-GB): all checks passed, including word-by-word highlighting. The word fix above is
therefore confirmed on real Word; Krystof's own voices and document are still untested.

- master: merge commit 51730df (fix/krystof-feedback into master, no force push).
- Root site published with `scripts/publish-public.sh` (gh-pages 2416148). The publisher
  replaces the whole snapshot, so the temporary `beta/` folder is removed (beta URLs now
  404). Live root: manifest Version 1.0.6.0, footer "Read Aloud+ v1.0.6", new word.js;
  every manifest URL and script returns 200 and no manifest URL has a query string.
- Release: https://github.com/larok00/word-tts/releases/tag/v1.0.6 with
  `read-aloud-plus-install.zip` (ReadAloudPlus/install.cmd, uninstall.cmd, manifest.xml).
- Existing installs: the 1.0.4 and 1.0.6 manifests differ **only** in `<Version>`;
  install.cmd and uninstall.cmd are byte-identical. Every URL (SourceLocation, icons,
  help, shortcuts, AppDomain) is the same root URL, and the code is fetched from the site,
  so Krystof does not need to reinstall: fully close and reopen Word. The stale
  1.0.4.0 Version in his sideloaded manifest is harmless (it only describes the manifest;
  the footer shows the hosted code's version). If the footer still shows v1.0.4 after a
  full restart, close Word and clear `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`.
- Koral's PC: `%LOCALAPPDATA%\ReadAloudPlus\manifest.xml` is the v1.0.6 release manifest
  (root URLs); the beta one is kept as `manifest-beta-1.0.5.xml`, the old one as
  `manifest-1.0.4.xml` (the registry points only at manifest.xml).
