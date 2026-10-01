# Local task comparison workflow

Status: implementation batch 1; real experiment activation disabled.

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
a cancellation deviation once; assigned-but-never-started follow-up classification
is deferred with randomized reporting.

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
Assignment-based half-open endpoints, missing/never-started categories, immutable
snapshots, team exchange and inference are subsequent batches.

Deleting an assigned task transactionally invalidates its experiment, increments
the data revision, purges the entire affected private allocation queue and removes
its identity mappings/assignment/preregistration/confirmation/deviations with normal
task-related data. Known opaque identity/alias tombstones survive to reject reuse.
No deleted-arm/group aggregate or reversible seed is retained. New assignments stop;
retained tasks may continue ordinary scoped lifecycle. Project deletion and retention
use the same path. No randomized report/snapshot payloads exist yet; their later
implementation must extend invalidation before shipping.

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
