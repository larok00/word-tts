# Windows end-to-end test: prompt for Codex on a Windows PC

Paste everything below the line into Codex running on a Windows PC that has
desktop Microsoft Word (Microsoft 365) installed. Codex handles setup and the
automatable checks; the listening and clicking checks are left to the human
and are written as a short checklist at the end of the report.

---

You are testing "Read Aloud+", a Word task-pane add-in. Repo:
https://github.com/larok00/word-tts (read INSTALL.md, CODE_TOUR.md and
addin/manifest.template.xml first). The add-in is hosted at
https://larok00.github.io/word-tts/ and the installer zip is
https://github.com/larok00/word-tts/releases/download/v1.0.0/read-aloud-plus-install.zip

Rules: do not change Word's global settings beyond what install.cmd does, do not
edit any of my existing documents, do not push to the repo. Work in a new folder
%USERPROFILE%\read-aloud-plus-test. Write everything you find to
%USERPROFILE%\read-aloud-plus-test\REPORT.md as you go.

1. Environment: record the Windows version, the Word version and build
   (registry or `winword.exe` file version), and whether WebView2 runtime is installed
   and which version.
2. Voices: list installed speech voices (SAPI via PowerShell
   System.Speech, plus OneCore voices under
   HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens). Speak one short test
   sentence with System.Speech so the human can confirm audio works at all.
3. Hosting: confirm every URL in the downloaded manifest.xml returns 200 over
   HTTPS from this PC.
4. Install: download and extract the zip, run install.cmd exactly as a user
   would (close Word first). Record what it changed (registry keys / the shared
   folder catalog it created) so it can be undone with uninstall.cmd.
5. Word: create a NEW test document %USERPROFILE%\read-aloud-plus-test\sample.docx
   (via Word COM automation) with ~3 pages of mixed text: abbreviations
   (Mr. Smith, e.g., Dr.), decimals (3.14), an ellipses..., quotes, a repeated
   sentence twice, one sentence over 300 characters, and one paragraph that is
   already highlighted yellow. Open it in Word, visible.
6. Check whether Word loaded the add-in: look for the Read Aloud+ button on the
   Home tab via UI Automation, and check the Office add-in/WEF cache folders under
   %LOCALAPPDATA%\Microsoft\Office\16.0\Wef for the manifest. If you can open
   the task pane via UI Automation, do it and record what you can read from it
   (voice list contents, any error text). If you can't drive it, say so and stop
   there rather than guessing.
7. Collect any errors: Office add-in logs/runtime logging if available, and the
   Windows Event Viewer Application log entries from Word in the last hour.
8. Finish REPORT.md with: what passed, what failed (with exact error text),
   what you could not verify, and a short checklist for the human to do by hand
   (Play speaks; Pause/Resume/Stop/Prev/Next; speed slider; sentence selection
   follows speech including the repeated and long sentence; yellow mode restores
   the pre-highlighted paragraph; Ctrl+Alt+Shift shortcuts with focus in the
   document; close/reopen the panel; offline reopen with Wi-Fi off; a 20+ page
   document stays smooth).
