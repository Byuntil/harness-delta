# Native OpenTelemetry export as the primary Claude Code usage source

Status: accepted 2026-09-28; not implemented. No receiver, CLI, storage,
report-schema or collection-scope change exists yet, and this record does not
change any requirement; the requirement wording in Follow-up 1 needs its own
explicit decision.
Requirements: [R01, R02, R04, R05, R07, R08, R09 and R10](../requirements.md).
R11 tool diagnostics are out of scope here. Documentation checked 2026-09-28.
Existing [adapter evidence](001-adapter-capabilities.md), the
[observation contract](003-local-observation-contract.md), the
[coverage evidence policy](004-complete-measurement-readiness.md) and the
[managed observation lifecycle](005-managed-observation.md) remain binding.

## Context

The goal is to compare harness configurations (A/B) on real development tasks
and report token use at maintained quality, so that a team can lower cost.

**Current sources and their limits:**
- Existing adapters read print-mode JSON, Claude transcripts and Codex rollout
  files as partial observations.
- Completeness remains blocked by message revisions, child accounting and
  exceptional boundaries.
- Headless stream output, the candidate producer interface for the ADR 005
  managed lifecycle, has two further limits:
  - Its event vocabulary is not fully documented and is version-coupled.
  - It covers only print-mode processes that the tool launches, not the
    interactive sessions where development tasks happen.

Both target products document opt-in OpenTelemetry (OTel) export.

### Claude Code

