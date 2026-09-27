# Offline coverage evidence policy

Status: internal synthetic policy implemented; no complete product measurement enabled.
Requirements: [R01–R05, R07 and R11](../requirements.md).

## Purpose and boundary

The existing adapters produce partial observations. Their baseline exclusions,
uncertain intervals, request topology and terminal accounting do not establish
whole-task coverage. This decision adds a pure evaluator of supplied evidence
states, not a collector or a source of truth. It performs no I/O, calculates no
tokens, and is not exported from the package entry point. There is no CLI,
storage, report-schema or collection-scope change.

Only the internal `synthetic-coverage-v1` profile is accepted. Its `eligible`
result means that a synthetic evidence vector satisfies this policy. It does
not certify a real task, validate a product, or enable `complete_tokens`.
Existing task and period reports remain partial/missing, including finalized
successful tasks. Complete totals remain null.

## Required evidence

Input and output totals are evaluated independently. Each vector requires all
eleven facts, each in one of `verified`, `unknown`, or `violated`:

| Fact | What a future validated producer must establish |
| --- | --- |
| `scopeBeforeAccess` | Registered project, active task and exact linked source before content access |
| `freshSession` | Fresh task session without unobserved prior work |
| `readyBeforeFirstRequest` | Observer ready before the first request, including startup/context usage |
| `continuousObservation` | No pause, offline, restart or uncertain gap in the covered work |
| `fixedModel` | Verified product/model configuration throughout the measured work |
| `boundedTopology` | All eligible work accounted for within the supported topology, including auxiliary requests |
| `requestUniverse` | All eligible requests/attempts, including failures and rework, accounted for |
| `terminalAccounting` | Final usage accounted for; process exit or quiet polling alone is insufficient |
| `immutableIdentity` | Stable identities distinguish exact replay from conflicting evidence |
| `durableFlush` | Eligible observations and evidence persisted successfully |
| `counterSemantics` | Inclusive counter meaning validated for this metric without double counting subsets |

Every fact must be verified and `hasObservedValue` must be true. Presence may
represent an observed zero; absence is not zero. The evaluator receives no token
value and does not validate zero provenance or arithmetic. It returns all
nonverified fact names plus `missing_value` when appropriate, sorted lexically.
Unknown profiles, metrics, keys, omitted fields, invalid states and nonboolean
presence fail with the fixed error `invalid_coverage_input`; raw input is not
included in diagnostics. Human outcome is not an evidence field and cannot
override incomplete measurement.

`mergeCoverageFacts` combines completed interval facts independently using
`violated > unknown > verified`. Neither input is mutated. Unknown evidence
and known violations remain sticky when later completed intervals are clean.
Pending in-flight evidence is outside this merge contract. The helper does not
establish interval identity, scope, order, or observation continuity; a future
controller must validate those before merging. No offline backfill is permitted.

## Verification and remaining gates

`tests/coverage.test.ts` exercises all gates, malformed evidence, independent
metric decisions, missing-value presence, deterministic reasons, and completed
interval merges. These are fact-policy tests. They do not prove first-request
barriers, no unauthorized source reads, delivery reliability, retry accounting,
token arithmetic, deletion, or transaction behavior. The report regression in
`tests/reports.test.ts` verifies that known synthetic usage and a finalized
success still do not become complete totals.

Production enablement requires a separately approved, version-specific producer
contract and capability evidence for scope, first request, exhaustive accounting,
terminal closure, counter meanings and durable storage. Unsupported children,
compaction, model changes, retries and gaps must remain explicit. A later clean
interval cannot repair missing task usage. Deletion must remove any future
durable evidence and prevent queued data from resurrecting it.

No real product profile is enabled here, and callers cannot promote one by
supplying a different profile ID. See the existing
[capabilities](001-adapter-capabilities.md) and
[observation contract](003-local-observation-contract.md).
Randomized comparisons still require the independent R09/R10 gates; synthetic
eligibility does not justify token savings, API cost or subscription-limit claims.
