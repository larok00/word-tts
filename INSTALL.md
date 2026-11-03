# Installing Read Aloud+ (Word add-in)

Two parts:

- **Part A**, done by Koral once: put the add-in's web files online and build the
  install package.
- **Part B**, done on the friend's PC (about 5 minutes; Koral can talk him through it).

Assumes the friend's own Windows 10/11 PC with up-to-date Microsoft 365 Word desktop
(version 2408 or newer for the keyboard shortcuts).

---

## Part A: hosting (done 2026-11-01) and updates

The add-in is a small web page that Word shows in a side panel, so it must be served
over HTTPS. It's hosted on **GitHub Pages from this (public) repo**:

- Live site: `https://larok00.github.io/word-tts/` (e.g. `.../taskpane.html`, `.../manifest.xml`)
- Served from the **`gh-pages` branch** (built files only). `master` holds the source.
- Ready-made install zip for the friend: the **GitHub release**
  <https://github.com/larok00/word-tts/releases/latest>, file `read-aloud-plus-install.zip`.

### Publishing an update (no reinstall needed)
After an update, fully close Word and reopen it. The pane footer shows the running
version (for example **Read Aloud+ v1.0.5**); check it before testing. App files use
network-first caching with an offline fallback:
```bash
cd addin
BASE_URL=https://larok00.github.io/word-tts CONFIRM=yes ./scripts/publish-public.sh larok00/word-tts
```
This tests, builds and pushes `dist/` as a new commit on `gh-pages`, and Pages
redeploys within about a minute. Only a change to the **manifest** (name, icons,
buttons, shortcuts, permissions, URL) needs a new zip and a reinstall. Set the release
`version` in `addin/package.json`; the build stamps the manifest Version and pane assets; manifest URLs stay stable.

### Rebuilding the install zip
```bash
cd addin && npm ci && BASE_URL=https://larok00.github.io/word-tts npm run build && npm run validate
# then zip the folder addin/dist/install/ (install.cmd, uninstall.cmd, manifest.xml)
```

### Alternatives (not used)
- `hosting/pages.yml` is a manual GitHub Actions workflow that does the same as the
  script. To use it, copy it to `.github/workflows/`, which needs a token with
  `workflow` scope (`gh auth refresh -s workflow`), and switch Pages' source to "GitHub Actions".
- Any other HTTPS static host works: build with that `BASE_URL`.

---

## Part B: on the friend's PC

### B1. Install
1. Download `read-aloud-plus-install.zip` (from Koral, or from the release link above), right-click it → **Extract All…** → Extract (for example to the Desktop).
2. **Close Word** completely.
3. Open the extracted `ReadAloudPlus` folder and **double-click `install.cmd`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**.
     The script isn't code-signed. All it does is copy one file and add one
     per-user setting, and it doesn't need administrator rights.
   - Press a key when asked. When it asks *"Clear cache? [Y/N]"*, press **N**
     (only press Y if the add-in doesn't show up later).
4. Open Word. Choose **Home → Add-ins → Developer Add-ins → Read Aloud+**.
   On the tested PC, this activation makes the Home-tab Read Aloud+ button appear.
   If the button is already there, you can click it directly.
   - Don't see it? Click **Home → Add-ins** (or **Insert → Get Add-ins → My Add-ins**),
     look under **Developer Add-ins**, and pick **Read Aloud+**.
   - The first time, Word may ask whether to trust/start the add-in: choose yes.
5. The Read Aloud+ panel opens on the right.

**Home button missing after restarting Word:** the round-5 Windows test found that
this developer-registry installation did not show its Home button until the add-in
was opened once. Use **Home → Add-ins → Developer Add-ins → Read Aloud+** again
after a cold open if needed. Clearing the Wef cache did not fix this in that test.
The manifest review found no definite fix; v1.0.4 has not been retested on Windows.
Automatic startup has not been enabled: it runs only after Office activates the
add-in, so it cannot guarantee the missing ribbon button appears.

### B2. Use it
- Select some text, or just click where you want to start, then press **▶ Play**.
  With nothing selected, it reads from the beginning of the sentence containing
  the cursor to the end of the document.
- **Pause/Resume**, **Stop**, **◀ Previous** / **Next ▶** sentence.
- **Speed**: slider or the big **−** / **+** buttons. Speed and voice are remembered.
- The sentence being read is selected in the document, so it's easy to follow. Tick
  "Highlight in yellow instead" if you prefer. The original highlighting is put back
  afterwards.
- **Keyboard shortcuts**, which work while typing in the document (after the panel
  has been opened once in that Word session):
  - Ctrl+Alt+Shift+P: play / pause
  - Ctrl+Alt+Shift+X: stop
  - Ctrl+Alt+Shift+→ / ←: next / previous sentence
  - Ctrl+Alt+Shift+↑ / ↓: faster / slower
  - When the panel itself has focus: Space, Esc, ← →, + −.
  - If Word reports a shortcut clash, it asks which action to keep.

### B3. Better voices (optional, recommended)
Read Aloud+ uses the voices installed in Windows, and **offline voices are used by
default**, so it keeps working without internet and without Microsoft's Read Aloud
service. To add more: **Settings → Time & language → Speech → Manage voices → Add
voices** (for example English (United Kingdom)). Restart Word afterwards. Untick "Only
show offline voices" in the panel to also see online voices (nicer, but they need
internet).

