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
