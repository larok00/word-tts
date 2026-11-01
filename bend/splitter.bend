import Base

# Lossless sentence splitting for speech; exported through Splitter.split to JS.
# Pass 1 walks one character at a time. acc holds the current sentence backwards,
# out holds completed sentences backwards, and pending remembers a possible cut.
# For "Dr. Who arrived. Then he left.": D, r build acc; the first dot looks back
# at "Dr" and recognizes an abbreviation, so it does not set a cut. We keep
# scanning W, h, o, ...; the dot after "arrived" sets pending. The following
# space stays in acc. At T we flush "Dr. Who arrived. " and begin "Then he left.".
# End of input flushes the last sentence. No character or whitespace is discarded.
# Pass 2 limits each sentence to max characters, preferring its last literal space
# within max (including that space on the left). max=0 is normalized to 1.
# Prepending and reversing avoids appending to a linked string on every step.
#
# This scan is sequential: a dot needs the preceding word and pending depends on
# earlier punctuation. Arbitrary character halves do not have independent context.
# A parallel version would first identify independent paragraphs, then recurse on
# balanced halves of those paragraphs with `left right = process(a) process(b)`.
# The guide requires roughly equal work: tasks are assigned once, never moved.
# Paragraph sizes matter too, not just their count. The JS target stays single-core.
# See parallel_demo.bend for a tiny balanced-tree example, separate from this scan.

# Boolean pattern matching selects a thunk, avoiding eager recursive lookahead.
# Bend concept: Unit -> String is a once-callable closure (a thunk). Passing work
# as a closure delays it; Bool.pick takes ordinary values, not lazy branches.
def lazy_string(b: Bool, yes: Unit -> String, no: Unit -> String) -> String:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

# The same thunk pattern avoids scanning beyond the first visible character.
# Bend concept: a Bool match invokes only the chosen Unit -> Bool thunk, so
# recursive lookahead stops as soon as the answer is known.
def lazy_bool(b: Bool, yes: Unit -> Bool, no: Unit -> Bool) -> Bool:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

# Pattern matching identifies the supported closing punctuation.
# Bend concept: constructor/literal patterns enumerate cases; _ catches the rest.
def closing(c: Char) -> Bool:
  match c:
    case '"': True{}
    case '\'': True{}
    case '”': True{}
    case '’': True{}
    case ')': True{}
    case _: False{}

# Structural recursion looks past closing quotes/brackets without consuming them.
# Bend concept: SNil{} ends a linked string; SCon{h, t} opens its head and
# tail. Recursing on t is structural descent. +h and +t permit reuse in closures.
def after_closers(s: String) -> String:
  match s:
    case SNil{}: SNil{}
    case SCon{+h, +t}:
      lazy_string(closing(h), u => after_closers(t), u => SCon{h, t})

# List pattern matching tests whitespace or end of input.
# Bend concept: matching a string handles empty input without indexing or errors.
def at_gap(s: String) -> Bool:
  match s:
    case SNil{}: True{}
    case SCon{h, t}: Char.is_space(h)

# Structural lookahead implements the uppercase-after-whitespace ellipsis rule.
# Bend concept: the recursive call receives the smaller tail t; the
# termination checker sees that descent, even inside the selected thunk.
def upper_after_space(s: String) -> Bool:
  match s:
    case SNil{}: False{}
    case SCon{+h, +t}:
      lazy_bool(Char.is_space(h), u => upper_after_space(t), u => Char.is_upper(h))

# Pattern matching requires at least one whitespace after an ellipsis.
# Bend concept: destructuring exposes one character before delegating lookahead.
def ellipsis_gap(s: String) -> Bool:
  match s:
    case SNil{}: False{}
    case SCon{+h, +t}: Char.is_space(h) && upper_after_space(t)

# Pattern matching detects the previous two dots in the reverse accumulator.
# Bend concept: nested patterns inspect two linked nodes without a separate loop.
def two_dots(s: String) -> Bool:
  match s:
    case SCon{'.', SCon{'.', t}}: True{}
    case _: False{}

# Structural recursion takes the preceding word (including internal dots).
# Bend concept: structural recursion rebuilds only the alphabetic/dotted prefix.
# It receives reversed acc, so the caller reverses this word before comparing it.
def word(s: String) -> String:
  match s:
    case SNil{}: SNil{}
    case SCon{+h, +t}:
      lazy_string(Char.is_alpha(h) || Char.is_eq(h, '.'),
        u => SCon{h, word(t)}, u => SNil{})

# Pattern matching recognizes a single capital initial, before lowercasing.
# Bend concept: a nested SNil{} pattern requires exactly one character.
def initial(s: String) -> Bool:
  match s:
    case SCon{h, SNil{}}: Char.is_upper(h)
    case _: False{}

# Reusable values let several equality checks inspect the same small word.
# Bend concept: +w and +l make Data values reusable; without + the repeated
# reads violate affinity (ordinary bindings may be used at most once).
def abbreviation(+w: String) -> Bool:
  +l = String.to_lower(w)
  initial(w) || String.eq(l, "mr") || String.eq(l, "mrs") ||
    String.eq(l, "ms") || String.eq(l, "dr") || String.eq(l, "prof") ||
    String.eq(l, "sr") || String.eq(l, "jr") || String.eq(l, "st") ||
    String.eq(l, "vs") || String.eq(l, "etc") || String.eq(l, "e.g") ||
    String.eq(l, "i.e") || String.eq(l, "no") || String.eq(l, "fig") ||
    String.eq(l, "approx")

