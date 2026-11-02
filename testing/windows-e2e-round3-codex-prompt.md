# Windows end-to-end test, round 3 (retest the round-2 fixes)

Paste into a FRESH Codex chat on the Windows PC, with computer use on.

---

You are retesting "Read Aloud+" v1.0.1, a Word task-pane add-in (repo:
https://github.com/larok00/word-tts; see NOTES.md for the round-2 findings).
It is ALREADY INSTALLED. Do NOT install, uninstall, or edit the registry,
manifest, Word settings, or any document other than the test files below. Don't
push to the repo. Drive the real Word window with computer use, not COM automation.

USAGE LIMIT: if you hit your usage limit or see any message about credits, STOP
immediately and write what you have. Don't continue on credits.

Folder: %USERPROFILE%\Downloads\read-aloud-plus-test (sample.docx is there). Write
REPORT-round3.md and step screenshots (step01.png, ...) there.

If Word is open, close it fully first so it loads the new manifest, then open
sample.docx from File Explorer and open the panel from Home > Read Aloud+.

1. On load: does Word still show "Add-in Read Aloud+ failed to install or load a
   required resource"? Record the exact text if so.
2. Stop shortcut is now Ctrl+Alt+Shift+X (with focus in the document). Start
   reading, press it: reading stops, and no Word dialog about conflicting
   shortcuts appears. Also recheck Ctrl+Alt+Shift+P (play/pause) and +Right / +Left.
3. Previous: while reading sentence N, press Previous (button, then shortcut).
   The selection must move to exactly sentence N-1 (use the "Reading sentence
   X of Y" status). Repeat for Next: N+1.
4. Click into the middle of the word "happens" in "Something else happens in
   between." and press Play: the selection must start at "Something", not mid-word.
5. Pause, then Resume: the status must stop saying "Paused" right away.
6. Repeated sentence: when "This sentence appears twice in the document." is read
   the second time, the SECOND copy must be selected.
7. Long document: make sample-long.docx by copying sample.docx in File
   Explorer (Ctrl+C, Ctrl+V), open it, and use Word's Insert > Text from File (or
   repeated paste) until it's 20+ pages (check the page count in the status bar).
   Click on page 15, press Play, and check that pause and stop react within about
   a second.

Finish REPORT-round3.md with a pass/fail table per step, exact error text, and
anything you could not verify.
