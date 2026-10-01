# Local task comparison workflow

Status: synthetic workflow and assignment descriptions; real experiment activation disabled.

Requirements: [R01–R05, R07, R09 and R10](../requirements.md).

The existing CLI registers measurement tasks, links explicitly selected supported
sessions, collects partial usage and records human outcomes. The comparison workflow
adds immutable harness configurations, complete protocol freezing, declared logical
task identities, durable task allocation and manual configuration evidence.

This batch is an offline workflow foundation. Only `synthetic_validation` protocols
and synthetic tasks in a dedicated validation store can receive assignments. Real
protocols can be registered and frozen for review, but cannot allocate. A schema
flag, claimed analysis version or successful synthetic test cannot enable real
experiments. Analysis validation, explicit real experiment inputs and end-to-end
readiness remain gates under R09/R10.

## Configuration and protocol contracts

Configuration versions contain opaque IDs, reviewed instruction-manifest hashes,
exact product/version/model/reasoning settings and a declared policy eligibility
version/status. Registration validates metadata, not actual application or safety.
Unknown product versions can be described but do not become supported adapters.
`variant show` reports the independent exact file-adapter capability.

Protocols use strict versioned metadata and fixed inputs; unknown fields and content
are rejected with fixed error codes. A draft may omit fields. A frozen protocol must
supply eligibility/classification, participants/environments, A/B variants, recruitment,
strata and authoritative writers, allocation method/ratio/block size, primary/quality
metrics and margins, sample/follow-up/stopping/missingness/deviation plans, confidence,
analysis and sensitivity versions. No real inputs are filled by defaults. In this
batch the pair uses matched product/version/model/reasoning settings, balanced 1:1
blocks, fixed recruitment stopping and one allocator per explicit stratum. Broader
comparison designs require a separate reviewed contract.

Registration retries with the same parsed metadata are idempotent. The same ID with
a different payload conflicts. Even drafts are immutable; register a new protocol ID
to revise a draft. Freeze is idempotent and must occur before recruitment begins.
It verifies eligibility declarations, matching runtime settings and non-overlapping
participant/type/size strata, not a validated statistical method.

## Identity, allocation and authority

Opaque `(project_id, logical_task_id)` keys resolve to one canonical task ID.
Optional declared aliases resolve before allocation; no prompt, criterion-text,
source inspection or semantic duplicate detection is performed. Identity keys are
project-scoped while canonical task IDs are unique in the local store.

An SQLite immediate transaction resolves identities, checks fixed preregistration,
selects the stratum, consumes a private shuffled slot, creates assignment and
follow-up, and advances the allocation state. The transaction commits before the
receipt is printed. Retry after a crash, alias resolution or another experiment
request returns the original assignment without consuming another slot. Detected
reassignment requests are auditable deviations. Conflicting metadata or writers
fail; declared conflicts between already assigned identities block the affected
protocols without merging usage or choosing an assignment.

New assignment requires an unstarted registered task, eligible preregistration,
authorized allocator, and assignment time in the half-open recruitment window.
Earlier execution, changed expected metadata and out-of-window allocation fail.
Existing-assignment retries remain valid after execution or recruitment ends.
Attempts, rework and child sessions inherit assignment through the canonical task.

Each complete block contains equal A/B allocations in a cryptographically shuffled
order; incomplete blocks persist across restart. No random seed is stored. Private
pending queues and allocator positions never appear in command output. The receipt
contains only the committed current position, block ID, original variant and deadline.
Future sequence secrecy is a UI/data boundary, not protection from someone with
access to the local SQLite file. Copying a database does not authorize another
writer; this batch cannot enforce authority across independent offline copies.
File exchange and conflict reconciliation remain unimplemented.

A dedicated synthetic store rejects existing non-synthetic tasks/real source sessions
at allocation and cannot add real task or file-source data afterwards. There is no
synthetic source-reader bypass. Ordinary measurement stores retain their behavior.
The task API and CLI can exercise synthetic allocation/lifecycle; tests inject
synthetic sessions/events with fixtures. Actual Codex/Claude file collection is a
separate existing regression path and is not certified for assigned real tasks here.

