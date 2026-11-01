# Learning Bend with Read Aloud+

Koral, start with `bend/splitter.bend`, then its tests, then the JavaScript bridge.
References below use file names and definition names so they survive formatting.
The examples and explanations were checked against this installation's
`bend guide` and `bend base String`, `bend base List`, and `bend base Bool`.

## Which Bend is this?

This repository uses **Bend 2.0.39**. Bend 2 combines typed functional programming,
checked termination, laws and proofs, and explicit parallel calls. Pure functions
compute values; `IO` describes effects such as printing. Python-shaped indentation
does not mean Python execution rules.

Bend 1/HVM articles and examples describe a different language. In particular,
`bend run-rs` and installing HVM are not this project's workflow. Prefer the guide
shipped with the installed Bend 2 compiler over examples found online.

## Running this repository

Use `~/.bend/bin/bend` if your shell cannot find `bend`:

```sh
bend version
bend bend/splitter_test.bend
bend bend/splitter.bend --check-only
bend bend/splitter.bend -o addin/src/lib/splitter.bend.mjs
bend bend/parallel_demo.bend
bend guide
bend base String
bend base List
bend base Bool
cd addin
npm test
npm run build
```

`bend file.bend` checks the file and runs `main` when present. A value-returning
main is normalized and printed by the checker; an IO main runs compiled code.
`--check-only` checks without running main. `-o x.mjs` emits an ES module of
non-IO definitions; do not hand-edit that generated file. `bend base X` prints the
installed library definitions under X, which is useful when syntax or API names
are unfamiliar. A successful executable test suite is different from a proof.

## Types, constructors, and matching

In `bend/splitter.bend`, `State` defines a type and its constructor:

```bend
type State is Data:
  State{acc: String, out: List<&2, String>}
```

The type describes the possible values. The constructor builds one, such as
`State{SNil{}, Nil{}}`. Type and constructor happen to share a name here.
`Bool`, by comparison, has two constructors: `True{}` and `False{}`.

`state_acc` opens a State using a pattern:

```bend
match s:
  case State{a, o}: a
```

The pattern names the fields; this branch returns the first and discards the
second. Affine values may be discarded. In `boundary`, a match on a character
chooses punctuation rules; `_` means everything not matched earlier. In
`splitter_test.bend` → `same`, `match a b` inspects two lists together. This is
case analysis, not a request to compute in parallel.

## Strings are linked lists in Bend

`bend base String` declares:

```bend
type String is Data:
  SNil{}
  SCon{head: Char, tail: String}
```

`SNil{}` is empty. `SCon{'H', SCon{'i', SNil{}}}` is `"Hi"`.
`after_closers` uses `case SCon{+h, +t}:` to inspect one character and its tail.
There is no random-access array hiding in this source-level model.

The generated JS representation is different. In Bend 2.0.39, Strings and Chars
cross the JS boundary as native JavaScript strings; Nat crosses as a number.
Lists remain constructor objects: `{$: "Con", head: value, tail: rest}`, ending
in `{$: "Nil"}`. This is visible in the generated `splitter.bend.mjs` and used
by `addin/src/lib/splitter.js` → `splitSentences`:

```js
for (let xs = Bend['Splitter.split'](text, max); xs.$ !== 'Nil'; xs = xs.tail) {
  chunks.push(xs.head);
}
```

The bridge validates input and converts the linked result into an array. Bend's
JS string input conversion replaces lone UTF-16 surrogates, so the bridge routes
those unusual inputs through `splitter-fallback.js` to preserve every code unit.
Normal Unicode text uses the compiled Bend implementation.

## Recursion, accumulators, and reverse

Instead of changing a loop variable, a recursive function passes its next state
as arguments. In `scan`, the next call is:

```bend
scan(t, SCon{h, a}, o, next || (pending && (Char.is_space(h) || closing(h))))
```

