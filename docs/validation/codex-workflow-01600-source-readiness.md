# Codex 0.160.0 root workflow source admission

The code-owned source registry admits `codex / 0.160.0 /
codex-workflow-own-response-v1` with evidence ID
`codex-workflow-01600-root-native-v1`, `validation_kind: real_operations` and
`complete_cost: false`. This enables local partial own-response collection through
the assigned-task CLI for an explicitly frozen v2 protocol. It does not validate
an experiment's user inputs, complete task costs or inferential adoption.

## Operational evidence

One separately approved run of the shared workflow execution engine completed
on macOS arm64 with Node 24 and the pinned Codex 0.160.0 binary. The run used a
fresh empty fixture and existing authenticated home, read-only sandbox,
`on-request` / `auto_review`, disabled multi-agent, temporary selected instructions
and metadata hooks. No authentication or persistent settings were changed.

| Boundary | Observed result |
| --- | --- |
| Native CLI launch | One `gpt-6-astra/high` invocation, one own response |
| Explicit resume | One `gpt-6.1-sol/high` invocation on the same UUID |
| Selected harness behavior | Both phase markers verified in memory |
| Stored source projection | Two own usage events and two request runtime records |
| Reopen/replay | SQLite reopened; explicit collection inserted zero additional events |
| Scope and source identity | All three invocation journals verified host scope and immutable identity |
| Shared lease | 16,067 ms elapsed within one 180,000 ms deadline |

The successful metadata-only qualification evidence has SHA-256
`f97979e1c7878fc8b54a9ab004f7cf69ddd9df39f409f357104f72317937aa8b`,
used as the registry's immutable `semantics_digest`. The consumed intent SHA-256
is `4f695d829c0b55135d0cf4984c7852e83907b94057f39708a42c8bc5112c2e49`;
the qualified execution implementation digest is
`58627448eca4eedcb5421d1b24d6ea9499ef940e181aa96466fddbc73cb957cc`.
The binary SHA-256 is
`112fae7a5a1223e673c8a1791d32338f37df8b527ff1159bb8adac6c4dbf1b4b`.
Private source paths, task/session/request identifiers, marker text, prompts,
responses and credentials are omitted here. Earlier failed evidence remains
preserved; this is a fresh, separately authorized attempt, not a rewritten result.

## Admitted scope and limits

The source projects incremental per-response usage and runtime from explicitly
bound independent roots, including fork-free paginated history starting at
ordinal zero. Native start and same-UUID resume were verified above. Contiguous
ordinals, durable inode/size/prefix checks, guarded access and globally deduplicated
request identifiers remain mandatory. Paused, offline and prebinding history is
excluded rather than backfilled. Unsupported children, forks, inherited history,
compaction and ambiguous identities still fail closed. App/IDE support is absent.
The workflow reader permits only exact `cli` and `exec` source origins. IDE/MCP
and other origins fail at the root header before projection or verified scope.
Independent review found that this boundary was initially too broad; an offline
regression and guard correction tightened it without altering the qualified
`exec` origin. The implementation digest above identifies the actual historical
run, not the later corrected build. No native rerun was performed for this fix.

The initial admission qualification was an isolated legacy task, not a live randomized allocation.
Production CLI allocation, selected-artifact confirmation, explicit root link,
future-only collection, durable stop, replay, human finish and descriptive report
were checked offline at admission with synthetic files and isolated stores. Production
launch/resume reach the binary verification boundary in offline checks using a
deliberately mismatched binary; no further native process is started. These checks
connect the actual shared-engine evidence to the ordinary coordinator without
mislabeling synthetic tests as additional live runs. External-root link and
future collection have offline coverage, not a separate native external-session
qualification.

Models and effort remain runtime choices, including null. The observed Astra/Sol
high pair is evidence for that run, not proof of all provider model combinations.
`invocation_settings_verified` confirms the outgoing selected-instruction bytes;
marker behavior does not attest native resolved harness bytes or global isolation.
Subprocess count is not an independently established backend-call total. There
was no hard backend token or cost bound.

All usage is an observed subset. Full request universe, observation continuity,
terminal/flush accounting and complete price coverage remain unverified. Even
fabricated complete coverage facts cannot override `complete_cost: false`.
The production analysis registry remains empty; inference stays unavailable.
No Claude profile, complete-cost producer or statistical method is admitted.

## Starting an actual local workflow

Follow [the assigned workflow](../runbooks/task-native-workflow.md) and
[flexible inputs](../runbooks/flexible-comparison.md). Source registration alone
creates no project, protocol, assignment, session or native request. V1 fixed
configuration experiments and unsupported exact versions/profiles remain closed.
The existing generic `session link` / `collect` adapters are separate; use
`workflow codex` for this profile.

The user must provide the real project root, A/B instruction files and immutable
variant identities/manifests; explicit immutable price table; complete v2 protocol
(participants/environments, recruitment/followup, strata/allocator, eligibility,
classification, sample/planning basis, missingness,
stopping and analysis/sensitivity identifiers); logical task metadata and criterion
IDs; current runtime; and native execution paths/prompt/sandbox/deadline. Missing
or contradictory inputs fail before collection. Test protocols, synthetic prices
and the qualification's random harnesses are never substituted for these choices.
For `real_experiment`, effect/confidence inputs remain required. For
`functional_pilot`, omit them as described in the task procedure.

## Later bounded functional observations

Later separately approved root workspace-write functional pilots exercised the
assigned CLI, sticky assignment, saved work products and actual 15-minute follow-up.
These are additional operational observations, not replacements for the immutable
admission evidence above or new completeness qualifications.

| Observation | Sanitized result |
| --- | --- |
| First pilot | Six own usage and six runtime records; replay added zero. The human task succeeded, but configuration scope failed because native startup created persistent trust configuration. Later authorized restoration did not turn that gate into a pass. |
| Subsequent pilot | One root launch completed in 155.669 seconds; eight own usage and eight runtime records. Replay added zero. Explicit per-invocation untrusted project handling passed the monitored configuration checks, with no persistent trust created in that observed scope. |

Both retained the original assignment across replay and used actual elapsed follow-up,
without clock substitution or backfill. Later human assessment in the subsequent
pilot remained outside its unchanged follow-up deadline; success finalization did
not repair the report's deadline status. This distinction motivates `late_outcome`.
The observations do not attest every native/managed setting, model combination,
external-session linkage, child continuation, terminal export or full request universe.
Whole-task cost and inference remain unavailable. No private paths, original DBs,
work-product contents or personal identifiers are published here.

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
run supports only the bounded [direct-child profile](../runbooks/task-native-workflow.md#single-direct-child-launch-and-durable-collection). The manual entry
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
