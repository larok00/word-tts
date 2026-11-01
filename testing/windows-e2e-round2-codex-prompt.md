# Windows end-to-end test, round 2 (Codex drives Word with computer use)

Round 1 showed that installs Codex runs on Windows happen inside its sandbox and
never reach the real system. The add-in has now been installed for real and
Read Aloud+ shows up in Word. This round is pure UI testing: Codex drives Word
with computer use and reports what it sees. A person only listens at the end.

---

You are testing "Read Aloud+", a Word task-pane add-in that reads the document
aloud and selects each sentence as it speaks. Repo: https://github.com/larok00/word-tts
(skim CODE_TOUR.md and addin/src for what the controls do).

It is ALREADY INSTALLED and visible in Word. Do NOT install, uninstall, or edit
the registry, the manifest, Word settings, or any document other than the test
document below. Do not push to the repo. Use computer use (screenshots, mouse,
keyboard) to drive the real Word window, not COM automation: Word opened via
COM does not load add-ins.

Test document: %USERPROFILE%\read-aloud-plus-test\sample.docx (open it by
double-clicking it in File Explorer if it isn't open already). Write results to
%USERPROFILE%\read-aloud-plus-test\REPORT-round2.md as you go, and save a
screenshot for each step next to it (step01.png, step02.png, ...).

You cannot hear audio, so judge speech by what's on screen: the selected sentence
in the document should move forward in step with speech, and the panel's
status/controls should change state. Wait a few seconds between actions and
screenshot before and after.

1. Open the Read Aloud+ panel from the Home tab. Record the voice list contents,
   which voice is selected, and any error text.
2. Put the cursor at the start of the document and press Play. Confirm the
   selection moves sentence by sentence over at least ~20 seconds. Note any
   sentence where it skips, sticks, or selects the wrong text, especially the
   abbreviations (Mr., Dr., e.g.), 3.14, the ellipsis, the repeated sentence
   (the SECOND copy must be selected when it's read the second time) and the
   300+ character sentence.
3. Pause: selection stops moving. Resume: it continues from the same sentence.
4. Next and Previous sentence buttons: selection jumps one sentence each way and
   reading continues from there.
5. Speed slider: move it to the fastest and slowest settings while reading;
   the selection should advance noticeably faster or slower.
6. Stop: reading ends and the panel returns to its idle state.
7. Keyboard shortcuts (Ctrl+Alt+Shift combos, see addin/src) with focus in the
   document body, not the panel: play/pause, next, previous, stop.
8. Yellow highlight mode: turn it on, read across the paragraph that was
   already yellow, then stop. That paragraph must still be yellow afterwards and
   no other text should be left highlighted.
9. Start reading from the middle of a paragraph (click into it first): it
   should start at that sentence.
10. Close the panel and reopen it: controls still work.
11. Make a copy sample-long.docx with the text duplicated to 20+ pages; read
    from page 15 and confirm the panel stays responsive (pause and stop react
    within about a second).

Finish REPORT-round2.md with: a pass/fail table per step, exact error text,
anything you could not verify, and a very short list of things for a person to
check by ear (does it actually speak, is the voice natural, does speed sound
right). Keep that list to 3 items or fewer.
