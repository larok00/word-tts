You are working in /workspace/projects/word-tts (git repo; do NOT commit or push; I review and commit). Bend is at ~/.bend/bin/bend (Bend 2.0.39, NOT Bend 1; use `bend guide` / `bend base <Name>` to check anything). Read NOTES.md, addin/README.md and the code first.

The owner (Koral) is LEARNING Bend and will read this codebase to learn how to build real things with Bend and coding agents. Right now the code works and is tested, but it is written too densely. This task is a **readability + teaching pass with NO behaviour changes**, plus two small additions.

## 1. Readability pass on the add-in JS/HTML/CSS (no behaviour changes)
Files: addin/src/**/*.js (except the generated splitter.bend.mjs), taskpane.html, taskpane.css, help.html, addin/scripts/build.mjs, manifest.template.xml, addin/test/*.mjs.
- One statement per line; no `a; b; c` on one line; no single-line `if (...) { ...; ... }` blocks with multiple statements; max ~100 chars per line; consistent 2-space indent. Format HTML/CSS/XML one element/rule per line with indentation.
- Each module starts with a header comment: what this file is for, how it fits the architecture (taskpane.js = UI glue, word.js = Word API, lib/player.js = speech state machine, …), and its main exports.
- Each function/method gets a short doc comment saying what it does and WHY (e.g. why we cancel() before speaking, why the watchdog exists, why tracked ranges, why search strings are ≤250 chars, why generation counters). Explain Office/WebView2 quirks in plain words. Don't comment the obvious.
- Rename cryptic identifiers if needed (keep exported APIs unchanged unless all callers/tests are updated).
- Keep all tests passing: `cd addin && npm test` (60 tests) and `npm run build` and `BASE_URL=https://example.github.io/word-tts npm run build && npm run validate`.
- Small fixes allowed: (a) `addin/scripts/build.mjs` should find `bend` on PATH OR at `$HOME/.bend/bin/bend` (it failed to find it last time) and print which it used; (b) in sw.js, on `activate`, delete caches from older versions except the current and the immediately previous one (keep one previous for an already-open pane), and explain.

## 2. Bend splitter: teaching comments (no behaviour changes)
File: bend/splitter.bend (and splitter_test.bend, LAWS.bend).
- Expand the header into a clear explanation of the algorithm with a tiny worked example (e.g. how `Dr. Who arrived. Then he left.` is scanned char by char and where the cuts happen).
- For each def: what it does, plus a "Bend concept:" line explaining the concept it demonstrates in plain words — e.g. pattern matching on `SNil{}`/`SCon{h, t}` (strings are linked lists of chars), structural recursion and why the checker accepts it as terminating, the `+x` quantity annotation (reusable/copyable values vs affine values used at most once) and why `+` had to be added, `Data` vs `Type` kinds, the `State` record and why ordinary pairs couldn't be used, thunks (`Unit -> String`) to avoid eager evaluation in `Bool.pick`, fuel (`Nat` counting down) to prove termination of `limit`, `<>` list cons, `{x : T}` annotations, `List<&2, String>`. Verify every claim against `bend guide` text; don't invent semantics.
- Explain explicitly why this splitter is sequential (left context dependence), and how one WOULD parallelise (split the text into paragraphs first, then process paragraphs with a balanced divide-and-conquer call — two recursive calls on halves, which Bend runs in parallel — and why that requires balanced calls per the guide).
- **Small optional addition (time-box ~20% of effort):** add `bend/parallel_demo.bend`, a separate, tiny, well-commented program that demonstrates Bend's parallelism on something related, e.g. counting words or sentence-ending characters in a list of paragraphs using balanced divide-and-conquer (two recursive calls whose results are combined), with a `main` that prints the result and checks it equals a sequential version. It must run with `bend bend/parallel_demo.bend`. If you can't get it to pass the checker, leave it out and say why.
- Re-run `bend bend/splitter_test.bend` (must still print 27 passed, 0 failed), recompile `bend bend/splitter.bend -o addin/src/lib/splitter.bend.mjs` and re-run `cd addin && npm test`.

## 3. LEARNING.md (repo root) — Bend concepts part
Write a plain-words guide for Koral (a programmer new to Bend and to functional programming), pointing at the actual code with file:line-ish references (def names): 
1. What Bend 2 is (and that Bend 1/HVM docs and examples online are a different language).
2. How to run things here: `bend file.bend`, `--check-only`, `-o x.mjs`, `bend guide`, `bend base X`.
3. Concepts used in the splitter, each with a short snippet from our code and an explanation: types & constructors, pattern matching, strings as linked lists (and how they appear in JS: native strings; lists as `{$:"Con",head,tail}`), recursion instead of loops, accumulators + reverse, quantities (`+`, `&2`), affinity ("consumed more than once" errors), `Data` records, thunks/laziness, termination & fuel, laws (LAWS.bend) and why ours is unproven, compiling to JS and calling from JS (addin/src/lib/splitter.js).
4. Parallelism: how divide-and-conquer recursion becomes parallel, balanced calls, `!` for GPU, JS target is single-core; point at parallel_demo.bend if you made it.
5. Exercises: 3-5 small suggested changes Koral could make to learn (e.g. add an abbreviation, add a test case, add a law), each with the command to check it.
Leave a clearly marked placeholder heading `## Working with Bend through coding agents` at the end containing only `<!-- AGENT-SECTION -->` — I will write that section.

## 4. Hosting workflow (prepare only; nothing is published)
The add-in's static files must be served over HTTPS. Repo origin is the PRIVATE repo github.com/larok00/word-tts; GitHub Pages on a private repo needs a paid plan, so Koral must decide. Prepare both routes, both **manual-trigger only**:
- `.github/workflows/pages.yml`: `workflow_dispatch` only (no push trigger). Sets up Node 22, runs `cd addin && npm ci && npm test && BASE_URL=${{ vars.BASE_URL || format('https://{0}.github.io/{1}', github.repository_owner, github.event.repository.name) }} npm run build`, uploads `addin/dist` with actions/upload-pages-artifact and deploys with actions/deploy-pages. Uses the committed `splitter.bend.mjs` (no Bend on CI). Comment the file.
- `addin/scripts/publish-public.sh`: builds with `BASE_URL=https://larok00.github.io/read-aloud-plus` (overridable via env) and pushes `addin/dist` to the `gh-pages` branch of a separate PUBLIC repo given as `$1` (default `larok00/read-aloud-plus`) using `git` in a temp dir — the script must refuse to run unless `CONFIRM=yes` is set, and must print what it will do first. Do NOT run it.

## Final message (< 40 lines)
What changed per file group, test results (Bend + JS + validate), whether parallel_demo exists and runs (paste its output), any Bend surprises you hit this time (exact error messages) — those go into the learning doc.