Source: [monitoring](https://code.claude.com/docs/en/monitoring-usage). Configuration precedence is in [settings](https://code.claude.com/docs/en/settings).

**Enabling export:**
- `CLAUDE_CODE_ENABLE_TELEMETRY=1`, plus standard `OTEL_*` exporter settings.
- Protocols: OTLP gRPC, `http/json` or `http/protobuf`. There is no default protocol.
- Per-signal endpoints and headers override or merge with the generic ones.
- Variables in user settings override exported shell variables. Managed settings
  and some launchers can replace exporter settings.

**Per-request fields:**
- `claude_code.api_request` carries:
  - `input_tokens`, `output_tokens`, `cache_read_tokens` and `cache_creation_tokens`;
  - `cost_usd` and `cost_usd_micros` (estimates) and `duration_ms`;
  - `model`, `request_id` and `client_request_id`;
  - `event.sequence`, a per-process counter;
  - `query_source`, an open set: for example `repl_main_thread`, `compact`, or a subagent name.
- `claude_code.api_error` carries `attempt`, the total attempt count, and `status_code`.

**Metrics:** default to delta temporality.

**Content and identity:**
- Excluded unless explicitly enabled: prompts, responses, tool details and raw bodies.
- Not excluded:
  - error text;
  - identity attributes: `user.email`, account and organization identifiers;
  - on some events, local workspace paths.
- `OTEL_RESOURCE_ATTRIBUTES` adds caller-defined keys to every record. Most
  standard keys cannot be overridden; `vcs.*` keys can, and gateway sessions
  ignore `user.*` and `identity.*` keys. Harness keys therefore use their own
  namespace.
- A `claude_code.managed_settings_resolved` event (v2.1.274+) is emitted at
  session start and lists managed-settings sources.
- A session can change `session.id` within one process, for example on `/clear`.

**Export timing:** default intervals are 5 s for events and 60 s for metrics.

### Codex

Sources: [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced),
[configuration reference](https://developers.openai.com/codex/config-reference) and
[approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security).

**Enabling export:**
- `[otel]` `exporter` (`otlp-http` or `otlp-grpc`) is disabled by default.
- `metrics_exporter` defaults to `statsig`, and `trace_exporter` is set separately.
- `otel` in project configuration is ignored. Per-run overrides are possible
  through `-c`/`--config`. Managed configuration may also apply.

**Content:**
- Prompts are redacted by default (`log_user_prompt = false`).
- Tool result events can carry output snippets, and error details are included.

**Tokens:**
- A per-turn metric histogram splits input, cached input, output, reasoning
  output and total.
- An SSE event carries token counts on `response.completed`; its fields are not
  listed.
- A per-request token split on events is not documented.

**Other:**
- Exporters flush on shutdown.
- Export cannot reach a collector when the product runs without network access.
- Coverage of `codex exec` and a resource-attribute mechanism are not documented.
- No cost metric is documented.

## Decision

Adopt Claude Code's native OTel export, sent to a local harness-delta receiver,
as the primary usage source for sessions that the measurement CLI launches.
Codex OTel is a candidate under the same design, pending Follow-up 3 and 4.

**Status of the other sources:**
- The existing adapters remain a separate cross-check source.
- OTel and adapter observations are never summed.
- Development of the headless stream interface as a usage source is paused.

### Transport isolation before any payload access

1. **One receiver per launched product process.**
   - It listens on an ephemeral loopback port, never on the default OTLP ports.
   - It requires an unguessable token in the exporter headers. Each launched
     process gets its own token, so the token identifies both the run and the
     process. A resume is a new process with a new token.
   - The token is revoked on pause, finalization or deletion. Later batches
     are then rejected before decoding.
2. **Check the token first.**
   - The token is checked before the request body is decoded. A request that
     fails is dropped undecoded.
   - Incoming headers are never stored or logged, because user credentials can
     be merged into them.
   - Undecodable bodies are dropped, never stored or logged.
3. **Claude settings are passed with `--settings`,** which ranks above user settings.
   They come from a file with 0600 permissions that is deleted after use, so the
   token never appears in the process list. They set:
   - endpoint, protocol and headers for the generic exporter and every
     per-signal exporter;
   - every `OTEL_LOG_*` content option off, including raw bodies;
   - traces to `none`.
4. **Codex uses an equivalent `-c otel.*` override set** covering the log,
   metrics and trace exporters. This mechanism must be verified before any Codex
   support claim.
5. **Global configuration is never edited.**
6. **Fail closed on unverifiable configuration.**
   - Content-off and destination settings cannot be guaranteed against managed
     configuration or launcher overrides.
   - Readiness is ordering evidence, not a live handshake: the receiver
     listens before the process is launched. The run's usage is accepted only
     if two conditions hold:
     - the first authenticated batch contains the session-start event, carrying
       the lowest sequence value (the starting value is validated per version);
     - `event.sequence` is contiguous from that event.
   - For Claude, `managed_settings_resolved` is the candidate session-start
     event and override check.
   - If an override is detected or this ordering evidence is missing, the run
     is unsupported and its usage is recorded as uncertain, not measured.
   - The CLI stops measuring and tells the user. It does not terminate the
     user's product process.

### Linkage

1. **What establishes linkage.**
   - The per-process token links a payload to one registered, active task, run and process.
   - The following are then cross-checked:
     - a namespaced resource attribute (Claude only);
     - the product version;
     - the first `session.id`, against the session ID recorded at launch: the
       preassigned `--session-id` for a new session, or the resumed session ID
       for a resume.
   - A mismatch marks the process's usage uncertain. Excluded usage is always
     recorded with a reason, never silently dropped.
2. **This is run-level linkage.**
   - A process can report several session IDs, for example after `/clear`.
     A new `session.id` arriving under the same token, in sequence order, stays
     linked to the run.
   - Nested product processes do not inherit the exporter settings. Their usage
     is recorded as missing, never as zero.
   - Linking by run changes what R01 calls a linked session. That wording needs
     an explicit requirements decision before implementation.
3. **Supported sessions.**
   - Only sessions launched by the measurement CLI are in scope.
   - Desktop, IDE and launcher-owned sessions are not.

### Stored fields

**Stored:**
- event name, timestamp, per-process sequence (kept for every authenticated
  event, including event types whose other fields are dropped, so gaps can be
  detected);
- product version and model;
- session identifier and request identifiers;
- status and success, attempt and duration;
- token counts;
- a closed query-source category (`main`, `compact`, `subagent`, `auxiliary`,
  `other`), mapped from the raw value by a per-version table; unknown values
  map to `other`.

**Everything else is dropped.** That includes:
- identity attributes, workspace paths, repository attributes;
- raw query-source and agent names;
- error text, tool fields and prompt or response fields.

**Vendor cost estimates are not stored** until an explicit R05 decision. If
approved, they would be kept as a product estimate in integer micros, separate
from cost computed from a recorded rate source. Neither is a subscription bill.

### Usage events and integrity

**What counts as usage:**
- Claude per-request `api_request` events are the unit of usage.
- For Codex, the documented token split exists only in turn metrics. Codex
  usage therefore remains unverified until event-level counts or metric
  semantics are validated.
- Metrics are only a cross-check and are never added to event totals.
- Temporality is recorded and validated before any metric aggregation.

**Idempotent keys** combine:
- product and the internal run and process identifiers bound to the token (the
  raw token is never stored);
- the event type;
- `request_id`, else `client_request_id`, else the per-process sequence.

`event.sequence` restarts per process, so it never serves as a key alone.

**Writes:**
- A conflicting payload for an existing key is rejected, never overwritten.
- The exporter receives success only after the durable commit.
- Authenticated records that are dropped by projection are also acknowledged,
  so exporters do not retry them indefinitely.

### Lifecycle

**Observation intervals:**
- The receiver must be ready before the first request. This is required for
  ADR 004's `readyBeforeFirstRequest`, but not sufficient, because that fact
  also covers startup and context usage.
- A receiver failure while the product keeps running creates an uncertain
  interval with no backfill.

**Pause and late batches:** the token is revoked at pause, finalization or
deletion, so later payloads are rejected before decoding.
- A pause therefore ends measurement for that product process. Exporter
  headers are fixed at launch, so continuing needs a newly launched process,
  for example a product resume, with a new token.
- Usage between the pause and that relaunch counts as missing, never zero.
- Batches still in flight at the pause (up to one export interval) are
  rejected. The interval before the pause may therefore be incomplete and is
  not backfilled, consistent with ADR 003 and ADR 005.
- Drain semantics equivalent to ADR 005 need a separately approved
  real-producer profile, because ADR 005 accepts only its synthetic profile.
- R07 tombstones apply. Late batches never reopen a task.

**Where usage goes:** it enters the existing event store as partial usage, and
`complete_tokens` stays null.

**Terminal accounting:** OTel has no documented terminal watermark, so
`terminalAccounting` may remain unverifiable.

### Comparison limits

**Measurement consistency:**
- One consistent instrument across arms is necessary but does not relax R05 or R10.
- That loss is non-differential across arms must be validated, not assumed.
  Two ways to detect it:
  - gaps in `event.sequence`. This needs validation that every sequence number
    is exported, and must allow for sequences restarting in each process;
  - comparison with the product's own result usage (`claude -p` result,
    `codex exec` JSON). This exists only in print mode; interactive runs can
    be cross-checked only against the transcript adapter.

**Scope of comparisons:** comparisons are made within one product and version,
never across products, because token semantics differ.

## Options considered

| Option | Interactive tasks | Stability | Privacy | Completeness path | Verdict |
| --- | --- | --- | --- | --- | --- |
| A. Headless stream decoder | No | Low: vocabulary not fully documented, version-coupled | Must filter content itself | Blocked by the unresolved protocol and startup | Pause |
| B. Transcript/rollout file adapters (current) | Yes | Medium: file formats undocumented | Files contain content; scope must precede reads | Blocked by revisions and child accounting | Keep as a separate cross-check |
| C. Native OTel to a per-process loopback receiver | Launched sessions only | Higher: documented, opt-in | Prompts off by default, but identity, error text and Codex tool snippets need dropping; user or managed settings can redirect export | Claude per-request events; Codex unverified | **Adopt, fail closed** |
| D. HTTP proxy between product and API | Yes | Medium | Sees full prompts and responses | Complete request view | Reject: violates R02 |

**The main trade-off:**
- Option C trades a self-built parser of incompletely documented output for vendor
  telemetry that is itself self-reported.
- That telemetry is not a billing record and can lose data on abrupt exit.
- The residual risk is configuration drift from user or managed settings. It is
  contained by `--settings`, per-process tokens and a fail-closed readiness check,
  not eliminated.

## Consequences

**Easier:**
- Interactive sessions launched by the measurement CLI become measurable.
- Claude subagent and compaction requests are attributable through a mapped
  query-source category.
- Failed requests expose their attempt count.
- Collection no longer depends on parsing product output streams.

**Harder:**
- The tool runs a per-process authenticated receiver and must detect configuration
  overrides.
- Vendor attribute changes need version-pinned synthetic tests.
- Codex support depends on verifying per-invocation overrides and event-level
  token counts.

**Revisit:**
- The R01 linkage wording.
- Whether R08 must name the loopback receiver.
- Codex sandbox network behavior.
- Agreement between metrics and events.
- Flush behavior for short print-mode runs.

## Follow-up

1. Decide and record the linkage and collection-boundary wording in the
   requirements and capability documents.
2. Build the receiver offline with synthetic payloads:
   - token check before decoding;
   - allowlist projection;
   - idempotent keys and conflict rejection;
   - late-batch handling.
3. Verify Claude `--settings` precedence against user settings, and Codex
   `-c otel.*` overrides, without editing global configuration.
4. Run one small approved live check per product against the receiver:
   - compare OTel totals with the product's own result usage;
   - record flush and loss behavior.
5. Map the ADR 004 evidence to this source before any complete-total claim.
   Then prepare the R09 pilot protocol within one product and version.

## Offline receiver (Follow-up 2)

An internal, synthetic-only implementation exists in `src/otel-receiver.ts`,
`src/otel-journal.ts`, `src/otel-projection.ts` and migration
`005_otel_receiver.sql`. It is not exported from the package entry point. It
has no CLI, launches no product process and enables no telemetry. No real
product version is supported: every accepted version needs an injected profile
that supplies the session-start sequence value and the query-source table.
Follow-up 4 must validate that profile first.

**Transport:**
- One receiver per process, on `127.0.0.1` with an ephemeral port.
- The `x-harness-delta-token` header is compared by digest before anything else.
- The scope is then checked without reading the body, and again before the
  body is decoded, because a pause can happen during an upload.
- Rejected bodies are drained undecoded, up to the body limit; after that, the
  connection is closed.
- Only `POST /v1/logs` with `application/json` and no content encoding is decoded.
- Authenticated metrics and trace posts are acknowledged undecoded and never
  stored.
- Responses:
  - `200` after the SQLite commit;
  - `401` for a missing or foreign token;
  - `403` for a revoked or out-of-scope process;
  - `400` for an undecodable request or a conflict;
  - `404`, `405`, `413` or `415` for rejected transport;
  - `503` for a storage failure.

**Ordering and fail-closed rules:**
- A process is `pending` until its first record is `managed_settings_resolved`,
  trigger `startup`, at the profile's sequence value, with the launch session ID.
- After that, each sequence value must follow the previous one.
- These conditions make the process uncertain:
  - a missing session-start event;
  - a sequence gap;
  - a non-empty or unreadable `managed_settings.sources`;
  - a raw body event;
  - an invalid record;
  - a record timed before the process was registered or after the receipt time;
  - a mismatched `app.version`, `harness_delta.process_id` attribute or
    session owner. Record and resource process attributes that disagree also
    count as a mismatch;
  - a conflicting payload.
- An uncertain process is revoked. An unmeasurable observation window opens at
  its last contiguous record and closes when the receiver closes or the task is
  paused or finalized.
- A process that ends while still `pending` becomes uncertain
  (`ordering_missing`). Its whole lifetime is recorded as an unmeasurable
  window.
- Contiguous records committed before that point remain partial usage.
- A conflict rolls back its whole request.
- An invalid record drops its whole request, because its position is unknown.
  The request is still acknowledged.

**Storage:**
- `otel_records` keeps allowlisted fields and a closed query-source category.
- Only `api_request` becomes a usage event, with the transcript adapter's
  component semantics:
  - input includes cache creation and cache read;
  - cached input is cache read;
  - reasoning is unmeasurable.
- Keys combine the product, run, process and event type with `request_id`,
  else `client_request_id`, else the sequence value.
- A task accepts either OTel processes or file-adapter sessions, never both, so
  reports cannot sum them.
- Pause, finalization and deletion revoke the process permanently. A resumed
  task needs a new process and token.
- A resumed session keeps its session row only when the product version is the
  same.
- Writes take the SQLite writer lock at the start of the transaction.

**Launch requirement for Follow-up 3:** by default, Claude Code includes
`app.version` only when `OTEL_METRICS_INCLUDE_VERSION` is `true`. The
per-invocation settings must set that variable. Otherwise every record fails the
version check and the process becomes uncertain. A managed installation that
reports any managed source is always uncertain under this rule.

Tests: `tests/otel-projection.test.ts` and `tests/otel-receiver.test.ts`.
