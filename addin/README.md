# Word Read Aloud+

Plain JavaScript Word task pane for current Microsoft 365 Word on Windows
(WebView2). No runtime npm packages. The existing Bend splitter is preserved.

## Build and install

1. In `addin/`, run `npm install`, `npm test`, then
   `BASE_URL=https://USERNAME.github.io/word-tts npm run build`.
   BASE_URL is the deployed directory containing taskpane.html, without `/src`.
2. Run `npm run validate`. Publish the **contents** of `dist/` to that HTTPS location.
   The localhost default requires a separately supplied trusted HTTPS server.
3. Give the Windows user the complete `dist/install/` folder. It contains the built
   manifest and both command files. Close Word, then double-click `install.cmd`.
   No administrator access or PowerShell is used. Optional cache deletion affects
   all Office web add-ins. Rebuild with the real deployment URL before installation.
4. Reopen Word. Look on Home for Read Aloud+, or My Add-ins → Developer Add-ins.
   Managed Office policies may require help from IT. To remove it, close Word and
   double-click `uninstall.cmd`.

## Reliability and review notes

- Each chunk is a separate utterance. Attempt numbers reject old events; watchdogs
  recover missing completion events. Failed voices fall back to local voices first,
  preferring the same language. Exhaustion pauses for a retry.
- Native pause/resume preserves position when possible. Without speech progress
  events within 1.5 seconds after Resume, the sentence starts again. Rate changes
  also restart it. Voices without boundary events may repeat a sentence on resume:
  SpeechSynthesis has no dependable audio playback signal.
- Word calls never block speech. Select mode changes only the selection. Yellow
  mode changes formatting and can add undo entries; saved colours are restored on
  movement, stop, completion, errors and pane hide. Mixed colours use selection.
  An abrupt Word/process crash cannot run cleanup; select mode is the safest default.
- Word search uses an escaped prefix of at most 250 UTF-16 characters. Long chunks
  select/highlight only that prefix. Paragraph/search quirks or document edits may
  prevent a match; speech continues. Repeated sentences are mapped in order,
  including sentences skipped with Next.
- The service worker caches application files and attempts an opaque office.js cache.
  Office loads additional resources; service worker availability inside Office and
  completely offline Office startup are not guaranteed. First use needs a network.
- A content hash versions the cache. The immediately previous cache is retained for already-open
  panes; older app caches are deleted on activation. Reopen the pane after deployment.
- Document shortcuts require SharedRuntime 1.1 and Word 2408+. Open the pane once
  to register them. Ctrl+Alt+Shift with P/S/Right/Left/Up/Down avoids common bindings;
  Office may still prompt about conflicts with user/custom bindings.

## Windows acceptance checks

Use a disposable document, especially for yellow-mode checks.

- Read a selection and cursor-to-end; test paragraphs, repeated sentences, rapid
  Next/Previous and Stop during loading.
- After initial loading, try offline voices with the network disconnected. Test
  pause/resume, speed changes and an unavailable online voice.
- Check original selection restoration, existing colours including mixed colours,
  yellow cleanup on stop/error/pane close, and undo history in default select mode.
- Open the pane once, focus Word, test all six shortcuts and the Home ribbon button.
  Check keyboard-only controls, screen-reader announcements and high contrast.
- Test standard-user install/uninstall, optional cache deletion, pane reopening
  during a hosting outage, local Word policies, and WebView2 voice availability.

`npm test` uses Node's runner and injected fake timers, including the existing
splitter tests. No browser or Word desktop is available in the development container.

## Manual hosting choices (nothing deployed by setup)

Both routes serve the contents of `dist/` over HTTPS. Choose a route before
building and installing a manifest; its BASE_URL must match the final location.

- **Private source repository Pages:** decide whether the GitHub plan supports
  Pages for this private repository, then enable Pages with GitHub Actions as its
  source. Optionally set the repository variable `BASE_URL`; otherwise the manual
  `hosting/pages.yml` uses the repository's standard Pages URL. Run it
  through Actions → Deploy add-in to GitHub Pages → Run workflow. There is no push
  trigger and CI uses the committed Bend module without installing Bend.
- **Separate public hosting repository:** create `larok00/read-aloud-plus` as a
  public repository, arrange git push authentication and a git commit identity,
  and enable Pages from its `gh-pages` branch/root. Review
  `scripts/publish-public.sh` before manually running
  `CONFIRM=yes ./scripts/publish-public.sh larok00/read-aloud-plus` from `addin/`.
  It tests/builds, prints its destination, then publishes only static output in
  a temporary git checkout. `BASE_URL` can override the default
  `https://larok00.github.io/read-aloud-plus`; change it when changing repositories
  or domains. This script is never invoked by the workflow or ordinary builds.
