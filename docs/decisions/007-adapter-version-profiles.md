# Versioned file adapter profiles

Status: accepted 2026-09-29; not yet implemented.

Requirements: [R01, R02, R04, R05](../requirements.md); operating policy supports R09.
Accepting this design authorizes no live probe or support expansion; each needs
its own approval.

## Scope and profile model

Replace interleaved version checks in `src/adapters.ts` with typed source data in
`src/adapter-profiles.ts` and one generic parser per product. Scope is Codex rollout
JSONL and Claude transcript JSONL. Preserve [ADR 001](001-adapter-capabilities.md)
behavior for Codex 0.156.1 and Claude Code 2.1.283. OTel's `OtelVersionProfile`,
receiver, session inserts in `src/otel-journal.ts`, storage/export contracts and
parent/child aggregation are unaffected. Shared evidence terminology leaves room
for later OTel alignment; no shared registry is introduced.

`RegisteredFileProfile` is a readonly product-discriminated type. Exact
`(product, version)` lookup returns a registered profile or `unsupported`, without
ranges, aliases, prerelease stripping, fallback or an unverified collection mode.
Profiles are reviewed application source, never external/user-editable config.

| Data | Responsibility |
| --- | --- |
| Product and exact version | Registry identity; application Git revision identifies the interpretation, without a separate profile revision |
| Record/event classifications and counter field names | Literal source keys; recognized, excluded and blocking records; no general expression evaluator |
| `counterMode` | `cumulative_total` or `message_components`; a semantic change requires a named code variant and tests |
| Version-varying boundary and capability selections | Fixed code-level checks, not callbacks or arbitrary predicates; add mode variants only when distinct behavior is needed |
| Evidence | Public capability limits; production profiles contain no hook linkage or trust-key/hash data |

Extraction stays allowlisted. Account identity keys are privacy test sentinels and
conformance catalog entries, not a second runtime denylist. Excluded records are
classified once, without a duplicate `excludedFromSums` list. A new version covered
by existing semantics changes data, fixtures and evidence only; changed semantics
require code. Do not silently change an old variant to accommodate a new version.

**Agreed admission boundary:** Codex 0.158.0 remains unregistered until turn-ID
conformance passes. Its `ConformanceCandidate` is a separate discriminated type,
loaded only by `scripts/conformance/`. Neither lookup, `linkSession` nor
`parseSnapshot` accepts candidate objects or imports candidate data. There is no
registered-but-blocked state. A manually supplied unregistered version string cannot
enable parsing or be stored by `session link`.

## Parser and preservation contract

Keep `parseSnapshot(text, scope)`, existing snapshot/record interfaces, source keys,
payloads and metadata fingerprints. Resolve registered project, active task and
explicit session/source mapping under the collector transaction before reading.
Add registry rejection before the file reader and retain it at the parser boundary.
`session link --version` remains required manual input; reject unregistered versions
at link time without reading the file (approved CLI contract change). After
authorized access, reject mismatches with the file's version.
No check applies the file registry to OTel session insertion.

| Behavior | Codex 0.156.1 | Claude Code 2.1.283 |
| --- | --- | --- |
| Identity | Initial/repeated metadata checks `id`, canonical `cwd`, `cli_version`, `source` (`cli`/`exec`); turn context cannot change project | Identity-bearing records require matching `sessionId`, canonical `cwd`, `version`; foreign IDs fail even on auxiliary rows |
| Compatibility | Current seven top-level types, including blocking `compacted`; unknown types block; unhandled event subtypes ignored after boundary checks | Assistant/user/attachment and existing auxiliary behavior; unknown auxiliary rows yield no usage but present identity fields still trigger validation |
| Usage | Four cumulative counters: input/cached/output/reasoning; deltas only; never add last usage or secondary surfaces | Per-message ordinary input + cache creation + cache read; cache read remains the cached subset; nested iterations excluded |
| Replay | First explicit vector, including zero, emits only when model is known and snapshot unblocked; later equal vectors emit nothing | Message replay preserves original prompt origin; conflicts include timestamp, model, input components and recognized Bash IDs across polls |
| Boundaries/tools | Compaction, null totals, forks, `collab_`, overlapping turns and model changes fail closed; preserve CommandExecution handling | Sidechains/compact boundaries fail closed; preserve recognized Bash invocation/result handling and unknown outcomes |
| Reasoning | Explicit zero observed; nonzero unmeasurable, never added to output | Unmeasurable |

