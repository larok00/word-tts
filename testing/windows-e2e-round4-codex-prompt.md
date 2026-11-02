# Windows end-to-end test, round 4 (retest the round-3 fixes)

Paste into a FRESH Codex chat on the Windows PC, with computer use on.

---

You are retesting "Read Aloud+" v1.0.2, a Word task-pane add-in (repo:
https://github.com/larok00/word-tts; see NOTES.md for the round-3 findings).
It is ALREADY INSTALLED (the v1.0.2 manifest has been copied into place). Do NOT
install, uninstall, or edit the registry, manifest, Word settings, or any document
other than the test files below. Don't push to the repo. Drive the real Word window
with computer use, not COM automation.

USAGE LIMIT: if you hit your usage limit or see any message about credits, STOP
immediately and write what you have. Don't continue on credits.

Folder: %USERPROFILE%\Downloads\read-aloud-plus-test (sample.docx is there). Write
REPORT-round4.md and step screenshots (step01.png, ...) there.

TIMING RULE (screenshots can be stale): for every check below, after the action
wait about 2 seconds, then take a FRESH screenshot before judging. Do each check
3 times (attempt 1/2/3) and record each attempt's result separately. If attempts
disagree, say so; don't average them into a pass.

If Word is open, close it fully first (no WINWORD.EXE left in Task Manager) so it
loads the new manifest, then open sample.docx from File Explorer and open the panel
from Home > Read Aloud+.

0. Version: the pane footer must show "Read Aloud+ v1.0.2". Record the exact text.
   Also open the pane's "Diagnostics" section and record what it shows. If it
   still shows an older version or no version, close Word fully, reopen, and check
   again; record both.
1. Play from mid-word: click into the middle of the word "happens" in "Something
   else happens in between." and press Ctrl+Alt+Shift+P (focus in the document).
   Wait 2 s, fresh screenshot: Word's selection must start at "Something", not
   mid-word, and "Now reading" must show "Something else happens in between."
   Record the Diagnostics start method. Stop (Ctrl+Alt+Shift+X) and repeat, 3
   attempts. Then do it once with the Play button instead of the shortcut.
2. Previous: while reading sentence N (N >= 3), press Previous (button for
   attempts 1-2, Ctrl+Alt+Shift+Left for attempt 3). Wait 2 s, fresh screenshot:
   the status must say sentence N-1 AND Word's selected text must be that same
   sentence (compare with "Now reading"). Record both for each attempt. Do the same
   once for Next (N+1).
3. Resume status: while reading, press Pause, wait 2 s, check the status says
   Paused. Then press Resume (button for attempts 1-2, Ctrl+Alt+Shift+P for attempt
   3), wait 2 s, fresh screenshot: the status must say "Reading sentence X of Y",
   not "Paused".
4. Repeated sentence: when "This sentence appears twice in the document." is read
   the second time, the SECOND copy must be selected (one check is enough).
5. Long document, prepared beforehand: before timing anything, build
   sample-long.docx: copy sample.docx in File Explorer (Ctrl+C, Ctrl+V), rename the
   copy sample-long.docx, open it, select all (Ctrl+A), copy, then press Ctrl+End
   and paste repeatedly until the document is clearly long (at least 20 pages).
   Save (Ctrl+S), close Word fully, and reopen sample-long.docx. (If a
   sample-long.docx from round 3 already exists, you may use it after the same
   save/close/reopen.) Don't rely on the status-bar page count: confirm the length
   with Ctrl+End then Go To (Ctrl+G, Page) or the page number in the tooltip shown
   while dragging the vertical scrollbar. Then use Go To page 15, click inside a
   sentence there, press Play, and check that Pause and Stop react within about a
   second (3 attempts each), and that reading starts at the start of that sentence.

Finish REPORT-round4.md with a pass/fail table per step and attempt, the version
text, the Diagnostics text, exact error text, and anything you could not verify.
