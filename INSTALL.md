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
Code changes published to the same URL are picked up the next time the panel opens
(the service worker updates in the background, so occasionally it takes one extra reopen):
```bash
cd addin
BASE_URL=https://larok00.github.io/word-tts CONFIRM=yes ./scripts/publish-public.sh larok00/word-tts
```
This tests, builds and pushes `dist/` as a new commit on `gh-pages`, and Pages
redeploys within about a minute. Only a change to the **manifest** (name, icons,
buttons, shortcuts, permissions, URL) needs a new zip and a reinstall. Bump
`<Version>` in `manifest.template.xml` when you do.

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
4. Open Word. On the **Home** tab, at the right-hand end, click **Read Aloud+**.
   - Don't see it? Click **Home → Add-ins** (or **Insert → Get Add-ins → My Add-ins**),
     look under **Developer Add-ins**, and pick **Read Aloud+**.
   - The first time, Word may ask whether to trust/start the add-in: choose yes.
5. The Read Aloud+ panel opens on the right.

### B2. Use it
- Select some text, or just click where you want to start, then press **▶ Play**.
  With nothing selected, it reads from the cursor to the end of the document.
- **Pause/Resume**, **Stop**, **◀ Previous** / **Next ▶** sentence.
- **Speed**: slider or the big **−** / **+** buttons. Speed and voice are remembered.
- The sentence being read is selected in the document, so it's easy to follow. Tick
  "Highlight in yellow instead" if you prefer. The original highlighting is put back
  afterwards.
- **Keyboard shortcuts**, which work while typing in the document (after the panel
  has been opened once in that Word session):
  - Ctrl+Alt+Shift+P: play / pause
  - Ctrl+Alt+Shift+S: stop
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

## Troubleshooting
| Problem | Fix |
|---|---|
| Panel says it can't load / is blank | Check internet (the very first load needs it). Close and reopen Word. If it persists, re-run `install.cmd` and answer **Y** to clear the cache. |
| No voices listed | Add a voice (B3), restart Word. |
| Speech stops in the middle | It should recover by itself (it retries, then switches voice). Press Play again. Tell Koral which voice was selected. |
| Shortcuts do nothing | Open the panel once (Home → Read Aloud+). Shortcuts need Word 2408+. |
| Word's own Read Aloud is back | Both can be used. Read Aloud+ doesn't depend on it. |

## What's only verifiable on Windows (Koral's test checklist)
Everything in `addin/` has unit tests, builds and validates on Linux, but these need
a real Windows + Word session:
- [ ] Install via `install.cmd`; the Home-tab button appears.
- [ ] Voices list shows Windows voices marked (offline); Play speaks.
- [ ] Pause/Resume/Stop/Prev/Next and the speed controls work while speaking.
- [ ] Sentence selection follows speech (try repeated sentences and long ones).
- [ ] Yellow mode restores original highlighting (including pre-highlighted text).
- [ ] Keyboard shortcuts work with focus in the document.
- [ ] Closing and reopening the panel works. Pull the network cable and reopen the panel
      (offline cache, best effort).
- [ ] Reading a 20+ page document stays smooth.
