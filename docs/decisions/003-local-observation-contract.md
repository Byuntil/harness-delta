# Local observation and diagnostic metrics

Requirements: R01–R07 and R11. This specifies the approved initial scope, not a
blanket support claim for all Codex/Claude versions and execution modes.

Collection requires an explicitly registered project, active task and linked
session/source mapping before any source-content read. The mapping and local
paths remain local configuration. A collector starts a new observation interval
and baseline on every launch and pause/resume boundary. It never backfills a gap.
Unsupported topology, format, counter changes and compaction must be detected or
coverage must remain unknown; they cannot silently produce complete task totals.
Known partial data survives alongside missingness reasons. App and descendant
support must have separate evidence; inherited context is not itself a duplicate
request. Existing [capability evidence](001-adapter-capabilities.md) remains binding.

Tool counts use unique logical invocations at the adapter's documented boundary.
Lifecycle records, progress notifications and replay of one invocation count once.
Do not add a wrapper's count to its nested operation count. Distinguish confirmed
execution failure from denial before execution, cancellation, validation failure,
and unknown completion. Test failure is an outcome of a check, not automatically
a broken tool. Search/read classification is available only for recognized,
validated operations; arbitrary shell text is not sufficient evidence.

Task elapsed time spans start to finalization (or a disclosed report cutoff).
Active time is the union of explicitly active task intervals, excluding pauses;
it is not model runtime, human labor, or a sum of parallel agent times. Model
runtime remains unavailable without evidence. First completion is a declaration,
its assessment is human-supplied, and final outcome is separate and immutable.
An automated oracle pass must not finalize a task. Unreached milestones have null
values with a reason and observation window, never zero. Exact redundant reads
and context expansions are deferred until their identity/context evidence exists.

Retention must be explicitly configured as a positive number of days. It applies
to finalized tasks whose finalization is at or before the cutoff, through the
same transactional deletion/tombstone path as explicit deletion. Active tasks
are retained. Identifier tombstones prevent accidental local reuse; file-import
and remote deletion guarantees are not implemented until their respective gates.

Reports disclose eligible/outcome counts, complete versus partial usage, missing
reasons, tool classification coverage and observation windows. Failure/rework
usage remains in operational cost. No success denominator yields null. Partial
observations cannot become complete cohort means. Counts describe workflow,
not a quality score: fewer reads or earlier edits need not be better. Period
comparisons are observational and must not claim causal savings.

Only allowlisted IDs, categories, states, timestamps, counts and durations enter
measurement records. No raw arguments, commands, patterns, outputs, patches,
source hashes or exception text. Reports and shared records exclude local paths.

## Collector failure diagnostics

`Collector.tick(taskId)` returns an array of committed failure diagnostics for
that tick. Each object contains only `session_id`, UTC `at`, and a fixed `category`.
An empty array means no diagnosed failure in that tick, not complete coverage or
proof that any source was read. A failed transaction throws `collection_error`
and returns no diagnostics. The CLI and task report keep the existing observation
reasons; this return value is an opt-in local diagnostic interface, not new report
fields or automatic telemetry.

| Category | Established condition |
| --- | --- |
| `read_failed` | Source reader failed without a more specific recognized category |
| `short_read` | Reader reached EOF before the initial file size |
| `unstable_read` | Size or modification time changed during a bounded read |
| `unsupported_source` | Unsupported file kind, size, version, or parsed value |
| `scope_mismatch` | Parsed source identity disagrees with the linked scope |
| `invalid_json` | A complete source line is invalid JSON |
| `record_conflict` | One snapshot contains conflicting normalized records for one key |
| `parse_failed` | Other unclassified parser failure |
| `identity_changed` | File identity changed since the prior checkpoint |
| `source_truncated` | File size decreased since the prior checkpoint |
| `same_size_modified` | Unchanged file size with a changed modification time |
| `clock_regressed` | Tick cutoff precedes the prior cutoff |
| `model_mismatch` | Source product/model disagrees with fixed task metadata |
| `record_changed` | Previously fingerprinted metadata changed or disappeared |

Categories identify the detected condition, not necessarily its underlying cause.
File continuity checks precede parsing; only the first detected condition is
reported. A same-size modification does not prove benign touching or malicious
replacement. Unstable reads are rejected. Errors invalidate the in-memory and
durable cursor; subsequent reads establish a new baseline and never backfill the
uncertain interval. Diagnostics contain no paths, content, hashes, raw errors,
arbitrary source types, arguments, or payload dumps.
