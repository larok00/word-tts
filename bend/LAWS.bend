# Specification module for the splitter; exports the open lossless claim.
# Bend concept: a law states a type to inhabit, not an executable test.
# {a == b : String} is an equality proposition, not a Boolean comparison.
# for +t permits the same input in the splitter call and the equality RHS.
import Base
import ./splitter.bend as S

# Open claim, deliberately not a proof or an unsafe axiom.
# A full proof needs generalized accumulator invariants for scan, and take/drop
# recombination plus a fuel adequacy lemma for limit. These are not proven yet.
# This statement includes m=0 (the implementation normalizes it to 1).
# --check-only must report SOME PROOFS FAIL while this claim remains open.
law lossless:
  for +t: String
  for m: Nat
  {String.concat(S.Splitter.split(t, m)) == t : String}