`t` is the remaining input. `SCon{h, a}` puts the character at the front of the
reversed sentence accumulator. `o` contains completed sentences in reverse order.
`pending` remembers a possible boundary while following whitespace stays attached
to the sentence on its left. `flush` uses:

```bend
State{SNil{}, String.reverse(acc) <> out}
```

`<>` is list cons: prepend one element, not concatenate two lists. Reverse the
characters when a sentence finishes, and reverse the sentence list at the end.
This avoids walking an ever-growing linked prefix for every appended character.
See the worked `Dr. Who arrived. Then he left.` example in the splitter header.

## Quantities and affinity

The guide says ordinary variables are **affine**: each may be used at most once.
This is a rule about bindings, not a prohibition on calling a top-level function
more than once. `Data` means a type permits copying. `Type` keeps values affine.
More precisely, the syntax reference identifies `Data = Kind(&2)` and
`Type = Kind(&1)`; `&0` is the erased quantity.

A `+` binding opts into reuse when its type permits it. In `abbreviation`:

```bend
def abbreviation(+w: String) -> Bool:
  +l = String.to_lower(w)
```

`w` is used both for lowercasing and testing a capital initial; `l` is compared
against many abbreviations. Removing `+` makes those repeated uses invalid.
A diagnostic about a value being consumed more than once means to examine
ownership: either bind reusable Data with `+`, or restructure the code so an
affine value is consumed once. Adding `+` cannot make an affine type copyable.

`List<&2, String>` supplies both the quantity and element type. The Base declaration
is `type List<a, -A: Kind(a)> is Kind(a)`: with `&2`, the element type must be Data,
and the resulting list is Data too. The `-A` type parameter is erased at runtime.
The `&2` is not a list length or a request for two CPU threads.

`State` matters because `scan` binds `+state` and calls two projection functions
with it. Ordinary pairs (`A & B`) are affine, even with Data fields, so duplicating
a pair for those calls would fail. A single destructuring of a pair would also be
a valid design, but the existing code uses a small Data record. `+a` similarly
allows both boundary lookbehind and construction of the next accumulator.

## Thunks delay work

Bend does not make ordinary function arguments lazy. `bend base Bool` shows that
`Bool.pick` receives two values. Computing recursive branches before choosing one
would do unwanted lookahead. `lazy_string` instead receives functions:

```bend
def lazy_string(b: Bool, yes: Unit -> String, no: Unit -> String) -> String:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})
```

A `Unit -> String` thunk is work packaged as a function. `u => after_closers(t)`
creates that work without doing it yet. Only the chosen branch calls its thunk.
`Unit{}` is the argument carrying no useful information. Closures are affine:
they may be called at most once, even when they capture only Data. `lazy_bool`
uses the same technique to stop at the first visible character.

## Termination, fuel, and annotations

Bend requires live recursion to terminate. The guide describes a left-to-right
check of recursive arguments: earlier arguments must be unchanged until one is
a smaller part obtained by matching; later arguments may change freely.
`scan` puts its shrinking string first, and recurses on the matched tail `t`.
`limits` likewise recurses on a list tail.

In `limit`, `String.drop(whole, n)` is computed, not a visibly matched subterm.
The checker does not infer the mathematical claim that this string is shorter.
Instead the first parameter is a Nat fuel counter:

```bend
match fuel:
  case 0n: Nil{}
  case 1n+f:
```

Its recursive call uses `f`. Starting fuel is the sentence length; the normalized
maximum is at least one, so each step removes at least one character. This gives
enough fuel while making termination visible to the checker. It does not itself
prove the lossless law or prove that every caller supplied sufficient fuel.

`+whole = {SCon{h, t} : String}` explicitly annotates a constructed value.
`{x : T}` tells Bend what type to check where its deliberately limited inference
needs help. `1n+p` is a Nat successor pattern; plain numeric literals such as
`1` are U32, while `1n` is Nat.

