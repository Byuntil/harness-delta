# ADR 010: Bounded heterogeneous confidence validation

Status: Accepted for an offline synthetic study only. R10 remains unvalidated;
adoption remains inconclusive. No production inference or real admission changes.

## Frozen design and domain

Use the original-assignment balanced queue/prefix law in
[ADR 009](009-comparison-analysis-validation.md), retaining all assigned tasks,
including single-arm paths. Enrollment, order, strata and prefix lengths are fixed
before assignment; no interference. Empty populations/strata are rejected.
Usage is in study units {0,1,2}; deadline success is {0,1} over every task,
including failures. These are synthetic bounds, not real token caps or defaults.

The nine designs, in order, are b2r1, b2r2, b4r1, b4r2, b4r3, b4r4,
two-b2-full (two full blocks in one stratum), two-b2-strata (full then
one-task prefix in separate strata), b8r4. Exhaust all 3^(2N) usage and
2^(2N) quality potential tables. Encode table IDs by base-L digits ordered
A1,B1,A2,B2,... with the first digit least significant. Scheduled suffixes
are excluded from N and outcomes. Fixed alternating assignee IDs and time indexes
annotate tasks; they do not model carryover.

Alphas are 1/40, 1/20, 1/10, 1/4, 1/2. Target grid is k/N for every integer
k from -M*N through M*N, with M=2 for usage and 1 for deadline success.
Preflight per design/endpoint: N<=4, support S<=16, full tables<=6561,
completions per observation<=81, reference rows L^(2N)*S^2<=2,000,000,
coverage lookups L^(2N)*S<=200,000. These are operation units, not task-cell
counts or runtime limits. Reject exceedance before enumeration; never sample
or prune. Registry size is nine designs and two endpoints.

Analytic expected counts (not executed evidence): 21,321 usage and 936 quality
tables; 2,442 and 528 observations; 39,858 and 4,448 target envelopes;
111,285 per-table/alpha coverage assertions. Compare identities and weights,
not just totals. Preserve failures, empty sets and broad sets without tuning.

## Method and direct coverage derivation

For observation D=(z,y), complete every unobserved arm outcome on the endpoint
lattice, retaining only schedules H matching each ordered observed task.
Target tau(H)=sum(B-A)/N and T(z,y)=2*sum(sign(z)*y)/N.
For each target on the full grid calculate

```text
p_H(tau,D) = sum_z w(z) 1{|T(z,Y_H(z))-tau| >= |T(zObs,yObs)-tau|}
p_sup(tau,D) = max over all compatible H with target tau of p_H(tau,D)
C_alpha(D) = {tau : p_sup(tau,D) > alpha}
```

Reference outcomes Y_H(z) must be freshly realized under each reference path.
The fixed-observation sharp-null tail in ADR 009 cannot implement this method.
Inclusive ties and strict acceptance use exact reduced rational arithmetic.
Empty compatibility gives p=0 and infeasible_target. Inference receives only
observed data, design and domain, never hidden truth. The independent oracle
indexes every full table and independently calculates targets, discrepancies,
weights and inversion; it shares only structural types and independent test helpers.

For every truth H0 and observation, H0 remains compatible at tau0. Thus
p_sup(tau0,D)>=p_H0(tau0,D) pointwise. The inclusive tail of the fixed random
variable |T(Z,Y_H0(Z))-tau0| is super-uniform under its weighted design law,
including atoms. Therefore P(tau0 not in C)<=alpha. This is a direct
repository-specific argument, not an extrapolation of iid/asymptotic results.
Require exact coverage separately for each table and alpha.

Return sorted finite membership and an explicitly labeled hull enclosure;
never fill holes or claim continuous interior membership. Empty C has null
bounds and empty_confidence_set. Report KTargets (all compatible targets)
separately: its count is M*N+1 and hull width M. Report accepted count,
removed compatible targets, confidence width, empty probability and
noInferentialNarrowing (C=KTargets). Compatibility alone restricts the global
grid and is not inferential precision. Weighted b8r4 BBBB/all-M/tau=0 has
p_sup=1/35, excluding zero at 1/20; tiny designs may retain all KTargets.

## Joint checks and boundaries

For family alpha 1/20 and 1/10, each marginal uses family alpha/2. By the
union bound joint containment is at least 1-family alpha, without endpoint
independence. Stress checks are exactly 108 zipped cases, not the Cartesian
product of all endpoint tables: six templates times original/inverted quality
times nine designs. Repeat/truncate these ordered pairs to N:

| Template | Usage (A,B) | Quality (A,B) |
| --- | --- | --- |
| 0 | (0,0) | (0,0) |
| 1 | (2,2) | (1,1) |
| 2 | (0,2) | (0,1) |
| 3 | (2,0) | (1,0) |
| 4 | (0,1),(1,0),(1,2),(2,1) | (0,1),(1,0),(0,1),(1,0) |
| 5 | (0,0),(1,1),(2,2),(1,1) | (1,0),(0,1),(1,0),(0,1) |

Keep distinct template IDs even when truncation produces identical values.
Reject partial/missing/error/excluded/unmeasurable usage, missing/pending quality,
actual-only grouping, adaptive enrollment, carryover, informative stopping,
non-prefix masks, malformed identities/labels/lattices, real origins and unknown
command arguments. No imports, seeds, alpha overrides, DB or sessions.

[R05/R09/R10](../requirements.md) remain binding. Ratios, MNAR, real token scales,
criterion fulfillment, quality margins, carryover, adaptive stopping, adoption
and actual experiment admission require later validation. Production reports
retain null inference, partial usage and real_experiment_disabled.
