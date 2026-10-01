# Explicit metadata file exchange

Requirements: [R02/R04/R05/R06/R07/R09/R10](../requirements.md).

The version-one exchange is an offline synthetic workflow. Real experiments,
complete usage/cost and inferential adoption remain disabled. Sharing is explicit;
installation and project registration do not upload or collect anything.

## Producer boundary

Register one immutable namespace UUID, shared project UUID, local project/protocol
and owned strata in a dedicated synthetic store before creating tasks. The store
must have exactly that project, no tasks, sessions/events, prior tombstones or
snapshots. Identical registration retry is permitted. Historical onboarding is
unsupported: old opaque tombstones cannot reconstruct deleted ownership.

Export from an existing valid frozen comparison snapshot. The strict versioned
package contains frozen protocol/variant metadata, original committed assignment,
canonical/alias identities and task-level human/partial-usage evidence. It excludes
raw DBs, prompts/responses, instruction/source content, criterion text, code commit
IDs, paths, secrets, sessions, source keys, epochs and private allocation queues.
Identifiers are declared non-content metadata; syntax alone cannot detect a secret
encoded as an allowed identifier. Never place private text in identifiers.

Input rejects unknown fields recursively, duplicate JSON keys, invalid timestamps,
unsafe/negative counts, files above 16 MiB and more than 10,000 assignments.
Cached input and reasoning output remain subsets, not extra token totals.
Only synthetic randomized-task protocols are supported.

The first export seals task identity in separate immutable sharing records.
The code-point-smallest logical key is its deterministic representative, not proof
of the first historical key. Other keys are aliases. Alias extension after sealing
fails; already-known-key retries work. Existing duplicate-identity detection runs
before sealing checks. Package identity capture time is separate from evidence
snapshot evaluation time. Imported metadata must never consume allocation slots.

Package UUID plus normalized digest identifies a retry. Producer revision is a
safe increasing integer. An identical retry reconstructs identical bytes from
frozen evidence and sealed identity, without retaining a second full payload.
Files are written privately and published atomically without conflicting overwrite.
A crash after receipt commit can retry the same package UUID.

## Deletion and invalidation

Task deletion, explicit retention and identity conflict write opaque terminal scope
notices in the source transaction. Source deletion retains its existing local
lifecycle semantics for surviving tasks. For exchange, any covered deletion/conflict
permanently retires the entire comparison. The destination must purge all imported
protocol evidence and dependent snapshots, including remaining arms; no hidden
counts or payload hashes may survive. Project deletion dominates with one compact
project notice. A namespace represents only one project/protocol, so transmission
remains bounded regardless of lifetime task/alias tombstones. Opaque local denial
keys and scope markers are never pruned in this version.

Deletion-only export works after project deletion and restart. Old data package
retries fail after invalidation. Local deletion cannot erase previously exported
files or remote copies; recipients must explicitly import the notice.

## Delivery stages

Producer export, authorized atomic import and frozen team reporting are available.
Exported files alone are not a team report.

## Authorized import

Import is now available. Register the destination project and an immutable mapping
of shared project/protocol to it, a canonical protocol/variant digest, and exactly
one namespace/allocator per stratum. Namespace IDs are static declarations, not
credentials or signatures. Offline files cannot prove sender authenticity, absence
of cloned writers or team completeness. Same-stratum multi-device writing and
handover are unsupported. One namespace remains bound to one project/protocol.

All data goes into separate exchange tables. Source tasks, sessions, events,
protocol freezing and allocation state are untouched. Identical replay is a no-op;
a newer revision replaces the writer's full contribution. It cannot omit prior
tasks, change original assignment/identity/criteria or rewrite a final human result.
Same-snapshot evidence cannot mutate. Canonical task/alias and committed slot
conflicts never silently overwrite or add usage. Durable identity conflicts retire
the involved imported comparison scopes with fixed diagnostics.

Parse and verify authority before mutation. Valid terminal notices are applied
before live rows and before replay detection in an immediate transaction. A valid
notice may commit while conflicting/stale live data is rejected; the explicit
`deletions_applied_data_rejected` receipt and nonzero CLI exit distinguish this from
success. A storage failure rolls back everything. No rejected payload is retained.
ANY pinned writer may retire its protocol or delete the shared project. This is a
conservative declared-team authority policy, not remote authentication.

Local `exchange delete-task` targets imported data only and takes the same whole-
protocol purge path. A colliding local source task is unaffected. Imported retention
has its own explicit days policy; only a known finalized time can select a task.
If one task expires, its entire imported original comparison is retired. No default
period, background cleanup, or imputed finalization time exists. Local destination
denial is not exported pretending to be a producer. Explicit local project deletion
removes local and mapped imported evidence in one transaction.

## Frozen team descriptions

An explicit snapshot request pins the shared project/protocol, common source
cutoff, coordinator receipt boundary `as_of`, and the entire mapped writer set.
All current source contributions must match the cutoff and have arrived by as_of.
Only the current revision vector is captured; discarded previous imports cannot
be reconstructed with a historical as_of. Previously saved snapshots remain
immutable until retirement. Sources disclose their evaluation and identity capture
times separately; occurrence cutoff is not historical knowledge.

Team completeness is always unverified and the team-wide assignment denominator
is null. Declared writer coverage is separately complete/partial with missing
namespace IDs. An absent writer is never an observed zero. At least one accepted
contribution is needed for protocol metadata; that contribution may contain zero
assignments. The report keeps every imported original assignment, including
never-started and pending follow-up, and retains partial/missing/observed-zero and
component status counts. Complete token totals, cost, change rate, confidence
interval and p-value remain null; adoption stays inconclusive.

The pure summary arithmetic is shared with local reports. New team blocks use
stratum plus block ID; legacy local grouping/output is preserved. Recruitment
registration activity is unavailable because it is outside the sharing schema.
JSON and Markdown use the same frozen values. Snapshot hash/input/report/vector
and dependencies commit atomically; same ID/request returns the stored result,
changed requests conflict, and later imports need a new snapshot ID. Retirement
purges all those payloads and sequence records, retaining only an opaque snapshot
ID/reason marker. No hidden arm totals or report hashes remain.
