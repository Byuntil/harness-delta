# Codex ordinary-session child source acquisition

Status: implemented with pinned native source/schema evidence and isolated synthetic
regressions. Native hook loading/source/counter conformance and production admission
remain unqualified. This is a required ordinary-session family path, not an optional
future feature. No native model/CLI, user history/DB, hook installation, trust or
permission widening was performed.

## Exact native path

The existing Codex0.160.0 source profile pins upstream commit
`a956835d020762cb2b570053af06f643a11c0ecc`. The
[hook runtime](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/hook_runtime.rs#L128)
dispatches SubagentStart for spawned Startup/Fork threads and calls that child's
`hook_transcript_path`. The
[path getter](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/session/mod.rs#L5071)
uses its live thread's local rollout path and attempts materialization before
returning it; persistence failure is logged rather than guaranteed by this getter.
The recorder checks that the exact supplied file exists, and the provider validates
its identity and first metadata envelope. This is an exact native-supplied path, not a constructed UUID path.
Unavailable/ephemeral paths or failed materialization remain unsupported.

The
[identity getters](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/session/session.rs#L646)
distinguish concrete thread ID from shared root session ID. SubagentStart's agent_id
uses the concrete child ID. The
[generated input schema](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/hooks/schema/generated/subagent-start.command.input.schema.json)
has session_id, agent_id, turn_id and nullable transcript_path but no immediate
parent ID. The
[rollout metadata contract](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/protocol/src/protocol.rs#L3123)
separates own id, shared session_id and parent_thread_id. Start and Stop paths differ:
Stop explicitly fetches the parent transcript and supplies a separate agent path;
that Stop behavior must not be assumed for Start.

[Official hooks documentation](https://learn.chatgpt.com/docs/hooks) describes
common fields and unstable transcript format. Documentation alone does not qualify
any installed binary's exact source/counter semantics.

## Minimal integration

The existing project-only SessionStart/SubagentStart recorder records allowlisted
metadata and stats only the exact hook-supplied path inside reviewed source roots.
It stores nativeRootSessionId for a child and leaves direct parent unresolved. It
reads no transcript and never installs itself. No new hook event is required.

After task authorization and a linked family root, the provider validates root
receipts, exact approved child source identity and project scope, then reads only
the first bounded session_meta envelope. Own ID and root ID must match the native
hook; parent_thread_id and source.thread_spawn parent must agree. Every direct
ancestor needs its own exact native receipt/source and verified depth. Only then
may the existing collector read own usage. This supports multiple siblings and
verified clean-history descendants without a child invoking harness-connect.

A hook that supplies a parent's transcript cannot authenticate a child. A nearby
correct file is not searched as a fallback. Missing, ambiguous, foreign, partial,
replaced or unsupported metadata produces a fixed blocker/gap. Unsupported or
unknown inherited history and paginated deeper descendants remain gaps; there is no unbounded ancestry or whole-cost claim. Existing
code-owned native admission, observed request deduplication, pause/restart baselines,
arm/price pin and human completion are unchanged.

A native app-server Thread object also exposes an unstable path, but using
thread/read would add transport/process/database scope and returns preview text even
without turns. That route is unnecessary here and was not implemented or invoked.
No user history directory or native database was scanned during this work.

## Verification and minimal native qualification input

Synthetic hook fixtures use the native shared root ID at every depth. Existing
multiple-sibling/grandchild own-usage regressions failed before parent normalization
and pass with the fix. A negative fixture supplies the parent's path while a valid
child file exists nearby; it is rejected without guessing/searching. Provider/source
scope, malformed metadata, replay and source continuity regressions remain required.
Final local commands/results and exact independent review belong in the handoff;
remote CI and actual native qualification are separate.

To verify the installed execution boundary, obtain separate approval for one
bounded disposable project/database/window and the already reviewable exact project
hook proposal, receipt directory and source roots. Preserve normal model/effort and
existing auth. Capture only the hook's allowlisted session_id/agent_id/turn_id/path
metadata, file identity and first envelope's own/root/parent/depth/version/cwd in
private local records. Show that multiple sibling and supported nested hooks really
run and provide materialized own paths; then compare only owned request IDs and
sanitized usage. A null path, absent start hook, unsupported internal/system agent,
source format mismatch or failed persistence is the exact unsupported boundary,
not permission to scan history or manufacture a mapping. Promotion of any native
admission gate requires exact source/counter conformance, not this static proof.
