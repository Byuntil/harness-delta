# Claude Code 2.1.288 parent-only workflow source admission

The code-owned source registry admits `claude_code / 2.1.288 /
claude-workflow-own-trace-v1` with evidence ID `claude-workflow-02188-root-native-v1`,
`validation_kind: real_operations` and `complete_cost: false`. This enables local
partial per-request usage collection for fresh parent (root) launches through
`workflow claude launch`. It does not admit child execution, native resume, other
Claude Code versions, complete task cost or inferential adoption.
Requirements: [R01, R02, R04, R05 and R07](../requirements.md).

## Admitted scope

| Area | Admitted | Not admitted |
| --- | --- | --- |
| Version | Exact 2.1.288 binary, SHA-256 `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750` | 2.1.289, 2.1.290 and later |
| Session | Fresh print-mode root per launch; further launches on the same task keep the assignment | Native resume, external session link, discovery |
| Children | None | `child_runtime` fails before assignment with `claude_workflow_child_unadmitted` |
| Tools | `read-only` (Read, Glob, Grep) or `workspace-edit` (adds Edit, Write), `dontAsk` permission mode | Bash, MCP servers, slash commands, user settings |
| Limits | `timeout_ms` ≤ 1 h; `max_turns`, `request_limit` ≤ 1024; optional CLI budget estimate (natively exercised only up to 300 s, 12 turns, 24 requests; larger runs are offline evidence below) | Provider or subscription spending cap |
| Harness files | With `workspace-edit`, workspace, mediator directory, prompt, binary, Node and database must be outside the project root | Harness files the model could edit |
| Usage | Successful request traces; cache read and cache creation stay separate | Reasoning output (missing, never 0), complete request universe |

Runtime model and effort remain user choices. The verification used one model and
two effort values; it does not make them product requirements, and it does not
establish availability of other models or providers.

## Native evidence

One separately approved run on 2026-10-06 used the ordinary CLI path (macOS arm64,
Node 24.21.0) with the existing login and a disposable synthetic project. The
executed code was this change's build plus this registry entry and a metadata-only
log audit (event name, request ID, sequence) in a scratch copy. Two invocations, no retry:

| Boundary | Observed result |
| --- | --- |
| Assignment | Both launches used the same task and original variant; generation 1, paused, then 3 |
| Runtime choice | `claude-sonnet-5-5` / `high`, then `claude-sonnet-5-5` / `medium`, recorded per request |
| Harness application | Selected instruction file applied per invocation (`invocation_settings_verified`) |
| `workspace-edit` | First run created the requested file; second run appended one line; the existing file was byte-identical afterwards |
| Usage | 3 + 3 request records, 6 distinct native request IDs; ordinary input, cache read, cache write and output observed separately; reasoning output missing |
| Terminal delivery | Every native `api_request` log request ID had a stored usage record after normal exit (6 of 6) |
| Gaps | Each trace batch recorded `not_available` (no trace sequence or terminal watermark) |
| Human outcome and report | `success` before the follow-up deadline; report `deadline_status: success`, `usage_complete: false`, `complete_amount: null` |
| User configuration | No entry for the disposable project path appeared in the user's Claude configuration |

The metadata-only evidence record has SHA-256
`4cc9688995d6f2a95b9220db9b694ecff0d33a52e9f8672426212bee9daa57ad`, used as the
registry's `semantics_digest`. The executed source diff against base commit
`f2fcf815079544f6ad8ac2e63ad99de7f088c94d` has SHA-256
`8801b3cf4a81786b29f4bc94eb9f2933d92d1a727d9fbe78a513f53a5df93085`. Prompts,
responses, paths, session and request identifiers and credentials are omitted.

The earlier separately approved synchronous probe (two root and one child request)
remains the only native child evidence; see the
[probe contract](claude-native-probe-preparation.md#verified-bounded-native-probe-and-current-support-contract).

## Offline real-binary evidence

The pinned binary was also run through the same CLI against a localhost stub
Messages API with an isolated configuration directory and a synthetic key (no
Anthropic traffic). These results are offline evidence, not native qualification.

| Scenario | Result |
| --- | --- |
| Stop during an in-flight request | `stopped` / `stop_requested`; earlier usage kept; `incomplete` gap |
| Timeout during a request | `stopped` / `claude_probe_deadline`; earlier usage kept; `incomplete` gap |
| Task pause during a run (before the gap fix below) | Run stuck `running`; CLI `workflow_adapter_failed` |
| Task pause during a run (after the fixes) | Run ends `stopped`; CLI reports `workflow_scope_revoked`; `incomplete` gap recorded at the pause (synthetic test) |
| Collector killed, then `recover` | `failed` / `abandoned` plus `incomplete` gap; the native process outlived the collector |
| Request ID repeated across runs | Conflict stops the run; no duplicate usage |
| 61 requests over time; 46 requests in one export burst; one request held for 130 s | All completed with every request recorded |
| Write and Edit outside the project root (parent directory, `/tmp`) | Denied; inside the root they succeed |
| Budget stop from the CLI estimate | Run fails; the final request can be lost and is marked by an `incomplete` gap |
| Asynchronous direct child in workflow mode | Child linked to its parent, but only a tool-less synthetic child exists; not admitted |

## Defects fixed in this admission

- Pausing the task while a Claude run was in flight left the run `running` and the
  CLI reported `workflow_adapter_failed`: the final gap write failed on the inactive
  task and rolled back the run's terminal update. The adapter now ends the run as
  Codex does, and the CLI reports `workflow_scope_revoked`.
- Pause or finish during any running Codex or Claude workflow run now records the
  in-flight `incomplete` gap in the lifecycle transaction, while the task is still
  active; previously no adapter could record it afterwards.
- Independent review found that `workspace-edit` could edit a hook mediator located
  inside the project root and so execute model-written code; preflight now rejects
  that layout. It also found that reusing one `workspace` made a second launch fail;
  each run now uses its own subdirectory. Both were fixed after the native run and
  verified with offline tests; they tighten preconditions and do not change the
  observed usage path.

## Remaining limits

Complete cost stays unavailable: there is no trace sequence or terminal watermark,
so an in-flight request at stop, timeout, kill, budget stop or pause can be missing.
Those cases are marked by an `incomplete` gap; a collector killed without `recover`
leaves the run `running` until recovery. Partial estimates need an explicit price table and are
not bills. A killed collector cannot signal the native process; end it manually.
Native stdout is discarded. Claude Code may update its own state files during a run,
as any invocation does.
