# Ordinary-session family bindings

Status: implemented synthetic integration; production qualification pending.

## Product boundary

An explicitly selected registered project and prepared A/B task authorize reads.
One parent `harness-connect` call sends a native metadata receipt to the local
server. The provider resolves current identity and exact private source; cwd alone
never selects a task. The coordinator binds the parent, begins observation and
follows independently verified child relations recursively. Repeated calls confirm
the existing binding. New parents retain the persisted arm, price pin and original
open observation window.

The shared [SessionBindingProvider](../../src/session-binding-contract.ts) resolves
receipts, returns identity metadata, discovers direct relations and reads own-request
tokens/runtime with cursors and gaps. Optional native session/process/agent mapping
supports provider-specific topology. No prompt, response, code, secret or transcript
text crosses that interface. Exact source paths and receipts remain private local
state and are absent from UI DTOs and exported measurement records.

`POST /api/tasks/:id/session-connect` accepts product and receipt using existing
loopback, Origin, CSRF, If-Match and idempotency guards. Task reads expose sanitized
state, session IDs, root/child/request counts, blockers and partial usage. The UI
polls the same state. The skill re-reads it before success. It never opens transcripts,
guesses UUIDs or requires a separate invocation in each child.

## Observation and lifecycle

Preparation, admission and task generation checks precede provider reads. Source
mapping and ancestry checks precede source-body parsing. Async results are fenced
again before writes. Pause/deletion/human finalization stop collection. Server
restart pauses persisted bindings before source access. Reconnect baselines all
surviving sources without backfilling unobserved intervals. Adding a root preserves
existing live root cursors. Newly discovered children created inside observation
retain their first own request; older children are baselined without historical usage.

Native request IDs are globally deduplicated per product across sources, versions
and tasks. Conflicting replay stops collection. Providers exclude inherited parent
history using native ownership evidence. Existing billing/cache/reasoning semantics
remain unchanged. Missing runtime, incomplete requests, unsupported history and
limits remain explicit gaps. Partial usage never becomes a complete total. Human
completion and statistical adoption gates remain; full cost and inference are out
of scope.

## Native instrumentation and support

The [official Codex hooks](https://learn.chatgpt.com/docs/hooks) expose startup
identity/source and subagent shared root identity plus child agent ID. Transcript shape is
unstable. Documented hook fields therefore do not establish production admission;
both private receipts and matching native source metadata are required. Pinned native start hooks supply the child
thread's own rollout path after a materialization attempt; recorder/file checks
establish availability. Their session_id is the shared root, so
the provider verifies the exact child header's own ID, root ID, direct parent and
depth before following its usage. No source-directory scan, guessed path or
thread/read preview is used. See [pinned acquisition evidence](../validation/codex-ordinary-hook-source-acquisition.md). Synthetic
siblings and clean-history descendants are supported, with defaults of depth 8,
32 family members, 1,024 receipts, 8 MiB source size, 64 native turns and a 64 KiB
metadata header. Paginated inherited descendant history yields an unsupported gap.
A different project cwd is conservatively rejected.

`proposeCodexSessionBindingHooks` returns a reviewable project-only configuration
and writes nothing. The recorder persists allowlisted metadata in owner-private
POSIX files and injects the receipt into developer context. This local mechanism
is not remote authentication. It depends on reviewed exact hook trust and source
scope. Installing a skill alone cannot prove startup instructions were loaded.

Default providers remain blocked by code-owned admission. Only explicit provider
injection in an isolated synthetic-validation protocol exercises the coordinator.
Optional profile `session_binding` specifies Codex receipt directory, approved
source roots and project root, or Claude receipt and projects directories. Providers
are scoped per task to its exact registered project root; it grants neither trust nor native admission.
Existing production ticket/tool-owned profiles stay separate. Claude's implemented
candidate profile uses nativeMapping for root UUID and member agent ID. Official
[Claude hooks](https://code.claude.com/docs/en/hooks) and
[skills](https://code.claude.com/docs/en/skills) document invocation-scoped hooks,
metadata and process environment. PreToolUse records a connect receipt and the
same Bash helper locates it using process ancestry; explicit task selection remains
mandatory. Hook commands use project-only installation paths, not undocumented
skill-directory substitution. No installation, trust, permission allowlist or global
settings change occurs here.

Claude verifies hook-evidenced root-family members before own-source parsing.
Nested members are flattened under the root because direct nested-parent evidence
is unavailable; this is family membership, not a claimed direct-parent topology.
Members without ownership evidence and late old members produce gaps. Claude
baselines retain up to 1,024 distinct excluded own request IDs separately from the
rolling observed replay window; overflow, unreadable or partial baseline fails
closed with a fixed blocker. Missing baseline counters still retain an owned ID.
Changed counters on an already observed request stop collection as a conflict. Child
re-calls confirm independently discovered active members; paused families require
parent reconnect. Candidate formats/counters and actual hook loading remain
qualification-pending. Same-user metadata files are a local trust boundary and
cannot prevent deliberate same-user forgery; they are not remote authentication.

Migration021 queues minimal Claude native IDs and project scope before deletion
cascades. Bootstrap/connect/tick retry metadata-only forgetSession before source
access. Deleted families suppress future receipts; native transcripts are never
removed. Failed cleanup stays queued with a fixed reason. Paused collectors do
not read transcripts although session metadata hooks can continue running.

## Qualification and evidence

Review the concrete project hook proposal, existing hook merge, exact native/source
profile, local metadata/source roots and a bounded start boundary first. Applying
hooks/trust and any actual model call require separate authorization. Use a disposable
project and fixture database, never original user conversation history/database.
Test a normal new parent, at least two siblings and a supported descendant, repeated
connection, pause/reconnect and a new parent. Verify native relation/source fields,
request ownership and sanitized artifacts. Record exact native conformance before
lifting the production gate. Installation does not enforce model/effort; the skill
has no version-install requirement.

| Acceptance | Isolated local evidence |
| --- | --- |
| Explicit task/native proof, root/relation conflicts | Service and Codex provider tests |
| Multiple siblings, supported descendant, first child response | Service/provider/API tests |
| Global replay/conflict; inherited history exclusion | Service/provider tests |
| Pause/restart/new root, no backfill, arm/price pin, deletion fence | Service/API tests |
| HTTP connection starts collector, task reads reflect usage | Real local server/domain/store/parser with synthetic hook/source fixtures |
| Portable receipt re-read and legacy compatibility | Harness-connect package tests |

See `tests/session-binding-service.test.ts`, `tests/session-binding-codex.test.ts`,
`tests/session-binding-api.test.ts`, `tests/session-binding-claude.test.ts`,
`tests/session-binding-claude-api.test.ts` and `skills/harness-connect/tests/*.mjs`.
Local results are separate from remote CI and actual native source qualification.
