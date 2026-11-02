# Windows end-to-end test, round 6 (retest the round-5 fixes using the event log)

Paste into a FRESH Codex chat on the Windows PC, with computer use on.

---

You are retesting "Read Aloud+" v1.0.4, a Word task-pane add-in (repo:
https://github.com/larok00/word-tts; see NOTES.md for the round-5 findings).
It is ALREADY INSTALLED (the v1.0.4 manifest is in place). Do NOT install,
uninstall, or edit the registry, manifest, Word settings, or any document other
than the test files below. Don't push to the repo. Drive the real Word window with
computer use, not COM automation.

USAGE LIMIT: if you hit your usage limit or see any message about credits, STOP
immediately and write what you have. Don't continue on credits.

Folder: %USERPROFILE%\Downloads\read-aloud-plus-test. Download fresh copies of both
fixtures there (overwrite old ones):
- https://raw.githubusercontent.com/larok00/word-tts/master/testing/fixtures/sample.docx
- https://raw.githubusercontent.com/larok00/word-tts/master/testing/fixtures/sample-long.docx
Write REPORT-round6.md and step screenshots (step01.png, ...) there.

EVENT LOG (main evidence this round): the pane's Diagnostics section has an event log
(last 40 events, each line "<ms since pane load> ms HH:MM:SS.mmm <event>") and a
"Copy log" button. After EACH check below, expand Diagnostics, press Copy log and paste
the clipboard into REPORT-round6.md under that check (paste it as a code block). If Copy
log fails, record its message and transcribe the relevant log lines from a screenshot.
The log holds only 40 lines, so copy it right after each check. Judge N±1 from the
"command ... before=N after=M" lines, and latency from the ms difference between a
command line and the following "utterance cancel"/"utterance pause" line.

TIMING RULE: after every action wait about 2 seconds, then take a FRESH screenshot
before judging what's on screen. Do each check 3 times (attempt 1/2/3) and record
each attempt separately.

FOCUS RULE: before every Word keyboard shortcut, click once on ordinary document text
(not the ribbon, not the pane) so focus is in the document; then press the shortcut.
Shortcuts: Ctrl+Alt+Shift + P (play/pause), X (stop), Right/Left (next/previous),
Up/Down (speed).

0. Cold start / Home button: close Word fully (no WINWORD.EXE in Task Manager), then
   open sample.docx from File Explorer. BEFORE doing anything else, is there a
   Read Aloud+ button on the Home tab? (screenshot). If not, open the pane from
   Home > Add-ins > Developer Add-ins > Read Aloud+ (record which). Record any load
   error text, the pane footer version (must be v1.0.4) and the Diagnostics text.
   Repeat the cold start once more (close Word fully, reopen) and record the Home
   button again.
1. Previous onto the repeated sentence, PAUSED first: click inside the word "happens"
   in "Something else happens in between.", press Play. When Now reading shows the
   long sentence ("This is a deliberately long sentence..."), press the Pause button.
   Then press the Previous BUTTON. Expected: log line "command prev source=button
   before=N after=N-1"; status, Now reading and Word's selection all on "This sentence
   appears twice in the document." (the copy right after "in between."). Copy log.
   3 attempts (press Stop between attempts). Then do the same once with
   Ctrl+Alt+Shift+Left instead of the button (expect source=shortcut).
2. Next/Previous N±1 while paused: pause on any sentence, press Next (button) then
   Previous (button), then Ctrl+Alt+Shift+Right then Ctrl+Alt+Shift+Left. Each must log
   after = before ± 1, and Word's selection must match Now reading each time (note
   especially the repeated filler "Reading aloud should feel smooth and steady.").
   Copy log. 3 attempts.
3. Next/Previous while PLAYING: same as step 2 while reading (buttons and shortcuts).
   Report before/after values from the log. Copy log.
4. Latency on page 15: open sample-long.docx. Ctrl+F, search "PAGE FIFTEEN MARKER",
   close the Find pane, click inside "after" in "This is the sentence after the
   marker.", press Play. Check the selection starts at that sentence. Then Pause
   (button), Play, Pause (shortcut P), Play, Stop (button), Play, Stop (shortcut X).
   From the log, report each command-to-cancel/pause latency in ms. Copy log.
   3 attempts.
5. Errors: in all logs and Diagnostics, does "GeneralException" (or any other error)
   appear? Quote every occurrence with its neighbouring lines.

Finish REPORT-round6.md with a pass/fail table per step and attempt (with the log
before/after numbers and latencies), the Home button result for both cold starts,
the version and Diagnostics text, exact error text, and anything you could not verify.
