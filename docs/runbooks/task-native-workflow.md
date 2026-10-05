# Assigned task workflow and native execution boundary

New to the workflow? Start with the [first A/B run quickstart](workflow-quickstart.md)
([한국어](workflow-quickstart.ko.md)); this page holds the detailed contracts.

The common workflow connects durable flexible assignment, selected instruction
artifacts, task start/resume, an explicit execution-adapter boundary, human finish,
and an existing comparison snapshot. Models and effort are runtime choices;
changing them or opening another session does not create a new task assignment.
Use an explicit logical task ID and opaque issue aliases. GitHub is unnecessary.

**Codex 0.160.0 root own-response collection is admitted.** The code-owned
registry contains `codex-workflow-own-response-v1`, qualified by one actual
start/same-UUID resume/reopen replay run, and a separate
`codex-workflow-direct-child-v1`, qualified by a fresh-root/single-child run.
Both have `complete_cost: false`.
See [the source evidence and limits](../validation/codex-workflow-01600-source-readiness.md).
The CLI connects per-invocation selected instructions, launch, explicit
resume/link, foreground collection and durable stop. Unqualified exact versions
and profiles fail before reading selected instructions or launching a product.
The actual run validates the shared execution engine; production coordinator/CLI
coverage is offline. Only the bounded direct-child flow below is admitted;
fork/compaction, deeper children, app support, complete cost and inference
remain unavailable. Claude trace candidates are not production admissions.

```sh
node dist/cli.js --db .harness-delta/local.sqlite workflow status protocol-1
```

Status distinguishes source qualification, whether the requested profile has an implemented adapter,
incomplete whole-task cost and unvalidated inference. These are independent
blockers; a writable configuration flag cannot admit a source.

## Begin an assigned task

Register and freeze the complete explicit v2 protocol, two immutable variants and
price table using the [comparison commands](task-comparison.md). Synthetic checks
use a separate synthetic database and synthetic product. For real partial local
collection, use a dedicated real store and the exact admitted source profile:
`{"product":"codex","product_version":"0.160.0","profile_id":"codex-workflow-own-response-v1"}`.
A complete frozen v2 protocol remains mandatory. Registration supplies none of
the user's A/B files, prices, participants or experiment choices.

Supply a local JSON workflow configuration with `schema_version: 1`, an
`assignment` matching the existing v2 assignment schema, `product_version`, a new
`confirmation_id`, and exactly two artifact mappings:

```json
{
  "variant_id": "variant-a",
  "selected_artifacts": [{ "artifact_id": "instructions", "path": "./variant-a.md" }]
}
```

Each mapping belongs in the configuration's `artifacts` array and must reference
one frozen variant. Supply the full assignment contract; no experiment inputs
are filled automatically. `initial_model` is immutable task metadata. A separate
runtime file supplies current choices, such as:

```json
{ "model": "synthetic-model", "effort": null }
```

Null means unknown/unspecified, never an invented default. Runtime choices do not
replace the original task metadata or harness assignment.

```sh
node dist/cli.js --db .harness-delta/local.sqlite workflow begin \
  --config workflow.json --runtime runtime.json
```

Assignment commits before selected artifacts are read. Only the chosen variant's
explicit files are read. Files must be regular UTF-8 files without NUL, at most
1 MiB each and 16 MiB combined; final symlinks and changed reads fail. The sorted
manifest uses the existing artifact ID plus SHA-256 formula. Drift fails before
task start or adapter execution and preserves the original assignment.

The CLI returns only IDs, hashes, generation and `harness_application:
"prepared_only"`. It never prints instruction text or applies it to a product.
The internal execution interface supplies the verified selected bytes transiently
to its adapter, which must apply them through per-invocation product settings
before launch. No instruction bytes enter measurements or receipts. It does not
overwrite AGENTS.md or change project, global or authentication configuration.

