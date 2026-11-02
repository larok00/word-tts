# Windows end-to-end test, round 5 (retest the round-4 fixes)

Paste into a FRESH Codex chat on the Windows PC, with computer use on.

---

You are retesting "Read Aloud+" v1.0.3, a Word task-pane add-in (repo:
https://github.com/larok00/word-tts; see NOTES.md for the round-4 findings).
It is ALREADY INSTALLED (the v1.0.3 manifest has been copied into place). Do NOT
install, uninstall, or edit the registry, manifest, Word settings, or any document
other than the test files below. Don't push to the repo. Drive the real Word window
with computer use, not COM automation.

USAGE LIMIT: if you hit your usage limit or see any message about credits, STOP
immediately and write what you have. Don't continue on credits.

Folder: %USERPROFILE%\Downloads\read-aloud-plus-test. Download fresh copies of both
fixtures there (overwrite old ones):
- https://raw.githubusercontent.com/larok00/word-tts/master/testing/fixtures/sample.docx
- https://raw.githubusercontent.com/larok00/word-tts/master/testing/fixtures/sample-long.docx
Write REPORT-round5.md and step screenshots (step01.png, ...) there.

TIMING RULE (screenshots can be stale): after every action wait about 2 seconds,
then take a FRESH screenshot before judging. Do each check 3 times (attempt 1/2/3)
and record each attempt separately. If attempts disagree, say so.

FOCUS RULE: before every Word keyboard shortcut, click once on ordinary document
text (not the ribbon, not the pane) so focus is clearly in the document; then press
the shortcut. Record where you clicked.

Close Word fully first (no WINWORD.EXE in Task Manager), then open sample.docx from
File Explorer.

0. Load: before opening the pane, does Home show a Read Aloud+ button? Open the pane
   from Home > Read Aloud+ (or Developer > Add-ins if absent; record which). Does
   Word show "failed to install or load a required resource" or "Error loading
   add-ins"? Record exact text. Record the pane footer version (must be v1.0.3) and
   the Diagnostics text. ONLY if there is a load error, the footer is not v1.0.3, or
   the Home button is missing: record that first, then do this one recovery (the only
   exception to the no-settings rule): close Word fully, delete the CONTENTS of
   %LOCALAPPDATA%\Microsoft\Office\16.0\Wef\ (not the folder itself), reopen
   sample.docx, and repeat step 0, recording both results.
1. Shortcuts (focus in document, see FOCUS RULE): Ctrl+Alt+Shift+P starts reading;
   P again pauses; P again resumes (status "Reading sentence X of Y", not "Paused");
   Ctrl+Alt+Shift+Right / Left move one sentence; Ctrl+Alt+Shift+Up / Down change
   speed; Ctrl+Alt+Shift+X stops. Record any "ADD-IN ERROR" dialog text verbatim.
2. Previous onto the repeated sentence (round-4 bug): click inside the word
   "happens" in "Something else happens in between.", press Play. When the status
   reaches sentence 3 (the long sentence), press the Previous BUTTON. Fresh
   screenshot: status, "Now reading" AND Word's selection must all be "This sentence
   appears twice in the document." (the copy right after "in between."). Record the
   Diagnostics highlight line. 3 attempts, then once with Ctrl+Alt+Shift+Left.
3. Next/Previous generally: from sentence N, Next then Previous; selection must
   match "Now reading" each time.
4. Long document: open sample-long.docx (25+ pages). Press Ctrl+F and search for
   "PAGE FIFTEEN MARKER", close the Find pane, then click inside the word "after" in
   "This is the sentence after the marker." Press Play: the selection must start at
   "This is the sentence after the marker." (Diagnostics start: sentence). Check
   that Pause and Stop (buttons and shortcuts) react within about a second, 3
   attempts each.

Finish REPORT-round5.md with a pass/fail table per step and attempt, the version
and Diagnostics text, exact error text, and anything you could not verify.
