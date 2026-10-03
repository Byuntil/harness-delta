# Flexible model comparison workflow

The v2 workflow keeps a task's original A/B harness assignment when model or
reasoning effort changes. Runtime choices are descriptive policy outcomes; they
never allocate another task or reset followup. V1 fixed configuration and frozen
reports remain readable unchanged. Use Node 24 and `npm run build`.

## Inputs and scope

Use a dedicated synthetic store. Registration and offline synthetic tests require
no product executable or model request. The production flexible collector registry
is empty. Candidate parsers for Codex CLI 0.158.0 and Claude Code 2.1.283 are
synthetic test candidates, not admitted sources. The existing v1 partial adapters
remain separate. No desktop/app support or complete usage is inferred.

Register v2 variants with `schema_version: 2`, `id`, `harness_version`,
`instruction_manifest_hash`, `policy_version`, `policy_status: eligible` and
`runtime_policy: flexible`. These variants have no fixed product/model/effort.
Use identifiers and hashes only, never instruction text or source paths.

A v2 protocol retains the [existing required protocol fields](task-comparison.md#preregister-and-freeze-the-protocol),
with `schema_version: 2`, `primary_metric: standardized_cost`,
`runtime_policy: flexible`, `estimand: registered_task_mean`, `price_table_id`,
`planning_basis_id`, `collaboration_policy_id` and explicit `source_profiles`.
Each source profile contains product, exact product_version and profile_id. For
synthetic validation use synthetic / 1.0.0 / synthetic-flexible-v1. Each stratum
contains exactly one assignee. planning_basis_id must match sample_plan.planning_basis_id.
Participants, environments, followup, recruitment dates, minimum_effect,
quality_margin, sample plan and sensitivity plans are required user selections.
No price, duration, savings target or sample count is supplied by the product.
Freeze before recruitment. Cost and coverage use [assigned_at, min(cutoff, followup_ends_at)); a delayed task start never removes earlier gaps. Active and elapsed time start at task start. Assignment and usage/evaluation endpoints are half-open.

Task creation through comparison assignment uses schema_version 2 and task
metadata schema_version 2 with initial_model nullable, replacing v1 model.
The flag-based task register command remains v1. Null means unknown, not zero.

## Immutable prices and commands

Provide a strict price-table JSON file with id, version, currency (three uppercase
letters), source_id, as_of (UTC), positive integer unit_tokens, display_decimals,
rounding: half_even, and entries. Each entry contains product, model, component
(ordinary_input/cache_read/cache_write/output) and a nonnegative decimal string
price_per_unit. Duplicate keys and changing an existing table ID are rejected.
Select and document your prices explicitly; no current market prices are fetched.

```sh
hm --db .harness-delta/demo/local.sqlite price-table register --config prices.json
hm --db .harness-delta/demo/local.sqlite price-table show prices-1
hm --db .harness-delta/demo/local.sqlite variant register --config variant-a.json
hm --db .harness-delta/demo/local.sqlite variant register --config variant-b.json
hm --db .harness-delta/demo/local.sqlite comparison register --config protocol.json
hm --db .harness-delta/demo/local.sqlite comparison freeze comparison-1
hm --db .harness-delta/demo/local.sqlite comparison assign --config assignment.json
hm --db .harness-delta/demo/local.sqlite task config-history task-1
hm --db .harness-delta/demo/local.sqlite comparison readiness comparison-1
hm --db .harness-delta/demo/local.sqlite report task task-1 --cutoff 2027-01-02T00:00:00Z
```

Create the local directory and register the project first, as in the existing
runbook. Replace identifiers and cutoff with your selected inputs. CLI commands
register and report metadata; they never launch model tasks automatically.
Synthetic runtime/session injection is test-only, not a production link bypass.

## Meaning of the results

Cost is a standardized estimated amount under the embedded immutable table and
formula, not actual billing, subscription savings or labor cost. Disjoint billing
components are priced once; cached and reasoning tokens are not added twice.
Ambiguous model transitions and unpriced models have null complete amounts and
fixed reasons. Known priced components can contribute descriptive partial cost.
Decimal160 arithmetic retains guard digits for repeating divisions; display uses
half-even rounding after aggregation. See [cost coverage](../decisions/flexible-cost-coverage.md).

Each original assignment remains in its arm: successful, failed, aborted,
not started and outcome missing. Followup pending remains provisional. Any
incomplete task suppresses the whole-cohort primary mean and relative change;
partial means are descriptive. Zero baseline and empty arms have no ratio.
Quality criteria, first success, rework, active time and elapsed time are separate.
Elapsed time is not human labor. Frozen snapshots preserve cutoff, receipt-time
boundary, actual price contents/hash and formula. Late arrivals require a new
revision and never mutate an earlier report.

The [file exchange workflow](team-file-exchange.md) also accepts v2 data packages.
Only allowlisted task metadata, runtime summaries and cost provenance are shared;
local sessions, requests, event identities and detailed runtime history are omitted.
V1 deletion notices invalidate either data version. Same-ID price conflicts
quarantine the protocol. Deletion and retention purge derived cost/runtime/header
and team snapshots and reject replay. Team completeness and historical team
assignment denominator remain unavailable even when all declared writers respond.

## Preparation gates and followup

Readiness reports real_allocation, complete_cost and inference independently.
Production source/analysis registries are empty: a valid real protocol cannot
start real allocation. Stored cost facts remain unknown until a validated producer
exists. Synthetic data cannot be converted into a real experiment store; a future
approved real workflow requires a separate empty store and source/operations gate.
Complete cost also requires all metric/window facts, while inference additionally
requires an approved method. Neither completeTotals nor causal adoption is enabled.
See the [analysis boundary](../validation/flexible-cost-analysis-boundary.md).

Further validation requires separate approval: exact source versions, model/effort
switches, request retries, children, compaction, terminal accounting and durable
flush; then a continuous-cost/repeated-person method and selected experiment
inputs. This implementation does not run conformance, admit profiles, change
authentication or execute a real experiment.
