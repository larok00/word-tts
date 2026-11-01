import Base

# A fixed balanced tree of paragraphs keeps this teaching example tiny.
# It demonstrates parallel calls, not faster speech or a production splitter.
# Bend concept: Data permits +tree to be checked by two different traversals.
type Paragraphs is Data:
  Paragraph{text: String}
  Halves{left: Paragraphs, right: Paragraphs}

# Count candidate sentence-ending characters, not linguistic sentences.
# Bend concept: SCon opens a linked string; recursion on t proves termination.
def endings(text: String) -> Nat:
  match text:
    case SNil{}: 0n
    case SCon{+h, t}:
      Nat.add(Bool.pick(Nat,
        Char.is_eq(h, '.') || Char.is_eq(h, '!') || Char.is_eq(h, '?'), 1n, 0n),
        endings(t))

# Sequential reference visits the same tree and combines both counts.
# Bend concept: ordinary calls do not request parallel scheduling.
def sequential(tree: Paragraphs) -> Nat:
  match tree:
    case Paragraph{text}: endings(text)
    case Halves{left, right}: Nat.add(sequential(left), sequential(right))

# Both subtrees are smaller matched inputs, so the checker accepts recursion.
# Bend concept: the two-binding parallel let requests independent fork/join work.
# Keep both halves similar in total character count, not merely paragraph count:
# the guide says tasks are assigned once and never migrated between cores.
def parallel(tree: Paragraphs) -> Nat:
  match tree:
    case Paragraph{text}: endings(text)
    case Halves{left, right}:
      a b = parallel(left) parallel(right)
      Nat.add(a, b)

# Print both the count and the comparison so the demo checks its own example.
# Bend concept: +tree and +count allow reuse; IO printing remains sequential.
# Native compilation schedules parallel lets on CPU; `parallel!(tree)` requests
# GPU execution. The JS target (also used for IO here) runs sequentially.
def main() -> IO(Unit):
  +tree = {Halves{
    Halves{Paragraph{"Hello. Bye!"}, Paragraph{"Ready? Yes."}},
    Halves{Paragraph{"One. Two!"}, Paragraph{"Why? Done."}}} : Paragraphs}
  +count = parallel(tree)
  do IO<Unit>:
    IO.print("Sentence-ending characters: " ++ Nat.show(count))
    IO.print("Matches sequential: " ++ Bool.show(Nat.is_eq(count, sequential(tree))))
