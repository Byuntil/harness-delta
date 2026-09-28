# Internal managed observation lifecycle

Status: synthetic offline implementation; no real producer or complete reporting enabled.
Requirements: [R01–R05, R07 and R11](../requirements.md).

## Scope and producer boundary

The internal `ManagedObservation` controller owns one fresh synthetic session and
one submission. It is not exported from the package entry point and has no CLI.
Existing polling, adapters and report schemas are unchanged. Managed sessions have
no source path, so the polling collector cannot open their channels. Their usage
enters the existing event store as partial data; `complete_tokens` remains null.

Only product `synthetic`, version `1.0.0`, profile `synthetic-managed-v1` are
accepted. The transport exposes an exact session/product/version/model descriptor
without content access. The controller validates it against the active task before
preparation and checks its identity again before release/read. A real producer
cannot gain support by supplying that descriptor: this protocol is a trusted,
injected offline model, not a production process adapter or security sandbox.

`prepare()` installs the observer without reading content or releasing requests.
Only after the durable project/task/session/run linkage and observer readiness
may `submit()` commit submission intent. A second SQLite writer transaction
revalidates scope and holds the lock through synchronous `release()`. This is the
release linearization point: another connection cannot finalize/delete/recover
between the scope check and request release. Transport callbacks must be bounded
and non-reentrant; release cannot read content or call lifecycle methods. A crash
between committed intent and release is uncertain, never an automatic retry.
Timestamps alone, including equal timestamps, cannot prove this causal order.

A partial unique index permits at most one open run per task. Every run has a
unique new session; an existing session is never adopted. An instance is bound to
its task/session/run tuple. Reusing a deleted run ID under a different task cannot
authorize the old instance. Explicit `recoverManagedRuns` fences open runs by
interrupting them durably; it is a takeover decision, not automatic crash detection.
Old owners cannot read or submit at their next operation. Recovery never resumes
a transport, imports a stale queue or reads offline usage. New work needs a fresh
session. No background collection starts when the module is imported.

## Delivery and terminal accounting

The synthetic channel returns at most 256 metadata envelopes per synchronous,
non-destructive read. It must retain them until acknowledgment after the database
commit. Usage carries a positive sequence, immutable request identity, occurrence
time and the existing strict usage payload. Totals use nonnegative safe integers;
observed cache/reasoning subsets cannot exceed their observed enclosing totals.
Only matching product/version/model and timestamps within the submitted interval
are accepted. No envelope is inferred from silence, including an observed zero.

Exact replay is idempotent. A changed request identity, sequence, timestamp or
usage component rejects the whole batch, preserves earlier committed usage and
interrupts the run with identity violation. Event and request-evidence inserts,
terminal metadata and sealing share one transaction. Memory and transport queues
do not advance on rollback. Conflict taint is persisted after rejecting the batch;
if even that write fails, the local instance is permanently blocked and the
unresolved durable run requires recovery. No failed commit can certify flush.
An acknowledgment error is replay-safe: committed data remains, and an open run
is interrupted. An already sealed run stays sealed because its terminal evidence
is durable independently of queue cleanup.

`exit` begins drain; it never proves final accounting. `terminal` supplies an
inclusive final sequence; equal replay is allowed, contradictory watermarks are
rejected. Records may arrive out of order, including after process exit. `end`
is the channel's irreversible end and must be the last envelope. Sealing requires
all sequences 1 through the watermark, no records beyond it and a durable commit.
Watermark zero with no records is valid closure but remains missing usage.
EOF without terminal metadata or with a sequence gap interrupts coverage.

The owner must call `poll()` to service delivery and deadlines. Both run and drain
limits are explicit positive integer milliseconds, bounded to one day; there are
no default timeouts or automatic timers. Limits bound acceptance when polled,
not wall-clock process execution if the owner stops polling. The synthetic
transport must itself guarantee finite reads; no real-process timeout enforcement
is claimed. Clock regression stops reads. Repeated quiet polls or stop requests
cannot extend an existing drain deadline; data at/after the deadline is excluded.
A real controller crash is handled by recovery. `stop('crash')` models a producer
crash while the observing controller remains alive and can drain.

## Lifecycle, evidence and deletion

Cancellation, timeout and producer crash taint continuity and request a stop;
known late usage may still drain while the task remains active. Clean terminal
closure cannot undo that taint. Pause or direct human finalization immediately
interrupts open runs in the same lifecycle transaction, revoking future reads and
queued writes. Finalization rollback also rolls back the interruption. Previously
committed usage survives as partial; late unobserved usage is not backfilled.
Human outcomes are never inferred from channel closure or process success.

Preparing/running/draining terminal and flush facts are pending `unknown` states.
Only successful closure resolves them. Failures interrupt the run, making its
unknown/violated facts completed and immutable. Completed interval facts merge
using the [B1 policy](004-complete-measurement-readiness.md); a later clean run
cannot repair them. Task projections never merge pending facts into durable
completed evidence, and pending runs cannot downgrade an earlier violation.
The controller leaves fixed-model qualification, topology, request universe and
counter semantics unknown. Synthetic terminal closure is not proof of provider
billing completeness. Evidence and presence remain metric-specific.

Migration 004 adds `observation_runs` and `observation_records`. One run is one
observation interval. Run identity, scope, generation and profile are immutable;
record updates are forbidden. Fields are limited to IDs, timestamps, closed
states/reasons, sequence/watermark, channel-ended boolean, exact B1 fact vectors
and the existing strict usage payload. Stored fact keys use snake_case; the B1
TypeScript interface retains camelCase. No raw stream, stderr, source content,
content hash, prompt, response, secret, path or arbitrary exception text is stored.
Diagnostics are fixed codes. This is internal storage, not a new exchange schema.

Task/project deletion cascades to runs and records. Existing session/task/project
tombstones reject reconstruction, and queued operations must still match a live
run and generation. Existing explicitly configured retention removes evidence
with finalized tasks; active tasks remain retained. There is no new default
retention or additional tombstone category. File-import and remote-sync support
remain outside this implementation.

## Producer qualification still required

The [Claude CLI reference](https://code.claude.com/docs/en/cli-reference) documents
a preassigned session UUID and stream input/output. The
[programmatic guide](https://code.claude.com/docs/en/headless) describes streaming.
These are candidate interfaces, not proof that pinned Claude Code 2.1.283 provides
the synthetic barrier, exhaustive request coverage or terminal watermark here.
The [Codex App Server](https://learn.chatgpt.com/docs/app-server) separates
`thread/start` and `turn/start`, making it an alternative submission boundary;
this does not qualify the pinned Codex version or desktop integration.

Before any real producer runs, separately approve its product/version/model,
metadata decoder, process ownership, finite live budget and stop conditions.
Validate scope before content access, first-request accounting, failure/retry and
auxiliary requests, inclusive counters, children, compaction, routing and final
flush. Never omit an unobserved warm-up request. No telemetry or product invocation
was needed for the synthetic tests. See the existing
[capability limits](001-adapter-capabilities.md).

`tests/managed-observation.test.ts` covers the causal barrier, revocation,
late terminal delivery, identity conflicts, rollback, competing connections,
restart fencing, deletion, retention and unchanged partial reporting. These are
offline protocol tests, not product capability evidence or A/B qualification.
