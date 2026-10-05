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

The qualification was an isolated legacy task, not a live randomized allocation.
Production CLI allocation, selected-artifact confirmation, explicit root link,
future-only collection, durable stop, replay, human finish and descriptive report
are checked offline with synthetic files and isolated stores. Production
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
classification, quality margin, minimum effect, sample/planning basis, missingness,
stopping and analysis/sensitivity identifiers); logical task metadata and criterion
IDs; current runtime; and native execution paths/prompt/sandbox/deadline. Missing
or contradictory inputs fail before collection. Test protocols, synthetic prices
and the qualification's random harnesses are never substituted for these choices.
