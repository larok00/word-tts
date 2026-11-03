# Windows end-to-end test, round 7 (short check of the v1.0.5 beta: Krystof's bugs)

Paste into a FRESH Codex chat on the Windows PC, with computer use on. About 15 minutes.

---

You are doing ONE short test of "Read Aloud+" **v1.0.5 beta**, a Word task-pane add-in
(repo https://github.com/larok00/word-tts, branch fix/krystof-feedback; see NOTES.md
"Krystof feedback (v1.0.5)"). The beta manifest is ALREADY in place at
%LOCALAPPDATA%\ReadAloudPlus\manifest.xml (it points to
https://larok00.github.io/word-tts/beta/). Do NOT install, uninstall, or edit the registry,
manifest, Word settings, or any document other than the test file. No code changes, no
pushes. Drive the real Word window with computer use, not COM automation. Keep it brief.

USAGE LIMIT: if you hit your usage limit or see any message about credits, STOP
immediately and write what you have. Don't continue on credits.

Folder: %USERPROFILE%\Downloads\read-aloud-plus-test. Use the existing sample-long.docx
there (27 pages; "PAGE FIFTEEN MARKER" at the top of page 15). Only if it is missing,
download https://raw.githubusercontent.com/larok00/word-tts/master/testing/fixtures/sample-long.docx
into that folder. Don't save changes to it. Write REPORT-round7.md there, plus a few
screenshots (r7-01.png, ...) only where noted.

After every action wait about 2 seconds, then take a FRESH screenshot before judging.
Shortcuts (click ordinary document text first so focus is in the document):
Ctrl+Alt+Shift + P (play/pause), X (stop), Left/Right (previous/next sentence).

0. Setup: close Word fully (no WINWORD.EXE in Task Manager). Delete the CONTENTS of
   %LOCALAPPDATA%\Microsoft\Office\16.0\Wef\ (not the folder itself). Open
   sample-long.docx from File Explorer. Open the pane (Home tab Read Aloud+ button, or
   Home > Add-ins > Developer Add-ins > Read Aloud+). The pane footer MUST say v1.0.5
   (screenshot r7-01.png). If it says v1.0.4 or the pane fails to load, record the exact
   text and STOP. In the pane, make sure "Follow each word" is ON and pick an English
   voice (an Australian one, en-AU, if listed; record the voice name).

a) Stop must not jump back. Use Ctrl+G (Go To) > Page 10, close the dialog, click inside
   a sentence in the middle of page 10 and press Play. Let 3-4 sentences play, press
   Pause, press Previous (button) twice, then Stop (button). Expected: Word's view stays
   around page 10 (status bar page number) and does NOT jump to where you clicked earlier
   or to page 1. Record the page number before Stop and after Stop (r7-02.png). Then
   click inside a sentence on page 12 and press Play: reading must start at that
   sentence on page 12. Stop. Repeat the Pause/Previous/Stop part once with the
   shortcuts (P, Left, Left, X).
b) Finish must not jump back. Select (drag) two short sentences somewhere on page 13,
   press Play and let it finish ("Finished reading."). The view must stay on page 13,
   with the cursor at the end of what was read. Record the page (r7-03.png).
c) Full-sentence highlight. Press Ctrl+Home, turn "Follow each word" OFF, click inside
   "This is a deliberately long sentence..." (page 1, about 408 characters) and press
   Play. Speech splits it into two parts of up to 300 characters, so the selection should
   cover the first part completely, then the rest; together they must cover the WHOLE
   sentence through its final full stop (before this fix only about the first 250
   characters were selected). Also check two ordinary sentences after it are fully
   selected. Stop. Screenshot each part (r7-04.png, r7-05.png).
d) Word following. Turn "Follow each word" ON. Go to page 15, click inside the sentence
   after "PAGE FIFTEEN MARKER" and press Play for about 20 seconds. Does the Word
   selection move word by word in step with the voice (lagging by a word or two is OK)?
   Take 2 screenshots a few seconds apart (r7-06.png, r7-07.png). Stop. Open Diagnostics
   and record whether it says "word boundaries: seen" or "not seen", and the
   "words highlighted=K of M" lines in the log. If not seen, try ONE other English voice
   and record the result for both voices.
e) Lost highlight. During all of the above, did the highlight ever disappear while the
   voice kept reading, or did the view ever scroll back to an earlier place by itself?
   Search the log for "selection lost", "fallback", "drift", "error" and quote those lines.

After EACH step a-d: expand Diagnostics, press Copy log and paste the clipboard into
REPORT-round7.md under that step as a code block (the log holds only 40 lines). If Copy
log fails, record its message and transcribe the relevant lines from a screenshot.

Finish REPORT-round7.md with: version shown, voice(s) used, a pass/fail line for each of
a-e with page numbers, the Diagnostics summary text, and anything you couldn't verify.
