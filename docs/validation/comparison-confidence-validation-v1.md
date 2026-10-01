# Bounded comparison confidence validation v1

Local synthetic execution on 2026-10-01 under Node 24.19.0, npm 11.19.1,
TypeScript 6.0.3 and Zod 4.6.5 (lockfile v3). Tested uncommitted work based on
`3e7cb4d8e5a2de60ded5bd50b9cfd94d655cb0f4`; source fingerprints below identify
the exact study. Remote CI has not run for this change.

## Domain and actual execution

[ADR 010](../decisions/010-comparison-confidence-validation.md) fixes the method,
domain, registry, alpha and resource accounting before results.
The [runbook](../runbooks/comparison-analysis-validation.md) gives the two separate
commands. Method `bounded-weak-null-envelope-1` passed with no study failures:

| Executed check | Usage | Deadline success | Total |
| --- | ---: | ---: | ---: |
| Full truth tables | 21,321 | 936 | 22,257 |
| Unique observed datasets | 2,442 | 528 | 2,970 |
| Target envelopes | 39,858 | 4,448 | 44,306 |
| Observation/alpha sets | 12,210 | 2,640 | 14,850 |
| Individual truth/alpha coverage assertions | 106,605 | 4,680 | 111,285 |

These are executed counts, matching the preregistered combinatorial expectations.
All expected/executed table, observation, target, alpha, assignment and coupled
identities matched without duplicates or omissions. All assignment weights,
compatible schedules, envelopes, set memberships and precision diagnostics agreed
with the independent full-table oracle. No Monte Carlo approximation or tolerance.
Largest usage design (b8r4) executed 1,679,616 reference-row comparisons per
implementation and 104,976 truth/path cache lookups; five alpha checks reuse each
lookup. No cap, case, lattice or alpha was changed after observing results.

## Exact coverage and precision

Minimum design-weighted coverage is taken separately over all truth schedules,
not pooled by target. Columns use alphas 1/40, 1/20, 1/10, 1/4, 1/2.
The minima coincide between endpoints, though witness tables can differ.

| Design | Minimum coverage at each alpha |
| --- | --- |
| b2r1 | 1, 1, 1, 1, 1 |
| b2r2 | 1, 1, 1, 1, 1 |
| b4r1 | 1, 1, 1, 1, 1 |
| b4r2 | 1, 1, 1, 1, 2/3 |
| b4r3 | 1, 1, 1, 1, 2/3 |
| b4r4 | 1, 1, 1, 1, 2/3 |
| two-b2-full | 1, 1, 1, 1, 1/2 |
| two-b2-strata | 1, 1, 1, 1, 1/2 |
| b8r4 | 1, 34/35, 34/35, 6/7, 18/35 |

Every minimum is at least 1-alpha. At b8r4/alpha=1/20 the worst usage
witness is table 911, and quality witness is 85, both with coverage 34/35
and miss probability 1/35. IDs encode base-L digits A1,B1,A2,B2,...,
first digit least significant. Complete per-design/alpha witness IDs and exact
metric ranges are emitted in evidence; deterministic hashes bind every
observation/target/set and every truth/alpha coverage result.

Precision is limited. At alpha 1/40 every set in every design equals KTargets.
At alpha 1/20 and 1/10, every design except b8r4 still has no inferential
narrowing with probability one. KTargets alone has M*N+1 points and hull width M
(2 usage study units, 1 quality unit); this observational restriction from the
wider global grid is not a statistical precision gain.

For b8r4 at alpha 1/20, every truth has no-inferential-narrowing probability
34/35. Expected removed compatible targets range from 2/35 to 9/35 for usage
and 1/35 to 1/7 for quality. Conditional-on-nonempty expected hull width ranges
from 139/70 to 2 for usage, and 139/140 to 1 for quality. These are broad sets.

Empty sets actually occur and remain recorded: b8r4 has maximum empty probability
1/35 at alpha 1/20 (usage table 3280, quality table 255). At alpha 1/2 the maxima
are 9/35 usage and 17/70 quality; b4r2 reaches 1/3 for both endpoints.
Other designs have zero empty probability throughout the frozen alpha grid.
Empty sets have null bounds and are not converted to evidence for adoption.
Finite membership and the hull enclosure remain distinct; tests preserve holes.

## Joint scope and regression evidence

All 108 zipped cases (six templates, original/inverted quality, nine designs)
ran at two family alphas: 216 exact joint checks. Minimum joint containment was
1 at family alpha 1/20 and 34/35 at 1/10, both above their requirements.
The general joint guarantee follows separately from the union bound with each
endpoint at family alpha/2; it does not assume independent endpoints. These
stress cases do not enumerate the full usage-by-quality Cartesian population.

The concentrated suites passed 36 tests; `npm run check` passed 482 tests plus
privacy, lint, type checking and production build. Tests include weighted 1/35
anchors, inclusive ties, strict threshold equality, hidden-truth isolation,
heterogeneous zero-average effects, arm swapping, compatibility-only width,
empty sets, malformed domains and partial/missing outcomes. Mutations omitting
or duplicating truths/targets, skipping alpha, removing paths, corrupting weights
or nuisance maximization are detected. Provenance mutations to oracle, wrapper,
compiler and package files change fingerprints. Production regressions retain
null inference, partial observed usage and unconditional real allocation rejection.

The original `analysis:validate` rerun also passed: 432 eligible / 26 rejected
cases, 7,272 statistic and tail comparisons, 432 expectation and calibration
checks. Its law, method, settings and case grid remain unchanged. Relative to
historical commit `3648532`, only the package command, dedicated compiler include
and source-closure test alter its source provenance. The
[historical v1 dossier](comparison-analysis-validation-v1.md) retains its original
numbers and fingerprints; the new rerun is not relabeled as that snapshot.

## Provenance and remaining limits

- Confidence source_sha256: `7338675b25a3533000a3d3fb1b8b0e2aca6c984e00f12c1ab37bcf604f8571b6`
- Confidence settings_sha256: `2b778208cbcb1b436bb1e187a6501076a6e0189dfade041254ced035dfe3303a`
- Confidence design_sha256: `1c561f9360f1ea391886151629c34644be3f64d6996ec9b307a237dcb9ff4cd1`
- Confidence grid_sha256: `77bf4c0ce0d7c7e15ef7c3b700c9fdd87608ee34faae43ec4ff786b0bc453f85`
- Rerun sharp-null source_sha256: `6104f955c37b62e9197e3484a0178bf9d4c29870704464f21a7a4243f2c8d160`

The command emits path-bound hashes for the full source allowlist. Generated
results and this dossier are excluded to avoid self-hashing. Initial results
were preserved locally; subsequent source changes hardened input validation,
serialization and lookup reuse without changing the frozen mathematical study.

R10 remains **unvalidated** and adoption **inconclusive**. This establishes only
bounded synthetic mean-effect/deadline-success confidence calibration under the
nine fixed designs. It supplies no real-token scale, ratio, MNAR, carryover,
interference, sequential stopping, quality margin, practical savings or adoption
method. Source completeness and end-to-end experiment readiness still require
separate work. Neither runtime inference nor real experiment admission is enabled.
