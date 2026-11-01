import Base

# Lossless TTS chunking in two passes. First scan characters, remembering the
# current word in reverse and a pending boundary. A boundary is emitted only
# before the next non-whitespace character, so whitespace stays on the left.
# Then limit each sentence at its last literal space within max, or at max.
# Strings are linked lists; reversed accumulators avoid repeated appends.
# The scan depends on its left context, so sequential recursion is clearer than
# parallel calls. All recursion is structural, or bounded by input-length fuel.
# max=0 is defensively treated as 1; the documented domain is max >= 1.

# Boolean pattern matching selects a thunk, avoiding eager recursive lookahead.
def lazy_string(b: Bool, yes: Unit -> String, no: Unit -> String) -> String:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

# The same thunk pattern avoids scanning beyond the first visible character.
def lazy_bool(b: Bool, yes: Unit -> Bool, no: Unit -> Bool) -> Bool:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

# Pattern matching identifies the supported closing punctuation.
def closing(c: Char) -> Bool:
  match c:
    case '"': True{}
    case '\'': True{}
    case '”': True{}
    case '’': True{}
    case ')': True{}
    case _: False{}

# Structural recursion looks past closing quotes/brackets without consuming them.
def after_closers(s: String) -> String:
  match s:
    case SNil{}: SNil{}
    case SCon{+h, +t}:
      lazy_string(closing(h), u => after_closers(t), u => SCon{h, t})

# List pattern matching tests whitespace or end of input.
def at_gap(s: String) -> Bool:
  match s:
    case SNil{}: True{}
    case SCon{h, t}: Char.is_space(h)

# Structural lookahead implements the uppercase-after-whitespace ellipsis rule.
def upper_after_space(s: String) -> Bool:
  match s:
    case SNil{}: False{}
    case SCon{+h, +t}:
      lazy_bool(Char.is_space(h), u => upper_after_space(t), u => Char.is_upper(h))

# Pattern matching requires at least one whitespace after an ellipsis.
def ellipsis_gap(s: String) -> Bool:
  match s:
    case SNil{}: False{}
    case SCon{+h, +t}: Char.is_space(h) && upper_after_space(t)

# Pattern matching detects the previous two dots in the reverse accumulator.
def two_dots(s: String) -> Bool:
  match s:
    case SCon{'.', SCon{'.', t}}: True{}
    case _: False{}

# Structural recursion takes the preceding word (including internal dots).
def word(s: String) -> String:
  match s:
    case SNil{}: SNil{}
    case SCon{+h, +t}:
      lazy_string(Char.is_alpha(h) || Char.is_eq(h, '.'),
        u => SCon{h, word(t)}, u => SNil{})

# Pattern matching recognizes a single capital initial, before lowercasing.
def initial(s: String) -> Bool:
  match s:
    case SCon{h, SNil{}}: Char.is_upper(h)
    case _: False{}

# Reusable values let several equality checks inspect the same small word.
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

# A Data record can be inspected twice; ordinary Bend pairs are affine.
type State is Data:
  State{acc: String, out: List<&2, String>}

# Record pattern matching projects the accumulator.
def state_acc(s: State) -> String:
  match s:
    case State{a, o}: a

# Record pattern matching projects the completed chunks.
def state_out(s: State) -> List<&2, String>:
  match s:
    case State{a, o}: o

# A Boolean match flushes a completed sentence before the next visible character.
def flush(cut: Bool, acc: String, out: List<&2, String>) -> State:
  match cut:
    case True{}: State{SNil{}, String.reverse(acc) <> out}
    case False{}: State{acc, out}

# Structural recursion consumes one character; reusable pairs retain flush state.
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
def last_space(s: String, n: Nat, +pos: Nat, last: Nat) -> Nat:
  match s n:
    case SNil{} _: last
    case SCon{h, t} 0n: last
    case SCon{+h, t} 1n+p:
      last_space(t, p, 1n+pos, Bool.pick(Nat, Char.is_eq(h, ' '), 1n+pos, last))

# A Nat match uses max when there was no suitable space.
def choose(n: Nat, max: Nat) -> Nat:
  match n:
    case 0n: max
    case 1n+p: 1n+p

# Input-length fuel proves termination although String.drop hides the smaller tail.
# Every step removes at least one character; the zero-fuel branch is unreachable
# with nonempty s from the public entry point.
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
def limits(xs: List<&2, String>, +max: Nat) -> List<&2, String>:
  match xs:
    case Nil{}: Nil{}
    case +h <> t:
      List.append(&2, String, limit(String.length(h), h, max), limits(t, max))

# Pure public entry point; quantities make the returned list reusable by tests.
def Splitter.split(text: String, max: Nat) -> List<&2, String>:
  limits(scan(text, SNil{}, Nil{}, False{}), Nat.max(1n, max))
