# word-tts: Read Aloud+ for Microsoft Word

A dependable text-to-speech reader for **Word desktop on Windows**, built as a backup
for Word's own Read Aloud. It's a task-pane add-in that reads the selection, or from
the beginning of the sentence containing the cursor to the end. It has big
Play/Pause/Stop and sentence-skip buttons, a speed
slider, keyboard shortcuts and sentence highlighting, and works with offline Windows
voices.

- **Install:** download `read-aloud-plus-install.zip` from the [latest release](https://github.com/larok00/word-tts/releases/latest), then follow [INSTALL.md](INSTALL.md) Part B
- **Hosted at:** https://larok00.github.io/word-tts/ (GitHub Pages, `gh-pages` branch)
- **Read the code:** [CODE_TOUR.md](CODE_TOUR.md)
- **Learn Bend from it:** [LEARNING.md](LEARNING.md)
- **Decisions & status:** [NOTES.md](NOTES.md)

## Layout
- `bend/`: the Bend 2 sentence splitter (`splitter.bend`), tests, law, parallel demo
- `addin/`: the Word add-in (`src/`), tests, build and manifest
- `install/`: `install.cmd` / `uninstall.cmd` for Windows (copied into the build)
- `agent-prompts/`: the exact Codex prompts that produced the code

## Quick checks (Linux/macOS)
```bash
export PATH="$HOME/.bend/bin:$PATH"
bend bend/splitter_test.bend          # 27 passed, 0 failed
cd addin && npm ci && npm test && npm run build && npm run validate
```
Tooling: Bend 2.0.39, Node 22, Codex CLI 0.166.0.

Document shortcuts (open the pane once per Word session): **Ctrl+Alt+Shift** with
**P** to play/pause, **X** to stop, **Right/Left** for next/previous sentence, and
**Up/Down** for faster/slower. Stop uses X because S opens Word’s Styles pane.
