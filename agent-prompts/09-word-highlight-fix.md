# Codex prompt 09: word-by-word highlight fails on real Word (v1.0.5 beta)

You are working in this repo (Word add-in "Read Aloud+" in addin/). Read NOTES.md ("Krystof feedback
(v1.0.5)" section), addin/src/word.js and addin/test/word.test.mjs first. Keep the existing style:
short teaching comments, small functions. Do not commit or push; do not touch git config; do not touch
bend/. No network is needed. Be efficient: this runs on a limited plan.

## What happened
The maintainer tested the v1.0.5 beta on real Word desktop (Windows, voice Microsoft George en-GB).
Sentence highlighting works, word boundary events arrive, but EVERY word selection fails:

```
Version 1.0.5; start: sentence; highlight chunk: 2 position-search; word boundaries: seen (current voice)
288724 select sentence=1 chunk=1 method=position-search match=exact drift=+0
288729 select result sentence=1 chunk=1 method=position-search error=none
288893 word boundary chunk=1 first
288895 word fallback=sentence reason=GeneralException      (repeated for every word)
291335 chunk=1 words highlighted=0 of 6
```
Note there is no "word fallback=sentence reason=unmapped" line, so `cacheWords()` found and mapped
every word; the failure is in `highlightWord()`'s later `Word.run(this.reading, ...)` batch, at
`range.select()` / `range.getRange()` / `context.sync()` on `word.range`.

## Maintainer's analysis (verify; correct it if wrong)
- `cacheWords()` stores the RAW search-result items (`word.range = found.range; word.range.track()`)
  and reuses them in a later batch. Every other range this file keeps across batches is a standalone
  copy made with `getRange()` before `track()` (pendingSelection, owned, current.range, yellow). On
  real Word, a collection item from `range.search(...).items` is addressed through its (untracked,
  released) RangeCollection, so using it in a later batch throws GeneralException even though
  `track()` was called. Also the `track()` calls in `cacheWords()` are queued after its last
  `context.sync()`; make sure they are flushed (sync) before the batch ends.
- The mock in word.test.mjs does not model this, which is why the tests passed.

## Required changes
1. Root-cause fix in word.js: never keep raw search items across batches. In `cacheWords()` store
   `found.range.getRange()` copies, track them, and `await context.sync()` before returning (respect
   the generation checks). Keep the existing offset/drift matching logic.
2. Robustness: if a word select still throws, retry ONCE in a fresh `Word.run` by re-deriving that
   word's range inside the tracked chunk range (`this.current.range.search(...)` for the word, choosing
   the same occurrence among equal words in the chunk; record each word's occurrence index in
   `cacheWords()`), select it, and replace the stale bookmark (untrack the old one). Only if that also
   fails fall back to the sentence highlight. Never let word work block or reorder sentence work (it
   already uses the single `enqueue` queue; keep that, keep "only newest pending word" coalescing).
   Do not select the whole sentence again on every failed word if it is already selected (avoid
   flicker/scroll); a failed word should just leave the sentence highlight in place.
3. Diagnostics: word failures must log the underlying Office error detail so a log pinpoints the call:
   a helper like `describeError(error)` returning `code`, `message`, `debugInfo.errorLocation` and
   `debugInfo.statement` when present (Office.js OfficeExtension.Error fields), trimmed to ~160 chars.
   Log the full detail for the FIRST word failure in a chunk plus which step failed
   (e.g. `word fallback=sentence step=select-cached code=GeneralException location=Range.select ...`,
   `word retry=fresh-search ok|failed ...`); count later failures in that chunk and include
   `word failures=N` in the existing per-chunk summary line instead of one line per word (the
   Diagnostics history holds only 40 lines). Use the same helper in the other
   `word fallback=sentence reason=...` place and in the sentence `select ... error=` lines.
4. Regression tests in addin/test/word.test.mjs: extend the mock so a search-result item that is
   used (select/getRange/expandTo/compareLocationWith/load) in a LATER Word.run batch than the one that
   produced it throws an Error with code 'GeneralException' and
   `debugInfo: { errorLocation: 'Range.select' }` (like real Word), while `getRange()` copies made in the
   original batch and tracked stay valid. Add tests that: (a) word following highlights all words of a
   chunk (words highlighted=N of N, no fallback lines) under this stricter mock; (b) the pre-fix
   behaviour (raw items) would fail it - e.g. a test that a raw cached item throws in the mock, proving
   the mock models the failure; (c) when word select throws anyway, the fresh-search retry recovers and
   the log contains the code/location detail; (d) persistent failure logs detail once, falls back to the
   sentence without re-selecting per word, and the summary shows `failures=`. All existing tests must
   still pass under the stricter mock (fix the mock or code where earlier tests relied on raw items).
5. Version: bump addin/package.json to 1.0.6 so the footer shows "Read Aloud+ v1.0.6" and the manifest
   Version 1.0.6.0 (build stamping already uses package.json; manifest URLs must stay query-string-free).
   Update NOTES.md (rename the section to "Krystof feedback (v1.0.6)", add a short plain-words
   paragraph on this root cause and the fix, noting the v1.0.5 beta had it), and any user-visible 1.0.5
   mentions in INSTALL.md/help.html that refer to this release.
6. Run `cd addin && npm test` and `npm run build`; all tests must pass. Report briefly: root cause as you
   verified it, files changed, test counts.