Pin these less visible behaviors in characterization tests:

- A Codex `token_count` before any model-bearing `turn_context` emits no record but
  advances the cumulative baseline. Later model availability does not recover that
  usage. **0.158.0 inherits this model-gated baseline after admission.**
- Counters and counter timestamps continue advancing while blocked. Blocking is
  sticky throughout a snapshot. The Collector settles its record keys without
  storing their events; a valid-looking earlier record does not salvage the batch.
- Invalid `task_started.turn_id` throws `unsupported`; mismatched completion IDs
  block. First metadata version mismatch throws `unsupported`, repeated metadata
  mismatch throws `scope_mismatch`. Existing subset checks apply to emitted deltas,
  not cumulative totals. Preserve exact errors rather than normalizing these paths.

Preserve partial-final-line waiting, malformed complete-line failures, Claude
continuity, startup/pause/restart exclusion, rollback, deletion and no backfill.
Errors remain fixed codes without source values. Zero, missing, error, excluded and
unmeasurable stay distinct; successful parsing never establishes complete totals.

## Codex 0.158.0 evidence and admission

Sanitized initial/resume evidence establishes cumulative rollout totals: resumed
total = prior total + last usage, and exec usage = rollout total. Observed types:
`session_meta`, `event_msg`, `response_item`, `world_state`, `turn_context`,
`token_usage_record`. This does not verify exceptional boundaries or descendants.

The candidate uses cumulative semantics. After admission, production reads only
`total_token_usage`, never `last_token_usage`. Require and validate
`cache_write_input_tokens` as a nonnegative safe integer no greater than inclusive
input; never add it to input or expose a new metric. Cached input and reasoning
retain their existing delta checks. Do **not** require cached + cache-write <= input:
individual subset evidence does not establish disjointness. Conformance inspects
both total and last vectors, checking each subset bound and total = input + output.
Missing required counters fail closed, never become zero.

| Gap | Handling until verified | Required evidence |
| --- | --- | --- |
| `task_started.turn_id`, `task_complete.turn_id` | Entire candidate stays unregistered | Key presence, valid IDs, paired equality and sequential origins; missing/invalid/unmatched/overlapping cases fail closed (unsupported or block, as characterized) |
| Parent/child indicators | Nested or ambiguous multi-agent indicators block; no automatic child linkage | Catalog `turn_context.turn_id`, `root_turn_id`, `collaboration_mode`, `multi_agent_version`, and `event_msg.thread_settings_applied`; conformance must establish absent or non-nested shapes, with root ID absent or equal to turn ID. Mere presence of mode/version metadata does not prove safe topology |
| `thread_settings_applied` on resume | Candidate remains unregistered until classified | Admission requires source-backed classification plus initial/resume conformance showing the event preserves the linked session, model, counter continuity and sequential topology. Record approved key names and check outcomes; absence cannot clear this requirement. Ambiguous or changed settings continue to block |
| `token_usage_record` | Entire record excluded from sums and value projection | Approved nested key inventory only; inventory alone never enables summation |
| `session_meta.session_id` versus `id` | Observed matching `id` is authoritative; ignore alternate ID, no fallback | Both key names and in-memory equality against each other/linked ID; no retained values |
| `creator_account_id`, `creator_user_id` | Never retain values or hashes | Key presence only; synthetic privacy sentinels |
| Nonzero reasoning | Reasoning metric unmeasurable; output remains inclusive; explicit zero observed | Nonzero-exercised check and inclusion evidence; zero-only runs cannot clear this gap |
| Command diagnostics | Excluded for this version | Separate synthetic command/origin/replay conformance |

