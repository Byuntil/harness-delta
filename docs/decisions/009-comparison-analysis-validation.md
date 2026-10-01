# ADR 009: Bounded offline comparison analysis validation

Status: Accepted for a synthetic study only. R10 remains unvalidated.

## Decision and domain

The offline study has no production CLI, DB import, package export, or admission
integration. It checks generated finite task populations under the assignment law
in [ADR 008](008-task-comparison-workflow.md). It does not establish real source
completeness, average-effect intervals, quality noninferiority, or adoption.

Each ordered stratum has ordered blocks; all except its last are fully observed.
Every block declares all scheduled IDs and a contiguous observed-prefix mask.
IDs are globally unique, and population IDs equal retained IDs in explicit order.
Names and timestamps do not reconstruct assignment order. Population, order,
strata and prefix length are fixed before assignment, without interference.

The fixed bounds are one block size in {2,4,6,8}, at most two strata, four blocks,
16 retained tasks, and 4096 joint full balanced queue combinations. Before tail
checks, N times squared support size must not exceed 1,000,000. Exceeding either
bound is rejected without approximation. Empty prefixes have unit kernel mass;
an empty population or a design containing an empty stratum is not analyzable.

For size b=2m and length r, a particular prefix with k A labels has probability
C(b-r,m-k)/C(b,m). The candidate branches with remaining-label/remaining-slot
probability; an independent oracle enumerates full balanced words and counts
prefix multiplicities. Blocks combine by products without moving tasks across
blocks. This induced law is different from conditioning on realized arm counts.
For b=4,r=2 the masses are AA=BB=1/6 and AB=BA=1/3.

## Arithmetic and scope of claims

Signed reduced BigInt fractions with positive denominators are compared exactly;
JSON fractions use canonical decimal strings. Inputs are nonnegative safe integer
potentials, boolean success potentials, fixed assignee IDs and time indexes.
No intermediate token sum uses Number arithmetic.

The target is mean(yB-yA) over retained tasks. The statistic is
T(z,y)=(2/N) sum((1[z=B]-1[z=A]) y), defined even on single-arm prefixes.
For design expectations each assignment realizes its own yObs from potentials.
For a null reference tail the observed yObs stays fixed across reference labels.
The two-sided weighted tail includes ties: P(|T(Z,yObs)| >= |T(zObs,yObs)|).
Only taskwise sharp-null cases receive calibration checks at 1/20 and 1/10;
rejection uses p <= alpha. Non-null tails are sharp-null-imputation arithmetic,
not average-null tests or confidence intervals.

The frozen grid uses every nonempty single-block prefix plus four composite
designs; six base populations are crossed with unmodified, fixed alternating-user
offset and fixed time-trend variants. Effects are recomputed after repetition and
truncation; the heterogeneous zero-average claim applies only at multiples of four.
No fixture is removed or tolerance adjusted after observing results.

Reject incomplete usage or quality, informative/unknown stopping, adaptive/unknown
enrollment, carryover/unknown history, actual-only grouping, non-prefix masks,
misaligned populations, malformed data and unsupported requests. Rejection is
boundary evidence, not validation of missingness or dependence methods.
Ratio checks only establish arithmetic: compare per-task means; include failures
and rework in usage per success; expose empty arms, zero baselines and zero
success counts as undefined.

## Limits and reproduction

[Requirements R05/R09/R10](../requirements.md) remain binding. Current reports
have partial usage, null inference fields and inconclusive adoption. The
`real_experiment_disabled` guard is unchanged. Passing evidence is never an
admission credential. Larger designs, Monte Carlo error/power/coverage, average
effects and intervals, MNAR sensitivity, carryover, ratio uncertainty, quality
estimands/noninferiority and joint adoption need a separately reviewed 2B2 plan.
Real admission (2C) needs further complete-source and end-to-end readiness work.

See the [runbook](../runbooks/comparison-analysis-validation.md) and
[version 1 dossier](../validation/comparison-analysis-validation-v1.md) for actual
execution evidence, provenance and remaining limitations.
