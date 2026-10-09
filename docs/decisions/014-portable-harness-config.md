# ADR 014: Portable harness snapshots and private measurement bindings

Status: Accepted

## Context

R01, R02, R04 and R09 require explicit configuration identity and reproducible
comparison preparation. Existing reviewed local UI profiles contain executable
paths, project identities and runtime settings. Copying them across computers
cannot establish local registration or native support. A separate portable
artifact is needed for selected existing harness instructions and related files.

## Decision

Keep user-selected originals in the project. Publish byte-preserving snapshots in
`harness-config/<version>/`, with `harness.md`, `README.md`, `manifest.json` and
only explicitly selected related files. The version directory is immutable.
`harness_id` remains an explicit manifest field; version directory names must be
unique within a repository. `comparisons` is reserved as a directory name.

Format-1 manifest fields are `kind: harness-delta.harness`, `schema_version: 1`,
`harness_id`, `version`, `policy_version`, `base`, `artifacts`,
`instruction_manifest_hash` and `bundle_hash`. A base is null or a direct
`{harness_id, version, path, bundle_hash}` reference. Each artifact is
`{artifact_id, role, path, source_path, sha256}`. Roles are `instruction`, `tool`
and `documentation`. Instruction artifacts are Markdown; at least one targets
`harness.md`. The supplied README is also hashed. `source_path` identifies the
selected original file relative to the project root. Packaging checks the direct
base pin; it does not resolve a dependency closure.

The portable pair at `harness-config/comparisons/<id>.json` has
`kind: harness-delta.comparison`, `schema_version: 1`, explicit `id`, `name`,
ordered `arm_a` and `arm_b` references, `application: selected_markdown_only`
and `settings_hash`. It pins a configuration pair, not an experimental study.
It contains no local project/variant/protocol/price identities, credentials,
absolute paths, runtime choices or source-session references.

### Canonical identity and publication

Canonical metadata uses UTF-8, NFC string values, ASCII object keys sorted by
code unit, compact JSON and safe integer numbers only. Reject duplicate JSON
keys, NUL, unpaired surrogates, unsupported schema fields and negative zero.
Artifacts are sorted by artifact ID. Preserve array order for ordered arms.
Hash the canonical document without its own digest or the file's final LF,
prefixed with `harness-delta:bundle:v1\n` or
`harness-delta:comparison:v1\n`. Nested references pin validated manifests.

Artifact bytes are never normalized. Preserve the existing instruction digest:
SHA-256 of compact JSON for sorted `{artifact_id, sha256}` instruction rows.
Tools affect `bundle_hash` even when the instruction digest is unchanged. These
hashes are integrity pins, not authenticity signatures or proof of tool use.

Bound artifacts to 256 files, 1 MiB per file, 16 MiB total, and JSON to 1 MiB.
Paths use portable ASCII components under an explicit canonical root. Reject
absolute paths, empty/dot/traversal components, backslashes, percent escapes,
Windows device names, symbolic links and case-folding collisions. File reads are
bounded and check component/file identity before and after reading. Selected
inline Markdown links must resolve to included snapshot files; command strings,
reference-style links and external dependencies are not fully parsed or verified.

Stage complete version directories and publish with a version lock; concurrent
publication fails closed. Descriptor and private-file publication uses a flushed
exclusive temporary file and a no-clobber link. Interrupted staging is ignored.
Identical repeats are no-ops. Changed bytes under an existing version or pair ID
are explicit conflicts; no overwrite or "latest" fallback is performed.

### Local UI resolution and task pins

The setup picker recognizes a portable pair and previews validated snapshots,
separate A/B original-tool compatibility, registered projects and compatible
reviewed templates. It reads no sessions and creates no tasks. The preview pins the descriptor and
reviewed template hashes; changed content requires a new preview. The user selects
a registered local project and an existing reviewed template explicitly.
Require a frozen compatible protocol and ordered variants matching instruction
hashes and policy versions. Keep each local variant-to-bundle association
immutable. Missing registrations remain blockers; import creates no project,
variant, protocol, price table or statistical defaults.

Write resolved profiles as immutable private
`.harness-delta/setup/<comparison-id>-<revision-hash>.json` documents. Include
exact local paths, identities, reviewed template digest, runtime settings and
shared pins. Private digest serialization sorts keys while retaining exact
filesystem strings. A new reviewed/runtime binding creates another profile;
existing task pins never change. The UI database indexes profiles and task labels.
Portable startup fails when no binding exists or multiple revisions match;
`--setup-binding-revision shared-<revision-hash>` explicitly selects one. The UI displays revision, template and runtime identity.
Deleted-project profiles are excluded from startup after re-registration; their
private immutable files remain local for deliberate retention or cleanup.

Before preparation, reserve opaque task/logical/alias IDs and write a private
task journal pinning the profile's exact bytes. Persist an opaque Store
reservation before any assignment/preparation so non-UI readers recognize shared
tasks. A pending or partially prepared task stays visible for same-ID explicit
retry after restart. Recovery requires the original immutable journal; changed
or missing private files fail closed. It does not generate a replacement pin.
Task deletion removes its Store marker; project deletion removes reservations.
Tombstones prevent cached reservations from reviving deleted identities.

### Observation boundaries

Recheck both complete snapshots and the task's exact private profile before
preparation, application, new-session instructions, connection and observation.
After assignment, also check the assigned arm's explicitly selected original
tool bytes. Shared source paths can match B while mismatching A. Retain the
assigned arm and task identity on mismatch; do not execute, restore or rewrite
tools. Correction is manual and continuation requires an explicit action.

The common preparation guard runs before and after source reads in both the
external root adapter and ordinary family binding coordinator. Drift discards
uncertain in-flight batches, records observation uncertainty and pauses active
scope. Recheck outside adapter transactions to retain the fence after rollback.
Keep prior observations, partial cost, outcome, window and assignment readable,
including after private setup deletion. No automatic resume or interval backfill.

Only opaque project/task identities and integrity digests enter the measurement
reservation table. Instruction/tool contents, private paths and resolved runtime
binding documents remain outside measurement exports and reports.

## Consequences and verification

Repository reference packages `harness-register` and `harness-compare-config`
call the DB-free built authoring CLI with explicit root/input/tool paths. They
are not automatically installed. No personal plugin or global configuration is
required. The [runbook](../runbooks/harness-config.md) documents generation and
local binding prerequisites; its [Korean pair](../runbooks/harness-config.ko.md)
uses identical commands and JSON identifiers.

Synthetic tests cover deterministic cross-root generation, raw-byte hashes,
repeats/conflicts, path and link failures, private revisions, task interruption,
UI transport and both observer boundaries. Local checks do not qualify new
native products, versions, startup ordering, actual tool use or dependency
functionality. Preserve R02/ADR 013 forward-version labels, R07 partial-cost
limits and R10 statistical validation gates. This feature enables no inference
or real-experiment readiness by itself.
