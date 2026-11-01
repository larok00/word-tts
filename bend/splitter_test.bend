# Executable regression examples for Splitter.split, not universal proofs.
# Exports valid/same/check/report plus main, which prints the 27-case result.
import Base
import ./splitter.bend as S

# Structural list recursion checks that every chunk is nonempty and bounded.
# Bend concept: recursion consumes the list tail; +max is reused at each step.
def valid(xs: List<&2, String>, +max: Nat) -> Bool:
  match xs:
    case Nil{}: True{}
    case +h <> t:
      Bool.not(String.is_empty(h)) && Nat.is_le(String.length(h), max) && valid(t, max)

# Simultaneous list pattern matching compares exact expected boundaries.
# Bend concept: match a b inspects both lists together; this is not a parallel
# call. Both tails shrink, so exact comparison terminates.
def same(a: List<&2, String>, b: List<&2, String>) -> Bool:
  match a b:
    case Nil{} Nil{}: True{}
    case h <> t j <> u: String.eq(h, j) && same(t, u)
    case _ _: False{}

# Reusable bindings test the expected result, lossless law, and size invariants.
# Bend concept: +chunks permits exact, lossless, and bounded checks of one result.
def check(name: String, +text: String, +max: Nat, expected: List<&2, String>) -> Bool:
  +chunks = S.Splitter.split(text, max)
  same(chunks, expected) && String.eq(String.concat(chunks), text) && valid(chunks, max)

# Boolean matching produces one readable status line and a numeric count.
# Bend concept: do IO<Nat> sequences printing and returns the count as an effect.
def report(name: String, ok: Bool) -> IO(Nat):
  match ok:
    case True{}:
      do IO<Nat>:
        IO.print("PASS " ++ name)
        return 1n
    case False{}:
      do IO<Nat>:
        IO.print("FAIL " ++ name)
        return 0n

# IO sequencing prints all cases and sums their success counts.
# Bend concept: typed <- binds results of IO actions; pure +passed is reusable.
def main() -> IO(Unit):
  do IO<Unit>:
    p0 : Nat <- report("simple", check("simple", "Hello. World.", 100n, ["Hello. ", "World."]))
    p1 : Nat <- report("titles", check("titles", "Mr. Smith met Dr. Jones. Bye.", 100n, ["Mr. Smith met Dr. Jones. ", "Bye."]))
    p2 : Nat <- report("examples", check("examples", "Use e.g. apples and i.e. fruit. Next.", 100n, ["Use e.g. apples and i.e. fruit. ", "Next."]))
    p3 : Nat <- report("initials", check("initials", "J. K. Rowling wrote. Next.", 100n, ["J. K. Rowling wrote. ", "Next."]))
    p4 : Nat <- report("numbers", check("numbers", "Pay 1,000.50 for 3.14 pies in v2.0. Done.", 100n, ["Pay 1,000.50 for 3.14 pies in v2.0. ", "Done."]))
    p5 : Nat <- report("ellipsis_upper", check("ellipsis_upper", "Wait... Next.", 100n, ["Wait... ", "Next."]))
    p6 : Nat <- report("ellipsis_lower", check("ellipsis_lower", "Wait... maybe later.", 100n, ["Wait... maybe later."]))
    p7 : Nat <- report("unicode_ellipsis", check("unicode_ellipsis", "Wait… Next… maybe.", 100n, ["Wait… ", "Next… maybe."]))
    p8 : Nat <- report("ellipsis_end", check("ellipsis_end", "Wait...", 100n, ["Wait..."]))
    p9 : Nat <- report("quotes", check("quotes", "He said \"Hi.\" Then left.", 100n, ["He said \"Hi.\" ", "Then left."]))
    p10 : Nat <- report("closers", check("closers", "Hi!’) Next.", 100n, ["Hi!’) ", "Next."]))
    p11 : Nat <- report("bang_question", check("bang_question", "Really? Yes! Fine.", 100n, ["Really? ", "Yes! ", "Fine."]))
    p12 : Nat <- report("paragraph", check("paragraph", "One\n\nTwo", 100n, ["One\n\n", "Two"]))
    p13 : Nat <- report("newline", check("newline", "One\nTwo", 100n, ["One\n", "Two"]))
    p14 : Nat <- report("carriage", check("carriage", "One\rTwo", 100n, ["One\r", "Two"]))
    p15 : Nat <- report("crlf", check("crlf", "One\r\n\r\nTwo", 100n, ["One\r\n\r\n", "Two"]))
    p16 : Nat <- report("forced", check("forced", "alpha beta gamma delta", 11n, ["alpha beta ", "gamma delta"]))
    p17 : Nat <- report("hard", check("hard", "abcdefghij", 3n, ["abc", "def", "ghi", "j"]))
    p18 : Nat <- report("empty", check("empty", "", 100n, []))
    p19 : Nat <- report("unfinished", check("unfinished", "text without punctuation", 100n, ["text without punctuation"]))
    p20 : Nat <- report("whitespace", check("whitespace", "  Hi. \n  Bye.  ", 100n, ["  Hi. \n  ", "Bye.  "]))
    p21 : Nat <- report("all_whitespace", check("all_whitespace", " \n\r ", 100n, [" \n\r "]))
    p22 : Nat <- report("max_one", check("max_one", "A. B", 1n, ["A", ".", " ", "B"]))
    p23 : Nat <- report("all_abbreviations", check("all_abbreviations", "Mrs. Ms. Prof. Sr. Jr. St. vs. etc. No. Fig. approx. done. Next.", 100n, ["Mrs. Ms. Prof. Sr. Jr. St. vs. etc. No. Fig. approx. done. ", "Next."]))
    p24 : Nat <- report("unicode", check("unicode", "😀 Hello. 世界!", 100n, ["😀 Hello. ", "世界!"]))
    p25 : Nat <- report("space_at_limit", check("space_at_limit", "abcd efgh", 5n, ["abcd ", "efgh"]))
    p26 : Nat <- report("trailing_long_space", check("trailing_long_space", "Hi.      ", 4n, ["Hi. ", "    ", " "]))
    +passed : Nat = Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(Nat.add(p0, p1), p2), p3), p4), p5), p6), p7), p8), p9), p10), p11), p12), p13), p14), p15), p16), p17), p18), p19), p20), p21), p22), p23), p24), p25), p26)
    IO.print(Nat.show(passed) ++ " passed, " ++ Nat.show(Nat.sub(27n, passed)) ++ " failed")
