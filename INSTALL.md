# Installing Read Aloud+ (Word add-in)

Two parts:

- **Part A**, done by Koral once: put the add-in's web files online and build the
  install package.
- **Part B**, done on the friend's PC (about 5 minutes; Koral can talk him through it).

Assumes the friend's own Windows 10/11 PC with up-to-date Microsoft 365 Word desktop
(version 2408 or newer for the keyboard shortcuts).

---

## Part A: Koral, one-time setup

An Office add-in is a small web page that Word shows in a side panel, so its files
must be served over **HTTPS**. Code lives in the private repo
`github.com/larok00/word-tts`.

### A1. Choose where to host the files (⚠️ your decision)

GitHub Pages can't serve a **private** repo on the free plan. Pick one:

| Option | What you do | Cost | Notes |
|---|---|---|---|
| **1. Separate public repo (recommended)** | Create an empty **public** repo `larok00/read-aloud-plus`, then run the publish script below | Free | Only the built web files are public. The source stays private. Add-in URL: `https://larok00.github.io/read-aloud-plus` |
| 2. Make `word-tts` public | Repo Settings → General → Change visibility → Public. Copy `hosting/pages.yml` to `.github/workflows/pages.yml` and push it (pushing a workflow needs a token with `workflow` scope, e.g. run `gh auth refresh -s workflow` first). Then go to Settings → Pages → Source: **GitHub Actions**, and run the **Deploy add-in to GitHub Pages** workflow (Actions tab → Run workflow) | Free | All code becomes public. URL: `https://larok00.github.io/word-tts` |
| 3. GitHub Pro | Upgrade, then the same as option 2 but the repo stays private (the Pages *site* itself is still public) | Paid | |

The add-in is just static files (no server, no secrets), so the published files being
public is fine.

#### Option 1 step by step
```bash
# on the box (or any machine with git + node), from the repo root:
gh repo create larok00/read-aloud-plus --public --description "Read Aloud+ Word add-in (static files)"
cd addin
CONFIRM=yes ./scripts/publish-public.sh larok00/read-aloud-plus
```
Then on GitHub: `read-aloud-plus` → Settings → Pages → Source: *Deploy from a branch* →
Branch `gh-pages` / root → Save. After about a minute,
`https://larok00.github.io/read-aloud-plus/taskpane.html` should open in a browser.

### A2. Build the install package for that URL
```bash
cd addin
npm ci
BASE_URL=https://larok00.github.io/read-aloud-plus npm run build   # use your chosen URL
npm run validate      # should say "The manifest is valid."
```
This creates `addin/dist/install/` with three files: `install.cmd`, `uninstall.cmd`
and `manifest.xml`. Zip that folder (e.g. `ReadAloudPlus-install.zip`) and send it to
your friend (email, USB stick, OneDrive...).

> The manifest contains the hosting URL. If you ever change the URL, rebuild and
> reinstall. Code updates published to the **same** URL need **no** reinstall: Word
> picks them up the next time the panel opens.

---

## Part B: on the friend's PC

### B1. Install
1. Save the zip, right-click it → **Extract All…** → Extract (for example to the Desktop).
2. **Close Word** completely.
3. Open the extracted folder and **double-click `install.cmd`**.
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