## Application evidence and scope

A task's original assignment is immutable. Application confirmations are append-only
and distinguish `confirmed`, `mismatch` and `unknown`, plus their evidence method.
`self_attested` records the user's configuration declaration. Optional
`selected_artifact_hash` reads only explicitly supplied instruction files, computes
a canonical manifest hash and retains no paths or contents. Runtime product/model,
reasoning and environment settings remain declarations. Neither method proves full
isolation from memory, plugins, cache, learning or behavior.

Assigned task start/resume requires a confirmation and follows the frozen deviation
policy. A stop-policy observation pauses an active task through the normal lifecycle,
closing active intervals and revoking managed/OTel process scope. Runtime version,
model or reasoning drift stops measurement; `new_phase` never automatically creates
a new phase or reassigns the old task. Corrections are new evidence, not edits. Human finalization as `aborted` records
a cancellation deviation once; assigned-but-never-started follow-up is classified
by the assignment endpoint below.

Session binding is explicit and task-scoped. A confirmation does not silently verify
all sessions. It can reference an already linked session or be bound by ID during
supported `session link`; relationships with another task are rejected. New tasks
use fresh sessions without prior-task conversation injection. Assignment or
confirmation starts no collection. Registered project, active task, explicit
session/source link, registered source version and a running collector remain
mandatory. Desktop/interactive source support is not implied by this workflow.

## Follow-up, deletion and reporting

Assignment establishes an immutable UTC follow-up deadline. Pause, resume, retries
and rework do not reset it. Existing task/period reports keep their existing
semantics and partial usage limits; they are not randomized endpoint reports.
Assignment-based half-open endpoints and immutable local snapshots are available for
synthetic validation. Team exchange, method validation and real admission remain
subsequent batches; the endpoint contract is defined below.

Deleting an assigned task transactionally invalidates its experiment, increments
the data revision, purges the entire affected private allocation queue and removes
its identity mappings/assignment/preregistration/confirmation/deviations with normal
task-related data. Known opaque identity/alias tombstones survive to reject reuse.
No deleted-arm/group aggregate or reversible seed is retained. New assignments stop;
retained tasks may continue ordinary scoped lifecycle. Project deletion and retention
use the same path. Managed report/snapshot payloads, hashes, lineage and dependency mappings are
purged for every affected protocol in the same transaction. Dependencies include
project-registration context, including unassigned and other-protocol tasks.

Partial usage stays partial, complete totals/cost remain unavailable and no adoption
result is produced. Calls and sessions never become randomized sample units. Team
sharing will require strict allowlists, tombstone-first application, duplicate/conflict
handling and explicit authority; no network transmission is added here.

## Verification

Offline synthetic tests cover schema/immutability and v5 migration rollback,
commit/retry/reopen, aliases and cross-experiment attempts, two concurrent SQLite
writers, shuffled complete/incomplete blocks, real-allocation rejection, application
evidence/policy, scoped session binding, deletion/retention and the CLI human-outcome
flow. Source-reader, existing CLI/period reports, OTel and managed observation tests
remain regression coverage. Run focused tests and `npm run check` on Node 24.
No test spawns product CLIs or establishes experiment admission.

See [the comparison runbook](../runbooks/task-comparison.md) for input examples and
commands. Repo Map generation/query belongs to its source repository. Allocation,
application policy, session linkage, collection and comparison belong here or to an
explicitly reviewed external adapter. Docker and automatic launching are optional
future operational aids.

## Assignment descriptions and immutable snapshots

A frozen `synthetic_validation` protocol in a dedicated synthetic store can create
local reports using `comparison snapshot create`; `comparison report` renders one
persisted report as JSON or Markdown. Neither command opens session files, starts
collection or products, enables real allocation, or validates analysis methods.