Begin can resume a paused task or confirm another run of the same active task.
Use a fresh confirmation ID and the same preregistered metadata. Logical aliases
resolve to the canonical task and original variant; they do not advance allocation.
Task finalization prevents subsequent execution. An adapter receives an active
generation check it must call before every launch/source/observation boundary;
it also owns explicit session binding, receiver credentials, collection and
process teardown. Adapter return does not prove those duties were satisfied and
does not imply human success or complete cost.

## Codex launch, resume, link and collection

The implemented profile is `codex-workflow-own-response-v1` for Codex 0.160.0.
It supports sequential independent root sessions. Forked histories, compaction,
child sessions and mismatched identities fail closed. Production source admission
is code-owned; there is no CLI flag to enable a synthetic or unqualified source.
Only exact `cli` and `exec` source origins are allowed; IDE/MCP and other source
origins are unsupported even with a matching root UUID and version.

Each invocation uses the common workflow/runtime files and a strict execution
JSON file. Use a fresh `run_id` and `confirmation_id` for every operation. Pass
`--confirmation <id>` to override the configuration's `confirmation_id` instead of
editing the file. [Example files](../../examples/workflow/) match these schemas:

```json
{
  "run_id": "run-1",
  "operation": "launch",
  "binary": {"path": "/absolute/codex", "sha256": "<pinned-0.160.0-SHA256>"},
  "codex_home": "/absolute/existing-codex-home",
  "hook_recorder": "/absolute/harness-delta/scripts/conformance/candidate-start-recorder.mjs",
  "prompt_file": "/absolute/private-task-prompt.txt",
  "sandbox": "workspace-write",
  "timeout_ms": 180000,
  "poll_ms": 250
}
```

Paths must be absolute and canonical. The native binary must match the pinned
SHA-256; the metadata-only recorder must match its code-owned content hash.
These file checks, plus the prompt file and Codex home, run as a preflight before
assignment or task activation. A failure prints a fixed code (for example
`binary_mismatch`) and leaves no assignment, active interval or run journal row.
The binary is checked again immediately before spawn and is re-hashed unless the
file identity hashed by preflight is unchanged. If a launch still fails before any
native process starts, and that invocation activated the task, the task is paused
again and the receipt reports `activation_reverted: true`.
For a bounded fresh parent verification launch, explicitly adding
`"project_trust": "untrusted"` passes the registered project root's trust setting
through a one-invocation CLI override. This optional setting disables project-local
`.codex` config, hooks and rules for that invocation; use it only when that behavior
is intended. It does not disable the CLI-injected collection hook or change the
default launch behavior. Resume/link/collect and child launches reject this option.
Codex 0.160.0's thread/start writes implicit trust only when the effective project
trust value is unspecified and effective permissions allow writing the project.
Managed configuration has higher precedence: this option is not a general guarantee
against other configuration writes, and supervised scope verification is still required.
The home is used by the native process without inspecting credentials or older
session files. The selected instruction text is bounded to 32 KiB; prompt UTF-8
is bounded to 1 MiB and supplied through stdin. No argv, prompt, instructions,
native stdout or stderr enter the measurement database or CLI receipt. Ordinary
workflow stdout is discarded, so a read-only analysis answer is not returned by
this measurement CLI. For a useful file-producing task, explicitly include a
normal work-product destination in the prompt and approve root workspace-write
permissions; keep that artifact separate from measurement data and reports. The
existing native qualifications were read-only, so this write-mode invocation
requires new supervised execution evidence. See the
[small functional pilot preparation](functional-task-pilot.md). Runtime
model/effort may be null or explicit native choices; actual context values are
recorded per request. Null does not select a diagnostic model.

