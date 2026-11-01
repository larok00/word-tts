You are working in /workspace/projects/word-tts (git repo; do NOT commit, I will review and commit).
Language: **Bend 2** (v2.0.39, binary at ~/.bend/bin/bend; run `export PATH="$HOME/.bend/bin:$PATH"`).
IMPORTANT: Bend 2 is NOT Bend 1. Do not use Bend 1 / HVM syntax (`fold`, `bend x = 0 when`, `switch`, `λ`, `(Foo a b)` constructors, `bend run-rs`). Before writing code, run `bend guide` and read it fully, and use `bend base <Name>` (e.g. `bend base String`, `bend base List`, `bend base Char`) to look up what Base actually provides. Only use functions that exist there. Strings are linked lists of chars.

## Task: a sentence splitter / chunker for a text-to-speech reader

Create `bend/splitter.bend` exposing a pure (non-IO) function:

    def Splitter.split(text: String, max: Nat) -> List<String>   (adapt the exact signature to Bend 2 conventions, e.g. quantities)

Rules:
- Output chunks, concatenated in order, must equal the input EXACTLY (lossless: whitespace, newlines, punctuation all preserved). Each chunk carries its trailing whitespace/newlines.
- Split after sentence-ending punctuation `.`, `!`, `?` (and after any run of closing quotes/brackets right after them: `"`, `'`, `”`, `’`, `)`), when followed by whitespace or end of text.
- Do NOT split after common abbreviations (case-insensitive is fine for the first letter): Mr. Mrs. Ms. Dr. Prof. Sr. Jr. St. vs. etc. e.g. i.e. No. Fig. approx. — and not after single capital initials like "J. K. Rowling".
- Do NOT split inside numbers: "3.14", "1,000.50", "v2.0".
- Ellipsis "..." or "…": split only if followed by whitespace and then an uppercase letter; otherwise keep going.
- A newline sequence containing a blank line (paragraph break, "\n\n", also "\r\n\r\n") always ends a chunk (the newlines belong to the chunk before). A single "\n" also ends a chunk (Word paragraphs arrive as "\r" or "\n" — treat "\r" like "\n").
- If a chunk would exceed `max` characters (max >= 1), break it at the last space before the limit (keep the space at the end of the earlier chunk); if no space, hard-break at max. Never produce empty chunks. Empty input -> empty list.
- Keep it simple and READABLE: the code will be studied by someone learning Bend. Comment generously: a header explaining the algorithm, and a short comment on each def explaining what it does and which Bend concept it uses (pattern matching on lists, recursion, accumulators, Maybe, etc.). Prefer small helper defs. Where there is natural divide-and-conquer (e.g. splitting the text into paragraphs first and processing paragraphs with a balanced parallel recursion), use it and explain in comments how Bend parallelises it; but correctness and clarity come first. If termination checking gets in the way, prefer restructuring over `@unsafe`; if you must use `@unsafe`/`def f?`, comment why.

## Tests
Create `bend/splitter_test.bend` with `main` that runs ~20 cases and prints `PASS name` / `FAIL name` per case plus a summary line `N passed, M failed`. Cases must include: two simple sentences; Mr./Dr./e.g. abbreviations; initials; decimals and 1,000.50; ellipsis both ways; quotes after punctuation ('He said "Hi." Then left.'); ! and ?; paragraphs \n\n and single \n and \r; long sentence forced to split by max; no-space hard break; empty string; trailing text with no punctuation; leading/trailing whitespace.
- For EVERY case also check the lossless law: concat(chunks) == input, and that no chunk is empty and no chunk is longer than max.
- Also add `bend/LAWS.bend` (see `bend guide` on laws) stating the lossless law `concat(split(t, m)) == t` for all t, m. Try to prove it in `bend/PROOF.bend` if feasible within reasonable effort; if a proof is too hard, keep LAWS.bend with the statement, leave a clear comment explaining why it isn't proven yet, and make sure `bend bend/LAWS.bend --check-only` (or whatever checks it) behaves sensibly. Do not spend more than ~25% of your effort on the proof.

## JS module
- Compile: `bend bend/splitter.bend -o addin/src/lib/splitter.bend.mjs` (create dirs). Per the guide, `-o x.mjs` emits an ES module of the non-IO defs that JS can import; Nat crosses as a number; constructors as `{$: "Name", ...}`.
- Write `addin/src/lib/splitter.js` — a tiny ES module wrapper exporting `splitSentences(text, max = 300)` that calls the compiled Bend function and converts Bend Strings/Lists to/from JS strings/arrays. Find out empirically how Bend Strings and Lists are represented in JS (inspect the generated module) and document it in comments.
- Write `addin/test/splitter.test.mjs` using only `node:test` + `node:assert` (no npm deps) that runs the same cases through the JS wrapper, plus a randomised lossless test (e.g. 200 random strings built from letters, spaces, ". ", "Dr. ", "3.14", "\n", "...", '"') and a performance check: a 20,000-character document splits in < 2 s. Run it with `node --test addin/test/`.
- If the Bend JS output turns out to be unusable (broken, needs runtime not available in a browser, too slow: > 2 s for 20k chars), then ALSO write `addin/src/lib/splitter-fallback.js`, a plain JS port of exactly the same rules, make the wrapper use it, keep the Bend version as the reference, and explain precisely why in your final message. Check whether the generated .mjs imports anything Node-only (fs, process, etc.) that would break in a browser/WebView2.

## Final message (concise, < 40 lines)
Files created; exact commands to run Bend tests and JS tests and their results; how Strings/Lists map to JS; whether the law is proven; any Bend 2 surprises/gotchas you hit (syntax you first got wrong, missing Base functions, checker errors) — be specific, this is going into a learning document.