Cache-write being an input subset is a fixed input from the supplied source research;
nonzero cache-write was not exercised. The [caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
and [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) support
cached-input/reasoning accounting, not universal rollout support. Admission requires
human review of turn, topology and `thread_settings_applied` classification evidence;
optional exclusions may remain. No automatic promotion, old-data reprocessing or
complete-measurement claim follows.

## Manual conformance and privacy

The repository runner lives under `scripts/conformance/`, invoked manually only,
never by CI, hooks, installation or collection. CI may run offline, synthetic
tests of the pure report projector, never the runner and never product spawning.
Inputs are exact candidate version, previous registered profile,
repository-owned synthetic scenarios, approved model/settings, turn/time limits,
dedicated project/task and explicit native-file retention disposition.

**Separate investigation path:** the runner loads `ConformanceCandidate` directly
and maintains an in-memory project/task/process/session/source mapping for the
approved synthetic investigation. It does not call `linkSession`, `Collector` or
`parseSnapshot`, write measurement events, or grant production support. It can use
pure validation/report helpers that neither import candidate data into production
nor bypass production lookup. This lets it inspect a candidate without registering
it. Establish the exact session/source mapping before opening a file.

Before any product command, including version probes, print commands/options,
synthetic request descriptions, model/settings, initial/resume plan, limits,
possible warmup/internal requests, source selection, product-created files and what
the report stores. Require typed interactive confirmation; no `--yes`, piped
confirmation or changed-plan reuse. EOF, cancellation, timeout, version mismatch,
trust prompt or ambiguous linkage stops without retries. Design approval is not
live-run approval. Never promise that requested turns bound internal backend calls.

The initial scenario is one short synthetic turn and an exact-session resume.
Claude may preassign its ID. Codex may use its own exec stream for the ephemeral ID
or, after separately approved live validation, the conformance hook below for the
exact path. The only filename search allowed is an exact-ID filename match within
a product-defined directory, without opening any candidate file. Multiple matches
or uncertainty stop the run; broad discovery by reading session contents is forbidden.

Write an atomic, restricted-permission report under the ignored work directory:
static version/scenario labels; approved structural paths and record/event counts;
fixed check outcomes (`pass`, `fail`, `not_observed`, `invalid`); differences from
previous declared expectations and, when available, a compatible prior report.
Checks cover total/last/exec equalities, subset bounds, paired identities and
nonzero reasoning. No raw usage counters or numeric token differences are stored.
Absence means not observed, not proven schema removal.

The catalog must name every key/event in the admission table, plus total/last counter
paths including `cache_write_input_tokens` and `reasoning_output_tokens`. Approved
nested `token_usage_record` paths come from public source/schema review. Bounded
traversal emits only catalog matches; unknown names are counted, never echoed
because keys can contain private data. A catalog extension needs source review and
a separately confirmed rerun. Exclusions are not extraction permissions.

No prompts, responses, instructions, source code, tool output, headers, credentials,
token values, identity values or their hashes enter reports, diagnostics or temporary
artifacts. Parse bounded raw streams transiently; never forward raw stdout/stderr or
exceptions. IDs, paths and counters used for checks stay in memory. Native product
files may contain content: disclose this separately, honor the approved disposition
only for newly created files, and never copy or delete pre-existing session data.

## Codex hook: conformance only

The per-invocation `-c hooks.SessionStart=[...]` hook is designed to provide
content-free `session_id` and `transcript_path` before file access; exec and
interactive delivery/timing remain unverified. See the version-pinned
[SessionStart schema](https://github.com/openai/codex/blob/rust-v0.158.0/codex-rs/hooks/schema/generated/session-start.command.input.schema.json).
The runner may use it for an ephemeral process/session/path mapping, retaining only
ID, path, `source` and cwd-match in memory. Missing/conflicting linkage or
`clear`/`compact`/`fork` transitions stop the initial scenario.

The runner uses **option (b)**, `-c hooks.state."<session-flags key>".trusted_hash="<hash>"`,
for our hook in this invocation only; option (a), `--dangerously-bypass-hook-trust`,
is rejected. Version-specific key/hash construction stays in `scripts/conformance/`,
not production profiles. Inference from the [hook state rules](https://github.com/openai/codex/blob/rust-v0.158.0/codex-rs/hooks/src/config_rules.rs):
this does not disable existing trusted hooks; the confirmation plan must disclose
that the user's own trusted hooks may run. Never accept persistent TUI trust or
bypass managed policy. A separately approved live check must verify key/hash,
no config write, hook delivery and request/warmup/file timing; no hook means no read.

Production SessionStart linkage is **not decided**. A separate proposal will address
its authorization, run-level session transitions and interactive scope; interactive
Codex linkage remains unsupported. This ADR authorizes no such production path.

## R09 operating checklist

Dated documentation findings (2026-09-29), not pinned-binary runtime verification:
Codex documents `-c check_for_update_on_startup=false` via its
[reference](https://learn.chatgpt.com/docs/config-file/config-reference) and
[one-off overrides](https://learn.chatgpt.com/docs/config-file/config-basic).
Claude documents process environment `DISABLE_AUTOUPDATER=1`, with
`DISABLE_UPDATES=1` also blocking manual updates in the
[environment reference](https://code.claude.com/docs/en/env-vars) and
[setup guide](https://code.claude.com/docs/en/setup#disable-auto-updates).

Before an experiment: separately verify these controls against the pinned binaries;
freeze exact product/application versions, executable provenance and model/settings;
use process-only controls without config edits; check versions before/after runs.
Channels/minimum versions are not pins. External replacement and remote model drift
remain possible. On drift, stop measurement, mark uncertainty and follow the frozen
deviation/missingness policy without relinking, backfilling or rerandomizing. This
checklist does not enable R09 or waive R10 gates. Detailed commands belong in the
later runbook update.

## Acceptance and rollout

All implementation/live evidence below is pending. Fixtures are synthetic and
version-specific; products are never offline test dependencies.

| Criterion | Public reference | Planned evidence | Status |
| --- | --- | --- | --- |
| Exact registered versions only; manual version and file-version checks | R01, R02 | Link-time rejection of unknown/range/suffix/cross-product versions; no session row or file read on rejection; collector no-read tests for unregistered versions and out-of-scope tasks | Pending |
| Candidate unreachable from production | R01, R02 | Type/import and runtime lookup/linkSession/parseSnapshot isolation tests; runner mapping cannot create measurement events | Pending |
| Existing behavior, including model-gated baseline and sticky blocking, preserved | R02, R04, R05 | Snapshot/error/fingerprint characterization; counters advance without a model and while blocked; settled keys yield no stored events | Pending |
| OTel session insertion unaffected | R01, R04 | Existing OTel journal/projection tests run without file registry dependency | Pending |
| No double counting or invented availability | R04, R05 | Cumulative resume, first-zero/equal-vector replay, Claude components/origins/conflicts, cache-write bounds, exclusions and reasoning fixtures | Pending |
| 0.158.0 boundaries fail closed | R02, R04, R05 | Turn/root-ID, collaboration/settings, missing/invalid/unsafe counters, overflow, subset, reset, compaction, child, model, partial-line, rotation and pause/restart cases | Pending |
| 0.158.0 admitted only on evidence | R02, R05 | Separately confirmed conformance and human review of turn/topology results and explicit `thread_settings_applied` classification before registration | Pending human gate |
| Conformance preserves confirmation, scope and privacy | R01, R02 | Synthetic spawn/channel tests, abort paths, sensitive value/key sentinels, catalog/diff checks; live hook timing/trust check separately approved | Pending |
| Partial reporting, rollback and deletion stay correct | R04, R05 | Collector/report/deletion regressions including excluded intervals and no resurrection | Pending |

After ADR approval, refactor the two registered profiles, add the separate candidate
and manual runner, then seek scoped independent review. Run focused tests and
`npm run check` on Node 24. CI conformance coverage is limited to the pure projector
with offline synthetic inputs; runner/channel tests remain manual and offline. Register
0.158.0 only after its human gate. Update ADR 001's file-adapter rows/limits, the
[English](../runbooks/local-measurement.md) and [Korean](../runbooks/local-measurement.ko.md)
runbooks for manual versions, partial support, conformance and operating policy
(new Korean-runbook text is Korean under the approved language exception),
[CONTRIBUTING](../../CONTRIBUTING.md) for profile/evidence workflow, and fixture notes.
No ADR 001/006 edits occur in this design batch.

## Decisions (user, 2026-09-29)

- Reject unregistered versions at `session link` time; the CLI contract change is approved.
- CI may test the pure conformance report projector with offline synthetic inputs;
  never invoke the runner or spawn products.
- Write new Korean-runbook text in Korean, an explicit exception to the English
  artifact rule. Other artifacts remain English.
- Conformance hook trust uses option (b), per-invocation `trusted_hash` for our hook
  only. Option (a) is rejected; live execution still needs separate approval.

Production use of SessionStart for linkage is not decided and needs its own proposal.