```sh
node dist/cli.js --db .harness-delta/local.sqlite workflow codex launch \
  --config workflow.json --runtime runtime.json --execution launch.json
node dist/cli.js --db .harness-delta/local.sqlite workflow codex resume \
  --config workflow.json --runtime runtime.json --execution resume.json
node dist/cli.js --db .harness-delta/local.sqlite workflow codex link \
  --config workflow.json --runtime runtime.json --execution link.json
node dist/cli.js --db .harness-delta/local.sqlite workflow codex collect \
  --config workflow.json --runtime runtime.json --execution collect.json
node dist/cli.js --db .harness-delta/local.sqlite workflow codex stop run-1
node dist/cli.js --db .harness-delta/local.sqlite workflow codex recover run-1
node dist/cli.js --db .harness-delta/local.sqlite workflow task task-1
```

`stop` asks a live run to end. `recover` is for a run left `running` after its
process disappeared (crash, kill or reboot), which otherwise blocks the task with
`workflow_run_active`. It marks the run `failed` with reason `abandoned`, records
an `incomplete` observation gap after the last retained usage of each bound
session, and never adds usage; a harness-delta collector that is still alive stops
at its next guard. Recover before pausing or finishing: an inactive task cannot
record the gap, and the result reports `gap_warning: task_not_active`. Codex and
Claude Code processes run in their own process groups and can outlive a killed
collector; no process ID is persisted, so `recover` cannot signal them and they
must be ended manually. `workflow task` prints the task state, follow-up deadline, run states
and fixed next-action codes without paths or instruction text.

`resume` requires `operation: "resume"` and the exact previously linked UUID in
`session_id`. It applies the selected harness again with current runtime choices.
`link` requires `operation: "link"`, a new explicit root UUID and `source_path`
under that home's canonical sessions directory. It binds the session before its
first bounded read; existing source usage establishes a baseline and is excluded.
`collect` requires that linked UUID and admits only future usage while it runs in
the foreground. Link and collect do not launch or apply a harness and therefore
return `external_unverified`. Every command's operation must match its JSON file.
No session discovery, `--last`, automatic retry or retrospective backfill occurs.

Launch/resume use the awaited metadata hook to bind the exact native UUID/path,
then poll only that authorized source with task generation, configuration,
tombstone and immutable-file checks. Durable file identity, size and prefix hashes
reject replacement/rewrites across CLI invocations. Resume baselines prior work before launch.
Globally scoped response IDs reject conflicts and avoid duplicate accumulation.
A durable stop ends collection and terminates the launched process group; it
does not finalize the human task. Timeout and stop are process controls, not a
provider token/cost cap. Failed adapter results produce CLI exit code 2.