## Laws are stronger than examples, once proved

`bend/LAWS.bend` → `lossless` says:

```bend
law lossless:
  for +t: String
  for m: Nat
  {String.concat(S.Splitter.split(t, m)) == t : String}
```

This asks for an equality proof for every input, including a zero maximum that
our entry point normalizes to one. `==` here describes a proposition, not a
runtime Boolean. A paired def must inhabit that proposition; `{==}` proves an
equality when both sides compute to the same term. A law with no def is open.

**Ours is unproven.** Tests check examples and invariants, not all strings. A full
proof needs generalized scan accumulator invariants, take/drop recombination,
and adequate-fuel reasoning. `bend bend/LAWS.bend --check-only` should report
`SOME PROOFS FAIL`. The actual check in this pass printed:

```text
SOME PROOFS FAIL
Error: 1 TODO found.
The code is incomplete, and not a valid proof yet.
```

Do not silence that with `@unsafe` or describe the splitter
as formally verified. The guide convention separates human claims in LAWS.bend
from proofs in PROOF.bend; this repository currently has no completed proof file.

## Parallelism and balanced work

A sequential character scan needs left context: abbreviations, pending boundaries,
and reversed sentence state. Cutting arbitrary character halves loses that context.
A future parallel splitter could first identify independent paragraphs, preserve
separators for losslessness, then process balanced halves and combine results in
order. It would need tests showing that the paragraph boundary policy preserves
the existing behavior, including whitespace-only paragraphs.

`bend/parallel_demo.bend` uses an already-balanced tree of four paragraphs rather
than implementing that preprocessing. In `parallel`:

```bend
case Halves{left, right}:
  a b = parallel(left) parallel(right)
  Nat.add(a, b)
```

The two-binding parallel let requests independent calls followed by a join. Both
recursive inputs are matched subtrees, so structural termination is visible.
The guide requires roughly equal work: its scheduler assigns each task once and
never migrates it. Similar paragraph counts are insufficient if one contains
most of the text. Balance total character work as well as tree depth.

Native compiled code runs these calls on CPU cores. `parallel!(tree)` requests
GPU execution, including parallel calls inside it; GPU-less execution falls back
to CPU. Native `!` builds have additional clang/GPU toolchain requirements; this
pass did not test native or GPU performance. **The JS target is sequential.**
Running this tiny IO demo checks its result, not a multi-core speed claim:

```text
Sentence-ending characters: 8
Matches sequential: True
```

It counts `.`, `!`, and `?` characters, not actual sentences. Its `sequential`
function traverses the same input without the parallel let for comparison.

## A checker surprise from this pass

The first demo used `+tree = Halves{...}` without a type. Bend printed:

```text
SOME PROOFS FAIL
Error:
- expected : an annotated term (cannot infer)
- observed : Halves{Halves{Paragraph{"Hello. Bye!"}, Paragraph{"Ready? Yes."}}, Halves{Paragraph{"One. Two!"}, Paragraph{"Why? Done."}}}
Location: main
```

The fix was `+tree = {Halves{...} : Paragraphs}`. This was an inference failure,
not evidence that parallel recursion or Data trees are unsupported. Always read
Bend's printed verdict as well as the shell exit status: this diagnostic exited
with status zero in this installation.

## Small exercises

1. Add an abbreviation in `splitter.bend` → `abbreviation`. Add a corresponding
   case to `splitter_test.bend` and mirror the rule in `splitter-fallback.js`.
   Run `bend bend/splitter_test.bend`, regenerate the `.mjs` with the command above,
   and run `cd addin && npm test`. Update the printed Bend case total if adding a case.
2. Add a quotation or whitespace example to `addin/test/splitter-cases.mjs`.
   Predict where whitespace stays before running `cd addin && npm test`.
3. On a scratch copy, remove `+l` from `abbreviation` and check with
   `bend bend/splitter.bend --check-only`. Explain the ownership error, then restore
   it. Do not regenerate the committed module from an intentionally broken copy.
