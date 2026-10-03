# Flexible cost coverage

Version 2 adds standardized estimated cost without changing the partial token
contract in [ADR 004](004-complete-measurement-readiness.md). A verified event breakdown
and an immutable single-currency table permit partial pricing; neither proves a
whole task. Unknown models, attribution, components and prices remain unavailable.
Reasoning tokens are included in output and never receive a second surcharge.

Twelve metric facts must be verified for complete cost. Configuration accounting
replaces the legacy fixed-model restriction and price coverage is additional.
Effort can be unknown when the frozen price does not depend on it. Facts merge
with violated ahead of unknown ahead of verified. Later healthy intervals cannot
repair an earlier gap. An empty window is missing, not observed zero.

Only `synthetic-cost-coverage-v1` is supported by the evaluator. There is no
production cost producer. Real allocation and statistical inference have separate
evidence gates. Legacy `complete_tokens` remains unavailable.

Pricing uses a private Decimal clone with precision 160, price strings bounded to
60 digits, safe integer counters and unit sizes. Finite multiplication and bounded
component sums fit within 80 significant digits. Nonterminating unit division is
reproducible finite-precision arithmetic with at least 80 guard digits, not an exact
rational representation. Formula `decimal160-disjoint-v1` is frozen with reports.
No row receives display rounding before summation; display uses half-even with the
explicit table precision. This is an estimate, not actual billing or labor cost.
