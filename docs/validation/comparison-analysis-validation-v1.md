# Comparison analysis validation v1

Local synthetic execution on 2026-10-01. This is bounded 2B1 evidence; R10 remains
**unvalidated**, adoption **inconclusive**, and real experiments disabled.
This dossier records the original source snapshot subsequently committed as
`3648532d674e31e86bbb07a4ccf4478b17baae43` (merged by PR #17). The original local
execution preceded that commit; remote CI was not part of the execution recorded
here. Its numbers and fingerprints below remain historical evidence. Later
package/compiler changes can alter a rerun source hash without changing the
v1 method, cases or settings. The separate confidence study documents its own
[results and rerun provenance](comparison-confidence-validation-v1.md).

## Executed evidence

Node 24.19.0, npm 11.19.1, TypeScript 6.0.3, Zod 4.6.5; lockfile version 3.
The [runbook](../runbooks/comparison-analysis-validation.md) lists exact commands.
All 432 eligible cases, 26 rejected-domain cases, 7,272 statistic comparisons,
7,272 tail comparisons, 432 expectation checks and 432 calibration checks ran.
Expected and executed counts matched; no study failure occurred.

The 24 designs comprise every nonempty prefix at block sizes 2,4,6,8 and four
composites. Six populations and three fixed offset variants give 432 cases;
216 are taskwise sharp nulls. All HT expectations equal their finite targets
exactly. Oracle agreement uses exact rational arithmetic, with no numerical
comparison tolerance or Monte Carlo sampling error. Every single-arm prefix is
retained. Separate unit tests cover empty prefixes and impossible completions.

- At alpha 1/20, maximum exact rejection probability was 1/35, at most alpha.
- At alpha 1/10, maximum exact rejection probability was 1/10, at most alpha.

The b4 full-block additive-decrease anchor with observed AABB freezes
[10,20,25,35] and gives tail 1/3. Rerendering reference potential outcomes would
incorrectly give 1/2. The all-zero/no-offset tails are exactly one. Effects at
truncated lengths are recomputed; a heterogeneous zero average is not a sharp null.

Allocator integration exercises all 98 full words at b=2,4,6,8, verifying committed
labels/indexes across restart without reading future queues. This verifies queue
semantics, not empirical cryptographic RNG uniformity. Existing report regressions
retain original assignment under crossover, half-open endpoints, pending follow-up,
late assessment, partial observed zero and null confidence/p-value fields.

Ratio anchors check equal per-task means with unequal arm totals, zero baselines,
usage 100 success + 50 failure divided by one success = 150, and zero successes.
They establish arithmetic only, not ratio coverage or savings conclusions.

## Rejection and remaining R10 work

Incomplete usage/quality, actual-only grouping, adaptive enrollment, carryover,
unknown or outcome-dependent stopping, omitted positions, population misalignment,
real inputs and resource overflow yield rejected-domain results. Unequal-arm and
high-usage missingness are deliberately rejected, without complete-case substitution.
Self-declared synthetic mechanisms are fixtures, not proof about real data.

| Domain | Still unvalidated |
| --- | --- |
| Average effects | Estimator/interval selection, coverage, precision, weak-null inference |
| Larger designs | Larger block/stratum grids and numerical/Monte Carlo validation |
| Missingness | MNAR assumptions, bounds and sensitivity methods |
| Dependence | Carryover/interference, adaptive populations, developer/time uncertainty |
| Ratios | Bias, near-zero baseline and success-denominator uncertainty |
| Quality | Criterion estimand, noninferiority uncertainty and missing assessments |
| Joint decisions | Savings/quality error control and sequential decisions |
| Real readiness | Complete-source support, approved protocol and end-to-end admission |

2B2 requires a separately reviewed plan and may find no suitable method. 2C remains
separate. No production source, DB, snapshot v1, CLI or package export changed in this batch.
No passing file or flag is consumed by the allocator.

## Provenance and verification

The evidence manifest lists every study TypeScript file, independent oracle,
three acceptance tests, wrapper, study/root/production compiler configurations,
package/lock files and ADR 009. It excludes this dossier to avoid self-hashing.
The fingerprints below identify the final study after review fixes.

Aggregate source SHA-256: `ac2d189b1c438211e0e02776ea89bf27fd40eb4d4992f17a24508632352f74d1`.

Settings SHA-256: `ec0982cea7d671be503d15f9f8ed68cb5ab82d5feeeab60eda7a95dfca7df368`.

Design SHA-256: `4a4c262780ab9c3274dfed91a65ab2ac7d19a9d47f5f58e4c421823affdc2dcd`.

Case definitions SHA-256: `dc0251c34a05b83a821c3f3f1870e59097678ca113b5e8436c71bf4224b02b77`.

Final local verification: 21 focused tests and `npm run check` passed (446 tests);
`npm run analysis:validate` passed after review fixes. All 15 local documentation
links resolved. The production build contains no study or oracle files.

Independent review covered the exact uncommitted implementation, requirements,
mathematics, oracle independence, tests, evidence, documentation and production
boundaries. Two P2 findings were resolved with failing-then-passing regressions:
reject an empty stratum beside a nonempty one, and independently pin per-case
classification/check identities so swapped null/non-null fixtures cannot pass via
unchanged aggregate counts. The additional boundary test does not change the
frozen 26-case rejection registry. No unresolved review finding remains.
The reviewed grid and exact comparison rules were not tuned or reduced.
