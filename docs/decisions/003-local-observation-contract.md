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