The cohort includes every canonical assignment in the frozen half-open recruitment
window with `assigned_at < cutoff`. One task is one unit; aliases, sessions, attempts
and rework never multiply the sample. Original assignment is the primary grouping.
Actual declarations are supplementary histories: A-only, B-only, other-only, mixed,
or no known variant, with independent unknown-variant/runtime and drift flags.
Declaration and selected-artifact evidence do not prove complete isolation.

Each task endpoint is `[assigned_at, min(cutoff, followup_ends_at))`. Usage occurrence,
start, human assessment, first completion and rework at the endpoint end are excluded.
Finalization, pause, resume and rework never shorten or reset follow-up. Before its
fixed deadline, the task is `pending_followup`, even if human finalization already
occurred. Once mature, a qualifying human assessment yields success/failed/aborted;
otherwise no pre-deadline start yields `not_started`, and a pre-deadline start yields
`outcome_missing`. These classifications do not finalize tasks. A late start cannot
repair deadline status. Absence of success is not evidence of human failure.

Deadline-success denominator is all assigned tasks, with each category disclosed.
The rate is null while any assigned task's follow-up is pending; every arm follows
that same gate. Reports remain provisional until recruitment and every follow-up
close. Empty denominators are undefined. Assessed-first-task, assessed-criterion and
partial-observation subset denominators are explicit supplementary measures.
Incomplete blocks remain in descriptions; no future queue/order is exposed. Project
registration activity is separate context over the recruitment window: assignment
status is evaluated at cutoff, unassigned eligibility is unknown, and these counts
never enter an arm denominator.

Observed zero remains distinct from no observations, excluded, error and unmeasurable
readings. Cached input and reasoning output are components, never added again to their
inclusive totals. Partial input/output distributions describe observed subsets only;
current adapters establish no complete task totals, complete cost or savings. Confidence
intervals, p-values and adoption decisions remain unavailable/inconclusive. Reporting
correctness tests are not R10 method validation or experiment admission.

`cutoff` is the endpoint; `evaluated_at` is the actual capture time. Reports describe
records visible at evaluation, not what was known historically at cutoff. Usage has
local first-persistence receipt provenance alongside occurrence time. Pre-migration
receipt times remain unknown; replay does not invent or change them. Late-received,
authorized pre-endpoint observations can enter a new report, but missing intervals
are never backfilled. Human assessments cannot be backdated before the deadline.
Observation/active windows and lifecycle metadata are clipped to the endpoint so
later transitions cannot leak into an earlier-cutoff result.

Snapshot creation holds the SQLite writer lock while capturing allowlisted metadata,
writing inputs/output, and registering every contributing task dependency. JSON has
schema version 1 and descriptive version `assignment-descriptive-1`. Inputs and
settings use a canonical SHA-256 hash; the permitted snapshot reproduces after restart.
New arrivals or cutoffs require a new report ID and explicit parent/revision reason:
`initial`, `late_arrival`, `cutoff_advanced`, or `evidence_updated`. Identical request
retries return the stored report; changed requests under the same ID conflict.
`data_revision` remains the protocol invalidation epoch; `snapshot_sequence` orders
local captures and the input hash identifies their actual input revision. This is
local revision provenance, not a global allocator authority or validation flag.

Deletion discovers dependencies before removing tasks, including unassigned and
other-protocol recruitment contributors. It invalidates affected protocols and
purges all their snapshots/revisions, hashes, lineage, dependencies, sequences and
private allocation queues transactionally. Project deletion tombstones reports even
for empty cohorts before cascading. Retention uses the same deletion path; no default
retention is added. Identity conflicts also purge dependent reports. Only opaque
report-ID tombstones with time/fixed reason survive; they retain no task/arm mapping,
group count or payload hash. Old report reads return an invalidated/unavailable
envelope, without historical denominators. IDs cannot be reused. Unaffected reports
remain reproducible. The CLI discloses affected opaque report IDs before managed purge;
a failed deletion may disclose IDs but transactionally preserves data. Local deletion
cannot erase user-saved output, exported files or backups. No exchange/import/sync is
added; future exchange must honor these tombstones before applying old evidence.