# Pattern matching distinguishes ordinary dots, ellipses, and other terminators.
# Numbers need no special case: an internal dot is not followed by a gap.
# Bend concept: a multi-case match returns a Bool. +before and +after allow
# several lookups; Bool.pick chooses already-computed values, not delayed work.
def boundary(c: Char, +before: String, +after: String) -> Bool:
  match c:
    case '\n': True{}
    case '\r': True{}
    case '!': at_gap(after_closers(after))
    case '?': at_gap(after_closers(after))
    case '…': ellipsis_gap(after_closers(after))
    case '.':
      Bool.pick(Bool, two_dots(before), ellipsis_gap(after_closers(after)),
        at_gap(after_closers(after)) &&
          Bool.not(abbreviation(String.reverse(word(before)))))
    case _: False{}

# A Data record packages the flush result for two separate projection calls.
# Bend concept: all fields here are Data, so State may be declared Data too.
# Ordinary pairs are Type (affine); + cannot make an affine type copyable.
type State is Data:
  State{acc: String, out: List<&2, String>}

# Record pattern matching projects the accumulator.
# Bend concept: a record constructor pattern projects one field and drops the other.
def state_acc(s: State) -> String:
  match s:
    case State{a, o}: a

# Record pattern matching projects the completed chunks.
# Bend concept: Data is Kind(&2), while Type is Kind(&1). State can be
# bound with +state and inspected twice; an ordinary affine pair cannot be copied
# for these two projection calls (one destructuring of a pair would be possible).
def state_out(s: State) -> List<&2, String>:
  match s:
    case State{a, o}: o

# A Boolean match flushes a completed sentence before the next visible character.
# Bend concept: String.reverse(acc) <> out uses list cons: add one item to
# the front. Reversing out at the end restores the original sentence order.
def flush(cut: Bool, acc: String, out: List<&2, String>) -> State:
  match cut:
    case True{}: State{SNil{}, String.reverse(acc) <> out}
    case False{}: State{acc, out}

# Consume one character, carrying the pending cut and reusable flush state.
# Bend concept: s is the first argument and t is its smaller matched tail,
# proving termination. Later accumulator arguments may change freely. +state
# allows both projections; +a allows lookbehind and construction of the next acc.
def scan(s: String, +acc: String, +out: List<&2, String>, +pending: Bool) -> List<&2, String>:
  match s:
    case SNil{}:
      Bool.pick(List<&2, String>, String.is_empty(acc),
        List.reverse(&2, String, out), List.reverse(&2, String, String.reverse(acc) <> out))
    case SCon{+h, +t}:
      +state = flush(pending && Bool.not(Char.is_space(h)) &&
        Bool.not(closing(h) && Bool.not(at_gap(acc))), acc, out)
      +a = state_acc(state)
      o = state_out(state)
      +next = boundary(h, a, t)
      scan(t, SCon{h, a}, o, next || (pending && (Char.is_space(h) || closing(h))))

# Structural bounded lookahead remembers the last space, counting it on the left.
# Bend concept: matching s and n together exposes a smaller tail and Nat
# predecessor. 1n+p is a successor pattern; 1n+pos constructs a successor.
def last_space(s: String, n: Nat, +pos: Nat, last: Nat) -> Nat:
  match s n:
    case SNil{} _: last
    case SCon{h, t} 0n: last
    case SCon{+h, t} 1n+p:
      last_space(t, p, 1n+pos, Bool.pick(Nat, Char.is_eq(h, ' '), 1n+pos, last))

# A Nat match uses max when there was no suitable space.
# Bend concept: Nat has zero and successor cases, so no mutable counter is needed.
def choose(n: Nat, max: Nat) -> Nat:
  match n:
    case 0n: max
    case 1n+p: 1n+p

# Input-length fuel proves termination although String.drop hides the smaller tail.
# Every step removes at least one character; the zero-fuel branch is unreachable
# with nonempty s from the public entry point.
# Bend concept: fuel is the first argument and decreases from 1n+f to f.
# String.drop computes a smaller string, but that is not structural evidence to
# the checker. Input-length fuel supplies that evidence independently.
# {SCon{h, t} : String} explicitly supplies a type where inference needs help.
def limit(fuel: Nat, +s: String, +max: Nat) -> List<&2, String>:
  match fuel:
    case 0n: Nil{}
    case 1n+f:
      match s:
        case SNil{}: Nil{}
        case SCon{h, t}:
          +whole = {SCon{h, t} : String}
          +n = Bool.pick(Nat, Nat.is_le(String.length(whole), max),
            String.length(whole), choose(last_space(whole, max, 0n, 0n), max))
          String.take(whole, n) <> limit(f, String.drop(whole, n), max)

# Structural recursion applies the size pass to each independent sentence.
# Bend concept: List<&2, String> is a reusable list of Data strings.
# +h <> t matches cons; recursion on t terminates; +max is shared across chunks.
def limits(xs: List<&2, String>, +max: Nat) -> List<&2, String>:
  match xs:
    case Nil{}: Nil{}
    case +h <> t:
      List.append(&2, String, limit(String.length(h), h, max), limits(t, max))

# Pure public entry point; quantities make the returned list reusable by tests.
# Bend concept: a typed public def composes pure passes. List<&2, String>
# permits callers to bind the result with + and check several properties.
def Splitter.split(text: String, max: Nat) -> List<&2, String>:
  limits(scan(text, SNil{}, Nil{}, False{}), Nat.max(1n, max))