`invocation_settings_verified` proves that verified selected bytes generated the
outgoing per-invocation developer-instruction argument. It does not attest native
resolved harness application; native TurnContext does not expose those bytes.
The setting uses the [official developer-instructions configuration](https://developers.openai.com/codex/config-reference/).
The exact native launch/resume/source boundary has operational qualification and
limited source admission. The tested marker pair is behavioral evidence, not
resolved-harness attestation. Only guarded host scope and identity facts are
produced; whole-task request universe, terminal
flush and continuous coverage remain unknown, so complete cost and inference
stay closed under their existing independent gates.

## Single direct-child launch and durable collection

The separately admitted `codex-workflow-direct-child-v1` profile supports Codex
0.160.0 on the pinned macOS arm64 binary and Node24. Include the exact profile in
the frozen v2 protocol's source profiles:

```json
{"product":"codex","product_version":"0.160.0","profile_id":"codex-workflow-direct-child-v1"}
```

Use the same `workflow codex launch` command and common configuration/runtime files.
Add `child_runtime` to the launch execution JSON and require `sandbox: "read-only"`:

```json
{"child_runtime":{"model":"<user-selected-child-model>","effort":"high"},"sandbox":"read-only"}
```

The full execution document must also supply all required launch fields shown above.
These are runtime choices; diagnostic Astra/Sol settings are not required policy.
The task prompt must request one fresh direct child without forked context. The
collector verifies that one child; zero, second/deeper or unsupported child evidence
stops the run rather than claiming successful supported collection. Hook detection
and process teardown do not enforce a hard provider or subscription spending cap.

After a completed development launch, collect with a new run/confirmation ID and the
returned root `session_id`. Omit `child_runtime` and `direct_child`: the adapter
resolves only that launch's source-verified durable child binding for the same task,
project and generation. An explicitly supplied `direct_child` mapping must match;
it never authorizes a new source. The same `workflow codex collect` and `stop` commands
operate on both linked sources. History at collection start and earlier unobserved
records that arrive later are excluded; new own usage in the same bound turns is
collected. Reopen/replay inserts no duplicate usage/runtime records.

Family `resume` and external child `link` are unsupported, including attempts to
omit a known child and reuse the root-only profile. Another session/rework under
the same logical task may use another fresh launch and retains its original sticky
A/B assignment. After a task pause/generation change, start a fresh pair. The native
shared engine was verified once; this ordinary coordinator/CLI wiring was verified
offline. See [the exact operational evidence and limits](../validation/codex-workflow-01600-direct-child-source-readiness.md).

The connection applies the selected root instructions, enables agents transiently
with maximum depth one and the explicit child defaults, and configures the pinned
SessionStart/SubagentStart metadata hooks. Only the fresh callback path is bound;
source headers, initial contexts, request identities and managed read-only
permissions are checked before acknowledgement. Callback-first and persisted
spawn-first ordering are supported offline. A second child, inherited history,
compaction, source replacement or scope loss stops the run. Same-child lifecycle
activities are checked against the
[pinned protocol](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/protocol/src/protocol.rs#L4097);
only started activities count as a new spawn. Prompt/response content and personal
paths do not enter measurement output. Native hooks can fail open; detection and
process-group termination do not enforce provider token or billing limits.

Both sessions bind to the same task and confirmation. One sticky assignment and
request-local model/effort evidence survive the admitted fresh launch and durable
family collection/replay. Root-to-child resume remains a synthetic candidate test,
not admitted production behavior. General child resumes, forks, deeper descendants
and whole-task completeness remain unqualified.

## One-shot Codex workflow qualification

The root reader accepts legacy rollouts and native 0.160 paginated roots starting
at ordinal0. Parent/fork/history-base/child-own-history markers remain rejected;
the existing projection parser enforces contiguous ordinals. Native pagination
is distinct from inherited history ([pinned ordinal implementation](https://raw.githubusercontent.com/openai/codex/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/rollout/src/ordinal.rs)).
An empty or partial initial header keeps the hook acknowledgement pending within
the existing five-second hook limit and invocation deadline. Complete malformed
lines still stop immediately. The first failed stage and fixed allowlisted code
are retained in the invocation journal/result; error bodies and causes are not.

The internal manual `scripts/codex-workflow-qualification-command.mjs` entry now
connects qualification intent to the same adapter engine. It is separate from
production allocation and does not modify a registry or turn the synthetic
factory into a native launcher. Preparation starts no product or auth command:

```sh
node scripts/codex-workflow-qualification-command.mjs prepare \
  /absolute/new-private-qualification-directory /absolute/pinned-codex \
  112fae7a5a1223e673c8a1791d32338f37df8b527ff1159bb8adac6c4dbf1b4b \
  /absolute/existing-codex-home \
  /absolute/harness-delta/scripts/conformance/candidate-start-recorder.mjs
```

Preparation creates an isolated legacy task, empty fixture, qualification-only
lease, two immutable harness artifacts and one selected variant. No comparison
assignment or production source is admitted. The mode-0600 intent pins artifact,
binary, Node, recorder and built implementation hashes. Its runtime conditions
are launch `gpt-6-astra/high` and then `gpt-6.1-sol/high` in the same root UUID;
these are qualification conditions, not product defaults or runtime restrictions
for normal development. It requests no child or other tools, uses read-only
sandbox and the existing authenticated home without opening prior transcripts or
credentials. The assistant performs no login, update or auth-status lookup.

After explicit user approval and execution-policy allowance, a trusted executor
provides the intent SHA and approval reference in a private consent JSON:

```json
{
  "intent_sha256": "<prepared-intent-SHA256>",
  "approval_reference": "<actual-user-approval-reference>",
  "actual_model_run": true,
  "transient_harness_hooks": true,
  "marker_response_validation": true
}
```

The file is an executor witness, not independent proof of user permission.

```sh
node scripts/codex-workflow-qualification-command.mjs execute \
  /absolute/qualification/execution-intent.json /absolute/approved-consent.json
```

Execute fsyncs an exclusive permanent reservation before any native spawn. One
shared absolute 180-second lease covers launch, resume and reopened collection;
there is no new budget at resume and no automatic retry/fallback. Native CLI is
intended to spawn twice with one own response per phase. Additional responses,
missing marker/usage, mismatched runtime/source or expiry fail the single attempt.
This bounds supervised process observation, not backend requests/tokens/billing.

Only this qualification lane enables bounded transient JSON stdout inspection.
It compares each selected harness marker in memory after root binding, rejects
unexpected items, and retains marker booleans plus normalized usage/runtime
metadata. It closes/reopens SQLite and collects a baseline to prove replay adds
zero under the same task/session. `execution-evidence.json` records actual spawn
count, shared times, selected manifest, phase status, marker booleans, own usage,
runtime and replay, never raw instructions/prompts/output. A spawn with no usage
evidence leaves backend model usage unknown. Normal production stdout handling
remains unchanged.

The separately authorized successful root run supports the code-owned registration
for this exact 0.160 root workflow with `complete_cost: false`. The separate child
run supports only the bounded direct-child profile above. The manual entry
itself never modifies the registry. Neither run qualifies fork/compaction,
prove all-request coverage or open cost/analysis gates. Test-only Node dependencies
produce `validation_kind: synthetic`; the public native entry rejects those
intents. Qualification does not prove the production allocation/coordinator path
has run live before admission; it verifies their shared execution engine.

Both development and qualification invocations explicitly use `on-request` with
`auto_review`, then verify the declared native context. The pinned
[exec configuration resolver](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/exec/src/lib.rs#L731)
otherwise installs a headless `never` override. No sandbox or hook-trust bypass
flag is used, and managed restrictions remain authoritative.

The separate manual `prepare-child` command uses the same preparation arguments
as `prepare`, but writes `topology: "root_direct_child"` into a new intent/lease.
It authorizes no execution. After new explicit execution-session consent, its
one-shot plan is one Astra/high root launch and one Sol/high fresh direct child,
with one shared 180-second deadline, followed by database reopen and replay with
no additional native launch. It plans up to four observed own responses (three
root, one child); more than four observed responses, missing/extra child evidence,
wrong marker/runtime/topology or unexpected tools stop the attempt. Observed
limits are not hard bounds on backend requests, tokens or costs.

The root-resume lease rejects child inputs. A family lease binds its topology,
implementation, selected manifest, binary and child identity to the same reserved
intent. Qualification inspects only bounded transient marker/collaboration JSON
stdout using the
[pinned exec contract](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/exec/src/exec_events.rs#L195).
It retains metadata/counts/booleans, not collaboration prompts or agent text.
Synthetic CLI/lease tests cover this path. The separately approved successful native
family qualification is documented in the direct-child source evidence above; it
is not a live user A/B run. The command never modifies the source registry.

## Continue, finish and compare

The existing task pause/resume, first-completion, assessment and rework commands
retain their behavior. Explicit session linking and foreground collection remain
subject to their own admitted profiles and scope rules; this common workflow
does not admit a candidate or authorize automatic session discovery/backfill.
See [session continuation](session-continuation.md).

Human assessment supplies the fixed criteria:

```sh
node dist/cli.js --db .harness-delta/local.sqlite workflow finish task-1 \
  --outcome success --met criterion-1
node dist/cli.js --db .harness-delta/local.sqlite workflow report protocol-1 \
  --id report-1 --cutoff 2026-10-05T00:00:00Z --reason initial
```

Finish before the task's `followup_ends_at`. An outcome assessed at or after that
deadline is stored, but deadline status stays `outcome_missing` (or `not_started`); `workflow finish`
returns `counted_in_deadline_status: false` and warns
`assessment_after_followup_deadline`. A report cutoff before the deadline shows
`followup_pending`, so create the final report after the deadline with a cutoff at
or after it and no later than report evaluation. Snapshots are half-open; an
outcome exactly at the cutoff is excluded. Finish and
report are separate durable operations so a report error cannot undo or silently
repeat a human outcome. All linked eligible sessions and rework remain under the
original assignment. Missing coverage or prices keep complete cost unavailable;
synthetic local checks cannot prove billing, native support or an adoption decision.
## Claude workflow wiring: offline only, bounded native probe verified

The shared workflow CLI also implements `workflow claude launch` and
`workflow claude stop <run-id>`. Launch uses the existing assignment, selected
artifact hashes and explicit configuration confirmation. Each fresh root and
its optional single direct child are linked to that same logical task before
request traces are decoded. Runtime model and effort remain invocation choices.

`claude-workflow-own-trace-v1` is deliberately absent from the production source
registry. Public launch therefore fails before assignment, instruction access,
gateway startup or executable access until native qualification and a separate
source admission decision establish the supported scope. The synthetic adapter
is a trusted test dependency, never a CLI switch or a native admission override.

The separately approved exact 2.1.288 synchronous probe completed with
Sonnet5.5/high, two root usage rows and one direct-child row under the same task.
This verifies that internal probe's request/runtime attribution and observed
counter components, not this ordinary workflow's asynchronous child behavior.
See the [bounded probe support contract](../validation/claude-native-probe-preparation.md#verified-bounded-native-probe-and-current-support-contract).
Native exporter replay did not occur; replay idempotence is offline evidence.
The workflow terminal check accepts positive root usage without proving that all
requests were delivered. General request-loss detection, terminal flush and
2.1.289 remain unverified; the production source gate stays closed.

The execution document specifies `operation: "launch"`, `run_id`, the pinned
2.1.288 binary path/version/SHA, a private `workspace`, built `mediator_path`,
`prompt_file`, `timeout_ms` (at most 120000), `max_turns` and `request_limit`.
An optional `child_runtime` chooses that one child's model and effort. Supported
effort values here are `low`, `medium`, `high`, `xhigh` and `max`; model support
still requires native evidence. There is no automatic resume, discovery or retry.

The readonly invocation applies selected instructions through temporary root
and child system-prompt files and uses the existing authenticated hook/log/trace
gateway. Logs check ordering and policy; only successful, completed, first-attempt
`claude_code.llm_request` traces contribute usage. Root traces can arrive before
child creation, after both startup prerequisites. Duplicate request traces add
nothing; API logs and metrics add no usage. Cache read and creation tokens remain
separate billing components. A task cannot acquire a second file, managed or OTel
log usage owner after trace ownership is reserved, including after a stopped run.

Missing terminal hooks, failed or unfinished requests, unknown agent ancestry,
sequence gaps, scope revocation and deadlines stop observation. Earlier verified
request usage remains a partial observed estimate. A successful process exit and
SessionEnd are not a trace-delivery watermark or proof of whole-task cost.
Request/turn limits and the CLI USD estimate cannot enforce a provider or
subscription spending cap. The bounded probe confirmed authenticated execution
and the observed format for that invocation. General workflow child behavior and
export flushing require separate evidence before this workflow can be admitted.

Offline integration evidence exercises the actual main CLI with a synthetic
executable, including sticky assignment, applied artifact content, early root
traces, direct-child attribution, duplicate log/trace exports, interruption,
missing termination, partial estimates and cross-channel rejection. Synthetic
results do not qualify the installed native product.