4. Change the demo's paragraph text, predict the count, and run
   `bend bend/parallel_demo.bend`. Keep total character work similar in both halves.
5. On a scratch copy of LAWS.bend, state a bounded-length property for positive
   maxima. Inspect `bend base List` and run `bend scratch.bend --check-only`.
   An open law should remain visibly unproved until you supply a real proof.

## Working with Bend through coding agents

All the code in this repo was written by **Codex CLI** (`codex exec`, fast mode) from
three prompts. A second agent planned the work, reviewed it and re-ran every check.
The prompts are committed **verbatim**:

| Step | Prompt | What it produced | Tokens |
|---|---|---|---|
| 01 | [`agent-prompts/01-bend-splitter.md`](agent-prompts/01-bend-splitter.md) | `bend/splitter.bend`, tests, `LAWS.bend`, the JS wrapper and fallback | ~58k |
| 02 | [`agent-prompts/02-word-addin.md`](agent-prompts/02-word-addin.md) | the whole Word add-in, tests, build, manifest, install scripts | ~77k |
| 03 | [`agent-prompts/03-readability-docs-hosting.md`](agent-prompts/03-readability-docs-hosting.md) | readability/comment pass, `parallel_demo.bend`, most of this file, hosting scripts | ~91k |

The command was:
```bash
codex exec -C /workspace/projects/word-tts -s danger-full-access \
  -c service_tier='"fast"' -o /tmp/codex-NN.txt - < agent-prompts/NN-....md
```
(`-o` saves Codex's final message; the prompt goes in on stdin.)

### What made the prompts work
Line 2–3 of prompt 01 is the most important part of the whole project:

> IMPORTANT: Bend 2 is NOT Bend 1. Do not use Bend 1 / HVM syntax (`fold`,
> `bend x = 0 when`, `switch`, `λ`, `(Foo a b)` constructors, `bend run-rs`). Before
> writing code, run `bend guide` and read it fully, and use `bend base <Name>` …
> Only use functions that exist there.

Almost everything online about "Bend" (tutorials, blog posts, the old HVM repo) is
**Bend 1**, a different language, and models have mostly been trained on that. With the
warning, plus "read the guide that ships with the compiler", Codex never once wrote
Bend 1 syntax. It read `bend guide` and `bend base String/List/Char/Nat` itself before
coding.

The other ingredients:
- **A spec of observable behaviour** (the rules list) instead of an algorithm, plus
  a **law** (lossless: `concat(split(t)) == t`) that tests check on every case and on
  200 random strings.
- **An escape hatch, stated up front:** "if the compiled JS is unusable, write a JS
  fallback and explain why." That stops an agent fighting the compiler for hours, and
  makes it *measure* instead of guess. (Result: the Bend output was usable, about 56 ms
  for 20k chars, so the fallback is only used for text containing lone UTF-16
  surrogates, which Bend's `str_in` would replace with U+FFFD.)
- **Effort caps** ("don't spend more than ~25% on the proof", "time-box ~20%").
- **"Final message < 40 lines: … Bend surprises, be specific, this is going into a
  learning document."** The exact error messages below came from that request.
- "Do NOT commit". The reviewing agent commits, after checking.

### Where Codex got Bend 2 wrong (and how the checker caught it)
Bend's checker is strict, and it explained every mistake. These are the real
messages from the step 01 transcript, in the order they happened:

| Checker said | What was wrong | Fix (see `bend/splitter.bend`) |
|---|---|---|
| `a match cannot scrutinize a computed value: give it its own def` | destructured a function result inline: `(a, o) = flush(...)` | move the match into its own helper def |
| `t (consumed more than once)` | used a string tail twice, but values are affine (use at most once) by default | write `SCon{+h, +t}`: `+` makes it copyable |
| `out (consumed more than once)` | same, for the output accumulator | `+out` |
| `an unfilled law is a dead claim: live code cannot use it` | tried to lean on an unproven law from live code | removed; laws live only in `LAWS.bend` |
| `expected : Data` / `observed : Type` | built an ordinary pair of affine things where a `Data` value was needed | introduced `type State is Data: State{acc, out}` |
| `expected : an annotated term (cannot infer)` | bare constructor such as `SNil{}` where the type wasn't obvious | annotate: `{SNil{} : String}` (step 03 hit the same with `{Halves{…} : Paragraphs}`) |
| *(no error: wrong behaviour)* | `Bool.pick(c, a, b)` evaluates **both** branches, so recursive lookahead ran too far | thunks: `lazy_string` / `lazy_bool` take `Unit -> T` closures |
| `--verdict` needs Lean 4.34.0 | the proof-export path needs Lean, which isn't installed | the law stays stated but unproven (`--check-only` reports `1 TODO`) |

Non-Bend slips were mostly environmental:
- Codex runs commands in `bash -lc`, which didn't load `~/.bashrc`, so in step 02 "bend
  wasn't on PATH". `build.mjs` now also looks in `~/.bend/bin/bend`.
- The first test command, `node --test addin/test`, failed ("Cannot find module"). It
  became `npm test` with a glob.
- Steps 01–02 produced **correct but dense** code (several statements per line). That
  needed a dedicated readability pass (step 03), which changed no behaviour: the
  regenerated `splitter.bend.mjs` is byte-identical and all tests still pass.
- Prompt 01 *suggested* paragraph-level parallel recursion. Codex rightly kept the
  scan sequential (each cut depends on the text to its left) and explained why, and
  step 03 put the parallel idea in a separate `parallel_demo.bend`.

### How the output was checked (don't trust the agent's summary)
After every step the reviewing agent re-ran the checks itself:
```bash
export PATH="$HOME/.bend/bin:$PATH"
bend bend/splitter_test.bend               # 27 passed, 0 failed
bend bend/parallel_demo.bend               # Matches sequential: True
bend bend/LAWS.bend --check-only           # SOME PROOFS FAIL / 1 TODO (law unproven, expected)
bend bend/splitter.bend -o /tmp/s.mjs && diff /tmp/s.mjs addin/src/lib/splitter.bend.mjs
cd addin && npm test                        # 61 tests
BASE_URL=https://example.github.io/word-tts npm run build && npm run validate
```
Then it read the diffs, especially anything touching the user's document
(`word.js`), install scripts (`install.cmd`: what goes in the registry), and the
service worker. **Watch out:** `--check-only` on `LAWS.bend` exits 1, but in step 03
Codex reported a `SOME PROOFS FAIL` diagnostic while *running* a file that still exited
0, so check the printed output, not just `$?`.

### Tips for prompting agents on a young language
1. **Name the version and ban the old one explicitly**, listing the old syntax so the
   model recognises it.
2. **Point at the source of truth that ships with the tool** (`bend guide`,
   `bend base X`) and require "only use functions that exist there".
3. **Make it executable:** tests the agent must run, a law checked on random input, a
   performance budget. A young language's checker is your best reviewer, so ask the
   agent to keep the exact error messages.
4. **Give a fallback and a time-box**, so "this doesn't work in Bend yet" is an
   acceptable, documented outcome instead of a hack (`@unsafe`, deleted tests).
5. **Ask for readability and teaching comments in the first prompt** (we didn't do
   this firmly enough, so it took a whole extra step), and verify comments against
   the guide ("don't invent semantics").
6. **Keep the agent away from irreversible things**: no commits, pushes or publishing.
   Prepare scripts that refuse to run without `CONFIRM=yes`.
7. **Small, checkable steps**: library → app → polish. Each prompt gets a fresh
   context, so tell it to read `NOTES.md` and the existing code first.