### Uninstall
Close Word, double-click `uninstall.cmd` from the same folder.

---

## Reporting a reading problem

Open **Diagnostics** in the pane and click **Copy log**. When it says **Copied**,
paste it into your message to Koral. It includes the version, start/highlight summary
and the last 40 events, with elapsed milliseconds and clock time. Commands show
button/shortcut, and sentence numbers before and after; speech and selection events
help explain delays. Highlight diagnostics explicitly label the internal chunk
number; one long sentence can have several chunks. If copying fails, the error
appears beside the button; select and copy the visible log manually.

## Troubleshooting
| Problem | Fix |
|---|---|
| Panel says it can't load / is blank | Check internet (the very first load needs it). Close and reopen Word. If it persists, re-run `install.cmd` and answer **Y** to clear the cache. |
| Old behaviour after an update | Fully close Word and reopen it. Check the version in the pane footer; expand Diagnostics to report the version, start method, highlight outcome and any error. Reinstall the new manifest if the footer is still old. |
| “Failed to install or load a required resource” / “This add-in is no longer available” | After updating, fully close Word, delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` (Office’s add-in cache; safe to clear, it is rebuilt), and reopen Word. |
| Home button missing on a cold open | Open Home → Add-ins → Developer Add-ins → Read Aloud+ once. This was required on the round-5 test PC. |
| No voices listed | Add a voice (B3), restart Word. |
| Speech stops in the middle | It should recover by itself (it retries, then switches voice). Press Play again. Tell Koral which voice was selected. |
| Shortcuts do nothing | Open the panel once (Home → Read Aloud+). Shortcuts need Word 2408+. |
| Word's own Read Aloud is back | Both can be used. Read Aloud+ doesn't depend on it. |

## What's only verifiable on Windows (Koral's test checklist)
Everything in `addin/` has unit tests, builds and validates on Linux, but these need
a real Windows + Word session:
- Run the installer outside Codex’s Windows sandbox: registry/file installs inside
  that sandbox do not reach the real system; the test install had to be redone outside.
- Start Word normally. COM automation (`/Automation -Embedding`) does not load add-ins.
- [ ] After updating, fully close and reopen Word; check the pane footer version and Diagnostics.
- [ ] Install via `install.cmd`; check the Home button on a cold open, then activate via Developer Add-ins if missing.
- [ ] Diagnostics → Copy log copies the version, summary and timed events.
- [ ] Voices list shows Windows voices marked (offline); Play speaks.
- [ ] Pause/Resume/Stop/Prev/Next and the speed controls work while speaking.
- [ ] Sentence selection follows speech (try repeated sentences and long ones).
- [ ] Yellow mode restores original highlighting (including pre-highlighted text).
- [ ] Keyboard shortcuts work with focus in the document.
- [ ] Closing and reopening the panel works. Pull the network cable and reopen the panel
      (offline cache, best effort).
- [ ] Reading a 20+ page document stays smooth.

“Follow each word” is on by default and is saved between sessions. Voices with word
timing events select each spoken word; other voices keep the sentence selected.
Yellow mode keeps the sentence yellow under the selected word. Stop leaves the cursor
at the current sentence start, and finishing leaves it at the end; a selection you
made yourself is left alone. Diagnostics reports whether the current voice sent word events.
